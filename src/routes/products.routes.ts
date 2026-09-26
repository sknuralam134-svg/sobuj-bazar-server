import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../lib/prisma'
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth'
import { isWithinDeliveryRange } from '../utils/distance'
import { compressToUnder200KB } from '../lib/imageCompress'
import { uploadImageToR2, r2Configured } from '../lib/r2'
import { notifyAdmins, maybeNotifyLowStock } from '../lib/notify'
import { msg } from '../lib/i18n'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB raw max before compress
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/i.test(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(msg(req, 'products.imageTypeError')) as any)
    }
  },
})

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

// POST /products/upload-image — vendor uploads product image → R2 (compressed ≤ 200 KB)
// Must be registered before /:id so "upload-image" is not treated as an id.
router.post(
  '/upload-image',
  requireAuth,
  requireRole('vendor', 'admin'),
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err) {
        const m = err.message || msg(req, 'products.uploadFailedGeneric')
        return res.status(400).json({ error: m })
      }
      next()
    })
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: msg(req, 'products.noImageSent') })
      }
      if (!r2Configured) {
        return res.status(503).json({
          error: msg(req, 'products.imageServiceNotConfigured'),
        })
      }

      const compressed = await compressToUnder200KB(req.file.buffer)
      const url = await uploadImageToR2(compressed, 'image/webp')

      res.status(201).json({
        url,
        sizeBytes: compressed.length,
        sizeKb: Math.round(compressed.length / 1024),
      })
    } catch (err: any) {
      console.error('Image upload error:', err)
      res.status(err.status || 500).json({ error: err.message || msg(req, 'products.uploadFailed') })
    }
  }
)

router.get('/:id', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { category: true, vendor: { select: vendorSelect } },
  })
  if (!product) return res.status(404).json({ error: msg(req, 'products.notFound') })
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

  const io = req.app.get('io')
  const vendor = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { fullName: true, shopName: true },
  })
  const shopBn = vendor?.shopName || vendor?.fullName || 'একজন বিক্রেতা'
  const shopEn = vendor?.shopName || vendor?.fullName || 'A vendor'
  await notifyAdmins(
    {
      bn: { title: 'নতুন প্রোডাক্ট যোগ হয়েছে', message: `${shopBn} নতুন প্রোডাক্ট যোগ করেছেন: ${name}` },
      en: { title: 'New product added', message: `${shopEn} added a new product: ${name}` },
    },
    'product_added',
    io,
  )

  res.status(201).json({ product })
})

router.put('/:id', requireAuth, requireRole('vendor', 'admin'), async (req, res) => {
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: msg(req, 'products.notFound') })
  if (req.user!.role !== 'admin' && existing.vendorId !== req.user!.id) {
    return res.status(403).json({ error: msg(req, 'products.notAllowedEdit') })
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

  const io = req.app.get('io')
  if (stockQty != null) {
    await maybeNotifyLowStock(product.id, io)
  }

  res.json({ product })
})

router.delete('/:id', requireAuth, requireRole('vendor', 'admin'), async (req, res) => {
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: msg(req, 'products.notFound') })
  if (req.user!.role !== 'admin' && existing.vendorId !== req.user!.id) {
    return res.status(403).json({ error: msg(req, 'products.notAllowedDelete') })
  }
  await prisma.product.delete({ where: { id: req.params.id } })
  res.status(204).end()
})

export default router
