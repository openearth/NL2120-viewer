import { computed, inject, unref } from 'vue'

/**
 * Shared process-run UI state from SubMenu (provide/inject).
 * Safe when used outside a SubMenu: loading flags stay false.
 */
export function useProcessRunUi () {
  const processStatus = inject('processStatus', null)
  const processShowButtonLoading = inject('processShowButtonLoading', null)

  const isProcessLoading = computed(() => unref(processStatus) === 'loading')

  const showButtonSpinner = computed(() =>
    isProcessLoading.value && Boolean(unref(processShowButtonLoading)),
  )

  return { isProcessLoading, showButtonSpinner }
}
