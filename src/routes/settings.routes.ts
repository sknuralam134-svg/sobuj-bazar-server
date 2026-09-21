import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requireRole } from '../middleware/auth'

const router = Router()

router.get('/', async (_req, res) => {
  const settings = await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  })
  res.json({ settings })
})

router.put('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { contactPhone, contactEmail, address, businessHours, facebookUrl, instagramUrl, tagline } = req.body
  const settings = await prisma.siteSettings.update({
    where: { id: 1 },
    data: { contactPhone, contactEmail, address, businessHours, facebookUrl, instagramUrl, tagline },
  })
  res.json({ settings })
})

export default router
