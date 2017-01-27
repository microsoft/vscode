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
import { flatten, distinct } from 'vs/base/common/arrays';
import { ArrayNavigator, IIterator } from 'vs/base/common/iterator';
import { IAction } from 'vs/base/common/actions';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import Event, { Emitter } from 'vs/base/common/event';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { SideBySideEditor } from 'vs/workbench/browser/parts/editor/sideBySideEditor';
import { Registry } from 'vs/platform/platform';
import { toResource, SideBySideEditorInput, EditorOptions, EditorInput, IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { BaseEditor, EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { IEditorControl, IEditor } from 'vs/platform/editor/common/editor';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { Range } from 'vs/editor/common/core/range';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import {
	IPreferencesService, ISettingsGroup, ISetting, IPreferencesEditorModel, IFilterResult, CONTEXT_DEFAULT_SETTINGS_EDITOR,
	DEFAULT_EDITOR_COMMAND_COLLAPSE_ALL, DEFAULT_EDITOR_COMMAND_FOCUS_SEARCH, ISettingsEditorModel
} from 'vs/workbench/parts/preferences/common/preferences';
import { SettingsEditorModel, DefaultSettingsEditorModel } from 'vs/workbench/parts/preferences/common/preferencesModels';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { ICodeEditor, IEditorMouseEvent, IEditorContributionCtor } from 'vs/editor/browser/editorBrowser';
import { IContextMenuService, ContextSubMenu } from 'vs/platform/contextview/browser/contextView';
import { SearchWidget, SettingsTabsWidget, SettingsGroupTitleWidget, EditPreferenceWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { IContextKeyService, IContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { CommonEditorRegistry, EditorCommand, Command } from 'vs/editor/common/editorCommonExtensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { RangeHighlightDecorations } from 'vs/workbench/common/editor/rangeDecorations';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { VSash } from 'vs/base/browser/ui/sash/sash';
import { Widget } from 'vs/base/browser/ui/widget';
import { overrideIdentifierFromKey } from 'vs/platform/configuration/common/model';
import { IMarkerService, IMarkerData } from 'vs/platform/markers/common/markers';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';

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

	private delayedFilterLogging: Delayer<void>;
	private disposablesByInput: IDisposable[] = [];

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
		this._register(this.searchWidget.onEnter(value => this.focusNextPreference()));

		this.settingsTabsWidget = this._register(this.instantiationService.createInstance(SettingsTabsWidget, this.headerContainer));
		this._register(this.settingsTabsWidget.onSwitch(() => this.switchSettings()));

		const editorsContainer = DOM.append(parentElement, DOM.$('.preferences-editors-container'));
		this.sideBySidePreferencesWidget = this._register(this.instantiationService.createInstance(SideBySidePreferencesWidget, editorsContainer));
	}

	public setInput(newInput: PreferencesEditorInput, options?: EditorOptions): TPromise<void> {
		const oldInput = <PreferencesEditorInput>this.input;
		return super.setInput(newInput, options)
			.then(() => this.updateInput(oldInput, newInput, options));
	}

	public layout(dimension: Dimension): void {
		DOM.toggleClass(this.headerContainer, 'vertical-layout', dimension.width < 700);
		this.searchWidget.layout(dimension);
		const headerHeight = DOM.getTotalHeight(this.headerContainer);
		this.sideBySidePreferencesWidget.layout(new Dimension(dimension.width, dimension.height - headerHeight));
	}

	public getControl(): IEditorControl {
		const editablePreferencesEditor = this.sideBySidePreferencesWidget.getEditablePreferencesEditor();
		return editablePreferencesEditor ? editablePreferencesEditor.getControl() : null;
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

		this.disposablesByInput = dispose(this.disposablesByInput);
		return this.sideBySidePreferencesWidget.setInput(<DefaultPreferencesEditorInput>newInput.details, newInput.master, options).then(() => {
			this.showTotalCount();
			if (!this.getDefaultPreferencesRenderer()) {
				return;
			}
			this.getDefaultPreferencesRenderer().onFocusPreference(setting => this.getEditablePreferencesRenderer().focusPreference(setting), this.disposablesByInput);
			this.getDefaultPreferencesRenderer().onClearFocusPreference(setting => this.getEditablePreferencesRenderer().clearFocus(setting), this.disposablesByInput);
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
		if (!this.getDefaultPreferencesRenderer()) {
			return;
		}
		const defaultPreferencesRenderer = this.getDefaultPreferencesRenderer();
		const editablePreferencesRender = this.getEditablePreferencesRenderer();
		if (filter) {
			const filterResult = defaultPreferencesRenderer.preferencesModel.filterSettings(filter);
			defaultPreferencesRenderer.filterPreferences(filterResult);
			editablePreferencesRender.filterPreferences(filterResult);
			const count = this.getCount(filterResult.filteredGroups);
			this.searchWidget.showMessage(this.showSearchResultsMessage(count), count);

			if (count === 0) {
				this.latestEmptyFilters.push(filter);
			}
			this.delayedFilterLogging.trigger(() => this.reportFilteringUsed(filter));
		} else {
			defaultPreferencesRenderer.filterPreferences(null);
			editablePreferencesRender.filterPreferences(null);
			this.showTotalCount();
		}
	}

	private showTotalCount(): void {
		if (this.getDefaultPreferencesRenderer()) {
			const count = this.getCount(this.getDefaultPreferencesRenderer().preferencesModel.settingsGroups);
			this.searchWidget.showMessage(nls.localize('totalSettingsMessage', "Total {0} Settings", count), count);
		}
	}

	private showSearchResultsMessage(count: number): string {
		return count === 0 ? nls.localize('noSettingsFound', "No Results") :
			count === 1 ? nls.localize('oneSettingFound', "1 Setting matched") :
				nls.localize('settingsFound', "{0} Settings matched", count);
	}

	private focusNextPreference() {
		const defaultPreferencesRenderer = this.getDefaultPreferencesRenderer();
		if (defaultPreferencesRenderer) {
			const setting = defaultPreferencesRenderer.iterator.next();
			if (setting) {
				defaultPreferencesRenderer.focusPreference(setting);
				this.getEditablePreferencesRenderer().focusPreference(setting);
			}
		}
	}

	private getDefaultPreferencesRenderer(): IPreferencesRenderer<ISetting> {
		const detailsEditor = this.sideBySidePreferencesWidget.getDefaultPreferencesEditor();
		if (detailsEditor) {
			return (<CodeEditor>this.sideBySidePreferencesWidget.getDefaultPreferencesEditor().getControl()).getContribution<PreferencesEditorContribution<ISetting>>(DefaultSettingsEditorContribution.ID).getPreferencesRenderer();
		}
		return null;
	}

	private getEditablePreferencesRenderer(): IPreferencesRenderer<ISetting> {
		if (this.sideBySidePreferencesWidget.getEditablePreferencesEditor()) {
			return (<CodeEditor>this.sideBySidePreferencesWidget.getEditablePreferencesEditor().getControl()).getContribution<PreferencesEditorContribution<ISetting>>(SettingsEditorContribution.ID).getPreferencesRenderer();
		}
		return null;
	}

	private reportFilteringUsed(filter: string): void {
		let data = {
			filter,
			emptyFilters: this.getLatestEmptyFiltersForTelemetry()
		};
		this.latestEmptyFilters = [];
		this.telemetryService.publicLog('defaultSettings.filter', data);
	}

	/**
	 * Put a rough limit on the size of the telemetry data, since otherwise it could be an unbounded large amount
	 * of data. 8192 is the max size of a property value. This is rough since that probably includes ""s, etc.
	 */
	private getLatestEmptyFiltersForTelemetry(): string[] {
		let cumulativeSize = 0;
		return this.latestEmptyFilters.filter(filterText => (cumulativeSize += filterText.length) <= 8192);
	}

	private getCount(settingsGroups: ISettingsGroup[]): number {
		let count = 0;
		for (const group of settingsGroups) {
			for (const section of group.sections) {
				count += section.settings.length;
			}
		}
		return count;
	}
}

export class SideBySidePreferencesWidget extends Widget {

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

	public setInput(defaultPreferencesEditorInput: DefaultPreferencesEditorInput, editablePreferencesEditorInput: EditorInput, options?: EditorOptions): TPromise<void> {
		return this.getOrCreateEditablePreferencesEditor(editablePreferencesEditorInput)
			.then(() => {
				this.dolayout(this.sash.getVerticalSashLeft());
				return TPromise.join([this.defaultPreferencesEditor.updateInput(defaultPreferencesEditorInput, options, toResource(editablePreferencesEditorInput), this.editablePreferencesEditor),
				this.editablePreferencesEditor.setInput(editablePreferencesEditorInput, options)])
					.then(() => null);
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

	public getEditablePreferencesEditor(): IEditor {
		return this.editablePreferencesEditor;
	}

	public getDefaultPreferencesEditor(): DefaultPreferencesEditor {
		return this.defaultPreferencesEditor;
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

	updateInput(input: DefaultPreferencesEditorInput, options: EditorOptions, editablePreferencesUri: URI, settingsEditor: BaseEditor): TPromise<void> {
		return this.setInput(input, options)
			.then(() => this.input.resolve()
				.then(editorModel => TPromise.join<any>([
					editorModel.load(),
					this.preferencesService.resolvePreferencesEditorModel(editablePreferencesUri)
				]))
				.then(([editorModel, preferencesModel]) => (<DefaultPreferencesCodeEditor>this.getControl()).setModels((<ResourceEditorModel>editorModel).textEditorModel, <SettingsEditorModel>preferencesModel, settingsEditor)));
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

	private _settingsModel: SettingsEditorModel;
	private _settingsEditor: BaseEditor;

	protected _getContributions(): IEditorContributionCtor[] {
		let contributions = super._getContributions();
		let skipContributions = [FoldingController.prototype, SelectionHighlighter.prototype, FindController.prototype];
		contributions = contributions.filter(c => skipContributions.indexOf(c.prototype) === -1);
		contributions.push(DefaultSettingsEditorContribution);
		return contributions;
	}

	setModels(model: editorCommon.IModel, settingsModel: SettingsEditorModel, settingsEditor: BaseEditor): void {
		this._settingsModel = settingsModel;
		this._settingsEditor = settingsEditor;
		return super.setModel(model);
	}

	get settingsModel(): SettingsEditorModel {
		return this._settingsModel;
	}

	get settingsEditor(): BaseEditor {
		return this._settingsEditor;
	}
}

export interface IPreferencesRenderer<T> {
	iterator: IIterator<ISetting>;
	onFocusPreference: Event<ISetting>;
	onClearFocusPreference: Event<ISetting>;
	preferencesModel: ISettingsEditorModel;
	render(): void;
	updatePreference(key: string, value: any, source: T): void;
	filterPreferences(filterResult: IFilterResult): void;
	focusPreference(setting: ISetting): void;
	clearFocus(setting: ISetting): void;
	dispose();
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
			this.preferencesService.resolvePreferencesEditorModel(model.uri)
				.then(editorModel => {
					if (editorModel) {
						this.preferencesRenderer = this.createPreferencesRenderer(editorModel);
						if (this.preferencesRenderer) {
							this.preferencesRenderer.render();
						}
					}
				});
		}
	}

	getPreferencesRenderer(): IPreferencesRenderer<T> {
		return this.preferencesRenderer;
	}

	protected abstract createPreferencesRenderer(editorModel: IPreferencesEditorModel<any>): IPreferencesRenderer<T>
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

	protected createPreferencesRenderer(editorModel: IPreferencesEditorModel<ISetting>): IPreferencesRenderer<ISetting> {
		if (editorModel instanceof DefaultSettingsEditorModel) {
			return this.instantiationService.createInstance(DefaultSettingsRenderer, this.editor, editorModel);
		}
		return null;
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

	protected createPreferencesRenderer(editorModel: IPreferencesEditorModel<ISetting>): IPreferencesRenderer<ISetting> {
		if (editorModel instanceof SettingsEditorModel) {
			return this.instantiationService.createInstance(SettingsRenderer, this.editor, editorModel);
		}
		return null;
	}
}

export class SettingsRenderer extends Disposable implements IPreferencesRenderer<ISetting> {

	private initializationPromise: TPromise<void>;
	private settingHighlighter: SettingHighlighter;
	private editSettingActionRenderer: EditSettingRenderer;
	private highlightPreferencesRenderer: HighlightPreferencesRenderer;
	private defaultSettingsModel: DefaultSettingsEditorModel;
	private untrustedSettingRenderer: UnTrustedWorkspaceSettingsRenderer;
	private modelChangeDelayer: Delayer<void> = new Delayer<void>(200);

	private _onFocusPreference: Emitter<ISetting> = new Emitter<ISetting>();
	public readonly onFocusPreference: Event<ISetting> = this._onFocusPreference.event;

	private _onClearFocusPreference: Emitter<ISetting> = new Emitter<ISetting>();
	public readonly onClearFocusPreference: Event<ISetting> = this._onClearFocusPreference.event;

	private filterResult: IFilterResult;

	constructor(protected editor: ICodeEditor, public readonly preferencesModel: SettingsEditorModel,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService,
		@IMessageService private messageService: IMessageService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();
		if (ConfigurationTarget.WORKSPACE === preferencesModel.configurationTarget) {
			this.untrustedSettingRenderer = this._register(instantiationService.createInstance(UnTrustedWorkspaceSettingsRenderer, editor, preferencesModel));
		}
		this.settingHighlighter = this._register(instantiationService.createInstance(SettingHighlighter, editor, this._onFocusPreference, this._onClearFocusPreference));
		this.highlightPreferencesRenderer = this._register(instantiationService.createInstance(HighlightPreferencesRenderer, editor));
		this.initializationPromise = this.initialize();
	}

	public get iterator(): IIterator<ISetting> {
		return null;
	}

	public render(): void {
		this.initializationPromise.then(() => {
			this.editSettingActionRenderer.render(this.preferencesModel.settingsGroups);
			if (this.untrustedSettingRenderer) {
				this.untrustedSettingRenderer.render();
			}
			if (this.filterResult) {
				this.filterPreferences(this.filterResult);
			}
		});
	}

	private initialize(): TPromise<void> {
		return this.preferencesService.createDefaultPreferencesEditorModel(this.preferencesService.defaultSettingsResource)
			.then(defaultSettingsModel => {
				this.defaultSettingsModel = <DefaultSettingsEditorModel>defaultSettingsModel;
				this.editSettingActionRenderer = this._register(this.instantiationService.createInstance(EditSettingRenderer, this.editor, this.preferencesModel, () => defaultSettingsModel, this.settingHighlighter));
				this._register(this.editSettingActionRenderer.onUpdateSetting(({key, value, source}) => this.updatePreference(key, value, source)));
				this._register(this.editor.getModel().onDidChangeContent(() => this.modelChangeDelayer.trigger(() => this.onModelChanged())));
				return null;
			});
	}

	public updatePreference(key: string, value: any, source: ISetting): void {
		this.telemetryService.publicLog('defaultSettingsActions.copySetting', { userConfigurationKeys: [key] });
		const overrideIdentifier = source.overrideOf ? overrideIdentifierFromKey(source.overrideOf.key) : null;
		this.configurationEditingService.writeConfiguration(this.preferencesModel.configurationTarget, { key, value, overrideIdentifier }, { writeToBuffer: true, autoSave: true })
			.then(() => this.onSettingUpdated(source), error => this.messageService.show(Severity.Error, error));
	}

	private onModelChanged(): void {
		if (!this.editor.getModel()) {
			// model could have been disposed during the delay
			return;
		}
		this.render();
	}

	private onSettingUpdated(setting: ISetting) {
		this.editor.focus();
		setting = this.getSetting(setting);
		if (setting) {
			// TODO:@sandy Selection range should be template range
			this.editor.setSelection(setting.valueRange);
			this.settingHighlighter.highlight(setting, true);
		}
	}

	private getSetting(setting: ISetting): ISetting {
		const {key, overrideOf} = setting;
		if (overrideOf) {
			const setting = this.getSetting(overrideOf);
			for (const override of setting.overrides) {
				if (override.key === key) {
					return override;
				}
			}
			return null;
		}
		return this.preferencesModel.getPreference(key);
	}

	public filterPreferences(filterResult: IFilterResult): void {
		this.filterResult = filterResult;
		this.highlightPreferencesRenderer.render([]);
		this.settingHighlighter.clear(true);
		if (this.defaultSettingsModel && filterResult) {
			const settings = distinct(filterResult.filteredGroups.reduce((settings: ISetting[], settingsGroup: ISettingsGroup) => {
				for (const section of settingsGroup.sections) {
					for (const setting of section.settings) {
						const s = this.getSetting(setting);
						if (s) {
							settings.push(s);
						}
					}
				}
				return settings;
			}, []));
			this.highlightPreferencesRenderer.render(settings);
		}
	}

	public focusPreference(setting: ISetting): void {
		const s = this.getSetting(setting);
		if (s) {
			this.settingHighlighter.highlight(s, true);
		} else {
			this.settingHighlighter.clear(true);
		}
	}

	public clearFocus(setting: ISetting): void {
		this.settingHighlighter.clear(true);
	}
}

export class DefaultSettingsRenderer extends Disposable implements IPreferencesRenderer<ISetting> {

	private defaultSettingsEditorContextKey: IContextKey<boolean>;

	private settingHighlighter: SettingHighlighter;
	private settingsGroupTitleRenderer: SettingsGroupTitleRenderer;
	private filteredMatchesRenderer: FilteredMatchesRenderer;
	private filteredSettingsNavigationRenderer: FilteredSettingsNavigationRenderer;
	private hiddenAreasRenderer: HiddenAreasRenderer;
	private editSettingActionRenderer: EditSettingRenderer;

	private _onFocusPreference: Emitter<ISetting> = new Emitter<ISetting>();
	public readonly onFocusPreference: Event<ISetting> = this._onFocusPreference.event;

	private _onClearFocusPreference: Emitter<ISetting> = new Emitter<ISetting>();
	public readonly onClearFocusPreference: Event<ISetting> = this._onClearFocusPreference.event;

	constructor(protected editor: ICodeEditor, public readonly preferencesModel: DefaultSettingsEditorModel,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();
		this.defaultSettingsEditorContextKey = CONTEXT_DEFAULT_SETTINGS_EDITOR.bindTo(contextKeyService);
		this.settingHighlighter = this._register(instantiationService.createInstance(SettingHighlighter, editor, this._onFocusPreference, this._onClearFocusPreference));
		this.settingsGroupTitleRenderer = this._register(instantiationService.createInstance(SettingsGroupTitleRenderer, editor));
		this.filteredMatchesRenderer = this._register(instantiationService.createInstance(FilteredMatchesRenderer, editor));
		this.filteredSettingsNavigationRenderer = this._register(instantiationService.createInstance(FilteredSettingsNavigationRenderer, editor, this.settingHighlighter));
		this.editSettingActionRenderer = this._register(instantiationService.createInstance(EditSettingRenderer, editor, preferencesModel, () => (<DefaultPreferencesCodeEditor>this.editor).settingsModel, this.settingHighlighter));
		this._register(this.editSettingActionRenderer.onUpdateSetting(({key, value, source}) => this.updatePreference(key, value, source)));
		const paranthesisHidingRenderer = this._register(instantiationService.createInstance(StaticContentHidingRenderer, editor, preferencesModel.settingsGroups));
		this.hiddenAreasRenderer = this._register(instantiationService.createInstance(HiddenAreasRenderer, editor, [this.settingsGroupTitleRenderer, this.filteredMatchesRenderer, paranthesisHidingRenderer]));

		this._register(this.settingsGroupTitleRenderer.onHiddenAreasChanged(() => this.hiddenAreasRenderer.render()));
	}

	public get iterator(): IIterator<ISetting> {
		return this.filteredSettingsNavigationRenderer;
	}

	public render() {
		this.defaultSettingsEditorContextKey.set(true);
		this.settingsGroupTitleRenderer.render(this.preferencesModel.settingsGroups);
		this.editSettingActionRenderer.render(this.preferencesModel.settingsGroups);
		this.hiddenAreasRenderer.render();
		this.filteredSettingsNavigationRenderer.render([]);
		this.settingsGroupTitleRenderer.showGroup(1);
		this.hiddenAreasRenderer.render();
	}

	public filterPreferences(filterResult: IFilterResult): void {
		if (!filterResult) {
			this.filteredSettingsNavigationRenderer.render([]);
			this.filteredMatchesRenderer.render(null);
			this.settingsGroupTitleRenderer.render(this.preferencesModel.settingsGroups);
			this.settingsGroupTitleRenderer.showGroup(1);
		} else {
			this.filteredMatchesRenderer.render(filterResult);
			this.settingsGroupTitleRenderer.render(filterResult.filteredGroups);
			this.filteredSettingsNavigationRenderer.render(filterResult.filteredGroups);
		}
		this.hiddenAreasRenderer.render();
	}

	public focusPreference(setting: ISetting): void {
		this.settingsGroupTitleRenderer.showSetting(setting);
		this.settingHighlighter.highlight(setting, true);
	}

	public clearFocus(setting: ISetting): void {
		this.settingHighlighter.clear(true);
	}

	public collapseAll() {
		this.settingsGroupTitleRenderer.collapseAll();
	}

	public updatePreference(key: string, value: any, source: ISetting): void {
		const settingsEditor = this.getEditableSettingsEditor();
		if (settingsEditor) {
			settingsEditor.getContribution<PreferencesEditorContribution<ISetting>>(SettingsEditorContribution.ID).getPreferencesRenderer().updatePreference(key, value, source);
		}
	}

	private getEditableSettingsEditor(): editorCommon.ICommonCodeEditor {
		return <editorCommon.ICommonCodeEditor>(<DefaultPreferencesCodeEditor>this.editor).settingsEditor.getControl();
	}

	dispose() {
		this.defaultSettingsEditorContextKey.set(false);
		super.dispose();
	}
}

export interface HiddenAreasProvider {
	hiddenAreas: editorCommon.IRange[];
}

export class StaticContentHidingRenderer extends Disposable implements HiddenAreasProvider {

	constructor(private editor: ICodeEditor, private settingsGroups: ISettingsGroup[]
	) {
		super();
	}

	get hiddenAreas(): editorCommon.IRange[] {
		const model = this.editor.getModel();
		return [
			{
				startLineNumber: 1,
				startColumn: model.getLineMinColumn(1),
				endLineNumber: 2,
				endColumn: model.getLineMaxColumn(2)
			},
			{
				startLineNumber: this.settingsGroups[0].range.endLineNumber + 1,
				startColumn: model.getLineMinColumn(this.settingsGroups[0].range.endLineNumber + 1),
				endLineNumber: this.settingsGroups[0].range.endLineNumber + 4,
				endColumn: model.getLineMaxColumn(this.settingsGroups[0].range.endLineNumber + 4)
			},
			{
				startLineNumber: model.getLineCount() - 1,
				startColumn: model.getLineMinColumn(model.getLineCount() - 1),
				endLineNumber: model.getLineCount(),
				endColumn: model.getLineMaxColumn(model.getLineCount())
			}
		];
	}

}

export class SettingsGroupTitleRenderer extends Disposable implements HiddenAreasProvider {

	private _onHiddenAreasChanged: Emitter<void> = new Emitter<void>();
	get onHiddenAreasChanged(): Event<void> { return this._onHiddenAreasChanged.event; };

	private settingsGroups: ISettingsGroup[];
	private hiddenGroups: ISettingsGroup[] = [];
	private settingsGroupTitleWidgets: SettingsGroupTitleWidget[];
	private disposables: IDisposable[] = [];

	constructor(private editor: ICodeEditor,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
	}

	public get hiddenAreas(): editorCommon.IRange[] {
		const hiddenAreas: editorCommon.IRange[] = [];
		for (const group of this.hiddenGroups) {
			hiddenAreas.push(group.range);
		}
		return hiddenAreas;
	}

	public render(settingsGroups: ISettingsGroup[]) {
		this.disposeWidgets();
		this.settingsGroups = settingsGroups.slice();
		this.settingsGroupTitleWidgets = [];
		for (const group of this.settingsGroups.slice().reverse()) {
			const settingsGroupTitleWidget = this.instantiationService.createInstance(SettingsGroupTitleWidget, this.editor, group);
			settingsGroupTitleWidget.render();
			this.settingsGroupTitleWidgets.push(settingsGroupTitleWidget);
			this.disposables.push(settingsGroupTitleWidget);
			this.disposables.push(settingsGroupTitleWidget.onToggled(collapsed => this.onToggled(collapsed, settingsGroupTitleWidget.settingsGroup)));
		}
		this.settingsGroupTitleWidgets.reverse();
	}

	public showGroup(group: number) {
		this.hiddenGroups = this.settingsGroups.filter((g, i) => i !== group - 1);
		for (const groupTitleWidget of this.settingsGroupTitleWidgets.filter((g, i) => i !== group - 1)) {
			groupTitleWidget.toggleCollapse(true);
		}
		this._onHiddenAreasChanged.fire();
	}

	public showSetting(setting: ISetting): void {
		const settingsGroupTitleWidget = this.settingsGroupTitleWidgets.filter(widget => Range.containsRange(widget.settingsGroup.range, setting.range))[0];
		if (settingsGroupTitleWidget && settingsGroupTitleWidget.isCollapsed()) {
			settingsGroupTitleWidget.toggleCollapse(false);
			this.hiddenGroups.splice(this.hiddenGroups.indexOf(settingsGroupTitleWidget.settingsGroup), 1);
			this._onHiddenAreasChanged.fire();
		}
	}

	public collapseAll() {
		this.editor.setPosition({ lineNumber: 1, column: 1 });
		this.hiddenGroups = this.settingsGroups.slice();
		for (const groupTitleWidget of this.settingsGroupTitleWidgets) {
			groupTitleWidget.toggleCollapse(true);
		}
		this._onHiddenAreasChanged.fire();
	}

	private onToggled(collapsed: boolean, group: ISettingsGroup) {
		const index = this.hiddenGroups.indexOf(group);
		if (collapsed) {
			const currentPosition = this.editor.getPosition();
			if (group.range.startLineNumber <= currentPosition.lineNumber && group.range.endLineNumber >= currentPosition.lineNumber) {
				this.editor.setPosition({ lineNumber: group.range.startLineNumber - 1, column: 1 });
			}
			this.hiddenGroups.push(group);
		} else {
			this.hiddenGroups.splice(index, 1);
		}
		this._onHiddenAreasChanged.fire();
	}

	private disposeWidgets() {
		this.hiddenGroups = [];
		this.disposables = dispose(this.disposables);
	}

	public dispose() {
		this.disposeWidgets();
		super.dispose();
	}
}

export class HiddenAreasRenderer extends Disposable {

	constructor(private editor: ICodeEditor, private hiddenAreasProviders: HiddenAreasProvider[],
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
	}

	public render() {
		const ranges: editorCommon.IRange[] = [];
		for (const hiddenAreaProvider of this.hiddenAreasProviders) {
			ranges.push(...hiddenAreaProvider.hiddenAreas);
		}
		this.editor.setHiddenAreas(ranges);
	}

	public dispose() {
		this.editor.setHiddenAreas([]);
		super.dispose();
	}
}

export class FilteredMatchesRenderer extends Disposable implements HiddenAreasProvider {

	private decorationIds: string[] = [];
	public hiddenAreas: editorCommon.IRange[] = [];

	constructor(private editor: ICodeEditor,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
	}

	public render(result: IFilterResult): void {
		const model = this.editor.getModel();
		this.hiddenAreas = [];
		this.editor.changeDecorations(changeAccessor => {
			this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []);
		});
		if (result) {
			this.hiddenAreas = this.computeHiddenRanges(result.filteredGroups, result.allGroups, model);
			this.editor.changeDecorations(changeAccessor => {
				this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, flatten(result.matches.values()).map(match => this.createDecoration(match, model)));
			});
		}
	}

	private createDecoration(range: editorCommon.IRange, model: editorCommon.IModel): editorCommon.IModelDeltaDecoration {
		return {
			range,
			options: {
				stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				className: 'findMatch'
			}
		};
	}

	private computeHiddenRanges(filteredGroups: ISettingsGroup[], allSettingsGroups: ISettingsGroup[], model: editorCommon.IModel): editorCommon.IRange[] {
		const notMatchesRanges: editorCommon.IRange[] = [];
		for (const group of allSettingsGroups) {
			const filteredGroup = filteredGroups.filter(g => g.title === group.title)[0];
			if (!filteredGroup) {
				notMatchesRanges.push({
					startLineNumber: group.range.startLineNumber - 1,
					startColumn: model.getLineMinColumn(group.range.startLineNumber - 1),
					endLineNumber: group.range.endLineNumber,
					endColumn: model.getLineMaxColumn(group.range.endLineNumber),
				});
			} else {
				for (const section of group.sections) {
					if (section.titleRange) {
						if (!this.containsLine(section.titleRange.startLineNumber, filteredGroup)) {
							notMatchesRanges.push(this.createCompleteRange(section.titleRange, model));
						}
					}
					for (const setting of section.settings) {
						if (!this.containsLine(setting.range.startLineNumber, filteredGroup)) {
							notMatchesRanges.push(this.createCompleteRange(setting.range, model));
						}
					}
				}
			}
		}
		return notMatchesRanges;
	}

	private containsLine(lineNumber: number, settingsGroup: ISettingsGroup): boolean {
		if (settingsGroup.titleRange && lineNumber >= settingsGroup.titleRange.startLineNumber && lineNumber <= settingsGroup.titleRange.endLineNumber) {
			return true;
		}

		for (const section of settingsGroup.sections) {
			if (section.titleRange && lineNumber >= section.titleRange.startLineNumber && lineNumber <= section.titleRange.endLineNumber) {
				return true;
			}

			for (const setting of section.settings) {
				if (lineNumber >= setting.range.startLineNumber && lineNumber <= setting.range.endLineNumber) {
					return true;
				}
			}
		}
		return false;
	}

	private createCompleteRange(range: editorCommon.IRange, model: editorCommon.IModel): editorCommon.IRange {
		return {
			startLineNumber: range.startLineNumber,
			startColumn: model.getLineMinColumn(range.startLineNumber),
			endLineNumber: range.endLineNumber,
			endColumn: model.getLineMaxColumn(range.endLineNumber)
		};
	}

	public dispose() {
		if (this.decorationIds) {
			this.decorationIds = this.editor.changeDecorations(changeAccessor => {
				return changeAccessor.deltaDecorations(this.decorationIds, []);
			});
		}
		super.dispose();
	}
}

export class HighlightPreferencesRenderer extends Disposable {

	private decorationIds: string[] = [];

	constructor(private editor: ICodeEditor,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
	}

	public render(settings: ISetting[]): void {
		const model = this.editor.getModel();
		this.editor.changeDecorations(changeAccessor => {
			this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []);
		});
		if (settings.length) {
			this.editor.changeDecorations(changeAccessor => {
				this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, settings.map(setting => this.createDecoration(setting.keyRange, model)));
			});
		}
	}

	private createDecoration(range: editorCommon.IRange, model: editorCommon.IModel): editorCommon.IModelDeltaDecoration {
		return {
			range,
			options: {
				stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				className: 'findMatch'
			}
		};
	}

	public dispose() {
		if (this.decorationIds) {
			this.decorationIds = this.editor.changeDecorations(changeAccessor => {
				return changeAccessor.deltaDecorations(this.decorationIds, []);
			});
		}
		super.dispose();
	}
}

class FilteredSettingsNavigationRenderer extends Disposable implements IIterator<ISetting> {

	private iterator: ArrayNavigator<ISetting>;

	constructor(private editor: ICodeEditor, private settingHighlighter: SettingHighlighter) {
		super();
	}

	public next(): ISetting {
		return this.iterator.next() || this.iterator.first();
	}

	public render(filteredGroups: ISettingsGroup[]) {
		this.settingHighlighter.clear(true);
		const settings: ISetting[] = [];
		for (const group of filteredGroups) {
			for (const section of group.sections) {
				settings.push(...section.settings);
			}
		}
		this.iterator = new ArrayNavigator<ISetting>(settings);
	}
}

class EditSettingRenderer extends Disposable {

	private editPreferenceWidgetForCusorPosition: EditPreferenceWidget<ISetting>;
	private editPreferenceWidgetForMouseMove: EditPreferenceWidget<ISetting>;

	private settingsGroups: ISettingsGroup[];
	private toggleEditPreferencesForMouseMoveDelayer: Delayer<void>;

	private _onUpdateSetting: Emitter<{ key: string, value: any, source: ISetting }> = new Emitter<{ key: string, value: any, source: ISetting }>();
	public readonly onUpdateSetting: Event<{ key: string, value: any, source: ISetting }> = this._onUpdateSetting.event;

	constructor(private editor: ICodeEditor, private masterSettingsModel: ISettingsEditorModel,
		private otherSettingsModel: () => ISettingsEditorModel,
		private settingHighlighter: SettingHighlighter,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		super();

		this.editPreferenceWidgetForCusorPosition = this._register(this.instantiationService.createInstance(EditPreferenceWidget, editor));
		this.editPreferenceWidgetForMouseMove = this._register(this.instantiationService.createInstance(EditPreferenceWidget, editor));
		this.toggleEditPreferencesForMouseMoveDelayer = new Delayer<void>(75);

		this._register(this.editPreferenceWidgetForCusorPosition.onClick(setting => this.onEditSettingClicked(this.editPreferenceWidgetForCusorPosition)));
		this._register(this.editPreferenceWidgetForMouseMove.onClick(setting => this.onEditSettingClicked(this.editPreferenceWidgetForMouseMove)));

		this._register(this.editPreferenceWidgetForCusorPosition.onMouseOver(setting => this.onMouseOver(this.editPreferenceWidgetForCusorPosition)));
		this._register(this.editPreferenceWidgetForMouseMove.onMouseOver(setting => this.onMouseOver(this.editPreferenceWidgetForMouseMove)));

		this._register(this.editor.onDidChangeCursorPosition(positionChangeEvent => this.onPositionChanged(positionChangeEvent)));
		this._register(this.editor.onMouseMove(mouseMoveEvent => this.onMouseMoved(mouseMoveEvent)));
		this._register(this.editor.onDidChangeConfiguration(() => this.onConfigurationChanged()));
	}

	public render(settingsGroups: ISettingsGroup[]): void {
		this.editPreferenceWidgetForCusorPosition.hide();
		this.editPreferenceWidgetForMouseMove.hide();
		this.settingsGroups = settingsGroups;

		const settings = this.getSettings(this.editor.getPosition().lineNumber);
		if (settings.length) {
			this.showEditPreferencesWidget(this.editPreferenceWidgetForCusorPosition, settings);
		}
	}

	private isDefaultSettings(): boolean {
		return this.masterSettingsModel instanceof DefaultSettingsEditorModel;
	}

	private onConfigurationChanged(): void {
		if (!this.editor.getRawConfiguration().glyphMargin) {
			this.editPreferenceWidgetForCusorPosition.hide();
			this.editPreferenceWidgetForMouseMove.hide();
		}
	}

	private onPositionChanged(positionChangeEvent: editorCommon.ICursorPositionChangedEvent) {
		this.editPreferenceWidgetForMouseMove.hide();
		const settings = this.getSettings(positionChangeEvent.position.lineNumber);
		if (settings.length) {
			this.showEditPreferencesWidget(this.editPreferenceWidgetForCusorPosition, settings);
		} else {
			this.editPreferenceWidgetForCusorPosition.hide();
		}
	}

	private onMouseMoved(mouseMoveEvent: IEditorMouseEvent): void {
		const editPreferenceWidget = this.getEditPreferenceWidgetUnderMouse(mouseMoveEvent);
		if (editPreferenceWidget) {
			this.onMouseOver(editPreferenceWidget);
			return;
		}
		this.settingHighlighter.clear();
		this.toggleEditPreferencesForMouseMoveDelayer.trigger(() => this.toggleEidtPreferenceWidgetForMouseMove(mouseMoveEvent));
	}

	private getEditPreferenceWidgetUnderMouse(mouseMoveEvent: IEditorMouseEvent): EditPreferenceWidget<ISetting> {
		if (mouseMoveEvent.event.target === this.editPreferenceWidgetForMouseMove.getDomNode()) {
			return this.editPreferenceWidgetForMouseMove;
		}
		if (mouseMoveEvent.event.target === this.editPreferenceWidgetForCusorPosition.getDomNode()) {
			return this.editPreferenceWidgetForCusorPosition;
		}
		return null;
	}

	private toggleEidtPreferenceWidgetForMouseMove(mouseMoveEvent: IEditorMouseEvent): void {
		const settings = mouseMoveEvent.target.position ? this.getSettings(mouseMoveEvent.target.position.lineNumber) : null;
		if (settings && settings.length) {
			this.showEditPreferencesWidget(this.editPreferenceWidgetForMouseMove, settings);
		} else {
			this.editPreferenceWidgetForMouseMove.hide();
		}
	}

	private showEditPreferencesWidget(editPreferencesWidget: EditPreferenceWidget<ISetting>, settings: ISetting[]) {
		if (this.editor.getRawConfiguration().glyphMargin) {
			editPreferencesWidget.show(settings[0].valueRange.startLineNumber, settings);
			editPreferencesWidget.getDomNode().title = nls.localize('editTtile', "Edit");
			const editPreferenceWidgetToHide = editPreferencesWidget === this.editPreferenceWidgetForCusorPosition ? this.editPreferenceWidgetForMouseMove : this.editPreferenceWidgetForCusorPosition;
			editPreferenceWidgetToHide.hide();
		}
	}

	private getSettings(lineNumber: number): ISetting[] {
		const configurationMap = this.getConfigurationsMap();
		return this.getSettingsAtLineNumber(lineNumber).filter(setting => {
			let jsonSchema: IJSONSchema = configurationMap[setting.key];
			return jsonSchema && (this.isDefaultSettings() || jsonSchema.type === 'boolean' || jsonSchema.enum);
		});
	}

	private getSettingsAtLineNumber(lineNumber: number): ISetting[] {
		const settings = [];
		for (const group of this.settingsGroups) {
			if (group.range.startLineNumber > lineNumber) {
				break;
			}
			if (lineNumber >= group.range.startLineNumber && lineNumber <= group.range.endLineNumber) {
				for (const section of group.sections) {
					for (const setting of section.settings) {
						if (setting.range.startLineNumber > lineNumber) {
							break;
						}
						if (lineNumber >= setting.range.startLineNumber && lineNumber <= setting.range.endLineNumber) {
							if (setting.overrides.length > 0) {
								// Only one level because override settings cannot have override settings
								for (const overrideSetting of setting.overrides) {
									if (lineNumber >= overrideSetting.range.startLineNumber && lineNumber <= overrideSetting.range.endLineNumber) {
										settings.push(overrideSetting);
									}
								}
							} else {
								settings.push(setting);
							}
						}
					}
				}
			}
		}
		return settings;
	}

	private onMouseOver(editPreferenceWidget: EditPreferenceWidget<ISetting>): void {
		this.settingHighlighter.highlight(editPreferenceWidget.preferences[0]);
	}

	private onEditSettingClicked(editPreferenceWidget: EditPreferenceWidget<ISetting>): void {
		const elementPosition = DOM.getDomNodePagePosition(editPreferenceWidget.getDomNode());
		const anchor = { x: elementPosition.left + elementPosition.width, y: elementPosition.top + elementPosition.height + 10 };
		const actions = this.getSettingsAtLineNumber(editPreferenceWidget.getLine()).length === 1 ? this.getActions(editPreferenceWidget.preferences[0], this.getConfigurationsMap()[editPreferenceWidget.preferences[0].key])
			: editPreferenceWidget.preferences.map(setting => new ContextSubMenu(setting.key, this.getActions(setting, this.getConfigurationsMap()[setting.key])));
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => TPromise.wrap(actions)
		});
	}

	private getConfigurationsMap(): { [qualifiedKey: string]: IJSONSchema } {
		return Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
	}

	private getActions(setting: ISetting, jsonSchema: IJSONSchema): IAction[] {
		if (jsonSchema.type === 'boolean') {
			return [<IAction>{
				id: 'truthyValue',
				label: 'true',
				enabled: true,
				run: () => this.updateSetting(setting.key, true, setting)
			}, <IAction>{
				id: 'falsyValue',
				label: 'false',
				enabled: true,
				run: () => this.updateSetting(setting.key, false, setting)
			}];
		}
		if (jsonSchema.enum) {
			return jsonSchema.enum.map(value => {
				return <IAction>{
					id: value,
					label: JSON.stringify(value),
					enabled: true,
					run: () => this.updateSetting(setting.key, value, setting)
				};
			});
		}
		return this.getDefaultActions(setting);
	}

	private getDefaultActions(setting: ISetting): IAction[] {
		const settingInOtherModel = this.otherSettingsModel().getPreference(setting.key);
		if (this.isDefaultSettings()) {
			return [<IAction>{
				id: 'setDefaultValue',
				label: settingInOtherModel ? nls.localize('replaceDefaultValue', "Replace in Settings") : nls.localize('copyDefaultValue', "Copy to Settings"),
				enabled: true,
				run: () => this.updateSetting(setting.key, setting.value, setting)
			}];
		}
		return [];
	}

	private updateSetting(key: string, value: any, source: ISetting): void {
		this._onUpdateSetting.fire({ key, value, source });
	}
}

class SettingHighlighter extends Disposable {

	private fixedHighlighter: RangeHighlightDecorations;
	private volatileHighlighter: RangeHighlightDecorations;
	private highlightedSetting: ISetting;

	constructor(private editor: editorCommon.ICommonCodeEditor, private focusEventEmitter: Emitter<ISetting>, private clearFocusEventEmitter: Emitter<ISetting>,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this.fixedHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
		this.volatileHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
		this.fixedHighlighter.onHighlghtRemoved(() => this.clearFocusEventEmitter.fire(this.highlightedSetting));
		this.volatileHighlighter.onHighlghtRemoved(() => this.clearFocusEventEmitter.fire(this.highlightedSetting));
	}

	highlight(setting: ISetting, fix: boolean = false) {
		this.highlightedSetting = setting;
		this.volatileHighlighter.removeHighlightRange();
		this.fixedHighlighter.removeHighlightRange();

		const highlighter = fix ? this.fixedHighlighter : this.volatileHighlighter;
		highlighter.highlightRange({
			range: setting.valueRange,
			resource: this.editor.getModel().uri
		}, this.editor);

		this.editor.revealLinesInCenterIfOutsideViewport(setting.valueRange.startLineNumber, setting.valueRange.endLineNumber - 1);
		this.focusEventEmitter.fire(setting);
	}

	clear(fix: boolean = false): void {
		this.volatileHighlighter.removeHighlightRange();
		if (fix) {
			this.fixedHighlighter.removeHighlightRange();
		}
		this.clearFocusEventEmitter.fire(this.highlightedSetting);
	}
}

class UnTrustedWorkspaceSettingsRenderer extends Disposable {

	constructor(private editor: editorCommon.ICommonCodeEditor, private workspaceSettingsEditorModel: SettingsEditorModel,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService,
		@IMarkerService private markerService: IMarkerService
	) {
		super();
	}

	private getMarkerMessage(settingKey): string {
		switch (settingKey) {
			case 'typescript.tsdk':
				return nls.localize('unsupportedTypeScriptTsdkSetting', "This setting must be a User Setting. To configure TypeScript for the workspace, open a TypeScript file and click on the TypeScript version in the status bar.");
			case 'php.validate.executablePath':
				return nls.localize('unsupportedPHPExecutablePathSetting', "This setting must be a User Setting. To configure PHP for the workspace, open a PHP file and click on 'PHP Path' in the status bar.");
			default:
				return nls.localize('unsupportedWorkspaceSetting', "This setting must be a User Setting.");
		}
	}

	public render(): void {
		const untrustedConfigurations = this.configurationService.getUntrustedConfigurations();
		if (untrustedConfigurations.length) {
			const markerData: IMarkerData[] = [];
			for (const untrustedConfiguration of untrustedConfigurations) {
				const setting = this.workspaceSettingsEditorModel.getPreference(untrustedConfiguration);
				if (setting) {
					markerData.push({
						severity: Severity.Warning,
						startLineNumber: setting.keyRange.startLineNumber,
						startColumn: setting.keyRange.startColumn,
						endLineNumber: setting.keyRange.endLineNumber,
						endColumn: setting.keyRange.endColumn,
						message: this.getMarkerMessage(untrustedConfiguration)
					});
				}
			}
			this.markerService.changeOne('preferencesEditor', this.workspaceSettingsEditorModel.uri, markerData);
		}
	}

	public dispose(): void {
		this.markerService.remove('preferencesEditor', [this.workspaceSettingsEditorModel.uri]);
		super.dispose();
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