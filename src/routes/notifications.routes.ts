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

export default router
