# VSCode UI Toolkit Migration Plan

## Phase 1: Setup and Dependencies

### 1.1 Package Management
- Remove `element-ui` from package.json dependencies
- Remove `element-ui/lib/locale/lang/en` import
- Add `@vscode/webview-ui-toolkit` to package.json dependencies
- Remove `umy-table` dependency
- Remove `umy-table/lib/theme-chalk/index.css` import

### 1.2 Main Entry Point Updates
**File: `src/vue/main.ts`**
- Remove `import ElementUI from 'element-ui'`
- Remove `import locale from 'element-ui/lib/locale/lang/en'`
- Remove `Vue.use(ElementUI, { locale })`
- Remove `UmyTable` imports and usage
- Add VSCode webview toolkit imports
- Register VSCode design system components

## Phase 2: Core Connection Form

### 2.1 Connection Form Template
**File: `src/vue/connect/index.vue`**
- Replace `<input class="field__input">` with `<vscode-text-field>`
- Replace `<el-radio>` with `<vscode-radio-group>` and `<vscode-radio>`
- Replace `<el-switch>` with `<vscode-checkbox>`
- Replace `<button class="button button--primary">` with `<vscode-button>`
- Remove `v-loading` directive, replace with conditional `<vscode-progress-ring>`
- Update form validation attributes
- Update v-model bindings for new components

### 2.2 Connection Form Styling
**File: `src/vue/connect/index.vue` - Style Section**
- Remove `.field__input` CSS class
- Remove `.button` and `.button--primary` CSS classes
- Update `.tab` styling to use VSCode variables
- Update `.panel` styling for error/success messages
- Remove custom input styling rules

## Phase 3: Connection Sub-Components

### 3.1 ElasticSearch Component
**File: `src/vue/connect/component/ElasticSearch.vue`**
- Replace all `<input>` elements with `<vscode-text-field>`
- Replace `<el-radio>` with VSCode radio components
- Update styling to remove Element UI dependencies

### 3.2 SQLite Component  
**File: `src/vue/connect/component/SQLite.vue`**
- Replace file input with `<vscode-text-field>` and `<vscode-button>`
- Update file selection logic
- Remove Element UI styling

### 3.3 SSH Component
**File: `src/vue/connect/component/SSH.vue`**
- Replace all form inputs with VSCode equivalents
- Replace `<el-radio>` for authentication type selection
- Update file picker for private key selection

### 3.4 SSL Component
**File: `src/vue/connect/component/SSL.vue`**
- Replace certificate file inputs with VSCode components
- Update file selection handlers

### 3.5 FTP Component
**File: `src/vue/connect/component/FTP.vue`**
- Replace all form controls with VSCode equivalents
- Update encoding selection dropdown

### 3.6 SQLServer Component
**File: `src/vue/connect/component/SQLServer.vue`**
- Replace authentication type radio buttons
- Replace text inputs for domain and instance

## Phase 4: Data Display Components

### 4.1 Design/Table Editor
**File: `src/vue/design/index.vue`**
- Replace UmyTable with native HTML table
- Implement VSCode-styled table headers
- Add VSCode-styled form controls for column editing
- Update table row styling with VSCode variables

### 4.2 Info Panel
**File: `src/vue/design/InfoPanel.vue`**
- Replace `.field__input` styled inputs
- Update form controls for table properties

### 4.3 Column Panel
**File: `src/vue/design/ColumnPanel.vue`**
- Replace dropdown selections with `<vscode-dropdown>`
- Update input fields for column properties

### 4.4 Index Panel
**File: `src/vue/design/IndexPanel.vue`**
- Replace form controls with VSCode equivalents
- Update index type selections

## Phase 5: Status and Monitoring

### 5.1 Status Display
**File: `src/vue/status/index.vue`**
- Replace data display tables with VSCode-styled equivalents
- Update progress indicators with `<vscode-progress-ring>`
- Replace buttons with `<vscode-button>`

### 5.2 Redis Status
**File: `src/vue/redis/redisStatus.vue`**
- Update Redis info display tables
- Replace refresh buttons with VSCode buttons

### 5.3 Redis Key View
**File: `src/vue/redis/keyView.vue`**
- Replace key editing forms with VSCode inputs
- Update value display with proper VSCode styling

### 5.4 Redis Terminal
**File: `src/vue/redis/terminal.vue`**
- Update command input with `<vscode-text-field>`
- Style terminal output with VSCode variables

## Phase 6: Utility Components

### 6.1 Structure Diff
**File: `src/vue/structDiff/index.vue`**
- Replace comparison tables with VSCode-styled tables
- Update diff highlighting with VSCode color variables
- Replace action buttons with VSCode buttons

### 6.2 Forward/SSH Terminal
**File: `src/vue/forward/index.vue`**
- Replace port forwarding form controls
- Update connection status displays

### 6.3 XTerm Terminal
**File: `src/vue/xterm/index.vue`**
- Ensure terminal styling integrates with VSCode theme
- Update terminal control buttons

## Phase 7: Result Display System

### 7.1 Query Results
**File: `src/vue/result/App.vue`**
- Replace UmyTable with VSCode-compatible table solution
- Update toolbar buttons with VSCode styling
- Replace pagination controls

### 7.2 Result Toolbar
**File: `src/vue/result/component/Toolbar/index.vue`**
- Replace all toolbar buttons with `<vscode-button>`
- Update dropdown menus with `<vscode-dropdown>`
- Replace export/import controls

## Phase 8: CSS and Theme Files

### 8.1 Auto Theme CSS
**File: `public/theme/auto.css`**
- Remove all Element UI overrides
- Remove UmyTable styling overrides
- Keep VSCode variable definitions
- Add VSCode component customizations if needed

### 8.2 UmyUI CSS
**File: `public/theme/umyui.css`**
- Remove entire file (UmyTable specific)
- Move any VSCode-compatible styles to auto.css

### 8.3 Component-Specific Styles
- Remove `.field__input` from all Vue components
- Remove `.button--primary` and related button classes
- Remove Element UI class overrides
- Add VSCode component customizations where needed

## Phase 9: JavaScript/TypeScript Updates

### 9.1 Event Handlers
- Update form submission handlers for new component events
- Update v-model binding patterns for VSCode components
- Update validation logic for new component structure

### 9.2 Component Props
- Update parent-child component communication
- Update prop validation for new component types
- Update emit patterns for VSCode components

## Phase 10: Build and Configuration

### 10.1 Webpack Configuration
**File: `webpack.config.lib.js`**
- Remove Element UI from externals
- Add VSCode webview toolkit to bundle
- Update CSS loading for new theme structure

### 10.2 HTML Templates
**File: `media/app.html`**
**File: `media/index.html`**
- Remove Element UI CSS references
- Add VSCode webview toolkit CSS if needed
- Update script loading order

## Phase 11: Testing and Validation

### 11.1 Component Testing
- Test all form inputs in light/dark themes
- Test radio button groups and checkboxes
- Test button interactions and loading states
- Test dropdown functionality

### 11.2 Theme Testing
- Test in VS Code light theme
- Test in VS Code dark theme
- Test in high contrast themes
- Test custom theme compatibility

### 11.3 Functionality Testing
- Test database connections with new forms
- Test data editing with new table components
- Test query execution and results display
- Test all SSH/SSL configuration options
