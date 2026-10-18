import { Plus } from 'lucide-react'

/** Même action et même cible tactile dans le rail et le tiroir mobile. */
export function AddSourcesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-muted)] px-2.5 text-[13px] font-medium text-[var(--link)] transition-colors hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] active:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
    >
      <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Ajouter des sources</span>
    </button>
  )
}
