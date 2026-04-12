/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SettingsEditor2_1;
import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { ToggleActionViewItem } from '../../../../base/browser/ui/toggle/toggle.js';
import { Action } from '../../../../base/common/actions.js';
import { createCancelablePromise, Delayer, raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Color } from '../../../../base/common/color.js';
import { fromNow } from '../../../../base/common/date.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableStore, dispose, MutableDisposable } from '../../../../base/common/lifecycle.js';
import * as platform from '../../../../base/common/platform.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles, defaultToggleStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable, editorForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IUserDataSyncEnablementService, IUserDataSyncService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { registerNavigableContainer } from '../../../browser/actions/widgetNavigationCommands.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { APPLICATION_SCOPES, IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ALWAYS_SHOW_ADVANCED_SETTINGS_SETTING, IPreferencesService, SettingMatchType, SettingValueType, validateSettingsEditorOptions } from '../../../services/preferences/common/preferences.js';
import { nullRange, Settings2EditorModel } from '../../../services/preferences/common/preferencesModels.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IUserDataSyncWorkbenchService } from '../../../services/userDataSync/common/userDataSync.js';
import { SuggestEnabledInput } from '../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js';
import { ADVANCED_SETTING_TAG, CONTEXT_AI_SETTING_RESULTS_AVAILABLE, CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_ROW_FOCUS, CONTEXT_SETTINGS_SEARCH_FOCUS, CONTEXT_TOC_ROW_FOCUS, EMBEDDINGS_SEARCH_PROVIDER_NAME, ENABLE_LANGUAGE_FILTER, EXTENSION_FETCH_TIMEOUT_MS, EXTENSION_SETTING_TAG, FEATURE_SETTING_TAG, FILTER_MODEL_SEARCH_PROVIDER_NAME, getExperimentalExtensionToggleData, ID_SETTING_TAG, IPreferencesSearchService, LANGUAGE_SETTING_TAG, LLM_RANKED_SEARCH_PROVIDER_NAME, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG, REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG, SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, SETTINGS_EDITOR_COMMAND_SHOW_AI_RESULTS, SETTINGS_EDITOR_COMMAND_SUGGEST_FILTERS, SETTINGS_EDITOR_COMMAND_TOGGLE_AI_SEARCH, STRING_MATCH_SEARCH_PROVIDER_NAME, TF_IDF_SEARCH_PROVIDER_NAME, WorkbenchSettingsEditorSettings, WORKSPACE_TRUST_SETTING_TAG } from '../common/preferences.js';
import { settingsHeaderBorder, settingsSashBorder, settingsTextInputBorder } from '../common/settingsEditorColorRegistry.js';
import './media/settingsEditor2.css';
import { preferencesAiResultsIcon, preferencesClearInputIcon, preferencesFilterIcon } from './preferencesIcons.js';
import { SettingsTargetsWidget } from './preferencesWidgets.js';
import { getCommonlyUsedData, tocData } from './settingsLayout.js';
import { SettingsSearchFilterDropdownMenuActionViewItem } from './settingsSearchMenu.js';
import { AbstractSettingRenderer, createTocTreeForExtensionSettings, resolveConfiguredUntrustedSettings, resolveSettingsTree, SettingsTree, SettingTreeRenderers } from './settingsTree.js';
import { parseQuery, SearchResultModel, SettingsTreeGroupElement, SettingsTreeModel, SettingsTreeSettingElement } from './settingsTreeModels.js';
import { createTOCIterator, TOCTree, TOCTreeModel } from './tocTree.js';
export var SettingsFocusContext;
(function (SettingsFocusContext) {
    SettingsFocusContext[SettingsFocusContext["Search"] = 0] = "Search";
    SettingsFocusContext[SettingsFocusContext["TableOfContents"] = 1] = "TableOfContents";
    SettingsFocusContext[SettingsFocusContext["SettingTree"] = 2] = "SettingTree";
    SettingsFocusContext[SettingsFocusContext["SettingControl"] = 3] = "SettingControl";
})(SettingsFocusContext || (SettingsFocusContext = {}));
export function createGroupIterator(group) {
    return Iterable.map(group.children, g => {
        return {
            element: g,
            children: g instanceof SettingsTreeGroupElement ?
                createGroupIterator(g) :
                undefined
        };
    });
}
const $ = DOM.$;
const searchBoxLabel = localize('SearchSettings.AriaLabel', "Search settings");
const SEARCH_TOC_BEHAVIOR_KEY = 'workbench.settings.settingsSearchTocBehavior';
const SHOW_AI_RESULTS_ENABLED_LABEL = localize('showAiResultsEnabled', "Show AI-recommended results");
const SHOW_AI_RESULTS_DISABLED_LABEL = localize('showAiResultsDisabled', "No AI results available at this time...");
const SETTINGS_EDITOR_STATE_KEY = 'settingsEditorState';
let SettingsEditor2 = class SettingsEditor2 extends EditorPane {
    static { SettingsEditor2_1 = this; }
    static { this.ID = 'workbench.editor.settings2'; }
    static { this.NUM_INSTANCES = 0; }
    static { this.SEARCH_DEBOUNCE = 200; }
    static { this.SETTING_UPDATE_FAST_DEBOUNCE = 200; }
    static { this.SETTING_UPDATE_SLOW_DEBOUNCE = 1000; }
    static { this.CONFIG_SCHEMA_UPDATE_DELAYER = 500; }
    static { this.TOC_MIN_WIDTH = 100; }
    static { this.TOC_RESET_WIDTH = 200; }
    static { this.EDITOR_MIN_WIDTH = 500; }
    // Below NARROW_TOTAL_WIDTH, we only render the editor rather than the ToC.
    static { this.NARROW_TOTAL_WIDTH = this.TOC_RESET_WIDTH + this.EDITOR_MIN_WIDTH; }
    static { this.SUGGESTIONS = [
        `@${MODIFIED_SETTING_TAG}`,
        '@tag:notebookLayout',
        '@tag:notebookOutputLayout',
        `@tag:${REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG}`,
        `@tag:${WORKSPACE_TRUST_SETTING_TAG}`,
        '@tag:sync',
        '@tag:usesOnlineServices',
        '@tag:telemetry',
        '@tag:accessibility',
        '@tag:preview',
        '@tag:experimental',
        `@tag:${ADVANCED_SETTING_TAG}`,
        `@${ID_SETTING_TAG}`,
        `@${EXTENSION_SETTING_TAG}`,
        `@${FEATURE_SETTING_TAG}scm`,
        `@${FEATURE_SETTING_TAG}explorer`,
        `@${FEATURE_SETTING_TAG}search`,
        `@${FEATURE_SETTING_TAG}debug`,
        `@${FEATURE_SETTING_TAG}extensions`,
        `@${FEATURE_SETTING_TAG}terminal`,
        `@${FEATURE_SETTING_TAG}task`,
        `@${FEATURE_SETTING_TAG}problems`,
        `@${FEATURE_SETTING_TAG}output`,
        `@${FEATURE_SETTING_TAG}comments`,
        `@${FEATURE_SETTING_TAG}remote`,
        `@${FEATURE_SETTING_TAG}timeline`,
        `@${FEATURE_SETTING_TAG}notebook`,
        `@${FEATURE_SETTING_TAG}chat`,
        `@${POLICY_SETTING_TAG}`
    ]; }
    static shouldSettingUpdateFast(type) {
        if (Array.isArray(type)) {
            // nullable integer/number or complex
            return false;
        }
        return type === SettingValueType.Enum ||
            type === SettingValueType.Array ||
            type === SettingValueType.BooleanObject ||
            type === SettingValueType.Object ||
            type === SettingValueType.Complex ||
            type === SettingValueType.Boolean ||
            type === SettingValueType.Exclude ||
            type === SettingValueType.Include;
    }
    constructor(group, telemetryService, configurationService, textResourceConfigurationService, themeService, preferencesService, instantiationService, preferencesSearchService, logService, contextKeyService, storageService, editorGroupService, userDataSyncWorkbenchService, userDataSyncEnablementService, workspaceTrustManagementService, extensionService, languageService, extensionManagementService, productService, extensionGalleryService, editorProgressService, userDataProfileService, keybindingService, chatEntitlementService) {
        super(SettingsEditor2_1.ID, group, telemetryService, themeService, storageService);
        this.configurationService = configurationService;
        this.preferencesService = preferencesService;
        this.instantiationService = instantiationService;
        this.preferencesSearchService = preferencesSearchService;
        this.logService = logService;
        this.storageService = storageService;
        this.editorGroupService = editorGroupService;
        this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.extensionService = extensionService;
        this.languageService = languageService;
        this.extensionManagementService = extensionManagementService;
        this.productService = productService;
        this.extensionGalleryService = extensionGalleryService;
        this.editorProgressService = editorProgressService;
        this.keybindingService = keybindingService;
        this.chatEntitlementService = chatEntitlementService;
        this.searchContainer = null;
        this.settingsTreeModel = this._register(new MutableDisposable());
        this.searchInProgress = null;
        this.aiSearchPromise = null;
        this.showAiResultsAction = null;
        this.pendingSettingUpdate = null;
        this._searchResultModel = this._register(new MutableDisposable());
        this.searchResultLabel = null;
        this.lastSyncedLabel = null;
        this.settingsOrderByTocIndex = null;
        this._currentFocusContext = 0 /* SettingsFocusContext.Search */;
        /** Don't spam warnings */
        this.hasWarnedMissingSettings = false;
        this.tocTreeDisposed = false;
        this.tocFocusedElement = null;
        this.treeFocusedElement = null;
        this.settingsTreeScrollTop = 0;
        this.installedExtensionIds = [];
        this.dismissedExtensionSettings = [];
        this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY = 'settingsEditor2.dismissedExtensionSettings';
        this.DISMISSED_EXTENSION_SETTINGS_DELIMITER = '\t';
        this.searchInputActionBar = null;
        this.searchDelayer = this._register(new Delayer(200));
        this.viewState = { settingsTarget: 3 /* ConfigurationTarget.USER_LOCAL */ };
        this.settingFastUpdateDelayer = this._register(new Delayer(SettingsEditor2_1.SETTING_UPDATE_FAST_DEBOUNCE));
        this.settingSlowUpdateDelayer = this._register(new Delayer(SettingsEditor2_1.SETTING_UPDATE_SLOW_DEBOUNCE));
        this.searchInputDelayer = this._register(new Delayer(SettingsEditor2_1.SEARCH_DEBOUNCE));
        this.updatedConfigSchemaDelayer = this._register(new Delayer(SettingsEditor2_1.CONFIG_SCHEMA_UPDATE_DELAYER));
        this.inSettingsEditorContextKey = CONTEXT_SETTINGS_EDITOR.bindTo(contextKeyService);
        this.searchFocusContextKey = CONTEXT_SETTINGS_SEARCH_FOCUS.bindTo(contextKeyService);
        this.tocRowFocused = CONTEXT_TOC_ROW_FOCUS.bindTo(contextKeyService);
        this.settingRowFocused = CONTEXT_SETTINGS_ROW_FOCUS.bindTo(contextKeyService);
        this.aiResultsAvailable = CONTEXT_AI_SETTING_RESULTS_AVAILABLE.bindTo(contextKeyService);
        this.scheduledRefreshes = new Map();
        this.editorMemento = this.getEditorMemento(editorGroupService, textResourceConfigurationService, SETTINGS_EDITOR_STATE_KEY);
        this.dismissedExtensionSettings = this.storageService
            .get(this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY, 0 /* StorageScope.PROFILE */, '')
            .split(this.DISMISSED_EXTENSION_SETTINGS_DELIMITER);
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectedKeys.has(WorkbenchSettingsEditorSettings.ShowAISearchToggle)
                || e.affectedKeys.has(WorkbenchSettingsEditorSettings.EnableNaturalLanguageSearch)) {
                this.updateAiSearchToggleVisibility();
            }
            if (e.affectsConfiguration(ALWAYS_SHOW_ADVANCED_SETTINGS_SETTING)) {
                this.onConfigUpdate(undefined, true, true);
            }
            if (e.source !== 7 /* ConfigurationTarget.DEFAULT */) {
                this.onConfigUpdate(e.affectedKeys);
            }
        }));
        this._register(chatEntitlementService.onDidChangeSentiment(() => {
            this.updateAiSearchToggleVisibility();
        }));
        this._register(userDataProfileService.onDidChangeCurrentProfile(e => {
            e.join(this.whenCurrentProfileChanged());
        }));
        this._register(workspaceTrustManagementService.onDidChangeTrust(() => {
            this.searchResultModel?.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted());
            if (this.settingsTreeModel.value) {
                this.settingsTreeModel.value.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted());
                this.renderTree();
            }
        }));
        this._register(configurationService.onDidChangeRestrictedSettings(e => {
            if (e.default.length && this.currentSettingsModel) {
                this.updateElementsByKey(new Set(e.default));
            }
        }));
        this._register(extensionManagementService.onDidInstallExtensions(() => {
            this.refreshInstalledExtensionsList();
        }));
        this._register(extensionManagementService.onDidUninstallExtension(() => {
            this.refreshInstalledExtensionsList();
        }));
        this.modelDisposables = this._register(new DisposableStore());
        if (ENABLE_LANGUAGE_FILTER && !SettingsEditor2_1.SUGGESTIONS.includes(`@${LANGUAGE_SETTING_TAG}`)) {
            SettingsEditor2_1.SUGGESTIONS.push(`@${LANGUAGE_SETTING_TAG}`);
        }
        this.inputChangeListener = this._register(new MutableDisposable());
    }
    async whenCurrentProfileChanged() {
        this.updatedConfigSchemaDelayer.trigger(() => {
            this.dismissedExtensionSettings = this.storageService
                .get(this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY, 0 /* StorageScope.PROFILE */, '')
                .split(this.DISMISSED_EXTENSION_SETTINGS_DELIMITER);
            this.onConfigUpdate(undefined, true);
        });
    }
    canShowAdvancedSettings() {
        if (this.configurationService.getValue(ALWAYS_SHOW_ADVANCED_SETTINGS_SETTING) ?? false) {
            return true;
        }
        return this.viewState.tagFilters?.has(ADVANCED_SETTING_TAG) ?? false;
    }
    /**
     * Determines whether a setting should be shown even when advanced settings are filtered out.
     * Returns true if:
     * - The setting is not tagged as advanced, OR
     * - The setting matches an ID filter (@id:settingKey), OR
     * - The setting key appears in the search query, OR
     * - The @hasPolicy filter is active (policy settings should always be shown when filtering by policy)
     */
    shouldShowSetting(setting) {
        if (!setting.tags?.includes(ADVANCED_SETTING_TAG)) {
            return true;
        }
        if (this.viewState.idFilters?.has(setting.key)) {
            return true;
        }
        if (this.viewState.query?.toLowerCase().includes(setting.key.toLowerCase())) {
            return true;
        }
        if (this.viewState.tagFilters?.has(POLICY_SETTING_TAG)) {
            return true;
        }
        return false;
    }
    disableAiSearchToggle() {
        if (this.showAiResultsAction) {
            this.showAiResultsAction.checked = false;
            this.showAiResultsAction.enabled = false;
            this.aiResultsAvailable.set(false);
            this.showAiResultsAction.label = SHOW_AI_RESULTS_DISABLED_LABEL;
        }
    }
    updateAiSearchToggleVisibility() {
        if (!this.searchContainer || !this.showAiResultsAction || !this.searchInputActionBar) {
            return;
        }
        const showAiToggle = this.configurationService.getValue(WorkbenchSettingsEditorSettings.ShowAISearchToggle);
        const enableNaturalLanguageSearch = this.configurationService.getValue(WorkbenchSettingsEditorSettings.EnableNaturalLanguageSearch);
        const chatHidden = this.chatEntitlementService.sentiment.hidden || this.chatEntitlementService.sentiment.disabled;
        const canShowToggle = showAiToggle && enableNaturalLanguageSearch && !chatHidden;
        const alreadyVisible = this.searchInputActionBar.hasAction(this.showAiResultsAction);
        if (!alreadyVisible && canShowToggle) {
            this.searchInputActionBar.push(this.showAiResultsAction, {
                index: 0,
                label: false,
                icon: true
            });
            this.searchContainer.classList.add('with-ai-toggle');
        }
        else if (alreadyVisible) {
            this.searchInputActionBar.pull(0);
            this.searchContainer.classList.remove('with-ai-toggle');
            this.showAiResultsAction.checked = false;
        }
    }
    get minimumWidth() { return SettingsEditor2_1.EDITOR_MIN_WIDTH; }
    get maximumWidth() { return Number.POSITIVE_INFINITY; }
    get minimumHeight() { return 180; }
    // these setters need to exist because this extends from EditorPane
    set minimumWidth(value) { }
    set maximumWidth(value) { }
    get currentSettingsModel() {
        return this.searchResultModel || this.settingsTreeModel.value;
    }
    get searchResultModel() {
        return this._searchResultModel.value ?? null;
    }
    set searchResultModel(value) {
        this._searchResultModel.value = value ?? undefined;
        this.rootElement.classList.toggle('search-mode', !!this._searchResultModel.value);
    }
    get focusedSettingDOMElement() {
        const focused = this.settingsTree.getFocus()[0];
        if (!(focused instanceof SettingsTreeSettingElement)) {
            return;
        }
        return this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), focused.setting.key)[0];
    }
    get currentFocusContext() {
        return this._currentFocusContext;
    }
    createEditor(parent) {
        parent.setAttribute('tabindex', '-1');
        this.rootElement = DOM.append(parent, $('.settings-editor', { tabindex: '-1' }));
        this.createHeader(this.rootElement);
        this.createBody(this.rootElement);
        this.addCtrlAInterceptor(this.rootElement);
        this.updateStyles();
        this._register(registerNavigableContainer({
            name: 'settingsEditor2',
            focusNotifiers: [this],
            focusNextWidget: () => {
                if (this.searchWidget.inputWidget.hasWidgetFocus()) {
                    this.focusTOC();
                }
            },
            focusPreviousWidget: () => {
                if (!this.searchWidget.inputWidget.hasWidgetFocus()) {
                    this.focusSearch();
                }
            }
        }));
    }
    async setInput(input, options, context, token) {
        this.inSettingsEditorContextKey.set(true);
        await super.setInput(input, options, context, token);
        if (!this.input) {
            return;
        }
        const model = await this.input.resolve();
        if (token.isCancellationRequested || !(model instanceof Settings2EditorModel)) {
            return;
        }
        this.modelDisposables.clear();
        this.modelDisposables.add(model.onDidChangeGroups(() => {
            this.updatedConfigSchemaDelayer.trigger(() => {
                this.onConfigUpdate(undefined, false, true);
            });
        }));
        this.defaultSettingsEditorModel = model;
        options = options || validateSettingsEditorOptions({});
        if (!this.viewState.settingsTarget || !this.settingsTargetsWidget.settingsTarget) {
            const optionsHasViewStateTarget = options.viewState && options.viewState.settingsTarget;
            if (!options.target && !optionsHasViewStateTarget) {
                options.target = 3 /* ConfigurationTarget.USER_LOCAL */;
            }
        }
        this._setOptions(options);
        // Don't block setInput on render (which can trigger an async search)
        this.onConfigUpdate(undefined, true).then(() => {
            // This event runs when the editor closes.
            this.inputChangeListener.value = input.onWillDispose(() => {
                this.searchWidget.setValue('');
            });
            // Init TOC selection
            this.updateTreeScrollSync();
        });
        await this.refreshInstalledExtensionsList();
    }
    async refreshInstalledExtensionsList() {
        const installedExtensions = await this.extensionManagementService.getInstalled();
        this.installedExtensionIds = installedExtensions
            .filter(ext => ext.manifest.contributes?.configuration)
            .map(ext => ext.identifier.id);
    }
    restoreCachedState() {
        const cachedState = this.input && this.editorMemento.loadEditorState(this.group, this.input);
        if (cachedState && typeof cachedState.target === 'object') {
            cachedState.target = URI.revive(cachedState.target);
        }
        if (cachedState) {
            const settingsTarget = cachedState.target;
            this.settingsTargetsWidget.settingsTarget = settingsTarget;
            this.viewState.settingsTarget = settingsTarget;
            if (!this.searchWidget.getValue()) {
                this.searchWidget.setValue(cachedState.searchQuery);
            }
        }
        if (this.input) {
            this.editorMemento.clearEditorState(this.input, this.group);
        }
        return cachedState ?? null;
    }
    getViewState() {
        return this.viewState;
    }
    setOptions(options) {
        super.setOptions(options);
        if (options) {
            this._setOptions(options);
        }
    }
    _setOptions(options) {
        if (options.focusSearch && !platform.isIOS) {
            // isIOS - #122044
            this.focusSearch();
        }
        const recoveredViewState = options.viewState ?
            options.viewState : undefined;
        const query = recoveredViewState?.query ?? options.query;
        if (query !== undefined) {
            this.searchWidget.setValue(query);
            this.viewState.query = query;
        }
        const target = options.folderUri ?? recoveredViewState?.settingsTarget ?? options.target;
        if (target) {
            this.settingsTargetsWidget.updateTarget(target);
        }
    }
    clearInput() {
        this.inSettingsEditorContextKey.set(false);
        super.clearInput();
    }
    layout(dimension) {
        this.dimension = dimension;
        if (!this.isVisible()) {
            return;
        }
        this.layoutSplitView(dimension);
        const innerWidth = Math.min(this.headerContainer.clientWidth, dimension.width) - 24 * 2; // 24px padding on left and right;
        // minus padding inside inputbox, controls width, and extra padding before countElement
        const monacoWidth = innerWidth - 10 - this.controlsElement.clientWidth - 12;
        this.searchWidget.layout(new DOM.Dimension(monacoWidth, 20));
        this.rootElement.classList.toggle('narrow-width', dimension.width < SettingsEditor2_1.NARROW_TOTAL_WIDTH);
    }
    focus() {
        super.focus();
        if (this._currentFocusContext === 0 /* SettingsFocusContext.Search */) {
            if (!platform.isIOS) {
                // #122044
                this.focusSearch();
            }
        }
        else if (this._currentFocusContext === 3 /* SettingsFocusContext.SettingControl */) {
            const element = this.focusedSettingDOMElement;
            if (element) {
                // eslint-disable-next-line no-restricted-syntax
                const control = element.querySelector(AbstractSettingRenderer.CONTROL_SELECTOR);
                if (control) {
                    control.focus();
                    return;
                }
            }
        }
        else if (this._currentFocusContext === 2 /* SettingsFocusContext.SettingTree */) {
            this.settingsTree.domFocus();
        }
        else if (this._currentFocusContext === 1 /* SettingsFocusContext.TableOfContents */) {
            this.tocTree.domFocus();
        }
    }
    setEditorVisible(visible) {
        super.setEditorVisible(visible);
        if (!visible) {
            // Wait for editor to be removed from DOM #106303
            setTimeout(() => {
                this.searchWidget.onHide();
                this.settingRenderers.cancelSuggesters();
            }, 0);
        }
    }
    focusSettings(focusSettingInput = false) {
        const focused = this.settingsTree.getFocus();
        if (!focused.length) {
            this.settingsTree.focusFirst();
        }
        this.settingsTree.domFocus();
        if (focusSettingInput) {
            // eslint-disable-next-line no-restricted-syntax
            const controlInFocusedRow = this.settingsTree.getHTMLElement().querySelector(`.focused ${AbstractSettingRenderer.CONTROL_SELECTOR}`);
            if (controlInFocusedRow) {
                controlInFocusedRow.focus();
            }
        }
    }
    focusTOC() {
        this.tocTree.domFocus();
    }
    showContextMenu() {
        const focused = this.settingsTree.getFocus()[0];
        const rowElement = this.focusedSettingDOMElement;
        if (rowElement && focused instanceof SettingsTreeSettingElement) {
            this.settingRenderers.showContextMenu(focused, rowElement);
        }
    }
    focusSearch(filter, selectAll = true) {
        if (filter && this.searchWidget) {
            this.searchWidget.setValue(filter);
        }
        // Do not select all if the user is already searching.
        this.searchWidget.focus(selectAll && !this.searchInputDelayer.isTriggered);
    }
    clearSearchResults() {
        this.disableAiSearchToggle();
        this.searchWidget.setValue('');
        this.focusSearch();
    }
    clearSearchFilters() {
        const query = this.searchWidget.getValue();
        const splitQuery = query.split(' ').filter(word => {
            return word.length && !SettingsEditor2_1.SUGGESTIONS.some(suggestion => word.startsWith(suggestion));
        });
        this.searchWidget.setValue(splitQuery.join(' '));
    }
    updateInputAriaLabel() {
        let label = searchBoxLabel;
        if (this.searchResultLabel) {
            label += `. ${this.searchResultLabel}`;
        }
        if (this.lastSyncedLabel) {
            label += `. ${this.lastSyncedLabel}`;
        }
        this.searchWidget.updateAriaLabel(label);
    }
    /**
     * Render the header of the Settings editor, which includes the content above the splitview.
     */
    createHeader(parent) {
        this.headerContainer = DOM.append(parent, $('.settings-header'));
        this.searchContainer = DOM.append(this.headerContainer, $('.search-container'));
        const clearInputAction = this._register(new Action(SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, localize('clearInput', "Clear Settings Search Input"), ThemeIcon.asClassName(preferencesClearInputIcon), false, async () => this.clearSearchResults()));
        const showAiResultActionClassNames = ['action-label', ThemeIcon.asClassName(preferencesAiResultsIcon)];
        this.showAiResultsAction = this._register(new Action(SETTINGS_EDITOR_COMMAND_SHOW_AI_RESULTS, SHOW_AI_RESULTS_DISABLED_LABEL, showAiResultActionClassNames.join(' '), true));
        this._register(this.showAiResultsAction.onDidChange(async () => {
            await this.onDidToggleAiSearch();
        }));
        const filterAction = this._register(new Action(SETTINGS_EDITOR_COMMAND_SUGGEST_FILTERS, localize('filterInput', "Filter Settings"), ThemeIcon.asClassName(preferencesFilterIcon)));
        this.searchWidget = this._register(this.instantiationService.createInstance(SuggestEnabledInput, `${SettingsEditor2_1.ID}.searchbox`, this.searchContainer, {
            triggerCharacters: ['@', ':'],
            provideResults: (query) => {
                // Based on testing, the trigger character is always at the end of the query.
                // for the ':' trigger, only return suggestions if there was a '@' before it in the same word.
                const queryParts = query.split(/\s/g);
                if (queryParts[queryParts.length - 1].startsWith(`@${LANGUAGE_SETTING_TAG}`)) {
                    const sortedLanguages = this.languageService.getRegisteredLanguageIds().map(languageId => {
                        return `@${LANGUAGE_SETTING_TAG}${languageId} `;
                    }).sort();
                    return sortedLanguages.filter(langFilter => !query.includes(langFilter));
                }
                else if (queryParts[queryParts.length - 1].startsWith(`@${EXTENSION_SETTING_TAG}`)) {
                    const installedExtensionsTags = this.installedExtensionIds.map(extensionId => {
                        return `@${EXTENSION_SETTING_TAG}${extensionId} `;
                    }).sort();
                    return installedExtensionsTags.filter(extFilter => !query.includes(extFilter));
                }
                else if (query === '' || queryParts[queryParts.length - 1].startsWith('@')) {
                    return SettingsEditor2_1.SUGGESTIONS.filter(tag => !query.includes(tag)).map(tag => tag.endsWith(':') ? tag : tag + ' ');
                }
                return [];
            }
        }, searchBoxLabel, 'settingseditor:searchinput' + SettingsEditor2_1.NUM_INSTANCES++, {
            placeholderText: searchBoxLabel,
            focusContextKey: this.searchFocusContextKey,
            styleOverrides: {
                inputBorder: settingsTextInputBorder
            }
            // TODO: Aria-live
        }));
        this._register(this.searchWidget.onDidFocus(() => {
            this._currentFocusContext = 0 /* SettingsFocusContext.Search */;
        }));
        this._register(this.searchWidget.onInputDidChange(() => {
            const searchVal = this.searchWidget.getValue();
            clearInputAction.enabled = !!searchVal;
            this.searchInputDelayer.trigger(() => this.onSearchInputChanged(true));
        }));
        const headerControlsContainer = DOM.append(this.headerContainer, $('.settings-header-controls'));
        headerControlsContainer.style.borderColor = asCssVariable(settingsHeaderBorder);
        const targetWidgetContainer = DOM.append(headerControlsContainer, $('.settings-target-container'));
        this.settingsTargetsWidget = this._register(this.instantiationService.createInstance(SettingsTargetsWidget, targetWidgetContainer, { enableRemoteSettings: true }));
        this.settingsTargetsWidget.settingsTarget = 3 /* ConfigurationTarget.USER_LOCAL */;
        this._register(this.settingsTargetsWidget.onDidTargetChange(target => this.onDidSettingsTargetChange(target)));
        this._register(DOM.addDisposableListener(targetWidgetContainer, DOM.EventType.KEY_DOWN, e => {
            const event = new StandardKeyboardEvent(e);
            if (event.keyCode === 18 /* KeyCode.DownArrow */) {
                this.focusSettings();
            }
        }));
        if (this.userDataSyncWorkbenchService.enabled && this.userDataSyncEnablementService.canToggleEnablement()) {
            const syncControls = this._register(this.instantiationService.createInstance(SyncControls, this.window, headerControlsContainer));
            this._register(syncControls.onDidChangeLastSyncedLabel(lastSyncedLabel => {
                this.lastSyncedLabel = lastSyncedLabel;
                this.updateInputAriaLabel();
            }));
        }
        this.controlsElement = DOM.append(this.searchContainer, DOM.$('.search-container-widgets'));
        this.countElement = DOM.append(this.controlsElement, DOM.$('.settings-count-widget.monaco-count-badge.long'));
        this.searchInputActionBar = this._register(new ActionBar(this.controlsElement, {
            actionViewItemProvider: (action, options) => {
                if (action.id === filterAction.id) {
                    return this.instantiationService.createInstance(SettingsSearchFilterDropdownMenuActionViewItem, action, options, this.actionRunner, this.searchWidget);
                }
                if (this.showAiResultsAction && action.id === this.showAiResultsAction.id) {
                    const keybindingLabel = this.keybindingService.lookupKeybinding(SETTINGS_EDITOR_COMMAND_TOGGLE_AI_SEARCH)?.getLabel();
                    return new ToggleActionViewItem(null, action, { ...options, keybinding: keybindingLabel, toggleStyles: defaultToggleStyles });
                }
                return undefined;
            }
        }));
        const actionsToPush = [clearInputAction, filterAction];
        this.searchInputActionBar.push(actionsToPush, { label: false, icon: true });
        this.disableAiSearchToggle();
        this.updateAiSearchToggleVisibility();
    }
    toggleAiSearch() {
        if (this.searchInputActionBar && this.showAiResultsAction && this.searchInputActionBar.hasAction(this.showAiResultsAction)) {
            if (!this.showAiResultsAction.enabled) {
                aria.status(localize('noAiResults', "No AI results available at this time."));
            }
            this.showAiResultsAction.checked = !this.showAiResultsAction.checked;
        }
    }
    async onDidToggleAiSearch() {
        if (this.searchResultModel && this.showAiResultsAction) {
            this.searchResultModel.showAiResults = this.showAiResultsAction.checked ?? false;
            this.renderResultCountMessages(false);
            this.onDidFinishSearch(true, undefined);
        }
    }
    onDidSettingsTargetChange(target) {
        this.viewState.settingsTarget = target;
        // TODO Instead of rebuilding the whole model, refresh and uncache the inspected setting value
        this.onConfigUpdate(undefined, true);
    }
    onDidDismissExtensionSetting(extensionId) {
        if (!this.dismissedExtensionSettings.includes(extensionId)) {
            this.dismissedExtensionSettings.push(extensionId);
        }
        this.storageService.store(this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY, this.dismissedExtensionSettings.join(this.DISMISSED_EXTENSION_SETTINGS_DELIMITER), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.onConfigUpdate(undefined, true);
    }
    onDidClickSetting(evt, recursed) {
        // eslint-disable-next-line no-restricted-syntax
        const targetElement = this.currentSettingsModel?.getElementsByName(evt.targetKey)?.[0];
        let revealFailed = false;
        if (targetElement) {
            let sourceTop = 0.5;
            try {
                const _sourceTop = this.settingsTree.getRelativeTop(evt.source);
                if (_sourceTop !== null) {
                    sourceTop = _sourceTop;
                }
            }
            catch {
                // e.g. clicked a searched element, now the search has been cleared
            }
            // If we search for something and focus on a category, the settings tree
            // only renders settings in that category.
            // If the target display category is different than the source's, unfocus the category
            // so that we can render all found settings again.
            // Then, the reveal call will correctly find the target setting.
            if (this.viewState.categoryFilter && evt.source.displayCategory !== targetElement.displayCategory) {
                this.tocTree.setFocus([]);
            }
            try {
                this.settingsTree.reveal(targetElement, sourceTop);
            }
            catch (_) {
                // The listwidget couldn't find the setting to reveal,
                // even though it's in the model, meaning there might be a filter
                // preventing it from showing up.
                revealFailed = true;
            }
            if (!revealFailed) {
                // We need to shift focus from the setting that contains the link to the setting that's
                // linked. Clicking on the link sets focus on the setting that contains the link,
                // which is why we need the setTimeout.
                setTimeout(() => {
                    this.settingsTree.setFocus([targetElement]);
                }, 50);
                const domElements = this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), evt.targetKey);
                if (domElements && domElements[0]) {
                    // eslint-disable-next-line no-restricted-syntax
                    const control = domElements[0].querySelector(AbstractSettingRenderer.CONTROL_SELECTOR);
                    if (control) {
                        control.focus();
                    }
                }
            }
        }
        if (!recursed && (!targetElement || revealFailed)) {
            // Search for the target setting by ID so it becomes visible,
            // even if it's an advanced setting that would be hidden with an empty query.
            const idQuery = `@id:${evt.targetKey}`;
            // Set the widget value first, then cancel the debounced search it triggers,
            // so that only the direct triggerSearch call below runs.
            this.searchWidget.setValue(idQuery);
            this.searchInputDelayer.cancel();
            const p = this.triggerSearch(idQuery, true);
            p.then(() => {
                this.onDidClickSetting(evt, true);
            });
        }
    }
    switchToSettingsFile() {
        const query = parseQuery(this.searchWidget.getValue()).query;
        return this.openSettingsFile({ query });
    }
    async openSettingsFile(options) {
        const currentSettingsTarget = this.settingsTargetsWidget.settingsTarget;
        const openOptions = { jsonEditor: true, groupId: this.group.id, ...options };
        if (currentSettingsTarget === 3 /* ConfigurationTarget.USER_LOCAL */) {
            if (options?.revealSetting) {
                const configurationProperties = Registry.as(Extensions.Configuration).getConfigurationProperties();
                const configurationScope = configurationProperties[options?.revealSetting.key]?.scope;
                if (configurationScope && APPLICATION_SCOPES.includes(configurationScope)) {
                    return this.preferencesService.openApplicationSettings(openOptions);
                }
            }
            return this.preferencesService.openUserSettings(openOptions);
        }
        else if (currentSettingsTarget === 4 /* ConfigurationTarget.USER_REMOTE */) {
            return this.preferencesService.openRemoteSettings(openOptions);
        }
        else if (currentSettingsTarget === 5 /* ConfigurationTarget.WORKSPACE */) {
            return this.preferencesService.openWorkspaceSettings(openOptions);
        }
        else if (URI.isUri(currentSettingsTarget)) {
            return this.preferencesService.openFolderSettings({ folderUri: currentSettingsTarget, ...openOptions });
        }
        return undefined;
    }
    createBody(parent) {
        this.bodyContainer = DOM.append(parent, $('.settings-body'));
        this.noResultsMessage = DOM.append(this.bodyContainer, $('.no-results-message'));
        this.noResultsMessage.innerText = localize('noResults', "No Settings Found");
        this.clearFilterLinkContainer = $('span.clear-search-filters');
        this.clearFilterLinkContainer.textContent = ' - ';
        const clearFilterLink = DOM.append(this.clearFilterLinkContainer, $('a.pointer.prominent', { tabindex: 0 }, localize('clearSearchFilters', 'Clear Filters')));
        this._register(DOM.addDisposableListener(clearFilterLink, DOM.EventType.CLICK, (e) => {
            DOM.EventHelper.stop(e, false);
            this.clearSearchFilters();
        }));
        DOM.append(this.noResultsMessage, this.clearFilterLinkContainer);
        this.noResultsMessage.style.color = asCssVariable(editorForeground);
        this.tocTreeContainer = $('.settings-toc-container');
        this.settingsTreeContainer = $('.settings-tree-container');
        this.createTOC(this.tocTreeContainer);
        this.createSettingsTree(this.settingsTreeContainer);
        this.splitView = this._register(new SplitView(this.bodyContainer, {
            orientation: 1 /* Orientation.HORIZONTAL */,
            proportionalLayout: true
        }));
        const startingWidth = this.storageService.getNumber('settingsEditor2.splitViewWidth', 0 /* StorageScope.PROFILE */, SettingsEditor2_1.TOC_RESET_WIDTH);
        this.splitView.addView({
            onDidChange: Event.None,
            element: this.tocTreeContainer,
            minimumSize: SettingsEditor2_1.TOC_MIN_WIDTH,
            maximumSize: Number.POSITIVE_INFINITY,
            layout: (width, _, height) => {
                this.tocTreeContainer.style.width = `${width}px`;
                this.tocTree.layout(height, width);
            }
        }, startingWidth, undefined, true);
        this.splitView.addView({
            onDidChange: Event.None,
            element: this.settingsTreeContainer,
            minimumSize: SettingsEditor2_1.EDITOR_MIN_WIDTH,
            maximumSize: Number.POSITIVE_INFINITY,
            layout: (width, _, height) => {
                this.settingsTreeContainer.style.width = `${width}px`;
                this.settingsTree.layout(height, width);
            }
        }, Sizing.Distribute, undefined, true);
        this._register(this.splitView.onDidSashReset(() => {
            const totalSize = this.splitView.getViewSize(0) + this.splitView.getViewSize(1);
            this.splitView.resizeView(0, SettingsEditor2_1.TOC_RESET_WIDTH);
            this.splitView.resizeView(1, totalSize - SettingsEditor2_1.TOC_RESET_WIDTH);
        }));
        this._register(this.splitView.onDidSashChange(() => {
            const width = this.splitView.getViewSize(0);
            this.storageService.store('settingsEditor2.splitViewWidth', width, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }));
        const borderColor = this.theme.getColor(settingsSashBorder);
        this.splitView.style({ separatorBorder: borderColor });
    }
    addCtrlAInterceptor(container) {
        this._register(DOM.addStandardDisposableListener(container, DOM.EventType.KEY_DOWN, (e) => {
            if (e.keyCode === 31 /* KeyCode.KeyA */ &&
                (platform.isMacintosh ? e.metaKey : e.ctrlKey) &&
                !DOM.isEditableElement(e.target)) {
                // Avoid browser ctrl+a
                e.browserEvent.stopPropagation();
                e.browserEvent.preventDefault();
            }
        }));
    }
    createTOC(container) {
        this.tocTreeModel = this.instantiationService.createInstance(TOCTreeModel, this.viewState);
        this.tocTree = this._register(this.instantiationService.createInstance(TOCTree, DOM.append(container, $('.settings-toc-wrapper', {
            'role': 'navigation',
            'aria-label': localize('settings', "Settings"),
        })), this.viewState));
        this.tocTreeDisposed = false;
        this._register(this.tocTree.onDidFocus(() => {
            this._currentFocusContext = 1 /* SettingsFocusContext.TableOfContents */;
        }));
        this._register(this.tocTree.onDidChangeFocus(e => {
            const element = e.elements?.[0] ?? null;
            if (this.tocFocusedElement === element) {
                return;
            }
            this.tocFocusedElement = element;
            this.tocTree.setSelection(element ? [element] : []);
            // Filter to show only the selected category
            if (this.viewState.categoryFilter !== element) {
                this.viewState.categoryFilter = element ?? undefined;
                // Force render in this case, because
                // onDidClickSetting relies on the updated view.
                this.renderTree(undefined, true);
                this.settingsTree.scrollTop = 0;
            }
        }));
        this._register(this.tocTree.onDidFocus(() => {
            this.tocRowFocused.set(true);
        }));
        this._register(this.tocTree.onDidBlur(() => {
            this.tocRowFocused.set(false);
        }));
        this._register(this.tocTree.onDidDispose(() => {
            this.tocTreeDisposed = true;
        }));
    }
    applyFilter(filter) {
        if (this.searchWidget && !this.searchWidget.getValue().includes(filter)) {
            // Prepend the filter to the query.
            const newQuery = `${filter} ${this.searchWidget.getValue().trimStart()}`;
            this.focusSearch(newQuery, false);
        }
    }
    removeLanguageFilters() {
        if (this.searchWidget && this.searchWidget.getValue().includes(`@${LANGUAGE_SETTING_TAG}`)) {
            const query = this.searchWidget.getValue().split(' ');
            const newQuery = query.filter(word => !word.startsWith(`@${LANGUAGE_SETTING_TAG}`)).join(' ');
            this.focusSearch(newQuery, false);
        }
    }
    createSettingsTree(container) {
        this.settingRenderers = this._register(this.instantiationService.createInstance(SettingTreeRenderers));
        this._register(this.settingRenderers.onDidChangeSetting(e => this.onDidChangeSetting(e.key, e.value, e.type, e.manualReset, e.scope)));
        this._register(this.settingRenderers.onDidDismissExtensionSetting((e) => this.onDidDismissExtensionSetting(e)));
        this._register(this.settingRenderers.onDidOpenSettings(settingKey => {
            this.openSettingsFile({ revealSetting: { key: settingKey, edit: true } });
        }));
        this._register(this.settingRenderers.onDidClickSettingLink(settingName => this.onDidClickSetting(settingName)));
        this._register(this.settingRenderers.onDidFocusSetting(element => {
            this.settingsTree.setFocus([element]);
            this._currentFocusContext = 3 /* SettingsFocusContext.SettingControl */;
            this.settingRowFocused.set(false);
        }));
        this._register(this.settingRenderers.onDidChangeSettingHeight((params) => {
            const { element, height } = params;
            try {
                this.settingsTree.updateElementHeight(element, height);
            }
            catch (e) {
                // the element was not found
            }
        }));
        this._register(this.settingRenderers.onApplyFilter((filter) => this.applyFilter(filter)));
        this._register(this.settingRenderers.onDidClickOverrideElement((element) => {
            this.removeLanguageFilters();
            if (element.language) {
                this.applyFilter(`@${LANGUAGE_SETTING_TAG}${element.language}`);
            }
            if (element.scope === 'workspace') {
                this.settingsTargetsWidget.updateTarget(5 /* ConfigurationTarget.WORKSPACE */);
            }
            else if (element.scope === 'user') {
                this.settingsTargetsWidget.updateTarget(3 /* ConfigurationTarget.USER_LOCAL */);
            }
            else if (element.scope === 'remote') {
                this.settingsTargetsWidget.updateTarget(4 /* ConfigurationTarget.USER_REMOTE */);
            }
            this.applyFilter(`@${ID_SETTING_TAG}${element.settingKey}`);
        }));
        this.settingsTree = this._register(this.instantiationService.createInstance(SettingsTree, container, this.viewState, this.settingRenderers.allRenderers));
        this._register(this.settingsTree.onDidScroll(() => {
            if (this.settingsTree.scrollTop === this.settingsTreeScrollTop) {
                return;
            }
            this.settingsTreeScrollTop = this.settingsTree.scrollTop;
            // setTimeout because calling setChildren on the settingsTree can trigger onDidScroll, so it fires when
            // setChildren has called on the settings tree but not the toc tree yet, so their rendered elements are out of sync
            setTimeout(() => {
                this.updateTreeScrollSync();
            }, 0);
        }));
        this._register(this.settingsTree.onDidFocus(() => {
            const classList = container.ownerDocument.activeElement?.classList;
            if (classList && classList.contains('monaco-list') && classList.contains('settings-editor-tree')) {
                this._currentFocusContext = 2 /* SettingsFocusContext.SettingTree */;
                this.settingRowFocused.set(true);
                this.treeFocusedElement ??= this.settingsTree.firstVisibleElement ?? null;
                if (this.treeFocusedElement) {
                    this.treeFocusedElement.tabbable = true;
                }
            }
        }));
        this._register(this.settingsTree.onDidBlur(() => {
            this.settingRowFocused.set(false);
            // Clear out the focused element, otherwise it could be
            // out of date during the next onDidFocus event.
            this.treeFocusedElement = null;
        }));
        // There is no different select state in the settings tree
        this._register(this.settingsTree.onDidChangeFocus(e => {
            const element = e.elements[0];
            if (this.treeFocusedElement === element) {
                return;
            }
            if (this.treeFocusedElement) {
                this.treeFocusedElement.tabbable = false;
            }
            this.treeFocusedElement = element;
            if (this.treeFocusedElement) {
                this.treeFocusedElement.tabbable = true;
            }
            this.settingsTree.setSelection(element ? [element] : []);
        }));
    }
    onDidChangeSetting(key, value, type, manualReset, scope) {
        const parsedQuery = parseQuery(this.searchWidget.getValue());
        const languageFilter = parsedQuery.languageFilter;
        if (manualReset || (this.pendingSettingUpdate && this.pendingSettingUpdate.key !== key)) {
            this.updateChangedSetting(key, value, manualReset, languageFilter, scope);
        }
        this.pendingSettingUpdate = { key, value, languageFilter };
        if (SettingsEditor2_1.shouldSettingUpdateFast(type)) {
            this.settingFastUpdateDelayer.trigger(() => this.updateChangedSetting(key, value, manualReset, languageFilter, scope));
        }
        else {
            this.settingSlowUpdateDelayer.trigger(() => this.updateChangedSetting(key, value, manualReset, languageFilter, scope));
        }
    }
    updateTreeScrollSync() {
        this.settingRenderers.cancelSuggesters();
    }
    updateChangedSetting(key, value, manualReset, languageFilter, scope) {
        // ConfigurationService displays the error if this fails.
        // Force a render afterwards because onDidConfigurationUpdate doesn't fire if the update doesn't result in an effective setting value change.
        const settingsTarget = this.settingsTargetsWidget.settingsTarget;
        const resource = URI.isUri(settingsTarget) ? settingsTarget : undefined;
        const configurationTarget = (resource ? 6 /* ConfigurationTarget.WORKSPACE_FOLDER */ : settingsTarget) ?? 3 /* ConfigurationTarget.USER_LOCAL */;
        const overrides = { resource, overrideIdentifiers: languageFilter ? [languageFilter] : undefined };
        const configurationTargetIsWorkspace = configurationTarget === 5 /* ConfigurationTarget.WORKSPACE */ || configurationTarget === 6 /* ConfigurationTarget.WORKSPACE_FOLDER */;
        const userPassedInManualReset = configurationTargetIsWorkspace || !!languageFilter;
        const isManualReset = userPassedInManualReset ? manualReset : value === undefined;
        // If the user is changing the value back to the default, and we're not targeting a workspace scope, do a 'reset' instead
        const inspected = this.configurationService.inspect(key, overrides);
        if (!userPassedInManualReset && inspected.defaultValue === value) {
            value = undefined;
        }
        return this.configurationService.updateValue(key, value, overrides, configurationTarget, { handleDirtyFile: 'save' })
            .then(() => {
            const query = this.searchWidget.getValue();
            if (query.includes(`@${MODIFIED_SETTING_TAG}`)) {
                // The user might have reset a setting.
                this.refreshTOCTree();
            }
            this.renderTree(key, isManualReset);
            this.pendingSettingUpdate = null;
            const reportModifiedProps = {
                key,
                query,
                searchResults: this.searchResultModel?.getUniqueSearchResults() ?? null,
                rawResults: this.searchResultModel?.getRawResults() ?? null,
                showConfiguredOnly: !!this.viewState.tagFilters && this.viewState.tagFilters.has(MODIFIED_SETTING_TAG),
                isReset: typeof value === 'undefined',
                settingsTarget: this.settingsTargetsWidget.settingsTarget
            };
            return this.reportModifiedSetting(reportModifiedProps);
        });
    }
    reportModifiedSetting(props) {
        let groupId = undefined;
        let providerName = undefined;
        let nlpIndex = undefined;
        let displayIndex = undefined;
        if (props.searchResults) {
            displayIndex = props.searchResults.filterMatches.findIndex(m => m.setting.key === props.key);
            if (this.searchResultModel) {
                providerName = props.searchResults.filterMatches.find(m => m.setting.key === props.key)?.providerName;
                const rawResults = this.searchResultModel.getRawResults();
                if (rawResults[0 /* SearchResultIdx.Local */] && displayIndex >= 0) {
                    const settingInLocalResults = rawResults[0 /* SearchResultIdx.Local */].filterMatches.some(m => m.setting.key === props.key);
                    groupId = settingInLocalResults ? 'local' : 'remote';
                }
                if (rawResults[1 /* SearchResultIdx.Remote */]) {
                    const _nlpIndex = rawResults[1 /* SearchResultIdx.Remote */].filterMatches.findIndex(m => m.setting.key === props.key);
                    nlpIndex = _nlpIndex >= 0 ? _nlpIndex : undefined;
                }
            }
        }
        const reportedTarget = props.settingsTarget === 3 /* ConfigurationTarget.USER_LOCAL */ ? 'user' :
            props.settingsTarget === 4 /* ConfigurationTarget.USER_REMOTE */ ? 'user_remote' :
                props.settingsTarget === 5 /* ConfigurationTarget.WORKSPACE */ ? 'workspace' :
                    'folder';
        const data = {
            key: props.key,
            groupId,
            providerName,
            nlpIndex,
            displayIndex,
            showConfiguredOnly: props.showConfiguredOnly,
            isReset: props.isReset,
            target: reportedTarget
        };
        this.telemetryService.publicLog2('settingsEditor.settingModified', data);
    }
    scheduleRefresh(element, key = '') {
        if (key && this.scheduledRefreshes.has(key)) {
            return;
        }
        if (!key) {
            dispose(this.scheduledRefreshes.values());
            this.scheduledRefreshes.clear();
        }
        const store = new DisposableStore();
        const scheduledRefreshTracker = DOM.trackFocus(element);
        store.add(scheduledRefreshTracker);
        store.add(scheduledRefreshTracker.onDidBlur(() => {
            this.scheduledRefreshes.get(key)?.dispose();
            this.scheduledRefreshes.delete(key);
            this.onConfigUpdate(new Set([key]));
        }));
        this.scheduledRefreshes.set(key, store);
    }
    createSettingsOrderByTocIndex(resolvedSettingsRoot) {
        const index = new Map();
        function indexSettings(resolvedSettingsRoot, counter = 0) {
            if (resolvedSettingsRoot.settings) {
                for (const setting of resolvedSettingsRoot.settings) {
                    if (!index.has(setting.key)) {
                        index.set(setting.key, counter++);
                    }
                }
            }
            if (resolvedSettingsRoot.children) {
                for (const child of resolvedSettingsRoot.children) {
                    counter = indexSettings(child, counter);
                }
            }
            return counter;
        }
        indexSettings(resolvedSettingsRoot);
        return index;
    }
    refreshModels(resolvedSettingsRoot) {
        // Both calls to refreshModels require a valid settingsTreeModel.
        this.settingsTreeModel.value.update(resolvedSettingsRoot);
        this.tocTreeModel.settingsTreeRoot = this.settingsTreeModel.value.root;
        this.settingsOrderByTocIndex = this.createSettingsOrderByTocIndex(resolvedSettingsRoot);
    }
    async onConfigUpdate(keys, forceRefresh = false, triggerSearch = false) {
        if (keys && this.settingsTreeModel) {
            return this.updateElementsByKey(keys);
        }
        if (!this.defaultSettingsEditorModel) {
            return;
        }
        const groups = this.defaultSettingsEditorModel.settingsGroups.slice(1); // Without commonlyUsed
        const coreSettingsGroups = [], extensionSettingsGroups = [];
        for (const group of groups) {
            if (group.extensionInfo) {
                extensionSettingsGroups.push(group);
            }
            else {
                coreSettingsGroups.push(group);
            }
        }
        const filter = this.canShowAdvancedSettings() ? undefined : { exclude: { tags: [ADVANCED_SETTING_TAG] } };
        const settingsResult = resolveSettingsTree(tocData, coreSettingsGroups, filter, this.logService);
        const resolvedSettingsRoot = settingsResult.tree;
        // Warn for settings not included in layout
        if (settingsResult.leftoverSettings.size && !this.hasWarnedMissingSettings) {
            const settingKeyList = [];
            settingsResult.leftoverSettings.forEach(s => {
                settingKeyList.push(s.key);
            });
            this.logService.warn(`SettingsEditor2: Settings not included in settingsLayout.ts: ${settingKeyList.join(', ')}`);
            this.hasWarnedMissingSettings = true;
        }
        const additionalGroups = [];
        let setAdditionalGroups = false;
        const toggleData = await getExperimentalExtensionToggleData(this.chatEntitlementService, this.extensionGalleryService, this.productService);
        if (toggleData && groups.filter(g => g.extensionInfo).length && Object.keys(toggleData.settingsEditorRecommendedExtensions).length) {
            // Refresh installed extensions once per onConfigUpdate invocation for performance,
            // instead of per extension. The installed list may still change while iterating.
            await this.refreshInstalledExtensionsList();
            for (const key in toggleData.settingsEditorRecommendedExtensions) {
                const extension = toggleData.recommendedExtensionsGalleryInfo[key];
                if (!extension) {
                    continue;
                }
                const extensionId = extension.identifier.id;
                const extensionInstalled = this.installedExtensionIds.includes(extensionId);
                // Drill down to see whether the group and setting already exist
                // and need to be removed.
                const matchingGroupIndex = groups.findIndex(g => g.extensionInfo && g.extensionInfo.id.toLowerCase() === extensionId.toLowerCase() &&
                    g.sections.length === 1 && g.sections[0].settings.length === 1 && g.sections[0].settings[0].displayExtensionId);
                if (extensionInstalled || this.dismissedExtensionSettings.includes(extensionId)) {
                    if (matchingGroupIndex !== -1) {
                        groups.splice(matchingGroupIndex, 1);
                        setAdditionalGroups = true;
                    }
                    continue;
                }
                if (matchingGroupIndex !== -1) {
                    continue;
                }
                // Create the entry. extensionInstalled is false in this case.
                let manifest = null;
                try {
                    manifest = await raceTimeout(this.extensionGalleryService.getManifest(extension, CancellationToken.None), EXTENSION_FETCH_TIMEOUT_MS) ?? null;
                }
                catch (e) {
                    // Likely a networking issue.
                    // Skip adding a button for this extension to the Settings editor.
                    continue;
                }
                if (manifest === null) {
                    continue;
                }
                const contributesConfiguration = manifest?.contributes?.configuration;
                let groupTitle;
                if (!Array.isArray(contributesConfiguration)) {
                    groupTitle = contributesConfiguration?.title;
                }
                else if (contributesConfiguration.length === 1) {
                    groupTitle = contributesConfiguration[0].title;
                }
                const recommendationInfo = toggleData.settingsEditorRecommendedExtensions[key];
                const extensionName = extension.displayName ?? extension.name ?? extensionId;
                const settingKey = `${key}.manageExtension`;
                const setting = {
                    range: nullRange,
                    key: settingKey,
                    keyRange: nullRange,
                    value: null,
                    valueRange: nullRange,
                    description: [recommendationInfo.onSettingsEditorOpen?.descriptionOverride ?? extension.description],
                    descriptionIsMarkdown: false,
                    descriptionRanges: [],
                    scope: 4 /* ConfigurationScope.WINDOW */,
                    type: 'null',
                    displayExtensionId: extensionId,
                    extensionGroupTitle: groupTitle ?? extensionName,
                    categoryLabel: 'Extensions',
                    title: extensionName
                };
                const additionalGroup = {
                    sections: [{
                            settings: [setting],
                        }],
                    id: extensionId,
                    title: setting.extensionGroupTitle,
                    titleRange: nullRange,
                    range: nullRange,
                    extensionInfo: {
                        id: extensionId,
                        displayName: extension.displayName,
                    }
                };
                groups.push(additionalGroup);
                additionalGroups.push(additionalGroup);
                setAdditionalGroups = true;
            }
        }
        resolvedSettingsRoot.children.push(await createTocTreeForExtensionSettings(this.extensionService, extensionSettingsGroups, filter));
        resolvedSettingsRoot.children.unshift(getCommonlyUsedData(groups));
        if (toggleData && setAdditionalGroups) {
            // Add the additional groups to the model to help with searching.
            this.defaultSettingsEditorModel.setAdditionalGroups(additionalGroups);
        }
        if (!this.workspaceTrustManagementService.isWorkspaceTrusted() && (this.viewState.settingsTarget instanceof URI || this.viewState.settingsTarget === 5 /* ConfigurationTarget.WORKSPACE */)) {
            const configuredUntrustedWorkspaceSettings = resolveConfiguredUntrustedSettings(groups, this.viewState.settingsTarget, this.viewState.languageFilter, this.configurationService);
            if (configuredUntrustedWorkspaceSettings.length) {
                resolvedSettingsRoot.children.unshift({
                    id: 'workspaceTrust',
                    label: localize('settings require trust', "Workspace Trust"),
                    settings: configuredUntrustedWorkspaceSettings
                });
            }
        }
        this.searchResultModel?.updateChildren();
        const firstVisibleElement = this.settingsTree.firstVisibleElement;
        let anchorId;
        if (firstVisibleElement instanceof SettingsTreeSettingElement) {
            anchorId = firstVisibleElement.setting.key;
        }
        else if (firstVisibleElement instanceof SettingsTreeGroupElement) {
            anchorId = firstVisibleElement.id;
        }
        if (this.settingsTreeModel.value) {
            this.refreshModels(resolvedSettingsRoot);
            if (triggerSearch && this.searchResultModel) {
                // If an extension's settings were just loaded and a search is active, retrigger the search so it shows up
                return await this.onSearchInputChanged(false);
            }
            this.refreshTOCTree();
            this.renderTree(undefined, forceRefresh);
            if (anchorId) {
                const newModel = this.settingsTreeModel.value;
                let newElement;
                // eslint-disable-next-line no-restricted-syntax
                const settings = newModel.getElementsByName(anchorId);
                if (settings && settings.length > 0) {
                    newElement = settings[0];
                }
                else {
                    const findGroup = (roots) => {
                        for (const g of roots) {
                            if (g.id === anchorId) {
                                return g;
                            }
                            if (g.children) {
                                for (const child of g.children) {
                                    if (child instanceof SettingsTreeGroupElement) {
                                        const found = findGroup([child]);
                                        if (found) {
                                            return found;
                                        }
                                    }
                                }
                            }
                        }
                        return undefined;
                    };
                    newElement = findGroup([newModel.root]);
                }
                if (newElement) {
                    try {
                        this.settingsTree.reveal(newElement, 0);
                    }
                    catch (e) {
                        // Ignore the error
                    }
                }
            }
        }
        else {
            this.settingsTreeModel.value = this.instantiationService.createInstance(SettingsTreeModel, this.viewState, this.workspaceTrustManagementService.isWorkspaceTrusted());
            this.refreshModels(resolvedSettingsRoot);
            // Don't restore the cached state if we already have a query value from calling _setOptions().
            const cachedState = !this.viewState.query ? this.restoreCachedState() : undefined;
            if (cachedState?.searchQuery || this.searchWidget.getValue()) {
                await this.onSearchInputChanged(true);
            }
            else {
                this.refreshTOCTree();
                // Set initial category to the first one (Commonly Used)
                const rootChildren = this.settingsTreeModel.value.root.children;
                if (Array.isArray(rootChildren) && rootChildren.length > 0) {
                    const firstCategory = rootChildren[0];
                    if (firstCategory instanceof SettingsTreeGroupElement) {
                        this.viewState.categoryFilter = firstCategory;
                        this.tocTree.setFocus([firstCategory]);
                        this.tocTree.setSelection([firstCategory]);
                    }
                }
                this.refreshTree();
                this.tocTree.collapseAll();
            }
        }
    }
    updateElementsByKey(keys) {
        if (keys.size) {
            if (this.searchResultModel) {
                keys.forEach(key => this.searchResultModel.updateElementsByName(key));
            }
            if (this.settingsTreeModel.value) {
                keys.forEach(key => this.settingsTreeModel.value.updateElementsByName(key));
            }
            keys.forEach(key => this.renderTree(key));
        }
        else {
            this.renderTree();
        }
    }
    getActiveControlInSettingsTree() {
        const element = this.settingsTree.getHTMLElement();
        const activeElement = element.ownerDocument.activeElement;
        return (activeElement && DOM.isAncestorOfActiveElement(element)) ?
            activeElement :
            null;
    }
    renderTree(key, force = false) {
        if (!force && key && this.scheduledRefreshes.has(key)) {
            this.updateModifiedLabelForKey(key);
            return;
        }
        // If the context view is focused, delay rendering settings
        if (this.contextViewFocused()) {
            // eslint-disable-next-line no-restricted-syntax
            const element = this.window.document.querySelector('.context-view');
            if (element) {
                this.scheduleRefresh(element, key);
            }
            return;
        }
        // If a setting control is currently focused, schedule a refresh for later
        const activeElement = this.getActiveControlInSettingsTree();
        const focusedSetting = activeElement && this.settingRenderers.getSettingDOMElementForDOMElement(activeElement);
        if (focusedSetting && !force) {
            // If a single setting is being refreshed, it's ok to refresh now if that is not the focused setting
            if (key) {
                const focusedKey = focusedSetting.getAttribute(AbstractSettingRenderer.SETTING_KEY_ATTR);
                if (focusedKey === key &&
                    // update `list`s live, as they have a separate "submit edit" step built in before this
                    (focusedSetting.parentElement && !focusedSetting.parentElement.classList.contains('setting-item-list'))) {
                    this.updateModifiedLabelForKey(key);
                    this.scheduleRefresh(focusedSetting, key);
                    return;
                }
            }
            else {
                this.scheduleRefresh(focusedSetting);
                return;
            }
        }
        this.renderResultCountMessages(false);
        if (key) {
            // eslint-disable-next-line no-restricted-syntax
            const elements = this.currentSettingsModel?.getElementsByName(key);
            if (elements?.length) {
                if (elements.length >= 2) {
                    console.warn('More than one setting with key ' + key + ' found');
                }
                this.refreshSingleElement(elements[0]);
            }
            else {
                // Refresh requested for a key that we don't know about
                return;
            }
        }
        else {
            this.refreshTree();
        }
        return;
    }
    contextViewFocused() {
        return !!DOM.findParentWithClass(this.rootElement.ownerDocument.activeElement, 'context-view');
    }
    refreshSingleElement(element) {
        if (this.isVisible()
            && this.settingsTree.hasElement(element)
            && (!element.setting.deprecationMessage || element.isConfigured)) {
            this.settingsTree.rerender(element);
        }
    }
    refreshTree() {
        if (this.isVisible() && this.currentSettingsModel) {
            this.settingsTree.setChildren(null, createGroupIterator(this.currentSettingsModel.root));
        }
    }
    refreshTOCTree() {
        if (this.isVisible()) {
            this.tocTreeModel.update();
            this.tocTree.setChildren(null, createTOCIterator(this.tocTreeModel, this.tocTree));
        }
    }
    updateModifiedLabelForKey(key) {
        if (!this.currentSettingsModel) {
            return;
        }
        // eslint-disable-next-line no-restricted-syntax
        const dataElements = this.currentSettingsModel.getElementsByName(key);
        const isModified = dataElements && dataElements[0] && dataElements[0].isConfigured; // all elements are either configured or not
        const elements = this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), key);
        if (elements && elements[0]) {
            elements[0].classList.toggle('is-configured', !!isModified);
        }
    }
    async onSearchInputChanged(expandResults) {
        if (!this.currentSettingsModel) {
            // Initializing search widget value
            return;
        }
        const query = this.searchWidget.getValue().trim();
        this.viewState.query = query;
        await this.triggerSearch(query.replace(/\u203A/g, ' '), expandResults);
    }
    parseSettingFromJSON(query) {
        const match = query.match(/"([a-zA-Z.]+)": /);
        return match && match[1];
    }
    /**
     * Toggles the visibility of the Settings editor table of contents during a search
     * depending on the behavior.
     */
    toggleTocBySearchBehaviorType() {
        const tocBehavior = this.configurationService.getValue(SEARCH_TOC_BEHAVIOR_KEY);
        const hideToc = tocBehavior === 'hide';
        if (hideToc) {
            this.splitView.setViewVisible(0, false);
            this.splitView.style({
                separatorBorder: Color.transparent
            });
        }
        else {
            this.layoutSplitView(this.dimension);
        }
    }
    async triggerSearch(query, expandResults) {
        const progressRunner = this.editorProgressService.show(true, 800);
        const showAdvanced = this.viewState.tagFilters?.has(ADVANCED_SETTING_TAG);
        this.viewState.tagFilters = new Set();
        this.viewState.extensionFilters = new Set();
        this.viewState.featureFilters = new Set();
        this.viewState.idFilters = new Set();
        this.viewState.languageFilter = undefined;
        if (query) {
            const parsedQuery = parseQuery(query);
            query = parsedQuery.query;
            parsedQuery.tags.forEach(tag => this.viewState.tagFilters.add(tag));
            parsedQuery.extensionFilters.forEach(extensionId => this.viewState.extensionFilters.add(extensionId));
            parsedQuery.featureFilters.forEach(feature => this.viewState.featureFilters.add(feature));
            parsedQuery.idFilters.forEach(id => this.viewState.idFilters.add(id));
            this.viewState.languageFilter = parsedQuery.languageFilter;
        }
        if (showAdvanced !== this.viewState.tagFilters?.has(ADVANCED_SETTING_TAG)) {
            await this.onConfigUpdate();
        }
        this.settingsTargetsWidget.updateLanguageFilterIndicators(this.viewState.languageFilter);
        if (query && query !== '@') {
            query = this.parseSettingFromJSON(query) || query;
            await this.triggerFilterPreferences(query, expandResults, progressRunner);
            this.toggleTocBySearchBehaviorType();
        }
        else {
            if (this.viewState.tagFilters.size || this.viewState.extensionFilters.size || this.viewState.featureFilters.size || this.viewState.idFilters.size || this.viewState.languageFilter) {
                this.searchResultModel = this.createFilterModel();
            }
            else {
                this.searchResultModel = null;
            }
            this.searchDelayer.cancel();
            if (this.searchInProgress) {
                this.searchInProgress.dispose(true);
                this.searchInProgress = null;
            }
            if (expandResults) {
                this.tocTree.setFocus([]);
                this.viewState.categoryFilter = undefined;
            }
            this.tocTreeModel.currentSearchModel = this.searchResultModel;
            if (this.searchResultModel) {
                // Added a filter model
                if (expandResults) {
                    this.tocTree.setSelection([]);
                    this.tocTree.expandAll();
                }
                this.refreshTOCTree();
                this.renderResultCountMessages(false);
                this.refreshTree();
                this.toggleTocBySearchBehaviorType();
            }
            else if (!this.tocTreeDisposed) {
                // Leaving search mode
                this.tocTree.collapseAll();
                this.refreshTOCTree();
                this.renderResultCountMessages(false);
                this.refreshTree();
                this.layoutSplitView(this.dimension);
            }
            progressRunner.done();
        }
    }
    /**
     * Return a fake SearchResultModel which can hold a flat list of all settings, to be filtered (@modified etc)
     */
    createFilterModel() {
        const filterModel = this.instantiationService.createInstance(SearchResultModel, this.viewState, this.settingsOrderByTocIndex, this.workspaceTrustManagementService.isWorkspaceTrusted());
        const fullResult = {
            filterMatches: [],
            exactMatch: false,
        };
        const shouldShowAdvanced = this.canShowAdvancedSettings();
        for (const g of this.defaultSettingsEditorModel.settingsGroups.slice(1)) {
            for (const sect of g.sections) {
                for (const setting of sect.settings) {
                    if (!shouldShowAdvanced && !this.shouldShowSetting(setting)) {
                        continue;
                    }
                    fullResult.filterMatches.push({
                        setting,
                        matches: [],
                        matchType: SettingMatchType.None,
                        keyMatchScore: 0,
                        score: 0,
                        providerName: FILTER_MODEL_SEARCH_PROVIDER_NAME
                    });
                }
            }
        }
        filterModel.setResult(0, fullResult);
        return filterModel;
    }
    async triggerFilterPreferences(query, expandResults, progressRunner) {
        if (this.searchInProgress) {
            this.searchInProgress.dispose(true);
            this.searchInProgress = null;
        }
        const searchInProgress = this.searchInProgress = new CancellationTokenSource();
        return this.searchDelayer.trigger(async () => {
            if (searchInProgress.token.isCancellationRequested) {
                return;
            }
            this.disableAiSearchToggle();
            const localResults = await this.doLocalSearch(query, searchInProgress.token);
            if (!this.searchResultModel || searchInProgress.token.isCancellationRequested) {
                return;
            }
            this.searchResultModel.showAiResults = false;
            if (localResults && localResults.filterMatches.length > 0) {
                // The remote results might take a while and
                // are always appended to the end anyway, so
                // show some results now.
                this.onDidFinishSearch(expandResults, undefined);
            }
            if (!localResults || !localResults.exactMatch) {
                await this.doRemoteSearch(query, searchInProgress.token);
            }
            if (searchInProgress.token.isCancellationRequested) {
                return;
            }
            if (this.aiSearchPromise) {
                this.aiSearchPromise.cancel();
            }
            // Kick off an AI search in the background if the toggle is shown.
            // We purposely do not await it.
            if (this.searchInputActionBar && this.showAiResultsAction && this.searchInputActionBar.hasAction(this.showAiResultsAction)) {
                this.aiSearchPromise = createCancelablePromise(token => {
                    return this.doAiSearch(query, token).then((results) => {
                        if (results && this.showAiResultsAction) {
                            this.showAiResultsAction.enabled = true;
                            this.aiResultsAvailable.set(true);
                            this.showAiResultsAction.label = SHOW_AI_RESULTS_ENABLED_LABEL;
                            this.renderResultCountMessages(true);
                        }
                    }).catch(e => {
                        if (!isCancellationError(e)) {
                            this.logService.trace('Error during AI settings search:', e);
                        }
                    });
                });
            }
            this.onDidFinishSearch(expandResults, progressRunner);
        });
    }
    onDidFinishSearch(expandResults, progressRunner) {
        this.tocTreeModel.currentSearchModel = this.searchResultModel;
        if (expandResults) {
            this.tocTree.setFocus([]);
            this.viewState.categoryFilter = undefined;
            this.tocTree.expandAll();
            this.settingsTree.scrollTop = 0;
        }
        this.refreshTOCTree();
        this.renderTree(undefined, true);
        progressRunner?.done();
    }
    doLocalSearch(query, token) {
        const localSearchProvider = this.preferencesSearchService.getLocalSearchProvider(query);
        return this.searchWithProvider(0 /* SearchResultIdx.Local */, localSearchProvider, STRING_MATCH_SEARCH_PROVIDER_NAME, token);
    }
    doRemoteSearch(query, token) {
        const remoteSearchProvider = this.preferencesSearchService.getRemoteSearchProvider(query);
        if (!remoteSearchProvider) {
            return Promise.resolve(null);
        }
        return this.searchWithProvider(1 /* SearchResultIdx.Remote */, remoteSearchProvider, TF_IDF_SEARCH_PROVIDER_NAME, token);
    }
    async doAiSearch(query, token) {
        const aiSearchProvider = this.preferencesSearchService.getAiSearchProvider(query);
        if (!aiSearchProvider) {
            return null;
        }
        const embeddingsResults = await this.searchWithProvider(3 /* SearchResultIdx.Embeddings */, aiSearchProvider, EMBEDDINGS_SEARCH_PROVIDER_NAME, token);
        if (!embeddingsResults || token.isCancellationRequested) {
            return null;
        }
        const llmResults = await this.getLLMRankedResults(query, token);
        if (token.isCancellationRequested) {
            return null;
        }
        return {
            filterMatches: embeddingsResults.filterMatches.concat(llmResults?.filterMatches ?? []),
            exactMatch: false
        };
    }
    async getLLMRankedResults(query, token) {
        const aiSearchProvider = this.preferencesSearchService.getAiSearchProvider(query);
        if (!aiSearchProvider) {
            return null;
        }
        const stopWatch = new StopWatch(false);
        const result = await aiSearchProvider.getLLMRankedResults(token);
        stopWatch.stop();
        if (token.isCancellationRequested) {
            return null;
        }
        // Only log the elapsed time if there are actual results.
        if (result && result.filterMatches.length > 0) {
            const elapsed = stopWatch.elapsed();
            this.logSearchPerformance(LLM_RANKED_SEARCH_PROVIDER_NAME, elapsed);
        }
        this.searchResultModel.setResult(4 /* SearchResultIdx.AiSelected */, result);
        return result;
    }
    async searchWithProvider(type, searchProvider, providerName, token) {
        const stopWatch = new StopWatch(false);
        const result = await this._searchPreferencesModel(this.defaultSettingsEditorModel, searchProvider, token);
        stopWatch.stop();
        if (token.isCancellationRequested) {
            // Handle cancellation like this because cancellation is lost inside the search provider due to async/await
            return null;
        }
        // Filter out advanced settings unless the advanced tag is explicitly set or setting matches an ID filter
        if (result && !this.canShowAdvancedSettings()) {
            result.filterMatches = result.filterMatches.filter(match => this.shouldShowSetting(match.setting));
        }
        // Only log the elapsed time if there are actual results.
        if (result && result.filterMatches.length > 0) {
            const elapsed = stopWatch.elapsed();
            this.logSearchPerformance(providerName, elapsed);
        }
        this.searchResultModel ??= this.instantiationService.createInstance(SearchResultModel, this.viewState, this.settingsOrderByTocIndex, this.workspaceTrustManagementService.isWorkspaceTrusted());
        this.searchResultModel.setResult(type, result);
        return result;
    }
    logSearchPerformance(providerName, elapsed) {
        this.telemetryService.publicLog2('settingsEditor.searchPerformance', {
            providerName,
            elapsedMs: elapsed,
        });
    }
    renderResultCountMessages(showAiResultsMessage) {
        if (!this.currentSettingsModel) {
            return;
        }
        this.clearFilterLinkContainer.style.display = this.viewState.tagFilters && this.viewState.tagFilters.size > 0
            ? 'initial'
            : 'none';
        if (!this.searchResultModel) {
            if (this.countElement.style.display !== 'none') {
                this.searchResultLabel = null;
                this.updateInputAriaLabel();
                this.countElement.style.display = 'none';
                this.countElement.innerText = '';
                this.layout(this.dimension);
            }
            this.rootElement.classList.remove('no-results');
            this.splitView.el.style.visibility = 'visible';
            return;
        }
        else {
            const count = this.searchResultModel.getUniqueResultsCount();
            let resultString;
            if (showAiResultsMessage) {
                switch (count) {
                    case 0:
                        resultString = localize('noResultsWithAiAvailable', "No Settings Found. AI Results Available");
                        break;
                    case 1:
                        resultString = localize('oneResultWithAiAvailable', "1 Setting Found. AI Results Available");
                        break;
                    default: resultString = localize('moreThanOneResultWithAiAvailable', "{0} Settings Found. AI Results Available", count);
                }
            }
            else {
                switch (count) {
                    case 0:
                        resultString = localize('noResults', "No Settings Found");
                        break;
                    case 1:
                        resultString = localize('oneResult', "1 Setting Found");
                        break;
                    default: resultString = localize('moreThanOneResult', "{0} Settings Found", count);
                }
            }
            this.searchResultLabel = resultString;
            this.updateInputAriaLabel();
            this.countElement.innerText = resultString;
            aria.status(resultString);
            if (this.countElement.style.display !== 'block') {
                this.countElement.style.display = 'block';
            }
            this.layout(this.dimension);
            this.rootElement.classList.toggle('no-results', count === 0);
            this.splitView.el.style.visibility = count === 0 ? 'hidden' : 'visible';
        }
    }
    async _searchPreferencesModel(model, provider, token) {
        try {
            return await provider.searchModel(model, token);
        }
        catch (err) {
            if (isCancellationError(err)) {
                return Promise.reject(err);
            }
            else {
                return null;
            }
        }
    }
    layoutSplitView(dimension) {
        if (!this.isVisible()) {
            return;
        }
        const listHeight = dimension.height - (72 + 11 + 14 /* header height + editor padding */);
        this.splitView.el.style.height = `${listHeight}px`;
        // We call layout first so the splitView has an idea of how much
        // space it has, otherwise setViewVisible results in the first panel
        // showing up at the minimum size whenever the Settings editor
        // opens for the first time.
        this.splitView.layout(this.bodyContainer.clientWidth, listHeight);
        const tocBehavior = this.configurationService.getValue(SEARCH_TOC_BEHAVIOR_KEY);
        const hideTocForSearch = tocBehavior === 'hide' && this.searchResultModel;
        if (!hideTocForSearch) {
            const firstViewWasVisible = this.splitView.isViewVisible(0);
            const firstViewVisible = this.bodyContainer.clientWidth >= SettingsEditor2_1.NARROW_TOTAL_WIDTH;
            this.splitView.setViewVisible(0, firstViewVisible);
            // If the first view is again visible, and we have enough space, immediately set the
            // editor to use the reset width rather than the cached min width
            if (!firstViewWasVisible && firstViewVisible && this.bodyContainer.clientWidth >= SettingsEditor2_1.EDITOR_MIN_WIDTH + SettingsEditor2_1.TOC_RESET_WIDTH) {
                this.splitView.resizeView(0, SettingsEditor2_1.TOC_RESET_WIDTH);
            }
            this.splitView.style({
                separatorBorder: firstViewVisible ? this.theme.getColor(settingsSashBorder) : Color.transparent
            });
        }
    }
    saveState() {
        if (this.isVisible()) {
            const searchQuery = this.searchWidget.getValue().trim();
            const target = this.settingsTargetsWidget.settingsTarget;
            if (this.input) {
                this.editorMemento.saveEditorState(this.group, this.input, { searchQuery, target });
            }
        }
        else if (this.input) {
            this.editorMemento.clearEditorState(this.input, this.group);
        }
        super.saveState();
    }
};
SettingsEditor2 = SettingsEditor2_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IWorkbenchConfigurationService),
    __param(3, ITextResourceConfigurationService),
    __param(4, IThemeService),
    __param(5, IPreferencesService),
    __param(6, IInstantiationService),
    __param(7, IPreferencesSearchService),
    __param(8, ILogService),
    __param(9, IContextKeyService),
    __param(10, IStorageService),
    __param(11, IEditorGroupsService),
    __param(12, IUserDataSyncWorkbenchService),
    __param(13, IUserDataSyncEnablementService),
    __param(14, IWorkspaceTrustManagementService),
    __param(15, IExtensionService),
    __param(16, ILanguageService),
    __param(17, IExtensionManagementService),
    __param(18, IProductService),
    __param(19, IExtensionGalleryService),
    __param(20, IEditorProgressService),
    __param(21, IUserDataProfileService),
    __param(22, IKeybindingService),
    __param(23, IChatEntitlementService)
], SettingsEditor2);
export { SettingsEditor2 };
let SyncControls = class SyncControls extends Disposable {
    constructor(window, container, commandService, userDataSyncService, userDataSyncEnablementService, telemetryService) {
        super();
        this.commandService = commandService;
        this.userDataSyncService = userDataSyncService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this._onDidChangeLastSyncedLabel = this._register(new Emitter());
        this.onDidChangeLastSyncedLabel = this._onDidChangeLastSyncedLabel.event;
        const headerRightControlsContainer = DOM.append(container, $('.settings-right-controls'));
        const turnOnSyncButtonContainer = DOM.append(headerRightControlsContainer, $('.turn-on-sync'));
        this.turnOnSyncButton = this._register(new Button(turnOnSyncButtonContainer, { title: true, ...defaultButtonStyles }));
        this.lastSyncedLabel = DOM.append(headerRightControlsContainer, $('.last-synced-label'));
        DOM.hide(this.lastSyncedLabel);
        this.turnOnSyncButton.enabled = true;
        this.turnOnSyncButton.label = localize('turnOnSyncButton', "Backup and Sync Settings");
        DOM.hide(this.turnOnSyncButton.element);
        this._register(this.turnOnSyncButton.onDidClick(async () => {
            await this.commandService.executeCommand('workbench.userDataSync.actions.turnOn');
        }));
        this.updateLastSyncedTime();
        this._register(this.userDataSyncService.onDidChangeLastSyncTime(() => {
            this.updateLastSyncedTime();
        }));
        const updateLastSyncedTimer = this._register(new DOM.WindowIntervalTimer());
        updateLastSyncedTimer.cancelAndSet(() => this.updateLastSyncedTime(), 60 * 1000, window);
        this.update();
        this._register(this.userDataSyncService.onDidChangeStatus(() => {
            this.update();
        }));
        this._register(this.userDataSyncEnablementService.onDidChangeEnablement(() => {
            this.update();
        }));
    }
    updateLastSyncedTime() {
        const last = this.userDataSyncService.lastSyncTime;
        let label;
        if (typeof last === 'number') {
            const d = fromNow(last, true, undefined, true);
            label = localize('lastSyncedLabel', "Last synced: {0}", d);
        }
        else {
            label = '';
        }
        this.lastSyncedLabel.textContent = label;
        this._onDidChangeLastSyncedLabel.fire(label);
    }
    update() {
        if (this.userDataSyncService.status === "uninitialized" /* SyncStatus.Uninitialized */) {
            return;
        }
        if (this.userDataSyncEnablementService.isEnabled() || this.userDataSyncService.status !== "idle" /* SyncStatus.Idle */) {
            DOM.show(this.lastSyncedLabel);
            DOM.hide(this.turnOnSyncButton.element);
        }
        else {
            DOM.hide(this.lastSyncedLabel);
            DOM.show(this.turnOnSyncButton.element);
        }
    }
};
SyncControls = __decorate([
    __param(2, ICommandService),
    __param(3, IUserDataSyncService),
    __param(4, IUserDataSyncEnablementService),
    __param(5, ITelemetryService)
], SyncControls);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NFZGl0b3IyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvcHJlZmVyZW5jZXMvYnJvd3Nlci9zZXR0aW5nc0VkaXRvcjIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQy9FLE9BQU8sS0FBSyxJQUFJLE1BQU0sMENBQTBDLENBQUM7QUFDakUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3RFLE9BQU8sRUFBZSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDcEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFHcEYsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1B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