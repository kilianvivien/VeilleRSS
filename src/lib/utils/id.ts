export function generateId(prefix: string = 'id'): string {
  const now = Date.now()
  const rand = Math.random().toString(36).substr(2, 9)
  return `${prefix}-${now}-${rand}`
}
