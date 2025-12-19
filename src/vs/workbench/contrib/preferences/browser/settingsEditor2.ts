/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Orientation, Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { ToggleActionViewItem } from '../../../../base/browser/ui/toggle/toggle.js';
import { ITreeElement } from '../../../../base/browser/ui/tree/tree.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { Action } from '../../../../base/common/actions.js';
import { CancelablePromise, createCancelablePromise, Delayer, raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Color } from '../../../../base/common/color.js';
import { fromNow } from '../../../../base/common/date.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, dispose, type IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import * as platform from '../../../../base/common/platform.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationUpdateOverrides } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionGalleryService, IExtensionManagementService, IGalleryExtension } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IEditorProgressService, IProgressRunner } from '../../../../platform/progress/common/progress.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles, defaultToggleStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable, asCssVariableWithDefault, badgeBackground, badgeForeground, contrastBorder, editorForeground, inputBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IUserDataSyncEnablementService, IUserDataSyncService, SyncStatus } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { registerNavigableContainer } from '../../../browser/actions/widgetNavigationCommands.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorMemento, IEditorOpenContext, IEditorPane } from '../../../common/editor.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { APPLICATION_SCOPES, IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ALWAYS_SHOW_ADVANCED_SETTINGS_SETTING, IOpenSettingsOptions, IPreferencesService, ISearchResult, ISetting, ISettingsEditorModel, ISettingsEditorOptions, ISettingsGroup, SettingMatchType, SettingValueType, validateSettingsEditorOptions } from '../../../services/preferences/common/preferences.js';
import { SettingsEditor2Input } from '../../../services/preferences/common/preferencesEditorInput.js';
import { nullRange, Settings2EditorModel } from '../../../services/preferences/common/preferencesModels.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IUserDataSyncWorkbenchService } from '../../../services/userDataSync/common/userDataSync.js';
import { SuggestEnabledInput } from '../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js';
import { ADVANCED_SETTING_TAG, CONTEXT_AI_SETTING_RESULTS_AVAILABLE, CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_ROW_FOCUS, CONTEXT_SETTINGS_SEARCH_FOCUS, CONTEXT_TOC_ROW_FOCUS, EMBEDDINGS_SEARCH_PROVIDER_NAME, ENABLE_LANGUAGE_FILTER, EXTENSION_FETCH_TIMEOUT_MS, EXTENSION_SETTING_TAG, FEATURE_SETTING_TAG, FILTER_MODEL_SEARCH_PROVIDER_NAME, getExperimentalExtensionToggleData, ID_SETTING_TAG, IPreferencesSearchService, ISearchProvider, LANGUAGE_SETTING_TAG, LLM_RANKED_SEARCH_PROVIDER_NAME, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG, REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG, SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, SETTINGS_EDITOR_COMMAND_SHOW_AI_RESULTS, SETTINGS_EDITOR_COMMAND_SUGGEST_FILTERS, SETTINGS_EDITOR_COMMAND_TOGGLE_AI_SEARCH, STRING_MATCH_SEARCH_PROVIDER_NAME, TF_IDF_SEARCH_PROVIDER_NAME, WorkbenchSettingsEditorSettings, WORKSPACE_TRUST_SETTING_TAG } from '../common/preferences.js';
import { settingsHeaderBorder, settingsSashBorder, settingsTextInputBorder } from '../common/settingsEditorColorRegistry.js';
import './media/settingsEditor2.css';
import { preferencesAiResultsIcon, preferencesClearInputIcon, preferencesFilterIcon } from './preferencesIcons.js';
import { SettingsTarget, SettingsTargetsWidget } from './preferencesWidgets.js';
import { ISettingOverrideClickEvent } from './settingsEditorSettingIndicators.js';
import { getCommonlyUsedData, ITOCEntry, tocData } from './settingsLayout.js';
import { SettingsSearchFilterDropdownMenuActionViewItem } from './settingsSearchMenu.js';
import { AbstractSettingRenderer, createTocTreeForExtensionSettings, HeightChangeParams, ISettingLinkClickEvent, resolveConfiguredUntrustedSettings, resolveSettingsTree, SettingsTree, SettingTreeRenderers } from './settingsTree.js';
import { ISettingsEditorViewState, parseQuery, SearchResultIdx, SearchResultModel, SettingsTreeElement, SettingsTreeGroupChild, SettingsTreeGroupElement, SettingsTreeModel, SettingsTreeSettingElement } from './settingsTreeModels.js';
import { createTOCIterator, TOCTree, TOCTreeModel } from './tocTree.js';

export const enum SettingsFocusContext {
	Search,
	TableOfContents,
	SettingTree,
	SettingControl
}

export function createGroupIterator(group: SettingsTreeGroupElement): Iterable<ITreeElement<SettingsTreeGroupChild>> {
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

interface IFocusEventFromScroll extends KeyboardEvent {
	fromScroll: true;
}

const searchBoxLabel = localize('SearchSettings.AriaLabel', "Search settings");
const SEARCH_TOC_BEHAVIOR_KEY = 'workbench.settings.settingsSearchTocBehavior';

const SHOW_AI_RESULTS_ENABLED_LABEL = localize('showAiResultsEnabled', "Show AI-recommended results");
const SHOW_AI_RESULTS_DISABLED_LABEL = localize('showAiResultsDisabled', "No AI results available at this time...");

const SETTINGS_EDITOR_STATE_KEY = 'settingsEditorState';

export class SettingsEditor2 extends EditorPane {

	static readonly ID: string = 'workbench.editor.settings2';
	private static NUM_INSTANCES: number = 0;
	private static SEARCH_DEBOUNCE: number = 200;
	private static SETTING_UPDATE_FAST_DEBOUNCE: number = 200;
	private static SETTING_UPDATE_SLOW_DEBOUNCE: number = 1000;
	private static CONFIG_SCHEMA_UPDATE_DELAYER = 500;
	private static TOC_MIN_WIDTH: number = 100;
	private static TOC_RESET_WIDTH: number = 200;
	private static EDITOR_MIN_WIDTH: number = 500;
	// Below NARROW_TOTAL_WIDTH, we only render the editor rather than the ToC.
	private static NARROW_TOTAL_WIDTH: number = this.TOC_RESET_WIDTH + this.EDITOR_MIN_WIDTH;

	private static SUGGESTIONS: string[] = [
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
		`@${POLICY_SETTING_TAG}`
	];

	private static shouldSettingUpdateFast(type: SettingValueType | SettingValueType[]): boolean {
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

	// (!) Lots of props that are set once on the first render
	private defaultSettingsEditorModel!: Settings2EditorModel;
	private readonly modelDisposables: DisposableStore;

	private rootElement!: HTMLElement;
	private headerContainer!: HTMLElement;
	private searchContainer: HTMLElement | null = null;
	private bodyContainer!: HTMLElement;
	private searchWidget!: SuggestEnabledInput;
	private countElement!: HTMLElement;
	private controlsElement!: HTMLElement;
	private settingsTargetsWidget!: SettingsTargetsWidget;

	private splitView!: SplitView<number>;

	private settingsTreeContainer!: HTMLElement;
	private settingsTree!: SettingsTree;
	private settingRenderers!: SettingTreeRenderers;
	private tocTreeModel!: TOCTreeModel;
	private readonly settingsTreeModel = this._register(new MutableDisposable<SettingsTreeModel>());
	private noResultsMessage!: HTMLElement;
	private clearFilterLinkContainer!: HTMLElement;

	private tocTreeContainer!: HTMLElement;
	private tocTree!: TOCTree;

	private searchDelayer: Delayer<void>;
	private searchInProgress: CancellationTokenSource | null = null;
	private aiSearchPromise: CancelablePromise<void> | null = null;

	private stopWatch: StopWatch;

	private showAiResultsAction: Action | null = null;

	private searchInputDelayer: Delayer<void>;
	private updatedConfigSchemaDelayer: Delayer<void>;

	private settingFastUpdateDelayer: Delayer<void>;
	private settingSlowUpdateDelayer: Delayer<void>;
	private pendingSettingUpdate: { key: string; value: unknown; languageFilter: string | undefined } | null = null;

	private readonly viewState: ISettingsEditorViewState;
	private readonly _searchResultModel = this._register(new MutableDisposable<SearchResultModel>());
	private searchResultLabel: string | null = null;
	private lastSyncedLabel: string | null = null;
	private settingsOrderByTocIndex: Map<string, number> | null = null;

	private tocRowFocused: IContextKey<boolean>;
	private settingRowFocused: IContextKey<boolean>;
	private inSettingsEditorContextKey: IContextKey<boolean>;
	private searchFocusContextKey: IContextKey<boolean>;
	private aiResultsAvailable: IContextKey<boolean>;

	private scheduledRefreshes: Map<string, DisposableStore>;
	private _currentFocusContext: SettingsFocusContext = SettingsFocusContext.Search;

	/** Don't spam warnings */
	private hasWarnedMissingSettings = false;
	private tocTreeDisposed = false;

	/** Persist the search query upon reloads */
	private editorMemento: IEditorMemento<ISettingsEditor2State>;

	private tocFocusedElement: SettingsTreeGroupElement | null = null;
	private treeFocusedElement: SettingsTreeElement | null = null;
	private settingsTreeScrollTop = 0;
	private dimension!: DOM.Dimension;

	private installedExtensionIds: string[] = [];
	private dismissedExtensionSettings: string[] = [];

	private readonly DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY = 'settingsEditor2.dismissedExtensionSettings';
	private readonly DISMISSED_EXTENSION_SETTINGS_DELIMITER = '\t';

	private readonly inputChangeListener: MutableDisposable<IDisposable>;

	private searchInputActionBar: ActionBar | null = null;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchConfigurationService private readonly configurationService: IWorkbenchConfigurationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPreferencesSearchService private readonly preferencesSearchService: IPreferencesSearchService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IEditorGroupsService protected editorGroupService: IEditorGroupsService,
		@IUserDataSyncWorkbenchService private readonly userDataSyncWorkbenchService: IUserDataSyncWorkbenchService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IProductService private readonly productService: IProductService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IEditorProgressService private readonly editorProgressService: IEditorProgressService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService
	) {
		super(SettingsEditor2.ID, group, telemetryService, themeService, storageService);
		this.searchDelayer = new Delayer(200);
		this.viewState = { settingsTarget: ConfigurationTarget.USER_LOCAL };

		this.settingFastUpdateDelayer = new Delayer<void>(SettingsEditor2.SETTING_UPDATE_FAST_DEBOUNCE);
		this.settingSlowUpdateDelayer = new Delayer<void>(SettingsEditor2.SETTING_UPDATE_SLOW_DEBOUNCE);

		this.searchInputDelayer = new Delayer<void>(SettingsEditor2.SEARCH_DEBOUNCE);
		this.updatedConfigSchemaDelayer = new Delayer<void>(SettingsEditor2.CONFIG_SCHEMA_UPDATE_DELAYER);

		this.inSettingsEditorContextKey = CONTEXT_SETTINGS_EDITOR.bindTo(contextKeyService);
		this.searchFocusContextKey = CONTEXT_SETTINGS_SEARCH_FOCUS.bindTo(contextKeyService);
		this.tocRowFocused = CONTEXT_TOC_ROW_FOCUS.bindTo(contextKeyService);
		this.settingRowFocused = CONTEXT_SETTINGS_ROW_FOCUS.bindTo(contextKeyService);
		this.aiResultsAvailable = CONTEXT_AI_SETTING_RESULTS_AVAILABLE.bindTo(contextKeyService);

		this.scheduledRefreshes = new Map<string, DisposableStore>();
		this.stopWatch = new StopWatch(false);

		this.editorMemento = this.getEditorMemento<ISettingsEditor2State>(editorGroupService, textResourceConfigurationService, SETTINGS_EDITOR_STATE_KEY);

		this.dismissedExtensionSettings = this.storageService
			.get(this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY, StorageScope.PROFILE, '')
			.split(this.DISMISSED_EXTENSION_SETTINGS_DELIMITER);

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectedKeys.has(WorkbenchSettingsEditorSettings.ShowAISearchToggle)
				|| e.affectedKeys.has(WorkbenchSettingsEditorSettings.EnableNaturalLanguageSearch)) {
				this.updateAiSearchToggleVisibility();
			}
			if (e.affectsConfiguration(ALWAYS_SHOW_ADVANCED_SETTINGS_SETTING)) {
				this.onConfigUpdate(undefined, true, true);
			}
			if (e.source !== ConfigurationTarget.DEFAULT) {
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

		if (ENABLE_LANGUAGE_FILTER && !SettingsEditor2.SUGGESTIONS.includes(`@${LANGUAGE_SETTING_TAG}`)) {
			SettingsEditor2.SUGGESTIONS.push(`@${LANGUAGE_SETTING_TAG}`);
		}
		this.inputChangeListener = this._register(new MutableDisposable());
	}

	private async whenCurrentProfileChanged(): Promise<void> {
		this.updatedConfigSchemaDelayer.trigger(() => {
			this.dismissedExtensionSettings = this.storageService
				.get(this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY, StorageScope.PROFILE, '')
				.split(this.DISMISSED_EXTENSION_SETTINGS_DELIMITER);
			this.onConfigUpdate(undefined, true);
		});
	}

	private canShowAdvancedSettings(): boolean {
		if (this.configurationService.getValue<boolean>(ALWAYS_SHOW_ADVANCED_SETTINGS_SETTING) ?? false) {
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
	private shouldShowSetting(setting: ISetting): boolean {
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

	private disableAiSearchToggle(): void {
		if (this.showAiResultsAction) {
			this.showAiResultsAction.checked = false;
			this.showAiResultsAction.enabled = false;
			this.aiResultsAvailable.set(false);
			this.showAiResultsAction.label = SHOW_AI_RESULTS_DISABLED_LABEL;
		}
	}

	private updateAiSearchToggleVisibility(): void {
		if (!this.searchContainer || !this.showAiResultsAction || !this.searchInputActionBar) {
			return;
		}

		const showAiToggle = this.configurationService.getValue<boolean>(WorkbenchSettingsEditorSettings.ShowAISearchToggle);
		const enableNaturalLanguageSearch = this.configurationService.getValue<boolean>(WorkbenchSettingsEditorSettings.EnableNaturalLanguageSearch);
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
		} else if (alreadyVisible) {
			this.searchInputActionBar.pull(0);
			this.searchContainer.classList.remove('with-ai-toggle');
			this.showAiResultsAction.checked = false;
		}
	}

	override get minimumWidth(): number { return SettingsEditor2.EDITOR_MIN_WIDTH; }
	override get maximumWidth(): number { return Number.POSITIVE_INFINITY; }
	override get minimumHeight() { return 180; }

	// these setters need to exist because this extends from EditorPane
	override set minimumWidth(value: number) { /*noop*/ }
	override set maximumWidth(value: number) { /*noop*/ }

	private get currentSettingsModel(): SettingsTreeModel | undefined {
		return this.searchResultModel || this.settingsTreeModel.value;
	}

	private get searchResultModel(): SearchResultModel | null {
		return this._searchResultModel.value ?? null;
	}

	private set searchResultModel(value: SearchResultModel | null) {
		this._searchResultModel.value = value ?? undefined;

		this.rootElement.classList.toggle('search-mode', !!this._searchResultModel.value);
	}

	private get focusedSettingDOMElement(): HTMLElement | undefined {
		const focused = this.settingsTree.getFocus()[0];
		if (!(focused instanceof SettingsTreeSettingElement)) {
			return;
		}

		return this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), focused.setting.key)[0];
	}

	get currentFocusContext() {
		return this._currentFocusContext;
	}

	protected createEditor(parent: HTMLElement): void {
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

	override async setInput(input: SettingsEditor2Input, options: ISettingsEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
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
			const optionsHasViewStateTarget = options.viewState && (options.viewState as ISettingsEditorViewState).settingsTarget;
			if (!options.target && !optionsHasViewStateTarget) {
				options.target = ConfigurationTarget.USER_LOCAL;
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

	private async refreshInstalledExtensionsList(): Promise<void> {
		const installedExtensions = await this.extensionManagementService.getInstalled();
		this.installedExtensionIds = installedExtensions
			.filter(ext => ext.manifest.contributes?.configuration)
			.map(ext => ext.identifier.id);
	}

	private restoreCachedState(): ISettingsEditor2State | null {
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

	override getViewState(): object | undefined {
		return this.viewState;
	}

	override setOptions(options: ISettingsEditorOptions | undefined): void {
		super.setOptions(options);

		if (options) {
			this._setOptions(options);
		}
	}

	private _setOptions(options: ISettingsEditorOptions): void {
		if (options.focusSearch && !platform.isIOS) {
			// isIOS - #122044
			this.focusSearch();
		}

		const recoveredViewState = options.viewState ?
			options.viewState as ISettingsEditorViewState : undefined;

		const query: string | undefined = recoveredViewState?.query ?? options.query;
		if (query !== undefined) {
			this.searchWidget.setValue(query);
			this.viewState.query = query;
		}

		const target: SettingsTarget | undefined = options.folderUri ?? recoveredViewState?.settingsTarget ?? <SettingsTarget | undefined>options.target;
		if (target) {
			this.settingsTargetsWidget.updateTarget(target);
		}
	}

	override clearInput(): void {
		this.inSettingsEditorContextKey.set(false);
		super.clearInput();
	}

	layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;

		if (!this.isVisible()) {
			return;
		}

		this.layoutSplitView(dimension);

		const innerWidth = Math.min(this.headerContainer.clientWidth, dimension.width) - 24 * 2; // 24px padding on left and right;
		// minus padding inside inputbox, controls width, and extra padding before countElement
		const monacoWidth = innerWidth - 10 - this.controlsElement.clientWidth - 12;
		this.searchWidget.layout(new DOM.Dimension(monacoWidth, 20));

		this.rootElement.classList.toggle('narrow-width', dimension.width < SettingsEditor2.NARROW_TOTAL_WIDTH);
	}

	override focus(): void {
		super.focus();

		if (this._currentFocusContext === SettingsFocusContext.Search) {
			if (!platform.isIOS) {
				// #122044
				this.focusSearch();
			}
		} else if (this._currentFocusContext === SettingsFocusContext.SettingControl) {
			const element = this.focusedSettingDOMElement;
			if (element) {
				// eslint-disable-next-line no-restricted-syntax
				const control = element.querySelector(AbstractSettingRenderer.CONTROL_SELECTOR);
				if (control) {
					(<HTMLElement>control).focus();
					return;
				}
			}
		} else if (this._currentFocusContext === SettingsFocusContext.SettingTree) {
			this.settingsTree.domFocus();
		} else if (this._currentFocusContext === SettingsFocusContext.TableOfContents) {
			this.tocTree.domFocus();
		}
	}

	protected override setEditorVisible(visible: boolean): void {
		super.setEditorVisible(visible);

		if (!visible) {
			// Wait for editor to be removed from DOM #106303
			setTimeout(() => {
				this.searchWidget.onHide();
				this.settingRenderers.cancelSuggesters();
			}, 0);
		}
	}

	focusSettings(focusSettingInput = false): void {
		const focused = this.settingsTree.getFocus();
		if (!focused.length) {
			this.settingsTree.focusFirst();
		}

		this.settingsTree.domFocus();

		if (focusSettingInput) {
			// eslint-disable-next-line no-restricted-syntax
			const controlInFocusedRow = this.settingsTree.getHTMLElement().querySelector(`.focused ${AbstractSettingRenderer.CONTROL_SELECTOR}`);
			if (controlInFocusedRow) {
				(<HTMLElement>controlInFocusedRow).focus();
			}
		}
	}

	focusTOC(): void {
		this.tocTree.domFocus();
	}

	showContextMenu(): void {
		const focused = this.settingsTree.getFocus()[0];
		const rowElement = this.focusedSettingDOMElement;
		if (rowElement && focused instanceof SettingsTreeSettingElement) {
			this.settingRenderers.showContextMenu(focused, rowElement);
		}
	}

	focusSearch(filter?: string, selectAll = true): void {
		if (filter && this.searchWidget) {
			this.searchWidget.setValue(filter);
		}

		// Do not select all if the user is already searching.
		this.searchWidget.focus(selectAll && !this.searchInputDelayer.isTriggered);
	}

	clearSearchResults(): void {
		this.disableAiSearchToggle();
		this.searchWidget.setValue('');
		this.focusSearch();
	}

	clearSearchFilters(): void {
		const query = this.searchWidget.getValue();

		const splitQuery = query.split(' ').filter(word => {
			return word.length && !SettingsEditor2.SUGGESTIONS.some(suggestion => word.startsWith(suggestion));
		});

		this.searchWidget.setValue(splitQuery.join(' '));
	}

	private updateInputAriaLabel() {
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
	private createHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.settings-header'));
		this.searchContainer = DOM.append(this.headerContainer, $('.search-container'));

		const clearInputAction = this._register(new Action(SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS,
			localize('clearInput', "Clear Settings Search Input"), ThemeIcon.asClassName(preferencesClearInputIcon), false,
			async () => this.clearSearchResults()
		));

		const showAiResultActionClassNames = ['action-label', ThemeIcon.asClassName(preferencesAiResultsIcon)];
		this.showAiResultsAction = this._register(new Action(SETTINGS_EDITOR_COMMAND_SHOW_AI_RESULTS,
			SHOW_AI_RESULTS_DISABLED_LABEL, showAiResultActionClassNames.join(' '), true
		));
		this._register(this.showAiResultsAction.onDidChange(async () => {
			await this.onDidToggleAiSearch();
		}));

		const filterAction = this._register(new Action(SETTINGS_EDITOR_COMMAND_SUGGEST_FILTERS,
			localize('filterInput', "Filter Settings"), ThemeIcon.asClassName(preferencesFilterIcon)
		));

		this.searchWidget = this._register(this.instantiationService.createInstance(SuggestEnabledInput, `${SettingsEditor2.ID}.searchbox`, this.searchContainer, {
			triggerCharacters: ['@', ':'],
			provideResults: (query: string) => {
				// Based on testing, the trigger character is always at the end of the query.
				// for the ':' trigger, only return suggestions if there was a '@' before it in the same word.
				const queryParts = query.split(/\s/g);
				if (queryParts[queryParts.length - 1].startsWith(`@${LANGUAGE_SETTING_TAG}`)) {
					const sortedLanguages = this.languageService.getRegisteredLanguageIds().map(languageId => {
						return `@${LANGUAGE_SETTING_TAG}${languageId} `;
					}).sort();
					return sortedLanguages.filter(langFilter => !query.includes(langFilter));
				} else if (queryParts[queryParts.length - 1].startsWith(`@${EXTENSION_SETTING_TAG}`)) {
					const installedExtensionsTags = this.installedExtensionIds.map(extensionId => {
						return `@${EXTENSION_SETTING_TAG}${extensionId} `;
					}).sort();
					return installedExtensionsTags.filter(extFilter => !query.includes(extFilter));
				} else if (query === '' || queryParts[queryParts.length - 1].startsWith('@')) {
					return SettingsEditor2.SUGGESTIONS.filter(tag => !query.includes(tag)).map(tag => tag.endsWith(':') ? tag : tag + ' ');
				}
				return [];
			}
		}, searchBoxLabel, 'settingseditor:searchinput' + SettingsEditor2.NUM_INSTANCES++, {
			placeholderText: searchBoxLabel,
			focusContextKey: this.searchFocusContextKey,
			styleOverrides: {
				inputBorder: settingsTextInputBorder
			}
			// TODO: Aria-live
		}));
		this._register(this.searchWidget.onDidFocus(() => {
			this._currentFocusContext = SettingsFocusContext.Search;
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
		this.settingsTargetsWidget.settingsTarget = ConfigurationTarget.USER_LOCAL;
		this._register(this.settingsTargetsWidget.onDidTargetChange(target => this.onDidSettingsTargetChange(target)));
		this._register(DOM.addDisposableListener(targetWidgetContainer, DOM.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.DownArrow) {
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
		this.countElement.style.backgroundColor = asCssVariable(badgeBackground);
		this.countElement.style.color = asCssVariable(badgeForeground);
		this.countElement.style.border = `1px solid ${asCssVariableWithDefault(contrastBorder, asCssVariable(inputBackground))}`;

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

	toggleAiSearch(): void {
		if (this.searchInputActionBar && this.showAiResultsAction && this.searchInputActionBar.hasAction(this.showAiResultsAction)) {
			if (!this.showAiResultsAction.enabled) {
				aria.status(localize('noAiResults', "No AI results available at this time."));
			}
			this.showAiResultsAction.checked = !this.showAiResultsAction.checked;
		}
	}

	private async onDidToggleAiSearch(): Promise<void> {
		if (this.searchResultModel && this.showAiResultsAction) {
			this.searchResultModel.showAiResults = this.showAiResultsAction.checked ?? false;
			this.renderResultCountMessages(false);
			this.onDidFinishSearch(true, undefined);
		}
	}

	private onDidSettingsTargetChange(target: SettingsTarget): void {
		this.viewState.settingsTarget = target;

		// TODO Instead of rebuilding the whole model, refresh and uncache the inspected setting value
		this.onConfigUpdate(undefined, true);
	}

	private onDidDismissExtensionSetting(extensionId: string): void {
		if (!this.dismissedExtensionSettings.includes(extensionId)) {
			this.dismissedExtensionSettings.push(extensionId);
		}
		this.storageService.store(
			this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY,
			this.dismissedExtensionSettings.join(this.DISMISSED_EXTENSION_SETTINGS_DELIMITER),
			StorageScope.PROFILE,
			StorageTarget.USER
		);
		this.onConfigUpdate(undefined, true);
	}

	private onDidClickSetting(evt: ISettingLinkClickEvent, recursed?: boolean): void {
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
			} catch {
				// e.g. clicked a searched element, now the search has been cleared
			}

			// If we search for something and focus on a category, the settings tree
			// only renders settings in that category.
			// If the target display category is different than the source's, unfocus the category
			// so that we can render all found settings again.
			// Then, the reveal call will correctly find the target setting.
			if (this.viewState.filterToCategory && evt.source.displayCategory !== targetElement.displayCategory) {
				this.tocTree.setFocus([]);
			}
			try {
				this.settingsTree.reveal(targetElement, sourceTop);
			} catch (_) {
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
						(<HTMLElement>control).focus();
					}
				}
			}
		}

		if (!recursed && (!targetElement || revealFailed)) {
			// We'll call this event handler again after clearing the search query,
			// so that more settings show up in the list.
			const p = this.triggerSearch('', true);
			p.then(() => {
				this.searchWidget.setValue('');
				this.onDidClickSetting(evt, true);
			});
		}
	}

	switchToSettingsFile(): Promise<IEditorPane | undefined> {
		const query = parseQuery(this.searchWidget.getValue()).query;
		return this.openSettingsFile({ query });
	}

	private async openSettingsFile(options?: ISettingsEditorOptions): Promise<IEditorPane | undefined> {
		const currentSettingsTarget = this.settingsTargetsWidget.settingsTarget;

		const openOptions: IOpenSettingsOptions = { jsonEditor: true, groupId: this.group.id, ...options };
		if (currentSettingsTarget === ConfigurationTarget.USER_LOCAL) {
			if (options?.revealSetting) {
				const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
				const configurationScope = configurationProperties[options?.revealSetting.key]?.scope;
				if (configurationScope && APPLICATION_SCOPES.includes(configurationScope)) {
					return this.preferencesService.openApplicationSettings(openOptions);
				}
			}
			return this.preferencesService.openUserSettings(openOptions);
		} else if (currentSettingsTarget === ConfigurationTarget.USER_REMOTE) {
			return this.preferencesService.openRemoteSettings(openOptions);
		} else if (currentSettingsTarget === ConfigurationTarget.WORKSPACE) {
			return this.preferencesService.openWorkspaceSettings(openOptions);
		} else if (URI.isUri(currentSettingsTarget)) {
			return this.preferencesService.openFolderSettings({ folderUri: currentSettingsTarget, ...openOptions });
		}

		return undefined;
	}

	private createBody(parent: HTMLElement): void {
		this.bodyContainer = DOM.append(parent, $('.settings-body'));

		this.noResultsMessage = DOM.append(this.bodyContainer, $('.no-results-message'));

		this.noResultsMessage.innerText = localize('noResults', "No Settings Found");

		this.clearFilterLinkContainer = $('span.clear-search-filters');

		this.clearFilterLinkContainer.textContent = ' - ';
		const clearFilterLink = DOM.append(this.clearFilterLinkContainer, $('a.pointer.prominent', { tabindex: 0 }, localize('clearSearchFilters', 'Clear Filters')));
		this._register(DOM.addDisposableListener(clearFilterLink, DOM.EventType.CLICK, (e: MouseEvent) => {
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
			orientation: Orientation.HORIZONTAL,
			proportionalLayout: true
		}));
		const startingWidth = this.storageService.getNumber('settingsEditor2.splitViewWidth', StorageScope.PROFILE, SettingsEditor2.TOC_RESET_WIDTH);
		this.splitView.addView({
			onDidChange: Event.None,
			element: this.tocTreeContainer,
			minimumSize: SettingsEditor2.TOC_MIN_WIDTH,
			maximumSize: Number.POSITIVE_INFINITY,
			layout: (width, _, height) => {
				this.tocTreeContainer.style.width = `${width}px`;
				this.tocTree.layout(height, width);
			}
		}, startingWidth, undefined, true);
		this.splitView.addView({
			onDidChange: Event.None,
			element: this.settingsTreeContainer,
			minimumSize: SettingsEditor2.EDITOR_MIN_WIDTH,
			maximumSize: Number.POSITIVE_INFINITY,
			layout: (width, _, height) => {
				this.settingsTreeContainer.style.width = `${width}px`;
				this.settingsTree.layout(height, width);
			}
		}, Sizing.Distribute, undefined, true);
		this._register(this.splitView.onDidSashReset(() => {
			const totalSize = this.splitView.getViewSize(0) + this.splitView.getViewSize(1);
			this.splitView.resizeView(0, SettingsEditor2.TOC_RESET_WIDTH);
			this.splitView.resizeView(1, totalSize - SettingsEditor2.TOC_RESET_WIDTH);
		}));
		this._register(this.splitView.onDidSashChange(() => {
			const width = this.splitView.getViewSize(0);
			this.storageService.store('settingsEditor2.splitViewWidth', width, StorageScope.PROFILE, StorageTarget.USER);
		}));
		const borderColor = this.theme.getColor(settingsSashBorder)!;
		this.splitView.style({ separatorBorder: borderColor });
	}

	private addCtrlAInterceptor(container: HTMLElement): void {
		this._register(DOM.addStandardDisposableListener(container, DOM.EventType.KEY_DOWN, (e: StandardKeyboardEvent) => {
			if (
				e.keyCode === KeyCode.KeyA &&
				(platform.isMacintosh ? e.metaKey : e.ctrlKey) &&
				!DOM.isEditableElement(e.target)
			) {
				// Avoid browser ctrl+a
				e.browserEvent.stopPropagation();
				e.browserEvent.preventDefault();
			}
		}));
	}

	private createTOC(container: HTMLElement): void {
		this.tocTreeModel = this.instantiationService.createInstance(TOCTreeModel, this.viewState);

		this.tocTree = this._register(this.instantiationService.createInstance(TOCTree,
			DOM.append(container, $('.settings-toc-wrapper', {
				'role': 'navigation',
				'aria-label': localize('settings', "Settings"),
			})),
			this.viewState));
		this.tocTreeDisposed = false;

		this._register(this.tocTree.onDidFocus(() => {
			this._currentFocusContext = SettingsFocusContext.TableOfContents;
		}));

		this._register(this.tocTree.onDidChangeFocus(e => {
			const element: SettingsTreeGroupElement | null = e.elements?.[0] ?? null;
			if (this.tocFocusedElement === element) {
				return;
			}

			this.tocFocusedElement = element;
			this.tocTree.setSelection(element ? [element] : []);
			if (this.searchResultModel) {
				if (this.viewState.filterToCategory !== element) {
					this.viewState.filterToCategory = element ?? undefined;
					// Force render in this case, because
					// onDidClickSetting relies on the updated view.
					this.renderTree(undefined, true);
					this.settingsTree.scrollTop = 0;
				}
			} else if (element && (!e.browserEvent || !(<IFocusEventFromScroll>e.browserEvent).fromScroll)) {
				this.settingsTree.reveal(element, 0);
				this.settingsTree.setFocus([element]);
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

	private applyFilter(filter: string) {
		if (this.searchWidget && !this.searchWidget.getValue().includes(filter)) {
			// Prepend the filter to the query.
			const newQuery = `${filter} ${this.searchWidget.getValue().trimStart()}`;
			this.focusSearch(newQuery, false);
		}
	}

	private removeLanguageFilters() {
		if (this.searchWidget && this.searchWidget.getValue().includes(`@${LANGUAGE_SETTING_TAG}`)) {
			const query = this.searchWidget.getValue().split(' ');
			const newQuery = query.filter(word => !word.startsWith(`@${LANGUAGE_SETTING_TAG}`)).join(' ');
			this.focusSearch(newQuery, false);
		}
	}

	private createSettingsTree(container: HTMLElement): void {
		this.settingRenderers = this._register(this.instantiationService.createInstance(SettingTreeRenderers));
		this._register(this.settingRenderers.onDidChangeSetting(e => this.onDidChangeSetting(e.key, e.value, e.type, e.manualReset, e.scope)));
		this._register(this.settingRenderers.onDidDismissExtensionSetting((e) => this.onDidDismissExtensionSetting(e)));
		this._register(this.settingRenderers.onDidOpenSettings(settingKey => {
			this.openSettingsFile({ revealSetting: { key: settingKey, edit: true } });
		}));
		this._register(this.settingRenderers.onDidClickSettingLink(settingName => this.onDidClickSetting(settingName)));
		this._register(this.settingRenderers.onDidFocusSetting(element => {
			this.settingsTree.setFocus([element]);
			this._currentFocusContext = SettingsFocusContext.SettingControl;
			this.settingRowFocused.set(false);
		}));
		this._register(this.settingRenderers.onDidChangeSettingHeight((params: HeightChangeParams) => {
			const { element, height } = params;
			try {
				this.settingsTree.updateElementHeight(element, height);
			} catch (e) {
				// the element was not found
			}
		}));
		this._register(this.settingRenderers.onApplyFilter((filter) => this.applyFilter(filter)));
		this._register(this.settingRenderers.onDidClickOverrideElement((element: ISettingOverrideClickEvent) => {
			this.removeLanguageFilters();
			if (element.language) {
				this.applyFilter(`@${LANGUAGE_SETTING_TAG}${element.language}`);
			}

			if (element.scope === 'workspace') {
				this.settingsTargetsWidget.updateTarget(ConfigurationTarget.WORKSPACE);
			} else if (element.scope === 'user') {
				this.settingsTargetsWidget.updateTarget(ConfigurationTarget.USER_LOCAL);
			} else if (element.scope === 'remote') {
				this.settingsTargetsWidget.updateTarget(ConfigurationTarget.USER_REMOTE);
			}
			this.applyFilter(`@${ID_SETTING_TAG}${element.settingKey}`);
		}));

		this.settingsTree = this._register(this.instantiationService.createInstance(SettingsTree,
			container,
			this.viewState,
			this.settingRenderers.allRenderers));

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
				this._currentFocusContext = SettingsFocusContext.SettingTree;
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

	private onDidChangeSetting(key: string, value: unknown, type: SettingValueType | SettingValueType[], manualReset: boolean, scope: ConfigurationScope | undefined): void {
		const parsedQuery = parseQuery(this.searchWidget.getValue());
		const languageFilter = parsedQuery.languageFilter;
		if (manualReset || (this.pendingSettingUpdate && this.pendingSettingUpdate.key !== key)) {
			this.updateChangedSetting(key, value, manualReset, languageFilter, scope);
		}

		this.pendingSettingUpdate = { key, value, languageFilter };
		if (SettingsEditor2.shouldSettingUpdateFast(type)) {
			this.settingFastUpdateDelayer.trigger(() => this.updateChangedSetting(key, value, manualReset, languageFilter, scope));
		} else {
			this.settingSlowUpdateDelayer.trigger(() => this.updateChangedSetting(key, value, manualReset, languageFilter, scope));
		}
	}

	private updateTreeScrollSync(): void {
		this.settingRenderers.cancelSuggesters();
		if (this.searchResultModel) {
			return;
		}

		if (!this.tocTreeModel) {
			return;
		}

		const elementToSync = this.settingsTree.firstVisibleElement;
		const element = elementToSync instanceof SettingsTreeSettingElement ? elementToSync.parent :
			elementToSync instanceof SettingsTreeGroupElement ? elementToSync :
				null;

		// It's possible for this to be called when the TOC and settings tree are out of sync - e.g. when the settings tree has deferred a refresh because
		// it is focused. So, bail if element doesn't exist in the TOC.
		let nodeExists = true;
		try { this.tocTree.getNode(element); } catch (e) { nodeExists = false; }
		if (!nodeExists) {
			return;
		}

		if (element && this.tocTree.getSelection()[0] !== element) {
			const ancestors = this.getAncestors(element);
			ancestors.forEach(e => this.tocTree.expand(<SettingsTreeGroupElement>e));

			this.tocTree.reveal(element);
			const elementTop = this.tocTree.getRelativeTop(element);
			if (typeof elementTop !== 'number') {
				return;
			}

			this.tocTree.collapseAll();

			ancestors.forEach(e => this.tocTree.expand(<SettingsTreeGroupElement>e));
			if (elementTop < 0 || elementTop > 1) {
				this.tocTree.reveal(element);
			} else {
				this.tocTree.reveal(element, elementTop);
			}

			this.tocTree.expand(element);

			this.tocTree.setSelection([element]);

			const fakeKeyboardEvent = new KeyboardEvent('keydown');
			(<IFocusEventFromScroll>fakeKeyboardEvent).fromScroll = true;
			this.tocTree.setFocus([element], fakeKeyboardEvent);
		}
	}

	private getAncestors(element: SettingsTreeElement): SettingsTreeElement[] {
		const ancestors: SettingsTreeElement[] = [];

		while (element.parent) {
			if (element.parent.id !== 'root') {
				ancestors.push(element.parent);
			}

			element = element.parent;
		}

		return ancestors.reverse();
	}

	private updateChangedSetting(key: string, value: unknown, manualReset: boolean, languageFilter: string | undefined, scope: ConfigurationScope | undefined): Promise<void> {
		// ConfigurationService displays the error if this fails.
		// Force a render afterwards because onDidConfigurationUpdate doesn't fire if the update doesn't result in an effective setting value change.
		const settingsTarget = this.settingsTargetsWidget.settingsTarget;
		const resource = URI.isUri(settingsTarget) ? settingsTarget : undefined;
		const configurationTarget = <ConfigurationTarget | null>(resource ? ConfigurationTarget.WORKSPACE_FOLDER : settingsTarget) ?? ConfigurationTarget.USER_LOCAL;
		const overrides: IConfigurationUpdateOverrides = { resource, overrideIdentifiers: languageFilter ? [languageFilter] : undefined };

		const configurationTargetIsWorkspace = configurationTarget === ConfigurationTarget.WORKSPACE || configurationTarget === ConfigurationTarget.WORKSPACE_FOLDER;

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
					settingsTarget: this.settingsTargetsWidget.settingsTarget as SettingsTarget
				};
				return this.reportModifiedSetting(reportModifiedProps);
			});
	}

	private reportModifiedSetting(props: { key: string; query: string; searchResults: ISearchResult | null; rawResults: ISearchResult[] | null; showConfiguredOnly: boolean; isReset: boolean; settingsTarget: SettingsTarget }): void {
		type SettingsEditorModifiedSettingEvent = {
			key: string;
			groupId: string | undefined;
			providerName: string | undefined;
			nlpIndex: number | undefined;
			displayIndex: number | undefined;
			showConfiguredOnly: boolean;
			isReset: boolean;
			target: string;
		};
		type SettingsEditorModifiedSettingClassification = {
			key: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The setting that is being modified.' };
			groupId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the setting is from the local search or remote search provider, if applicable.' };
			providerName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the search provider, if applicable.' };
			nlpIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The index of the setting in the remote search provider results, if applicable.' };
			displayIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The index of the setting in the combined search results, if applicable.' };
			showConfiguredOnly: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user is in the modified view, which shows configured settings only.' };
			isReset: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Identifies whether a setting was reset to its default value.' };
			target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The scope of the setting, such as user or workspace.' };
			owner: 'rzhao271';
			comment: 'Event emitted when the user modifies a setting in the Settings editor';
		};

		let groupId: string | undefined = undefined;
		let providerName: string | undefined = undefined;
		let nlpIndex: number | undefined = undefined;
		let displayIndex: number | undefined = undefined;
		if (props.searchResults) {
			displayIndex = props.searchResults.filterMatches.findIndex(m => m.setting.key === props.key);

			if (this.searchResultModel) {
				providerName = props.searchResults.filterMatches.find(m => m.setting.key === props.key)?.providerName;
				const rawResults = this.searchResultModel.getRawResults();
				if (rawResults[SearchResultIdx.Local] && displayIndex >= 0) {
					const settingInLocalResults = rawResults[SearchResultIdx.Local].filterMatches.some(m => m.setting.key === props.key);
					groupId = settingInLocalResults ? 'local' : 'remote';
				}
				if (rawResults[SearchResultIdx.Remote]) {
					const _nlpIndex = rawResults[SearchResultIdx.Remote].filterMatches.findIndex(m => m.setting.key === props.key);
					nlpIndex = _nlpIndex >= 0 ? _nlpIndex : undefined;
				}
			}
		}

		const reportedTarget = props.settingsTarget === ConfigurationTarget.USER_LOCAL ? 'user' :
			props.settingsTarget === ConfigurationTarget.USER_REMOTE ? 'user_remote' :
				props.settingsTarget === ConfigurationTarget.WORKSPACE ? 'workspace' :
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

		this.telemetryService.publicLog2<SettingsEditorModifiedSettingEvent, SettingsEditorModifiedSettingClassification>('settingsEditor.settingModified', data);
	}

	private scheduleRefresh(element: HTMLElement, key = ''): void {
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

	private createSettingsOrderByTocIndex(resolvedSettingsRoot: ITOCEntry<ISetting>): Map<string, number> {
		const index = new Map<string, number>();
		function indexSettings(resolvedSettingsRoot: ITOCEntry<ISetting>, counter = 0): number {
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

	private refreshModels(resolvedSettingsRoot: ITOCEntry<ISetting>) {
		// Both calls to refreshModels require a valid settingsTreeModel.
		this.settingsTreeModel.value!.update(resolvedSettingsRoot);
		this.tocTreeModel.settingsTreeRoot = this.settingsTreeModel.value!.root;
		this.settingsOrderByTocIndex = this.createSettingsOrderByTocIndex(resolvedSettingsRoot);
	}

	private async onConfigUpdate(keys?: ReadonlySet<string>, forceRefresh = false, triggerSearch = false): Promise<void> {
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
			} else {
				coreSettingsGroups.push(group);
			}
		}
		const filter = this.canShowAdvancedSettings() ? undefined : { exclude: { tags: [ADVANCED_SETTING_TAG] } };

		const settingsResult = resolveSettingsTree(tocData, coreSettingsGroups, filter, this.logService);
		const resolvedSettingsRoot = settingsResult.tree;

		// Warn for settings not included in layout
		if (settingsResult.leftoverSettings.size && !this.hasWarnedMissingSettings) {
			const settingKeyList: string[] = [];
			settingsResult.leftoverSettings.forEach(s => {
				settingKeyList.push(s.key);
			});

			this.logService.warn(`SettingsEditor2: Settings not included in settingsLayout.ts: ${settingKeyList.join(', ')}`);
			this.hasWarnedMissingSettings = true;
		}

		const additionalGroups: ISettingsGroup[] = [];
		let setAdditionalGroups = false;
		const toggleData = await getExperimentalExtensionToggleData(this.chatEntitlementService, this.extensionGalleryService, this.productService);
		if (toggleData && groups.filter(g => g.extensionInfo).length) {
			for (const key in toggleData.settingsEditorRecommendedExtensions) {
				const extension: IGalleryExtension = toggleData.recommendedExtensionsGalleryInfo[key];
				if (!extension) {
					continue;
				}

				const extensionId = extension.identifier.id;
				// prevent race between extension update handler and this (onConfigUpdate) handler
				await this.refreshInstalledExtensionsList();
				const extensionInstalled = this.installedExtensionIds.includes(extensionId);

				// Drill down to see whether the group and setting already exist
				// and need to be removed.
				const matchingGroupIndex = groups.findIndex(g =>
					g.extensionInfo && g.extensionInfo!.id.toLowerCase() === extensionId.toLowerCase() &&
					g.sections.length === 1 && g.sections[0].settings.length === 1 && g.sections[0].settings[0].displayExtensionId
				);
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
				let manifest: IExtensionManifest | null = null;
				try {
					manifest = await raceTimeout(
						this.extensionGalleryService.getManifest(extension, CancellationToken.None),
						EXTENSION_FETCH_TIMEOUT_MS
					) ?? null;
				} catch (e) {
					// Likely a networking issue.
					// Skip adding a button for this extension to the Settings editor.
					continue;
				}

				if (manifest === null) {
					continue;
				}

				const contributesConfiguration = manifest?.contributes?.configuration;

				let groupTitle: string | undefined;
				if (!Array.isArray(contributesConfiguration)) {
					groupTitle = contributesConfiguration?.title;
				} else if (contributesConfiguration.length === 1) {
					groupTitle = contributesConfiguration[0].title;
				}

				const recommendationInfo = toggleData.settingsEditorRecommendedExtensions[key];
				const extensionName = extension.displayName ?? extension.name ?? extensionId;
				const settingKey = `${key}.manageExtension`;
				const setting: ISetting = {
					range: nullRange,
					key: settingKey,
					keyRange: nullRange,
					value: null,
					valueRange: nullRange,
					description: [recommendationInfo.onSettingsEditorOpen?.descriptionOverride ?? extension.description],
					descriptionIsMarkdown: false,
					descriptionRanges: [],
					scope: ConfigurationScope.WINDOW,
					type: 'null',
					displayExtensionId: extensionId,
					extensionGroupTitle: groupTitle ?? extensionName,
					categoryLabel: 'Extensions',
					title: extensionName
				};
				const additionalGroup: ISettingsGroup = {
					sections: [{
						settings: [setting],
					}],
					id: extensionId,
					title: setting.extensionGroupTitle!,
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

		resolvedSettingsRoot.children!.push(await createTocTreeForExtensionSettings(this.extensionService, extensionSettingsGroups, filter));

		resolvedSettingsRoot.children!.unshift(getCommonlyUsedData(groups, toggleData?.commonlyUsed));

		if (toggleData && setAdditionalGroups) {
			// Add the additional groups to the model to help with searching.
			this.defaultSettingsEditorModel.setAdditionalGroups(additionalGroups);
		}

		if (!this.workspaceTrustManagementService.isWorkspaceTrusted() && (this.viewState.settingsTarget instanceof URI || this.viewState.settingsTarget === ConfigurationTarget.WORKSPACE)) {
			const configuredUntrustedWorkspaceSettings = resolveConfiguredUntrustedSettings(groups, this.viewState.settingsTarget, this.viewState.languageFilter, this.configurationService);
			if (configuredUntrustedWorkspaceSettings.length) {
				resolvedSettingsRoot.children!.unshift({
					id: 'workspaceTrust',
					label: localize('settings require trust', "Workspace Trust"),
					settings: configuredUntrustedWorkspaceSettings
				});
			}
		}

		this.searchResultModel?.updateChildren();

		if (this.settingsTreeModel.value) {
			this.refreshModels(resolvedSettingsRoot);

			if (triggerSearch && this.searchResultModel) {
				// If an extension's settings were just loaded and a search is active, retrigger the search so it shows up
				return await this.onSearchInputChanged(false);
			}

			this.refreshTOCTree();
			this.renderTree(undefined, forceRefresh);
		} else {
			this.settingsTreeModel.value = this.instantiationService.createInstance(SettingsTreeModel, this.viewState, this.workspaceTrustManagementService.isWorkspaceTrusted());
			this.refreshModels(resolvedSettingsRoot);

			// Don't restore the cached state if we already have a query value from calling _setOptions().
			const cachedState = !this.viewState.query ? this.restoreCachedState() : undefined;
			if (cachedState?.searchQuery || this.searchWidget.getValue()) {
				await this.onSearchInputChanged(true);
			} else {
				this.refreshTOCTree();
				this.refreshTree();
				this.tocTree.collapseAll();
			}
		}
	}

	private updateElementsByKey(keys: ReadonlySet<string>): void {
		if (keys.size) {
			if (this.searchResultModel) {
				keys.forEach(key => this.searchResultModel!.updateElementsByName(key));
			}

			if (this.settingsTreeModel.value) {
				keys.forEach(key => this.settingsTreeModel.value!.updateElementsByName(key));
			}

			keys.forEach(key => this.renderTree(key));
		} else {
			this.renderTree();
		}
	}

	private getActiveControlInSettingsTree(): HTMLElement | null {
		const element = this.settingsTree.getHTMLElement();
		const activeElement = element.ownerDocument.activeElement;
		return (activeElement && DOM.isAncestorOfActiveElement(element)) ?
			<HTMLElement>activeElement :
			null;
	}

	private renderTree(key?: string, force = false): void {
		if (!force && key && this.scheduledRefreshes.has(key)) {
			this.updateModifiedLabelForKey(key);
			return;
		}

		// If the context view is focused, delay rendering settings
		if (this.contextViewFocused()) {
			// eslint-disable-next-line no-restricted-syntax
			const element = this.window.document.querySelector('.context-view');
			if (element) {
				this.scheduleRefresh(element as HTMLElement, key);
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
					(focusedSetting.parentElement && !focusedSetting.parentElement.classList.contains('setting-item-list'))
				) {
					this.updateModifiedLabelForKey(key);
					this.scheduleRefresh(focusedSetting, key);
					return;
				}
			} else {
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
			} else {
				// Refresh requested for a key that we don't know about
				return;
			}
		} else {
			this.refreshTree();
		}

		return;
	}

	private contextViewFocused(): boolean {
		return !!DOM.findParentWithClass(<HTMLElement>this.rootElement.ownerDocument.activeElement, 'context-view');
	}

	private refreshSingleElement(element: SettingsTreeSettingElement): void {
		if (this.isVisible()
			&& this.settingsTree.hasElement(element)
			&& (!element.setting.deprecationMessage || element.isConfigured)) {
			this.settingsTree.rerender(element);
		}
	}

	private refreshTree(): void {
		if (this.isVisible() && this.currentSettingsModel) {
			this.settingsTree.setChildren(null, createGroupIterator(this.currentSettingsModel.root));
		}
	}

	private refreshTOCTree(): void {
		if (this.isVisible()) {
			this.tocTreeModel.update();
			this.tocTree.setChildren(null, createTOCIterator(this.tocTreeModel, this.tocTree));
		}
	}

	private updateModifiedLabelForKey(key: string): void {
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

	private async onSearchInputChanged(expandResults: boolean): Promise<void> {
		if (!this.currentSettingsModel) {
			// Initializing search widget value
			return;
		}

		const query = this.searchWidget.getValue().trim();
		this.viewState.query = query;
		await this.triggerSearch(query.replace(/\u203A/g, ' '), expandResults);
	}

	private parseSettingFromJSON(query: string): string | null {
		const match = query.match(/"([a-zA-Z.]+)": /);
		return match && match[1];
	}

	/**
	 * Toggles the visibility of the Settings editor table of contents during a search
	 * depending on the behavior.
	 */
	private toggleTocBySearchBehaviorType() {
		const tocBehavior = this.configurationService.getValue<'filter' | 'hide'>(SEARCH_TOC_BEHAVIOR_KEY);
		const hideToc = tocBehavior === 'hide';
		if (hideToc) {
			this.splitView.setViewVisible(0, false);
			this.splitView.style({
				separatorBorder: Color.transparent
			});
		} else {
			this.layoutSplitView(this.dimension);
		}
	}

	private async triggerSearch(query: string, expandResults: boolean): Promise<void> {
		const progressRunner = this.editorProgressService.show(true, 800);
		const showAdvanced = this.viewState.tagFilters?.has(ADVANCED_SETTING_TAG);
		this.viewState.tagFilters = new Set<string>();
		this.viewState.extensionFilters = new Set<string>();
		this.viewState.featureFilters = new Set<string>();
		this.viewState.idFilters = new Set<string>();
		this.viewState.languageFilter = undefined;
		if (query) {
			const parsedQuery = parseQuery(query);
			query = parsedQuery.query;
			parsedQuery.tags.forEach(tag => this.viewState.tagFilters!.add(tag));
			parsedQuery.extensionFilters.forEach(extensionId => this.viewState.extensionFilters!.add(extensionId));
			parsedQuery.featureFilters.forEach(feature => this.viewState.featureFilters!.add(feature));
			parsedQuery.idFilters.forEach(id => this.viewState.idFilters!.add(id));
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
		} else {
			if (this.viewState.tagFilters.size || this.viewState.extensionFilters.size || this.viewState.featureFilters.size || this.viewState.idFilters.size || this.viewState.languageFilter) {
				this.searchResultModel = this.createFilterModel();
			} else {
				this.searchResultModel = null;
			}

			this.searchDelayer.cancel();
			if (this.searchInProgress) {
				this.searchInProgress.dispose(true);
				this.searchInProgress = null;
			}

			if (expandResults) {
				this.tocTree.setFocus([]);
				this.viewState.filterToCategory = undefined;
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
			} else if (!this.tocTreeDisposed) {
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
	private createFilterModel(): SearchResultModel {
		const filterModel = this.instantiationService.createInstance(SearchResultModel, this.viewState, this.settingsOrderByTocIndex, this.workspaceTrustManagementService.isWorkspaceTrusted());

		const fullResult: ISearchResult = {
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

	private async triggerFilterPreferences(query: string, expandResults: boolean, progressRunner: IProgressRunner): Promise<void> {
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

	private onDidFinishSearch(expandResults: boolean, progressRunner: IProgressRunner | undefined): void {
		this.tocTreeModel.currentSearchModel = this.searchResultModel;
		if (expandResults) {
			this.tocTree.setFocus([]);
			this.viewState.filterToCategory = undefined;
			this.tocTree.expandAll();
			this.settingsTree.scrollTop = 0;
		}
		this.refreshTOCTree();
		this.renderTree(undefined, true);
		progressRunner?.done();
	}

	private doLocalSearch(query: string, token: CancellationToken): Promise<ISearchResult | null> {
		const localSearchProvider = this.preferencesSearchService.getLocalSearchProvider(query);
		return this.searchWithProvider(SearchResultIdx.Local, localSearchProvider, STRING_MATCH_SEARCH_PROVIDER_NAME, token);
	}

	private doRemoteSearch(query: string, token: CancellationToken): Promise<ISearchResult | null> {
		const remoteSearchProvider = this.preferencesSearchService.getRemoteSearchProvider(query);
		if (!remoteSearchProvider) {
			return Promise.resolve(null);
		}
		return this.searchWithProvider(SearchResultIdx.Remote, remoteSearchProvider, TF_IDF_SEARCH_PROVIDER_NAME, token);
	}

	private async doAiSearch(query: string, token: CancellationToken): Promise<ISearchResult | null> {
		const aiSearchProvider = this.preferencesSearchService.getAiSearchProvider(query);
		if (!aiSearchProvider) {
			return null;
		}

		const embeddingsResults = await this.searchWithProvider(SearchResultIdx.Embeddings, aiSearchProvider, EMBEDDINGS_SEARCH_PROVIDER_NAME, token);
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

	private async getLLMRankedResults(query: string, token: CancellationToken): Promise<ISearchResult | null> {
		const aiSearchProvider = this.preferencesSearchService.getAiSearchProvider(query);
		if (!aiSearchProvider) {
			return null;
		}

		this.stopWatch.reset();
		const result = await aiSearchProvider.getLLMRankedResults(token);
		this.stopWatch.stop();

		if (token.isCancellationRequested) {
			return null;
		}

		// Only log the elapsed time if there are actual results.
		if (result && result.filterMatches.length > 0) {
			const elapsed = this.stopWatch.elapsed();
			this.logSearchPerformance(LLM_RANKED_SEARCH_PROVIDER_NAME, elapsed);
		}

		this.searchResultModel!.setResult(SearchResultIdx.AiSelected, result);
		return result;
	}

	private async searchWithProvider(type: SearchResultIdx, searchProvider: ISearchProvider, providerName: string, token: CancellationToken): Promise<ISearchResult | null> {
		this.stopWatch.reset();
		const result = await this._searchPreferencesModel(this.defaultSettingsEditorModel, searchProvider, token);
		this.stopWatch.stop();

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
			const elapsed = this.stopWatch.elapsed();
			this.logSearchPerformance(providerName, elapsed);
		}

		this.searchResultModel ??= this.instantiationService.createInstance(SearchResultModel, this.viewState, this.settingsOrderByTocIndex, this.workspaceTrustManagementService.isWorkspaceTrusted());
		this.searchResultModel.setResult(type, result);
		return result;
	}

	private logSearchPerformance(providerName: string, elapsed: number): void {
		type SettingsEditorSearchPerformanceEvent = {
			providerName: string | undefined;
			elapsedMs: number;
		};
		type SettingsEditorSearchPerformanceClassification = {
			providerName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the search provider, if applicable.' };
			elapsedMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The time taken to perform the search, in milliseconds.' };
			owner: 'rzhao271';
			comment: 'Event emitted when the Settings editor calls a search provider to search for a setting';
		};
		this.telemetryService.publicLog2<SettingsEditorSearchPerformanceEvent, SettingsEditorSearchPerformanceClassification>('settingsEditor.searchPerformance', {
			providerName,
			elapsedMs: elapsed,
		});
	}

	private renderResultCountMessages(showAiResultsMessage: boolean) {
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
		} else {
			const count = this.searchResultModel.getUniqueResultsCount();
			let resultString: string;

			if (showAiResultsMessage) {
				switch (count) {
					case 0: resultString = localize('noResultsWithAiAvailable', "No Settings Found. AI Results Available"); break;
					case 1: resultString = localize('oneResultWithAiAvailable', "1 Setting Found. AI Results Available"); break;
					default: resultString = localize('moreThanOneResultWithAiAvailable', "{0} Settings Found. AI Results Available", count);
				}
			} else {
				switch (count) {
					case 0: resultString = localize('noResults', "No Settings Found"); break;
					case 1: resultString = localize('oneResult', "1 Setting Found"); break;
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

	private async _searchPreferencesModel(model: ISettingsEditorModel, provider: ISearchProvider, token: CancellationToken): Promise<ISearchResult | null> {
		try {
			return await provider.searchModel(model, token);
		} catch (err) {
			if (isCancellationError(err)) {
				return Promise.reject(err);
			} else {
				return null;
			}
		}
	}

	private layoutSplitView(dimension: DOM.Dimension): void {
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

		const tocBehavior = this.configurationService.getValue<'filter' | 'hide'>(SEARCH_TOC_BEHAVIOR_KEY);
		const hideTocForSearch = tocBehavior === 'hide' && this.searchResultModel;
		if (!hideTocForSearch) {
			const firstViewWasVisible = this.splitView.isViewVisible(0);
			const firstViewVisible = this.bodyContainer.clientWidth >= SettingsEditor2.NARROW_TOTAL_WIDTH;

			this.splitView.setViewVisible(0, firstViewVisible);
			// If the first view is again visible, and we have enough space, immediately set the
			// editor to use the reset width rather than the cached min width
			if (!firstViewWasVisible && firstViewVisible && this.bodyContainer.clientWidth >= SettingsEditor2.EDITOR_MIN_WIDTH + SettingsEditor2.TOC_RESET_WIDTH) {
				this.splitView.resizeView(0, SettingsEditor2.TOC_RESET_WIDTH);
			}
			this.splitView.style({
				separatorBorder: firstViewVisible ? this.theme.getColor(settingsSashBorder)! : Color.transparent
			});
		}
	}

	protected override saveState(): void {
		if (this.isVisible()) {
			const searchQuery = this.searchWidget.getValue().trim();
			const target = this.settingsTargetsWidget.settingsTarget as SettingsTarget;
			if (this.input) {
				this.editorMemento.saveEditorState(this.group, this.input, { searchQuery, target });
			}
		} else if (this.input) {
			this.editorMemento.clearEditorState(this.input, this.group);
		}

		super.saveState();
	}
}

class SyncControls extends Disposable {
	private readonly lastSyncedLabel!: HTMLElement;
	private readonly turnOnSyncButton!: Button;

	private readonly _onDidChangeLastSyncedLabel = this._register(new Emitter<string>());
	public readonly onDidChangeLastSyncedLabel = this._onDidChangeLastSyncedLabel.event;

	constructor(
		window: CodeWindow,
		container: HTMLElement,
		@ICommandService private readonly commandService: ICommandService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

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

	private updateLastSyncedTime(): void {
		const last = this.userDataSyncService.lastSyncTime;
		let label: string;
		if (typeof last === 'number') {
			const d = fromNow(last, true, undefined, true);
			label = localize('lastSyncedLabel', "Last synced: {0}", d);
		} else {
			label = '';
		}

		this.lastSyncedLabel.textContent = label;
		this._onDidChangeLastSyncedLabel.fire(label);
	}

	private update(): void {
		if (this.userDataSyncService.status === SyncStatus.Uninitialized) {
			return;
		}

		if (this.userDataSyncEnablementService.isEnabled() || this.userDataSyncService.status !== SyncStatus.Idle) {
			DOM.show(this.lastSyncedLabel);
			DOM.hide(this.turnOnSyncButton.element);
		} else {
			DOM.hide(this.lastSyncedLabel);
			DOM.show(this.turnOnSyncButton.element);
		}
	}
}

interface ISettingsEditor2State {
	searchQuery: string;
	target: SettingsTarget;
}
