function isDecimalLike(v: any): boolean {
  return v !== null && typeof v === 'object' && typeof v.toNumber === 'function'
}

function isPlainObject(v: any): boolean {
  return (
    v !== null &&
    typeof v === 'object' &&
    !(v instanceof Date) &&
    !Array.isArray(v) &&
    !isDecimalLike(v)
  )
}

function normalizeValue(v: any): any {
  // Prisma's Decimal (used for money fields) serializes to a string by
  // default. The frontend expects numbers, so convert it up front.
  return isDecimalLike(v) ? v.toNumber() : v
}

export function toSnakeCase(input: any): any {
  const value = normalizeValue(input)
  if (Array.isArray(value)) return value.map(toSnakeCase)
  if (isPlainObject(value)) {
    const out: Record<string, any> = {}
    for (const [key, val] of Object.entries(value)) {
      const snakeKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
      out[snakeKey] = toSnakeCase(val)
    }
    return out
  }
  return value
}

export function toCamelCase(input: any): any {
  const value = normalizeValue(input)
  if (Array.isArray(value)) return value.map(toCamelCase)
  if (isPlainObject(value)) {
    const out: Record<string, any> = {}
    for (const [key, val] of Object.entries(value)) {
      const camelKey = key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase())
      out[camelKey] = toCamelCase(val)
    }
    return out
  }
  return value
}
