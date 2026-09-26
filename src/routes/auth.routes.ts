import { Router } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { sendOtpEmail, sendPasswordResetEmail } from '../lib/email'
import { signToken } from '../middleware/auth'
import { verifyFirebaseIdToken } from '../lib/firebaseAdmin'
import { msg } from '../lib/i18n'

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
      return res.status(400).json({ error: msg(req, 'auth.needEmailPasswordName') })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: msg(req, 'auth.passwordTooShort') })
    }
    if (!['buyer', 'vendor', 'wholesale'].includes(role)) {
      return res.status(400).json({ error: msg(req, 'auth.invalidRole') })
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return res.status(409).json({
        error: existing.emailVerified
          ? msg(req, 'auth.accountExistsVerified')
          : msg(req, 'auth.accountExistsUnverified'),
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
      message: msg(req, 'auth.accountCreated'),
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
      return res.status(400).json({ error: msg(req, 'auth.needEmailOtp') })
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user) return res.status(404).json({ error: msg(req, 'auth.accountNotFound') })
    if (user.emailVerified) return res.status(400).json({ error: msg(req, 'auth.alreadyVerified') })
    if (!user.otpCodeHash || !user.otpExpiresAt) {
      return res.status(400).json({ error: msg(req, 'auth.otpNotFound') })
    }
    if (user.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: msg(req, 'auth.otpExpired') })
    }
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ error: msg(req, 'auth.tooManyAttempts') })
    }

    const valid = hashValue(token.trim()) === user.otpCodeHash
    if (!valid) {
      await prisma.user.update({
        where: { id: user.id },
        data: { otpAttempts: { increment: 1 } },
      })
      return res.status(400).json({ error: msg(req, 'auth.wrongOtp') })
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
      message: msg(req, 'auth.emailVerified'),
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
    if (!normalizedEmail) return res.status(400).json({ error: msg(req, 'auth.needEmail') })

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user) return res.status(404).json({ error: msg(req, 'auth.accountNotFound') })
    if (user.emailVerified) return res.status(400).json({ error: msg(req, 'auth.alreadyVerified') })

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

    return res.json({ message: msg(req, 'auth.otpResent') })
  } catch (err) {
    next(err)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }
    const normalizedEmail = email?.trim().toLowerCase()

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: msg(req, 'auth.needEmailPassword') })
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: msg(req, 'auth.wrongCredentials') })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: msg(req, 'auth.wrongCredentials') })
    if (!user.emailVerified) return res.status(403).json({ error: msg(req, 'auth.verifyEmailFirst') })

    return res.json({ token: signToken(toAuthUser(user)), user: publicUser(user) })
  } catch (err) {
    next(err)
  }
})

/** Firebase Phone Auth */
router.post('/phone', async (req, res, next) => {
  try {
    const { idToken, fullName } = req.body as { idToken?: string; fullName?: string }
    if (!idToken?.trim()) {
      return res.status(400).json({ error: msg(req, 'auth.needFirebaseToken') })
    }

    let decoded: { uid: string; phone_number?: string; name?: string }
    try {
      decoded = await verifyFirebaseIdToken(idToken.trim())
    } catch (err: any) {
      console.error('[auth/phone] token verify failed', err?.message || err)
      return res.status(401).json({ error: msg(req, 'auth.invalidPhoneAuth') })
    }

    const phone = decoded.phone_number?.trim()
    if (!phone) {
      return res.status(400).json({ error: msg(req, 'auth.noPhoneFound') })
    }

    const name = fullName?.trim() || decoded.name?.trim() || `User ${phone.slice(-4)}`

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
      message: msg(req, 'auth.phoneLoginSuccess'),
      token: signToken(toAuthUser(user)),
      user: publicUser(user),
    })
  } catch (err) {
    next(err)
  }
})

/** Firebase Google OAuth — client sends Firebase ID token after Google sign-in */
router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = req.body as { idToken?: string }
    if (!idToken?.trim()) {
      return res.status(400).json({ error: msg(req, 'auth.needFirebaseToken') })
    }

    let decoded: {
      uid: string
      email?: string
      email_verified?: boolean
      name?: string
      picture?: string
    }
    try {
      decoded = await verifyFirebaseIdToken(idToken.trim())
    } catch (err: any) {
      console.error('[auth/google] token verify failed', err?.message || err)
      return res.status(401).json({ error: msg(req, 'auth.invalidGoogleAuth') })
    }

    const email = decoded.email?.trim().toLowerCase()
    if (!email) {
      return res.status(400).json({ error: msg(req, 'auth.noGoogleEmail') })
    }

    const name = decoded.name?.trim() || email.split('@')[0]

    let user =
      (await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } })) ||
      (await prisma.user.findUnique({ where: { email } }))

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firebaseUid: decoded.uid,
          email,
          emailVerified: true,
          fullName: user.fullName || name,
        },
      })
    } else {
      user = await prisma.user.create({
        data: {
          firebaseUid: decoded.uid,
          email,
          fullName: name,
          role: 'buyer',
          emailVerified: true,
          passwordHash: null,
        },
      })
    }

    return res.json({
      message: msg(req, 'auth.googleLoginSuccess'),
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
    if (!normalizedEmail) return res.status(400).json({ error: msg(req, 'auth.needEmail') })

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user || !user.passwordHash) {
      return res.json({ message: msg(req, 'auth.resetLinkIfRegistered') })
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

    return res.json({ message: msg(req, 'auth.resetLinkSent') })
  } catch (err) {
    next(err)
  }
})

router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, token, password } = req.body as { email?: string; token?: string; password?: string }
    const normalizedEmail = email?.trim().toLowerCase()

    if (!normalizedEmail || !token || !password) {
      return res.status(400).json({ error: msg(req, 'auth.needResetFields') })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: msg(req, 'auth.passwordTooShort') })
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user || !user.resetTokenHash || !user.resetTokenExpires) {
      return res.status(400).json({ error: msg(req, 'auth.invalidResetLink') })
    }
    if (user.resetTokenExpires.getTime() < Date.now() || hashValue(token) !== user.resetTokenHash) {
      return res.status(400).json({ error: msg(req, 'auth.invalidResetLink') })
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

    return res.json({ message: msg(req, 'auth.passwordChanged'), user: publicUser(updated) })
  } catch (err) {
    next(err)
  }
})

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) return res.status(404).json({ error: msg(req, 'auth.userNotFound') })
    return res.json({ user: publicUser(user) })
  } catch (err) {
    next(err)
  }
})

router.delete('/account', requireAuth, async (req, res, next) => {
  try {
    await prisma.user.delete({ where: { id: req.user!.id } })
    return res.json({ message: msg(req, 'auth.accountDeleted') })
  } catch (err) {
    next(err)
  }
})

export default router
