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

/**
 * Resolve process inputs from config.
 * @param {Array} inputs - [{ id, source }, ...]
 * @param {Object} context - { payload, stores }
 * @returns {Array} [{ id, value }, ...] for sendProcessRequest
 */
export function resolveInputs (inputs, context) {
  if (!Array.isArray(inputs)) return []
  const out = []
  for (const { id, source } of inputs) {
    if (!id || !source) continue
    const value = resolveInputValue(source, context)
    if (value === undefined || value === null) continue
    out.push({ id, value })
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
