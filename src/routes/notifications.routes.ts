import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  res.json({ notifications })
})

router.patch('/:id/read', async (req, res) => {
  const n = await prisma.notification.findUnique({ where: { id: req.params.id } })
  if (!n || n.userId !== req.user!.id) return res.status(404).json({ error: 'পাওয়া যায়নি' })
  const updated = await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } })
  res.json({ notification: updated })
})

router.patch('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, isRead: false }, data: { isRead: true } })
  res.status(204).end()
})

/** Save browser FCM token for push notifications (one user can have multiple devices). */
router.post('/fcm-token', async (req, res) => {
  const { token } = req.body as { token?: string }
  if (!token || typeof token !== 'string' || token.length < 20) {
    return res.status(400).json({ error: 'সঠিক FCM token দিন' })
  }

  await prisma.fcmToken.upsert({
    where: { token },
    create: { userId: req.user!.id, token },
    update: { userId: req.user!.id, updatedAt: new Date() },
  })

  res.status(201).json({ ok: true })
})

/** Remove FCM token (e.g. on logout or permission revoked). */
router.delete('/fcm-token', async (req, res) => {
  const { token } = req.body as { token?: string }
  if (token) {
    await prisma.fcmToken.deleteMany({ where: { token, userId: req.user!.id } })
  } else {
    await prisma.fcmToken.deleteMany({ where: { userId: req.user!.id } })
  }
  res.status(204).end()
})

export default router
