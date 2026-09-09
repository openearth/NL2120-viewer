/**
 * Processes response data according to output action definitions from workflow.json.
 *
 * Supported actions:
 *   - storeValue: saves a value (or sub-path of response) into appStore.processResults
 *   - addLayer:   adds a dynamic layer to the map via mapStore
 *   - removeLayer: removes a dynamic layer that was previously added
 *
 * Viewer-style payloads: array of `{ folder, contents: [{ name, layer, url }] }` or a single folder object.
 *
 * @param {Array<OutputAction>} actions
 * @param {Object} response
 * @param {{ app: object, map: object }} stores
 * @param {{ previousResultsByKey?: Record<string, unknown> }} [options] - for removeLayer when storeResultAs overwrites the same key before actions run
 *
 * @typedef {Object} OutputAction
 * @property {'storeValue'|'addLayer'|'removeLayer'} action
 * @property {string} [path] - Dot path into response; omit or "response" for full body
 * @property {string} [storeAs] - storeValue: key under processResults
 * @property {Object} [layerConfig] - addLayer: extra args for addDynamicLayer
 * @property {string} [fromResultKey] - removeLayer: key in processResults (previous snapshot preferred)
 */
export function handleOutputActions (actions, response, stores, options = {}) {
  if (!actions?.length || !response) return

  const { previousResultsByKey = {} } = options

  for (const action of actions) {
    switch (action.action) {
      case 'storeValue': {
        const value = resolvePath(response, action.path)
        if (action.storeAs && stores.app) {
          setNestedValue(stores.app.processResults, action.storeAs, value)
        }
        break
      }

      case 'addLayer': {
        const value = resolvePath(response, action.path)
        if (!value || !stores.map?.addDynamicLayer) break
        forEachLayerOutputEntry(value, (entry) => {
          if (entry?.layer && entry?.url) {
            stores.map.addDynamicLayer({
              id: entry.layer,
              name: entry.name || entry.layer,
              layer: entry.layer,
              url: entry.url,
              ...(action.layerConfig || {}),
            })
          }
        })
        break
      }

      case 'removeLayer': {
        const { fromResultKey } = action
        const previousResult = fromResultKey
          ? (previousResultsByKey[fromResultKey] ?? stores.app?.processResults?.[fromResultKey])
          : null

        if (!stores.map?.removeDynamicLayer || !previousResult) break

        const value = resolvePath(previousResult, action.path)
        if (!value) break
        forEachLayerOutputEntry(value, (entry) => {
          if (entry?.layer) {
            stores.map.removeDynamicLayer(entry.layer)
          }
        })
        break
      }

      default:
        console.warn(`[handleOutputActions] Unknown action: "${ action.action }"`)
    }
  }
}

/** Iterate GeoServer viewer output: folder list or single folder / entry. */
function forEachLayerOutputEntry (value, fn) {
  const folders = Array.isArray(value) ? value : [ value ]
  for (const folder of folders) {
    const entries = folder?.contents ?? [ folder ]
    for (const entry of entries) {
      fn(entry)
    }
  }
}

function resolvePath (obj, path) {
  if (!path || path === 'response') return obj

  const cleanPath = path.startsWith('response.') ? path.slice(9) : path
  return cleanPath.split('.').reduce((o, key) => o?.[key], obj)
}

function setNestedValue (obj, path, value) {
  const parts = path.split('.')
  let current = obj

  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] == null) {
      current[parts[i]] = {}
    }
    current = current[parts[i]]
  }

  current[parts[parts.length - 1]] = value
}
