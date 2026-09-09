/**
 * True when a workflow selection value is unset (null, empty string, or object without id).
 */
export function isSelectionMissing (value) {
  if (value == null) return true
  if (typeof value === 'string') return value === ''
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return value.id == null || value.id === ''
  }
  return false
}
