import type { ReactNode } from 'react'
import { AlertCircle, HelpCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'

export type AlertType = 'info' | 'success' | 'warning' | 'error' | 'tip'

interface AlertProps {
  type: AlertType
  title?: string
  children: ReactNode
  className?: string
}

const alertConfig = {
  info: {
    bgLight: 'bg-blue-50',
    bgDark: 'dark:bg-blue-900/20',
    borderLight: 'border-blue-200',
    borderDark: 'dark:border-blue-800',
    textLightColor: '#1e40af', // blue-800
    iconLightColor: '#3b82f6', // blue-500
    textDark: 'dark:text-blue-200',
    iconDark: 'dark:text-blue-400',
    icon: HelpCircle,
  },
  success: {
    bgLight: 'bg-green-50',
    bgDark: 'dark:bg-green-900/20',
    borderLight: 'border-green-200',
    borderDark: 'dark:border-green-800',
    textLightColor: '#166534', // green-800
    iconLightColor: '#22c55e', // green-500
    textDark: 'dark:text-green-200',
    iconDark: 'dark:text-green-400',
    icon: CheckCircle2,
  },
  warning: {
    bgLight: 'bg-amber-50',
    bgDark: 'dark:bg-amber-900/20',
    borderLight: 'border-amber-200',
    borderDark: 'dark:border-amber-800',
    textLightColor: '#92400e', // amber-800
    iconLightColor: '#f59e0b', // amber-500
    textDark: 'dark:text-amber-100',
    iconDark: 'dark:text-amber-500',
    icon: AlertTriangle,
  },
  error: {
    bgLight: 'bg-red-50',
    bgDark: 'dark:bg-red-900/20',
    borderLight: 'border-red-200',
    borderDark: 'dark:border-red-800',
    textLightColor: '#991b1b', // red-800
    iconLightColor: '#ef4444', // red-500
    textDark: 'dark:text-red-200',
    iconDark: 'dark:text-red-500',
    icon: AlertCircle,
  },
  tip: {
    bgLight: 'bg-orange-50',
    bgDark: 'dark:bg-orange-900/20',
    borderLight: 'border-orange-200',
    borderDark: 'dark:border-orange-800',
    textLightColor: '#9a3412', // orange-800
    iconLightColor: '#f97316', // orange-500
    textDark: 'dark:text-orange-200',
    iconDark: 'dark:text-orange-500',
    icon: Info,
  },
}

export function Alert({ type, title, children, className = '' }: AlertProps) {
  const config = alertConfig[type]
  const Icon = config.icon
  const { theme } = useSettingsStore()

  // Determine if dark mode is active
  const isDarkMode =
    theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <div
      className={`flex gap-3 p-4 rounded-lg border ${config.bgLight} ${config.bgDark} ${config.borderLight} ${config.borderDark} ${className}`}
    >
      <Icon
        className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconDark}`}
        style={!isDarkMode ? { color: config.iconLightColor } : undefined}
      />
      <div
        className={`text-sm ${config.textDark}`}
        style={!isDarkMode ? { color: config.textLightColor } : undefined}
      >
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-1' : ''}>{children}</div>
      </div>
    </div>
  )
}
