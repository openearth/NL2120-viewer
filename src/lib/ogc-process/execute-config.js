import sendProcessRequest from '@/lib/ogc-process'
import { resolveInputs } from '@/lib/ogc-process/resolve-input'
import { handleOutputActions } from '@/lib/ogc-process/handle-output'

/**
 * Execute a process request from a workflow config (workflow.json process object).
 *
 * @param {Object} processConfig - identifier, inputs, storeResultAs, outputActions
 * @param {Object} context
 * @param {Object} [context.payload={}]
 * @param {Object} context.appStore
 * @param {Object} context.mapStore
 * @returns {Promise<Object>} Parsed process response
 */
export async function executeProcessConfig (processConfig, { payload = {}, appStore, mapStore }) {
  const baseUrl = import.meta.env.VITE_OGC_API_URL ?? import.meta.env.VITE_WPS_BASE_URL
  const { identifier, outputActions, storeResultAs } = processConfig
  const stores = { app: appStore, map: mapStore }
  const context = { payload, stores }

  const inputs = resolveInputs(processConfig.inputs ?? [], context)
  const result = await sendProcessRequest({
    baseUrl,
    identifier,
    inputs,
  })

  const previousResultsByKey = snapshotProcessResultsForRemoveActions(
    outputActions,
    appStore.processResults,
  )

  if (storeResultAs) {
    appStore.setProcessResult(storeResultAs, result)
  }
  if (outputActions?.length) {
    handleOutputActions(outputActions, result, stores, { previousResultsByKey })
  }

  return result
}

function snapshotProcessResultsForRemoveActions (outputActions, processResults) {
  const out = {}
  if (!Array.isArray(outputActions) || !processResults) return out
  for (const action of outputActions) {
    if (action?.action !== 'removeLayer' || !action.fromResultKey) continue
    const key = action.fromResultKey
    if (out[key] === undefined && processResults[key] != null) {
      out[key] = processResults[key]
    }
  }
  return out
}
