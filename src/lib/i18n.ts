import type { Request } from 'express'

export type Lang = 'bn' | 'en'

/** Frontend sends either ?lang=en or header X-Lang: en. Defaults to bn. */
export function getLang(req: Request): Lang {
  const q = (req.query?.lang as string | undefined)?.toLowerCase()
  const h = (req.headers['x-lang'] as string | undefined)?.toLowerCase()
  return q === 'en' || h === 'en' ? 'en' : 'bn'
}

const dict = {
  'server.genericError': { bn: 'সার্ভার এরর হয়েছে', en: 'A server error occurred' },

  'auth.loginRequired': { bn: 'লগইন প্রয়োজন', en: 'Login required' },
  'auth.sessionExpired': { bn: 'সেশন মেয়াদোত্তীর্ণ, আবার লগইন করুন', en: 'Session expired, please log in again' },
  'auth.noPermission': { bn: 'এই কাজের অনুমতি আপনার নেই', en: 'You do not have permission to do this' },

  'auth.needEmailPasswordName': { bn: 'ইমেইল, পাসওয়ার্ড ও নাম দিতে হবে', en: 'Email, password and name are required' },
  'auth.passwordTooShort': { bn: 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে', en: 'Password must be at least 8 characters' },
  'auth.invalidRole': { bn: 'অবৈধ ইউজার রোল', en: 'Invalid user role' },
  'auth.accountExistsVerified': { bn: 'এই ইমেইল দিয়ে অ্যাকাউন্ট ইতিমধ্যে আছে', en: 'An account already exists with this email' },
  'auth.accountExistsUnverified': { bn: 'এই ইমেইল ইতিমধ্যে নিবন্ধিত, OTP আবার পাঠানো হচ্ছে', en: 'This email is already registered — resending OTP' },
  'auth.accountCreated': { bn: 'অ্যাকাউন্ট তৈরি হয়েছে। ইমেইলে পাঠানো OTP দিয়ে ভেরিফাই করুন।', en: 'Account created. Verify with the OTP sent to your email.' },

  'auth.needEmailOtp': { bn: 'ইমেইল ও OTP দিতে হবে', en: 'Email and OTP are required' },
  'auth.accountNotFound': { bn: 'অ্যাকাউন্ট পাওয়া যায়নি', en: 'Account not found' },
  'auth.alreadyVerified': { bn: 'ইমেইল ইতিমধ্যে ভেরিফাই করা হয়েছে', en: 'Email is already verified' },
  'auth.otpNotFound': { bn: 'OTP পাওয়া যায়নি। নতুন OTP নিন', en: 'No OTP found. Please request a new one' },
  'auth.otpExpired': { bn: 'OTP-এর মেয়াদ শেষ। নতুন OTP নিন', en: 'OTP has expired. Please request a new one' },
  'auth.tooManyAttempts': { bn: 'অনেকবার ভুল OTP দেওয়া হয়েছে। নতুন OTP নিন', en: 'Too many incorrect attempts. Please request a new OTP' },
  'auth.wrongOtp': { bn: 'ভুল OTP', en: 'Incorrect OTP' },
  'auth.emailVerified': { bn: 'ইমেইল ভেরিফাই হয়েছে', en: 'Email verified' },

  'auth.needEmail': { bn: 'ইমেইল দিতে হবে', en: 'Email is required' },
  'auth.otpResent': { bn: 'নতুন OTP ইমেইলে পাঠানো হয়েছে', en: 'A new OTP has been sent to your email' },

  'auth.needEmailPassword': { bn: 'ইমেইল ও পাসওয়ার্ড দিতে হবে', en: 'Email and password are required' },
  'auth.wrongCredentials': { bn: 'ইমেইল বা পাসওয়ার্ড ভুল', en: 'Incorrect email or password' },
  'auth.verifyEmailFirst': { bn: 'আগে ইমেইল ভেরিফাই করুন', en: 'Please verify your email first' },

  'auth.needFirebaseToken': { bn: 'Firebase idToken দিতে হবে', en: 'Firebase idToken is required' },
  'auth.invalidPhoneAuth': { bn: 'অবৈধ বা মেয়াদোত্তীর্ণ ফোন ভেরিফিকেশন', en: 'Invalid or expired phone verification' },
  'auth.noPhoneFound': { bn: 'ফোন নম্বর পাওয়া যায়নি। আবার OTP দিন।', en: 'Phone number not found. Please try OTP again.' },
  'auth.phoneLoginSuccess': { bn: 'ফোন দিয়ে লগইন সফল', en: 'Signed in successfully with phone' },

  'auth.invalidGoogleAuth': { bn: 'অবৈধ বা মেয়াদোত্তীর্ণ Google লগইন', en: 'Invalid or expired Google sign-in' },
  'auth.noGoogleEmail': { bn: 'Google অ্যাকাউন্ট থেকে ইমেইল পাওয়া যায়নি', en: 'Could not get email from Google account' },
  'auth.googleLoginSuccess': { bn: 'Google দিয়ে লগইন সফল', en: 'Signed in successfully with Google' },

  'auth.resetLinkIfRegistered': { bn: 'যদি এই ইমেইলটি নিবন্ধিত থাকে, রিসেট লিংক পাঠানো হবে', en: 'If this email is registered, a reset link will be sent' },
  'auth.resetLinkSent': { bn: 'রিসেট লিংক ইমেইলে পাঠানো হয়েছে', en: 'Reset link has been sent to your email' },

  'auth.needResetFields': { bn: 'ইমেইল, রিসেট টোকেন ও নতুন পাসওয়ার্ড দিতে হবে', en: 'Email, reset token and new password are required' },
  'auth.invalidResetLink': { bn: 'অবৈধ বা মেয়াদোত্তীর্ণ রিসেট লিংক', en: 'Invalid or expired reset link' },
  'auth.passwordChanged': { bn: 'পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে', en: 'Password changed successfully' },

  'auth.userNotFound': { bn: 'ইউজার পাওয়া যায়নি', en: 'User not found' },
  'auth.accountDeleted': { bn: 'অ্যাকাউন্ট মুছে ফেলা হয়েছে', en: 'Account deleted' },

  'profile.phoneInUse': { bn: 'এই ফোন নম্বরটি ইতিমধ্যে অন্য অ্যাকাউন্টে ব্যবহার করা হয়েছে', en: 'This phone number is already used by another account' },
  'profile.dataInUse': { bn: 'এই তথ্য ইতিমধ্যে অন্য অ্যাকাউন্টে আছে', en: 'This information is already used by another account' },

  'cart.notFound': { bn: 'পাওয়া যায়নি', en: 'Not found' },

  'orders.needAddressPhone': { bn: 'ডেলিভারি ঠিকানা ও ফোন নম্বর দিতে হবে', en: 'Delivery address and phone number are required' },
  'orders.cartEmpty': { bn: 'কার্ট খালি', en: 'Cart is empty' },
  'orders.insufficientStock': { bn: '{name}-এ পর্যাপ্ত স্টক নেই (আছে: {qty} {unit})', en: 'Not enough stock for {name} (available: {qty} {unit})' },
  'orders.wholesaleMinQty': { bn: '{name}-এর জন্য সর্বনিম্ন {min} {unit} অর্ডার করতে হবে', en: 'Minimum order for {name} is {min} {unit}' },
  'orders.notFound': { bn: 'অর্ডার পাওয়া যায়নি', en: 'Order not found' },
  'orders.notAllowed': { bn: 'এই অর্ডার পরিবর্তনের অনুমতি নেই', en: 'You do not have permission to change this order' },
  'orders.statusUpdatedBody': { bn: 'অর্ডার #{id} — বর্তমান অবস্থা আপডেট হয়েছে', en: 'Order #{id} — status has been updated' },

  'products.imageTypeError': { bn: 'শুধুমাত্র ছবি ফাইল (JPEG, PNG, WebP, GIF) আপলোড করা যাবে', en: 'Only image files (JPEG, PNG, WebP, GIF) can be uploaded' },
  'products.uploadFailedGeneric': { bn: 'ফাইল আপলোড ব্যর্থ', en: 'File upload failed' },
  'products.noImageSent': { bn: 'কোনো ছবি পাঠানো হয়নি', en: 'No image was sent' },
  'products.imageServiceNotConfigured': { bn: 'ছবি আপলোড সার্ভিস এখনো কনফিগার করা হয়নি। অ্যাডমিনকে R2 env সেট করতে বলুন।', en: 'The image upload service is not configured yet. Ask the admin to set up the R2 environment.' },
  'products.uploadFailed': { bn: 'ছবি আপলোড ব্যর্থ হয়েছে', en: 'Image upload failed' },
  'products.notFound': { bn: 'প্রোডাক্ট পাওয়া যায়নি', en: 'Product not found' },
  'products.notAllowedEdit': { bn: 'এই প্রোডাক্ট সম্পাদনার অনুমতি নেই', en: 'You do not have permission to edit this product' },
  'products.notAllowedDelete': { bn: 'এই প্রোডাক্ট মোছার অনুমতি নেই', en: 'You do not have permission to delete this product' },

  'geo.latLngRequired': { bn: 'lat ও lng দরকার', en: 'lat and lng are required' },
  'geo.invalidCoords': { bn: 'অবৈধ কো-অর্ডিনেট', en: 'Invalid coordinates' },
  'geo.addressLookupFailed': { bn: 'ঠিকানা খুঁজে পাওয়া যায়নি', en: 'Could not find the address' },
  'geo.addressNotFound': { bn: 'এই লোকেশনের ঠিকানা পাওয়া যায়নি', en: 'No address found for this location' },
  'geo.serviceDown': { bn: 'ঠিকানা সার্ভিস কাজ করছে না', en: 'Address service is not working' },

  'admin.needShopName': { bn: 'বিক্রেতা করতে হলে দোকানের নাম দিতে হবে', en: 'A shop name is required to make this account a vendor' },
  'admin.needTitleMessage': { bn: 'title এবং message দিতে হবে', en: 'title and message are required' },
} as const

export type MsgKey = keyof typeof dict

export function msg(req: Request, key: MsgKey, vars?: Record<string, string | number>): string {
  const lang = getLang(req)
  const entry = dict[key]
  let text = entry[lang] || entry.bn
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return text
}
