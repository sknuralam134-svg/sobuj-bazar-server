import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import { verifyToken } from './middleware/auth'
import { toCamelCase, toSnakeCase } from './utils/caseConvert'

import authRoutes from './routes/auth.routes'
import productRoutes from './routes/products.routes'
import categoryRoutes from './routes/categories.routes'
import cartRoutes from './routes/cart.routes'
import orderRoutes from './routes/orders.routes'
import notificationRoutes from './routes/notifications.routes'
import adminRoutes from './routes/admin.routes'
import profileRoutes from './routes/profile.routes'
import settingsRoutes from './routes/settings.routes'
import geoRoutes from './routes/geo.routes'

const app = express()
const server = http.createServer(app)

const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map((s) => s.trim()).filter(Boolean)

const io = new Server(server, {
  cors: { origin: allowedOrigins.length ? allowedOrigins : '*' },
})

// Socket authentication: clients connect with `auth: { token }`.
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) return next()
    const user = verifyToken(token)
    socket.data.userId = user.id
    next()
  } catch {
    next()
  }
})

io.on('connection', (socket) => {
  if (socket.data.userId) {
    socket.join(`user:${socket.data.userId}`)
  }
})

app.set('io', io)

app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : '*' }))
app.use(express.json())

// Keep the API compatible with the frontend's snake_case fields while Prisma
// models use camelCase internally.
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = toCamelCase(req.body)
  }
  next()
})

app.use((_req, res, next) => {
  const originalJson = res.json.bind(res)
  res.json = ((body: any) => originalJson(toSnakeCase(body))) as typeof res.json
  next()
})

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/auth', authRoutes)
app.use('/products', productRoutes)
app.use('/categories', categoryRoutes)
app.use('/cart', cartRoutes)
app.use('/orders', orderRoutes)
app.use('/notifications', notificationRoutes)
app.use('/admin', adminRoutes)
app.use('/profile', profileRoutes)
app.use('/settings', settingsRoutes)
app.use('/geo', geoRoutes)

// Central error handler — keeps error shapes consistent across routes.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'সার্ভার এরর হয়েছে' })
})

const PORT = process.env.PORT || 4000
server.listen(PORT, () => {
  console.log(`সবুজ বাজার API চলছে পোর্ট ${PORT}-এ`)
})
