/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import * as arrays from 'vs/base/common/arrays';
import { Delayer, ThrottledDelayer } from 'vs/base/common/async';
import { Color } from 'vs/base/common/color';
import { getErrorMessage, isPromiseCanceledError } from 'vs/base/common/errors';
import { KeyCode } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import 'vs/css!./media/settingsEditor2';
import { localize } from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { ILogService } from 'vs/platform/log/common/log';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { attachButtonStyler, attachStyler } from 'vs/platform/theme/common/styler';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorOptions, IEditor } from 'vs/workbench/common/editor';
import { SearchWidget, SettingsTarget, SettingsTargetsWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { ISettingsEditorViewState, SearchResultIdx, SearchResultModel, SettingsAccessibilityProvider, SettingsDataSource, SettingsRenderer, SettingsTreeController, SettingsTreeFilter, TreeElement } from 'vs/workbench/parts/preferences/browser/settingsTree';
import { IPreferencesSearchService, ISearchProvider } from 'vs/workbench/parts/preferences/common/preferences';
import { IPreferencesService, ISearchResult, ISettingsEditorModel } from 'vs/workbench/services/preferences/common/preferences';
import { SettingsEditor2Input } from 'vs/workbench/services/preferences/common/preferencesEditorInput';
import { DefaultSettingsEditorModel } from 'vs/workbench/services/preferences/common/preferencesModels';
import { CancellationToken } from 'vs/base/common/cancellation';

const $ = DOM.$;

export class SettingsEditor2 extends BaseEditor {

	public static readonly ID: string = 'workbench.editor.settings2';

	private defaultSettingsEditorModel: DefaultSettingsEditorModel;

	private headerContainer: HTMLElement;
	private searchWidget: SearchWidget;
	private settingsTargetsWidget: SettingsTargetsWidget;

	private showConfiguredSettingsOnlyCheckbox: HTMLInputElement;

	private settingsTreeContainer: HTMLElement;
	private settingsTree: WorkbenchTree;
	private treeDataSource: SettingsDataSource;

	private delayedModifyLogging: Delayer<void>;
	private delayedFilterLogging: Delayer<void>;
	private localSearchDelayer: Delayer<void>;
	private remoteSearchThrottle: ThrottledDelayer<void>;

	private pendingSettingModifiedReport: { key: string, value: any };

	private selectedElement: TreeElement;

	private viewState: ISettingsEditorViewState;
	private searchResultModel: SearchResultModel;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IThemeService themeService: IThemeService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPreferencesSearchService private preferencesSearchService: IPreferencesSearchService,
		@ILogService private logService: ILogService
	) {
		super(SettingsEditor2.ID, telemetryService, themeService);
		this.delayedModifyLogging = new Delayer<void>(1000);
		this.delayedFilterLogging = new Delayer<void>(1000);
		this.localSearchDelayer = new Delayer(100);
		this.remoteSearchThrottle = new ThrottledDelayer(200);
		this.viewState = { settingsTarget: ConfigurationTarget.USER };

		this._register(configurationService.onDidChangeConfiguration(() => this.settingsTree.refresh()));
	}

	createEditor(parent: HTMLElement): void {
		const prefsEditorElement = DOM.append(parent, $('div', { class: 'settings-editor' }));

		this.createHeader(prefsEditorElement);
		this.createBody(prefsEditorElement);
	}

	setInput(input: SettingsEditor2Input, options: EditorOptions, token: CancellationToken): Thenable<void> {
		return super.setInput(input, options, token)
			.then(() => {
				this.render(token);
			});
	}

	layout(dimension: DOM.Dimension): void {
		this.searchWidget.layout(dimension);
		this.layoutSettingsList(dimension);
	}

	focus(): void {
		this.searchWidget.focus();
	}

	private createHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.settings-header'));

		const previewHeader = DOM.append(this.headerContainer, $('.settings-preview-header'));

		const previewAlert = DOM.append(previewHeader, $('span.settings-preview-warning'));
		previewAlert.textContent = localize('previewWarning', "Preview");

		const previewTextLabel = DOM.append(previewHeader, $('span.settings-preview-label'));
		previewTextLabel.textContent = localize('previewLabel', "This is a preview of our new settings editor. You can also ");
		const openSettingsButton = this._register(new Button(previewHeader, { title: true, buttonBackground: null, buttonHoverBackground: null }));
		this._register(attachButtonStyler(openSettingsButton, this.themeService, {
			buttonBackground: Color.transparent.toString(),
			buttonHoverBackground: Color.transparent.toString(),
			buttonForeground: 'foreground'
		}));
		openSettingsButton.label = localize('openSettingsLabel', "open the original editor.");
		openSettingsButton.element.classList.add('open-settings-button');

		this._register(openSettingsButton.onDidClick(() => this.openSettingsFile()));

		const searchContainer = DOM.append(this.headerContainer, $('.search-container'));
		this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, searchContainer, {
			ariaLabel: localize('SearchSettings.AriaLabel', "Search settings"),
			placeholder: localize('SearchSettings.Placeholder', "Search settings")
		}));
		this._register(this.searchWidget.onDidChange(() => this.onSearchInputChanged()));
		this._register(DOM.addStandardDisposableListener(this.searchWidget.domNode, 'keydown', e => {
			if (e.keyCode === KeyCode.DownArrow) {
				this.settingsTree.focusFirst();
				this.settingsTree.domFocus();
			}
		}));

		const headerControlsContainer = DOM.append(this.headerContainer, $('.settings-header-controls'));
		const targetWidgetContainer = DOM.append(headerControlsContainer, $('.settings-target-container'));
		this.settingsTargetsWidget = this._register(this.instantiationService.createInstance(SettingsTargetsWidget, targetWidgetContainer));
		this.settingsTargetsWidget.settingsTarget = ConfigurationTarget.USER;
		this.settingsTargetsWidget.onDidTargetChange(() => {
			this.viewState.settingsTarget = this.settingsTargetsWidget.settingsTarget;
			this.settingsTree.refresh();
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

		this.createList(bodyContainer);
		this.createFeedbackButton(bodyContainer);
	}

	private createList(parent: HTMLElement): void {
		this.settingsTreeContainer = DOM.append(parent, $('.settings-tree-container'));

		this.treeDataSource = this.instantiationService.createInstance(SettingsDataSource, this.viewState);
		const renderer = this.instantiationService.createInstance(SettingsRenderer, this.viewState, this.settingsTreeContainer);
		this._register(renderer.onDidChangeSetting(e => this.onDidChangeSetting(e.key, e.value)));
		this._register(renderer.onDidClickButton(e => this.onDidClickShowAllSettings()));

		this.settingsTree = this.instantiationService.createInstance(WorkbenchTree, this.settingsTreeContainer,
			{
				dataSource: this.treeDataSource,
				renderer: renderer,
				controller: this.instantiationService.createInstance(SettingsTreeController),
				accessibilityProvider: this.instantiationService.createInstance(SettingsAccessibilityProvider),
				filter: this.instantiationService.createInstance(SettingsTreeFilter, this.viewState)
			},
			{
				ariaLabel: localize('treeAriaLabel', "Settings"),
				showLoading: false,
				indentPixels: 0,
				twistiePixels: 15,
			});

		this._register(registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
			const activeListBackground = theme.getColor('list.activeSelectionBackground');
			if (activeListBackground) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .monaco-tree.focused .monaco-tree-row.focused .content::before { background-color: ${activeListBackground}; }`);
			}

			const inactiveListBackground = theme.getColor('list.inactiveSelectionBackground');
			if (inactiveListBackground) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .monaco-tree .monaco-tree-row.focused .content::before { background-color: ${inactiveListBackground}; }`);
			}
		}));

		attachStyler(this.themeService, {
			listActiveSelectionBackground: null,
			listActiveSelectionForeground: null,
			listFocusAndSelectionBackground: null,
			listFocusAndSelectionForeground: null,
			listFocusBackground: null,
			listFocusForeground: null,
			listHoverForeground: null,
			listHoverBackground: null,
			listInactiveSelectionBackground: null,
			listInactiveSelectionForeground: null
		}, colors => {
			this.settingsTree.style(colors);
		});

		this.settingsTree.onDidChangeFocus(e => {
			this.settingsTree.setSelection([e.focus]);
			if (this.selectedElement) {
				this.settingsTree.refresh(this.selectedElement);
			}

			if (e.focus) {
				this.settingsTree.refresh(e.focus);
			}

			this.selectedElement = e.focus;
		});
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
		this.refreshTree();
	}

	private onDidChangeSetting(key: string, value: any): void {
		// ConfigurationService displays the error if this fails.
		// Force a render afterwards because onDidConfigurationUpdate doesn't fire if the update doesn't result in an effective setting value change
		this.configurationService.updateValue(key, value, <ConfigurationTarget>this.settingsTargetsWidget.settingsTarget)
			.then(() => this.refreshTree())
			.then(() => this.settingsTree.domFocus());

		const reportModifiedProps = {
			key,
			query: this.searchWidget.getValue(),
			searchResults: this.searchResultModel && this.searchResultModel.getUniqueResults(),
			rawResults: this.searchResultModel && this.searchResultModel.getRawResults(),
			showConfiguredOnly: this.viewState.showConfiguredOnly,
			isReset: typeof value === 'undefined',
			settingsTarget: this.settingsTargetsWidget.settingsTarget as SettingsTarget
		};

		if (this.pendingSettingModifiedReport && key !== this.pendingSettingModifiedReport.key) {
			this.reportModifiedSetting(reportModifiedProps);
		}

		this.pendingSettingModifiedReport = { key, value };
		this.delayedModifyLogging.trigger(() => this.reportModifiedSetting(reportModifiedProps));
	}

	private onDidClickShowAllSettings(): void {
		this.viewState.showAllSettings = !this.viewState.showAllSettings;
		this.refreshTree();
	}

	private reportModifiedSetting(props: { key: string, query: string, searchResults: ISearchResult[], rawResults: ISearchResult[], showConfiguredOnly: boolean, isReset: boolean, settingsTarget: SettingsTarget }): void {
		this.pendingSettingModifiedReport = null;

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
					if (!this.settingsTree.getInput()) {
						this.settingsTree.setInput(this.defaultSettingsEditorModel);
						this.expandCommonlyUsedSettings();
					}
				});
		}
		return TPromise.as(null);
	}

	private refreshTree(): TPromise<any> {
		return this.settingsTree.refresh();
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
			return TPromise.join([
				this.localSearchDelayer.trigger(() => this.localFilterPreferences(query)),
				this.remoteSearchThrottle.trigger(() => this.remoteSearchPreferences(query), 500)
			]) as TPromise;
		} else {
			// When clearing the input, update immediately to clear it
			this.localSearchDelayer.cancel();
			this.remoteSearchThrottle.cancel();

			this.searchResultModel = null;
			this.settingsTree.setInput(this.defaultSettingsEditorModel);
			this.expandCommonlyUsedSettings();

			return TPromise.wrap(null);
		}
	}

	private expandCommonlyUsedSettings(): void {
		const commonlyUsedGroup = this.defaultSettingsEditorModel.settingsGroups[0];
		this.settingsTree.expand(this.treeDataSource.getGroupElement(commonlyUsedGroup, 0));
	}

	private reportFilteringUsed(query: string, results: ISearchResult[]): void {
		const nlpResult = results[SearchResultIdx.Remote];
		const nlpMetadata = nlpResult && nlpResult.metadata;

		const durations = {};
		durations['nlpResult'] = nlpMetadata && nlpMetadata.duration;

		// Count unique results
		const counts = {};
		const filterResult = results[SearchResultIdx.Local];
		counts['filterResult'] = filterResult.filterMatches.length;
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

		return TPromise.join(filterPs).then(results => {
			const [result] = results;
			if (!this.searchResultModel) {
				this.searchResultModel = new SearchResultModel();
				this.settingsTree.setInput(this.searchResultModel);
			}

			this.searchResultModel.setResult(type, result);
			return this.refreshTree();
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

	private layoutSettingsList(dimension: DOM.Dimension): void {
		const listHeight = dimension.height - (DOM.getDomNodePagePosition(this.headerContainer).height + 12 /*padding*/);
		this.settingsTreeContainer.style.height = `${listHeight}px`;
		this.settingsTree.layout(listHeight, 800);
	}
}