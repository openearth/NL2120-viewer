<template>
  <div
    class="flash-highlight"
    :class="{ 'flash-highlight--active': isFlashing }"
    :style="{ '--flash-count': String(flashCountValue) }"
    @animationend="onAnimationEnd"
  >
    <slot />
  </div>
</template>

<script setup>
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

  const props = defineProps({
    enabled: { type: Boolean, default: false },
    flashWhenEnabled: { type: Boolean, default: false },
    flashCount: { type: Number, default: 2 },
  })

  const isFlashing = ref(false)
  const safeFlashCount = computed(() => Math.max(1, Number(props.flashCount) || 2))
  let loopTimer = null

  function triggerFlash () {
    isFlashing.value = false
    nextTick(() => {
      isFlashing.value = true
    })
  }

  function stopLoop () {
    if (loopTimer != null) {
      clearInterval(loopTimer)
      loopTimer = null
    }
    isFlashing.value = false
  }

  function startLoop () {
    stopLoop()
    triggerFlash()
    loopTimer = setInterval(() => {
      triggerFlash()
    }, 5000)
  }

  watch(
    () => props.enabled,
    (enabled) => {
      if (!props.flashWhenEnabled) return
      if (enabled) {
        startLoop()
      } else {
        stopLoop()
      }
    },
    { immediate: true },
  )

  const flashCountValue = computed(() => safeFlashCount.value)

  function onAnimationEnd () {
    isFlashing.value = false
  }

  onBeforeUnmount(() => {
    stopLoop()
  })
</script>

<style scoped>
.flash-highlight {
  border-radius: 8px;
}

.flash-highlight--active {
  animation-name: flash-highlight-pulse;
  animation-duration: 700ms;
  animation-iteration-count: var(--flash-count, 2);
  animation-timing-function: ease-in-out;
}

@keyframes flash-highlight-pulse {
  0% {
    background-color: rgba(255, 221, 87, 0);
    box-shadow: 0 0 0 0 rgba(255, 221, 87, 0);
  }
  50% {
    background-color: rgba(255, 221, 87, 0.32);
    box-shadow: 0 0 0 2px rgba(255, 221, 87, 0.55);
  }
  100% {
    background-color: rgba(255, 221, 87, 0);
    box-shadow: 0 0 0 0 rgba(255, 221, 87, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .flash-highlight--active {
    animation: none;
    box-shadow: 0 0 0 2px rgba(255, 221, 87, 0.55);
    background-color: rgba(255, 221, 87, 0.2);
  }
}
</style>
