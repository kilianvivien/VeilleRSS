export function assertNever(value: never, context: string): never {
  throw new Error(`Unhandled case in ${context}: ${String(value)}`)
}
