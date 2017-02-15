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
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { SideBySideEditor } from 'vs/workbench/browser/parts/editor/sideBySideEditor';
import { Registry } from 'vs/platform/platform';
import { toResource, SideBySideEditorInput, EditorOptions, EditorInput, IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { BaseEditor, EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { IEditorControl, IEditor } from 'vs/platform/editor/common/editor';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import {
	IPreferencesService, ISettingsGroup, ISetting, IFilterResult, IPreferencesEditorModel,
	CONTEXT_DEFAULT_SETTINGS_EDITOR, DEFAULT_EDITOR_COMMAND_COLLAPSE_ALL, DEFAULT_EDITOR_COMMAND_FOCUS_SEARCH, ISettingsEditorModel
} from 'vs/workbench/parts/preferences/common/preferences';
import { SettingsEditorModel, DefaultSettingsEditorModel } from 'vs/workbench/parts/preferences/common/preferencesModels';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { ICodeEditor, IEditorContributionCtor } from 'vs/editor/browser/editorBrowser';
import { SearchWidget, SettingsTabsWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { CommonEditorRegistry, EditorCommand, Command } from 'vs/editor/common/editorCommonExtensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { VSash } from 'vs/base/browser/ui/sash/sash';
import { Widget } from 'vs/base/browser/ui/widget';
import { IPreferencesRenderer, DefaultSettingsRenderer, UserSettingsRenderer, WorkspaceSettingsRenderer } from 'vs/workbench/parts/preferences/browser/preferencesRenderers';

// Ignore following contributions
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { FindController } from 'vs/editor/contrib/find/browser/find';
import { SelectionHighlighter } from 'vs/editor/contrib/find/common/findController';

export class PreferencesEditorInput extends SideBySideEditorInput {
	public static ID: string = 'workbench.editorinputs.preferencesEditorInput';

	getTypeId(): string {
		return PreferencesEditorInput.ID;
	}
}

export class DefaultPreferencesEditorInput extends ResourceEditorInput {
	public static ID = 'workbench.editorinputs.defaultpreferences';
	constructor(defaultSettingsResource: URI,
		@ITextModelResolverService textModelResolverService: ITextModelResolverService
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

	private headerContainer: HTMLElement;
	private searchWidget: SearchWidget;
	private settingsTabsWidget: SettingsTabsWidget;
	private sideBySidePreferencesWidget: SideBySidePreferencesWidget;
	private preferencesRenderers: PreferencesRenderers;

	private delayedFilterLogging: Delayer<void>;

	private latestEmptyFilters: string[] = [];

	constructor(
		@IPreferencesService private preferencesService: IPreferencesService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(PreferencesEditor.ID, telemetryService);
		this.delayedFilterLogging = new Delayer<void>(1000);
	}

	public createEditor(parent: Builder): void {
		const parentElement = parent.getHTMLElement();
		DOM.addClass(parentElement, 'preferences-editor');

		this.headerContainer = DOM.append(parentElement, DOM.$('.preferences-header'));

		this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, this.headerContainer));
		this._register(this.searchWidget.onDidChange(value => this.filterPreferences(value.trim())));
		this._register(this.searchWidget.onEnter(value => this.preferencesRenderers.focusNextPreference()));

		this.settingsTabsWidget = this._register(this.instantiationService.createInstance(SettingsTabsWidget, this.headerContainer));
		this._register(this.settingsTabsWidget.onSwitch(() => this.switchSettings()));

		const editorsContainer = DOM.append(parentElement, DOM.$('.preferences-editors-container'));
		this.sideBySidePreferencesWidget = this._register(this.instantiationService.createInstance(SideBySidePreferencesWidget, editorsContainer));
		this.preferencesRenderers = this._register(new PreferencesRenderers());
	}

	public setInput(newInput: PreferencesEditorInput, options?: EditorOptions): TPromise<void> {
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
		this.sideBySidePreferencesWidget.focus();
	}

	public clearInput(): void {
		this.sideBySidePreferencesWidget.clearInput();
		super.clearInput();
	}

	private updateInput(oldInput: PreferencesEditorInput, newInput: PreferencesEditorInput, options?: EditorOptions): TPromise<void> {
		const editablePreferencesUri = toResource(newInput.master);
		this.settingsTabsWidget.show(editablePreferencesUri.toString() === this.preferencesService.userSettingsResource.toString() ? ConfigurationTarget.USER : ConfigurationTarget.WORKSPACE);

		return this.sideBySidePreferencesWidget.setInput(<DefaultPreferencesEditorInput>newInput.details, newInput.master, options).then(({ defaultPreferencesRenderer, editablePreferencesRenderer }) => {
			this.preferencesRenderers.defaultPreferencesRenderer = defaultPreferencesRenderer;
			this.preferencesRenderers.editablePreferencesRenderer = editablePreferencesRenderer;
			this.filterPreferences(this.searchWidget.value());
		});
	}

	private switchSettings(): void {
		// Focus the editor if this editor is not active editor
		if (this.editorService.getActiveEditor() !== this) {
			this.focus();
		}
		const promise = this.input.isDirty() ? this.input.save() : TPromise.as(true);
		promise.done(value => this.preferencesService.switchSettings());
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

class PreferencesRenderers extends Disposable {

	private _defaultPreferencesRenderer: IPreferencesRenderer<ISetting>;
	private _editablePreferencesRenderer: IPreferencesRenderer<ISetting>;

	private _disposables: IDisposable[] = [];

	public get defaultPreferencesRenderer(): IPreferencesRenderer<ISetting> {
		return this._defaultPreferencesRenderer;
	}

	public set defaultPreferencesRenderer(defaultPreferencesRenderer: IPreferencesRenderer<ISetting>) {
		if (this._defaultPreferencesRenderer !== defaultPreferencesRenderer) {
			this._defaultPreferencesRenderer = defaultPreferencesRenderer;

			this._disposables = dispose(this._disposables);
			this._defaultPreferencesRenderer.onUpdatePreference(({key, value, source}) => this._updatePreference(key, value, source, this._editablePreferencesRenderer), this, this._disposables);
			this._defaultPreferencesRenderer.onFocusPreference(preference => this._focusPreference(preference, this._editablePreferencesRenderer), this, this._disposables);
			this._defaultPreferencesRenderer.onClearFocusPreference(preference => this._clearFocus(preference, this._editablePreferencesRenderer), this, this._disposables);
		}
	}

	public set editablePreferencesRenderer(editableSettingsRenderer: IPreferencesRenderer<ISetting>) {
		this._editablePreferencesRenderer = editableSettingsRenderer;
	}

	public filterPreferences(filter: string): number {
		const filterResult = filter ? (<ISettingsEditorModel>this._defaultPreferencesRenderer.preferencesModel).filterSettings(filter) : null;
		this._filterPreferences(filterResult, this._defaultPreferencesRenderer);
		this._filterPreferences(filterResult, this._editablePreferencesRenderer);
		return this._getCount(filterResult ? filterResult.filteredGroups : (this._defaultPreferencesRenderer ? (<ISettingsEditorModel>this._defaultPreferencesRenderer.preferencesModel).settingsGroups : []));
	}

	public focusNextPreference() {
		const setting = this._defaultPreferencesRenderer.iterator.next();
		this._focusPreference(setting, this._defaultPreferencesRenderer);
		this._focusPreference(setting, this._editablePreferencesRenderer);
	}

	private _filterPreferences(filterResult: IFilterResult, preferencesRenderer: IPreferencesRenderer<ISetting>): void {
		if (preferencesRenderer) {
			preferencesRenderer.filterPreferences(filterResult);
		}
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

	private _getCount(settingsGroups: ISettingsGroup[]): number {
		let count = 0;
		for (const group of settingsGroups) {
			for (const section of group.sections) {
				count += section.settings.length;
			}
		}
		return count;
	}

	public dispose(): void {
		dispose(this._disposables);
		super.dispose();
	}
}

class SideBySidePreferencesWidget extends Widget {

	private dimension: Dimension;

	private defaultPreferencesEditor: DefaultPreferencesEditor;
	private defaultPreferencesEditorContainer: HTMLElement;
	private editablePreferencesEditor: BaseEditor;
	private editablePreferencesEditorContainer: HTMLElement;

	private sash: VSash;

	constructor(parent: HTMLElement, @IInstantiationService private instantiationService: IInstantiationService) {
		super();
		this.create(parent);
	}

	private create(parentElement: HTMLElement): void {
		DOM.addClass(parentElement, 'side-by-side-preferences-editor');
		this.createSash(parentElement);

		this.defaultPreferencesEditorContainer = DOM.append(parentElement, DOM.$('.default-preferences-editor-container'));
		this.defaultPreferencesEditorContainer.style.position = 'absolute';
		this.defaultPreferencesEditor = this.instantiationService.createInstance(DefaultPreferencesEditor);
		this.defaultPreferencesEditor.create(new Builder(this.defaultPreferencesEditorContainer));
		this.defaultPreferencesEditor.setVisible(true);

		this.editablePreferencesEditorContainer = DOM.append(parentElement, DOM.$('.editable-preferences-editor-container'));
		this.editablePreferencesEditorContainer.style.position = 'absolute';
	}

	public setInput(defaultPreferencesEditorInput: DefaultPreferencesEditorInput, editablePreferencesEditorInput: EditorInput, options?: EditorOptions): TPromise<{ defaultPreferencesRenderer: IPreferencesRenderer<ISetting>, editablePreferencesRenderer: IPreferencesRenderer<ISetting> }> {
		return this.getOrCreateEditablePreferencesEditor(editablePreferencesEditorInput)
			.then(() => {
				this.dolayout(this.sash.getVerticalSashLeft());
				return TPromise.join([this.defaultPreferencesEditor.updateInput(defaultPreferencesEditorInput, options, toResource(editablePreferencesEditorInput)),
				this.editablePreferencesEditor.setInput(editablePreferencesEditorInput, options)])
					.then(() => {
						return {
							defaultPreferencesRenderer: (<CodeEditor>this.defaultPreferencesEditor.getControl()).getContribution<DefaultSettingsEditorContribution>(DefaultSettingsEditorContribution.ID).getPreferencesRenderer(),
							editablePreferencesRenderer: (<CodeEditor>this.editablePreferencesEditor.getControl()).getContribution<SettingsEditorContribution>(SettingsEditorContribution.ID).getPreferencesRenderer()
						};
					});
			});
	}

	public layout(dimension: Dimension): void {
		this.dimension = dimension;
		this.sash.setDimenesion(this.dimension);
	}

	public focus(): void {
		if (this.editablePreferencesEditor) {
			this.editablePreferencesEditor.focus();
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
				return editor;
			});
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

export class DefaultPreferencesEditor extends BaseTextEditor {

	public static ID: string = 'workbench.editor.defaultPreferences';

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IThemeService themeService: IThemeService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IModelService private modelService: IModelService,
		@IModeService modeService: IModeService,
	) {
		super(DefaultPreferencesEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, modeService);
	}

	public createEditorControl(parent: Builder, configuration: editorCommon.IEditorOptions): editorCommon.IEditor {
		return this.instantiationService.createInstance(DefaultPreferencesCodeEditor, parent.getHTMLElement(), configuration);
	}

	protected getConfigurationOverrides(): editorCommon.IEditorOptions {
		const options = super.getConfigurationOverrides();
		options.readOnly = true;
		if (this.input) {
			options.lineNumbers = 'off';
			options.renderLineHighlight = 'none';
			options.scrollBeyondLastLine = false;
			options.folding = false;
			options.renderWhitespace = 'none';
			options.wrappingColumn = 0;
			options.renderIndentGuides = false;
			options.rulers = [];
			options.glyphMargin = true;
		}
		return options;
	}

	updateInput(input: DefaultPreferencesEditorInput, options: EditorOptions, editablePreferencesUri: URI): TPromise<void> {
		return this.setInput(input, options)
			.then(() => this.input.resolve()
				.then(editorModel => TPromise.join<any>([
					editorModel.load(),
					this.preferencesService.resolvePreferencesEditorModel(editablePreferencesUri)
				]))
				.then(([editorModel, preferencesModel]) => (<DefaultPreferencesCodeEditor>this.getControl()).setModels((<ResourceEditorModel>editorModel).textEditorModel, <SettingsEditorModel>preferencesModel)));
	}

	public layout(dimension: Dimension) {
		this.getControl().layout(dimension);
	}

	public clearInput(): void {
		this.getControl().setModel(null);
		super.clearInput();
	}

	protected getAriaLabel(): string {
		return nls.localize('preferencesAriaLabel', "Default preferences. Readonly text editor.");
	}
}

class DefaultPreferencesCodeEditor extends CodeEditor {

	public settingsModel: IPreferencesEditorModel<ISetting>;

	protected _getContributions(): IEditorContributionCtor[] {
		let contributions = super._getContributions();
		let skipContributions = [FoldingController.prototype, SelectionHighlighter.prototype, FindController.prototype];
		contributions = contributions.filter(c => skipContributions.indexOf(c.prototype) === -1);
		contributions.push(DefaultSettingsEditorContribution);
		return contributions;
	}

	setModels(model: editorCommon.IModel, settingsModel: SettingsEditorModel): void {
		this.settingsModel = settingsModel;
		super.setModel(model);
		const renderer = this.getContribution<DefaultSettingsEditorContribution>(DefaultSettingsEditorContribution.ID).getPreferencesRenderer();
		if (renderer) {
			renderer.associatedPreferencesModel = this.settingsModel;
		}
	}
}

export abstract class PreferencesEditorContribution<T> extends Disposable implements editorCommon.IEditorContribution {

	private preferencesRenderer: IPreferencesRenderer<T>;

	constructor(protected editor: ICodeEditor,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IPreferencesService protected preferencesService: IPreferencesService
	) {
		super();
		this._register(editor.onDidChangeModel(() => this.onModelChanged()));
	}

	private onModelChanged(): void {
		const model = this.editor.getModel();
		this.disposePreferencesRenderer();
		if (model) {
			this.createPreferencesRenderer()
				.then(preferencesRenderer => {
					this.preferencesRenderer = preferencesRenderer;
					if (this.preferencesRenderer) {
						this.preferencesRenderer.render();
					}
				});
		}
	}

	getPreferencesRenderer(): IPreferencesRenderer<T> {
		return this.preferencesRenderer;
	}

	protected abstract createPreferencesRenderer(): TPromise<IPreferencesRenderer<T>>
	abstract getId(): string;

	private disposePreferencesRenderer() {
		if (this.preferencesRenderer) {
			this.preferencesRenderer.dispose();
			this.preferencesRenderer = null;
		}
	}

	public dispose() {
		this.disposePreferencesRenderer();
		super.dispose();
	}
}

export class DefaultSettingsEditorContribution extends PreferencesEditorContribution<ISetting> implements editorCommon.IEditorContribution {

	static ID: string = 'editor.contrib.defaultsettings';

	protected createPreferencesRenderer(): TPromise<IPreferencesRenderer<ISetting>> {
		return this.preferencesService.resolvePreferencesEditorModel(this.editor.getModel().uri)
			.then(editorModel => {
				if (editorModel instanceof DefaultSettingsEditorModel) {
					return this.instantiationService.createInstance(DefaultSettingsRenderer, this.editor, editorModel, (<DefaultPreferencesCodeEditor>this.editor).settingsModel);
				}
				return null;
			});
	}

	getId(): string {
		return DefaultSettingsEditorContribution.ID;
	}
}

@editorContribution
export class SettingsEditorContribution extends PreferencesEditorContribution<ISetting> implements editorCommon.IEditorContribution {

	static ID: string = 'editor.contrib.settings';

	getId(): string {
		return SettingsEditorContribution.ID;
	}

	protected createPreferencesRenderer(): TPromise<IPreferencesRenderer<ISetting>> {
		return TPromise.join<any>([this.preferencesService.createDefaultPreferencesEditorModel(this.preferencesService.defaultSettingsResource), this.preferencesService.resolvePreferencesEditorModel(this.editor.getModel().uri)])
			.then(([defaultSettingsModel, settingsModel]) => {
				if (settingsModel instanceof SettingsEditorModel) {
					if (ConfigurationTarget.USER === settingsModel.configurationTarget) {
						return this.instantiationService.createInstance(UserSettingsRenderer, this.editor, settingsModel, defaultSettingsModel);
					}
					return this.instantiationService.createInstance(WorkspaceSettingsRenderer, this.editor, settingsModel, defaultSettingsModel);
				}
				return null;
			});
	}
}

const DefaultSettingsEditorCommand = EditorCommand.bindToContribution<PreferencesEditorContribution<ISetting>>((editor: editorCommon.ICommonCodeEditor) => <PreferencesEditorContribution<ISetting>>editor.getContribution(DefaultSettingsEditorContribution.ID));

CommonEditorRegistry.registerEditorCommand(new DefaultSettingsEditorCommand({
	id: DEFAULT_EDITOR_COMMAND_COLLAPSE_ALL,
	precondition: ContextKeyExpr.and(CONTEXT_DEFAULT_SETTINGS_EDITOR),
	handler: x => (<DefaultSettingsRenderer>x.getPreferencesRenderer()).collapseAll()
}));

class StartSearchDefaultSettingsCommand extends Command {

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const defaultPreferencesEditor = this.getDefaultPreferencesEditor(accessor);
		if (defaultPreferencesEditor) {
			defaultPreferencesEditor.focus();
		}
	}

	private getDefaultPreferencesEditor(accessor: ServicesAccessor): DefaultPreferencesEditor {
		const activeEditor = accessor.get(IWorkbenchEditorService).getActiveEditor();
		if (activeEditor instanceof SideBySideEditor) {
			const detailsEditor = activeEditor.getDetailsEditor();
			if (detailsEditor instanceof DefaultPreferencesEditor) {
				return detailsEditor;
			}
		}
		return null;
	}
}

CommonEditorRegistry.registerEditorCommand(new StartSearchDefaultSettingsCommand({
	id: DEFAULT_EDITOR_COMMAND_FOCUS_SEARCH,
	precondition: ContextKeyExpr.and(CONTEXT_DEFAULT_SETTINGS_EDITOR),
	kbOpts: { primary: KeyMod.CtrlCmd | KeyCode.KEY_F }
}));