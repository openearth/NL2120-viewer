import workflowConfig from '@/config/workflow.json'

/** Find a layer entry from workflow.json LayerList configs by id. */
export function findWorkflowLayer (layerId) {
  if (!layerId) return null

  for (const step of workflowConfig.steps ?? []) {
    for (const component of step.components ?? []) {
      if (component.component !== 'LayerList') continue
      const layer = component.componentProps?.layers?.find(l => l.id === layerId)
      if (layer) return layer
    }
  }

  return null
}
