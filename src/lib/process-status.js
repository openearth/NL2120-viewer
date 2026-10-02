/**
 * process.loadingIndicator: "drawer" | "button" | "both" (default "drawer").
 * Errors always use the SubMenu drawer (Retry). Button mode is for component triggers.
 */

const VALID = new Set([ 'drawer', 'button', 'both' ])

export function resolveLoadingIndicator (processConfig) {
  const raw = processConfig?.loadingIndicator
  return typeof raw === 'string' && VALID.has(raw) ? raw : 'drawer'
}

export function showDrawerLoading (processConfig) {
  const mode = resolveLoadingIndicator(processConfig)
  return mode === 'drawer' || mode === 'both'
}

export function showButtonLoading (processConfig) {
  const mode = resolveLoadingIndicator(processConfig)
  return mode === 'button' || mode === 'both'
}
