import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth'
import { isWithinDeliveryRange } from '../utils/distance'

const router = Router()

const vendorSelect = {
  id: true, fullName: true, shopName: true, latitude: true, longitude: true, deliveryRadiusKm: true,
} as const

// GET /products — public list. Pass ?lat=&lng= to filter by buyer location.
router.get('/', optionalAuth, async (req, res) => {
  const { lat, lng, categoryId, search } = req.query as Record<string, string | undefined>

  const products = await prisma.product.findMany({
    where: {
      isAvailable: true,
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    },
    include: { category: true, vendor: { select: vendorSelect } },
    orderBy: { createdAt: 'desc' },
  })

  const buyerLocation = lat && lng ? { latitude: Number(lat), longitude: Number(lng) } : null
  const filtered = products.filter((p) => isWithinDeliveryRange(p.vendor, buyerLocation))

  res.json({ products: filtered, totalBeforeFilter: products.length })
})

router.get('/:id', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { category: true, vendor: { select: vendorSelect } },
  })
  if (!product) return res.status(404).json({ error: 'প্রোডাক্ট পাওয়া যায়নি' })
  res.json({ product })
})

// GET /products/vendor/mine — the signed-in vendor's own products
router.get('/vendor/mine', requireAuth, requireRole('vendor'), async (req, res) => {
  const products = await prisma.product.findMany({
    where: { vendorId: req.user!.id },
    include: { category: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ products })
})

router.post('/', requireAuth, requireRole('vendor'), async (req, res) => {
  const { name, categoryId, price, unit, stockQty, description, imageUrl, isAvailable, wholesalePrice, wholesaleMinQty } = req.body
  const slug = String(name).trim().toLowerCase().replace(/\s+/g, '-')

  const product = await prisma.product.create({
    data: {
      vendorId: req.user!.id,
      name, slug, categoryId: categoryId || null,
      price, unit, stockQty: Number(stockQty) || 0,
      description, imageUrl, isAvailable: isAvailable ?? true,
      wholesalePrice: wholesalePrice || null,
      wholesaleMinQty: wholesaleMinQty || null,
    },
  })
  res.status(201).json({ product })
})

router.put('/:id', requireAuth, requireRole('vendor', 'admin'), async (req, res) => {
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'প্রোডাক্ট পাওয়া যায়নি' })
  if (req.user!.role !== 'admin' && existing.vendorId !== req.user!.id) {
    return res.status(403).json({ error: 'এই প্রোডাক্ট সম্পাদনার অনুমতি নেই' })
  }

  const { name, categoryId, price, unit, stockQty, description, imageUrl, isAvailable, wholesalePrice, wholesaleMinQty } = req.body
  const slug = name ? String(name).trim().toLowerCase().replace(/\s+/g, '-') : existing.slug

  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: {
      name, slug, categoryId: categoryId || null,
      price, unit, stockQty: stockQty != null ? Number(stockQty) : undefined,
      description, imageUrl, isAvailable,
      wholesalePrice: wholesalePrice ?? null,
      wholesaleMinQty: wholesaleMinQty ?? null,
    },
  })
  res.json({ product })
})

router.delete('/:id', requireAuth, requireRole('vendor', 'admin'), async (req, res) => {
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'প্রোডাক্ট পাওয়া যায়নি' })
  if (req.user!.role !== 'admin' && existing.vendorId !== req.user!.id) {
    return res.status(403).json({ error: 'এই প্রোডাক্ট মোছার অনুমতি নেই' })
  }
  await prisma.product.delete({ where: { id: req.params.id } })
  res.status(204).end()
})

export default router
