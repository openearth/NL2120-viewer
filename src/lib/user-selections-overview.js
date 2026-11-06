/**
 * Config-driven UserSelectionsOverview helpers.
 * Opt-in via workflow.json → userSelectionsOverview.
 */

import workflowConfig from '@/config/workflow.json'
import { resolveInputValue } from '@/lib/ogc-process/resolve-input'
import { formatAttributeValue, isBlank } from '@/lib/format-value'

function selectionId (value) {
  if (value != null && typeof value === 'object' && !Array.isArray(value) && 'id' in value) {
    return value.id
  }
  return value
}

function matchesWhen (when, context) {
  if (!when?.source) return true
  const id = selectionId(resolveInputValue(when.source, context))
  if (when.equals !== undefined) {
    return id != null && String(id) === String(when.equals)
  }
  return id !== undefined && id !== null && id !== ''
}

/** From `store:app.selections.foo` → `foo`. */
function selectionKeyFromSource (source) {
  if (!source || typeof source !== 'string') return null
  const prefix = 'store:app.selections.'
  if (!source.startsWith(prefix)) return null
  return source.slice(prefix.length).split('.')[0] || null
}

function findOptionsBySelectionKey (selectionKey, config = workflowConfig) {
  if (!selectionKey) return []
  for (const step of config.steps || []) {
    for (const comp of step.components || []) {
      if (comp?.componentProps?.selectionKey === selectionKey) {
        return Array.isArray(comp.componentProps.options)
          ? comp.componentProps.options
          : []
      }
    }
  }
  return []
}

function formatOverviewValue (raw, display, item, config = workflowConfig) {
  if (display?.type === 'optionLabel') {
    const id = selectionId(raw)
    if (id == null || id === '') {
      return { displayValue: '', blank: true }
    }
    const options = Array.isArray(display.options) && display.options.length
      ? display.options
      : findOptionsBySelectionKey(
        display.selectionKey || selectionKeyFromSource(item.source),
        config,
      )
    const match = options.find(o => o.id === id)
    return {
      displayValue: match?.name != null ? String(match.name) : String(id),
      blank: false,
    }
  }

  return formatAttributeValue(raw, display || null)
}

/**
 * Build visible overview rows from config + stores.
 * @returns {{ id: string, label: string, displayValue: string }[]}
 */
export function resolveOverviewRows (overviewConfig, context, {
  completedSteps = [],
  config = workflowConfig,
} = {}) {
  if (!overviewConfig?.enabled || !Array.isArray(overviewConfig.items)) {
    return []
  }

  const rows = []
  for (const item of overviewConfig.items) {
    if (!item?.label || !item?.source) continue
    if (item.visibleAfterStep && !completedSteps.includes(item.visibleAfterStep)) {
      continue
    }
    if (!matchesWhen(item.when, context)) continue

    const formatted = formatOverviewValue(
      resolveInputValue(item.source, context),
      item.display || null,
      item,
      config,
    )
    if (formatted.blank || isBlank(formatted.displayValue)) continue

    rows.push({
      id: item.id || item.source,
      label: item.label,
      displayValue: formatted.displayValue,
    })
  }
  return rows
}

/** Persist a formatted region string in app.selections (not live activeRegion). */
export function commitRegionSummary (overviewConfig, context, properties) {
  const cfg = overviewConfig?.regionSummary
  if (!cfg?.selectionKey || !properties || typeof properties !== 'object') {
    return false
  }

  const variants = Array.isArray(cfg.variants) ? cfg.variants : []
  const variant = variants.find(v => matchesWhen(v.when, context)) || null
  if (!variant?.attributes?.length) {
    context.stores?.app?.setSelection(cfg.selectionKey, null)
    return false
  }

  const separator = variant.separator ?? '; '
  const parts = variant.attributes
    .map(attr => properties[attr])
    .filter(v => v != null && String(v).trim() !== '')
    .map(v => String(v).trim())

  const text = parts.join(separator)
  context.stores?.app?.setSelection(cfg.selectionKey, text || null)
  return Boolean(text)
}
