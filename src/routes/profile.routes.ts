import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.put('/', async (req, res) => {
  const {
    fullName, phone, address, city, area,
    shopName, shopDescription, latitude, longitude, deliveryRadiusKm,
  } = req.body

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      fullName, phone, address, city, area,
      shopName, shopDescription,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      deliveryRadiusKm: deliveryRadiusKm != null ? Number(deliveryRadiusKm) : null,
    },
  })
  const { passwordHash, otpCodeHash, resetTokenHash, ...publicUser } = user
  res.json({ user: publicUser })
})

export default router
