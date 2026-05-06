/**
 * Processes response data according to output action definitions
 * from workflow.json.
 *
 * Supported actions:
 *   - storeValue: saves a value (or sub-path of response) into appStore.processResults
 *   - addLayer:   adds a dynamic layer to the map via mapStore
 *   - removeLayer: removes a dynamic layer that was previously added
 *
 * @param {Array<OutputAction>} actions - Output action definitions from config
 * @param {Object} response - The parsed process response
 * @param {Object} stores - { app: appStore, map: mapStore }
 *
 * @typedef {Object} OutputAction
 * @property {'storeValue'|'addLayer'} action
 * @property {string} [path]        - Dot-notated path into the response (omit or "response" for full response)
 * @property {string} [storeAs]     - For storeValue: key under processResults to store into
 * @property {Object} [layerConfig] - For addLayer: layer configuration
 * @property {string} [fromResultKey]  - For removeLayer: key in appStore.wpsResults to resolve layers from
 */
export function handleOutputActions (actions, response, stores) {
  if (!actions?.length || !response) return

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
        const folders = Array.isArray(value) ? value : [ value ]
        for (const folder of folders) {
          const entries = folder?.contents ?? [ folder ]
          for (const entry of entries) {
            if (entry?.layer && entry?.url) {
              stores.map.addDynamicLayer({
                id: entry.layer,
                name: entry.name || entry.layer,
                layer: entry.layer,
                url: entry.url,
                ...(action.layerConfig || {}),
              })
            }
          }
        }
        break
      }

      case 'removeLayer': {
        const { fromResultKey } = action
        const previousResult = fromResultKey && stores.app?.wpsResults
          ? stores.app.wpsResults[fromResultKey]
          : null

        // If we cannot resolve a previous result or the path,
        // fall back to clearing all dynamic layers.
        if (!stores.map?.removeDynamicLayer) break

        if (previousResult) {
          const value = resolvePath(previousResult, action.path)
          if (value) {
            const folders = Array.isArray(value) ? value : [ value ]
            for (const folder of folders) {
              const entries = folder?.contents ?? [ folder ]
              for (const entry of entries) {
                if (entry?.layer) {
                  stores.map.removeDynamicLayer(entry.layer)
                }
              }
            }
            break
          }
        }

        // Fallback: remove all dynamic layers (those not in the static config)
        if (stores.map?.clearDynamicLayers) {
          stores.map.clearDynamicLayers()
        }
        break
      }

      default:
        console.warn(`[handleOutputActions] Unknown action: "${ action.action }"`)
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
