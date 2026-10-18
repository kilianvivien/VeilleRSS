import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils/cn'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
  /** Classes du champ lui-même, pour l'aligner sur un contrôle voisin. */
  inputClassName?: string
}

/**
 * Search bar component with debouncing and clear button
 */
export function SearchBar({
  value,
  onChange,
  placeholder = 'Rechercher...',
  debounceMs = 300,
  className,
  inputClassName,
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value)

  // Sync with external value changes
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Debounced onChange
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue)
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [localValue, debounceMs, onChange, value])

  const handleClear = () => {
    setLocalValue('')
    onChange('')
  }

  return (
    <div className={className}>
      <div className="relative">
        <Input
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          placeholder={placeholder}
          leftIcon={<Search className="w-4 h-4 text-[var(--text-muted)]" />}
          className={cn('pr-10', inputClassName)}
        />
        {localValue && (
          <button
            onClick={handleClear}
            type="button"
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors sm:h-9 sm:w-9"
            aria-label="Effacer la recherche"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
