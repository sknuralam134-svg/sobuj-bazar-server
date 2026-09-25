import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { notifyUser } from '../lib/notify'

const router = Router()
router.use(requireAuth, requireRole('admin'))

router.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      address: true,
      city: true,
      area: true,
      role: true,
      shopName: true,
      shopDescription: true,
      latitude: true,
      longitude: true,
      deliveryRadiusKm: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  res.json({ users })
})

router.patch('/users/:id/role', async (req, res) => {
  const { role, shopName } = req.body as { role: string; shopName?: string }

  if (role === 'vendor' && !shopName?.trim()) {
    return res.status(400).json({ error: 'বিক্রেতা করতে হলে দোকানের নাম দিতে হবে' })
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { role: role as any, ...(role === 'vendor' ? { shopName: shopName!.trim() } : {}) },
  })
  res.json({ user })
})

router.get('/stats', async (_req, res) => {
  const [totalUsers, totalVendors, totalWholesale, totalProducts, orders] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'vendor' } }),
    prisma.user.count({ where: { role: 'wholesale' } }),
    prisma.product.count(),
    prisma.order.findMany({ select: { status: true, totalAmount: true } }),
  ])

  const pendingOrders = orders.filter((o) => o.status === 'pending').length
  const deliveredOrders = orders.filter((o) => o.status === 'delivered').length
  const revenue = orders.filter((o) => o.status === 'delivered').reduce((sum, o) => sum + Number(o.totalAmount), 0)

  res.json({
    totalUsers, totalVendors, totalWholesale, totalProducts,
    totalOrders: orders.length, pendingOrders, deliveredOrders, revenue,
  })
})

/**
 * Broadcast a notification to users.
 * body: { title, message, target: 'all' | 'vendors' | 'buyers' | userId }
 */
router.post('/notify', async (req, res) => {
  const { title, message, target } = req.body as {
    title?: string
    message?: string
    target?: string
  }

  if (!title?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'title এবং message দিতে হবে' })
  }

  let users: { id: string }[] = []
  if (target === 'vendors') {
    users = await prisma.user.findMany({ where: { role: 'vendor' }, select: { id: true } })
  } else if (target === 'buyers') {
    users = await prisma.user.findMany({
      where: { role: { in: ['buyer', 'wholesale'] } },
      select: { id: true },
    })
  } else if (target && target !== 'all') {
    users = [{ id: target }]
  } else {
    users = await prisma.user.findMany({ select: { id: true } })
  }

  const io = req.app.get('io')
  await Promise.all(
    users.map((u) => notifyUser(u.id, title.trim(), message.trim(), 'info', undefined, io)),
  )

  res.status(201).json({ sent: users.length })
})

export default router
