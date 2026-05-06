import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
const isProd = process.env.NODE_ENV === 'production'
export default [
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: [ '**/*.js' ],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {

      'indent': [ 'error', 2, { SwitchCase: 1 } ],
      'comma-spacing': [ 'error', { before: false, after: true } ],
      'key-spacing': [ 'error', { beforeColon: false, afterColon: true } ],
      'no-multi-spaces': 'error',
      'array-bracket-spacing': [ 'warn', 'always' ],
      'comma-dangle': [ 'error', 'always-multiline' ],
      'jsx-quotes': [ 'error', 'prefer-double' ],
      'semi': [ 'error', 'never' ],
      'no-console': isProd ? 'warn' : 'off',
      'no-debugger': isProd ? 'warn' : 'off',
      'no-unused-vars': 'warn',
      'object-curly-spacing': [ 'warn', 'always' ],
      'quotes': [ 'error', 'single' ],
      'template-curly-spacing': [ 'warn', 'always' ],
    },
  },
  {
    files: [ '**/*.vue' ],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'indent': 'off',
      'vue/script-indent': [ 'error', 2, { baseIndent: 1 } ],
      'vue/max-attributes-per-line': [ 'error', { singleline: 2 } ],
      'vue/no-unused-components': 'warn',
      'vue/no-v-html': 'off',
      'vue/multi-word-component-names': 'off',
    },
  },
]
