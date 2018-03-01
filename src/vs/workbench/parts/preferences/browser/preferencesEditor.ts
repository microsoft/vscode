/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import * as strings from 'vs/base/common/strings';
import { onUnexpectedError, isPromiseCanceledError, getErrorMessage } from 'vs/base/common/errors';
import * as DOM from 'vs/base/browser/dom';
import { Delayer, ThrottledDelayer } from 'vs/base/common/async';
import * as arrays from 'vs/base/common/arrays';
import { Dimension, Builder } from 'vs/base/browser/builder';
import { ArrayNavigator } from 'vs/base/common/iterator';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { SideBySideEditorInput, EditorOptions, EditorInput, PREFERENCES_EDITOR_ID } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { IEditorControl, Position, Verbosity } from 'vs/platform/editor/common/editor';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import {
	IPreferencesService, ISettingsGroup, ISetting, IFilterResult, IPreferencesSearchService,
	CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_SEARCH_FOCUS, SETTINGS_EDITOR_COMMAND_SEARCH, SETTINGS_EDITOR_COMMAND_FOCUS_FILE, ISettingsEditorModel, SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, SETTINGS_EDITOR_COMMAND_FOCUS_NEXT_SETTING, SETTINGS_EDITOR_COMMAND_FOCUS_PREVIOUS_SETTING, ISearchProvider, ISearchResult, SETTINGS_EDITOR_COMMAND_EDIT_FOCUSED_SETTING
} from 'vs/workbench/parts/preferences/common/preferences';
import { SettingsEditorModel, DefaultSettingsEditorModel } from 'vs/workbench/parts/preferences/common/preferencesModels';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { SearchWidget, SettingsTargetsWidget, SettingsTarget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { ContextKeyExpr, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { registerEditorContribution, Command, IEditorContributionCtor } from 'vs/editor/browser/editorExtensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { VSash } from 'vs/base/browser/ui/sash/sash';
import { Widget } from 'vs/base/browser/ui/widget';
import { IPreferencesRenderer, DefaultSettingsRenderer, UserSettingsRenderer, WorkspaceSettingsRenderer, FolderSettingsRenderer } from 'vs/workbench/parts/preferences/browser/preferencesRenderers';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { FoldingController } from 'vs/editor/contrib/folding/folding';
import { FindController } from 'vs/editor/contrib/find/findController';
import { SelectionHighlighter } from 'vs/editor/contrib/multicursor/multicursor';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { attachStylerCallback } from 'vs/platform/theme/common/styler';
import { scrollbarShadow } from 'vs/platform/theme/common/colorRegistry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import Event, { Emitter } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import { MessageController } from 'vs/editor/contrib/message/messageController';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IStringDictionary } from 'vs/base/common/collections';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ILogService } from 'vs/platform/log/common/log';

export class PreferencesEditorInput extends SideBySideEditorInput {
	public static readonly ID: string = 'workbench.editorinputs.preferencesEditorInput';

	getTypeId(): string {
		return PreferencesEditorInput.ID;
	}

	public supportsSplitEditor(): boolean {
		return true;
	}

	public getTitle(verbosity: Verbosity): string {
		return this.master.getTitle(verbosity);
	}
}

export class DefaultPreferencesEditorInput extends ResourceEditorInput {
	public static readonly ID = 'workbench.editorinputs.defaultpreferences';
	constructor(defaultSettingsResource: URI,
		@ITextModelService textModelResolverService: ITextModelService,
		@IHashService hashService: IHashService
	) {
		super(nls.localize('settingsEditorName', "Default Settings"), '', defaultSettingsResource, textModelResolverService, hashService);
	}

	getTypeId(): string {
		return DefaultPreferencesEditorInput.ID;
	}

	matches(other: any): boolean {
		if (other instanceof DefaultPreferencesEditorInput) {
			return true;
		}
		if (!super.matches(other)) {
			return false;
		}
		return true;
	}
}

export class PreferencesEditor extends BaseEditor {

	public static readonly ID: string = PREFERENCES_EDITOR_ID;

	private defaultSettingsEditorContextKey: IContextKey<boolean>;
	private focusSettingsContextKey: IContextKey<boolean>;
	private headerContainer: HTMLElement;
	private searchWidget: SearchWidget;
	private sideBySidePreferencesWidget: SideBySidePreferencesWidget;
	private preferencesRenderers: PreferencesRenderersController;

	private delayedFilterLogging: Delayer<void>;
	private localSearchDelayer: Delayer<void>;
	private remoteSearchThrottle: ThrottledDelayer<void>;
	private _lastReportedFilter: string;

	private lastFocusedWidget: SearchWidget | SideBySidePreferencesWidget = null;

	constructor(
		@IPreferencesService private preferencesService: IPreferencesService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IProgressService private progressService: IProgressService
	) {
		super(PreferencesEditor.ID, telemetryService, themeService);
		this.defaultSettingsEditorContextKey = CONTEXT_SETTINGS_EDITOR.bindTo(this.contextKeyService);
		this.focusSettingsContextKey = CONTEXT_SETTINGS_SEARCH_FOCUS.bindTo(this.contextKeyService);
		this.delayedFilterLogging = new Delayer<void>(1000);
		this.localSearchDelayer = new Delayer(100);
		this.remoteSearchThrottle = new ThrottledDelayer(200);
	}

	public createEditor(parent: Builder): void {
		const parentElement = parent.getHTMLElement();
		DOM.addClass(parentElement, 'preferences-editor');

		this.headerContainer = DOM.append(parentElement, DOM.$('.preferences-header'));

		this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, this.headerContainer, {
			ariaLabel: nls.localize('SearchSettingsWidget.AriaLabel', "Search settings"),
			placeholder: nls.localize('SearchSettingsWidget.Placeholder', "Search Settings"),
			focusKey: this.focusSettingsContextKey,
			showResultCount: true
		}));
		this._register(this.searchWidget.onDidChange(value => this.onInputChanged()));
		this._register(this.searchWidget.onFocus(() => this.lastFocusedWidget = this.searchWidget));
		this.lastFocusedWidget = this.searchWidget;

		const editorsContainer = DOM.append(parentElement, DOM.$('.preferences-editors-container'));
		this.sideBySidePreferencesWidget = this._register(this.instantiationService.createInstance(SideBySidePreferencesWidget, editorsContainer));
		this._register(this.sideBySidePreferencesWidget.onFocus(() => this.lastFocusedWidget = this.sideBySidePreferencesWidget));
		this._register(this.sideBySidePreferencesWidget.onDidSettingsTargetChange(target => this.switchSettings(target)));

		this.preferencesRenderers = this._register(this.instantiationService.createInstance(PreferencesRenderersController));

		this._register(this.preferencesRenderers.onDidFilterResultsCountChange(count => this.showSearchResultsMessage(count)));
	}

	public clearSearchResults(): void {
		if (this.searchWidget) {
			this.searchWidget.clear();
		}
	}

	public focusNextResult(): void {
		if (this.preferencesRenderers) {
			this.preferencesRenderers.focusNextPreference(true);
		}
	}

	public focusPreviousResult(): void {
		if (this.preferencesRenderers) {
			this.preferencesRenderers.focusNextPreference(false);
		}
	}

	public editFocusedPreference(): void {
		this.preferencesRenderers.editFocusedPreference();
	}

	public setInput(newInput: PreferencesEditorInput, options?: EditorOptions): TPromise<void> {
		this.defaultSettingsEditorContextKey.set(true);
		const oldInput = <PreferencesEditorInput>this.input;
		return super.setInput(newInput, options).then(() => this.updateInput(oldInput, newInput, options));
	}

	public layout(dimension: Dimension): void {
		DOM.toggleClass(this.headerContainer, 'vertical-layout', dimension.width < 700);
		this.searchWidget.layout(dimension);
		const headerHeight = DOM.getTotalHeight(this.headerContainer);
		this.sideBySidePreferencesWidget.layout(new Dimension(dimension.width, dimension.height - headerHeight));
	}

	public getControl(): IEditorControl {
		return this.sideBySidePreferencesWidget.getControl();
	}

	public focus(): void {
		if (this.lastFocusedWidget) {
			this.lastFocusedWidget.focus();
		}
	}

	public focusSearch(filter?: string): void {
		if (filter) {
			this.searchWidget.setValue(filter);
		}

		this.searchWidget.focus();
	}

	public focusSettingsFileEditor(): void {
		if (this.sideBySidePreferencesWidget) {
			this.sideBySidePreferencesWidget.focus();
		}
	}

	public clearInput(): void {
		this.defaultSettingsEditorContextKey.set(false);
		this.sideBySidePreferencesWidget.clearInput();
		this.preferencesRenderers.onHidden();
		super.clearInput();
	}

	protected setEditorVisible(visible: boolean, position: Position): void {
		this.sideBySidePreferencesWidget.setEditorVisible(visible, position);
		super.setEditorVisible(visible, position);
	}

	public changePosition(position: Position): void {
		this.sideBySidePreferencesWidget.changePosition(position);
		super.changePosition(position);
	}

	private updateInput(oldInput: PreferencesEditorInput, newInput: PreferencesEditorInput, options?: EditorOptions): TPromise<void> {
		return this.sideBySidePreferencesWidget.setInput(<DefaultPreferencesEditorInput>newInput.details, <EditorInput>newInput.master, options).then(({ defaultPreferencesRenderer, editablePreferencesRenderer }) => {
			this.preferencesRenderers.defaultPreferencesRenderer = defaultPreferencesRenderer;
			this.preferencesRenderers.editablePreferencesRenderer = editablePreferencesRenderer;
			this.onInputChanged();
		});
	}

	private onInputChanged(): void {
		const query = this.searchWidget.getValue().trim();
		this.delayedFilterLogging.cancel();
		this.triggerSearch(query)
			.then(() => {
				const result = this.preferencesRenderers.lastFilterResult;
				if (result) {
					this.delayedFilterLogging.trigger(() => this.reportFilteringUsed(
						query,
						this.preferencesRenderers.lastFilterResult));
				}
			});
	}

	private triggerSearch(query: string): TPromise<void> {
		if (query) {
			return TPromise.join([
				this.localSearchDelayer.trigger(() => this.preferencesRenderers.localFilterPreferences(query)),
				this.remoteSearchThrottle.trigger(() => this.progressService.showWhile(this.preferencesRenderers.remoteSearchPreferences(query), 500))
			]) as TPromise;
		} else {
			// When clearing the input, update immediately to clear it
			this.localSearchDelayer.cancel();
			this.preferencesRenderers.localFilterPreferences(query);

			this.remoteSearchThrottle.cancel();
			return this.preferencesRenderers.remoteSearchPreferences(query);
		}
	}

	private switchSettings(target: SettingsTarget): void {
		// Focus the editor if this editor is not active editor
		if (this.editorService.getActiveEditor() !== this) {
			this.focus();
		}
		const promise = this.input && this.input.isDirty() ? this.input.save() : TPromise.as(true);
		promise.done(value => {
			if (target === ConfigurationTarget.USER) {
				this.preferencesService.switchSettings(ConfigurationTarget.USER, this.preferencesService.userSettingsResource);
			} else if (target === ConfigurationTarget.WORKSPACE) {
				this.preferencesService.switchSettings(ConfigurationTarget.WORKSPACE, this.preferencesService.workspaceSettingsResource);
			} else if (target instanceof URI) {
				this.preferencesService.switchSettings(ConfigurationTarget.WORKSPACE_FOLDER, target);
			}
		});
	}

	private showSearchResultsMessage(count: IPreferencesCount): void {
		const countValue = count.count;
		if (count.target) {
			this.sideBySidePreferencesWidget.setResultCount(count.target, count.count);
		} else if (this.searchWidget.getValue()) {
			if (countValue === 0) {
				this.searchWidget.showMessage(nls.localize('noSettingsFound', "No Results"), countValue);
			} else if (countValue === 1) {
				this.searchWidget.showMessage(nls.localize('oneSettingFound', "1 Setting Found"), countValue);
			} else {
				this.searchWidget.showMessage(nls.localize('settingsFound', "{0} Settings Found", countValue), countValue);
			}
		} else {
			this.searchWidget.showMessage(nls.localize('totalSettingsMessage', "Total {0} Settings", countValue), countValue);
		}
	}

	private _countById(settingsGroups: ISettingsGroup[]): IStringDictionary<number> {
		const result = {};

		for (const group of settingsGroups) {
			let i = 0;
			for (const section of group.sections) {
				i += section.settings.length;
			}

			result[group.id] = i;
		}

		return result;
	}

	private reportFilteringUsed(filter: string, filterResult: IFilterResult): void {
		if (filter && filter !== this._lastReportedFilter) {
			const metadata = filterResult && filterResult.metadata;
			const counts = filterResult && this._countById(filterResult.filteredGroups);

			let durations: any;
			if (metadata) {
				durations = Object.create(null);
				Object.keys(metadata).forEach(key => durations[key] = metadata[key].duration);
			}

			let data = {
				filter,
				durations,
				counts,
				requestCount: metadata && metadata['nlpResult'] && metadata['nlpResult'].requestCount
			};

			/* __GDPR__
				"defaultSettings.filter" : {
					"filter": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"durations" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"counts" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"requestCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryService.publicLog('defaultSettings.filter', data);
			this._lastReportedFilter = filter;
		}
	}
}

class SettingsNavigator extends ArrayNavigator<ISetting> {

	public next(): ISetting {
		return super.next() || super.first();
	}

	public previous(): ISetting {
		return super.previous() || super.last();
	}

	public reset(): void {
		this.index = this.start - 1;
	}
}

interface IPreferencesCount {
	target?: SettingsTarget;
	count: number;
}

class PreferencesRenderersController extends Disposable {

	private _defaultPreferencesRenderer: IPreferencesRenderer<ISetting>;
	private _defaultPreferencesRendererDisposables: IDisposable[] = [];

	private _editablePreferencesRenderer: IPreferencesRenderer<ISetting>;
	private _editablePreferencesRendererDisposables: IDisposable[] = [];

	private _settingsNavigator: SettingsNavigator;
	private _remoteFilterInProgress: TPromise<any>;
	private _prefsModelsForSearch = new Map<string, ISettingsEditorModel>();

	private _currentLocalSearchProvider: ISearchProvider;
	private _currentRemoteSearchProvider: ISearchProvider;
	private _lastQuery: string;
	private _lastFilterResult: IFilterResult;

	private _onDidFilterResultsCountChange: Emitter<IPreferencesCount> = this._register(new Emitter<IPreferencesCount>());
	public onDidFilterResultsCountChange: Event<IPreferencesCount> = this._onDidFilterResultsCountChange.event;

	constructor(
		@IPreferencesSearchService private preferencesSearchService: IPreferencesSearchService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@ILogService private logService: ILogService
	) {
		super();
	}

	get lastFilterResult(): IFilterResult {
		return this._lastFilterResult;
	}

	get defaultPreferencesRenderer(): IPreferencesRenderer<ISetting> {
		return this._defaultPreferencesRenderer;
	}

	get editablePreferencesRenderer(): IPreferencesRenderer<ISetting> {
		return this._editablePreferencesRenderer;
	}

	set defaultPreferencesRenderer(defaultPreferencesRenderer: IPreferencesRenderer<ISetting>) {
		if (this._defaultPreferencesRenderer !== defaultPreferencesRenderer) {
			this._defaultPreferencesRenderer = defaultPreferencesRenderer;

			this._defaultPreferencesRendererDisposables = dispose(this._defaultPreferencesRendererDisposables);

			if (this._defaultPreferencesRenderer) {
				this._defaultPreferencesRenderer.onUpdatePreference(({ key, value, source }) => {
					this._editablePreferencesRenderer.updatePreference(key, value, source);
					this._updatePreference(key, value, source);
				}, this, this._defaultPreferencesRendererDisposables);
				this._defaultPreferencesRenderer.onFocusPreference(preference => this._focusPreference(preference, this._editablePreferencesRenderer), this, this._defaultPreferencesRendererDisposables);
				this._defaultPreferencesRenderer.onClearFocusPreference(preference => this._clearFocus(preference, this._editablePreferencesRenderer), this, this._defaultPreferencesRendererDisposables);
			}
		}
	}

	set editablePreferencesRenderer(editableSettingsRenderer: IPreferencesRenderer<ISetting>) {
		if (this._editablePreferencesRenderer !== editableSettingsRenderer) {
			this._editablePreferencesRenderer = editableSettingsRenderer;
			this._editablePreferencesRendererDisposables = dispose(this._editablePreferencesRendererDisposables);
			if (this._editablePreferencesRenderer) {
				(<ISettingsEditorModel>this._editablePreferencesRenderer.preferencesModel)
					.onDidChangeGroups(this._onEditableContentDidChange, this, this._editablePreferencesRendererDisposables);

				this._editablePreferencesRenderer.onUpdatePreference(({ key, value, source }) => this._updatePreference(key, value, source, true), this, this._defaultPreferencesRendererDisposables);
			}
		}
	}

	private async _onEditableContentDidChange(): TPromise<void> {
		await this.localFilterPreferences(this._lastQuery, true);
		await this.remoteSearchPreferences(this._lastQuery, true);
	}

	onHidden(): void {
		this._prefsModelsForSearch.forEach(model => model.dispose());
		this._prefsModelsForSearch = new Map<string, ISettingsEditorModel>();
	}

	remoteSearchPreferences(query: string, updateCurrentResults?: boolean): TPromise<void> {
		if (this._remoteFilterInProgress && this._remoteFilterInProgress.cancel) {
			// Resolved/rejected promises have no .cancel()
			this._remoteFilterInProgress.cancel();
		}

		this._currentRemoteSearchProvider = (updateCurrentResults && this._currentRemoteSearchProvider) || this.preferencesSearchService.getRemoteSearchProvider(query);

		this._remoteFilterInProgress = this.filterOrSearchPreferences(query, this._currentRemoteSearchProvider, 'nlpResult', nls.localize('nlpResult', "Natural Language Results"), 1, updateCurrentResults);

		return this._remoteFilterInProgress.then(() => {
			this._remoteFilterInProgress = null;
		}, err => {
			if (isPromiseCanceledError(err)) {
				return null;
			} else {
				onUnexpectedError(err);
			}
		});
	}

	localFilterPreferences(query: string, updateCurrentResults?: boolean): TPromise<void> {
		if (this._settingsNavigator) {
			this._settingsNavigator.reset();
		}

		this._currentLocalSearchProvider = (updateCurrentResults && this._currentLocalSearchProvider) || this.preferencesSearchService.getLocalSearchProvider(query);
		return this.filterOrSearchPreferences(query, this._currentLocalSearchProvider, 'filterResult', nls.localize('filterResult', "Filtered Results"), 0, updateCurrentResults);
	}

	private filterOrSearchPreferences(query: string, searchProvider: ISearchProvider, groupId: string, groupLabel: string, groupOrder: number, editableContentOnly?: boolean): TPromise<void> {
		this._lastQuery = query;

		const filterPs: TPromise<any>[] = [this._filterOrSearchPreferences(query, this.editablePreferencesRenderer, searchProvider, groupId, groupLabel, groupOrder)];
		if (!editableContentOnly) {
			filterPs.push(
				this._filterOrSearchPreferences(query, this.defaultPreferencesRenderer, searchProvider, groupId, groupLabel, groupOrder));
		}

		filterPs.push(this.searchAllSettingsTargets(query, searchProvider, groupId, groupLabel, groupOrder));

		return TPromise.join(filterPs).then(results => {
			let [editableFilterResult, defaultFilterResult] = results;

			if (!defaultFilterResult && editableContentOnly) {
				defaultFilterResult = this.lastFilterResult;
			}

			this.consolidateAndUpdate(defaultFilterResult, editableFilterResult);
			if (defaultFilterResult) {
				this._lastFilterResult = defaultFilterResult;
			}
		});
	}

	private searchAllSettingsTargets(query: string, searchProvider: ISearchProvider, groupId: string, groupLabel: string, groupOrder: number): TPromise<void> {
		const searchPs = [
			this.searchSettingsTarget(query, searchProvider, ConfigurationTarget.WORKSPACE, groupId, groupLabel, groupOrder),
			this.searchSettingsTarget(query, searchProvider, ConfigurationTarget.USER, groupId, groupLabel, groupOrder)
		];

		for (const folder of this.workspaceContextService.getWorkspace().folders) {
			const folderSettingsResource = this.preferencesService.getFolderSettingsResource(folder.uri);
			searchPs.push(this.searchSettingsTarget(query, searchProvider, folderSettingsResource, groupId, groupLabel, groupOrder));
		}


		return TPromise.join(searchPs).then(() => { });
	}

	private searchSettingsTarget(query: string, provider: ISearchProvider, target: SettingsTarget, groupId: string, groupLabel: string, groupOrder: number): TPromise<void> {
		if (!query) {
			// Don't open the other settings targets when query is empty
			this._onDidFilterResultsCountChange.fire({ target, count: 0 });
			return TPromise.wrap(null);
		}

		return this.getPreferencesEditorModel(target).then(model => {
			return model && this._filterOrSearchPreferencesModel('', <ISettingsEditorModel>model, provider, groupId, groupLabel, groupOrder);
		}).then(result => {
			const count = result ? this._flatten(result.filteredGroups).length : 0;
			this._onDidFilterResultsCountChange.fire({ target, count });
		}, err => {
			if (!isPromiseCanceledError(err)) {
				return TPromise.wrapError(err);
			}

			return null;
		});
	}

	private async getPreferencesEditorModel(target: SettingsTarget): TPromise<ISettingsEditorModel | null> {
		const resource = target === ConfigurationTarget.USER ? this.preferencesService.userSettingsResource :
			target === ConfigurationTarget.WORKSPACE ? this.preferencesService.workspaceSettingsResource :
				target;

		if (!resource) {
			return null;
		}

		const targetKey = resource.toString();
		if (!this._prefsModelsForSearch.has(targetKey)) {
			try {
				const model = this._register(await this.preferencesService.createPreferencesEditorModel(resource));
				this._prefsModelsForSearch.set(targetKey, <ISettingsEditorModel>model);
			} catch (e) {
				// Will throw when the settings file doesn't exist.
				return null;
			}
		}

		return this._prefsModelsForSearch.get(targetKey);
	}

	focusNextPreference(forward: boolean = true) {
		if (!this._settingsNavigator) {
			return;
		}

		const setting = forward ? this._settingsNavigator.next() : this._settingsNavigator.previous();
		this._focusPreference(setting, this._defaultPreferencesRenderer);
		this._focusPreference(setting, this._editablePreferencesRenderer);
	}

	editFocusedPreference(): void {
		if (!this._settingsNavigator || !this._settingsNavigator.current()) {
			return;
		}

		const setting = this._settingsNavigator.current();
		const shownInEditableRenderer = this._editablePreferencesRenderer.editPreference(setting);
		if (!shownInEditableRenderer) {
			this.defaultPreferencesRenderer.editPreference(setting);
		}
	}

	private _filterOrSearchPreferences(filter: string, preferencesRenderer: IPreferencesRenderer<ISetting>, provider: ISearchProvider, groupId: string, groupLabel: string, groupOrder: number): TPromise<IFilterResult> {
		if (!preferencesRenderer) {
			return TPromise.wrap(null);
		}

		const model = <ISettingsEditorModel>preferencesRenderer.preferencesModel;
		return this._filterOrSearchPreferencesModel(filter, model, provider, groupId, groupLabel, groupOrder).then(filterResult => {
			preferencesRenderer.filterPreferences(filterResult);
			return filterResult;
		});
	}

	private _filterOrSearchPreferencesModel(filter: string, model: ISettingsEditorModel, provider: ISearchProvider, groupId: string, groupLabel: string, groupOrder: number): TPromise<IFilterResult> {
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
			})
			.then(searchResult => {
				const filterResult = searchResult ?
					model.updateResultGroup(groupId, {
						id: groupId,
						label: groupLabel,
						result: searchResult,
						order: groupOrder
					}) :
					model.updateResultGroup(groupId, null);

				if (filterResult) {
					filterResult.query = filter;
				}

				return filterResult;
			});
	}

	private consolidateAndUpdate(defaultFilterResult: IFilterResult, editableFilterResult: IFilterResult): void {
		const defaultPreferencesFilteredGroups = defaultFilterResult ? defaultFilterResult.filteredGroups : this._getAllPreferences(this._defaultPreferencesRenderer);
		const editablePreferencesFilteredGroups = editableFilterResult ? editableFilterResult.filteredGroups : this._getAllPreferences(this._editablePreferencesRenderer);
		const consolidatedSettings = this._consolidateSettings(editablePreferencesFilteredGroups, defaultPreferencesFilteredGroups);

		// Maintain the current navigation position when updating SettingsNavigator
		const current = this._settingsNavigator && this._settingsNavigator.current();
		const navigatorSettings = this._lastQuery ? consolidatedSettings : [];
		const currentIndex = current ?
			arrays.firstIndex(navigatorSettings, s => s.key === current.key) :
			-1;

		this._settingsNavigator = new SettingsNavigator(navigatorSettings, Math.max(currentIndex, 0));

		if (currentIndex >= 0) {
			this._settingsNavigator.next();
			const newCurrent = this._settingsNavigator.current();
			this._focusPreference(newCurrent, this._defaultPreferencesRenderer);
			this._focusPreference(newCurrent, this._editablePreferencesRenderer);
		}

		const totalCount = consolidatedSettings.length;
		this._onDidFilterResultsCountChange.fire({ count: totalCount });
	}

	private _getAllPreferences(preferencesRenderer: IPreferencesRenderer<ISetting>): ISettingsGroup[] {
		return preferencesRenderer ? (<ISettingsEditorModel>preferencesRenderer.preferencesModel).settingsGroups : [];
	}

	private _focusPreference(preference: ISetting, preferencesRenderer: IPreferencesRenderer<ISetting>): void {
		if (preference && preferencesRenderer) {
			preferencesRenderer.focusPreference(preference);
		}
	}

	private _clearFocus(preference: ISetting, preferencesRenderer: IPreferencesRenderer<ISetting>): void {
		if (preference && preferencesRenderer) {
			preferencesRenderer.clearFocus(preference);
		}
	}

	private _updatePreference(key: string, value: any, source: ISetting, fromEditableSettings?: boolean): void {
		const data = {
			userConfigurationKeys: [key]
		};

		if (this.lastFilterResult) {
			data['query'] = this.lastFilterResult.query;
			data['editableSide'] = !!fromEditableSettings;

			const nlpMetadata = this.lastFilterResult.metadata && this.lastFilterResult.metadata['nlpResult'];
			if (nlpMetadata) {
				const sortedKeys = Object.keys(nlpMetadata.scoredResults).sort((a, b) => nlpMetadata.scoredResults[b].score - nlpMetadata.scoredResults[a].score);
				const suffix = '##' + key;
				data['nlpIndex'] = arrays.firstIndex(sortedKeys, key => strings.endsWith(key, suffix));
			}

			const settingLocation = this._findSetting(this.lastFilterResult, key);
			if (settingLocation) {
				data['groupId'] = this.lastFilterResult.filteredGroups[settingLocation.groupIdx].id;
				data['displayIdx'] = settingLocation.overallSettingIdx;
			}
		}

		/* __GDPR__
			"defaultSettingsActions.copySetting" : {
				"userConfigurationKeys" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"query" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"nlpIndex" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"groupId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"displayIdx" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"editableSide" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog('defaultSettingsActions.copySetting', data);
	}

	private _findSetting(filterResult: IFilterResult, key: string): { groupIdx: number, settingIdx: number, overallSettingIdx: number } {
		let overallSettingIdx = 0;

		for (let groupIdx = 0; groupIdx < filterResult.filteredGroups.length; groupIdx++) {
			const group = filterResult.filteredGroups[groupIdx];
			for (let settingIdx = 0; settingIdx < group.sections[0].settings.length; settingIdx++) {
				const setting = group.sections[0].settings[settingIdx];
				if (key === setting.key) {
					return { groupIdx, settingIdx, overallSettingIdx };
				}

				overallSettingIdx++;
			}
		}

		return null;
	}

	private _consolidateSettings(editableSettingsGroups: ISettingsGroup[], defaultSettingsGroups: ISettingsGroup[]): ISetting[] {
		const defaultSettings = this._flatten(defaultSettingsGroups);
		const editableSettings = this._flatten(editableSettingsGroups).filter(secondarySetting => defaultSettings.every(primarySetting => primarySetting.key !== secondarySetting.key));
		return [...defaultSettings, ...editableSettings];
	}

	private _flatten(settingsGroups: ISettingsGroup[]): ISetting[] {
		const settings: ISetting[] = [];
		for (const group of settingsGroups) {
			for (const section of group.sections) {
				settings.push(...section.settings);
			}
		}

		return settings;
	}

	public dispose(): void {
		dispose(this._defaultPreferencesRendererDisposables);
		dispose(this._editablePreferencesRendererDisposables);
		super.dispose();
	}
}

class SideBySidePreferencesWidget extends Widget {

	private dimension: Dimension;

	private defaultPreferencesHeader: HTMLElement;
	private defaultPreferencesEditor: DefaultPreferencesEditor;
	private editablePreferencesEditor: BaseEditor;
	private defaultPreferencesEditorContainer: HTMLElement;
	private editablePreferencesEditorContainer: HTMLElement;

	private settingsTargetsWidget: SettingsTargetsWidget;

	private _onFocus: Emitter<void> = new Emitter<void>();
	readonly onFocus: Event<void> = this._onFocus.event;

	private _onDidSettingsTargetChange: Emitter<SettingsTarget> = new Emitter<SettingsTarget>();
	readonly onDidSettingsTargetChange: Event<SettingsTarget> = this._onDidSettingsTargetChange.event;

	private lastFocusedEditor: BaseEditor;

	private sash: VSash;

	constructor(
		parent: HTMLElement,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IPreferencesService private preferencesService: IPreferencesService,
	) {
		super();
		this.create(parent);
	}

	private create(parentElement: HTMLElement): void {
		DOM.addClass(parentElement, 'side-by-side-preferences-editor');
		this.createSash(parentElement);

		this.defaultPreferencesEditorContainer = DOM.append(parentElement, DOM.$('.default-preferences-editor-container'));
		this.defaultPreferencesEditorContainer.style.position = 'absolute';

		const defaultPreferencesHeaderContainer = DOM.append(this.defaultPreferencesEditorContainer, DOM.$('.preferences-header-container'));
		defaultPreferencesHeaderContainer.style.height = '30px';
		defaultPreferencesHeaderContainer.style.marginBottom = '4px';
		this.defaultPreferencesHeader = DOM.append(defaultPreferencesHeaderContainer, DOM.$('div.default-preferences-header'));
		this.defaultPreferencesHeader.textContent = nls.localize('defaultSettings', "Default Settings");

		this.defaultPreferencesEditor = this._register(this.instantiationService.createInstance(DefaultPreferencesEditor));
		this.defaultPreferencesEditor.create(new Builder(this.defaultPreferencesEditorContainer));
		this.defaultPreferencesEditor.setVisible(true);
		(<CodeEditor>this.defaultPreferencesEditor.getControl()).onDidFocusEditor(() => this.lastFocusedEditor = this.defaultPreferencesEditor);

		this.editablePreferencesEditorContainer = DOM.append(parentElement, DOM.$('.editable-preferences-editor-container'));
		this.editablePreferencesEditorContainer.style.position = 'absolute';
		const editablePreferencesHeaderContainer = DOM.append(this.editablePreferencesEditorContainer, DOM.$('.preferences-header-container'));
		editablePreferencesHeaderContainer.style.height = '30px';
		editablePreferencesHeaderContainer.style.marginBottom = '4px';
		this.settingsTargetsWidget = this._register(this.instantiationService.createInstance(SettingsTargetsWidget, editablePreferencesHeaderContainer));
		this._register(this.settingsTargetsWidget.onDidTargetChange(target => this._onDidSettingsTargetChange.fire(target)));

		this._register(attachStylerCallback(this.themeService, { scrollbarShadow }, colors => {
			const shadow = colors.scrollbarShadow ? colors.scrollbarShadow.toString() : null;

			if (shadow) {
				this.editablePreferencesEditorContainer.style.boxShadow = `-6px 0 5px -5px ${shadow}`;
			} else {
				this.editablePreferencesEditorContainer.style.boxShadow = null;
			}
		}));

		const focusTracker = this._register(DOM.trackFocus(parentElement));
		this._register(focusTracker.onDidFocus(() => this._onFocus.fire()));
	}

	public setInput(defaultPreferencesEditorInput: DefaultPreferencesEditorInput, editablePreferencesEditorInput: EditorInput, options?: EditorOptions): TPromise<{ defaultPreferencesRenderer: IPreferencesRenderer<ISetting>, editablePreferencesRenderer: IPreferencesRenderer<ISetting> }> {
		this.getOrCreateEditablePreferencesEditor(editablePreferencesEditorInput);
		this.settingsTargetsWidget.settingsTarget = this.getSettingsTarget(editablePreferencesEditorInput.getResource());
		this.dolayout(this.sash.getVerticalSashLeft());
		return TPromise.join([this.updateInput(this.defaultPreferencesEditor, defaultPreferencesEditorInput, DefaultSettingsEditorContribution.ID, editablePreferencesEditorInput.getResource(), options),
		this.updateInput(this.editablePreferencesEditor, editablePreferencesEditorInput, SettingsEditorContribution.ID, defaultPreferencesEditorInput.getResource(), options)])
			.then(([defaultPreferencesRenderer, editablePreferencesRenderer]) => {
				this.defaultPreferencesHeader.textContent = defaultPreferencesRenderer && (<DefaultSettingsEditorModel>defaultPreferencesRenderer.preferencesModel).configurationScope === ConfigurationScope.RESOURCE ? nls.localize('defaultFolderSettings', "Default Folder Settings") : nls.localize('defaultSettings', "Default Settings");
				return { defaultPreferencesRenderer, editablePreferencesRenderer };
			});
	}

	public setResultCount(settingsTarget: SettingsTarget, count: number): void {
		this.settingsTargetsWidget.setResultCount(settingsTarget, count);
	}

	public layout(dimension: Dimension): void {
		this.dimension = dimension;
		this.sash.setDimenesion(this.dimension);
	}

	public focus(): void {
		if (this.lastFocusedEditor) {
			this.lastFocusedEditor.focus();
		}
	}

	public getControl(): IEditorControl {
		return this.editablePreferencesEditor ? this.editablePreferencesEditor.getControl() : null;
	}

	public clearInput(): void {
		if (this.defaultPreferencesEditor) {
			this.defaultPreferencesEditor.clearInput();
		}
		if (this.editablePreferencesEditor) {
			this.editablePreferencesEditor.clearInput();
		}
	}

	public setEditorVisible(visible: boolean, position: Position): void {
		if (this.editablePreferencesEditor) {
			this.editablePreferencesEditor.setVisible(visible, position);
		}
	}

	public changePosition(position: Position): void {
		if (this.editablePreferencesEditor) {
			this.editablePreferencesEditor.changePosition(position);
		}
	}

	private getOrCreateEditablePreferencesEditor(editorInput: EditorInput): BaseEditor {
		if (this.editablePreferencesEditor) {
			return this.editablePreferencesEditor;
		}
		const descriptor = Registry.as<IEditorRegistry>(EditorExtensions.Editors).getEditor(editorInput);
		const editor = descriptor.instantiate(this.instantiationService);
		this.editablePreferencesEditor = editor;
		this.editablePreferencesEditor.create(new Builder(this.editablePreferencesEditorContainer));
		this.editablePreferencesEditor.setVisible(true);
		(<CodeEditor>this.editablePreferencesEditor.getControl()).onDidFocusEditor(() => this.lastFocusedEditor = this.editablePreferencesEditor);
		this.lastFocusedEditor = this.editablePreferencesEditor;

		return editor;
	}

	private updateInput(editor: BaseEditor, input: EditorInput, editorContributionId: string, associatedPreferencesModelUri: URI, options: EditorOptions): TPromise<IPreferencesRenderer<ISetting>> {
		return editor.setInput(input, options)
			.then(() => (<CodeEditor>editor.getControl()).getContribution<ISettingsEditorContribution>(editorContributionId).updatePreferencesRenderer(associatedPreferencesModelUri));
	}

	private createSash(parentElement: HTMLElement): void {
		this.sash = this._register(new VSash(parentElement, 220));
		this._register(this.sash.onPositionChange(position => this.dolayout(position)));
	}

	private dolayout(splitPoint: number): void {
		if (!this.editablePreferencesEditor || !this.dimension) {
			return;
		}
		const masterEditorWidth = this.dimension.width - splitPoint;
		const detailsEditorWidth = this.dimension.width - masterEditorWidth;

		this.defaultPreferencesEditorContainer.style.width = `${detailsEditorWidth}px`;
		this.defaultPreferencesEditorContainer.style.height = `${this.dimension.height}px`;
		this.defaultPreferencesEditorContainer.style.left = '0px';

		this.editablePreferencesEditorContainer.style.width = `${masterEditorWidth}px`;
		this.editablePreferencesEditorContainer.style.height = `${this.dimension.height}px`;
		this.editablePreferencesEditorContainer.style.left = `${splitPoint}px`;

		this.defaultPreferencesEditor.layout(new Dimension(detailsEditorWidth, this.dimension.height - 34 /* height of header container */));
		this.editablePreferencesEditor.layout(new Dimension(masterEditorWidth, this.dimension.height - 34 /* height of header container */));
	}

	private getSettingsTarget(resource: URI): SettingsTarget {
		if (this.preferencesService.userSettingsResource.toString() === resource.toString()) {
			return ConfigurationTarget.USER;
		}

		const workspaceSettingsResource = this.preferencesService.workspaceSettingsResource;
		if (workspaceSettingsResource && workspaceSettingsResource.toString() === resource.toString()) {
			return ConfigurationTarget.WORKSPACE;
		}

		const folder = this.workspaceContextService.getWorkspaceFolder(resource);
		if (folder) {
			return folder.uri;
		}

		return ConfigurationTarget.USER;
	}

	private disposeEditors(): void {
		if (this.defaultPreferencesEditor) {
			this.defaultPreferencesEditor.dispose();
			this.defaultPreferencesEditor = null;
		}
		if (this.editablePreferencesEditor) {
			this.editablePreferencesEditor.dispose();
			this.editablePreferencesEditor = null;
		}
	}

	public dispose(): void {
		this.disposeEditors();
		super.dispose();
	}
}

export class DefaultPreferencesEditor extends BaseTextEditor {

	public static readonly ID: string = 'workbench.editor.defaultPreferences';

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@ITextFileService textFileService: ITextFileService,
		@IEditorGroupService editorGroupService: IEditorGroupService
	) {
		super(DefaultPreferencesEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, textFileService, editorGroupService);
	}

	public createEditorControl(parent: Builder, configuration: IEditorOptions): editorCommon.IEditor {
		const editor = this.instantiationService.createInstance(DefaultPreferencesCodeEditor, parent.getHTMLElement(), configuration);

		// Inform user about editor being readonly if user starts type
		this.toUnbind.push(editor.onDidType(() => this.showReadonlyHint(editor)));
		this.toUnbind.push(editor.onDidPaste(() => this.showReadonlyHint(editor)));

		return editor;
	}

	private showReadonlyHint(editor: ICodeEditor): void {
		const messageController = MessageController.get(editor);
		if (!messageController.isVisible()) {
			messageController.showMessage(nls.localize('defaultEditorReadonly', "Edit in the right hand side editor to override defaults."), editor.getSelection().getPosition());
		}
	}

	protected getConfigurationOverrides(): IEditorOptions {
		const options = super.getConfigurationOverrides();
		options.readOnly = true;
		if (this.input) {
			options.lineNumbers = 'off';
			options.renderLineHighlight = 'none';
			options.scrollBeyondLastLine = false;
			options.folding = false;
			options.renderWhitespace = 'none';
			options.wordWrap = 'on';
			options.renderIndentGuides = false;
			options.rulers = [];
			options.glyphMargin = true;
			options.minimap = {
				enabled: false
			};
		}
		return options;
	}

	setInput(input: DefaultPreferencesEditorInput, options: EditorOptions): TPromise<void> {
		return super.setInput(input, options)
			.then(() => this.input.resolve()
				.then(editorModel => editorModel.load())
				.then(editorModel => this.getControl().setModel((<ResourceEditorModel>editorModel).textEditorModel)));
	}

	public clearInput(): void {
		// Clear Model
		this.getControl().setModel(null);

		// Pass to super
		super.clearInput();
	}

	public layout(dimension: Dimension) {
		this.getControl().layout(dimension);
	}

	protected getAriaLabel(): string {
		return nls.localize('preferencesAriaLabel', "Default preferences. Readonly text editor.");
	}
}

class DefaultPreferencesCodeEditor extends CodeEditor {

	protected _getContributions(): IEditorContributionCtor[] {
		let contributions = super._getContributions();
		let skipContributions = [FoldingController.prototype, SelectionHighlighter.prototype, FindController.prototype];
		contributions = contributions.filter(c => skipContributions.indexOf(c.prototype) === -1);
		contributions.push(DefaultSettingsEditorContribution);
		return contributions;
	}

}

interface ISettingsEditorContribution extends editorCommon.IEditorContribution {

	updatePreferencesRenderer(associatedPreferencesModelUri: URI): TPromise<IPreferencesRenderer<ISetting>>;

}

abstract class AbstractSettingsEditorContribution extends Disposable implements ISettingsEditorContribution {

	private preferencesRendererCreationPromise: TPromise<IPreferencesRenderer<ISetting>>;

	constructor(protected editor: ICodeEditor,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@IWorkspaceContextService protected workspaceContextService: IWorkspaceContextService
	) {
		super();
		this._register(this.editor.onDidChangeModel(() => this._onModelChanged()));
	}

	updatePreferencesRenderer(associatedPreferencesModelUri: URI): TPromise<IPreferencesRenderer<ISetting>> {
		if (!this.preferencesRendererCreationPromise) {
			this.preferencesRendererCreationPromise = this._createPreferencesRenderer();
		}

		if (this.preferencesRendererCreationPromise) {
			return this._hasAssociatedPreferencesModelChanged(associatedPreferencesModelUri)
				.then(changed => changed ? this._updatePreferencesRenderer(associatedPreferencesModelUri) : this.preferencesRendererCreationPromise);
		}

		return TPromise.as(null);
	}

	protected _onModelChanged(): void {
		const model = this.editor.getModel();
		this.disposePreferencesRenderer();
		if (model) {
			this.preferencesRendererCreationPromise = this._createPreferencesRenderer();
		}
	}

	private _hasAssociatedPreferencesModelChanged(associatedPreferencesModelUri: URI): TPromise<boolean> {
		return this.preferencesRendererCreationPromise.then(preferencesRenderer => {
			return !(preferencesRenderer && preferencesRenderer.getAssociatedPreferencesModel() && preferencesRenderer.getAssociatedPreferencesModel().uri.toString() === associatedPreferencesModelUri.toString());
		});
	}

	private _updatePreferencesRenderer(associatedPreferencesModelUri: URI): TPromise<IPreferencesRenderer<ISetting>> {
		return this.preferencesService.createPreferencesEditorModel<ISetting>(associatedPreferencesModelUri)
			.then(associatedPreferencesEditorModel => {
				return this.preferencesRendererCreationPromise.then(preferencesRenderer => {
					if (preferencesRenderer) {
						const associatedPreferencesModel = preferencesRenderer.getAssociatedPreferencesModel();
						if (associatedPreferencesModel) {
							associatedPreferencesModel.dispose();
						}
						preferencesRenderer.setAssociatedPreferencesModel(associatedPreferencesEditorModel);
					}
					return preferencesRenderer;
				});
			});
	}

	private disposePreferencesRenderer(): void {
		if (this.preferencesRendererCreationPromise) {
			this.preferencesRendererCreationPromise.then(preferencesRenderer => {
				if (preferencesRenderer) {
					const associatedPreferencesModel = preferencesRenderer.getAssociatedPreferencesModel();
					if (associatedPreferencesModel) {
						associatedPreferencesModel.dispose();
					}
					preferencesRenderer.preferencesModel.dispose();
					preferencesRenderer.dispose();
				}
			});
			this.preferencesRendererCreationPromise = TPromise.as(null);
		}
	}

	dispose() {
		this.disposePreferencesRenderer();
		super.dispose();
	}

	protected abstract _createPreferencesRenderer(): TPromise<IPreferencesRenderer<ISetting>>;
	abstract getId(): string;
}

class DefaultSettingsEditorContribution extends AbstractSettingsEditorContribution implements ISettingsEditorContribution {

	static readonly ID: string = 'editor.contrib.defaultsettings';

	getId(): string {
		return DefaultSettingsEditorContribution.ID;
	}

	protected _createPreferencesRenderer(): TPromise<IPreferencesRenderer<ISetting>> {
		return this.preferencesService.createPreferencesEditorModel(this.editor.getModel().uri)
			.then(editorModel => {
				if (editorModel instanceof DefaultSettingsEditorModel && this.editor.getModel()) {
					const preferencesRenderer = this.instantiationService.createInstance(DefaultSettingsRenderer, this.editor, editorModel);
					preferencesRenderer.render();
					return preferencesRenderer;
				}
				return null;
			});
	}
}

class SettingsEditorContribution extends AbstractSettingsEditorContribution implements ISettingsEditorContribution {

	static readonly ID: string = 'editor.contrib.settings';

	constructor(editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IPreferencesService preferencesService: IPreferencesService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService
	) {
		super(editor, instantiationService, preferencesService, workspaceContextService);
		this._register(this.workspaceContextService.onDidChangeWorkbenchState(() => this._onModelChanged()));
	}

	getId(): string {
		return SettingsEditorContribution.ID;
	}

	protected _createPreferencesRenderer(): TPromise<IPreferencesRenderer<ISetting>> {
		if (this.isSettingsModel()) {
			return this.preferencesService.createPreferencesEditorModel(this.editor.getModel().uri)
				.then(settingsModel => {
					if (settingsModel instanceof SettingsEditorModel && this.editor.getModel()) {
						switch (settingsModel.configurationTarget) {
							case ConfigurationTarget.USER:
								return this.instantiationService.createInstance(UserSettingsRenderer, this.editor, settingsModel);
							case ConfigurationTarget.WORKSPACE:
								return this.instantiationService.createInstance(WorkspaceSettingsRenderer, this.editor, settingsModel);
							case ConfigurationTarget.WORKSPACE_FOLDER:
								return this.instantiationService.createInstance(FolderSettingsRenderer, this.editor, settingsModel);
						}
					}
					return null;
				})
				.then(preferencesRenderer => {
					if (preferencesRenderer) {
						preferencesRenderer.render();
					}
					return preferencesRenderer;
				});
		}
		return null;
	}

	private isSettingsModel(): boolean {
		const model = this.editor.getModel();
		if (!model) {
			return false;
		}

		if (this.preferencesService.userSettingsResource && this.preferencesService.userSettingsResource.toString() === model.uri.toString()) {
			return true;
		}

		if (this.preferencesService.workspaceSettingsResource && this.preferencesService.workspaceSettingsResource.toString() === model.uri.toString()) {
			return true;
		}

		for (const folder of this.workspaceContextService.getWorkspace().folders) {
			const folderSettingsResource = this.preferencesService.getFolderSettingsResource(folder.uri);
			if (folderSettingsResource && folderSettingsResource.toString() === model.uri.toString()) {
				return true;
			}
		}

		return false;
	}

}

registerEditorContribution(SettingsEditorContribution);

abstract class SettingsCommand extends Command {

	protected getPreferencesEditor(accessor: ServicesAccessor): PreferencesEditor {
		const activeEditor = accessor.get(IWorkbenchEditorService).getActiveEditor();
		if (activeEditor instanceof PreferencesEditor) {
			return activeEditor;
		}
		return null;

	}

}
class StartSearchDefaultSettingsCommand extends SettingsCommand {

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor) {
			preferencesEditor.focusSearch();
		}
	}

}
const command = new StartSearchDefaultSettingsCommand({
	id: SETTINGS_EDITOR_COMMAND_SEARCH,
	precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR),
	kbOpts: { primary: KeyMod.CtrlCmd | KeyCode.KEY_F }
});
KeybindingsRegistry.registerCommandAndKeybindingRule(command.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

class FocusSettingsFileEditorCommand extends SettingsCommand {

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor) {
			preferencesEditor.focusSettingsFileEditor();
		}
	}

}
const focusSettingsFileEditorCommand = new FocusSettingsFileEditorCommand({
	id: SETTINGS_EDITOR_COMMAND_FOCUS_FILE,
	precondition: CONTEXT_SETTINGS_SEARCH_FOCUS,
	kbOpts: { primary: KeyCode.DownArrow }
});
KeybindingsRegistry.registerCommandAndKeybindingRule(focusSettingsFileEditorCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

class ClearSearchResultsCommand extends SettingsCommand {

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor) {
			preferencesEditor.clearSearchResults();
		}
	}

}
const clearSearchResultsCommand = new ClearSearchResultsCommand({
	id: SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS,
	precondition: CONTEXT_SETTINGS_SEARCH_FOCUS,
	kbOpts: { primary: KeyCode.Escape }
});
KeybindingsRegistry.registerCommandAndKeybindingRule(clearSearchResultsCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

class FocusNextSearchResultCommand extends SettingsCommand {

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor) {
			preferencesEditor.focusNextResult();
		}
	}

}
const focusNextSearchResultCommand = new FocusNextSearchResultCommand({
	id: SETTINGS_EDITOR_COMMAND_FOCUS_NEXT_SETTING,
	precondition: CONTEXT_SETTINGS_SEARCH_FOCUS,
	kbOpts: { primary: KeyCode.Enter }
});
KeybindingsRegistry.registerCommandAndKeybindingRule(focusNextSearchResultCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

class FocusPreviousSearchResultCommand extends SettingsCommand {

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor) {
			preferencesEditor.focusPreviousResult();
		}
	}

}
const focusPreviousSearchResultCommand = new FocusPreviousSearchResultCommand({
	id: SETTINGS_EDITOR_COMMAND_FOCUS_PREVIOUS_SETTING,
	precondition: CONTEXT_SETTINGS_SEARCH_FOCUS,
	kbOpts: { primary: KeyMod.Shift | KeyCode.Enter }
});
KeybindingsRegistry.registerCommandAndKeybindingRule(focusPreviousSearchResultCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

class EditFocusedSettingCommand extends SettingsCommand {

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor) {
			preferencesEditor.editFocusedPreference();
		}
	}

}
const editFocusedSettingCommand = new EditFocusedSettingCommand({
	id: SETTINGS_EDITOR_COMMAND_EDIT_FOCUSED_SETTING,
	precondition: CONTEXT_SETTINGS_SEARCH_FOCUS,
	kbOpts: { primary: KeyMod.CtrlCmd | KeyCode.US_DOT }
});
KeybindingsRegistry.registerCommandAndKeybindingRule(editFocusedSettingCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));
