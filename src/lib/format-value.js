/**
 * Config-driven value formatting for FeatureInfoPanel and similar UI.
 *
 * format: { type: 'number'|'list'|'lookup'|'text', ... }
 */

import clcLookup from '@/config/lookups/clc.json'

const LOOKUPS = {
  clc: clcLookup,
}

export function isBlank (value) {
  if (value == null) return true
  if (typeof value === 'string') return value.trim().length === 0
  return false
}

export function toDisplayString (value) {
  return typeof value === 'string' ? value.trim() : String(value)
}

export function toHref (value) {
  const text = toDisplayString(value)
  if (/^https?:\/\//i.test(text)) return text
  if (/^www\./i.test(text)) return `https://${ text }`
  return null
}

/**
 * @param {unknown} raw
 * @param {object|null} format
 * @param {{ emptyValue?: string }} [options]
 * @returns {{ displayValue: string, href: string|null, blank: boolean }}
 */
export function formatAttributeValue (raw, format = null, options = {}) {
  const emptyValue = options.emptyValue ?? '—'
  const blank = isBlank(raw)
  if (blank) {
    return { displayValue: emptyValue, href: null, blank: true }
  }

  if (!format || !format.type || format.type === 'text') {
    const text = toDisplayString(raw)
    return { displayValue: text, href: toHref(text), blank: false }
  }

  if (format.type === 'list') {
    const delimiter = format.delimiter || ';'
    const join = format.join || ', '
    const parts = String(raw)
      .split(delimiter)
      .map(s => s.trim())
      .filter(Boolean)
    return {
      displayValue: parts.length ? parts.join(join) : emptyValue,
      href: null,
      blank: parts.length === 0,
    }
  }

  if (format.type === 'number') {
    const scale = format.scale ?? 1
    const decimals = format.decimals ?? 0
    const num = Number(raw) * scale
    if (!Number.isFinite(num)) {
      return { displayValue: emptyValue, href: null, blank: true }
    }
    const formatted = num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    const unit = format.unit ? ` ${ format.unit }` : ''
    return { displayValue: `${ formatted }${ unit }`, href: null, blank: false }
  }

  if (format.type === 'lookup') {
    const table = LOOKUPS[format.lookup] || format.table || {}
    const key = String(raw).trim()
    const label = table[key] ?? table[Number(key)] ?? key
    return { displayValue: String(label), href: null, blank: false }
  }

  return { displayValue: toDisplayString(raw), href: null, blank: false }
}

/**
 * Expand a template attribute name with a repeat token, e.g. nbs_list_{n} + 2 → nbs_list_2
 */
export function expandAttributeTemplate (template, token, index) {
  if (!template) return template
  return String(template).split(`{${ token }}`).join(String(index))
}
