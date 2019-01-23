/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { ITreeElement } from 'vs/base/browser/ui/tree/tree';
import * as arrays from 'vs/base/common/arrays';
import { Delayer, ThrottledDelayer } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import * as collections from 'vs/base/common/collections';
import { getErrorMessage, isPromiseCanceledError } from 'vs/base/common/errors';
import { Iterator } from 'vs/base/common/iterator';
import { isArray } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/settingsEditor2';
import { localize } from 'vs/nls';
import { ConfigurationTarget, ConfigurationTargetToString, IConfigurationOverrides, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { badgeBackground, badgeForeground, contrastBorder, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditor, IEditorMemento } from 'vs/workbench/common/editor';
import { attachSuggestEnabledInputBoxStyler, SuggestEnabledInput } from 'vs/workbench/parts/codeEditor/electron-browser/suggestEnabledInput';
import { SettingsTarget, SettingsTargetsWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { commonlyUsedData, tocData } from 'vs/workbench/parts/preferences/browser/settingsLayout';
import { AbstractSettingRenderer, ISettingLinkClickEvent, ISettingOverrideClickEvent, resolveExtensionsSettings, resolveSettingsTree, SettingsTree, SettingTreeRenderers } from 'vs/workbench/parts/preferences/browser/settingsTree';
import { ISettingsEditorViewState, parseQuery, SearchResultIdx, SearchResultModel, SettingsTreeGroupChild, SettingsTreeGroupElement, SettingsTreeModel } from 'vs/workbench/parts/preferences/browser/settingsTreeModels';
import { settingsTextInputBorder } from 'vs/workbench/parts/preferences/browser/settingsWidgets';
import { createTOCIterator, TOCTree, TOCTreeModel } from 'vs/workbench/parts/preferences/browser/tocTree';
import { CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_SEARCH_FOCUS, CONTEXT_TOC_ROW_FOCUS, IPreferencesSearchService, ISearchProvider, MODIFIED_SETTING_TAG, SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU } from 'vs/workbench/parts/preferences/common/preferences';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { IPreferencesService, ISearchResult, ISettingsEditorModel, ISettingsEditorOptions, SettingsEditorOptions, SettingValueType } from 'vs/workbench/services/preferences/common/preferences';
import { SettingsEditor2Input } from 'vs/workbench/services/preferences/common/preferencesEditorInput';
import { Settings2EditorModel } from 'vs/workbench/services/preferences/common/preferencesModels';

function createGroupIterator(group: SettingsTreeGroupElement): Iterator<ITreeElement<SettingsTreeGroupChild>> {
	const groupsIt = Iterator.fromArray(group.children);

	return Iterator.map(groupsIt, g => {
		return {
			element: g,
			children: g instanceof SettingsTreeGroupElement ?
				createGroupIterator(g) :
				undefined
		};
	});
}

const $ = DOM.$;

const SETTINGS_EDITOR_STATE_KEY = 'settingsEditorState';
export class SettingsEditor2 extends BaseEditor {

	static readonly ID: string = 'workbench.editor.settings2';
	private static NUM_INSTANCES: number = 0;
	private static SETTING_UPDATE_FAST_DEBOUNCE: number = 200;
	private static SETTING_UPDATE_SLOW_DEBOUNCE: number = 1000;

	private static readonly SUGGESTIONS: string[] = [
		`@${MODIFIED_SETTING_TAG}`, '@tag:usesOnlineServices'
	];

	private static shouldSettingUpdateFast(type: SettingValueType | SettingValueType[]): boolean {
		if (isArray(type)) {
			// nullable integer/number or complex
			return false;
		}
		return type === SettingValueType.Enum ||
			type === SettingValueType.Complex ||
			type === SettingValueType.Boolean ||
			type === SettingValueType.Exclude;
	}

	private defaultSettingsEditorModel: Settings2EditorModel;

	private rootElement: HTMLElement;
	private headerContainer: HTMLElement;
	private searchWidget: SuggestEnabledInput;
	private countElement: HTMLElement;
	private settingsTargetsWidget: SettingsTargetsWidget;

	private settingsTreeContainer: HTMLElement;
	private settingsTree: SettingsTree;
	private settingRenderers: SettingTreeRenderers;
	private tocTreeModel: TOCTreeModel;
	private settingsTreeModel: SettingsTreeModel;
	private noResultsMessage: HTMLElement;
	private clearFilterLinkContainer: HTMLElement;

	private tocTreeContainer: HTMLElement;
	private tocTree: TOCTree;

	private settingsAriaExtraLabelsContainer: HTMLElement;

	private delayedFilterLogging: Delayer<void>;
	private localSearchDelayer: Delayer<void>;
	private remoteSearchThrottle: ThrottledDelayer<void>;
	private searchInProgress: CancellationTokenSource;

	private settingFastUpdateDelayer: Delayer<void>;
	private settingSlowUpdateDelayer: Delayer<void>;
	private pendingSettingUpdate: { key: string, value: any };

	private readonly viewState: ISettingsEditorViewState;
	private _searchResultModel: SearchResultModel;

	private tocRowFocused: IContextKey<boolean>;
	private inSettingsEditorContextKey: IContextKey<boolean>;
	private searchFocusContextKey: IContextKey<boolean>;

	private scheduledRefreshes: Map<string, DOM.IFocusTracker>;
	private lastFocusedSettingElement: string;

	/** Don't spam warnings */
	private hasWarnedMissingSettings: boolean;

	private editorMemento: IEditorMemento<ISettingsEditor2State>;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService themeService: IThemeService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPreferencesSearchService private readonly preferencesSearchService: IPreferencesSearchService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEditorGroupsService protected editorGroupService: IEditorGroupsService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super(SettingsEditor2.ID, telemetryService, themeService, storageService);
		this.delayedFilterLogging = new Delayer<void>(1000);
		this.localSearchDelayer = new Delayer(300);
		this.remoteSearchThrottle = new ThrottledDelayer(200);
		this.viewState = { settingsTarget: ConfigurationTarget.USER };

		this.settingFastUpdateDelayer = new Delayer<void>(SettingsEditor2.SETTING_UPDATE_FAST_DEBOUNCE);
		this.settingSlowUpdateDelayer = new Delayer<void>(SettingsEditor2.SETTING_UPDATE_SLOW_DEBOUNCE);

		this.inSettingsEditorContextKey = CONTEXT_SETTINGS_EDITOR.bindTo(contextKeyService);
		this.searchFocusContextKey = CONTEXT_SETTINGS_SEARCH_FOCUS.bindTo(contextKeyService);
		this.tocRowFocused = CONTEXT_TOC_ROW_FOCUS.bindTo(contextKeyService);

		this.scheduledRefreshes = new Map<string, DOM.IFocusTracker>();

		this.editorMemento = this.getEditorMemento<ISettingsEditor2State>(editorGroupService, SETTINGS_EDITOR_STATE_KEY);

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.source !== ConfigurationTarget.DEFAULT) {
				this.onConfigUpdate(e.affectedKeys);
			}
		}));
	}

	get minimumWidth(): number { return 375; }
	get maximumWidth(): number { return Number.POSITIVE_INFINITY; }

	// these setters need to exist because this extends from BaseEditor
	set minimumWidth(value: number) { /*noop*/ }
	set maximumWidth(value: number) { /*noop*/ }

	private get currentSettingsModel() {
		return this.searchResultModel || this.settingsTreeModel;
	}

	private get searchResultModel(): SearchResultModel {
		return this._searchResultModel;
	}

	private set searchResultModel(value: SearchResultModel) {
		this._searchResultModel = value;

		DOM.toggleClass(this.rootElement, 'search-mode', !!this._searchResultModel);
	}

	private get currentSettingsContextMenuKeyBindingLabel() {
		return this.keybindingService.lookupKeybinding(SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU).getAriaLabel();
	}

	createEditor(parent: HTMLElement): void {
		parent.setAttribute('tabindex', '-1');
		this.rootElement = DOM.append(parent, $('.settings-editor'));

		this.createHeader(this.rootElement);
		this.createBody(this.rootElement);
		this.updateStyles();
	}

	setInput(input: SettingsEditor2Input, options: SettingsEditorOptions, token: CancellationToken): Promise<void> {
		this.inSettingsEditorContextKey.set(true);
		return super.setInput(input, options, token)
			.then(() => new Promise(process.nextTick)) // Force setInput to be async
			.then(() => {
				if (!options) {
					if (!this.viewState.settingsTarget) {
						// Persist?
						options = SettingsEditorOptions.create({ target: ConfigurationTarget.USER });
					}
				} else if (!options.target) {
					options.target = ConfigurationTarget.USER;
				}
				this._setOptions(options);

				this._register(input.onDispose(() => {
					this.searchWidget.setValue('');
				}));

				return this.render(token);
			})
			.then(() => {
				// Init TOC selection
				this.updateTreeScrollSync();

				this.restoreCachedState();
			});
	}

	private restoreCachedState(): void {
		const cachedState = this.editorMemento.loadEditorState(this.group, this.input);
		if (cachedState && typeof cachedState.target === 'object') {
			cachedState.target = URI.revive(cachedState.target);
		}

		if (cachedState) {
			const settingsTarget = cachedState.target;
			this.settingsTargetsWidget.settingsTarget = settingsTarget;
			this.onDidSettingsTargetChange(settingsTarget);
			this.searchWidget.setValue(cachedState.searchQuery);
		}
	}

	setOptions(options: SettingsEditorOptions): void {
		super.setOptions(options);

		this._setOptions(options);
	}

	private _setOptions(options: SettingsEditorOptions): void {
		if (!options) {
			return;
		}

		if (options.query) {
			this.searchWidget.setValue(options.query);
		}

		const target: SettingsTarget = options.folderUri || <SettingsTarget>options.target;
		this.settingsTargetsWidget.settingsTarget = target;
		this.viewState.settingsTarget = target;
	}

	clearInput(): void {
		this.inSettingsEditorContextKey.set(false);
		this.editorMemento.clearEditorState(this.input, this.group);
		super.clearInput();
	}

	layout(dimension: DOM.Dimension): void {
		// const firstEl = this.settingsTree.getFirstVisibleElement();
		// const firstElTop = this.settingsTree.getRelativeTop(firstEl);

		this.layoutTrees(dimension);

		const innerWidth = dimension.width - 24 * 2; // 24px padding on left and right
		const monacoWidth = (innerWidth > 1000 ? 1000 : innerWidth) - 10;
		this.searchWidget.layout({ height: 20, width: monacoWidth });

		DOM.toggleClass(this.rootElement, 'mid-width', dimension.width < 1000 && dimension.width >= 600);
		DOM.toggleClass(this.rootElement, 'narrow-width', dimension.width < 600);
	}

	focus(): void {
		if (this.lastFocusedSettingElement) {
			const elements = this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), this.lastFocusedSettingElement);
			if (elements.length) {
				const control = elements[0].querySelector(AbstractSettingRenderer.CONTROL_SELECTOR);
				if (control) {
					(<HTMLElement>control).focus();
					return;
				}
			}
		}

		this.focusSearch();
	}

	focusSettings(): void {
		// Update ARIA global labels
		const labelElement = this.settingsAriaExtraLabelsContainer.querySelector('#settings_aria_more_actions_shortcut_label');
		if (labelElement) {
			const settingsContextMenuShortcut = this.currentSettingsContextMenuKeyBindingLabel;
			if (settingsContextMenuShortcut) {
				labelElement.setAttribute('aria-label', localize('settingsContextMenuAriaShortcut', "For more actions, Press {0}.", settingsContextMenuShortcut));
			}
		}

		const firstFocusable = this.settingsTree.getHTMLElement().querySelector(AbstractSettingRenderer.CONTROL_SELECTOR);
		if (firstFocusable) {
			(<HTMLElement>firstFocusable).focus();
		}
	}

	showContextMenu(): void {
		const settingDOMElement = this.settingRenderers.getSettingDOMElementForDOMElement(this.getActiveElementInSettingsTree());
		if (!settingDOMElement) {
			return;
		}

		const focusedKey = this.settingRenderers.getKeyForDOMElementInSetting(settingDOMElement);
		if (!focusedKey) {
			return;
		}

		const elements = this.currentSettingsModel.getElementsByName(focusedKey);
		if (elements && elements[0]) {
			this.settingRenderers.showContextMenu(elements[0], settingDOMElement);
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
	}

	clearSearchFilters(): void {
		let query = this.searchWidget.getValue();

		SettingsEditor2.SUGGESTIONS.forEach(suggestion => {
			query = query.replace(suggestion, '');
		});

		this.searchWidget.setValue(query.trim());
	}

	private createHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.settings-header'));

		const searchContainer = DOM.append(this.headerContainer, $('.search-container'));

		const searchBoxLabel = localize('SearchSettings.AriaLabel', "Search settings");
		this.searchWidget = this._register(this.instantiationService.createInstance(SuggestEnabledInput, `${SettingsEditor2.ID}.searchbox`, searchContainer, {
			triggerCharacters: ['@'],
			provideResults: (query: string) => {
				return SettingsEditor2.SUGGESTIONS.filter(tag => query.indexOf(tag) === -1).map(tag => tag + ' ');
			}
		}, searchBoxLabel, 'settingseditor:searchinput' + SettingsEditor2.NUM_INSTANCES++, {
				placeholderText: searchBoxLabel,
				focusContextKey: this.searchFocusContextKey,
				// TODO: Aria-live
			})
		);

		this._register(attachSuggestEnabledInputBoxStyler(this.searchWidget, this.themeService, {
			inputBorder: settingsTextInputBorder
		}));

		this.countElement = DOM.append(searchContainer, DOM.$('.settings-count-widget'));
		this._register(attachStylerCallback(this.themeService, { badgeBackground, contrastBorder, badgeForeground }, colors => {
			const background = colors.badgeBackground ? colors.badgeBackground.toString() : null;
			const border = colors.contrastBorder ? colors.contrastBorder.toString() : null;

			this.countElement.style.backgroundColor = background;
			this.countElement.style.color = colors.badgeForeground.toString();

			this.countElement.style.borderWidth = border ? '1px' : null;
			this.countElement.style.borderStyle = border ? 'solid' : null;
			this.countElement.style.borderColor = border;
		}));

		this._register(this.searchWidget.onInputDidChange(() => this.onSearchInputChanged()));

		const headerControlsContainer = DOM.append(this.headerContainer, $('.settings-header-controls'));
		const targetWidgetContainer = DOM.append(headerControlsContainer, $('.settings-target-container'));
		this.settingsTargetsWidget = this._register(this.instantiationService.createInstance(SettingsTargetsWidget, targetWidgetContainer));
		this.settingsTargetsWidget.settingsTarget = ConfigurationTarget.USER;
		this.settingsTargetsWidget.onDidTargetChange(target => this.onDidSettingsTargetChange(target));
	}

	private onDidSettingsTargetChange(target: SettingsTarget): void {
		this.viewState.settingsTarget = target;

		// TODO Instead of rebuilding the whole model, refresh and uncache the inspected setting value
		this.onConfigUpdate(undefined, true);
	}

	private onDidClickSetting(evt: ISettingLinkClickEvent, recursed?: boolean): void {
		const elements = this.currentSettingsModel.getElementsByName(evt.targetKey);
		if (elements && elements[0]) {
			let sourceTop = this.settingsTree.getRelativeTop(evt.source);
			if (sourceTop < 0) {
				// e.g. clicked a searched element, now the search has been cleared
				sourceTop = 0.5;
			}

			this.settingsTree.reveal(elements[0], sourceTop);

			const domElements = this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), evt.targetKey);
			if (domElements && domElements[0]) {
				const control = domElements[0].querySelector(AbstractSettingRenderer.CONTROL_SELECTOR);
				if (control) {
					(<HTMLElement>control).focus();
				}
			}
		} else if (!recursed) {
			const p = this.triggerSearch('');
			p.then(() => {
				this.searchWidget.setValue('');
				this.onDidClickSetting(evt, true);
			});
		}
	}

	switchToSettingsFile(): Promise<IEditor> {
		const query = parseQuery(this.searchWidget.getValue());
		return this.openSettingsFile(query.query);
	}

	private openSettingsFile(query?: string): Promise<IEditor> {
		const currentSettingsTarget = this.settingsTargetsWidget.settingsTarget;

		const options: ISettingsEditorOptions = { query };
		if (currentSettingsTarget === ConfigurationTarget.USER) {
			return this.preferencesService.openGlobalSettings(true, options);
		} else if (currentSettingsTarget === ConfigurationTarget.WORKSPACE) {
			return this.preferencesService.openWorkspaceSettings(true, options);
		} else {
			return this.preferencesService.openFolderSettings(currentSettingsTarget, true, options);
		}
	}

	private createBody(parent: HTMLElement): void {
		const bodyContainer = DOM.append(parent, $('.settings-body'));

		this.noResultsMessage = DOM.append(bodyContainer, $('.no-results'));

		this.noResultsMessage.innerText = localize('noResults', "No Settings Found");

		this.clearFilterLinkContainer = $('span.clear-search-filters');

		this.clearFilterLinkContainer.textContent = ' - ';
		const clearFilterLink = DOM.append(this.clearFilterLinkContainer, $('a.pointer.prominent', { tabindex: 0 }, localize('clearSearchFilters', 'Clear Filters')));
		this._register(DOM.addDisposableListener(clearFilterLink, DOM.EventType.CLICK, (e: MouseEvent) => {
			DOM.EventHelper.stop(e, false);
			this.clearSearchFilters();
		}));

		DOM.append(this.noResultsMessage, this.clearFilterLinkContainer);

		const clearSearchContainer = $('span.clear-search');
		clearSearchContainer.textContent = ' - ';

		const clearSearch = DOM.append(clearSearchContainer, $('a.pointer.prominent', { tabindex: 0 }, localize('clearSearch', 'Clear Search')));
		this._register(DOM.addDisposableListener(clearSearch, DOM.EventType.CLICK, (e: MouseEvent) => {
			DOM.EventHelper.stop(e, false);
			this.clearSearchResults();
			this.focusSearch();
		}));

		DOM.append(this.noResultsMessage, clearSearchContainer);

		this._register(attachStylerCallback(this.themeService, { editorForeground }, colors => {
			this.noResultsMessage.style.color = colors.editorForeground ? colors.editorForeground.toString() : null;
		}));

		this.createTOC(bodyContainer);

		// this.createFocusSink(
		// 	bodyContainer,
		// 	e => {
		// 		if (DOM.findParentWithClass(e.relatedTarget, 'settings-editor-tree')) {
		// 			if (this.settingsTree.getScrollPosition() > 0) {
		// 				const firstElement = this.settingsTree.getFirstVisibleElement();
		// 				this.settingsTree.reveal(firstElement, 0.1);
		// 				return true;
		// 			}
		// 		} else {
		// 			const firstControl = this.settingsTree.getHTMLElement().querySelector(SettingsRenderer.CONTROL_SELECTOR);
		// 			if (firstControl) {
		// 				(<HTMLElement>firstControl).focus();
		// 			}
		// 		}

		// 		return false;
		// 	},
		// 	'settings list focus helper');

		this.createSettingsTree(bodyContainer);

		// this.createFocusSink(
		// 	bodyContainer,
		// 	e => {
		// 		if (DOM.findParentWithClass(e.relatedTarget, 'settings-editor-tree')) {
		// 			if (this.settingsTree.getScrollPosition() < 1) {
		// 				const lastElement = this.settingsTree.getLastVisibleElement();
		// 				this.settingsTree.reveal(lastElement, 0.9);
		// 				return true;
		// 			}
		// 		}

		// 		return false;
		// 	},
		// 	'settings list focus helper'
		// );
	}

	// private createFocusSink(container: HTMLElement, callback: (e: any) => boolean, label: string): HTMLElement {
	// 	const listFocusSink = DOM.append(container, $('.settings-tree-focus-sink'));
	// 	listFocusSink.setAttribute('aria-label', label);
	// 	listFocusSink.tabIndex = 0;
	// 	this._register(DOM.addDisposableListener(listFocusSink, 'focus', (e: any) => {
	// 		if (e.relatedTarget && callback(e)) {
	// 			e.relatedTarget.focus();
	// 		}
	// 	}));

	// 	return listFocusSink;
	// }

	private createTOC(parent: HTMLElement): void {
		this.tocTreeModel = new TOCTreeModel(this.viewState);
		this.tocTreeContainer = DOM.append(parent, $('.settings-toc-container'));

		this.tocTree = this._register(this.instantiationService.createInstance(TOCTree,
			DOM.append(this.tocTreeContainer, $('.settings-toc-wrapper')),
			this.viewState));

		this._register(this.tocTree.onDidChangeFocus(e => {
			this.tocTree.setSelection(e.elements);
			const element: SettingsTreeGroupElement = e.elements[0];
			if (this.searchResultModel) {
				if (this.viewState.filterToCategory !== element) {
					this.viewState.filterToCategory = element;
					this.renderTree();
					this.settingsTree.scrollTop = 0;
				}
			} else if (element) {
				this.settingsTree.reveal(element, 0);
			}

			// else if (element && (!e.payload || !e.payload.fromScroll)) {
			// this.settingsTree.reveal(element, 0);
			// }
		}));

		this._register(this.tocTree.onDidFocus(() => {
			this.tocRowFocused.set(true);
		}));

		this._register(this.tocTree.onDidBlur(() => {
			this.tocRowFocused.set(false);
		}));
	}

	private createSettingsTree(parent: HTMLElement): void {
		this.settingsTreeContainer = DOM.append(parent, $('.settings-tree-container'));

		// Add  ARIA extra labels div
		this.settingsAriaExtraLabelsContainer = DOM.append(this.settingsTreeContainer, $('.settings-aria-extra-labels'));
		this.settingsAriaExtraLabelsContainer.id = 'settings_aria_extra_labels';
		// Add global labels here
		const labelDiv = DOM.append(this.settingsAriaExtraLabelsContainer, $('.settings-aria-extra-label'));
		labelDiv.id = 'settings_aria_more_actions_shortcut_label';
		labelDiv.setAttribute('aria-label', '');

		this.settingRenderers = this.instantiationService.createInstance(SettingTreeRenderers);
		this._register(this.settingRenderers.onDidChangeSetting(e => this.onDidChangeSetting(e.key, e.value, e.type)));
		this._register(this.settingRenderers.onDidOpenSettings(settingKey => {
			this.openSettingsFile(settingKey);
		}));
		this._register(this.settingRenderers.onDidClickSettingLink(settingName => this.onDidClickSetting(settingName)));
		this._register(this.settingRenderers.onDidFocusSetting(element => {
			this.lastFocusedSettingElement = element.setting.key;
			this.settingsTree.reveal(element);
		}));
		this._register(this.settingRenderers.onDidClickOverrideElement((element: ISettingOverrideClickEvent) => {
			if (ConfigurationTargetToString(ConfigurationTarget.WORKSPACE) === element.scope.toUpperCase()) {
				this.settingsTargetsWidget.updateTarget(ConfigurationTarget.WORKSPACE);
			} else if (ConfigurationTargetToString(ConfigurationTarget.USER) === element.scope.toUpperCase()) {
				this.settingsTargetsWidget.updateTarget(ConfigurationTarget.USER);
			}

			this.searchWidget.setValue(element.targetKey);
		}));

		this.settingsTree = this._register(this.instantiationService.createInstance(SettingsTree,
			this.settingsTreeContainer,
			this.viewState,
			this.settingRenderers.allRenderers));
		this.settingsTree.getHTMLElement().attributes.removeNamedItem('tabindex');

		// Have to redefine role of the tree widget to form for input elements
		// TODO:CDL make this an option for tree
		this.settingsTree.getHTMLElement().setAttribute('role', 'form');

		// this._register(this.settingsTree.onDidScroll(() => {
		// 	this.updateTreeScrollSync();
		// }));
	}

	private notifyNoSaveNeeded() {
		if (!this.storageService.getBoolean('hasNotifiedOfSettingsAutosave', StorageScope.GLOBAL, false)) {
			this.storageService.store('hasNotifiedOfSettingsAutosave', true, StorageScope.GLOBAL);
			this.notificationService.info(localize('settingsNoSaveNeeded', "Your changes are automatically saved as you edit."));
		}
	}

	private onDidChangeSetting(key: string, value: any, type: SettingValueType | SettingValueType[]): void {
		this.notifyNoSaveNeeded();

		if (this.pendingSettingUpdate && this.pendingSettingUpdate.key !== key) {
			this.updateChangedSetting(key, value);
		}

		this.pendingSettingUpdate = { key, value };
		if (SettingsEditor2.shouldSettingUpdateFast(type)) {
			this.settingFastUpdateDelayer.trigger(() => this.updateChangedSetting(key, value));
		} else {
			this.settingSlowUpdateDelayer.trigger(() => this.updateChangedSetting(key, value));
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

		// this.updateTreePagingByScroll();

		const element = this.tocTreeModel.children[0];
		// const elementToSync = this.settingsTree.getFirstVisibleElement();
		// const element = elementToSync instanceof SettingsTreeSettingElement ? elementToSync.parent :
		// 	elementToSync instanceof SettingsTreeGroupElement ? elementToSync :
		// 		null;

		if (element && this.tocTree.getSelection()[0] !== element) {
			// 	this.tocTree.reveal(element);
			// 	const elementTop = this.tocTree.getRelativeTop(element);
			// 	collapseAll(this.tocTree, element);
			// 	if (elementTop < 0 || elementTop > 1) {
			// 		this.tocTree.reveal(element);
			// 	} else {
			// 		this.tocTree.reveal(element, elementTop);
			// 	}

			// 	this.tocTree.expand(element);

			// this.tocTree.setSelection([element]);
			// this.tocTree.setFocus(element, { fromScroll: true });
		}
	}

	// private updateTreePagingByScroll(): void {
	// 	const lastVisibleElement = this.settingsTree.getLastVisibleElement();
	// 	if (lastVisibleElement && this.settingsTreeDataSource.pageTo(lastVisibleElement.index)) {
	// 		this.renderTree();
	// 	}
	// }

	private updateChangedSetting(key: string, value: any): Promise<void> {
		// ConfigurationService displays the error if this fails.
		// Force a render afterwards because onDidConfigurationUpdate doesn't fire if the update doesn't result in an effective setting value change
		const settingsTarget = this.settingsTargetsWidget.settingsTarget;
		const resource = URI.isUri(settingsTarget) ? settingsTarget : undefined;
		const configurationTarget = <ConfigurationTarget>(resource ? ConfigurationTarget.WORKSPACE_FOLDER : settingsTarget);
		const overrides: IConfigurationOverrides = { resource };

		const isManualReset = value === undefined;

		// If the user is changing the value back to the default, do a 'reset' instead
		const inspected = this.configurationService.inspect(key, overrides);
		if (inspected.default === value) {
			value = undefined;
		}

		return this.configurationService.updateValue(key, value, overrides, configurationTarget)
			.then(() => this.renderTree(key, isManualReset))
			.then(() => {
				const reportModifiedProps = {
					key,
					query: this.searchWidget.getValue(),
					searchResults: this.searchResultModel && this.searchResultModel.getUniqueResults(),
					rawResults: this.searchResultModel && this.searchResultModel.getRawResults(),
					showConfiguredOnly: this.viewState.tagFilters && this.viewState.tagFilters.has(MODIFIED_SETTING_TAG),
					isReset: typeof value === 'undefined',
					settingsTarget: this.settingsTargetsWidget.settingsTarget as SettingsTarget
				};

				return this.reportModifiedSetting(reportModifiedProps);
			});
	}

	private reportModifiedSetting(props: { key: string, query: string, searchResults: ISearchResult[], rawResults: ISearchResult[], showConfiguredOnly: boolean, isReset: boolean, settingsTarget: SettingsTarget }): void {
		this.pendingSettingUpdate = null;

		const remoteResult = props.searchResults && props.searchResults[SearchResultIdx.Remote];
		const localResult = props.searchResults && props.searchResults[SearchResultIdx.Local];

		let groupId = undefined;
		let nlpIndex = undefined;
		let displayIndex = undefined;
		if (props.searchResults) {
			const localIndex = arrays.firstIndex(localResult.filterMatches, m => m.setting.key === props.key);
			groupId = localIndex >= 0 ?
				'local' :
				'remote';

			displayIndex = localIndex >= 0 ?
				localIndex :
				remoteResult && (arrays.firstIndex(remoteResult.filterMatches, m => m.setting.key === props.key) + localResult.filterMatches.length);

			if (this.searchResultModel) {
				const rawResults = this.searchResultModel.getRawResults();
				if (rawResults[SearchResultIdx.Remote]) {
					const _nlpIndex = arrays.firstIndex(rawResults[SearchResultIdx.Remote].filterMatches, m => m.setting.key === props.key);
					nlpIndex = _nlpIndex >= 0 ? _nlpIndex : undefined;
				}
			}
		}

		const reportedTarget = props.settingsTarget === ConfigurationTarget.USER ? 'user' :
			props.settingsTarget === ConfigurationTarget.WORKSPACE ? 'workspace' :
				'folder';

		const data = {
			key: props.key,
			query: props.query,
			groupId,
			nlpIndex,
			displayIndex,
			showConfiguredOnly: props.showConfiguredOnly,
			isReset: props.isReset,
			target: reportedTarget
		};

		/* __GDPR__
			"settingsEditor.settingModified" : {
				"key" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"query" : { "classification": "CustomerContent", "purpose": "FeatureInsight" },
				"groupId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"nlpIndex" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"displayIndex" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"showConfiguredOnly" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"isReset" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"target" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog('settingsEditor.settingModified', data);
	}

	private render(token: CancellationToken): Promise<any> {
		if (this.input) {
			return this.input.resolve()
				.then((model: Settings2EditorModel) => {
					if (token.isCancellationRequested) {
						return undefined;
					}

					this._register(model.onDidChangeGroups(() => this.onConfigUpdate()));
					this.defaultSettingsEditorModel = model;
					return this.onConfigUpdate();
				});
		}
		return Promise.resolve(null);
	}

	private onSearchModeToggled(): void {
		DOM.removeClass(this.rootElement, 'no-toc-search');
		if (this.configurationService.getValue('workbench.settings.settingsSearchTocBehavior') === 'hide') {
			DOM.toggleClass(this.rootElement, 'no-toc-search', !!this.searchResultModel);
		}
	}

	private scheduleRefresh(element: HTMLElement, key = ''): void {
		if (key && this.scheduledRefreshes.has(key)) {
			return;
		}

		if (!key) {
			this.scheduledRefreshes.forEach(r => r.dispose());
			this.scheduledRefreshes.clear();
		}

		const scheduledRefreshTracker = DOM.trackFocus(element);
		this.scheduledRefreshes.set(key, scheduledRefreshTracker);
		scheduledRefreshTracker.onDidBlur(() => {
			scheduledRefreshTracker.dispose();
			this.scheduledRefreshes.delete(key);
			this.onConfigUpdate([key]);
		});
	}

	private onConfigUpdate(keys?: string[], forceRefresh = false): Promise<void> {
		if (keys && this.settingsTreeModel) {
			return this.updateElementsByKey(keys);
		}

		const groups = this.defaultSettingsEditorModel.settingsGroups.slice(1); // Without commonlyUsed
		const dividedGroups = collections.groupBy(groups, g => g.contributedByExtension ? 'extension' : 'core');
		const settingsResult = resolveSettingsTree(tocData, dividedGroups.core);
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

		const commonlyUsed = resolveSettingsTree(commonlyUsedData, dividedGroups.core);
		resolvedSettingsRoot.children.unshift(commonlyUsed.tree);

		resolvedSettingsRoot.children.push(resolveExtensionsSettings(dividedGroups.extension || []));

		if (this.searchResultModel) {
			this.searchResultModel.updateChildren();
		}

		if (this.settingsTreeModel) {
			this.settingsTreeModel.update(resolvedSettingsRoot);

			// Make sure that all extensions' settings are included in search results
			const cachedState = this.editorMemento.loadEditorState(this.group, this.input);
			if (cachedState && cachedState.searchQuery) {
				this.triggerSearch(cachedState.searchQuery);
			} else {
				return this.renderTree(undefined, forceRefresh);
			}
		} else {
			this.settingsTreeModel = this.instantiationService.createInstance(SettingsTreeModel, this.viewState);
			this.settingsTreeModel.update(resolvedSettingsRoot);
			this.refreshTree();

			this.tocTreeModel.settingsTreeRoot = this.settingsTreeModel.root as SettingsTreeGroupElement;
			this.refreshTOCTree();
			this.tocTree.collapseAll();
		}

		return Promise.resolve(undefined);
	}

	private updateElementsByKey(keys: string[]): Promise<void> {
		if (keys.length) {
			if (this.searchResultModel) {
				keys.forEach(key => this.searchResultModel.updateElementsByName(key));
			}

			if (this.settingsTreeModel) {
				keys.forEach(key => this.settingsTreeModel.updateElementsByName(key));
			}

			return Promise.all(
				keys.map(key => this.renderTree(key)))
				.then(() => { });
		} else {
			return this.renderTree();
		}
	}

	private getActiveElementInSettingsTree(): HTMLElement | null {
		return (document.activeElement && DOM.isAncestor(document.activeElement, this.settingsTree.getHTMLElement())) ?
			<HTMLElement>document.activeElement :
			null;
	}

	private renderTree(key?: string, force = false): Promise<void> {
		if (!force && key && this.scheduledRefreshes.has(key)) {
			this.updateModifiedLabelForKey(key);
			return Promise.resolve(undefined);
		}

		// If a setting control is currently focused, schedule a refresh for later
		const focusedSetting = this.settingRenderers.getSettingDOMElementForDOMElement(this.getActiveElementInSettingsTree());
		if (focusedSetting && !force) {
			// If a single setting is being refreshed, it's ok to refresh now if that is not the focused setting
			if (key) {
				const focusedKey = focusedSetting.getAttribute(AbstractSettingRenderer.SETTING_KEY_ATTR);
				if (focusedKey === key &&
					!DOM.hasClass(focusedSetting, 'setting-item-exclude')) { // update `exclude`s live, as they have a separate "submit edit" step built in before this

					this.updateModifiedLabelForKey(key);
					this.scheduleRefresh(focusedSetting, key);
					return Promise.resolve(null);
				}
			} else {
				this.scheduleRefresh(focusedSetting);
				return Promise.resolve(null);
			}
		}

		if (key) {
			const elements = this.currentSettingsModel.getElementsByName(key);
			if (elements && elements.length) {
				// TODO https://github.com/Microsoft/vscode/issues/57360
				this.refreshTree();
			} else {
				// Refresh requested for a key that we don't know about
				return Promise.resolve(null);
			}
		} else {
			this.refreshTree();
		}

		this.tocTreeModel.update();
		this.refreshTOCTree();
		return Promise.resolve(undefined);
	}

	private refreshTree(): void {
		this.settingsTree.setChildren(null, createGroupIterator(this.currentSettingsModel.root));
	}

	private refreshTOCTree(): void {
		this.tocTree.setChildren(null, createTOCIterator(this.tocTreeModel));
	}

	private updateModifiedLabelForKey(key: string): void {
		const dataElements = this.currentSettingsModel.getElementsByName(key);
		const isModified = dataElements && dataElements[0] && dataElements[0].isConfigured; // all elements are either configured or not
		const elements = this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), key);
		if (elements && elements[0]) {
			DOM.toggleClass(elements[0], 'is-configured', isModified);
		}
	}

	private onSearchInputChanged(): void {
		const query = this.searchWidget.getValue().trim();
		this.delayedFilterLogging.cancel();
		this.triggerSearch(query.replace(/›/g, ' ')).then(() => {
			if (query && this.searchResultModel) {
				this.delayedFilterLogging.trigger(() => this.reportFilteringUsed(query, this.searchResultModel.getUniqueResults()));
			}
		});
	}

	private parseSettingFromJSON(query: string): string {
		const match = query.match(/"([a-zA-Z.]+)": /);
		return match && match[1];
	}

	private triggerSearch(query: string): Promise<void> {
		this.viewState.tagFilters = new Set<string>();
		if (query) {
			const parsedQuery = parseQuery(query);
			query = parsedQuery.query;
			parsedQuery.tags.forEach(tag => this.viewState.tagFilters.add(tag));
		}

		if (query && query !== '@') {
			query = this.parseSettingFromJSON(query) || query;
			return this.triggerFilterPreferences(query);
		} else {
			if (this.viewState.tagFilters && this.viewState.tagFilters.size) {
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

			this.viewState.filterToCategory = null;
			this.tocTreeModel.currentSearchModel = this.searchResultModel;
			this.refreshTOCTree();
			this.onSearchModeToggled();

			if (this.searchResultModel) {
				// Added a filter model
				this.tocTree.setSelection([]);
				this.tocTree.expandAll();
				this.refreshTree();
				this.renderResultCountMessages();
			} else {
				// Leaving search mode
				this.tocTree.collapseAll();
				this.refreshTree();
				this.renderResultCountMessages();
			}
		}

		return Promise.resolve(null);
	}

	/**
	 * Return a fake SearchResultModel which can hold a flat list of all settings, to be filtered (@modified etc)
	 */
	private createFilterModel(): SearchResultModel {
		const filterModel = this.instantiationService.createInstance(SearchResultModel, this.viewState);

		const fullResult: ISearchResult = {
			filterMatches: []
		};
		for (const g of this.defaultSettingsEditorModel.settingsGroups.slice(1)) {
			for (const sect of g.sections) {
				for (const setting of sect.settings) {
					fullResult.filterMatches.push({ setting, matches: [], score: 0 });
				}
			}
		}

		filterModel.setResult(0, fullResult);

		return filterModel;
	}

	private reportFilteringUsed(query: string, results: ISearchResult[]): void {
		const nlpResult = results[SearchResultIdx.Remote];
		const nlpMetadata = nlpResult && nlpResult.metadata;

		const durations = {};
		durations['nlpResult'] = nlpMetadata && nlpMetadata.duration;

		// Count unique results
		const counts = {};
		const filterResult = results[SearchResultIdx.Local];
		if (filterResult) {
			counts['filterResult'] = filterResult.filterMatches.length;
		}

		if (nlpResult) {
			counts['nlpResult'] = nlpResult.filterMatches.length;
		}

		const requestCount = nlpMetadata && nlpMetadata.requestCount;

		const data = {
			query,
			durations,
			counts,
			requestCount
		};

		/* __GDPR__
			"settingsEditor.filter" : {
				"query": { "classification": "CustomerContent", "purpose": "FeatureInsight" },
				"durations.nlpResult" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"counts.nlpResult" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"counts.filterResult" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"requestCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		this.telemetryService.publicLog('settingsEditor.filter', data);
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
								this.remoteSearchPreferences(query, this.searchInProgress.token) :
								Promise.resolve(null);
						});
					}
				});
			} else {
				return Promise.resolve(null);
			}
		});
	}

	private localFilterPreferences(query: string, token?: CancellationToken): Promise<ISearchResult> {
		const localSearchProvider = this.preferencesSearchService.getLocalSearchProvider(query);
		return this.filterOrSearchPreferences(query, SearchResultIdx.Local, localSearchProvider, token);
	}

	private remoteSearchPreferences(query: string, token?: CancellationToken): Promise<void> {
		const remoteSearchProvider = this.preferencesSearchService.getRemoteSearchProvider(query);
		const newExtSearchProvider = this.preferencesSearchService.getRemoteSearchProvider(query, true);

		return Promise.all([
			this.filterOrSearchPreferences(query, SearchResultIdx.Remote, remoteSearchProvider, token),
			this.filterOrSearchPreferences(query, SearchResultIdx.NewExtensions, newExtSearchProvider, token)
		]).then(() => {
			this.renderResultCountMessages();
		});
	}

	private filterOrSearchPreferences(query: string, type: SearchResultIdx, searchProvider: ISearchProvider, token?: CancellationToken): Promise<ISearchResult> {
		return this._filterOrSearchPreferencesModel(query, this.defaultSettingsEditorModel, searchProvider, token).then(result => {
			if (token && token.isCancellationRequested) {
				// Handle cancellation like this because cancellation is lost inside the search provider due to async/await
				return null;
			}

			if (!this.searchResultModel) {
				this.searchResultModel = this.instantiationService.createInstance(SearchResultModel, this.viewState);
				this.searchResultModel.setResult(type, result);
				this.tocTreeModel.currentSearchModel = this.searchResultModel;
				this.onSearchModeToggled();
				this.refreshTree();
			} else {
				this.searchResultModel.setResult(type, result);
				this.tocTreeModel.update();
			}

			this.tocTree.setSelection([]);
			this.viewState.filterToCategory = null;
			this.tocTree.expandAll();

			return this.renderTree().then(() => result);
		});
	}

	private renderResultCountMessages() {
		if (!this.currentSettingsModel) {
			return;
		}

		if (this.tocTreeModel && this.tocTreeModel.settingsTreeRoot) {
			const count = this.tocTreeModel.settingsTreeRoot.count;
			switch (count) {
				case 0: this.countElement.innerText = localize('noResults', "No Settings Found"); break;
				case 1: this.countElement.innerText = localize('oneResult', "1 Setting Found"); break;
				default: this.countElement.innerText = localize('moreThanOneResult', "{0} Settings Found", count);
			}

			this.countElement.style.display = 'block';
			this.noResultsMessage.style.display = count === 0 ? 'block' : 'none';
			this.clearFilterLinkContainer.style.display = this.viewState.tagFilters && this.viewState.tagFilters.size > 0
				? 'initial'
				: 'none';
		}
	}

	private _filterOrSearchPreferencesModel(filter: string, model: ISettingsEditorModel, provider: ISearchProvider, token?: CancellationToken): Promise<ISearchResult> {
		const searchP = provider ? provider.searchModel(model, token) : Promise.resolve(null);
		return searchP
			.then<ISearchResult>(null, err => {
				if (isPromiseCanceledError(err)) {
					return Promise.reject(err);
				} else {
					/* __GDPR__
						"settingsEditor.searchError" : {
							"message": { "classification": "CallstackOrException", "purpose": "FeatureInsight" },
							"filter": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
						}
					*/
					const message = getErrorMessage(err).trim();
					if (message && message !== 'Error') {
						// "Error" = any generic network error
						this.telemetryService.publicLog('settingsEditor.searchError', { message, filter });
						this.logService.info('Setting search error: ' + message);
					}
					return null;
				}
			});
	}

	private layoutTrees(dimension: DOM.Dimension): void {
		const listHeight = dimension.height - (76 + 11 /* header height + padding*/);
		const settingsTreeHeight = listHeight - 14;
		this.settingsTreeContainer.style.height = `${settingsTreeHeight}px`;
		this.settingsTree.layout(settingsTreeHeight);
		this.settingsTree.layoutWidth(dimension.width);

		const tocTreeHeight = listHeight - 16;
		this.tocTreeContainer.style.height = `${tocTreeHeight}px`;
		this.tocTree.layout(tocTreeHeight);
	}

	protected saveState(): void {
		if (this.isVisible()) {
			const searchQuery = this.searchWidget.getValue().trim();
			const target = this.settingsTargetsWidget.settingsTarget as SettingsTarget;
			this.editorMemento.saveEditorState(this.group, this.input, { searchQuery, target });
		}

		super.saveState();
	}
}

interface ISettingsEditor2State {
	searchQuery: string;
	target: SettingsTarget;
}
