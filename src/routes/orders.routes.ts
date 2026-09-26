import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { getEffectivePrice } from '../utils/pricing'
import { notifyUser, maybeNotifyLowStock } from '../lib/notify'
import { msg } from '../lib/i18n'

const router = Router()
router.use(requireAuth)

const orderInclude = {
  orderItems: { include: { product: { select: { id: true, name: true, imageUrl: true, unit: true } } } },
  buyer: { select: { id: true, fullName: true } },
  vendor: { select: { id: true, fullName: true, shopName: true } },
  delivery: true,
} as const

// POST /orders — checkout: groups the buyer's cart by vendor into separate orders.
router.post('/', async (req, res, next) => {
  try {
    const {
      deliveryAddress,
      deliveryPhone,
      deliveryNotes,
      paymentMethod,
      deliveryLatitude,
      deliveryLongitude,
    } = req.body as {
      deliveryAddress: string
      deliveryPhone: string
      deliveryNotes?: string
      paymentMethod: 'cod' | 'online'
      deliveryLatitude?: number | null
      deliveryLongitude?: number | null
    }

    if (!deliveryAddress?.trim() || !deliveryPhone?.trim()) {
      return res.status(400).json({ error: msg(req, 'orders.needAddressPhone') })
    }

    const lat =
      deliveryLatitude != null && deliveryLatitude !== ('' as any)
        ? Number(deliveryLatitude)
        : null
    const lng =
      deliveryLongitude != null && deliveryLongitude !== ('' as any)
        ? Number(deliveryLongitude)
        : null

    const buyer = await prisma.user.findUnique({ where: { id: req.user!.id } })
    const cartItems = await prisma.cartItem.findMany({
      where: { buyerId: req.user!.id },
      include: { product: true },
    })
    if (cartItems.length === 0) return res.status(400).json({ error: msg(req, 'orders.cartEmpty') })

    for (const item of cartItems) {
      if (item.product.stockQty < item.quantity) {
        return res.status(400).json({
          error: msg(req, 'orders.insufficientStock', {
            name: item.product.name,
            qty: item.product.stockQty,
            unit: item.product.unit,
          }),
        })
      }
    }

    if (buyer?.role === 'wholesale') {
      for (const item of cartItems) {
        if (
          item.product.wholesaleMinQty &&
          item.product.wholesalePrice != null &&
          item.quantity < item.product.wholesaleMinQty
        ) {
          return res.status(400).json({
            error: msg(req, 'orders.wholesaleMinQty', {
              name: item.product.name,
              min: item.product.wholesaleMinQty,
              unit: item.product.unit,
            }),
          })
        }
      }
    }

    const byVendor = new Map<string, typeof cartItems>()
    for (const item of cartItems) {
      const list = byVendor.get(item.product.vendorId) || []
      list.push(item)
      byVendor.set(item.product.vendorId, list)
    }

    const io = req.app.get('io')
    const productIdsForLowStock: string[] = []

    // All order creates + stock updates + cart clear in one transaction
    const createdOrders = await prisma.$transaction(async (tx) => {
      const orders = []

      for (const [vendorId, items] of byVendor) {
        const total = items.reduce(
          (sum, i) => sum + getEffectivePrice(i.product, buyer?.role) * i.quantity,
          0,
        )

        const order = await tx.order.create({
          data: {
            buyerId: req.user!.id,
            vendorId,
            totalAmount: total,
            deliveryAddress: deliveryAddress.trim(),
            deliveryPhone: deliveryPhone.trim(),
            deliveryNotes: deliveryNotes?.trim() || null,
            paymentMethod,
            deliveryLatitude: lat != null && !Number.isNaN(lat) ? lat : null,
            deliveryLongitude: lng != null && !Number.isNaN(lng) ? lng : null,
            orderItems: {
              create: items.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                priceAtPurchase: getEffectivePrice(i.product, buyer?.role),
              })),
            },
            delivery: {
              create: { estimatedDelivery: new Date(Date.now() + 24 * 60 * 60 * 1000) },
            },
          },
          include: orderInclude,
        })
        orders.push(order)

        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQty: { decrement: item.quantity } },
          })
          productIdsForLowStock.push(item.productId)
        }
      }

      await tx.cartItem.deleteMany({ where: { buyerId: req.user!.id } })
      return orders
    })

    // Notifications + low-stock checks outside the transaction
    for (const order of createdOrders) {
      await notifyUser(
        order.vendorId,
        {
          bn: { title: 'নতুন অর্ডার এসেছে', message: `আপনি একতি নতুন অর্ডার পেয়েছেন। মোট: ৳${order.totalAmount}` },
          en: { title: 'New order received', message: `You have received a new order. Total: ₹${order.totalAmount}` },
        },
        'order_placed',
        order.id,
        io,
      )
      await notifyUser(
        req.user!.id,
        {
          bn: { title: 'অর্ডার সফল হয়েছে', message: `আপনার অর্ডার সফলভাবে দেওয়া হয়েছে। মোট: ৳${order.totalAmount}` },
          en: { title: 'Order placed successfully', message: `Your order has been placed successfully. Total: ₹${order.totalAmount}` },
        },
        'order_placed',
        order.id,
        io,
      )
    }
    for (const pid of [...new Set(productIdsForLowStock)]) {
      await maybeNotifyLowStock(pid, io)
    }

    res.status(201).json({ orders: createdOrders })
  } catch (err) {
    next(err)
  }
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
  if (!order) return res.status(404).json({ error: msg(req, 'orders.notFound') })
  if (req.user!.role !== 'admin' && order.vendorId !== req.user!.id) {
    return res.status(403).json({ error: msg(req, 'orders.notAllowed') })
  }

  const updated = await prisma.order.update({
    where: { id: req.params.id },
    data: { status: status as any },
    include: orderInclude,
  })

  const statusContent: Record<string, { bn: string; en: string }> = {
    confirmed: { bn: 'আপনার অর্ডার নিশ্চিত করা হয়েছে', en: 'Your order has been confirmed' },
    shipped: { bn: 'আপনার অর্ডার পাঠানো হয়েছে', en: 'Your order has been shipped' },
    delivered: { bn: 'আপনার অর্ডার ডেলিভারি হয়েছে', en: 'Your order has been delivered' },
    cancelled: { bn: 'আপনার অর্ডারটি বাতিল করা হয়েছে', en: 'Your order has been cancelled' },
  }
  if (statusContent[status]) {
    const io = req.app.get('io')
    await notifyUser(
      order.buyerId,
      {
        bn: { title: statusContent[status].bn, message: `অর্ডার #${order.id.slice(0, 8)} — বর্তমান অবস্থা আপডেট হয়েছে` },
        en: { title: statusContent[status].en, message: `Order #${order.id.slice(0, 8)} — status has been updated` },
      },
      'order_status',
      order.id,
      io,
    )
  }

  res.json({ order: updated })
})

export default router
