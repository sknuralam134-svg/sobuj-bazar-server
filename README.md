# সবুজ বাজার — Backend Server

Express + Prisma + PostgreSQL ব্যাকএন্ড, Supabase-এর বিকল্প হিসেবে বানানো। JWT-ভিত্তিক
auth, ইমেইল OTP ভেরিফিকেশন, প্রোডাক্ট/কার্ট/অর্ডার/নোটিফিকেশন API, admin panel API, এবং
Socket.io দিয়ে রিয়েল-টাইম নোটিফিকেশন — সবই আছে।

## ১. লোকাল সেটআপ

```bash
npm install
cp .env.example .env   # তারপর .env এ আসল মান বসান
npx prisma migrate dev --name init
npm run seed            # একটা admin অ্যাকাউন্ট তৈরি করে
npm run dev
```

সার্ভার চালু হবে `http://localhost:4000` এ। `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
(অথবা ডিফল্ট `admin@sobujbazar.com` / `ChangeMe123!`) দিয়ে লগইন করে **প্রথম কাজেই
পাসওয়ার্ড বদলে ফেলুন**।

## ২. Render-এ ডিপ্লয় করা

1. [render.com](https://render.com) এ লগইন করুন, **New + → PostgreSQL** দিয়ে একটা
   Postgres ডেটাবেস বানান। তৈরি হওয়ার পর ওর **Internal Database URL** কপি করে রাখুন।
2. **New + → Web Service** দিয়ে এই GitHub repo (`sobuj-bazar-server`) কানেক্ট করুন।
3. সেটআপে দিন — **Build Command**: `npm install && npm run build`
   **Start Command**: `npm start`
4. **Environment** ট্যাবে গিয়ে env var যোগ করুন: `DATABASE_URL` (ধাপ ১-এর URL),
   `JWT_SECRET`, `FRONTEND_URL`, `SMTP_HOST/PORT/USER/PASS/FROM`।
5. ডিপ্লয় হওয়ার পর, Render dashboard-এ সার্ভিস খুলে **Shell** ট্যাব থেকে একবার চালান:
   ```bash
   npx prisma migrate deploy
   npm run seed
   ```

Railway-তেও প্রায় একইভাবে কাজ করে: New Project → GitHub repo + Postgres প্লাগইন,
Build command `npm run build`, Start command `npm start`।

## ৩. ফ্রন্টএন্ড কানেক্ট করা

React অ্যাপে একটা `.env` ভ্যারিয়েবল যোগ করুন:
```
VITE_API_URL=https://your-server.onrender.com
```
এরপর `src/lib/supabase.ts`, `src/lib/auth.tsx`, `src/lib/cart.tsx`,
`src/lib/notifications.tsx` এবং প্রতিটা পেজ যেখানে `supabase.from(...)` কল আছে,
সেগুলো এই নতুন REST API (fetch/axios দিয়ে) ও Socket.io ক্লায়েন্ট ব্যবহার করে
নতুন করে লিখতে হবে। এটা একটা বড় আলাদা ধাপ — সার্ভারটা ডিপ্লয় হয়ে গেলে বলবেন,
আমি ফ্রন্টএন্ডের ডেটা-লেয়ারটা এই API-এর সাথে সংযুক্ত করে দেব।

## API সংক্ষেপ

| রুট | মেথড | বিবরণ |
|---|---|---|
| `/auth/register` | POST | সাইন আপ, OTP ইমেইল পাঠায় |
| `/auth/verify-otp` | POST | OTP যাচাই, JWT ফেরত দেয় |
| `/auth/resend-otp` | POST | নতুন OTP পাঠায় |
| `/auth/login` | POST | লগইন, JWT ফেরত দেয় |
| `/auth/forgot-password` | POST | রিসেট ইমেইল পাঠায় |
| `/auth/reset-password` | POST | নতুন পাসওয়ার্ড সেট করে |
| `/auth/me` | GET | নিজের প্রোফাইল দেখে (auth) |
| `/auth/account` | DELETE | অ্যাকাউন্ট মুছে ফেলে (auth) |
| `/products` | GET | পাবলিক লিস্ট, `?lat=&lng=` দিলে ডেলিভারি এলাকা ফিল্টার হয় |
| `/products/:id` | GET | একটা প্রোডাক্টের বিস্তারিত |
| `/products/vendor/mine` | GET | নিজের প্রোডাক্ট (vendor) |
| `/products` | POST/PUT/DELETE | প্রোডাক্ট তৈরি/এডিট/মোছা (vendor/admin) |
| `/categories` | GET/POST/PUT/DELETE | ক্যাটাগরি |
| `/cart` | GET/POST/PATCH/DELETE | কার্ট ম্যানেজমেন্ট (auth) |
| `/orders` | POST | চেকআউট (auth) |
| `/orders/mine` | GET | নিজের অর্ডার (buyer) |
| `/orders/vendor` | GET | পাওয়া অর্ডার (vendor) |
| `/orders/:id/status` | PATCH | অর্ডার স্ট্যাটাস বদলানো (vendor/admin) |
| `/notifications` | GET/PATCH | নোটিফিকেশন |
| `/admin/users` | GET/PATCH | ইউজার ও রোল ম্যানেজমেন্ট (admin) |
| `/admin/stats` | GET | ড্যাশবোর্ড স্ট্যাট (admin) |
| `/profile` | PUT | নিজের প্রোফাইল/দোকানের লোকেশন আপডেট (auth) |
| `/settings` | GET/PUT | সাইট সেটিংস (পাবলিক পড়া, admin লেখা) |

Socket.io ইভেন্ট: ক্লায়েন্ট `io(SERVER_URL, { auth: { token } })` দিয়ে কানেক্ট করলে
`notification:new` ইভেন্ট শুনতে পারবে (নতুন অর্ডার/স্ট্যাটাস পরিবর্তনের সময় পাঠানো হয়)।
