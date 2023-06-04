/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button } from 'vs/base/browser/ui/button/button';
import { ITreeElement } from 'vs/base/browser/ui/tree/tree';
import { Action } from 'vs/base/common/actions';
import { Delayer, IntervalTimer, ThrottledDelayer, timeout } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { fromNow } from 'vs/base/common/date';
import { isCancellationError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { withNullAsUndefined, withUndefinedAsNull } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/settingsEditor2';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ConfigurationTarget, IConfigurationUpdateOverrides } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { asCssVariable, badgeBackground, badgeForeground, contrastBorder, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { IUserDataSyncEnablementService, IUserDataSyncService, SyncStatus } from 'vs/platform/userDataSync/common/userDataSync';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorMemento, IEditorOpenContext, IEditorPane } from 'vs/workbench/common/editor';
import { SuggestEnabledInput } from 'vs/workbench/contrib/codeEditor/browser/suggestEnabledInput/suggestEnabledInput';
import { SettingsTarget, SettingsTargetsWidget } from 'vs/workbench/contrib/preferences/browser/preferencesWidgets';
import { getCommonlyUsedData, tocData } from 'vs/workbench/contrib/preferences/browser/settingsLayout';
import { AbstractSettingRenderer, HeightChangeParams, ISettingLinkClickEvent, resolveConfiguredUntrustedSettings, createTocTreeForExtensionSettings, resolveSettingsTree, SettingsTree, SettingTreeRenderers } from 'vs/workbench/contrib/preferences/browser/settingsTree';
import { ISettingsEditorViewState, parseQuery, SearchResultIdx, SearchResultModel, SettingsTreeElement, SettingsTreeGroupChild, SettingsTreeGroupElement, SettingsTreeModel, SettingsTreeSettingElement } from 'vs/workbench/contrib/preferences/browser/settingsTreeModels';
import { createTOCIterator, TOCTree, TOCTreeModel } from 'vs/workbench/contrib/preferences/browser/tocTree';
import { CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_ROW_FOCUS, CONTEXT_SETTINGS_SEARCH_FOCUS, CONTEXT_TOC_ROW_FOCUS, ENABLE_LANGUAGE_FILTER, EXTENSION_SETTING_TAG, FEATURE_SETTING_TAG, ID_SETTING_TAG, IPreferencesSearchService, ISearchProvider, LANGUAGE_SETTING_TAG, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG, REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG, SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, SETTINGS_EDITOR_COMMAND_SUGGEST_FILTERS, WORKSPACE_TRUST_SETTING_TAG, getExperimentalExtensionToggleData } from 'vs/workbench/contrib/preferences/common/preferences';
import { settingsHeaderBorder, settingsSashBorder, settingsTextInputBorder } from 'vs/workbench/contrib/preferences/common/settingsEditorColorRegistry';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IOpenSettingsOptions, IPreferencesService, ISearchResult, ISetting, ISettingsEditorModel, ISettingsEditorOptions, ISettingsGroup, SettingMatchType, SettingValueType, validateSettingsEditorOptions } from 'vs/workbench/services/preferences/common/preferences';
import { SettingsEditor2Input } from 'vs/workbench/services/preferences/common/preferencesEditorInput';
import { Settings2EditorModel, nullRange } from 'vs/workbench/services/preferences/common/preferencesModels';
import { IUserDataSyncWorkbenchService } from 'vs/workbench/services/userDataSync/common/userDataSync';
import { preferencesClearInputIcon, preferencesFilterIcon } from 'vs/workbench/contrib/preferences/browser/preferencesIcons';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { IWorkbenchConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { Orientation, Sizing, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { Color } from 'vs/base/common/color';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { SettingsSearchFilterDropdownMenuActionViewItem } from 'vs/workbench/contrib/preferences/browser/settingsSearchMenu';
import { IExtensionGalleryService, IExtensionManagementService, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ISettingOverrideClickEvent } from 'vs/workbench/contrib/preferences/browser/settingsEditorSettingIndicators';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { IWorkbenchAssignmentService } from 'vs/workbench/services/assignment/common/assignmentService';
import { IProductService } from 'vs/platform/product/common/productService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

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
	private static NARROW_TOTAL_WIDTH: number = SettingsEditor2.TOC_RESET_WIDTH + SettingsEditor2.EDITOR_MIN_WIDTH;

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
	private modelDisposables: DisposableStore;

	private rootElement!: HTMLElement;
	private headerContainer!: HTMLElement;
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
	private settingsTreeModel!: SettingsTreeModel;
	private noResultsMessage!: HTMLElement;
	private clearFilterLinkContainer!: HTMLElement;

	private tocTreeContainer!: HTMLElement;
	private tocTree!: TOCTree;

	private delayedFilterLogging: Delayer<void>;
	private localSearchDelayer: Delayer<void>;
	private remoteSearchThrottle: ThrottledDelayer<void>;
	private searchInProgress: CancellationTokenSource | null = null;

	private searchInputDelayer: Delayer<void>;
	private updatedConfigSchemaDelayer: Delayer<void>;

	private settingFastUpdateDelayer: Delayer<void>;
	private settingSlowUpdateDelayer: Delayer<void>;
	private pendingSettingUpdate: { key: string; value: any; languageFilter: string | undefined } | null = null;

	private readonly viewState: ISettingsEditorViewState;
	private _searchResultModel: SearchResultModel | null = null;
	private searchResultLabel: string | null = null;
	private lastSyncedLabel: string | null = null;

	private tocRowFocused: IContextKey<boolean>;
	private settingRowFocused: IContextKey<boolean>;
	private inSettingsEditorContextKey: IContextKey<boolean>;
	private searchFocusContextKey: IContextKey<boolean>;

	private scheduledRefreshes: Map<string, DOM.IFocusTracker>;
	private _currentFocusContext: SettingsFocusContext = SettingsFocusContext.Search;

	/** Don't spam warnings */
	private hasWarnedMissingSettings = false;

	/** Persist the search query upon reloads */
	private editorMemento: IEditorMemento<ISettingsEditor2State>;

	private tocFocusedElement: SettingsTreeGroupElement | null = null;
	private treeFocusedElement: SettingsTreeElement | null = null;
	private settingsTreeScrollTop = 0;
	private dimension!: DOM.Dimension;

	private installedExtensionIds: string[] = [];

	constructor(
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
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IWorkbenchAssignmentService private readonly workbenchAssignmentService: IWorkbenchAssignmentService,
		@IProductService private readonly productService: IProductService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
	) {
		super(SettingsEditor2.ID, telemetryService, themeService, storageService);
		this.delayedFilterLogging = new Delayer<void>(1000);
		this.localSearchDelayer = new Delayer(300);
		this.remoteSearchThrottle = new ThrottledDelayer(200);
		this.viewState = { settingsTarget: ConfigurationTarget.USER_LOCAL };

		this.settingFastUpdateDelayer = new Delayer<void>(SettingsEditor2.SETTING_UPDATE_FAST_DEBOUNCE);
		this.settingSlowUpdateDelayer = new Delayer<void>(SettingsEditor2.SETTING_UPDATE_SLOW_DEBOUNCE);

		this.searchInputDelayer = new Delayer<void>(SettingsEditor2.SEARCH_DEBOUNCE);
		this.updatedConfigSchemaDelayer = new Delayer<void>(SettingsEditor2.CONFIG_SCHEMA_UPDATE_DELAYER);

		this.inSettingsEditorContextKey = CONTEXT_SETTINGS_EDITOR.bindTo(contextKeyService);
		this.searchFocusContextKey = CONTEXT_SETTINGS_SEARCH_FOCUS.bindTo(contextKeyService);
		this.tocRowFocused = CONTEXT_TOC_ROW_FOCUS.bindTo(contextKeyService);
		this.settingRowFocused = CONTEXT_SETTINGS_ROW_FOCUS.bindTo(contextKeyService);

		this.scheduledRefreshes = new Map<string, DOM.IFocusTracker>();

		this.editorMemento = this.getEditorMemento<ISettingsEditor2State>(editorGroupService, textResourceConfigurationService, SETTINGS_EDITOR_STATE_KEY);

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.source !== ConfigurationTarget.DEFAULT) {
				this.onConfigUpdate(e.affectedKeys);
			}
		}));

		this._register(workspaceTrustManagementService.onDidChangeTrust(() => {
			this.searchResultModel?.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted());

			if (this.settingsTreeModel) {
				this.settingsTreeModel.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted());
				this.renderTree();
			}
		}));

		this._register(configurationService.onDidChangeRestrictedSettings(e => {
			if (e.default.length && this.currentSettingsModel) {
				this.updateElementsByKey(new Set(e.default));
			}
		}));

		this.modelDisposables = this._register(new DisposableStore());

		if (ENABLE_LANGUAGE_FILTER && !SettingsEditor2.SUGGESTIONS.includes(`@${LANGUAGE_SETTING_TAG}`)) {
			SettingsEditor2.SUGGESTIONS.push(`@${LANGUAGE_SETTING_TAG}`);
		}

		extensionManagementService.getInstalled().then(extensions => {
			this.installedExtensionIds = extensions
				.filter(ext => ext.manifest && ext.manifest.contributes && ext.manifest.contributes.configuration)
				.map(ext => ext.identifier.id);
		});
	}

	override get minimumWidth(): number { return SettingsEditor2.EDITOR_MIN_WIDTH; }
	override get maximumWidth(): number { return Number.POSITIVE_INFINITY; }
	override get minimumHeight() { return 180; }

	// these setters need to exist because this extends from EditorPane
	override set minimumWidth(value: number) { /*noop*/ }
	override set maximumWidth(value: number) { /*noop*/ }

	private get currentSettingsModel() {
		return this.searchResultModel || this.settingsTreeModel;
	}

	private get searchResultModel(): SearchResultModel | null {
		return this._searchResultModel;
	}

	private set searchResultModel(value: SearchResultModel | null) {
		this._searchResultModel = value;

		this.rootElement.classList.toggle('search-mode', !!this._searchResultModel);
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
	}

	override async setInput(input: SettingsEditor2Input, options: ISettingsEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.inSettingsEditorContextKey.set(true);
		await super.setInput(input, options, context, token);
		await timeout(0); // Force setInput to be async
		if (!this.input) {
			return;
		}

		const model = await this.input.resolve(options);
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
			this._register(input.onWillDispose(() => {
				this.searchWidget.setValue('');
			}));

			// Init TOC selection
			this.updateTreeScrollSync();
		});
	}

	private restoreCachedState(): ISettingsEditor2State | null {
		const cachedState = this.group && this.input && this.editorMemento.loadEditorState(this.group, this.input);
		if (cachedState && typeof cachedState.target === 'object') {
			cachedState.target = URI.revive(cachedState.target);
		}

		if (cachedState) {
			const settingsTarget = cachedState.target;
			this.settingsTargetsWidget.settingsTarget = settingsTarget;
			this.viewState.settingsTarget = settingsTarget;
			this.searchWidget.setValue(cachedState.searchQuery);
		}

		if (this.input) {
			this.editorMemento.clearEditorState(this.input, this.group);
		}

		return withUndefinedAsNull(cachedState);
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
			this.settingsTargetsWidget.settingsTarget = target;
			this.viewState.settingsTarget = target;
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
		// minus padding inside inputbox, countElement width, controls width, extra padding before countElement
		const monacoWidth = innerWidth - 10 - this.countElement.clientWidth - this.controlsElement.clientWidth - 12;
		this.searchWidget.layout(new DOM.Dimension(monacoWidth, 20));

		this.rootElement.classList.toggle('narrow-width', dimension.width < SettingsEditor2.NARROW_TOTAL_WIDTH);
	}

	override focus(): void {
		if (this._currentFocusContext === SettingsFocusContext.Search) {
			if (!platform.isIOS) {
				// #122044
				this.focusSearch();
			}
		} else if (this._currentFocusContext === SettingsFocusContext.SettingControl) {
			const element = this.focusedSettingDOMElement;
			if (element) {
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

	protected override setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		super.setEditorVisible(visible, group);

		if (!visible) {
			// Wait for editor to be removed from DOM #106303
			setTimeout(() => {
				this.searchWidget.onHide();
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

		this.searchWidget.focus(selectAll);
	}

	clearSearchResults(): void {
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

	private createHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.settings-header'));

		const searchContainer = DOM.append(this.headerContainer, $('.search-container'));

		const clearInputAction = new Action(SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, localize('clearInput', "Clear Settings Search Input"), ThemeIcon.asClassName(preferencesClearInputIcon), false, async () => this.clearSearchResults());
		const filterAction = new Action(SETTINGS_EDITOR_COMMAND_SUGGEST_FILTERS, localize('filterInput', "Filter Settings"), ThemeIcon.asClassName(preferencesFilterIcon));
		this.searchWidget = this._register(this.instantiationService.createInstance(SuggestEnabledInput, `${SettingsEditor2.ID}.searchbox`, searchContainer, {
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
				} else if (queryParts[queryParts.length - 1].startsWith('@')) {
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

		this.countElement = DOM.append(searchContainer, DOM.$('.settings-count-widget.monaco-count-badge.long'));

		this.countElement.style.backgroundColor = asCssVariable(badgeBackground);
		this.countElement.style.color = asCssVariable(badgeForeground);
		this.countElement.style.border = `1px solid ${asCssVariable(contrastBorder)}`;

		this._register(this.searchWidget.onInputDidChange(() => {
			const searchVal = this.searchWidget.getValue();
			clearInputAction.enabled = !!searchVal;
			this.searchInputDelayer.trigger(() => this.onSearchInputChanged());
		}));

		const headerControlsContainer = DOM.append(this.headerContainer, $('.settings-header-controls'));
		headerControlsContainer.style.borderColor = asCssVariable(settingsHeaderBorder);

		const targetWidgetContainer = DOM.append(headerControlsContainer, $('.settings-target-container'));
		this.settingsTargetsWidget = this._register(this.instantiationService.createInstance(SettingsTargetsWidget, targetWidgetContainer, { enableRemoteSettings: true }));
		this.settingsTargetsWidget.settingsTarget = ConfigurationTarget.USER_LOCAL;
		this.settingsTargetsWidget.onDidTargetChange(target => this.onDidSettingsTargetChange(target));
		this._register(DOM.addDisposableListener(targetWidgetContainer, DOM.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.DownArrow) {
				this.focusSettings();
			}
		}));

		if (this.userDataSyncWorkbenchService.enabled && this.userDataSyncEnablementService.canToggleEnablement()) {
			const syncControls = this._register(this.instantiationService.createInstance(SyncControls, headerControlsContainer));
			this._register(syncControls.onDidChangeLastSyncedLabel(lastSyncedLabel => {
				this.lastSyncedLabel = lastSyncedLabel;
				this.updateInputAriaLabel();
			}));
		}

		this.controlsElement = DOM.append(searchContainer, DOM.$('.settings-clear-widget'));

		const actionBar = this._register(new ActionBar(this.controlsElement, {
			animated: false,
			actionViewItemProvider: (action) => {
				if (action.id === filterAction.id) {
					return this.instantiationService.createInstance(SettingsSearchFilterDropdownMenuActionViewItem, action, this.actionRunner, this.searchWidget);
				}
				return undefined;
			}
		}));

		actionBar.push([clearInputAction, filterAction], { label: false, icon: true });
	}

	private onDidSettingsTargetChange(target: SettingsTarget): void {
		this.viewState.settingsTarget = target;

		// TODO Instead of rebuilding the whole model, refresh and uncache the inspected setting value
		this.onConfigUpdate(undefined, true);
	}

	private onDidClickSetting(evt: ISettingLinkClickEvent, recursed?: boolean): void {
		const targetElement = this.currentSettingsModel.getElementsByName(evt.targetKey)?.[0];
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
			const p = this.triggerSearch('');
			p.then(() => {
				this.searchWidget.setValue('');
				this.onDidClickSetting(evt, true);
			});
		}
	}

	switchToApplicationSettingsFile(): Promise<IEditorPane | undefined> {
		const query = parseQuery(this.searchWidget.getValue()).query;
		return this.openSettingsFile({ query }, true);
	}

	switchToSettingsFile(): Promise<IEditorPane | undefined> {
		const query = parseQuery(this.searchWidget.getValue()).query;
		return this.openSettingsFile({ query });
	}

	private async openSettingsFile(options?: ISettingsEditorOptions, forceOpenApplicationSettings?: boolean): Promise<IEditorPane | undefined> {
		const currentSettingsTarget = this.settingsTargetsWidget.settingsTarget;

		const openOptions: IOpenSettingsOptions = { jsonEditor: true, ...options };
		if (currentSettingsTarget === ConfigurationTarget.USER_LOCAL) {
			if (options?.revealSetting) {
				const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
				const configurationScope = configurationProperties[options?.revealSetting.key]?.scope;
				if (configurationScope === ConfigurationScope.APPLICATION) {
					return this.preferencesService.openApplicationSettings(openOptions);
				}
			}
			if (forceOpenApplicationSettings) {
				return this.preferencesService.openApplicationSettings(openOptions);
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

		this.splitView = new SplitView(this.bodyContainer, {
			orientation: Orientation.HORIZONTAL,
			proportionalLayout: true
		});
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
				e.target.tagName !== 'TEXTAREA' &&
				e.target.tagName !== 'INPUT'
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

		this._register(this.tocTree.onDidFocus(() => {
			this._currentFocusContext = SettingsFocusContext.TableOfContents;
		}));

		this._register(this.tocTree.onDidChangeFocus(e => {
			const element: SettingsTreeGroupElement | null = withUndefinedAsNull(e.elements?.[0]);
			if (this.tocFocusedElement === element) {
				return;
			}

			this.tocFocusedElement = element;
			this.tocTree.setSelection(element ? [element] : []);
			if (this.searchResultModel) {
				if (this.viewState.filterToCategory !== element) {
					this.viewState.filterToCategory = withNullAsUndefined(element);
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
		this.settingRenderers = this.instantiationService.createInstance(SettingTreeRenderers);
		this._register(this.settingRenderers.onDidChangeSetting(e => this.onDidChangeSetting(e.key, e.value, e.type, e.manualReset, e.scope)));
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
			const classList = document.activeElement?.classList;
			if (classList && classList.contains('monaco-list') && classList.contains('settings-editor-tree')) {
				this._currentFocusContext = SettingsFocusContext.SettingTree;
				this.settingRowFocused.set(true);
				this.treeFocusedElement ??= withUndefinedAsNull(this.settingsTree.firstVisibleElement);
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

	private onDidChangeSetting(key: string, value: any, type: SettingValueType | SettingValueType[], manualReset: boolean, scope: ConfigurationScope | undefined): void {
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
		const ancestors: any[] = [];

		while (element.parent) {
			if (element.parent.id !== 'root') {
				ancestors.push(element.parent);
			}

			element = element.parent;
		}

		return ancestors.reverse();
	}

	private updateChangedSetting(key: string, value: any, manualReset: boolean, languageFilter: string | undefined, scope: ConfigurationScope | undefined): Promise<void> {
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
				const reportModifiedProps = {
					key,
					query,
					searchResults: this.searchResultModel && this.searchResultModel.getUniqueResults(),
					rawResults: this.searchResultModel && this.searchResultModel.getRawResults(),
					showConfiguredOnly: !!this.viewState.tagFilters && this.viewState.tagFilters.has(MODIFIED_SETTING_TAG),
					isReset: typeof value === 'undefined',
					settingsTarget: this.settingsTargetsWidget.settingsTarget as SettingsTarget
				};

				return this.reportModifiedSetting(reportModifiedProps);
			});
	}

	private reportModifiedSetting(props: { key: string; query: string; searchResults: ISearchResult[] | null; rawResults: ISearchResult[] | null; showConfiguredOnly: boolean; isReset: boolean; settingsTarget: SettingsTarget }): void {
		type SettingsEditorModifiedSettingEvent = {
			key: string;
			groupId: string | undefined;
			nlpIndex: number | undefined;
			displayIndex: number | undefined;
			showConfiguredOnly: boolean;
			isReset: boolean;
			target: string;
		};
		type SettingsEditorModifiedSettingClassification = {
			key: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The setting that is being modified.' };
			groupId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the setting is from the local search or remote search provider, if applicable.' };
			nlpIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The index of the setting in the remote search provider results, if applicable.' };
			displayIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The index of the setting in the combined search results, if applicable.' };
			showConfiguredOnly: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user is in the modified view, which shows configured settings only.' };
			isReset: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Identifies whether a setting was reset to its default value.' };
			target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The scope of the setting, such as user or workspace.' };
			owner: 'rzhao271';
			comment: 'Event which fires when the user modifies a setting in the settings editor';
		};

		this.pendingSettingUpdate = null;

		let groupId: string | undefined = undefined;
		let nlpIndex: number | undefined = undefined;
		let displayIndex: number | undefined = undefined;
		if (props.searchResults) {
			const remoteResult = props.searchResults[SearchResultIdx.Remote];
			const localResult = props.searchResults[SearchResultIdx.Local];

			const localIndex = localResult!.filterMatches.findIndex(m => m.setting.key === props.key);
			groupId = localIndex >= 0 ?
				'local' :
				'remote';

			displayIndex = localIndex >= 0 ?
				localIndex :
				remoteResult && (remoteResult.filterMatches.findIndex(m => m.setting.key === props.key) + localResult.filterMatches.length);

			if (this.searchResultModel) {
				const rawResults = this.searchResultModel.getRawResults();
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
			nlpIndex,
			displayIndex,
			showConfiguredOnly: props.showConfiguredOnly,
			isReset: props.isReset,
			target: reportedTarget
		};

		this.telemetryService.publicLog2<SettingsEditorModifiedSettingEvent, SettingsEditorModifiedSettingClassification>('settingsEditor.settingModified', data);
	}

	private onSearchModeToggled(): void {
		this.rootElement.classList.remove('no-toc-search');
		if (this.configurationService.getValue('workbench.settings.settingsSearchTocBehavior') === 'hide') {
			this.rootElement.classList.toggle('no-toc-search', !!this.searchResultModel);
		}
	}

	private scheduleRefresh(element: HTMLElement, key = ''): void {
		if (key && this.scheduledRefreshes.has(key)) {
			return;
		}

		if (!key) {
			dispose(this.scheduledRefreshes.values());
			this.scheduledRefreshes.clear();
		}

		const scheduledRefreshTracker = DOM.trackFocus(element);
		this.scheduledRefreshes.set(key, scheduledRefreshTracker);
		scheduledRefreshTracker.onDidBlur(() => {
			scheduledRefreshTracker.dispose();
			this.scheduledRefreshes.delete(key);
			this.onConfigUpdate(new Set([key]));
		});
	}

	private addOrRemoveManageExtensionSetting(setting: ISetting, extension: IGalleryExtension, groups: ISettingsGroup[]): ISettingsGroup | undefined {
		const matchingGroups = groups.filter(g => {
			const lowerCaseId = g.extensionInfo?.id.toLowerCase();
			return (lowerCaseId === setting.stableExtensionId!.toLowerCase() ||
				lowerCaseId === setting.prereleaseExtensionId!.toLowerCase());
		});

		const extensionId = setting.displayExtensionId!;
		if (!matchingGroups.length) {
			const newGroup: ISettingsGroup = {
				sections: [{
					settings: [setting],
				}],
				id: extensionId,
				title: setting.extensionGroupTitle!,
				titleRange: nullRange,
				range: nullRange,
				extensionInfo: {
					id: extensionId,
					displayName: extension?.displayName,
				}
			};
			groups.push(newGroup);
			return newGroup;
		} else if (matchingGroups.length >= 2) {
			// Remove the group with the manage extension setting.
			const matchingGroupIndex = matchingGroups.findIndex(group =>
				group.sections.length === 1 && group.sections[0].settings.length === 1 && group.sections[0].settings[0].displayExtensionId);
			if (matchingGroupIndex !== -1) {
				groups.splice(matchingGroupIndex, 1);
			}
		}
		return undefined;
	}

	private async onConfigUpdate(keys?: ReadonlySet<string>, forceRefresh = false, schemaChange = false): Promise<void> {
		if (keys && this.settingsTreeModel) {
			return this.updateElementsByKey(keys);
		}

		if (!this.defaultSettingsEditorModel) {
			return;
		}

		const groups = this.defaultSettingsEditorModel.settingsGroups.slice(1); // Without commonlyUsed

		const coreSettings = groups.filter(g => !g.extensionInfo);
		const settingsResult = resolveSettingsTree(tocData, coreSettings, this.logService);
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
		const toggleData = await getExperimentalExtensionToggleData(this.workbenchAssignmentService, this.environmentService, this.productService);
		if (toggleData && groups.filter(g => g.extensionInfo).length) {
			for (const key in toggleData.settingsEditorRecommendedExtensions) {
				const prerelease = toggleData.settingsEditorRecommendedExtensions[key].onSettingsEditorOpen!.prerelease;

				const extensionId = (typeof prerelease === 'string' && this.productService.quality !== 'stable') ? prerelease : key;
				const [extension] = await this.extensionGalleryService.getExtensions([{ id: extensionId }], CancellationToken.None);
				if (!extension) {
					continue;
				}

				let groupTitle: string | undefined;
				const manifest = await this.extensionGalleryService.getManifest(extension, CancellationToken.None);
				const contributesConfiguration = manifest?.contributes?.configuration;
				if (!Array.isArray(contributesConfiguration)) {
					groupTitle = contributesConfiguration?.title;
				} else if (contributesConfiguration.length === 1) {
					groupTitle = contributesConfiguration[0].title;
				}

				const extensionName = extension?.displayName ?? extension?.name ?? extensionId;
				const settingKey = `${key}.manageExtension`;
				const setting: ISetting = {
					range: nullRange,
					key: settingKey,
					keyRange: nullRange,
					value: null,
					valueRange: nullRange,
					description: [extension?.description || ''],
					descriptionIsMarkdown: false,
					descriptionRanges: [],
					title: extensionName,
					scope: ConfigurationScope.WINDOW,
					type: 'null',
					displayExtensionId: extensionId,
					stableExtensionId: key,
					prereleaseExtensionId: typeof prerelease === 'string' ? prerelease : key,
					extensionGroupTitle: groupTitle ?? extensionName
				};
				const additionalGroup = this.addOrRemoveManageExtensionSetting(setting, extension, groups);
				if (additionalGroup) {
					additionalGroups.push(additionalGroup);
				}
			}
		}

		resolvedSettingsRoot.children!.push(await createTocTreeForExtensionSettings(this.extensionService, groups.filter(g => g.extensionInfo)));

		const commonlyUsedDataToUse = await getCommonlyUsedData(this.workbenchAssignmentService, this.environmentService, this.productService);
		const commonlyUsed = resolveSettingsTree(commonlyUsedDataToUse, groups, this.logService);
		resolvedSettingsRoot.children!.unshift(commonlyUsed.tree);

		if (toggleData) {
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

		if (this.settingsTreeModel) {
			this.settingsTreeModel.update(resolvedSettingsRoot);

			if (schemaChange && !!this.searchResultModel) {
				// If an extension's settings were just loaded and a search is active, retrigger the search so it shows up
				return await this.onSearchInputChanged();
			}

			this.refreshTOCTree();
			this.renderTree(undefined, forceRefresh);
		} else {
			this.settingsTreeModel = this.instantiationService.createInstance(SettingsTreeModel, this.viewState, this.workspaceTrustManagementService.isWorkspaceTrusted());
			this.settingsTreeModel.update(resolvedSettingsRoot);
			this.tocTreeModel.settingsTreeRoot = this.settingsTreeModel.root as SettingsTreeGroupElement;

			// Don't restore the cached state if we already have a query value from calling _setOptions().
			const cachedState = !this.viewState.query ? this.restoreCachedState() : undefined;
			if (cachedState?.searchQuery || this.searchWidget.getValue()) {
				await this.onSearchInputChanged();
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

			if (this.settingsTreeModel) {
				keys.forEach(key => this.settingsTreeModel.updateElementsByName(key));
			}

			keys.forEach(key => this.renderTree(key));
		} else {
			return this.renderTree();
		}
	}

	private getActiveControlInSettingsTree(): HTMLElement | null {
		return (document.activeElement && DOM.isAncestor(document.activeElement, this.settingsTree.getHTMLElement())) ?
			<HTMLElement>document.activeElement :
			null;
	}

	private renderTree(key?: string, force = false): void {
		if (!force && key && this.scheduledRefreshes.has(key)) {
			this.updateModifiedLabelForKey(key);
			return;
		}

		// If the context view is focused, delay rendering settings
		if (this.contextViewFocused()) {
			const element = document.querySelector('.context-view');
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

		this.renderResultCountMessages();

		if (key) {
			const elements = this.currentSettingsModel.getElementsByName(key);
			if (elements && elements.length) {
				// TODO https://github.com/microsoft/vscode/issues/57360
				this.refreshTree();
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
		return !!DOM.findParentWithClass(<HTMLElement>document.activeElement, 'context-view');
	}

	private refreshTree(): void {
		if (this.isVisible()) {
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
		const dataElements = this.currentSettingsModel.getElementsByName(key);
		const isModified = dataElements && dataElements[0] && dataElements[0].isConfigured; // all elements are either configured or not
		const elements = this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), key);
		if (elements && elements[0]) {
			elements[0].classList.toggle('is-configured', !!isModified);
		}
	}

	private async onSearchInputChanged(): Promise<void> {
		if (!this.currentSettingsModel) {
			// Initializing search widget value
			return;
		}

		const query = this.searchWidget.getValue().trim();
		this.viewState.query = query;
		this.delayedFilterLogging.cancel();
		await this.triggerSearch(query.replace(/\u203A/g, ' '));

		if (query && this.searchResultModel) {
			this.delayedFilterLogging.trigger(() => this.reportFilteringUsed(this.searchResultModel!.getUniqueResults()));
		}
	}

	private parseSettingFromJSON(query: string): string | null {
		const match = query.match(/"([a-zA-Z.]+)": /);
		return match && match[1];
	}

	private triggerSearch(query: string): Promise<void> {
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
			parsedQuery.featureFilters!.forEach(feature => this.viewState.featureFilters!.add(feature));
			parsedQuery.idFilters!.forEach(id => this.viewState.idFilters!.add(id));
			this.viewState.languageFilter = parsedQuery.languageFilter;
		}

		this.settingsTargetsWidget.updateLanguageFilterIndicators(this.viewState.languageFilter);

		if (query && query !== '@') {
			query = this.parseSettingFromJSON(query) || query;
			return this.triggerFilterPreferences(query);
		} else {
			if (this.viewState.tagFilters.size || this.viewState.extensionFilters.size || this.viewState.featureFilters.size || this.viewState.idFilters.size || this.viewState.languageFilter) {
				this.searchResultModel = this.createFilterModel();
			} else {
				this.searchResultModel = null;
			}

			this.localSearchDelayer.cancel();
			this.remoteSearchThrottle.cancel();
			if (this.searchInProgress) {
				this.searchInProgress.cancel();
				this.searchInProgress.dispose();
				this.searchInProgress = null;
			}

			this.tocTree.setFocus([]);
			this.viewState.filterToCategory = undefined;
			this.tocTreeModel.currentSearchModel = this.searchResultModel;
			this.onSearchModeToggled();

			if (this.searchResultModel) {
				// Added a filter model
				this.tocTree.setSelection([]);
				this.tocTree.expandAll();
				this.refreshTOCTree();
				this.renderResultCountMessages();
				this.refreshTree();
			} else {
				// Leaving search mode
				this.tocTree.collapseAll();
				this.refreshTOCTree();
				this.renderResultCountMessages();
				this.refreshTree();
			}
		}

		return Promise.resolve();
	}

	/**
	 * Return a fake SearchResultModel which can hold a flat list of all settings, to be filtered (@modified etc)
	 */
	private createFilterModel(): SearchResultModel {
		const filterModel = this.instantiationService.createInstance(SearchResultModel, this.viewState, this.workspaceTrustManagementService.isWorkspaceTrusted());

		const fullResult: ISearchResult = {
			filterMatches: []
		};
		for (const g of this.defaultSettingsEditorModel.settingsGroups.slice(1)) {
			for (const sect of g.sections) {
				for (const setting of sect.settings) {
					fullResult.filterMatches.push({ setting, matches: [], matchType: SettingMatchType.None, score: 0 });
				}
			}
		}

		filterModel.setResult(0, fullResult);

		return filterModel;
	}

	private reportFilteringUsed(results: ISearchResult[]): void {
		type SettingsEditorFilterEvent = {
			'durations.nlpResult': number | undefined;
			'counts.nlpResult': number | undefined;
			'counts.filterResult': number | undefined;
			'requestCount': number | undefined;
		};
		type SettingsEditorFilterClassification = {
			'durations.nlpResult': { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; 'comment': 'How long the remote search provider took, if applicable.' };
			'counts.nlpResult': { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; 'comment': 'The number of matches found by the remote search provider, if applicable.' };
			'counts.filterResult': { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; 'comment': 'The number of matches found by the local search provider, if applicable.' };
			'requestCount': { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; 'comment': 'The number of requests sent to Bing, if applicable.' };
			owner: 'rzhao271';
			comment: 'Tracks the number of requests and performance of the built-in search providers';
		};

		const nlpResult = results[SearchResultIdx.Remote];
		const nlpMetadata = nlpResult?.metadata;

		const duration = {
			nlpResult: nlpMetadata?.duration
		};

		// Count unique results
		const counts: { nlpResult?: number; filterResult?: number } = {};
		const filterResult = results[SearchResultIdx.Local];
		if (filterResult) {
			counts['filterResult'] = filterResult.filterMatches.length;
		}

		if (nlpResult) {
			counts['nlpResult'] = nlpResult.filterMatches.length;
		}

		const requestCount = nlpMetadata?.requestCount;

		const data = {
			'durations.nlpResult': duration.nlpResult,
			'counts.nlpResult': counts['nlpResult'],
			'counts.filterResult': counts['filterResult'],
			requestCount
		};

		this.telemetryService.publicLog2<SettingsEditorFilterEvent, SettingsEditorFilterClassification>('settingsEditor.filter', data);
	}

	private triggerFilterPreferences(query: string): Promise<void> {
		if (this.searchInProgress) {
			this.searchInProgress.cancel();
			this.searchInProgress = null;
		}

		// Trigger the local search. If it didn't find an exact match, trigger the remote search.
		const searchInProgress = this.searchInProgress = new CancellationTokenSource();
		return this.localSearchDelayer.trigger(() => {
			if (searchInProgress && !searchInProgress.token.isCancellationRequested) {
				return this.localFilterPreferences(query).then(result => {
					if (result && !result.exactMatch) {
						this.remoteSearchThrottle.trigger(() => {
							return searchInProgress && !searchInProgress.token.isCancellationRequested ?
								this.remoteSearchPreferences(query, this.searchInProgress!.token) :
								Promise.resolve();
						});
					}
				});
			} else {
				return Promise.resolve();
			}
		});
	}

	private localFilterPreferences(query: string, token?: CancellationToken): Promise<ISearchResult | null> {
		const localSearchProvider = this.preferencesSearchService.getLocalSearchProvider(query);
		return this.filterOrSearchPreferences(query, SearchResultIdx.Local, localSearchProvider, token);
	}

	private remoteSearchPreferences(query: string, token?: CancellationToken): Promise<void> {
		const remoteSearchProvider = this.preferencesSearchService.getRemoteSearchProvider(query);
		const newExtSearchProvider = this.preferencesSearchService.getRemoteSearchProvider(query, true);

		return Promise.all([
			this.filterOrSearchPreferences(query, SearchResultIdx.Remote, remoteSearchProvider, token),
			this.filterOrSearchPreferences(query, SearchResultIdx.NewExtensions, newExtSearchProvider, token)
		]).then(() => { });
	}

	private filterOrSearchPreferences(query: string, type: SearchResultIdx, searchProvider?: ISearchProvider, token?: CancellationToken): Promise<ISearchResult | null> {
		return this._filterOrSearchPreferencesModel(query, this.defaultSettingsEditorModel, searchProvider, token).then(result => {
			if (token && token.isCancellationRequested) {
				// Handle cancellation like this because cancellation is lost inside the search provider due to async/await
				return null;
			}

			if (!this.searchResultModel) {
				this.searchResultModel = this.instantiationService.createInstance(SearchResultModel, this.viewState, this.workspaceTrustManagementService.isWorkspaceTrusted());
				// Must be called before this.renderTree()
				// to make sure the search results count is set.
				this.searchResultModel.setResult(type, result);
				this.tocTreeModel.currentSearchModel = this.searchResultModel;
				this.onSearchModeToggled();
			} else {
				this.searchResultModel.setResult(type, result);
				this.tocTreeModel.update();
			}

			if (type === SearchResultIdx.Local) {
				this.tocTree.setFocus([]);
				this.viewState.filterToCategory = undefined;
				this.tocTree.expandAll();
			}

			this.settingsTree.scrollTop = 0;
			this.refreshTOCTree();
			this.renderTree(undefined, true);
			return result;
		});
	}

	private renderResultCountMessages() {
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
				this.layout(this.dimension);
			}

			this.rootElement.classList.remove('no-results');
			this.splitView.el.style.visibility = 'visible';
			return;
		} else {
			const count = this.searchResultModel.getUniqueResultsCount();
			let resultString: string;
			switch (count) {
				case 0: resultString = localize('noResults', "No Settings Found"); break;
				case 1: resultString = localize('oneResult', "1 Setting Found"); break;
				default: resultString = localize('moreThanOneResult', "{0} Settings Found", count);
			}

			this.searchResultLabel = resultString;
			this.updateInputAriaLabel();
			this.countElement.innerText = resultString;
			aria.status(resultString);

			if (this.countElement.style.display !== 'block') {
				this.countElement.style.display = 'block';
				this.layout(this.dimension);
			}
			this.rootElement.classList.toggle('no-results', count === 0);
			this.splitView.el.style.visibility = count === 0 ? 'hidden' : 'visible';
		}
	}

	private _filterOrSearchPreferencesModel(filter: string, model: ISettingsEditorModel, provider?: ISearchProvider, token?: CancellationToken): Promise<ISearchResult | null> {
		const searchP = provider ? provider.searchModel(model, token) : Promise.resolve(null);
		return searchP
			.then<ISearchResult, ISearchResult | null>(undefined, err => {
				if (isCancellationError(err)) {
					return Promise.reject(err);
				} else {
					// type SettingsSearchErrorEvent = {
					// 	'message': string;
					// };
					// type SettingsSearchErrorClassification = {
					// 	owner: 'rzhao271';
					// 	comment: 'Helps understand when settings search errors out';
					// 	'message': { 'classification': 'CallstackOrException'; 'purpose': 'FeatureInsight'; 'owner': 'rzhao271'; 'comment': 'The error message of the search error.' };
					// };

					// const message = getErrorMessage(err).trim();
					// if (message && message !== 'Error') {
					// 	// "Error" = any generic network error
					// 	this.telemetryService.publicLogError2<SettingsSearchErrorEvent, SettingsSearchErrorClassification>('settingsEditor.searchError', { message });
					// 	this.logService.info('Setting search error: ' + message);
					// }
					return null;
				}
			});
	}

	private layoutSplitView(dimension: DOM.Dimension): void {
		const listHeight = dimension.height - (72 + 11 + 14 /* header height + editor padding */);

		this.splitView.el.style.height = `${listHeight}px`;

		// We call layout first so the splitView has an idea of how much
		// space it has, otherwise setViewVisible results in the first panel
		// showing up at the minimum size whenever the Settings editor
		// opens for the first time.
		this.splitView.layout(this.bodyContainer.clientWidth, listHeight);

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

	protected override saveState(): void {
		if (this.isVisible()) {
			const searchQuery = this.searchWidget.getValue().trim();
			const target = this.settingsTargetsWidget.settingsTarget as SettingsTarget;
			if (this.group && this.input) {
				this.editorMemento.saveEditorState(this.group, this.input, { searchQuery, target });
			}
		} else if (this.group && this.input) {
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
		container: HTMLElement,
		@ICommandService private readonly commandService: ICommandService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService
	) {
		super();

		const headerRightControlsContainer = DOM.append(container, $('.settings-right-controls'));
		const turnOnSyncButtonContainer = DOM.append(headerRightControlsContainer, $('.turn-on-sync'));
		this.turnOnSyncButton = this._register(new Button(turnOnSyncButtonContainer, { title: true, ...defaultButtonStyles }));
		this.lastSyncedLabel = DOM.append(headerRightControlsContainer, $('.last-synced-label'));
		DOM.hide(this.lastSyncedLabel);

		this.turnOnSyncButton.enabled = true;
		this.turnOnSyncButton.label = localize('turnOnSyncButton', "Turn on Settings Sync");
		DOM.hide(this.turnOnSyncButton.element);

		this._register(this.turnOnSyncButton.onDidClick(async () => {
			await this.commandService.executeCommand('workbench.userDataSync.actions.turnOn');
		}));

		this.updateLastSyncedTime();
		this._register(this.userDataSyncService.onDidChangeLastSyncTime(() => {
			this.updateLastSyncedTime();
		}));

		const updateLastSyncedTimer = this._register(new IntervalTimer());
		updateLastSyncedTimer.cancelAndSet(() => this.updateLastSyncedTime(), 60 * 1000);

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
