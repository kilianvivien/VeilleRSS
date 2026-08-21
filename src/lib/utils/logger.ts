export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

const DEFAULT_LEVEL: LogLevel = import.meta.env.PROD ? 'warn' : 'debug'

function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[minLevel]
}

function stringifyMeta(meta: unknown[]): unknown[] {
  if (!meta.length) return []
  return meta
}

export interface Logger {
  error: (message: string, ...meta: unknown[]) => void
  warn: (message: string, ...meta: unknown[]) => void
  info: (message: string, ...meta: unknown[]) => void
  debug: (message: string, ...meta: unknown[]) => void
}

export function createLogger(scope: string, minLevel: LogLevel = DEFAULT_LEVEL): Logger {
  const prefix = `[${scope}]`

  return {
    error: (message, ...meta) => {
      if (shouldLog('error', minLevel)) {
        console.error(prefix, message, ...stringifyMeta(meta))
      }
    },
    warn: (message, ...meta) => {
      if (shouldLog('warn', minLevel)) {
        console.warn(prefix, message, ...stringifyMeta(meta))
      }
    },
    info: (message, ...meta) => {
      if (shouldLog('info', minLevel)) {
        console.info(prefix, message, ...stringifyMeta(meta))
      }
    },
    debug: (message, ...meta) => {
      if (shouldLog('debug', minLevel)) {
        console.debug(prefix, message, ...stringifyMeta(meta))
      }
    },
  }
}
