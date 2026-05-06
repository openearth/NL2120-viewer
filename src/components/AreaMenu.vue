<template>
  <v-navigation-drawer
    v-if="areaMenuIsOpen"
    v-model="areaMenuIsOpen"
    class="custom-area-menu"
    width="250"
  >
    <v-list-item>
      <v-list-item-title>Select a region in the map</v-list-item-title>
    </v-list-item>
  </v-navigation-drawer>
</template>

<script setup>
  import { computed } from 'vue'
  import { useAppStore } from '@/stores/app'

  const store = useAppStore()

  const areaMenuIsOpen = computed({
    get: () => store.areaMenuIsOpen,
    set: (value) => {
      if (!value && store.activeMenu === 'area') {
        store.closeMenu()
      }
    },
  })
</script>

<style scoped>
.custom-area-menu {
  position: absolute;
  left: 220px;
  max-height: calc(100% - 50px * 2);
  margin-top: 50px;
  border-radius: 28px;
}
</style>
