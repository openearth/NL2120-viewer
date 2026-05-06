import sendProcessRequest from '@/lib/ogc-process'
import { resolveInputs } from '@/lib/ogc-process/resolve-input'
import { handleOutputActions } from '@/lib/ogc-process/handle-output'

/**
 * Execute a process request from a workflow config (workflow.json process object).
 *
 * @param {Object} processConfig - Process config from workflow (identifier, inputs, storeResultAs, outputActions)
 * @param {Object} context
 * @param {Object} [context.payload={}] - Payload for resolving inputs (e.g. from step completion)
 * @param {Object} context.appStore - Pinia app store
 * @param {Object} context.mapStore - Pinia map store
 * @returns {Promise<Object>} The parsed process response
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

  if (storeResultAs) {
    appStore.setProcessResult(storeResultAs, result)
  }
  if (outputActions?.length) {
    handleOutputActions(outputActions, result, stores)
  }

  return result
}
