<template>
  <div />
</template>

<script setup>
  import { useMap } from '@studiometa/vue-mapbox-gl'
  import { watch, unref, onBeforeUnmount } from 'vue'
  import bbox from '@turf/bbox'
  import { useMapStore } from '@/stores/map'
  import { findWorkflowLayer } from '@/lib/find-workflow-layer'
  import {
    buildRelatedGeometryFilter,
    buildRelatedGeometryWfsUrl,
    resolveRelatedGeometryLayerIds,
  } from '@/lib/related-geometry'

  const props = defineProps({
    padding: { type: Number, default: 100 },
    maxZoom: { type: Number, default: 12 },
  })

  const { map } = useMap()
  const mapStore = useMapStore()

  let activeRelatedLayerIds = []
  let lastJoinKey = null
  let lastFitJoinValue = null

  function hideRelatedLayers (layerIds) {
    for (const layerId of layerIds) {
      mapStore.setLayerVisibility(layerId, false)
      mapStore.setLayerFilter(layerId, null)
    }
  }

  function showRelatedLayers (layerIds, filter) {
    for (const layerId of layerIds) {
      mapStore.setLayerFilter(layerId, filter)
      mapStore.setLayerVisibility(layerId, true)
    }
  }

  function clearRelatedGeometry () {
    if (activeRelatedLayerIds.length) {
      hideRelatedLayers(activeRelatedLayerIds)
      activeRelatedLayerIds = []
    }
    lastJoinKey = null
    lastFitJoinValue = null
  }

  function getJoinValue (region, sourceAttribute) {
    return region?.properties?.[sourceAttribute] ?? region?.feature?.id
  }

  /**
   * Collect join values to show: selection always; hover when enabled
   * (alone, or alongside selection if showOnHoverWithSelection).
   */
  function resolveDisplayContext () {
    const selected = mapStore.activeRegion
    const hovered = mapStore.hoveredFeature
    const selectedConfig = selected?.layerId
      ? findWorkflowLayer(selected.layerId)?.relatedGeometry
      : null
    const hoveredConfig = hovered?.layerId
      ? findWorkflowLayer(hovered.layerId)?.relatedGeometry
      : null

    if (selectedConfig) {
      const sourceAttribute = selectedConfig.sourceAttribute || 'fid'
      const joinValues = []
      const selectedJoin = getJoinValue(selected, sourceAttribute)
      if (selectedJoin != null && selectedJoin !== '') {
        joinValues.push(selectedJoin)
      }

      const allowHoverAlongside =
        selectedConfig.showOnHover === true &&
        selectedConfig.showOnHoverWithSelection === true &&
        hoveredConfig?.showOnHover === true &&
        hovered?.layerId

      if (allowHoverAlongside) {
        const hoverJoin = getJoinValue(hovered, hoveredConfig.sourceAttribute || 'fid')
        if (hoverJoin != null && hoverJoin !== '' && String(hoverJoin) !== String(selectedJoin)) {
          // Only combine when both point at the same related geometry layer
          if (hoveredConfig.layerId === selectedConfig.layerId) {
            joinValues.push(hoverJoin)
          }
        }
      }

      if (!joinValues.length) return null

      return {
        relatedGeometry: selectedConfig,
        joinValues,
        fitBoundsRegion: selected,
        fitBoundsJoinValue: selectedJoin,
      }
    }

    if (hoveredConfig?.showOnHover) {
      const sourceAttribute = hoveredConfig.sourceAttribute || 'fid'
      const hoverJoin = getJoinValue(hovered, sourceAttribute)
      if (hoverJoin == null || hoverJoin === '') return null

      return {
        relatedGeometry: hoveredConfig,
        joinValues: [ hoverJoin ],
        fitBoundsRegion: null,
        fitBoundsJoinValue: null,
      }
    }

    return null
  }

  function zoomToGeojson (geojson) {
    const mapInstance = unref(map)
    if (!mapInstance || !geojson) return false

    const [ west, south, east, north ] = bbox(geojson)
    if (![ west, south, east, north ].every(Number.isFinite)) return false

    mapInstance.fitBounds(
      [ [ west, south ], [ east, north ] ],
      { padding: props.padding, maxZoom: props.maxZoom },
    )
    return true
  }

  async function fitBoundsToRelatedGeometry (relatedGeometry, joinValue, fallbackFeature) {
    const layerConfig = mapStore.layersConfig.find(
      cfg => cfg.id === relatedGeometry.layerId,
    )
    const wfsUrl = buildRelatedGeometryWfsUrl(
      layerConfig,
      relatedGeometry.targetAttribute || 'fid',
      joinValue,
    )

    if (wfsUrl) {
      try {
        const response = await fetch(wfsUrl)
        if (response.ok) {
          const data = await response.json()
          if (data?.features?.length && zoomToGeojson(data)) return
        }
      } catch {
        // Fall through to point zoom
      }
    }

    if (fallbackFeature) {
      zoomToGeojson(fallbackFeature)
    }
  }

  async function syncRelatedGeometry () {
    const context = resolveDisplayContext()
    if (!context) {
      clearRelatedGeometry()
      return
    }

    const { relatedGeometry, joinValues, fitBoundsRegion, fitBoundsJoinValue } = context
    const layerIds = resolveRelatedGeometryLayerIds(relatedGeometry)
    if (!layerIds.length) {
      clearRelatedGeometry()
      return
    }

    const targetAttribute = relatedGeometry.targetAttribute || 'fid'
    const joinKey = `${ relatedGeometry.layerId }:${ joinValues.map(String).sort().join(',') }`
    if (joinKey !== lastJoinKey) {
      const filter = buildRelatedGeometryFilter(targetAttribute, joinValues)
      showRelatedLayers(layerIds, filter)
      activeRelatedLayerIds = layerIds
      lastJoinKey = joinKey
    }

    // Fit bounds only when the selected feature changes, not on hover
    if (
      fitBoundsRegion &&
      relatedGeometry.fitBounds !== false &&
      fitBoundsJoinValue != null &&
      String(fitBoundsJoinValue) !== String(lastFitJoinValue)
    ) {
      lastFitJoinValue = fitBoundsJoinValue
      await fitBoundsToRelatedGeometry(
        relatedGeometry,
        fitBoundsJoinValue,
        fitBoundsRegion.feature,
      )
    }

    if (!fitBoundsRegion) {
      lastFitJoinValue = null
    }
  }

  watch(
    () => [ mapStore.activeRegion, mapStore.hoveredFeature ],
    () => {
      syncRelatedGeometry()
    },
  )

  onBeforeUnmount(() => {
    clearRelatedGeometry()
  })
</script>
