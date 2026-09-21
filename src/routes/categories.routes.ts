import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requireRole } from '../middleware/auth'

const router = Router()

router.get('/', async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
  res.json({ categories })
})

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, icon, description } = req.body
  const slug = String(name).trim().toLowerCase().replace(/\s+/g, '-')
  const category = await prisma.category.create({ data: { name, icon, description, slug } })
  res.status(201).json({ category })
})

router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, icon, description } = req.body
  const slug = String(name).trim().toLowerCase().replace(/\s+/g, '-')
  const category = await prisma.category.update({
    where: { id: req.params.id },
    data: { name, icon, description, slug },
  })
  res.json({ category })
})

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await prisma.category.delete({ where: { id: req.params.id } })
  res.status(204).end()
})

export default router
