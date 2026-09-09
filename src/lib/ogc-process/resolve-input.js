/**
 * Resolve a single value from a source string.
 * Source format: "store:path" | "payload:path" | "processResult:path" | "static:value"
 */
export function resolveInputValue (source, context) {
  const i = source.indexOf(':')
  if (i === -1) return undefined
  const type = source.slice(0, i)
  const path = source.slice(i + 1)
  const pathParts = path.split('.')

  if (type === 'store') {
    const store = context.stores?.[pathParts[0]]
    return store ? get(pathParts.slice(1), store) : undefined
  }
  if (type === 'payload') return get(pathParts, context.payload)
  if (type === 'processResult') {
    const results = context.stores?.app?.processResults
    return results ? get(pathParts, results) : undefined
  }
  if (type === 'static') return path
  return undefined
}

function coerceProcessScalar (value) {
  if (value != null && typeof value === 'object' && !Array.isArray(value) && 'id' in value) {
    return value.id
  }
  return value
}

/**
 * Resolve process inputs from config for JSON execute bodies.
 * Objects shaped like SelectionList values `{ id, ... }` are reduced to `id`.
 *
 * @param {Array<{ id: string, source: string }>} inputs
 * @param {{ payload: object, stores: object }} context
 * @returns {Array<{ id: string, value: unknown }>}
 */
export function resolveInputs (inputs, context) {
  if (!Array.isArray(inputs)) return []
  const out = []
  for (const { id, source } of inputs) {
    if (!id || !source) continue
    const value = resolveInputValue(source, context)
    if (value === undefined || value === null) continue
    const scalar = coerceProcessScalar(value)
    if (scalar === undefined || scalar === null) continue
    out.push({ id, value: scalar })
  }
  return out
}

function get (pathParts, obj) {
  let cur = obj
  for (const key of pathParts) {
    if (cur == null) return undefined
    cur = cur[key]
  }
  return cur
}
