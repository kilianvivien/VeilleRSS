import '@testing-library/jest-dom/vitest'

class PassiveIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]

  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  unobserve() {}
}

Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  writable: true,
  value: PassiveIntersectionObserver,
})

/**
 * jsdom n'implémente ni la mise en page ni la capture de pointeur : les appels
 * y sont absents du prototype et lèveraient une `TypeError`. Des bouchons
 * inertes suffisent — ce qui compte sous test, ce sont les gestes déclenchés,
 * pas les pixels parcourus.
 */
Element.prototype.scrollIntoView ??= function scrollIntoView() {}
Element.prototype.setPointerCapture ??= function setPointerCapture() {}
Element.prototype.releasePointerCapture ??= function releasePointerCapture() {}
Element.prototype.hasPointerCapture ??= function hasPointerCapture() {
  return false
}
