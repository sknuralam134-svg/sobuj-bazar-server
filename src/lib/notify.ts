import type { Server } from 'socket.io'
import { prisma } from './prisma'

export type NotifyType = 'order_placed' | 'order_status' | 'product_added' | 'low_stock' | 'info'

const LOW_STOCK_THRESHOLD = 5

/**
 * Create an in-app notification and emit live update over Socket.io.
 * (No Firebase / FCM — realtime only while the client is connected.)
 */
export async function notifyUser(
  userId: string,
  title: string,
  message: string,
  type: NotifyType = 'info',
  orderId?: string,
  io?: Server,
) {
  const notification = await prisma.notification.create({
    data: { userId, title, message, type: type as any, orderId },
  })

  if (io) {
    io.to(`user:${userId}`).emit('notification:new', {
      id: notification.id,
      title,
      message,
      type,
      orderId: orderId || null,
    })
  }

  return notification
}

/** Notify all admins. */
export async function notifyAdmins(
  title: string,
  message: string,
  type: NotifyType = 'info',
  io?: Server,
) {
  const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } })
  await Promise.all(admins.map((a) => notifyUser(a.id, title, message, type, undefined, io)))
}

/** After stock changes, if qty <= threshold notify the vendor. */
export async function maybeNotifyLowStock(productId: string, io?: Server) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, stockQty: true, unit: true, vendorId: true },
  })
  if (!product) return
  if (product.stockQty > LOW_STOCK_THRESHOLD) return

  await notifyUser(
    product.vendorId,
    'স্টক কম আছে',
    `${product.name}-এর স্টক এখন ${product.stockQty} ${product.unit}। দয়া করে স্টক আপডেট করুন।`,
    'low_stock',
    undefined,
    io,
  )
}

export { LOW_STOCK_THRESHOLD }
