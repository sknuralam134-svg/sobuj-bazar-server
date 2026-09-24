import nodemailer from 'nodemailer'

const FROM = process.env.SMTP_FROM || 'সবুজ বাজার <onboarding@resend.dev>'

/** Prefer Resend HTTP API when API key looks like Resend (re_...) or RESEND_API_KEY is set. */
function getResendApiKey(): string | null {
  const key = process.env.RESEND_API_KEY || process.env.SMTP_PASS || ''
  if (key.startsWith('re_')) return key
  return null
}

function useResendApi(): boolean {
  if (process.env.RESEND_API_KEY?.startsWith('re_')) return true
  const host = (process.env.SMTP_HOST || '').toLowerCase()
  const pass = process.env.SMTP_PASS || ''
  return host.includes('resend') && pass.startsWith('re_')
}

async function sendViaResendApi(to: string, subject: string, html: string) {
  const apiKey = getResendApiKey()
  if (!apiKey) {
    throw new Error('Resend API key missing (RESEND_API_KEY or SMTP_PASS must start with re_)')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject,
        html,
      }),
      signal: controller.signal,
    })

    const data = (await res.json().catch(() => ({}))) as { message?: string; name?: string; id?: string }

    if (!res.ok) {
      const msg = data.message || data.name || `Resend error ${res.status}`
      console.error('[email] Resend API failed:', res.status, data)
      throw new Error(`ইমেইল পাঠানো যায়নি: ${msg}`)
    }

    console.log('[email] Resend sent OK id=', data.id, 'to=', to)
  } finally {
    clearTimeout(timer)
  }
}

function createSmtpTransporter() {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const secure = process.env.SMTP_SECURE === 'true'
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    throw new Error('SMTP_HOST / SMTP_USER / SMTP_PASS সেট করা নেই')
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      // Avoid hanging on strict TLS mismatches on some hosts
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
    },
  })
}

async function sendViaSmtp(to: string, subject: string, html: string) {
  const transporter = createSmtpTransporter()
  try {
    const info = await transporter.sendMail({
      from: FROM,
      to,
      subject,
      html,
    })
    console.log('[email] SMTP sent OK messageId=', info.messageId, 'to=', to)
  } finally {
    transporter.close()
  }
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!to) throw new Error('প্রাপক ইমেইল নেই')

  if (useResendApi()) {
    await sendViaResendApi(to, subject, html)
    return
  }

  await sendViaSmtp(to, subject, html)
}

export async function sendOtpEmail(to: string, code: string) {
  await sendEmail(
    to,
    'সবুজ বাজার ভেরিফিকেশন কোড',
    `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color:#15803d;">সবুজ বাজার</h2>
        <p>আপনার অ্যাকাউন্ট ভেরিফাই করতে নিচের কোডটি ব্যবহার করুন:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color:#15803d;">${code}</p>
        <p style="color:#666; font-size: 13px;">এই কোডটি ১০ মিনিটের জন্য বৈধ থাকবে। আপনি যদি এই অনুরোধ না করে থাকেন, এই ইমেইলটি উপেক্ষা করুন।</p>
      </div>
    `,
  )
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await sendEmail(
    to,
    'সবুজ বাজার পাসওয়ার্ড রিসেট',
    `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color:#15803d;">সবুজ বাজার</h2>
        <p>আপনার পাসওয়ার্ড রিসেট করতে নিচের লিংকে ক্লিক করুন:</p>
        <p><a href="${resetUrl}" style="background:#15803d;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">পাসওয়ার্ড রিসেট করুন</a></p>
        <p style="color:#666; font-size: 13px;">এই লিংকটি ১ ঘণ্টার জন্য বৈধ থাকবে। আপনি যদি এই অনুরোধ না করে থাকেন, এই ইমেইলটি উপেক্ষা করুন।</p>
        <p style="color:#999; font-size: 12px; word-break: break-all;">${resetUrl}</p>
      </div>
    `,
  )
}
