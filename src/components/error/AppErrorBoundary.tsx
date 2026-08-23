import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AppCrashScreen } from './AppCrashScreen'
import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('error-boundary')

interface AppErrorBoundaryState {
  error: Error | null
}

/**
 * Dernier rempart avant l'écran blanc.
 *
 * Une erreur levée pendant le rendu — y compris l'import d'un volet paresseux
 * — démonte tout l'arbre React : sans limite d'erreur, l'utilisateur se
 * retrouve devant une page vide, sans le moindre moyen de s'en sortir.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('Rendu interrompu par une erreur non rattrapée', error, info.componentStack)
  }

  private handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return <AppCrashScreen error={this.state.error} onRetry={this.handleRetry} />
    }
    return this.props.children
  }
}
