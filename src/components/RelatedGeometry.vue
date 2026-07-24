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
    getRelatedJoinAttribute,
    getRelatedJoinValue,
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

  function relatedConfigFor (region) {
    if (!region?.layerId) return null
    return findWorkflowLayer(region.layerId)?.relatedGeometry ?? null
  }

  /**
   * Join values to display: selection first; hover when showOnHover /
   * showOnHoverWithSelection allow it.
   */
  function resolveDisplayContext () {
    const selected = mapStore.activeRegion
    const hovered = mapStore.hoveredFeature
    const selectedConfig = relatedConfigFor(selected)
    const hoveredConfig = relatedConfigFor(hovered)

    if (selectedConfig) {
      const sourceAttribute = getRelatedJoinAttribute(selectedConfig, 'source')
      const selectedJoin = getRelatedJoinValue(selected, sourceAttribute)
      const joinValues = selectedJoin != null ? [ selectedJoin ] : []

      const canHoverAlongside =
        selectedConfig.showOnHover === true &&
        selectedConfig.showOnHoverWithSelection === true &&
        hoveredConfig?.layerId === selectedConfig.layerId

      if (canHoverAlongside) {
        const hoverJoin = getRelatedJoinValue(
          hovered,
          getRelatedJoinAttribute(hoveredConfig, 'source'),
        )
        if (hoverJoin != null && String(hoverJoin) !== String(selectedJoin)) {
          joinValues.push(hoverJoin)
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
      const hoverJoin = getRelatedJoinValue(
        hovered,
        getRelatedJoinAttribute(hoveredConfig, 'source'),
      )
      if (hoverJoin == null) return null

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
      getRelatedJoinAttribute(relatedGeometry, 'target'),
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

    const joinKey = `${ relatedGeometry.layerId }:${ joinValues.map(String).sort().join(',') }`
    if (joinKey !== lastJoinKey) {
      showRelatedLayers(
        layerIds,
        buildRelatedGeometryFilter(
          getRelatedJoinAttribute(relatedGeometry, 'target'),
          joinValues,
        ),
      )
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
