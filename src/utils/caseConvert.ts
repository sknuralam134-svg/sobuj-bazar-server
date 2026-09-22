function isPlainObject(v: any): boolean {
  return v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)
}

export function toSnakeCase(input: any): any {
  if (Array.isArray(input)) return input.map(toSnakeCase)
  if (isPlainObject(input)) {
    const out: Record<string, any> = {}
    for (const [key, value] of Object.entries(input)) {
      const snakeKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
      out[snakeKey] = toSnakeCase(value)
    }
    return out
  }
  return input
}

export function toCamelCase(input: any): any {
  if (Array.isArray(input)) return input.map(toCamelCase)
  if (isPlainObject(input)) {
    const out: Record<string, any> = {}
    for (const [key, value] of Object.entries(input)) {
      const camelKey = key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase())
      out[camelKey] = toCamelCase(value)
    }
    return out
  }
  return input
}
