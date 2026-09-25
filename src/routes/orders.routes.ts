import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { getEffectivePrice } from '../utils/pricing'
import { notifyUser, maybeNotifyLowStock } from '../lib/notify'

const router = Router()
router.use(requireAuth)

const orderInclude = {
  orderItems: { include: { product: { select: { id: true, name: true, imageUrl: true, unit: true } } } },
  buyer: { select: { id: true, fullName: true } },
  vendor: { select: { id: true, fullName: true, shopName: true } },
  delivery: true,
} as const

// POST /orders — checkout: groups the buyer's cart by vendor into separate orders.
router.post('/', async (req, res) => {
  const { deliveryAddress, deliveryPhone, deliveryNotes, paymentMethod } = req.body as {
    deliveryAddress: string; deliveryPhone: string; deliveryNotes?: string; paymentMethod: 'cod' | 'online'
  }

  const buyer = await prisma.user.findUnique({ where: { id: req.user!.id } })
  const cartItems = await prisma.cartItem.findMany({
    where: { buyerId: req.user!.id },
    include: { product: true },
  })
  if (cartItems.length === 0) return res.status(400).json({ error: 'কার্ট খালি' })

  // Stock check before creating orders
  for (const item of cartItems) {
    if (item.product.stockQty < item.quantity) {
      return res.status(400).json({
        error: `${item.product.name}-এ পর্যাপ্ত স্টক নেই (আছে: ${item.product.stockQty} ${item.product.unit})`,
      })
    }
  }

  const byVendor = new Map<string, typeof cartItems>()
  for (const item of cartItems) {
    const list = byVendor.get(item.product.vendorId) || []
    list.push(item)
    byVendor.set(item.product.vendorId, list)
  }

  // Enforce wholesale minimum quantities before creating any orders.
  if (buyer?.role === 'wholesale') {
    for (const item of cartItems) {
      if (item.product.wholesaleMinQty && item.product.wholesalePrice != null && item.quantity < item.product.wholesaleMinQty) {
        return res.status(400).json({
          error: `${item.product.name}-এর জন্য সর্বনিম্ন ${item.product.wholesaleMinQty} ${item.product.unit} অর্ডার করতে হবে`,
        })
      }
    }
  }

  const io = req.app.get('io')
  const createdOrders = []

  for (const [vendorId, items] of byVendor) {
    const total = items.reduce((sum, i) => sum + getEffectivePrice(i.product, buyer?.role) * i.quantity, 0)

    const order = await prisma.order.create({
      data: {
        buyerId: req.user!.id,
        vendorId,
        totalAmount: total,
        deliveryAddress, deliveryPhone, deliveryNotes,
        paymentMethod,
        orderItems: {
          create: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            priceAtPurchase: getEffectivePrice(i.product, buyer?.role),
          })),
        },
        delivery: { create: { estimatedDelivery: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
      },
      include: orderInclude,
    })
    createdOrders.push(order)

    // Decrement stock
    for (const item of items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { stockQty: { decrement: item.quantity } },
      })
      await maybeNotifyLowStock(item.productId, io)
    }

    await notifyUser(
      vendorId,
      'নতুন অর্ডার এসেছে',
      `আপনি একটি নতুন অর্ডার পেয়েছেন। মোট: ৳${total}`,
      'order_placed',
      order.id,
      io,
    )
    await notifyUser(
      req.user!.id,
      'অর্ডার সফল হয়েছে',
      `আপনার অর্ডার সফলভাবে দেওয়া হয়েছে। মোট: ৳${total}`,
      'order_placed',
      order.id,
      io,
    )
  }

  await prisma.cartItem.deleteMany({ where: { buyerId: req.user!.id } })
  res.status(201).json({ orders: createdOrders })
})

// GET /orders/mine — buyer's own orders
router.get('/mine', async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { buyerId: req.user!.id },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
  })
  res.json({ orders })
})

// GET /orders/vendor — vendor's incoming orders
router.get('/vendor', requireRole('vendor'), async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { vendorId: req.user!.id },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
  })
  res.json({ orders })
})

// GET /orders/all — admin: every order
router.get('/all', requireRole('admin'), async (_req, res) => {
  const orders = await prisma.order.findMany({ include: orderInclude, orderBy: { createdAt: 'desc' } })
  res.json({ orders })
})

// PATCH /orders/:id/status — vendor (own orders) or admin
router.patch('/:id/status', requireRole('vendor', 'admin'), async (req, res) => {
  const { status } = req.body as { status: string }
  const order = await prisma.order.findUnique({ where: { id: req.params.id } })
  if (!order) return res.status(404).json({ error: 'অর্ডার পাওয়া যায়নি' })
  if (req.user!.role !== 'admin' && order.vendorId !== req.user!.id) {
    return res.status(403).json({ error: 'এই অর্ডার পরিবর্তনের অনুমতি নেই' })
  }

  const updated = await prisma.order.update({ where: { id: req.params.id }, data: { status: status as any }, include: orderInclude })

  const statusLabels: Record<string, string> = {
    confirmed: 'আপনার অর্ডার নিশ্চিত করা হয়েছে',
    shipped: 'আপনার অর্ডার পাঠানো হয়েছে',
    delivered: 'আপনার অর্ডার ডেলিভারি হয়েছে',
    cancelled: 'আপনার অর্ডারটি বাতিল করা হয়েছে',
  }
  if (statusLabels[status]) {
    const io = req.app.get('io')
    await notifyUser(
      order.buyerId,
      statusLabels[status],
      `অর্ডার #${order.id.slice(0, 8)} — বর্তমান অবস্থা আপডেট হয়েছে`,
      'order_status',
      order.id,
      io,
    )
  }

  res.json({ order: updated })
})

export default router
