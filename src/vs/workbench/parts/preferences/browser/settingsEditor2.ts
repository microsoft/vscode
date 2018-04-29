/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { IAction } from 'vs/base/common/actions';
import * as arrays from 'vs/base/common/arrays';
import { Delayer, ThrottledDelayer } from 'vs/base/common/async';
import { Color } from 'vs/base/common/color';
import { getErrorMessage, isPromiseCanceledError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import { TPromise } from 'vs/base/common/winjs.base';
import 'vs/css!./media/settingsEditor2';
import { localize } from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IEditor } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { ILogService } from 'vs/platform/log/common/log';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler, attachInputBoxStyler, attachSelectBoxStyler } from 'vs/platform/theme/common/styler';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorOptions } from 'vs/workbench/common/editor';
import { SearchWidget, SettingsTarget, SettingsTargetsWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { IPreferencesService, ISearchResult, ISetting, ISettingsEditorModel } from 'vs/workbench/services/preferences/common/preferences';
import { SettingsEditor2Input } from 'vs/workbench/services/preferences/common/preferencesEditorInput';
import { DefaultSettingsEditorModel } from 'vs/workbench/services/preferences/common/preferencesModels';
import { IPreferencesSearchService, ISearchProvider } from '../common/preferences';

const SETTINGS_ENTRY_TEMPLATE_ID = 'settings.entry.template';
const SETTINGS_GROUP_ENTRY_TEMPLATE_ID = 'settings.group.template';
const BUTTON_ROW_ENTRY_TEMPLATE = 'settings.buttonRow.template';

const ALL_SETTINGS_BUTTON_ID = 'allSettings';

interface IListEntry {
	id: string;
	templateId: string;
}

interface ISettingItemEntry extends IListEntry {
	key: string;
	value: any;
	isConfigured: boolean;
	description: string;
	overriddenScopeList: string[];
	type?: string | string[];
	enum?: string[];
}

interface IGroupTitleEntry extends IListEntry {
	title: string;
}

interface IButtonRowEntry extends IListEntry {
	label: string;
}

enum SearchResultIdx {
	Local = 0,
	Remote = 1
}

const $ = DOM.$;


export const configuredItemBackground = registerColor('settings.configuredItemBackground', {
	dark: '#0d466c',
	light: '#c5e6ff',
	hc: '#0d466c'
}, localize('configuredItemBackground', "The background color for a configured setting."));

export const configuredItemForeground = registerColor('settings.configuredItemForeground', {
	dark: '#dddddd',
	light: '#6c6c6c',
	hc: '#dddddd'
}, localize('configuredItemForeground', "The foreground color for a configured setting."));

export class SettingsEditor2 extends BaseEditor {

	public static readonly ID: string = 'workbench.editor.settings2';

	private defaultSettingsEditorModel: DefaultSettingsEditorModel;

	private headerContainer: HTMLElement;
	private searchWidget: SearchWidget;
	private settingsTargetsWidget: SettingsTargetsWidget;

	private showConfiguredSettingsOnly = false;
	private showAllSettings = false;
	private showConfiguredSettingsOnlyCheckbox: HTMLInputElement;

	private settingsListContainer: HTMLElement;
	private settingsList: List<IListEntry>;

	private dimension: DOM.Dimension;
	private searchFocusContextKey: IContextKey<boolean>;

	private delayedModifyLogging: Delayer<void>;
	private delayedFilterLogging: Delayer<void>;
	private localSearchDelayer: Delayer<void>;
	private remoteSearchThrottle: ThrottledDelayer<void>;

	private currentLocalSearchProvider: ISearchProvider;
	private currentRemoteSearchProvider: ISearchProvider;

	private searchResultModel: SearchResultModel;
	private pendingSettingModifiedReport: { key: string, value: any };

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
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
		this.searchResultModel = new SearchResultModel();

		this._register(configurationService.onDidChangeConfiguration(() => this.renderEntries()));
	}

	createEditor(parent: HTMLElement): void {
		const prefsEditorElement = DOM.append(parent, $('div', { class: 'settings-editor' }));

		this.createHeader(prefsEditorElement);
		this.createBody(prefsEditorElement);
	}

	setInput(input: SettingsEditor2Input, options: EditorOptions): TPromise<void> {
		const oldInput = this.input;
		return super.setInput(input)
			.then(() => {
				if (!input.matches(oldInput)) {
					this.render();
				}
			});
	}

	clearInput(): void {
		super.clearInput();
	}

	layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;
		this.searchWidget.layout(dimension);

		this.layoutSettingsList();
		this.render();
	}

	focus(): void {
		this.searchWidget.focus();
	}

	getSecondaryActions(): IAction[] {
		return <IAction[]>[
		];
	}

	search(filter: string): void {
		this.searchWidget.focus();
	}

	clearSearchResults(): void {
		this.searchWidget.clear();
	}

	private createHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.settings-header'));

		const searchContainer = DOM.append(this.headerContainer, $('.search-container'));
		this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, searchContainer, {
			ariaLabel: localize('SearchSettings.AriaLabel', "Search settings"),
			placeholder: localize('SearchSettings.Placeholder', "Search settings"),
			focusKey: this.searchFocusContextKey
		}));
		this._register(this.searchWidget.onDidChange(() => this.onInputChanged()));

		const headerControlsContainer = DOM.append(this.headerContainer, $('.settings-header-controls'));
		const targetWidgetContainer = DOM.append(headerControlsContainer, $('.settings-target-container'));
		this.settingsTargetsWidget = this._register(this.instantiationService.createInstance(SettingsTargetsWidget, targetWidgetContainer));
		this.settingsTargetsWidget.settingsTarget = ConfigurationTarget.USER;
		this.settingsTargetsWidget.onDidTargetChange(e => this.renderEntries());

		this.createHeaderControls(headerControlsContainer);
	}

	private createHeaderControls(parent: HTMLElement): void {
		const headerControlsContainerRight = DOM.append(parent, $('.settings-header-controls-right'));

		this.showConfiguredSettingsOnlyCheckbox = DOM.append(headerControlsContainerRight, $('input#configured-only-checkbox'));
		this.showConfiguredSettingsOnlyCheckbox.type = 'checkbox';
		const showConfiguredSettingsOnlyLabel = <HTMLLabelElement>DOM.append(headerControlsContainerRight, $('label.configured-only-label'));
		showConfiguredSettingsOnlyLabel.textContent = localize('showOverriddenOnly', "Show overridden only");
		showConfiguredSettingsOnlyLabel.htmlFor = 'configured-only-checkbox';

		this._register(DOM.addDisposableListener(this.showConfiguredSettingsOnlyCheckbox, 'change', e => this.onShowConfiguredOnlyClicked()));

		const openSettingsButton = this._register(new Button(headerControlsContainerRight, { title: true, buttonBackground: null, buttonHoverBackground: null }));
		openSettingsButton.label = localize('openSettingsLabel', "Open settings.json");
		openSettingsButton.element.classList.add('open-settings-button');

		this._register(openSettingsButton.onDidClick(() => this.openSettingsFile()));
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
	}

	private createList(parent: HTMLElement): void {
		this.settingsListContainer = DOM.append(parent, $('.settings-list-container'));

		const settingItemRenderer = this.instantiationService.createInstance(SettingItemRenderer);
		this._register(settingItemRenderer.onDidChangeSetting(e => this.onDidChangeSetting(e.key, e.value)));
		this._register(settingItemRenderer.onDidOpenSettings(() => this.openSettingsFile()));

		const buttonItemRenderer = new ButtonRowRenderer();
		this._register(buttonItemRenderer.onDidClick(e => this.onShowAllSettingsClicked()));

		this.settingsList = this._register(this.instantiationService.createInstance(
			WorkbenchList,
			this.settingsListContainer,
			new SettingItemDelegate(),
			[settingItemRenderer, new GroupTitleRenderer(), buttonItemRenderer],
			{
				identityProvider: e => e.id,
				ariaLabel: localize('settingsListLabel', "Settings"),
				focusOnMouseDown: false,
				selectOnMouseDown: false,
				keyboardSupport: false,
				mouseSupport: false
			})
		) as WorkbenchList<IListEntry>;

		this.settingsList.style({ listHoverBackground: Color.transparent, listFocusOutline: Color.transparent });
	}

	private onShowAllSettingsClicked(): void {
		this.showAllSettings = !this.showAllSettings;
		this.render();
	}

	private onShowConfiguredOnlyClicked(): void {
		this.showConfiguredSettingsOnly = this.showConfiguredSettingsOnlyCheckbox.checked;
		this.render();
	}

	private onDidChangeSetting(key: string, value: any): void {
		// ConfigurationService displays the error if this fails.
		// Force a render afterwards because onDidConfigurationUpdate doesn't fire if the update doesn't result in an effective setting value change
		this.configurationService.updateValue(key, value, <ConfigurationTarget>this.settingsTargetsWidget.settingsTarget)
			.then(() => this.renderEntries());

		const reportModifiedProps = {
			key,
			query: this.searchWidget.getValue(),
			searchResults: this.searchResultModel.getUniqueResults(),
			rawResults: this.searchResultModel.getRawResults(),
			showConfiguredOnly: this.showConfiguredSettingsOnly,
			isReset: typeof value === 'undefined',
			settingsTarget: this.settingsTargetsWidget.settingsTarget as SettingsTarget
		};

		if (this.pendingSettingModifiedReport && key !== this.pendingSettingModifiedReport.key) {
			this.reportModifiedSetting(reportModifiedProps);
		}

		this.pendingSettingModifiedReport = { key, value };
		this.delayedModifyLogging.trigger(() => this.reportModifiedSetting(reportModifiedProps));
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

			const rawResults = this.searchResultModel.getRawResults();
			if (rawResults[SearchResultIdx.Remote]) {
				const _nlpIndex = arrays.firstIndex(rawResults[SearchResultIdx.Remote].filterMatches, m => m.setting.key === props.key);
				nlpIndex = _nlpIndex >= 0 ? _nlpIndex : undefined;
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
			"settingEditor.settingModified" : {
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
		this.telemetryService.publicLog('settingEditor.settingModified', data);
	}

	private render(): TPromise<any> {
		if (this.input) {
			return this.input.resolve()
				.then((model: DefaultSettingsEditorModel) => this.defaultSettingsEditorModel = model)
				.then(() => this.renderEntries());
		}
		return TPromise.as(null);
	}

	private onInputChanged(): void {
		const query = this.searchWidget.getValue().trim();
		this.delayedFilterLogging.cancel();
		this.triggerSearch(query).then(() => {
			if (query && this.searchResultModel.hasResults()) {
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

			this.searchResultModel.clear();
			this.renderEntries();
			return TPromise.wrap(null);
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
		this.telemetryService.publicLog('defaultSettings.filter', data);
	}

	private localFilterPreferences(query: string): TPromise<void> {
		this.currentLocalSearchProvider = this.preferencesSearchService.getLocalSearchProvider(query);
		return this.filterOrSearchPreferences(query, SearchResultIdx.Local, this.currentLocalSearchProvider);
	}

	private remoteSearchPreferences(query: string): TPromise<void> {
		this.currentRemoteSearchProvider = this.preferencesSearchService.getRemoteSearchProvider(query);
		return this.filterOrSearchPreferences(query, SearchResultIdx.Remote, this.currentRemoteSearchProvider);
	}

	private filterOrSearchPreferences(query: string, type: SearchResultIdx, searchProvider: ISearchProvider): TPromise<void> {
		const filterPs: TPromise<ISearchResult>[] = [this._filterOrSearchPreferencesModel(query, this.defaultSettingsEditorModel, searchProvider)];

		return TPromise.join(filterPs).then(results => {
			const [result] = results;
			this.searchResultModel.setResult(type, result);
			return this.render();
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
						"defaultSettings.searchError" : {
							"message": { "classification": "CallstackOrException", "purpose": "FeatureInsight" },
							"filter": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
						}
					*/
					const message = getErrorMessage(err).trim();
					if (message && message !== 'Error') {
						// "Error" = any generic network error
						this.telemetryService.publicLog('defaultSettings.searchError', { message, filter });
						this.logService.info('Setting search error: ' + message);
					}
					return null;
				}
			});
	}

	private getEntriesFromSearch(searchResults: ISearchResult[]): IListEntry[] {
		const entries: ISettingItemEntry[] = [];
		const seenSettings = new Set<string>();

		for (let result of searchResults) {
			if (!result) {
				continue;
			}

			for (let match of result.filterMatches) {
				if (!seenSettings.has(match.setting.key)) {
					const entry = this.settingToEntry(match.setting);
					if (!this.showConfiguredSettingsOnly || entry.isConfigured) {
						seenSettings.add(entry.key);
						entries.push(entry);
					}
				}
			}
		}

		return entries;
	}

	private renderEntries(): void {
		if (!this.defaultSettingsEditorModel) {
			return;
		}

		const focusedRowItem = DOM.findParentWithClass(<HTMLElement>document.activeElement, 'monaco-list-row');
		const focusedRowId = focusedRowItem && focusedRowItem.id;

		const entries = this.searchResultModel.hasResults() ?
			this.getEntriesFromSearch(this.searchResultModel.getUniqueResults()) :
			this.getEntriesFromModel();

		this.settingsList.splice(0, this.settingsList.length, entries);

		// Hack to restore the same focused element after editing.
		// TODO@roblou figure out the whole keyboard navigation story
		if (focusedRowId) {
			const rowSelector = `.monaco-list-row#${focusedRowId}`;
			const inputElementToFocus: HTMLElement = this.settingsListContainer.querySelector(`${rowSelector} input, ${rowSelector} select`);
			if (inputElementToFocus) {
				inputElementToFocus.focus();
			}
		}
	}

	private getEntriesFromModel(): IListEntry[] {
		const entries: IListEntry[] = [];
		for (let groupIdx = 0; groupIdx < this.defaultSettingsEditorModel.settingsGroups.length; groupIdx++) {
			if (groupIdx > 0 && !(this.showAllSettings)) {
				break;
			}

			const group = this.defaultSettingsEditorModel.settingsGroups[groupIdx];
			const groupEntries = [];
			for (const section of group.sections) {
				for (const setting of section.settings) {
					const entry = this.settingToEntry(setting);
					if (!this.showConfiguredSettingsOnly || entry.isConfigured) {
						groupEntries.push(entry);
					}
				}
			}

			if (groupEntries.length) {
				entries.push(<IGroupTitleEntry>{
					id: group.id,
					templateId: SETTINGS_GROUP_ENTRY_TEMPLATE_ID,
					title: group.title
				});

				entries.push(...groupEntries);
			}

			if (groupIdx === 0) {
				const showAllSettingsLabel = this.showAllSettings ?
					localize('showFewerSettingsLabel', "Show Fewer Settings") :
					localize('showAllSettingsLabel', "Show All Settings");
				entries.push(<IButtonRowEntry>{
					id: ALL_SETTINGS_BUTTON_ID,
					label: showAllSettingsLabel,
					templateId: BUTTON_ROW_ENTRY_TEMPLATE
				});
			}
		}

		return entries;
	}

	private settingToEntry(s: ISetting): ISettingItemEntry {
		const targetSelector = this.settingsTargetsWidget.settingsTarget === ConfigurationTarget.USER ? 'user' : 'workspace';
		const inspected = this.configurationService.inspect(s.key);
		const isConfigured = typeof inspected[targetSelector] !== 'undefined';
		const displayValue = isConfigured ? inspected[targetSelector] : inspected.default;
		const overriddenScopeList = [];
		if (targetSelector === 'user' && typeof inspected.workspace !== 'undefined') {
			overriddenScopeList.push('Workspace');
		}

		if (targetSelector === 'workspace' && typeof inspected.user !== 'undefined') {
			overriddenScopeList.push('User');
		}

		return <ISettingItemEntry>{
			id: s.key,
			key: s.key,
			value: displayValue,
			isConfigured,
			overriddenScopeList,
			description: s.description.join('\n'),
			enum: s.enum,
			type: s.type,
			templateId: SETTINGS_ENTRY_TEMPLATE_ID
		};
	}

	private layoutSettingsList(): void {
		const listHeight = this.dimension.height - (DOM.getDomNodePagePosition(this.headerContainer).height + 12 /*padding*/);
		this.settingsListContainer.style.height = `${listHeight}px`;
		this.settingsList.layout(listHeight);
	}
}

class SettingItemDelegate implements IDelegate<IListEntry> {

	getHeight(entry: IListEntry) {
		if (entry.templateId === SETTINGS_GROUP_ENTRY_TEMPLATE_ID) {
			return 60;
		}

		if (entry.templateId === SETTINGS_ENTRY_TEMPLATE_ID) {
			// TODO dynamic height
			return 75;
		}

		if (entry.templateId === BUTTON_ROW_ENTRY_TEMPLATE) {
			return 60;
		}

		return 0;
	}

	getTemplateId(element: IListEntry) {
		return element.templateId;
	}
}

interface ISettingItemTemplate {
	parent: HTMLElement;
	toDispose: IDisposable[];

	containerElement: HTMLElement;
	labelElement: HTMLElement;
	descriptionElement: HTMLElement;
	valueElement: HTMLElement;
	overridesElement: HTMLElement;
}

interface IGroupTitleTemplate {
	parent: HTMLElement;
	labelElement: HTMLElement;
}

interface IButtonRowTemplate {
	parent: HTMLElement;
	toDispose: IDisposable[];

	button: Button;
	entry?: IButtonRowEntry;
}

interface ISettingChangeEvent {
	key: string;
	value: any; // undefined => reset unconfigure
}

class SettingItemRenderer implements IRenderer<ISettingItemEntry, ISettingItemTemplate> {

	private readonly _onDidChangeSetting: Emitter<ISettingChangeEvent> = new Emitter<ISettingChangeEvent>();
	public readonly onDidChangeSetting: Event<ISettingChangeEvent> = this._onDidChangeSetting.event;

	private readonly _onDidOpenSettings: Emitter<void> = new Emitter<void>();
	public readonly onDidOpenSettings: Event<void> = this._onDidOpenSettings.event;

	get templateId(): string { return SETTINGS_ENTRY_TEMPLATE_ID; }

	constructor(
		@IContextViewService private contextViewService: IContextViewService,
		@IThemeService private themeService: IThemeService
	) { }

	renderTemplate(parent: HTMLElement): ISettingItemTemplate {
		DOM.addClass(parent, 'setting-item');

		const itemContainer = DOM.append(parent, $('.setting-item-container'));
		const leftElement = DOM.append(itemContainer, $('.setting-item-left'));
		const rightElement = DOM.append(itemContainer, $('.setting-item-right'));

		const titleElement = DOM.append(leftElement, $('.setting-item-title'));
		const labelElement = DOM.append(titleElement, $('span.setting-item-label'));
		const overridesElement = DOM.append(titleElement, $('span.setting-item-overrides'));
		const descriptionElement = DOM.append(leftElement, $('.setting-item-description'));

		const valueElement = DOM.append(rightElement, $('.setting-item-value'));

		return {
			parent: parent,
			toDispose: [],

			containerElement: itemContainer,
			labelElement,
			descriptionElement,
			valueElement,
			overridesElement
		};
	}

	renderElement(entry: ISettingItemEntry, index: number, template: ISettingItemTemplate): void {
		DOM.toggleClass(template.parent, 'odd', index % 2 === 1);

		template.labelElement.textContent = settingKeyToLabel(entry.key);
		template.labelElement.title = entry.key;
		template.descriptionElement.textContent = entry.description;

		DOM.toggleClass(template.parent, 'is-configured', entry.isConfigured);
		this.renderValue(entry, template);

		const resetButton = new Button(template.valueElement);
		resetButton.element.classList.add('setting-reset-button');
		attachButtonStyler(resetButton, this.themeService, {
			buttonBackground: Color.transparent.toString(),
			buttonHoverBackground: Color.transparent.toString()
		});
		template.toDispose.push(resetButton.onDidClick(e => {
			this._onDidChangeSetting.fire({ key: entry.key, value: undefined });
		}));
		template.toDispose.push(resetButton);

		const alsoConfiguredInLabel = localize('alsoConfiguredIn', "Also configured in:");
		template.overridesElement.textContent = entry.overriddenScopeList.length ? `(${alsoConfiguredInLabel} ${entry.overriddenScopeList.join(', ')})` :
			'';
	}

	private renderValue(entry: ISettingItemEntry, template: ISettingItemTemplate): void {
		const onChange = value => this._onDidChangeSetting.fire({ key: entry.key, value });
		template.valueElement.innerHTML = '';
		if (entry.type === 'string' && entry.enum) {
			this.renderEnum(entry, template, onChange);
		} else if (entry.type === 'boolean') {
			this.renderBool(entry, template, onChange);
		} else if (entry.type === 'string') {
			this.renderText(entry, template, onChange);
		} else if (entry.type === 'number') {
			this.renderText(entry, template, value => onChange(parseInt(value)));
		} else {
			this.renderEditInSettingsJson(entry, template);
		}
	}

	private renderBool(entry: ISettingItemEntry, template: ISettingItemTemplate, onChange: (value: boolean) => void): void {
		const checkboxElement = <HTMLInputElement>DOM.append(template.valueElement, $('input.setting-value-checkbox.setting-value-input'));
		checkboxElement.type = 'checkbox';
		checkboxElement.checked = entry.value;

		template.toDispose.push(DOM.addDisposableListener(checkboxElement, 'change', e => onChange(checkboxElement.checked)));
	}

	private renderEnum(entry: ISettingItemEntry, template: ISettingItemTemplate, onChange: (value: string) => void): void {
		const idx = entry.enum.indexOf(entry.value);
		const selectBox = new SelectBox(entry.enum, idx, this.contextViewService);
		template.toDispose.push(selectBox);
		template.toDispose.push(attachSelectBoxStyler(selectBox, this.themeService, {
			selectBackground: entry.isConfigured ? configuredItemBackground : undefined,
			selectForeground: entry.isConfigured ? configuredItemForeground : undefined
		}));
		selectBox.render(template.valueElement);

		template.toDispose.push(
			selectBox.onDidSelect(e => onChange(entry.enum[e.index])));
	}

	private renderText(entry: ISettingItemEntry, template: ISettingItemTemplate, onChange: (value: string) => void): void {
		const inputBox = new InputBox(template.valueElement, this.contextViewService);
		template.toDispose.push(attachInputBoxStyler(inputBox, this.themeService, {
			inputBackground: entry.isConfigured ? configuredItemBackground : undefined,
			inputForeground: entry.isConfigured ? configuredItemForeground : undefined
		}));
		template.toDispose.push(inputBox);
		inputBox.value = entry.value;

		template.toDispose.push(
			inputBox.onDidChange(e => onChange(e)));
	}

	private renderEditInSettingsJson(entry: ISettingItemEntry, template: ISettingItemTemplate): void {
		const openSettingsButton = new Button(template.valueElement, { title: true, buttonBackground: null, buttonHoverBackground: null });
		openSettingsButton.onDidClick(() => this._onDidOpenSettings.fire());
		openSettingsButton.label = localize('editInSettingsJson', "Edit in settings.json");
		openSettingsButton.element.classList.add('edit-in-settings-button');
		template.toDispose.push(openSettingsButton);
	}

	disposeTemplate(template: ISettingItemTemplate): void {
		dispose(template.toDispose);
	}
}

class GroupTitleRenderer implements IRenderer<IGroupTitleEntry, IGroupTitleTemplate> {

	get templateId(): string { return SETTINGS_GROUP_ENTRY_TEMPLATE_ID; }

	renderTemplate(parent: HTMLElement): IGroupTitleTemplate {
		DOM.addClass(parent, 'group-title');

		const labelElement = DOM.append(parent, $('h2.group-title-label'));
		return {
			parent: parent,
			labelElement
		};
	}

	renderElement(entry: IGroupTitleEntry, index: number, template: IGroupTitleTemplate): void {
		template.labelElement.textContent = entry.title;
	}

	disposeTemplate(template: IGroupTitleTemplate): void {
	}
}

class ButtonRowRenderer implements IRenderer<IButtonRowEntry, IButtonRowTemplate> {

	private readonly _onDidClick: Emitter<string> = new Emitter<string>();
	public readonly onDidClick: Event<string> = this._onDidClick.event;

	get templateId(): string { return BUTTON_ROW_ENTRY_TEMPLATE; }

	renderTemplate(parent: HTMLElement): IButtonRowTemplate {
		DOM.addClass(parent, 'all-settings');

		const buttonElement = DOM.append(parent, $('.all-settings-button'));

		const button = new Button(buttonElement);
		const toDispose: IDisposable[] = [button];

		const template: IButtonRowTemplate = {
			parent: parent,
			toDispose,

			button
		};
		toDispose.push(button.onDidClick(e => this._onDidClick.fire(template.entry && template.entry.label)));

		return template;
	}

	renderElement(entry: IButtonRowEntry, index: number, template: IButtonRowTemplate): void {
		template.button.label = entry.label;
		template.entry = entry;
	}

	disposeTemplate(template: IButtonRowTemplate): void {
		dispose(template.toDispose);
	}
}

function settingKeyToLabel(key: string): string {
	const lastDotIdx = key.lastIndexOf('.');
	if (lastDotIdx >= 0) {
		key = key.substr(0, lastDotIdx) + ': ' + key.substr(lastDotIdx + 1);
	}

	return key
		.replace(/\.([a-z])/, (match, p1) => `.${p1.toUpperCase()}`)
		.replace(/([a-z])([A-Z])/g, '$1 $2') // fooBar => foo Bar
		.replace(/^[a-z]/g, match => match.toUpperCase()) // foo => Foo
		.replace(/ [a-z]/g, match => match.toUpperCase()); // Foo bar => Foo Bar
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const configuredItemBackgroundColor = theme.getColor(configuredItemBackground);
	if (configuredItemBackgroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-list-container .monaco-list-row.is-configured .setting-value-checkbox::after { background-color: ${configuredItemBackgroundColor}; }`);
	}
});

class SearchResultModel {
	private rawSearchResults: ISearchResult[];
	private cachedUniqueSearchResults: ISearchResult[];

	getUniqueResults(): ISearchResult[] {
		if (this.cachedUniqueSearchResults) {
			return this.cachedUniqueSearchResults;
		}

		if (!this.rawSearchResults) {
			return null;
		}

		const localMatchKeys = new Set();
		const localResult = objects.deepClone(this.rawSearchResults[SearchResultIdx.Local]);
		if (localResult) {
			localResult.filterMatches.forEach(m => localMatchKeys.add(m.setting.key));
		}

		const remoteResult = objects.deepClone(this.rawSearchResults[SearchResultIdx.Remote]);
		if (remoteResult) {
			remoteResult.filterMatches = remoteResult.filterMatches.filter(m => !localMatchKeys.has(m.setting.key));
		}

		this.cachedUniqueSearchResults = [localResult, remoteResult];
		return this.cachedUniqueSearchResults;
	}

	getRawResults(): ISearchResult[] {
		return this.rawSearchResults;
	}

	hasResults(): boolean {
		return !!this.rawSearchResults;
	}

	clear(): void {
		this.cachedUniqueSearchResults = null;
		this.rawSearchResults = null;
	}

	setResult(type: SearchResultIdx, result: ISearchResult): void {
		this.cachedUniqueSearchResults = null;
		this.rawSearchResults = this.rawSearchResults || [];
		this.rawSearchResults[type] = result;
	}
}
