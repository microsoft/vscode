/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button } from 'vs/base/browser/ui/button/button';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { Action } from 'vs/base/common/actions';
import * as arrays from 'vs/base/common/arrays';
import { Delayer, ThrottledDelayer } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import * as collections from 'vs/base/common/collections';
import { getErrorMessage, isPromiseCanceledError } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { collapseAll, expandAll } from 'vs/base/parts/tree/browser/treeUtils';
import 'vs/css!./media/settingsEditor2';
import { localize } from 'vs/nls';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { ILogService } from 'vs/platform/log/common/log';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { attachButtonStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorOptions, IEditor } from 'vs/workbench/common/editor';
import { SuggestEnabledInput } from 'vs/workbench/parts/codeEditor/browser/suggestEnabledInput';
import { PreferencesEditor } from 'vs/workbench/parts/preferences/browser/preferencesEditor';
import { SettingsTarget, SettingsTargetsWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { commonlyUsedData, tocData } from 'vs/workbench/parts/preferences/browser/settingsLayout';
import { resolveExtensionsSettings, resolveSettingsTree, SettingsRenderer, SettingsTree } from 'vs/workbench/parts/preferences/browser/settingsTree';
import { ISettingsEditorViewState, MODIFIED_SETTING_TAG, ONLINE_SERVICES_SETTING_TAG, SearchResultIdx, SearchResultModel, SettingsTreeGroupElement, SettingsTreeModel, SettingsTreeSettingElement } from 'vs/workbench/parts/preferences/browser/settingsTreeModels';
import { TOCRenderer, TOCTree, TOCTreeModel } from 'vs/workbench/parts/preferences/browser/tocTree';
import { CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_SEARCH_FOCUS, CONTEXT_TOC_ROW_FOCUS, IPreferencesSearchService, ISearchProvider } from 'vs/workbench/parts/preferences/common/preferences';
import { IEditorGroup } from 'vs/workbench/services/group/common/editorGroupsService';
import { IPreferencesService, ISearchResult, ISettingsEditorModel } from 'vs/workbench/services/preferences/common/preferences';
import { SettingsEditor2Input } from 'vs/workbench/services/preferences/common/preferencesEditorInput';
import { DefaultSettingsEditorModel } from 'vs/workbench/services/preferences/common/preferencesModels';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { badgeBackground, contrastBorder, badgeForeground, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { INotificationService } from 'vs/platform/notification/common/notification';

const $ = DOM.$;

export class SettingsEditor2 extends BaseEditor {

	public static readonly ID: string = 'workbench.editor.settings2';
	private static NUM_INSTANCES: number = 0;

	private static readonly SUGGESTIONS: string[] = [
		'@modified', '@tag:usesOnlineServices'
	];

	private defaultSettingsEditorModel: DefaultSettingsEditorModel;

	private rootElement: HTMLElement;
	private headerContainer: HTMLElement;
	private searchWidget: SuggestEnabledInput;
	private countElement: HTMLElement;
	private settingsTargetsWidget: SettingsTargetsWidget;
	private toolbar: ToolBar;

	private settingsTreeContainer: HTMLElement;
	private settingsTree: Tree;
	private settingsTreeRenderer: SettingsRenderer;
	private tocTreeModel: TOCTreeModel;
	private settingsTreeModel: SettingsTreeModel;
	private noResultsMessage: HTMLElement;

	private tocTreeContainer: HTMLElement;
	private tocTree: WorkbenchTree;

	private delayedFilterLogging: Delayer<void>;
	private localSearchDelayer: Delayer<void>;
	private remoteSearchThrottle: ThrottledDelayer<void>;
	private searchInProgress: CancellationTokenSource;

	private delayRefreshOnLayout: Delayer<void>;
	private lastLayedoutWidth: number;

	private settingUpdateDelayer: Delayer<void>;
	private pendingSettingUpdate: { key: string, value: any };

	private viewState: ISettingsEditorViewState;
	private searchResultModel: SearchResultModel;

	private tocRowFocused: IContextKey<boolean>;
	private inSettingsEditorContextKey: IContextKey<boolean>;
	private searchFocusContextKey: IContextKey<boolean>;

	private scheduledRefreshes: Map<string, DOM.IFocusTracker>;

	private tagRegex = /(^|\s)@tag:("([^"]*)"|[^"]\S*)/g;

	/** Don't spam warnings */
	private hasWarnedMissingSettings: boolean;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IThemeService themeService: IThemeService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPreferencesSearchService private preferencesSearchService: IPreferencesSearchService,
		@ILogService private logService: ILogService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IStorageService private storageService: IStorageService,
		@INotificationService private notificationService: INotificationService
	) {
		super(SettingsEditor2.ID, telemetryService, themeService);
		this.delayedFilterLogging = new Delayer<void>(1000);
		this.localSearchDelayer = new Delayer(300);
		this.remoteSearchThrottle = new ThrottledDelayer(200);
		this.viewState = { settingsTarget: ConfigurationTarget.USER };
		this.delayRefreshOnLayout = new Delayer(100);

		this.settingUpdateDelayer = new Delayer<void>(200);

		this.inSettingsEditorContextKey = CONTEXT_SETTINGS_EDITOR.bindTo(contextKeyService);
		this.searchFocusContextKey = CONTEXT_SETTINGS_SEARCH_FOCUS.bindTo(contextKeyService);
		this.tocRowFocused = CONTEXT_TOC_ROW_FOCUS.bindTo(contextKeyService);

		this.scheduledRefreshes = new Map<string, DOM.IFocusTracker>();

		this._register(configurationService.onDidChangeConfiguration(e => {
			this.onConfigUpdate(e.affectedKeys);
		}));
	}

	private get currentSettingsModel() {
		return this.searchResultModel || this.settingsTreeModel;
	}

	createEditor(parent: HTMLElement): void {
		parent.setAttribute('tabindex', '-1');
		this.rootElement = DOM.append(parent, $('.settings-editor'));

		this.createHeader(this.rootElement);
		this.createBody(this.rootElement);
		this.updateStyles();
	}

	setInput(input: SettingsEditor2Input, options: EditorOptions, token: CancellationToken): Thenable<void> {
		this.inSettingsEditorContextKey.set(true);
		return super.setInput(input, options, token)
			.then(() => new Promise(process.nextTick)) // Force setInput to be async
			.then(() => this.render(token))
			.then(() => {
				// Init TOC selection
				this.updateTreeScrollSync();
			});
	}

	clearInput(): void {
		this.inSettingsEditorContextKey.set(false);
		super.clearInput();
	}

	layout(dimension: DOM.Dimension): void {
		this.layoutTrees(dimension);

		let innerWidth = dimension.width - 24 * 2; // 24px padding on left and right
		let monacoWidth = (innerWidth > 1000 ? 1000 : innerWidth) - 10;
		this.searchWidget.layout({ height: 20, width: monacoWidth });

		DOM.toggleClass(this.rootElement, 'narrow', dimension.width < 600);

		// #56185
		if (dimension.width !== this.lastLayedoutWidth) {
			this.lastLayedoutWidth = dimension.width;
			this.delayRefreshOnLayout.trigger(() => this.renderTree());
		}
	}

	focus(): void {
		this.focusSearch();
	}

	focusSettings(): void {
		const firstFocusable = this.settingsTree.getHTMLElement().querySelector(SettingsRenderer.CONTROL_SELECTOR);
		if (firstFocusable) {
			(<HTMLElement>firstFocusable).focus();
		}
	}

	showContextMenu(): void {
		const settingDOMElement = this.settingsTreeRenderer.getSettingDOMElementForDOMElement(<HTMLElement>document.activeElement);
		if (!settingDOMElement) {
			return;
		}

		const focusedKey = this.settingsTreeRenderer.getKeyForDOMElementInSetting(settingDOMElement);
		if (!focusedKey) {
			return;
		}

		const elements = this.currentSettingsModel.getElementsByName(focusedKey);
		if (elements && elements[0]) {
			this.settingsTreeRenderer.showContextMenu(elements[0], settingDOMElement);
		}
	}

	focusSearch(): void {
		this.searchWidget.focus();
	}

	clearSearchResults(): void {
		this.searchWidget.setValue('');
	}

	search(text: string): void {
		if (this.searchWidget) {
			this.searchWidget.focus();
			this.searchWidget.setValue(text);
		}
	}

	private createHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.settings-header'));

		const previewHeader = DOM.append(this.headerContainer, $('.settings-preview-header'));

		const previewAlert = DOM.append(previewHeader, $('span.settings-preview-warning'));
		previewAlert.textContent = localize('previewWarning', "Preview");

		const previewTextLabel = DOM.append(previewHeader, $('span.settings-preview-label'));
		previewTextLabel.textContent = localize('previewLabel', "This is a preview of our new settings editor");

		const searchContainer = DOM.append(this.headerContainer, $('.search-container'));

		let searchBoxLabel = localize('SearchSettings.AriaLabel', "Search settings");
		this.searchWidget = this._register(this.instantiationService.createInstance(SuggestEnabledInput, `${SettingsEditor2.ID}.searchbox`, searchContainer, {
			triggerCharacters: ['@'],
			provideResults: (query: string) => {
				return SettingsEditor2.SUGGESTIONS.filter(tag => query.indexOf(tag) === -1).map(tag => tag + ' ');
			}
		}, searchBoxLabel, 'settingseditor:searchinput' + SettingsEditor2.NUM_INSTANCES++, {
				placeholderText: searchBoxLabel,
				focusContextKey: this.searchFocusContextKey,
				// TODO: Aria-live
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
		this.settingsTargetsWidget.onDidTargetChange(target => {
			this.viewState.settingsTarget = target;
			if (target === ConfigurationTarget.USER) {
				this.preferencesService.openGlobalSettings();
			} else if (target === ConfigurationTarget.WORKSPACE) {
				this.preferencesService.switchSettings(ConfigurationTarget.WORKSPACE, this.preferencesService.workspaceSettingsResource);
			} else if (target instanceof URI) {
				this.preferencesService.switchSettings(ConfigurationTarget.WORKSPACE_FOLDER, target);
			}
		});

		this.createHeaderControls(headerControlsContainer);
	}

	private createHeaderControls(parent: HTMLElement): void {
		const headerControlsContainerRight = DOM.append(parent, $('.settings-header-controls-right'));

		this.toolbar = this._register(new ToolBar(headerControlsContainerRight, this.contextMenuService, {
			ariaLabel: localize('settingsToolbarLabel', "Settings Editor Actions"),
			actionRunner: this.actionRunner
		}));

		const actions: Action[] = [
			this.instantiationService.createInstance(FilterByTagAction,
				localize('filterModifiedLabel', "Show modified settings"),
				MODIFIED_SETTING_TAG,
				this)
		];
		if (this.environmentService.appQuality !== 'stable') {
			actions.push(
				this.instantiationService.createInstance(
					FilterByTagAction,
					localize('filterOnlineServicesLabel', "Show settings for online services"),
					ONLINE_SERVICES_SETTING_TAG,
					this));
			actions.push(new Separator());
		}
		actions.push(new Action('settings.openSettingsJson', localize('openSettingsJsonLabel', "Open settings.json"), undefined, undefined, () => {
			return this.openSettingsFile().then(editor => {
				const currentSearch = this.searchWidget.getValue();
				if (editor instanceof PreferencesEditor && currentSearch) {
					editor.focusSearch(currentSearch);
				}
			});
		}));

		this.toolbar.setActions([], actions)();
		this.toolbar.context = <ISettingsToolbarContext>{ target: this.settingsTargetsWidget.settingsTarget };
	}

	private revealSettingByKey(settingKey: string): void {
		const elements = this.currentSettingsModel.getElementsByName(settingKey);
		if (elements && elements[0]) {
			this.settingsTree.reveal(elements[0]);

			const domElements = this.settingsTreeRenderer.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), settingKey);
			if (domElements && domElements[0]) {
				const control = domElements[0].querySelector(SettingsRenderer.CONTROL_SELECTOR);
				if (control) {
					(<HTMLElement>control).focus();
				}
			}
		}
	}

	private openSettingsFile(): TPromise<IEditor> {
		const currentSettingsTarget = this.settingsTargetsWidget.settingsTarget;

		if (currentSettingsTarget === ConfigurationTarget.USER) {
			return this.preferencesService.openGlobalSettings(true);
		} else if (currentSettingsTarget === ConfigurationTarget.WORKSPACE) {
			return this.preferencesService.openWorkspaceSettings(true);
		} else {
			return this.preferencesService.openFolderSettings(currentSettingsTarget, true);
		}
	}

	private createBody(parent: HTMLElement): void {
		const bodyContainer = DOM.append(parent, $('.settings-body'));

		this.noResultsMessage = DOM.append(bodyContainer, $('.no-results'));
		this.noResultsMessage.innerText = localize('noResults', "No Settings Found");
		this._register(attachStylerCallback(this.themeService, { editorForeground }, colors => {
			this.noResultsMessage.style.color = colors.editorForeground ? colors.editorForeground.toString() : null;
		}));

		this.createFocusSink(
			bodyContainer,
			e => {
				if (DOM.findParentWithClass(e.relatedTarget, 'settings-editor-tree')) {
					if (this.settingsTree.getScrollPosition() > 0) {
						const firstElement = this.settingsTree.getFirstVisibleElement();
						this.settingsTree.reveal(firstElement, 0.1);
						return true;
					}
				} else {
					const firstControl = this.settingsTree.getHTMLElement().querySelector(SettingsRenderer.CONTROL_SELECTOR);
					if (firstControl) {
						(<HTMLElement>firstControl).focus();
					}
				}

				return false;
			},
			'settings list focus helper');

		this.createSettingsTree(bodyContainer);

		this.createFocusSink(
			bodyContainer,
			e => {
				if (DOM.findParentWithClass(e.relatedTarget, 'settings-editor-tree')) {
					if (this.settingsTree.getScrollPosition() < 1) {
						const lastElement = this.settingsTree.getLastVisibleElement();
						this.settingsTree.reveal(lastElement, 0.9);
						return true;
					}
				}

				return false;
			},
			'settings list focus helper'
		);

		this.createTOC(bodyContainer);

		if (this.environmentService.appQuality !== 'stable') {
			this.createFeedbackButton(bodyContainer);
		}
	}

	private createFocusSink(container: HTMLElement, callback: (e: any) => boolean, label: string): HTMLElement {
		const listFocusSink = DOM.append(container, $('.settings-tree-focus-sink'));
		listFocusSink.setAttribute('aria-label', label);
		listFocusSink.tabIndex = 0;
		this._register(DOM.addDisposableListener(listFocusSink, 'focus', (e: any) => {
			if (e.relatedTarget && callback(e)) {
				e.relatedTarget.focus();
			}
		}));

		return listFocusSink;
	}

	private createTOC(parent: HTMLElement): void {
		this.tocTreeModel = new TOCTreeModel(this.viewState);
		this.tocTreeContainer = DOM.append(parent, $('.settings-toc-container'));

		const tocRenderer = this.instantiationService.createInstance(TOCRenderer);

		this.tocTree = this._register(this.instantiationService.createInstance(TOCTree, this.tocTreeContainer,
			this.viewState,
			{
				renderer: tocRenderer
			}));

		this._register(this.tocTree.onDidChangeFocus(e => {
			const element = e.focus;
			if (this.searchResultModel) {
				this.viewState.filterToCategory = element;
				this.renderTree();
			}

			if (element && (!e.payload || !e.payload.fromScroll)) {
				this.settingsTree.reveal(element, 0);
			}
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

		this.settingsTreeRenderer = this.instantiationService.createInstance(SettingsRenderer, this.settingsTreeContainer);
		this._register(this.settingsTreeRenderer.onDidChangeSetting(e => this.onDidChangeSetting(e.key, e.value)));
		this._register(this.settingsTreeRenderer.onDidOpenSettings(settingKey => {
			this.openSettingsFile().then(editor => {
				if (editor instanceof PreferencesEditor && settingKey) {
					editor.focusSearch(settingKey);
				}
			});
		}));
		this._register(this.settingsTreeRenderer.onDidClickSettingLink(settingName => this.revealSettingByKey(settingName)));
		this._register(this.settingsTreeRenderer.onDidFocusSetting(element => {
			this.settingsTree.reveal(element);
		}));

		this.settingsTree = this._register(this.instantiationService.createInstance(SettingsTree,
			this.settingsTreeContainer,
			this.viewState,
			{
				renderer: this.settingsTreeRenderer
			}));
		this.settingsTree.getHTMLElement().attributes.removeNamedItem('tabindex');

		this._register(this.settingsTree.onDidScroll(() => {
			this.updateTreeScrollSync();
		}));
	}

	private createFeedbackButton(parent: HTMLElement): void {
		const feedbackButton = this._register(new Button(parent));
		feedbackButton.label = localize('feedbackButtonLabel', "Provide Feedback");
		feedbackButton.element.classList.add('settings-feedback-button');

		this._register(attachButtonStyler(feedbackButton, this.themeService));
		this._register(feedbackButton.onDidClick(() => {
			// Github master issue
			window.open('https://go.microsoft.com/fwlink/?linkid=2000807');
		}));
	}

	private onDidChangeSetting(key: string, value: any): void {
		if (!this.storageService.getBoolean('hasNotifiedOfSettingsAutosave', StorageScope.GLOBAL, false)) {
			this.storageService.store('hasNotifiedOfSettingsAutosave', true, StorageScope.GLOBAL);
			this.notificationService.info(localize('settingsNoSaveNeeded', "Your changes are automatically saved as you edit."));
		}

		if (this.pendingSettingUpdate && this.pendingSettingUpdate.key !== key) {
			this.updateChangedSetting(key, value);
		}

		this.pendingSettingUpdate = { key, value };
		this.settingUpdateDelayer.trigger(() => this.updateChangedSetting(key, value));
	}

	private updateTreeScrollSync(): void {
		this.settingsTreeRenderer.cancelSuggesters();
		if (this.searchResultModel) {
			return;
		}

		if (!this.tocTree.getInput()) {
			return;
		}

		const elementToSync = this.settingsTree.getFirstVisibleElement();
		const element = elementToSync instanceof SettingsTreeSettingElement ? elementToSync.parent :
			elementToSync instanceof SettingsTreeGroupElement ? elementToSync :
				null;

		if (element && this.tocTree.getSelection()[0] !== element) {
			this.tocTree.reveal(element);
			const elementTop = this.tocTree.getRelativeTop(element);
			collapseAll(this.tocTree, element);
			if (elementTop < 0 || elementTop > 1) {
				this.tocTree.reveal(element);
			} else {
				this.tocTree.reveal(element, elementTop);
			}

			this.tocTree.setSelection([element]);
			this.tocTree.setFocus(element, { fromScroll: true });
		}
	}

	private updateChangedSetting(key: string, value: any): TPromise<void> {
		// ConfigurationService displays the error if this fails.
		// Force a render afterwards because onDidConfigurationUpdate doesn't fire if the update doesn't result in an effective setting value change
		const settingsTarget = this.settingsTargetsWidget.settingsTarget;
		const resource = URI.isUri(settingsTarget) ? settingsTarget : undefined;
		const configurationTarget = <ConfigurationTarget>(resource ? ConfigurationTarget.WORKSPACE_FOLDER : settingsTarget);
		const overrides: IConfigurationOverrides = { resource };

		// If the user is changing the value back to the default, do a 'reset' instead
		const inspected = this.configurationService.inspect(key, overrides);
		if (inspected.default === value) {
			value = undefined;
		}

		return this.configurationService.updateValue(key, value, overrides, configurationTarget)
			.then(() => this.renderTree(key))
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

	private render(token: CancellationToken): TPromise<any> {
		if (this.input) {
			return this.input.resolve()
				.then(model => {
					if (token.isCancellationRequested) {
						return void 0;
					}

					return this.preferencesService.createPreferencesEditorModel((<ResourceEditorModel>model).textEditorModel.uri);
				}).then((defaultSettingsEditorModel: DefaultSettingsEditorModel) => {
					this._register(defaultSettingsEditorModel.onDidChangeGroups(() => this.onConfigUpdate()));
					this.defaultSettingsEditorModel = defaultSettingsEditorModel;
					return this.onConfigUpdate();
				});
		}
		return TPromise.as(null);
	}

	private toggleSearchMode(): void {
		DOM.removeClass(this.rootElement, 'search-mode');
		if (this.configurationService.getValue('workbench.settings.settingsSearchTocBehavior') === 'hide') {
			DOM.toggleClass(this.rootElement, 'search-mode', !!this.searchResultModel);
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

	private onConfigUpdate(keys?: string[]): TPromise<void> {
		if (keys) {
			return this.updateElementsByKey(keys);
		}

		const groups = this.defaultSettingsEditorModel.settingsGroups.slice(1); // Without commonlyUsed
		const dividedGroups = collections.groupBy(groups, g => g.contributedByExtension ? 'extension' : 'core');
		const settingsResult = resolveSettingsTree(tocData, dividedGroups.core);
		const resolvedSettingsRoot = settingsResult.tree;

		// Warn for settings not included in layout
		if (settingsResult.leftoverSettings.size && !this.hasWarnedMissingSettings) {
			let settingKeyList = [];
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
			return this.renderTree();
		} else {
			this.settingsTreeModel = this.instantiationService.createInstance(SettingsTreeModel, this.viewState);
			this.settingsTreeModel.update(resolvedSettingsRoot);
			this.settingsTree.setInput(this.settingsTreeModel.root);

			this.tocTreeModel.settingsTreeRoot = this.settingsTreeModel.root as SettingsTreeGroupElement;
			if (this.tocTree.getInput()) {
				this.tocTree.refresh();
			} else {
				this.tocTree.setInput(this.tocTreeModel);
			}
		}

		return TPromise.wrap(null);
	}

	private updateElementsByKey(keys: string[]): TPromise<void> {
		if (keys.length) {
			keys.forEach(key => this.currentSettingsModel.updateElementsByName(key));
			return TPromise.join(
				keys.map(key => this.renderTree(key)))
				.then(() => { });
		} else {
			return this.renderTree();
		}
	}

	private renderTree(key?: string): TPromise<void> {
		if (key && this.scheduledRefreshes.has(key)) {
			this.updateModifiedLabelForKey(key);
			return TPromise.wrap(null);
		}

		// If a setting control is currently focused, schedule a refresh for later
		const focusedSetting = this.settingsTreeRenderer.getSettingDOMElementForDOMElement(<HTMLElement>document.activeElement);
		if (focusedSetting) {
			// If a single setting is being refreshed, it's ok to refresh now if that is not the focused setting
			if (key) {
				const focusedKey = focusedSetting.getAttribute(SettingsRenderer.SETTING_KEY_ATTR);
				if (focusedKey === key) {
					this.updateModifiedLabelForKey(key);
					this.scheduleRefresh(focusedSetting, key);
					return TPromise.wrap(null);
				}
			} else {
				this.scheduleRefresh(focusedSetting);
				return TPromise.wrap(null);
			}
		}

		let refreshP: TPromise<any>;
		if (key) {
			const elements = this.currentSettingsModel.getElementsByName(key);
			if (elements && elements.length) {
				refreshP = TPromise.join(elements.map(e => this.settingsTree.refresh(e)));
			} else {
				// Refresh requested for a key that we don't know about
				return TPromise.wrap(null);
			}
		} else {
			refreshP = this.settingsTree.refresh();
		}

		return refreshP.then(() => {
			this.tocTreeModel.update();
			return this.tocTree.refresh();
		}).then(() => { });
	}

	private updateModifiedLabelForKey(key: string): void {
		const dataElements = this.currentSettingsModel.getElementsByName(key);
		const isModified = dataElements && dataElements[0] && dataElements[0].isConfigured; // all elements are either configured or not
		const elements = this.settingsTreeRenderer.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), key);
		if (elements && elements[0]) {
			DOM.toggleClass(elements[0], 'is-configured', isModified);
		}
	}

	private onSearchInputChanged(): void {
		const query = this.searchWidget.getValue().trim();
		if (query === '') { this.countElement.style.display = 'none'; this.noResultsMessage.style.display = 'none'; }
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

	private triggerSearch(query: string): TPromise<void> {
		this.viewState.tagFilters = new Set<string>();
		if (query) {
			query = query.replace(this.tagRegex, (_, __, quotedTag, tag) => {
				this.viewState.tagFilters.add(tag || quotedTag);
				return '';
			});
			query = query.replace(`@${MODIFIED_SETTING_TAG}`, () => {
				this.viewState.tagFilters.add(MODIFIED_SETTING_TAG);
				return '';
			});
		}

		query = query.trim();
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
			this.tocTree.refresh();
			this.toggleSearchMode();
			collapseAll(this.tocTree);

			if (this.searchResultModel) {
				return this.settingsTree.setInput(this.searchResultModel.root);
			} else {
				return this.settingsTree.setInput(this.settingsTreeModel.root);
			}
		}
	}

	/**
	 * Return a fake SearchResultModel which can hold a flat list of all settings, to be filtered (@modified etc)
	 */
	private createFilterModel(): SearchResultModel {
		const filterModel = this.instantiationService.createInstance(SearchResultModel, this.viewState);

		const fullResult: ISearchResult = {
			filterMatches: []
		};
		for (let g of this.defaultSettingsEditorModel.settingsGroups.slice(1)) {
			for (let sect of g.sections) {
				for (let setting of sect.settings) {
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

	private triggerFilterPreferences(query: string): TPromise<void> {
		if (this.searchInProgress) {
			this.searchInProgress.cancel();
			this.searchInProgress = null;
		}

		// Trigger the local search. If it didn't find an exact match, trigger the remote search.
		const searchInProgress = this.searchInProgress = new CancellationTokenSource();
		return this.localSearchDelayer.trigger(() => {
			if (searchInProgress && !searchInProgress.token.isCancellationRequested) {
				return this.localFilterPreferences(query).then(result => {
					if (!result.exactMatch) {
						this.remoteSearchThrottle.trigger(() => {
							return searchInProgress && !searchInProgress.token.isCancellationRequested ?
								this.remoteSearchPreferences(query, this.searchInProgress.token) :
								TPromise.wrap(null);
						});
					}
				});
			} else {
				return TPromise.wrap(null);
			}
		});
	}

	private localFilterPreferences(query: string, token?: CancellationToken): TPromise<ISearchResult> {
		const localSearchProvider = this.preferencesSearchService.getLocalSearchProvider(query);
		return this.filterOrSearchPreferences(query, SearchResultIdx.Local, localSearchProvider, token);
	}

	private remoteSearchPreferences(query: string, token?: CancellationToken): TPromise<void> {
		const remoteSearchProvider = this.preferencesSearchService.getRemoteSearchProvider(query);
		const newExtSearchProvider = this.preferencesSearchService.getRemoteSearchProvider(query, true);

		return TPromise.join([
			this.filterOrSearchPreferences(query, SearchResultIdx.Remote, remoteSearchProvider, token),
			this.filterOrSearchPreferences(query, SearchResultIdx.NewExtensions, newExtSearchProvider, token)
		]).then(() => { });
	}

	private filterOrSearchPreferences(query: string, type: SearchResultIdx, searchProvider: ISearchProvider, token?: CancellationToken): TPromise<ISearchResult> {
		return this._filterOrSearchPreferencesModel(query, this.defaultSettingsEditorModel, searchProvider, token).then(result => {
			if (token && token.isCancellationRequested) {
				// Handle cancellation like this because cancellation is lost inside the search provider due to async/await
				return null;
			}

			if (!this.searchResultModel) {
				this.searchResultModel = this.instantiationService.createInstance(SearchResultModel, this.viewState);
				this.searchResultModel.setResult(type, result);
				this.tocTreeModel.currentSearchModel = this.searchResultModel;
				this.toggleSearchMode();
				this.settingsTree.setInput(this.searchResultModel.root);
			} else {
				this.tocTreeModel.update();
				expandAll(this.tocTree);
				this.searchResultModel.setResult(type, result);
			}

			let count = this.searchResultModel.getUniqueResults().map(result => result ? result.filterMatches.length : 0).reduce((a, b) => a + b);
			this.renderResultCountMessages(count);

			this.tocTree.setSelection([]);
			expandAll(this.tocTree);

			return this.renderTree().then(() => result);
		});
	}

	private renderResultCountMessages(count: number) {
		switch (count) {
			case 0: this.countElement.innerText = localize('noResults', "No Settings Found"); break;
			case 1: this.countElement.innerText = localize('oneResult', "1 Setting Found"); break;
			default: this.countElement.innerText = localize('moreThanOneResult', "{0} Settings Found", count);
		}

		this.countElement.style.display = 'block';
		this.noResultsMessage.style.display = count === 0 ? 'block' : 'none';
	}

	private _filterOrSearchPreferencesModel(filter: string, model: ISettingsEditorModel, provider: ISearchProvider, token?: CancellationToken): TPromise<ISearchResult> {
		const searchP = provider ? provider.searchModel(model, token) : TPromise.wrap(null);
		return searchP
			.then<ISearchResult>(null, err => {
				if (isPromiseCanceledError(err)) {
					return TPromise.wrapError(err);
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
		const listHeight = dimension.height - (97 + 11 /* header height + padding*/);
		const settingsTreeHeight = listHeight - 14;
		this.settingsTreeContainer.style.height = `${settingsTreeHeight}px`;
		this.settingsTree.layout(settingsTreeHeight, 800);

		const tocTreeHeight = listHeight - 16;
		this.tocTreeContainer.style.height = `${tocTreeHeight}px`;
		this.tocTree.layout(tocTreeHeight, 175);

		this.settingsTreeRenderer.updateWidth(dimension.width);
	}

	public updateStyles(): void {
		super.updateStyles();
		this.searchWidget.updateStyles();
	}

	setVisible(visible: boolean, group?: IEditorGroup): TPromise<void> {
		if (visible) {
			this.searchWidget.focus();
			this.searchWidget.selectAll();
		}

		return TPromise.as(super.setVisible(visible, group));
	}
}

interface ISettingsToolbarContext {
	target: SettingsTarget;
}

class FilterByTagAction extends Action {
	static readonly ID = 'settings.filterByTag';

	constructor(
		label: string,
		private tag: string,
		private settingsEditor: SettingsEditor2
	) {
		super(FilterByTagAction.ID, label, 'toggle-filter-tag');
	}

	run(): TPromise<void> {
		this.settingsEditor.search(this.tag === MODIFIED_SETTING_TAG ? `@${this.tag} ` : `@tag:${this.tag} `);
		return TPromise.as(null);
	}
}
