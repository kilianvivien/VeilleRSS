import { cn } from '@/lib/utils/cn'

interface LoadingSpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Animated loading spinner component
 * Uses CSS-only animation for performance
 */
export function LoadingSpinner({ className, size = 'md' }: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]',
        {
          'h-4 w-4': size === 'sm',
          'h-5 w-5': size === 'md',
          'h-8 w-8': size === 'lg',
        },
        className
      )}
      role="status"
    >
      <span className="sr-only">Chargement...</span>
    </div>
  )
}
