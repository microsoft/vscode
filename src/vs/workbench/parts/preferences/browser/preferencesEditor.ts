/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import * as DOM from 'vs/base/browser/dom';
import { Delayer } from 'vs/base/common/async';
import { Dimension, Builder } from 'vs/base/browser/builder';
import { ArrayNavigator, INavigator } from 'vs/base/common/iterator';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { toResource, SideBySideEditorInput, EditorOptions, EditorInput, IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { BaseEditor, EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { IEditorControl, Position, Verbosity } from 'vs/platform/editor/common/editor';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import {
	IPreferencesService, ISettingsGroup, ISetting, IFilterResult,
	CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_SEARCH_FOCUS, SETTINGS_EDITOR_COMMAND_SEARCH, SETTINGS_EDITOR_COMMAND_FOCUS_FILE, ISettingsEditorModel
} from 'vs/workbench/parts/preferences/common/preferences';
import { SettingsEditorModel, DefaultSettingsEditorModel } from 'vs/workbench/parts/preferences/common/preferencesModels';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { ICodeEditor, IEditorContributionCtor } from 'vs/editor/browser/editorBrowser';
import { SearchWidget, SettingsTargetsWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { ContextKeyExpr, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Command } from 'vs/editor/common/editorCommonExtensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { VSash } from 'vs/base/browser/ui/sash/sash';
import { Widget } from 'vs/base/browser/ui/widget';
import { IPreferencesRenderer, DefaultSettingsRenderer, UserSettingsRenderer, WorkspaceSettingsRenderer, FolderSettingsRenderer } from 'vs/workbench/parts/preferences/browser/preferencesRenderers';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { getCodeEditor } from 'vs/editor/common/services/codeEditorService';

// Ignore following contributions
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { FindController } from 'vs/editor/contrib/find/browser/find';
import { SelectionHighlighter } from 'vs/editor/contrib/find/common/findController';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { attachStylerCallback } from 'vs/platform/theme/common/styler';
import { scrollbarShadow } from 'vs/platform/theme/common/colorRegistry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import Event, { Emitter } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';

export class PreferencesEditorInput extends SideBySideEditorInput {
	public static ID: string = 'workbench.editorinputs.preferencesEditorInput';

	getTypeId(): string {
		return PreferencesEditorInput.ID;
	}

	public getTitle(verbosity: Verbosity): string {
		return this.master.getTitle(verbosity);
	}
}

export class DefaultPreferencesEditorInput extends ResourceEditorInput {
	public static ID = 'workbench.editorinputs.defaultpreferences';
	constructor(defaultSettingsResource: URI,
		@ITextModelService textModelResolverService: ITextModelService
	) {
		super(nls.localize('settingsEditorName', "Default Settings"), '', defaultSettingsResource, textModelResolverService);
	}

	getTypeId(): string {
		return DefaultPreferencesEditorInput.ID;
	}

	matches(other: any): boolean {
		if (!super.matches(other)) {
			return false;
		}
		if (!(other instanceof DefaultPreferencesEditorInput)) {
			return false;
		}
		return true;
	}
}

export class PreferencesEditor extends BaseEditor {

	public static ID: string = 'workbench.editor.preferencesEditor';

	private defaultSettingsEditorContextKey: IContextKey<boolean>;
	private focusSettingsContextKey: IContextKey<boolean>;
	private headerContainer: HTMLElement;
	private searchWidget: SearchWidget;
	private settingsTargetsWidget: SettingsTargetsWidget;
	private sideBySidePreferencesWidget: SideBySidePreferencesWidget;
	private preferencesRenderers: PreferencesRenderers;

	private delayedFilterLogging: Delayer<void>;

	private latestEmptyFilters: string[] = [];
	private lastFocusedWidget: SearchWidget | SideBySidePreferencesWidget = null;

	constructor(
		@IPreferencesService private preferencesService: IPreferencesService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
	) {
		super(PreferencesEditor.ID, telemetryService, themeService);
		this.defaultSettingsEditorContextKey = CONTEXT_SETTINGS_EDITOR.bindTo(this.contextKeyService);
		this.focusSettingsContextKey = CONTEXT_SETTINGS_SEARCH_FOCUS.bindTo(this.contextKeyService);
		this.delayedFilterLogging = new Delayer<void>(1000);
	}

	public createEditor(parent: Builder): void {
		const parentElement = parent.getHTMLElement();
		DOM.addClass(parentElement, 'preferences-editor');

		this.headerContainer = DOM.append(parentElement, DOM.$('.preferences-header'));

		this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, this.headerContainer, {
			ariaLabel: nls.localize('SearchSettingsWidget.AriaLabel', "Search settings"),
			placeholder: nls.localize('SearchSettingsWidget.Placeholder', "Search Settings"),
			focusKey: this.focusSettingsContextKey
		}));
		this._register(this.searchWidget.onDidChange(value => this.filterPreferences(value.trim())));
		this._register(this.searchWidget.onNavigate(shift => this.preferencesRenderers.focusNextPreference(!shift)));
		this._register(this.searchWidget.onFocus(() => this.lastFocusedWidget = this.searchWidget));
		this.lastFocusedWidget = this.searchWidget;

		this.settingsTargetsWidget = this._register(this.instantiationService.createInstance(SettingsTargetsWidget, this.headerContainer, this.preferencesService.userSettingsResource, ConfigurationTarget.USER));
		this._register(this.settingsTargetsWidget.onDidTargetChange(target => this.switchSettings(target)));

		const editorsContainer = DOM.append(parentElement, DOM.$('.preferences-editors-container'));
		this.sideBySidePreferencesWidget = this._register(this.instantiationService.createInstance(SideBySidePreferencesWidget, editorsContainer));
		this._register(this.sideBySidePreferencesWidget.onFocus(() => this.lastFocusedWidget = this.sideBySidePreferencesWidget));

		this.preferencesRenderers = this._register(new PreferencesRenderers());
		this._register(this.workspaceContextService.onDidChangeWorkspaceRoots(() => this.onWorkspaceRootsChanged()));
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
		const resource = toResource(newInput.master);
		this.settingsTargetsWidget.setTarget(this.getSettingsConfigurationTargetUri(resource), this.getSettingsConfigurationTarget(resource));

		return this.sideBySidePreferencesWidget.setInput(<DefaultPreferencesEditorInput>newInput.details, <EditorInput>newInput.master, options).then(({ defaultPreferencesRenderer, editablePreferencesRenderer }) => {
			this.preferencesRenderers.defaultPreferencesRenderer = defaultPreferencesRenderer;
			this.preferencesRenderers.editablePreferencesRenderer = editablePreferencesRenderer;
			this.filterPreferences(this.searchWidget.getValue());
		});
	}

	private getSettingsConfigurationTarget(resource: URI): ConfigurationTarget {
		if (this.preferencesService.userSettingsResource.fsPath === resource.fsPath) {
			return ConfigurationTarget.USER;
		}
		if (this.preferencesService.workspaceSettingsResource.fsPath === resource.fsPath) {
			return ConfigurationTarget.WORKSPACE;
		}
		if (this.workspaceContextService.getRoot(resource)) {
			return ConfigurationTarget.FOLDER;
		}
		return null;
	}

	private getSettingsConfigurationTargetUri(resource: URI): URI {
		if (this.preferencesService.userSettingsResource.fsPath === resource.fsPath) {
			return resource;
		}
		if (this.preferencesService.workspaceSettingsResource.fsPath === resource.fsPath) {
			return resource;
		}

		return this.workspaceContextService.getRoot(resource);
	}

	private onWorkspaceRootsChanged(): void {
		if (this.input) {
			const settingsResource = toResource((<PreferencesEditorInput>this.input).master);
			const targetResource = this.getSettingsConfigurationTargetUri(settingsResource);
			if (!targetResource) {
				this.switchSettings(this.preferencesService.userSettingsResource);
			}
		}
	}

	private switchSettings(resource: URI): void {
		// Focus the editor if this editor is not active editor
		if (this.editorService.getActiveEditor() !== this) {
			this.focus();
		}
		const promise = this.input.isDirty() ? this.input.save() : TPromise.as(true);
		promise.done(value => this.preferencesService.switchSettings(this.getSettingsConfigurationTarget(resource), resource));
	}

	private filterPreferences(filter: string) {
		const count = this.preferencesRenderers.filterPreferences(filter);
		const message = filter ? this.showSearchResultsMessage(count) : nls.localize('totalSettingsMessage', "Total {0} Settings", count);
		this.searchWidget.showMessage(message, count);
		if (count === 0) {
			this.latestEmptyFilters.push(filter);
		}
		this.delayedFilterLogging.trigger(() => this.reportFilteringUsed(filter));
	}

	private showSearchResultsMessage(count: number): string {
		return count === 0 ? nls.localize('noSettingsFound', "No Results") :
			count === 1 ? nls.localize('oneSettingFound', "1 Setting matched") :
				nls.localize('settingsFound', "{0} Settings matched", count);
	}

	private reportFilteringUsed(filter: string): void {
		if (filter) {
			let data = {
				filter,
				emptyFilters: this.getLatestEmptyFiltersForTelemetry()
			};
			this.latestEmptyFilters = [];
			this.telemetryService.publicLog('defaultSettings.filter', data);
		}
	}

	/**
	 * Put a rough limit on the size of the telemetry data, since otherwise it could be an unbounded large amount
	 * of data. 8192 is the max size of a property value. This is rough since that probably includes ""s, etc.
	 */
	private getLatestEmptyFiltersForTelemetry(): string[] {
		let cumulativeSize = 0;
		return this.latestEmptyFilters.filter(filterText => (cumulativeSize += filterText.length) <= 8192);
	}
}

class SettingsNavigator implements INavigator<ISetting> {

	private iterator: ArrayNavigator<ISetting>;

	constructor(settings: ISetting[]) {
		this.iterator = new ArrayNavigator<ISetting>(settings);
	}

	public next(): ISetting {
		return this.iterator.next() || this.iterator.first();
	}

	public previous(): ISetting {
		return this.iterator.previous() || this.iterator.last();
	}

	public parent(): ISetting {
		return this.iterator.parent();
	}

	public first(): ISetting {
		return this.iterator.first();
	}

	public last(): ISetting {
		return this.iterator.last();
	}

	public current(): ISetting {
		return this.iterator.current();
	}
}

class PreferencesRenderers extends Disposable {

	private _defaultPreferencesRenderer: IPreferencesRenderer<ISetting>;
	private _editablePreferencesRenderer: IPreferencesRenderer<ISetting>;
	private _settingsNavigator: SettingsNavigator;

	private _disposables: IDisposable[] = [];

	public get defaultPreferencesRenderer(): IPreferencesRenderer<ISetting> {
		return this._defaultPreferencesRenderer;
	}

	public set defaultPreferencesRenderer(defaultPreferencesRenderer: IPreferencesRenderer<ISetting>) {
		if (this._defaultPreferencesRenderer !== defaultPreferencesRenderer) {
			this._defaultPreferencesRenderer = defaultPreferencesRenderer;

			this._disposables = dispose(this._disposables);

			if (this._defaultPreferencesRenderer) {
				this._defaultPreferencesRenderer.onUpdatePreference(({ key, value, source }) => this._updatePreference(key, value, source, this._editablePreferencesRenderer), this, this._disposables);
				this._defaultPreferencesRenderer.onFocusPreference(preference => this._focusPreference(preference, this._editablePreferencesRenderer), this, this._disposables);
				this._defaultPreferencesRenderer.onClearFocusPreference(preference => this._clearFocus(preference, this._editablePreferencesRenderer), this, this._disposables);
			}
		}
	}

	public set editablePreferencesRenderer(editableSettingsRenderer: IPreferencesRenderer<ISetting>) {
		this._editablePreferencesRenderer = editableSettingsRenderer;
	}

	public filterPreferences(filter: string): number {
		const defaultPreferencesFilterResult = this._filterPreferences(filter, this._defaultPreferencesRenderer);
		const editablePreferencesFilterResult = this._filterPreferences(filter, this._editablePreferencesRenderer);

		const defaultPreferencesFilteredGroups = defaultPreferencesFilterResult ? defaultPreferencesFilterResult.filteredGroups : this._getAllPreferences(this._defaultPreferencesRenderer);
		const editablePreferencesFilteredGroups = editablePreferencesFilterResult ? editablePreferencesFilterResult.filteredGroups : this._getAllPreferences(this._editablePreferencesRenderer);
		const consolidatedSettings = this._consolidateSettings(editablePreferencesFilteredGroups, defaultPreferencesFilteredGroups);
		this._settingsNavigator = new SettingsNavigator(filter ? consolidatedSettings : []);

		return consolidatedSettings.length;
	}

	public focusNextPreference(forward: boolean = true) {
		const setting = forward ? this._settingsNavigator.next() : this._settingsNavigator.previous();
		this._focusPreference(setting, this._defaultPreferencesRenderer);
		this._focusPreference(setting, this._editablePreferencesRenderer);
	}

	private _getAllPreferences(preferencesRenderer: IPreferencesRenderer<ISetting>): ISettingsGroup[] {
		return preferencesRenderer ? (<ISettingsEditorModel>preferencesRenderer.preferencesModel).settingsGroups : [];
	}

	private _filterPreferences(filter: string, preferencesRenderer: IPreferencesRenderer<ISetting>): IFilterResult {
		let filterResult = null;
		if (preferencesRenderer) {
			filterResult = filter ? (<ISettingsEditorModel>preferencesRenderer.preferencesModel).filterSettings(filter) : null;
			preferencesRenderer.filterPreferences(filterResult);
		}
		return filterResult;
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

	private _updatePreference(key: string, value: any, source: ISetting, preferencesRenderer: IPreferencesRenderer<ISetting>): void {
		if (preferencesRenderer) {
			preferencesRenderer.updatePreference(key, value, source);
		}
	}

	private _consolidateSettings(editableSettingsGroups: ISettingsGroup[], defaultSettingsGroups: ISettingsGroup[]): ISetting[] {
		const editableSettings = this._flatten(editableSettingsGroups);
		const defaultSettings = this._flatten(defaultSettingsGroups).filter(secondarySetting => !editableSettings.some(primarySetting => primarySetting.key === secondarySetting.key));
		return [...editableSettings, ...defaultSettings];
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
		dispose(this._disposables);
		super.dispose();
	}
}

class SideBySidePreferencesWidget extends Widget {

	private dimension: Dimension;

	private defaultPreferencesEditor: DefaultPreferencesEditor;
	private editablePreferencesEditor: BaseEditor;
	private defaultPreferencesEditorContainer: HTMLElement;
	private editablePreferencesEditorContainer: HTMLElement;

	private _onFocus: Emitter<void> = new Emitter<void>();
	readonly onFocus: Event<void> = this._onFocus.event;

	private lastFocusedEditor: BaseEditor;

	private sash: VSash;

	constructor(parent: HTMLElement, @IInstantiationService private instantiationService: IInstantiationService, @IThemeService private themeService: IThemeService) {
		super();
		this.create(parent);
	}

	private create(parentElement: HTMLElement): void {
		DOM.addClass(parentElement, 'side-by-side-preferences-editor');
		this.createSash(parentElement);

		this.defaultPreferencesEditorContainer = DOM.append(parentElement, DOM.$('.default-preferences-editor-container'));
		this.defaultPreferencesEditorContainer.style.position = 'absolute';
		this.defaultPreferencesEditor = this._register(this.instantiationService.createInstance(DefaultPreferencesEditor));
		this.defaultPreferencesEditor.create(new Builder(this.defaultPreferencesEditorContainer));
		this.defaultPreferencesEditor.setVisible(true);
		(<CodeEditor>this.defaultPreferencesEditor.getControl()).onDidFocusEditor(() => this.lastFocusedEditor = this.defaultPreferencesEditor);

		this.editablePreferencesEditorContainer = DOM.append(parentElement, DOM.$('.editable-preferences-editor-container'));
		this.editablePreferencesEditorContainer.style.position = 'absolute';

		this._register(attachStylerCallback(this.themeService, { scrollbarShadow }, colors => {
			const shadow = colors.scrollbarShadow ? colors.scrollbarShadow.toString() : null;

			if (shadow) {
				this.editablePreferencesEditorContainer.style.boxShadow = `-6px 0 5px -5px ${shadow}`;
			} else {
				this.editablePreferencesEditorContainer.style.boxShadow = null;
			}
		}));

		const focusTracker = this._register(DOM.trackFocus(parentElement));
		this._register(focusTracker.addFocusListener(() => this._onFocus.fire()));
	}

	public setInput(defaultPreferencesEditorInput: DefaultPreferencesEditorInput, editablePreferencesEditorInput: EditorInput, options?: EditorOptions): TPromise<{ defaultPreferencesRenderer: IPreferencesRenderer<ISetting>, editablePreferencesRenderer: IPreferencesRenderer<ISetting> }> {
		return this.getOrCreateEditablePreferencesEditor(editablePreferencesEditorInput)
			.then(() => {
				this.dolayout(this.sash.getVerticalSashLeft());
				return TPromise.join([this.updateInput(this.defaultPreferencesEditor, defaultPreferencesEditorInput, DefaultSettingsEditorContribution.ID, toResource(editablePreferencesEditorInput), options),
				this.updateInput(this.editablePreferencesEditor, editablePreferencesEditorInput, SettingsEditorContribution.ID, defaultPreferencesEditorInput.getResource(), options)])
					.then(([defaultPreferencesRenderer, editablePreferencesRenderer]) => ({ defaultPreferencesRenderer, editablePreferencesRenderer }));
			});
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

	private getOrCreateEditablePreferencesEditor(editorInput: EditorInput): TPromise<BaseEditor> {
		if (this.editablePreferencesEditor) {
			return TPromise.as(this.editablePreferencesEditor);
		}
		const descriptor = Registry.as<IEditorRegistry>(EditorExtensions.Editors).getEditor(editorInput);
		return this.instantiationService.createInstance(<EditorDescriptor>descriptor)
			.then((editor: BaseEditor) => {
				this.editablePreferencesEditor = editor;
				this.editablePreferencesEditor.create(new Builder(this.editablePreferencesEditorContainer));
				this.editablePreferencesEditor.setVisible(true);
				(<CodeEditor>this.editablePreferencesEditor.getControl()).onDidFocusEditor(() => this.lastFocusedEditor = this.editablePreferencesEditor);
				this.lastFocusedEditor = this.editablePreferencesEditor;
				return editor;
			});
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

		this.defaultPreferencesEditor.layout(new Dimension(detailsEditorWidth, this.dimension.height));
		this.editablePreferencesEditor.layout(new Dimension(masterEditorWidth, this.dimension.height));
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

export class EditableSettingsEditor extends BaseTextEditor {

	public static ID: string = 'workbench.editor.settingsEditor';

	private modelDisposables: IDisposable[] = [];
	private saveDelayer: Delayer<void>;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IModelService private modelService: IModelService,
		@IModeService modeService: IModeService,
		@ITextFileService textFileService: ITextFileService,
		@IEditorGroupService editorGroupService: IEditorGroupService
	) {
		super(EditableSettingsEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, modeService, textFileService, editorGroupService);
		this._register({ dispose: () => dispose(this.modelDisposables) });
		this.saveDelayer = new Delayer<void>(1000);
	}

	protected createEditor(parent: Builder): void {
		super.createEditor(parent);

		const codeEditor = getCodeEditor(this);
		if (codeEditor) {
			this._register(codeEditor.onDidChangeModel(() => this.onDidModelChange()));
		}
	}

	protected getAriaLabel(): string {
		const input = this.input;
		const inputName = input && input.getName();

		let ariaLabel: string;
		if (inputName) {
			ariaLabel = nls.localize('fileEditorWithInputAriaLabel', "{0}. Text file editor.", inputName);
		} else {
			ariaLabel = nls.localize('fileEditorAriaLabel', "Text file editor.");
		}

		return ariaLabel;
	}

	setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		return super.setInput(input, options)
			.then(() => this.input.resolve()
				.then(editorModel => editorModel.load())
				.then(editorModel => this.getControl().setModel((<ResourceEditorModel>editorModel).textEditorModel)));
	}

	clearInput(): void {
		this.modelDisposables = dispose(this.modelDisposables);
		super.clearInput();
	}

	private onDidModelChange(): void {
		this.modelDisposables = dispose(this.modelDisposables);
		const model = getCodeEditor(this).getModel();
		if (model) {
			this.preferencesService.createPreferencesEditorModel(model.uri)
				.then(preferencesEditorModel => {
					const settingsEditorModel = <SettingsEditorModel>preferencesEditorModel;
					this.modelDisposables.push(settingsEditorModel);
					this.modelDisposables.push(model.onDidChangeContent(() => this.saveDelayer.trigger(() => settingsEditorModel.save())));
				});
		}
	}
}

export class DefaultPreferencesEditor extends BaseTextEditor {

	public static ID: string = 'workbench.editor.defaultPreferences';

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IModelService private modelService: IModelService,
		@IModeService modeService: IModeService,
		@ITextFileService textFileService: ITextFileService,
		@IEditorGroupService editorGroupService: IEditorGroupService
	) {
		super(DefaultPreferencesEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, modeService, textFileService, editorGroupService);
	}

	public createEditorControl(parent: Builder, configuration: IEditorOptions): editorCommon.IEditor {
		return this.instantiationService.createInstance(DefaultPreferencesCodeEditor, parent.getHTMLElement(), configuration);
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

abstract class AbstractSettingsEditorContribution extends Disposable {

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

	private _onModelChanged(): void {
		const model = this.editor.getModel();
		this.disposePreferencesRenderer();
		if (model) {
			this.preferencesRendererCreationPromise = this._createPreferencesRenderer();
		}
	}

	private _hasAssociatedPreferencesModelChanged(associatedPreferencesModelUri: URI): TPromise<boolean> {
		return this.preferencesRendererCreationPromise.then(preferencesRenderer => {
			return !(preferencesRenderer && preferencesRenderer.associatedPreferencesModel && preferencesRenderer.associatedPreferencesModel.uri.fsPath === associatedPreferencesModelUri.fsPath);
		});
	}

	private _updatePreferencesRenderer(associatedPreferencesModelUri: URI): TPromise<IPreferencesRenderer<ISetting>> {
		return this.preferencesService.createPreferencesEditorModel<ISetting>(associatedPreferencesModelUri)
			.then(associatedPreferencesEditorModel => {
				return this.preferencesRendererCreationPromise.then(preferencesRenderer => {
					if (preferencesRenderer) {
						if (preferencesRenderer.associatedPreferencesModel) {
							preferencesRenderer.associatedPreferencesModel.dispose();
						}
						preferencesRenderer.associatedPreferencesModel = associatedPreferencesEditorModel;
					}
					return preferencesRenderer;
				});
			});
	}

	private disposePreferencesRenderer(): void {
		if (this.preferencesRendererCreationPromise) {
			this.preferencesRendererCreationPromise.then(preferencesRenderer => {
				if (preferencesRenderer) {
					if (preferencesRenderer.associatedPreferencesModel) {
						preferencesRenderer.associatedPreferencesModel.dispose();
					}
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
}

class DefaultSettingsEditorContribution extends AbstractSettingsEditorContribution implements ISettingsEditorContribution {

	static ID: string = 'editor.contrib.defaultsettings';

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

@editorContribution
class SettingsEditorContribution extends AbstractSettingsEditorContribution implements ISettingsEditorContribution {

	static ID: string = 'editor.contrib.settings';

	getId(): string {
		return SettingsEditorContribution.ID;
	}

	protected _createPreferencesRenderer(): TPromise<IPreferencesRenderer<ISetting>> {
		if (this.isSettingsModel()) {
			return TPromise.join<any>([this.preferencesService.createPreferencesEditorModel(this.preferencesService.defaultSettingsResource), this.preferencesService.createPreferencesEditorModel(this.editor.getModel().uri)])
				.then(([defaultSettingsModel, settingsModel]) => {
					if (settingsModel instanceof SettingsEditorModel && this.editor.getModel()) {
						switch (settingsModel.configurationTarget) {
							case ConfigurationTarget.USER:
								return this.instantiationService.createInstance(UserSettingsRenderer, this.editor, settingsModel, defaultSettingsModel);
							case ConfigurationTarget.WORKSPACE:
								return this.instantiationService.createInstance(WorkspaceSettingsRenderer, this.editor, settingsModel, defaultSettingsModel);
							case ConfigurationTarget.FOLDER:
								return this.instantiationService.createInstance(FolderSettingsRenderer, this.editor, settingsModel, defaultSettingsModel);
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

		if (this.preferencesService.userSettingsResource && this.preferencesService.userSettingsResource.fsPath === model.uri.fsPath) {
			return true;
		}

		if (this.preferencesService.workspaceSettingsResource && this.preferencesService.workspaceSettingsResource.fsPath === model.uri.fsPath) {
			return true;
		}

		const workspace = this.workspaceContextService.getWorkspace();
		if (workspace) {
			for (const root of workspace.roots) {
				const folderSettingsResource = this.preferencesService.getFolderSettingsResource(root);
				if (folderSettingsResource && folderSettingsResource.fsPath === model.uri.fsPath) {
					return true;
				}
			}
		}

		return false;
	}

}

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
