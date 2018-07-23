/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import * as arrays from 'vs/base/common/arrays';
import { Delayer, ThrottledDelayer } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import * as collections from 'vs/base/common/collections';
import { Color, RGBA } from 'vs/base/common/color';
import { getErrorMessage, isPromiseCanceledError } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITree, ITreeConfiguration } from 'vs/base/parts/tree/browser/tree';
import { DefaultTreestyler, OpenMode } from 'vs/base/parts/tree/browser/treeDefaults';
import 'vs/css!./media/settingsEditor2';
import { localize } from 'vs/nls';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchTree, WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { ILogService } from 'vs/platform/log/common/log';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground, focusBorder, foreground, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler, attachStyler } from 'vs/platform/theme/common/styler';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorOptions, IEditor } from 'vs/workbench/common/editor';
import { SearchWidget, SettingsTarget, SettingsTargetsWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { commonlyUsedData, tocData } from 'vs/workbench/parts/preferences/browser/settingsLayout';
import { ISettingsEditorViewState, NonExpandableTree, resolveExtensionsSettings, resolveSettingsTree, SearchResultIdx, SearchResultModel, SettingsAccessibilityProvider, SettingsDataSource, SettingsRenderer, SettingsTreeController, SettingsTreeElement, SettingsTreeFilter, SettingsTreeGroupElement, SettingsTreeModel, SettingsTreeSettingElement } from 'vs/workbench/parts/preferences/browser/settingsTree';
import { TOCDataSource, TOCRenderer, TOCTreeModel } from 'vs/workbench/parts/preferences/browser/tocTree';
import { CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_FIRST_ROW_FOCUS, CONTEXT_SETTINGS_ROW_FOCUS, CONTEXT_SETTINGS_SEARCH_FOCUS, CONTEXT_TOC_ROW_FOCUS, IPreferencesSearchService, ISearchProvider } from 'vs/workbench/parts/preferences/common/preferences';
import { IPreferencesService, ISearchResult, ISettingsEditorModel } from 'vs/workbench/services/preferences/common/preferences';
import { SettingsEditor2Input } from 'vs/workbench/services/preferences/common/preferencesEditorInput';
import { DefaultSettingsEditorModel } from 'vs/workbench/services/preferences/common/preferencesModels';

const $ = DOM.$;

export const settingItemInactiveSelectionBorder = registerColor('settings.inactiveSelectedItemBorder', {
	dark: '#3F3F46',
	light: '#CCCEDB',
	hc: null
}, localize('settingItemInactiveSelectionBorder', "The color of the selected setting row border, when the settings list does not have focus."));

export class SettingsEditor2 extends BaseEditor {

	public static readonly ID: string = 'workbench.editor.settings2';

	private defaultSettingsEditorModel: DefaultSettingsEditorModel;

	private rootElement: HTMLElement;
	private headerContainer: HTMLElement;
	private searchWidget: SearchWidget;
	private settingsTargetsWidget: SettingsTargetsWidget;

	private showConfiguredSettingsOnlyCheckbox: HTMLInputElement;

	private settingsTreeContainer: HTMLElement;
	private settingsTree: WorkbenchTree;
	private treeDataSource: SettingsDataSource;
	private tocTreeModel: TOCTreeModel;
	private settingsTreeModel: SettingsTreeModel;

	private tocTreeContainer: HTMLElement;
	private tocTree: WorkbenchTree;

	private delayedFilterLogging: Delayer<void>;
	private localSearchDelayer: Delayer<void>;
	private remoteSearchThrottle: ThrottledDelayer<void>;
	private searchInProgress: TPromise<void>;

	private settingUpdateDelayer: Delayer<void>;
	private pendingSettingUpdate: { key: string, value: any };

	private selectedElement: SettingsTreeElement;

	private viewState: ISettingsEditorViewState;
	private searchResultModel: SearchResultModel;

	private firstRowFocused: IContextKey<boolean>;
	private rowFocused: IContextKey<boolean>;
	private tocRowFocused: IContextKey<boolean>;
	private inSettingsEditorContextKey: IContextKey<boolean>;
	private searchFocusContextKey: IContextKey<boolean>;

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
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(SettingsEditor2.ID, telemetryService, themeService);
		this.delayedFilterLogging = new Delayer<void>(1000);
		this.localSearchDelayer = new Delayer(100);
		this.remoteSearchThrottle = new ThrottledDelayer(200);
		this.viewState = { settingsTarget: ConfigurationTarget.USER };

		this.settingUpdateDelayer = new Delayer<void>(500);

		this.inSettingsEditorContextKey = CONTEXT_SETTINGS_EDITOR.bindTo(contextKeyService);
		this.searchFocusContextKey = CONTEXT_SETTINGS_SEARCH_FOCUS.bindTo(contextKeyService);
		this.firstRowFocused = CONTEXT_SETTINGS_FIRST_ROW_FOCUS.bindTo(contextKeyService);
		this.rowFocused = CONTEXT_SETTINGS_ROW_FOCUS.bindTo(contextKeyService);
		this.tocRowFocused = CONTEXT_TOC_ROW_FOCUS.bindTo(contextKeyService);

		this._register(configurationService.onDidChangeConfiguration(e => {
			this.onConfigUpdate();

			if (e.affectsConfiguration('workbench.settings.tocVisible')) {
				this.updateTOCVisible();
			}
		}));
	}

	createEditor(parent: HTMLElement): void {
		parent.setAttribute('tabindex', '-1');
		this.rootElement = DOM.append(parent, $('.settings-editor'));

		this.createHeader(this.rootElement);
		this.createBody(this.rootElement);
	}

	setInput(input: SettingsEditor2Input, options: EditorOptions, token: CancellationToken): Thenable<void> {
		this.inSettingsEditorContextKey.set(true);
		return super.setInput(input, options, token)
			.then(() => {
				this.render(token);
			});
	}

	clearInput(): void {
		this.inSettingsEditorContextKey.set(false);
		super.clearInput();
	}

	layout(dimension: DOM.Dimension): void {
		this.searchWidget.layout(dimension);
		this.layoutTrees(dimension);

		DOM.toggleClass(this.rootElement, 'narrow', dimension.width < 600);
	}

	focus(): void {
		this.focusSearch();
	}

	focusSettings(): void {
		const selection = this.settingsTree.getSelection();
		if (selection && selection[0]) {
			this.settingsTree.setFocus(selection[0]);
		} else {
			this.settingsTree.focusFirst();
		}

		this.settingsTree.domFocus();
	}

	focusSearch(): void {
		this.searchWidget.focus();
	}

	editSelectedSetting(): void {
		const focus = this.settingsTree.getFocus();
		if (focus instanceof SettingsTreeSettingElement) {
			const itemId = focus.id.replace(/\./g, '_');
			this.focusEditControlForRow(itemId);
		}
	}

	clearSearchResults(): void {
		this.searchWidget.clear();
	}

	private createHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.settings-header'));

		const previewHeader = DOM.append(this.headerContainer, $('.settings-preview-header'));

		const previewAlert = DOM.append(previewHeader, $('span.settings-preview-warning'));
		previewAlert.textContent = localize('previewWarning', "Preview");

		const previewTextLabel = DOM.append(previewHeader, $('span.settings-preview-label'));
		previewTextLabel.textContent = localize('previewLabel', "This is a preview of our new settings editor");

		const searchContainer = DOM.append(this.headerContainer, $('.search-container'));
		this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, searchContainer, {
			ariaLabel: localize('SearchSettings.AriaLabel', "Search settings"),
			placeholder: localize('SearchSettings.Placeholder', "Search settings"),
			focusKey: this.searchFocusContextKey,
			ariaLive: 'assertive'
		}));
		this._register(this.searchWidget.onDidChange(() => this.onSearchInputChanged()));

		const advancedCustomization = DOM.append(this.headerContainer, $('.settings-advanced-customization'));
		const advancedCustomizationLabel = DOM.append(advancedCustomization, $('span.settings-advanced-customization-label'));
		advancedCustomizationLabel.textContent = localize('advancedCustomizationLabel', "For advanced customizations open and edit") + ' ';
		const openSettingsButton = this._register(new Button(advancedCustomization, { title: true, buttonBackground: null, buttonHoverBackground: null }));
		this._register(attachButtonStyler(openSettingsButton, this.themeService, {
			buttonBackground: Color.transparent.toString(),
			buttonHoverBackground: Color.transparent.toString(),
			buttonForeground: foreground
		}));
		openSettingsButton.label = localize('openSettingsLabel', "settings.json");
		openSettingsButton.element.classList.add('open-settings-button');

		this._register(openSettingsButton.onDidClick(() => this.openSettingsFile()));

		const headerControlsContainer = DOM.append(this.headerContainer, $('.settings-header-controls'));
		const targetWidgetContainer = DOM.append(headerControlsContainer, $('.settings-target-container'));
		this.settingsTargetsWidget = this._register(this.instantiationService.createInstance(SettingsTargetsWidget, targetWidgetContainer));
		this.settingsTargetsWidget.settingsTarget = ConfigurationTarget.USER;
		this.settingsTargetsWidget.onDidTargetChange(() => {
			this.viewState.settingsTarget = this.settingsTargetsWidget.settingsTarget;

			this.settingsTreeModel.update();
			this.refreshTreeAndMaintainFocus();
		});

		this.createHeaderControls(headerControlsContainer);
	}

	private createHeaderControls(parent: HTMLElement): void {
		const headerControlsContainerRight = DOM.append(parent, $('.settings-header-controls-right'));

		this.showConfiguredSettingsOnlyCheckbox = DOM.append(headerControlsContainerRight, $('input#configured-only-checkbox'));
		this.showConfiguredSettingsOnlyCheckbox.type = 'checkbox';
		const showConfiguredSettingsOnlyLabel = <HTMLLabelElement>DOM.append(headerControlsContainerRight, $('label.configured-only-label'));
		showConfiguredSettingsOnlyLabel.textContent = localize('showOverriddenOnly', "Show modified only");
		showConfiguredSettingsOnlyLabel.htmlFor = 'configured-only-checkbox';

		this._register(DOM.addDisposableListener(this.showConfiguredSettingsOnlyCheckbox, 'change', e => this.onShowConfiguredOnlyClicked()));
	}

	private revealSetting(settingName: string): void {
		const element = this.settingsTreeModel.getElementByName(settingName);
		if (element) {
			this.settingsTree.setSelection([element]);
			this.settingsTree.setFocus(element);
			this.settingsTree.reveal(element, 0);
			this.settingsTree.domFocus();
		}
	}

	private openSettingsFile(): TPromise<IEditor> {
		const currentSettingsTarget = this.settingsTargetsWidget.settingsTarget;

		if (currentSettingsTarget === ConfigurationTarget.USER) {
			return this.preferencesService.openGlobalSettings();
		} else if (currentSettingsTarget === ConfigurationTarget.WORKSPACE) {
			return this.preferencesService.openWorkspaceSettings();
		} else {
			return this.preferencesService.openFolderSettings(currentSettingsTarget);
		}
	}

	private createBody(parent: HTMLElement): void {
		const bodyContainer = DOM.append(parent, $('.settings-body'));

		this.createTOC(bodyContainer);
		this.createSettingsTree(bodyContainer);

		if (this.environmentService.appQuality !== 'stable') {
			this.createFeedbackButton(bodyContainer);
		}
	}

	private createTOC(parent: HTMLElement): void {
		this.tocTreeContainer = DOM.append(parent, $('.settings-toc-container'));

		const tocDataSource = this.instantiationService.createInstance(TOCDataSource);
		const tocRenderer = this.instantiationService.createInstance(TOCRenderer);
		this.tocTreeModel = new TOCTreeModel();

		this.tocTree = this.instantiationService.createInstance(WorkbenchTree, this.tocTreeContainer,
			<ITreeConfiguration>{
				dataSource: tocDataSource,
				renderer: tocRenderer,
				controller: this.instantiationService.createInstance(WorkbenchTreeController, { openMode: OpenMode.DOUBLE_CLICK }),
				filter: this.instantiationService.createInstance(SettingsTreeFilter, this.viewState)
			},
			{
				showLoading: false,
				twistiePixels: 15
			});

		this._register(this.tocTree.onDidChangeFocus(e => {
			const element = e.focus;
			if (this.searchResultModel) {
				this.viewState.filterToCategory = element;
				this.refreshTreeAndMaintainFocus();
			} else if (this.settingsTreeModel) {
				if (element && !e.payload.fromScroll) {
					this.settingsTree.reveal(element, 0);
					this.settingsTree.setSelection([element]);
					this.settingsTree.setFocus(element);
				}
			}

		}));

		this._register(this.tocTree.onDidFocus(() => {
			this.tocRowFocused.set(true);
		}));

		this._register(this.tocTree.onDidBlur(() => {
			this.tocRowFocused.set(false);
		}));

		this.updateTOCVisible();
	}

	private updateTOCVisible(): void {
		const visible = !!this.configurationService.getValue('workbench.settings.tocVisible');
		DOM.toggleClass(this.tocTreeContainer, 'hidden', !visible);
	}

	private createSettingsTree(parent: HTMLElement): void {
		this.settingsTreeContainer = DOM.append(parent, $('.settings-tree-container'));

		this.treeDataSource = this.instantiationService.createInstance(SettingsDataSource, this.viewState);
		const renderer = this.instantiationService.createInstance(SettingsRenderer, this.settingsTreeContainer);
		this._register(renderer.onDidChangeSetting(e => this.onDidChangeSetting(e.key, e.value)));
		this._register(renderer.onDidOpenSettings(() => this.openSettingsFile()));
		this._register(renderer.onDidClickSettingLink(settingName => this.revealSetting(settingName)));

		const treeClass = 'settings-editor-tree';
		this.settingsTree = this.instantiationService.createInstance(NonExpandableTree, this.settingsTreeContainer,
			<ITreeConfiguration>{
				dataSource: this.treeDataSource,
				renderer,
				controller: this.instantiationService.createInstance(SettingsTreeController),
				accessibilityProvider: this.instantiationService.createInstance(SettingsAccessibilityProvider),
				filter: this.instantiationService.createInstance(SettingsTreeFilter, this.viewState),
				styler: new DefaultTreestyler(DOM.createStyleSheet(), treeClass)
			},
			{
				ariaLabel: localize('treeAriaLabel', "Settings"),
				showLoading: false,
				indentPixels: 0,
				twistiePixels: 0,
			});

		this._register(registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
			const activeBorderColor = theme.getColor(focusBorder);
			if (activeBorderColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .monaco-tree:focus .monaco-tree-row.focused {outline: solid 1px ${activeBorderColor}; outline-offset: -1px; }`);
			}

			const inactiveBorderColor = theme.getColor(settingItemInactiveSelectionBorder);
			if (inactiveBorderColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .monaco-tree .monaco-tree-row.focused {outline: solid 1px ${inactiveBorderColor}; outline-offset: -1px; }`);
			}

			const foregroundColor = theme.getColor(foreground);
			if (foregroundColor) {
				// Links appear inside other elements in markdown. CSS opacity acts like a mask. So we have to dynamically compute the description color to avoid
				// applying an opacity to the link color.
				const fgWithOpacity = new Color(new RGBA(foregroundColor.rgba.r, foregroundColor.rgba.g, foregroundColor.rgba.b, .7));
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-description { color: ${fgWithOpacity}; }`);
			}
		}));

		this.settingsTree.getHTMLElement().classList.add(treeClass);

		this._register(attachStyler(this.themeService, {
			listActiveSelectionBackground: editorBackground,
			listActiveSelectionForeground: foreground,
			listFocusAndSelectionBackground: editorBackground,
			listFocusAndSelectionForeground: foreground,
			listFocusBackground: editorBackground,
			listFocusForeground: foreground,
			listHoverForeground: foreground,
			listHoverBackground: editorBackground,
			listInactiveSelectionBackground: editorBackground,
			listInactiveSelectionForeground: foreground
		}, colors => {
			this.settingsTree.style(colors);
		}));

		this._register(this.settingsTree.onDidChangeFocus(e => {
			this.settingsTree.setSelection([e.focus]);
			if (this.selectedElement) {
				this.settingsTree.refresh(this.selectedElement);
			}

			if (e.focus) {
				this.settingsTree.refresh(e.focus);
			}

			this.selectedElement = e.focus;
		}));

		this._register(this.settingsTree.onDidBlur(() => {
			this.rowFocused.set(false);
			this.firstRowFocused.set(false);
		}));

		this._register(this.settingsTree.onDidChangeSelection(e => {
			this.updateTreeScrollSync();

			let firstRowFocused = false;
			let rowFocused = false;
			const selection: SettingsTreeElement = e.selection[0];
			if (selection) {
				rowFocused = true;
				if (this.searchResultModel) {
					firstRowFocused = selection.id === this.searchResultModel.getChildren()[0].id;
				} else {
					const firstRowId = this.settingsTreeModel.root.children[0] && this.settingsTreeModel.root.children[0].id;
					firstRowFocused = selection.id === firstRowId;
				}
			}

			this.rowFocused.set(rowFocused);
			this.firstRowFocused.set(firstRowFocused);
		}));

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

	private onShowConfiguredOnlyClicked(): void {
		this.viewState.showConfiguredOnly = this.showConfiguredSettingsOnlyCheckbox.checked;
		this.refreshTreeAndMaintainFocus();
		this.tocTree.refresh();
		this.settingsTree.setScrollPosition(0);
		this.expandAll(this.settingsTree);
	}

	private onDidChangeSetting(key: string, value: any): void {
		if (this.pendingSettingUpdate && this.pendingSettingUpdate.key !== key) {
			this.updateChangedSetting(key, value);
		}

		this.pendingSettingUpdate = { key, value };
		this.settingUpdateDelayer.trigger(() => this.updateChangedSetting(key, value));
	}

	private updateTreeScrollSync(): void {
		if (this.searchResultModel) {
			return;
		}

		if (!this.tocTree.getInput()) {
			return;
		}

		let elementToSync = this.settingsTree.getFirstVisibleElement();
		const selection = this.settingsTree.getSelection()[0];
		if (selection) {
			const selectionPos = this.settingsTree.getRelativeTop(selection);
			if (selectionPos >= 0 && selectionPos <= 1) {
				elementToSync = selection;
			}
		}

		const element = elementToSync instanceof SettingsTreeSettingElement ? elementToSync.parent :
			elementToSync instanceof SettingsTreeGroupElement ? elementToSync :
				null;

		if (element && this.tocTree.getSelection()[0] !== element) {
			const elementTop = this.tocTree.getRelativeTop(element);
			if (elementTop < 0) {
				this.tocTree.reveal(element, 0);
			} else if (elementTop > 1) {
				this.tocTree.reveal(element, 1);
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
		const configurationTarget = <ConfigurationTarget>(resource ? undefined : settingsTarget);
		const overrides: IConfigurationOverrides = { resource };

		// If the user is changing the value back to the default, do a 'reset' instead
		const inspected = this.configurationService.inspect(key, overrides);
		if (inspected.default === value) {
			value = undefined;
		}

		return this.configurationService.updateValue(key, value, overrides, configurationTarget)
			.then(() => this.refreshTreeAndMaintainFocus())
			.then(() => {
				const reportModifiedProps = {
					key,
					query: this.searchWidget.getValue(),
					searchResults: this.searchResultModel && this.searchResultModel.getUniqueResults(),
					rawResults: this.searchResultModel && this.searchResultModel.getRawResults(),
					showConfiguredOnly: this.viewState.showConfiguredOnly,
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
				.then((model: DefaultSettingsEditorModel) => {
					if (token.isCancellationRequested) {
						return void 0;
					}

					this.defaultSettingsEditorModel = model;
					this.onConfigUpdate();
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

	private onConfigUpdate(): TPromise<void> {
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
		} else {
			this.settingsTreeModel = this.instantiationService.createInstance(SettingsTreeModel, this.viewState, resolvedSettingsRoot);
			this.settingsTree.setInput(this.settingsTreeModel.root);

			this.tocTreeModel.settingsTreeRoot = this.settingsTreeModel.root as SettingsTreeGroupElement;
			if (this.tocTree.getInput()) {
				this.tocTree.refresh();
			} else {
				this.tocTree.setInput(this.tocTreeModel);
			}
		}

		return this.refreshTreeAndMaintainFocus();
	}

	private refreshTreeAndMaintainFocus(): TPromise<any> {
		// Sort of a hack to maintain focus on the focused control across a refresh
		const focusedRowItem = DOM.findParentWithClass(<HTMLElement>document.activeElement, 'setting-item');
		const focusedRowId = focusedRowItem && focusedRowItem.id;
		const selection = focusedRowId && document.activeElement.tagName.toLowerCase() === 'input' ?
			(<HTMLInputElement>document.activeElement).selectionStart :
			null;

		return this.settingsTree.refresh()
			.then(() => {
				if (focusedRowId) {
					this.focusEditControlForRow(focusedRowId, selection);
				}
			})
			.then(() => {
				return this.tocTree.refresh();
			});
	}

	private focusEditControlForRow(id: string, selection?: number): void {
		const rowSelector = `.setting-item#${id}`;
		const inputElementToFocus: HTMLElement = this.settingsTreeContainer.querySelector(`${rowSelector} input, ${rowSelector} select, ${rowSelector} a, ${rowSelector} .monaco-custom-checkbox`);
		if (inputElementToFocus) {
			inputElementToFocus.focus();
			if (typeof selection === 'number') {
				(<HTMLInputElement>inputElementToFocus).setSelectionRange(selection, selection);
			}
		}
	}

	private onSearchInputChanged(): void {
		const query = this.searchWidget.getValue().trim();
		this.delayedFilterLogging.cancel();
		this.triggerSearch(query).then(() => {
			if (query && this.searchResultModel) {
				this.delayedFilterLogging.trigger(() => this.reportFilteringUsed(query, this.searchResultModel.getUniqueResults()));
			}
		});
	}

	private triggerSearch(query: string): TPromise<void> {
		if (query) {
			return this.searchInProgress = TPromise.join([
				this.localSearchDelayer.trigger(() => this.localFilterPreferences(query)),
				this.remoteSearchThrottle.trigger(() => this.remoteSearchPreferences(query), 500)
			]).then(() => {
				this.searchInProgress = null;
			});
		} else {
			this.localSearchDelayer.cancel();
			this.remoteSearchThrottle.cancel();
			if (this.searchInProgress && this.searchInProgress.cancel) {
				this.searchInProgress.cancel();
			}

			this.searchResultModel = null;
			this.tocTreeModel.currentSearchModel = null;
			this.viewState.filterToCategory = null;
			this.tocTree.refresh();
			this.toggleSearchMode();
			this.settingsTree.setInput(this.settingsTreeModel.root);

			return TPromise.wrap(null);
		}
	}

	private expandAll(tree: ITree): void {
		const nav = tree.getNavigator();
		let cur;
		while (cur = nav.next()) {
			tree.expand(cur);
		}
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

	private localFilterPreferences(query: string): TPromise<void> {
		const localSearchProvider = this.preferencesSearchService.getLocalSearchProvider(query);
		return this.filterOrSearchPreferences(query, SearchResultIdx.Local, localSearchProvider);
	}

	private remoteSearchPreferences(query: string): TPromise<void> {
		const remoteSearchProvider = this.preferencesSearchService.getRemoteSearchProvider(query);
		return this.filterOrSearchPreferences(query, SearchResultIdx.Remote, remoteSearchProvider);
	}

	private filterOrSearchPreferences(query: string, type: SearchResultIdx, searchProvider: ISearchProvider): TPromise<void> {
		const filterPs: TPromise<ISearchResult>[] = [this._filterOrSearchPreferencesModel(query, this.defaultSettingsEditorModel, searchProvider)];

		let isCanceled = false;
		return new TPromise(resolve => {
			return TPromise.join(filterPs).then(results => {
				if (isCanceled) {
					// Handle cancellation like this because cancellation is lost inside the search provider due to async/await
					return null;
				}

				const [result] = results;
				if (!this.searchResultModel) {
					this.searchResultModel = this.instantiationService.createInstance(SearchResultModel, this.viewState);
					this.searchResultModel.setResult(type, result);
					this.tocTreeModel.currentSearchModel = this.searchResultModel;
					this.toggleSearchMode();
					this.settingsTree.setInput(this.searchResultModel);
				} else {
					this.searchResultModel.setResult(type, result);
				}

				this.tocTreeModel.update();
				resolve(this.refreshTreeAndMaintainFocus());
			});
		}, () => {
			isCanceled = true;
		});
	}

	private _filterOrSearchPreferencesModel(filter: string, model: ISettingsEditorModel, provider: ISearchProvider): TPromise<ISearchResult> {
		const searchP = provider ? provider.searchModel(model) : TPromise.wrap(null);
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
		const listHeight = dimension.height - (DOM.getDomNodePagePosition(this.headerContainer).height + 11 /*padding*/);
		this.settingsTreeContainer.style.height = `${listHeight}px`;
		this.settingsTree.layout(listHeight, 800);

		const selectedSetting = this.settingsTree.getSelection()[0];
		if (selectedSetting) {
			this.settingsTree.refresh(selectedSetting);
		}

		this.tocTreeContainer.style.height = `${listHeight}px`;
		this.tocTree.layout(listHeight, 175);
	}
}
