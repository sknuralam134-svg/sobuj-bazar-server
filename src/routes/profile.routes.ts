import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.put('/', async (req, res, next) => {
  try {
    const {
      fullName, phone, address, city, area,
      shopName, shopDescription, latitude, longitude, deliveryRadiusKm,
    } = req.body

    // Empty string → null so unique constraint on phone is not broken by ""
    const cleanPhone =
      phone === undefined ? undefined : (typeof phone === 'string' && phone.trim() ? phone.trim() : null)

    const data: Record<string, any> = {}

    if (fullName !== undefined) data.fullName = typeof fullName === 'string' ? fullName.trim() : fullName
    if (cleanPhone !== undefined) data.phone = cleanPhone
    if (address !== undefined) data.address = typeof address === 'string' ? (address.trim() || null) : address
    if (city !== undefined) data.city = typeof city === 'string' ? (city.trim() || null) : city
    if (area !== undefined) data.area = typeof area === 'string' ? (area.trim() || null) : area
    if (shopName !== undefined) data.shopName = typeof shopName === 'string' ? (shopName.trim() || null) : shopName
    if (shopDescription !== undefined) {
      data.shopDescription =
        typeof shopDescription === 'string' ? (shopDescription.trim() || null) : shopDescription
    }

    // Only touch geo fields when the client actually sent them (vendors)
    if (latitude !== undefined) {
      data.latitude = latitude != null && latitude !== '' ? Number(latitude) : null
    }
    if (longitude !== undefined) {
      data.longitude = longitude != null && longitude !== '' ? Number(longitude) : null
    }
    if (deliveryRadiusKm !== undefined) {
      data.deliveryRadiusKm =
        deliveryRadiusKm != null && deliveryRadiusKm !== '' ? Number(deliveryRadiusKm) : null
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
    })
    const { passwordHash, otpCodeHash, resetTokenHash, ...publicUser } = user
    res.json({ user: publicUser })
  } catch (err: any) {
    // Prisma unique constraint (e.g. phone already used by another account)
    if (err?.code === 'P2002') {
      const target = Array.isArray(err?.meta?.target) ? err.meta.target.join(', ') : 'field'
      return res.status(409).json({
        error:
          target.includes('phone')
            ? 'এই ফোন নম্বরটি ইতিমধ্যে অন্য অ্যাকাউন্টে ব্যবহার করা হয়েছে'
            : 'এই তথ্য ইতিমধ্যে অন্য অ্যাকাউন্টে আছে',
      })
    }
    next(err)
  }
})

export default router
