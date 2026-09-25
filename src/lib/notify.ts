import type { Server } from 'socket.io'
import { prisma } from './prisma'
import { getMessaging } from './firebaseAdmin'

export type NotifyType = 'order_placed' | 'order_status' | 'product_added' | 'low_stock' | 'info'

const LOW_STOCK_THRESHOLD = 5

/**
 * Create an in-app notification, emit Socket.io, and send FCM browser push.
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
    })
  }

  // Fire-and-forget FCM push (don't block the request on push failures)
  sendFcmToUser(userId, title, message, type, orderId).catch((err) => {
    console.error('[FCM] push failed for user', userId, err?.message || err)
  })

  return notification
}

async function sendFcmToUser(
  userId: string,
  title: string,
  message: string,
  type: string,
  orderId?: string,
) {
  const tokens = await prisma.fcmToken.findMany({ where: { userId } })
  if (tokens.length === 0) return

  let messaging
  try {
    messaging = getMessaging()
  } catch {
    // Firebase Admin not configured — skip push silently
    return
  }

  const tokenStrings = tokens.map((t) => t.token)
  const response = await messaging.sendEachForMulticast({
    tokens: tokenStrings,
    notification: { title, body: message },
    data: {
      type,
      ...(orderId ? { orderId } : {}),
      click_action: '/',
    },
    webpush: {
      fcmOptions: { link: orderId ? '/orders' : '/' },
      notification: {
        title,
        body: message,
        icon: '/logo.svg',
        badge: '/favicon.svg',
      },
    },
  })

  // Remove invalid / expired tokens
  const toDelete: string[] = []
  response.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || ''
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        code.includes('invalid-argument')
      ) {
        toDelete.push(tokenStrings[i])
      }
    }
  })
  if (toDelete.length) {
    await prisma.fcmToken.deleteMany({ where: { token: { in: toDelete } } })
  }
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

/**
 * After stock changes, if qty <= threshold notify the vendor once-ish
 * (we always send; vendor can mark read).
 */
export async function maybeNotifyLowStock(
  productId: string,
  io?: Server,
) {
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
