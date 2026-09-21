import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  })

  const categories = [
    { name: 'শাকসবজি', slug: 'shaksobji', icon: '🥬' },
    { name: 'ফল', slug: 'fol', icon: '🍎' },
    { name: 'মূল জাতীয়', slug: 'mul-jatiyo', icon: '🥕' },
    { name: 'পাতা জাতীয়', slug: 'pata-jatiyo', icon: '🥦' },
    { name: 'মসলা', slug: 'mosla', icon: '🌶️' },
  ]

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    })
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@sobujbazar.com'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!'
  const passwordHash = await bcrypt.hash(adminPassword, 10)

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      fullName: 'Admin',
      role: 'admin',
      emailVerified: true,
    },
  })

  console.log('Seed complete.')
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
