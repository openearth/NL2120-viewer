import axios from 'axios'

/**
 * Sends an OGC API Processes execute request using JSON.
 *
 * @param {Object} config
 * @param {string} config.baseUrl - pygeoapi root URL (e.g. http://localhost:5000)
 * @param {string} config.identifier - Process identifier (e.g. 'lare-uom')
 * @param {Array<Object>} [config.inputs] - List of input parameters
 * @returns {Promise<Object>} Parsed response data
 */
export default function sendProcessRequest ({
  baseUrl,
  identifier,
  inputs = [],
}) {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '')
  const url = `${ cleanBaseUrl }/processes/${ identifier }/execution?f=json`
  const resolvedInputs = {}

  for (const input of inputs) {
    if (!input?.id) continue
    resolvedInputs[input.id] = input.value
  }

  return axios.post(url, {
    inputs: resolvedInputs,
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  }).then(({ data }) => data)
}
