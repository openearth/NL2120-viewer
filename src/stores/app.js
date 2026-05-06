import { defineStore } from 'pinia'
import config from '@/config/workflow.json'

export const useAppStore = defineStore('app', {
  state: () => ({
    activeMenu: null,
    completedSteps: [],
    processResults: {},
    selections: {},
  }),

  getters: {
    isStepCompleted: (state) => (stepId) => {
      return state.completedSteps.includes(stepId)
    },

    isStepAvailable: (state) => (step) => {
      if (!step.requiredSteps || step.requiredSteps.length === 0) {
        return true
      }
      return step.requiredSteps.every(
        reqId => state.completedSteps.includes(reqId),
      )
    },
  },

  actions: {
    closeMenu () {
      this.activeMenu = null
    },

    toggleMenu (menuId) {
      this.activeMenu = this.activeMenu === menuId ? null : menuId
    },

    completeStep (stepId) {
      if (!this.completedSteps.includes(stepId)) {
        this.completedSteps.push(stepId)
      }
    },

    setProcessResult (key, result) {
      this.processResults[key] = result
    },

    setSelection (key, value) {
      if (value == null) {
        delete this.selections[key]
      } else {
        this.selections[key] = value
      }
    },

    resetWorkflowState () {
      this.activeMenu = null
      this.completedSteps = []
      this.processResults = {}
      this.selections = {}
    },

    resetStepsFrom (stepId) {
      const steps = config.steps
      const index = steps.findIndex(s => s.id === stepId)
      if (index >= 0) {
        const toRemove = steps.slice(index + 1).map(s => s.id)
        this.completedSteps = this.completedSteps.filter(
          id => !toRemove.includes(id),
        )
        for (const id of toRemove) {
          delete this.processResults[id]
        }
      }
    },

    openNextStep (currentStepId) {
      const steps = config.steps
      const index = steps.findIndex(s => s.id === currentStepId)
      const nextStep = index >= 0 && index < steps.length - 1 ? steps[index + 1] : null
      if (nextStep && this.isStepAvailable(nextStep)) {
        this.activeMenu = nextStep.id
      } else {
        this.activeMenu = null
      }
    },
  },
})
