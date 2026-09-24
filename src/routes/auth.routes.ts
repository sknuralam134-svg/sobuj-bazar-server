import { Router } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { sendOtpEmail, sendPasswordResetEmail } from '../lib/email'
import { signToken } from '../middleware/auth'
import { verifyFirebaseIdToken } from '../lib/firebaseAdmin'

const router = Router()

const OTP_TTL_MS = 10 * 60 * 1000
const RESET_TTL_MS = 60 * 60 * 1000
const MAX_OTP_ATTEMPTS = 5

function hashValue(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000))
}

function publicUser(user: any) {
  const { passwordHash, otpCodeHash, otpExpiresAt, otpAttempts, resetTokenHash, resetTokenExpires, firebaseUid, ...safeUser } = user
  return safeUser
}

function toAuthUser(user: { id: string; role: string; email: string | null; phone: string | null }) {
  return {
    id: user.id,
    role: user.role,
    email: user.email || user.phone || '',
  }
}

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, fullName, role = 'buyer', phone } = req.body as {
      email?: string
      password?: string
      fullName?: string
      role?: string
      phone?: string
    }

    const normalizedEmail = email?.trim().toLowerCase()

    if (!normalizedEmail || !password || !fullName?.trim()) {
      return res.status(400).json({ error: 'ইমেইল, পাসওয়ার্ড ও নাম দিতে হবে' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে' })
    }
    if (!['buyer', 'vendor', 'wholesale'].includes(role)) {
      return res.status(400).json({ error: 'অবৈধ ইউজার রোল' })
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return res.status(409).json({
        error: existing.emailVerified ? 'এই ইমেইল দিয়ে অ্যাকাউন্ট ইতিমধ্যে আছে' : 'এই ইমেইল ইতিমধ্যে নিবন্ধিত, OTP আবার পাঠানো হচ্ছে',
      })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const code = generateOtp()
    const now = new Date()

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        fullName: fullName.trim(),
        phone: phone?.trim() || null,
        role: role as any,
        otpCodeHash: hashValue(code),
        otpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
        otpAttempts: 0,
        emailVerified: false,
      },
    })

    try {
      await sendOtpEmail(normalizedEmail, code)
    } catch (emailError) {
      await prisma.user.delete({ where: { id: user.id } })
      throw emailError
    }

    return res.status(201).json({
      message: 'অ্যাকাউন্ট তৈরি হয়েছে। ইমেইলে পাঠানো OTP দিয়ে ভেরিফাই করুন।',
      user: publicUser(user),
    })
  } catch (err) {
    next(err)
  }
})

router.post('/verify-otp', async (req, res, next) => {
  try {
    const { email, token } = req.body as { email?: string; token?: string }
    const normalizedEmail = email?.trim().toLowerCase()

    if (!normalizedEmail || !token) {
      return res.status(400).json({ error: 'ইমেইল ও OTP দিতে হবে' })
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user) return res.status(404).json({ error: 'অ্যাকাউন্ট পাওয়া যায়নি' })
    if (user.emailVerified) return res.status(400).json({ error: 'ইমেইল ইতিমধ্যে ভেরিফাই করা হয়েছে' })
    if (!user.otpCodeHash || !user.otpExpiresAt) {
      return res.status(400).json({ error: 'OTP পাওয়া যায়নি। নতুন OTP নিন' })
    }
    if (user.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'OTP-এর মেয়াদ শেষ। নতুন OTP নিন' })
    }
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ error: 'অনেকবার ভুল OTP দেওয়া হয়েছে। নতুন OTP নিন' })
    }

    const valid = hashValue(token.trim()) === user.otpCodeHash
    if (!valid) {
      await prisma.user.update({
        where: { id: user.id },
        data: { otpAttempts: { increment: 1 } },
      })
      return res.status(400).json({ error: 'ভুল OTP' })
    }

    const verifiedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        otpCodeHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
      },
    })

    return res.json({
      message: 'ইমেইল ভেরিফাই হয়েছে',
      token: signToken(toAuthUser(verifiedUser)),
      user: publicUser(verifiedUser),
    })
  } catch (err) {
    next(err)
  }
})

router.post('/resend-otp', async (req, res, next) => {
  try {
    const { email } = req.body as { email?: string }
    const normalizedEmail = email?.trim().toLowerCase()
    if (!normalizedEmail) return res.status(400).json({ error: 'ইমেইল দিতে হবে' })

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user) return res.status(404).json({ error: 'অ্যাকাউন্ট পাওয়া যায়নি' })
    if (user.emailVerified) return res.status(400).json({ error: 'ইমেইল ইতিমধ্যে ভেরিফাই করা হয়েছে' })

    const code = generateOtp()
    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCodeHash: hashValue(code),
        otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
        otpAttempts: 0,
      },
    })

    try {
      await sendOtpEmail(normalizedEmail, code)
    } catch (emailError) {
      await prisma.user.update({
        where: { id: user.id },
        data: { otpCodeHash: null, otpExpiresAt: null, otpAttempts: 0 },
      })
      throw emailError
    }

    return res.json({ message: 'নতুন OTP ইমেইলে পাঠানো হয়েছে' })
  } catch (err) {
    next(err)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }
    const normalizedEmail = email?.trim().toLowerCase()

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'ইমেইল ও পাসওয়ার্ড দিতে হবে' })
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'ইমেইল বা পাসওয়ার্ড ভুল' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'ইমেইল বা পাসওয়ার্ড ভুল' })
    if (!user.emailVerified) return res.status(403).json({ error: 'আগে ইমেইল ভেরিফাই করুন' })

    return res.json({ token: signToken(toAuthUser(user)), user: publicUser(user) })
  } catch (err) {
    next(err)
  }
})

/** Firebase Phone Auth — client sends Firebase ID token after SMS OTP success */
router.post('/phone', async (req, res, next) => {
  try {
    const { idToken, fullName } = req.body as { idToken?: string; fullName?: string }
    if (!idToken?.trim()) {
      return res.status(400).json({ error: 'Firebase idToken দিতে হবে' })
    }

    let decoded: { uid: string; phone_number?: string; name?: string }
    try {
      decoded = await verifyFirebaseIdToken(idToken.trim())
    } catch (err: any) {
      console.error('[auth/phone] token verify failed', err?.message || err)
      return res.status(401).json({ error: 'অবৈধ বা মেয়াদোত্তীর্ণ ফোন ভেরিফিকেশন' })
    }

    const phone = decoded.phone_number?.trim()
    if (!phone) {
      return res.status(400).json({ error: 'ফোন নম্বর পাওয়া যায়নি। আবার OTP দিন।' })
    }

    const name =
      fullName?.trim() ||
      decoded.name?.trim() ||
      `User ${phone.slice(-4)}`

    let user =
      (await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } })) ||
      (await prisma.user.findUnique({ where: { phone } }))

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firebaseUid: decoded.uid,
          phone,
          emailVerified: true,
          ...(user.fullName ? {} : { fullName: name }),
        },
      })
    } else {
      user = await prisma.user.create({
        data: {
          firebaseUid: decoded.uid,
          phone,
          fullName: name,
          role: 'buyer',
          emailVerified: true,
          email: null,
          passwordHash: null,
        },
      })
    }

    return res.json({
      message: 'ফোন দিয়ে লগইন সফল',
      token: signToken(toAuthUser(user)),
      user: publicUser(user),
    })
  } catch (err) {
    next(err)
  }
})

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body as { email?: string }
    const normalizedEmail = email?.trim().toLowerCase()
    if (!normalizedEmail) return res.status(400).json({ error: 'ইমেইল দিতে হবে' })

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user || !user.passwordHash) {
      return res.json({ message: 'যদি এই ইমেইলটি নিবন্ধিত থাকে, রিসেট লিংক পাঠানো হবে' })
    }

    const rawToken = crypto.randomBytes(32).toString('hex')
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetTokenHash: hashValue(rawToken),
        resetTokenExpires: new Date(Date.now() + RESET_TTL_MS),
      },
    })

    const frontendUrl = (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/$/, '')
    const resetUrl = `${frontendUrl || 'http://localhost:5173'}/reset-password?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(normalizedEmail)}`
    await sendPasswordResetEmail(normalizedEmail, resetUrl)

    return res.json({ message: 'রিসেট লিংক ইমেইলে পাঠানো হয়েছে' })
  } catch (err) {
    next(err)
  }
})

router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, token, password } = req.body as { email?: string; token?: string; password?: string }
    const normalizedEmail = email?.trim().toLowerCase()

    if (!normalizedEmail || !token || !password) {
      return res.status(400).json({ error: 'ইমেইল, রিসেট টোকেন ও নতুন পাসওয়ার্ড দিতে হবে' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে' })
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user || !user.resetTokenHash || !user.resetTokenExpires) {
      return res.status(400).json({ error: 'অবৈধ বা মেয়াদোত্তীর্ণ রিসেট লিংক' })
    }
    if (user.resetTokenExpires.getTime() < Date.now() || hashValue(token) !== user.resetTokenHash) {
      return res.status(400).json({ error: 'অবৈধ বা মেয়াদোত্তীর্ণ রিসেট লিংক' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetTokenHash: null,
        resetTokenExpires: null,
      },
    })

    return res.json({ message: 'পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে', user: publicUser(updated) })
  } catch (err) {
    next(err)
  }
})

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) return res.status(404).json({ error: 'ইউজার পাওয়া যায়নি' })
    return res.json({ user: publicUser(user) })
  } catch (err) {
    next(err)
  }
})

router.delete('/account', requireAuth, async (req, res, next) => {
  try {
    await prisma.user.delete({ where: { id: req.user!.id } })
    return res.json({ message: 'অ্যাকাউন্ট মুছে ফেলা হয়েছে' })
  } catch (err) {
    next(err)
  }
})

export default router
