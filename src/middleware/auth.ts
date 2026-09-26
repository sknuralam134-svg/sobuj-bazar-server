import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { msg } from '../lib/i18n'

export type AuthUser = { id: string; role: string; email: string }

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET as string

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '30d' })
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, JWT_SECRET) as AuthUser
}

/** Requires a valid JWT. Attaches req.user or responds 401. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: msg(req, 'auth.loginRequired') })
  }
  try {
    req.user = verifyToken(header.slice(7))
    next()
  } catch {
    return res.status(401).json({ error: msg(req, 'auth.sessionExpired') })
  }
}

/** Attaches req.user if a valid JWT is present, but doesn't require one. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyToken(header.slice(7))
    } catch {
      // ignore invalid/expired token for optional auth
    }
  }
  next()
}

/** Restricts a route to one or more roles. Use after requireAuth. */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: msg(req, 'auth.noPermission') })
    }
    next()
  }
}
