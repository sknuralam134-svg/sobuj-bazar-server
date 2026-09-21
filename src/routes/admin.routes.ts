import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requireRole } from '../middleware/auth'

const router = Router()
router.use(requireAuth, requireRole('admin'))

router.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, email: true, fullName: true, phone: true, role: true,
      shopName: true, createdAt: true,
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

export default router
