import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const FROM = process.env.SMTP_FROM || 'সবুজ বাজার <no-reply@sobujbazar.com>'

export async function sendOtpEmail(to: string, code: string) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'সবুজ বাজার ভেরিফিকেশন কোড',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color:#15803d;">সবুজ বাজার</h2>
        <p>আপনার অ্যাকাউন্ট ভেরিফাই করতে নিচের কোডটি ব্যবহার করুন:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color:#15803d;">${code}</p>
        <p style="color:#666; font-size: 13px;">এই কোডটি ১০ মিনিটের জন্য বৈধ থাকবে। আপনি যদি এই অনুরোধ না করে থাকেন, এই ইমেইলটি উপেক্ষা করুন।</p>
      </div>
    `,
  })
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'সবুজ বাজার পাসওয়ার্ড রিসেট',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color:#15803d;">সবুজ বাজার</h2>
        <p>আপনার পাসওয়ার্ড রিসেট করতে নিচের লিংকে ক্লিক করুন:</p>
        <p><a href="${resetUrl}" style="background:#15803d;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">পাসওয়ার্ড রিসেট করুন</a></p>
        <p style="color:#666; font-size: 13px;">এই লিংকটি ১ ঘণ্টার জন্য বৈধ থাকবে। আপনি যদি এই অনুরোধ না করে থাকেন, এই ইমেইলটি উপেক্ষা করুন।</p>
      </div>
    `,
  })
}
