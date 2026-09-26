import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { msg } from '../lib/i18n'

const router = Router()
router.use(requireAuth)

const include = {
  product: { include: { category: true, vendor: { select: { id: true, fullName: true, shopName: true, latitude: true, longitude: true, deliveryRadiusKm: true } } } },
} as const

router.get('/', async (req, res) => {
  const items = await prisma.cartItem.findMany({ where: { buyerId: req.user!.id }, include })
  res.json({ items })
})

router.post('/', async (req, res) => {
  const { productId, quantity = 1 } = req.body as { productId: string; quantity?: number }

  const existing = await prisma.cartItem.findUnique({ where: { buyerId_productId: { buyerId: req.user!.id, productId } } })
  const item = existing
    ? await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + quantity }, include })
    : await prisma.cartItem.create({ data: { buyerId: req.user!.id, productId, quantity }, include })

  res.status(201).json({ item })
})

router.patch('/:id', async (req, res) => {
  const { quantity } = req.body as { quantity: number }
  const item = await prisma.cartItem.findUnique({ where: { id: req.params.id } })
  if (!item || item.buyerId !== req.user!.id) return res.status(404).json({ error: msg(req, 'cart.notFound') })

  if (quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: req.params.id } })
    return res.status(204).end()
  }
  const updated = await prisma.cartItem.update({ where: { id: req.params.id }, data: { quantity }, include })
  res.json({ item: updated })
})

router.delete('/:id', async (req, res) => {
  const item = await prisma.cartItem.findUnique({ where: { id: req.params.id } })
  if (!item || item.buyerId !== req.user!.id) return res.status(404).json({ error: msg(req, 'cart.notFound') })
  await prisma.cartItem.delete({ where: { id: req.params.id } })
  res.status(204).end()
})

router.delete('/', async (req, res) => {
  await prisma.cartItem.deleteMany({ where: { buyerId: req.user!.id } })
  res.status(204).end()
})

export default router
