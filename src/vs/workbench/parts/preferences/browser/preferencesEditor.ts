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
import { flatten } from 'vs/base/common/arrays';
import { ArrayIterator } from 'vs/base/common/iterator';
import { IAction } from 'vs/base/common/actions';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import Event, { Emitter } from 'vs/base/common/event';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { SideBySideEditor } from 'vs/workbench/browser/parts/editor/sideBySideEditor';
import { Registry } from 'vs/platform/platform';
import { EditorOptions, toResource } from 'vs/workbench/common/editor';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
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
import { DefaultSettingsHeaderWidget, SettingsGroupTitleWidget, SettingsCountWidget, EditPreferenceWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { IContextKeyService, IContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { CommonEditorRegistry, EditorCommand, Command } from 'vs/editor/common/editorCommonExtensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { RangeHighlightDecorations } from 'vs/workbench/common/editor/rangeDecorations';
import { IConfigurationEditingService } from 'vs/workbench/services/configuration/common/configurationEditing';

// Ignore following contributions
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { FindController } from 'vs/editor/contrib/find/browser/find';
import { SelectionHighlighter } from 'vs/editor/contrib/find/common/findController';


export class DefaultPreferencesEditorInput extends ResourceEditorInput {

	public static ID = 'workbench.editorinputs.defaultpreferences';

	private _willDispose = new Emitter<void>();
	public willDispose: Event<void> = this._willDispose.event;

	constructor(defaultSettingsResource: URI,
		@ITextModelResolverService textModelResolverService: ITextModelResolverService
	) {
		super(nls.localize('settingsEditorName', "Default Settings"), '', defaultSettingsResource, textModelResolverService);
	}

	getTypeId(): string {
		return DefaultPreferencesEditorInput.ID;
	}

	supportsSplitEditor(): boolean {
		return false;
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

	dispose() {
		this._willDispose.fire();
		this._willDispose.dispose();
		super.dispose();
	}
}

export class DefaultPreferencesEditor extends BaseTextEditor {

	public static ID: string = 'workbench.editor.defaultPreferences';

	private defaultSettingHeaderWidget: DefaultSettingsHeaderWidget;
	private delayedFilterLogging: Delayer<void>;

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
		@IModeService private modeService: IModeService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(DefaultPreferencesEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, textFileService);
		this.delayedFilterLogging = new Delayer<void>(1000);
	}

	public createEditorControl(parent: Builder): editorCommon.IEditor {
		const parentContainer = parent.getHTMLElement();

		this.defaultSettingHeaderWidget = this._register(this.instantiationService.createInstance(DefaultSettingsHeaderWidget, parentContainer));
		this._register(this.defaultSettingHeaderWidget.onDidChange(value => this.filterPreferences(value)));
		this._register(this.defaultSettingHeaderWidget.onEnter(value => this.focusNextPreference()));

		const defaultPreferencesEditor = this.instantiationService.createInstance(DefaultPreferencesCodeEditor, parentContainer, this.getCodeEditorOptions());

		return defaultPreferencesEditor;
	}

	protected getCodeEditorOptions(): editorCommon.IEditorOptions {
		const options = super.getCodeEditorOptions();
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
		}
		return options;
	}

	setInput(input: DefaultPreferencesEditorInput, options: EditorOptions): TPromise<void> {
		return super.setInput(input, options).then(() => this.updateInput());
	}

	public layout(dimension: Dimension) {
		this.defaultSettingHeaderWidget.layout(dimension);
		const headerHeight = DOM.getTotalHeight(this.defaultSettingHeaderWidget.domNode);
		this.getControl().layout({
			height: dimension.height - headerHeight,
			width: dimension.width
		});
	}

	public focus(): void {
		if (this.input) {
			this.defaultSettingHeaderWidget.focus();
		} else {
			super.focus();
		}
	}

	private updateInput(): TPromise<void> {
		return this.input.resolve()
			.then(editorModel => TPromise.join<any>([
				editorModel.load(),
				// Default preferences editor is always part of side by side editor hence getting the master preferences model from active editor
				// TODO:@sandy check with Ben
				this.preferencesService.resolvePreferencesEditorModel(toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true }))
			]))
			.then(([editorModel, preferencesModel]) => (<DefaultPreferencesCodeEditor>this.getControl()).setModels((<ResourceEditorModel>editorModel).textEditorModel, <SettingsEditorModel>preferencesModel));
	}

	private filterPreferences(filter: string) {
		this.delayedFilterLogging.trigger(() => this.reportFilteringUsed(filter));
		(<DefaultSettingsRenderer>this.getDefaultPreferencesContribution().getPreferencesRenderer()).filterPreferences(filter.trim());
	}

	private focusNextPreference() {
		(<DefaultSettingsRenderer>this.getDefaultPreferencesContribution().getPreferencesRenderer()).focusNextSetting();
	}

	public clearInput(): void {
		this.getControl().setModel(null);
		super.clearInput();
	}

	private getDefaultPreferencesContribution(): PreferencesEditorContribution {
		return (<CodeEditor>this.getControl()).getContribution<PreferencesEditorContribution>(DefaultSettingsEditorContribution.ID);
	}

	private reportFilteringUsed(filter: string): void {
		let data = {};
		data['filter'] = filter;
		this.telemetryService.publicLog('defaultSettings.filter', data);
	}
}

class DefaultPreferencesCodeEditor extends CodeEditor {

	private _settingsModel: SettingsEditorModel;

	protected _getContributions(): IEditorContributionCtor[] {
		let contributions = super._getContributions();
		let skipContributions = [FoldingController.prototype, SelectionHighlighter.prototype, FindController.prototype];
		contributions = contributions.filter(c => skipContributions.indexOf(c.prototype) === -1);
		contributions.push(DefaultSettingsEditorContribution);
		return contributions;
	}

	setModels(model: editorCommon.IModel, settingsModel: SettingsEditorModel): void {
		this._settingsModel = settingsModel;
		return super.setModel(model);
	}

	get settingsModel(): SettingsEditorModel {
		return this._settingsModel;
	}
}

export interface IPreferencesRenderer {
	render();
	updatePreference(setting: ISetting, value: any): void;
	dispose();
}

export abstract class PreferencesEditorContribution extends Disposable implements editorCommon.IEditorContribution {

	private preferencesRenderer: IPreferencesRenderer;

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

	getPreferencesRenderer(): IPreferencesRenderer {
		return this.preferencesRenderer;
	}

	protected abstract createPreferencesRenderer(editorModel: IPreferencesEditorModel): IPreferencesRenderer
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

export class DefaultSettingsEditorContribution extends PreferencesEditorContribution implements editorCommon.IEditorContribution {

	static ID: string = 'editor.contrib.defaultsettings';

	protected createPreferencesRenderer(editorModel: IPreferencesEditorModel): IPreferencesRenderer {
		if (editorModel instanceof DefaultSettingsEditorModel) {
			return this.instantiationService.createInstance(DefaultSettingsRenderer, this.editor, editorModel, (<DefaultPreferencesCodeEditor>this.editor).settingsModel);
		}
		return null;
	}

	getId(): string {
		return DefaultSettingsEditorContribution.ID;
	}
}

@editorContribution
export class SettingsEditorContribution extends PreferencesEditorContribution implements editorCommon.IEditorContribution {

	static ID: string = 'editor.contrib.settings';

	getId(): string {
		return SettingsEditorContribution.ID;
	}

	protected createPreferencesRenderer(editorModel: IPreferencesEditorModel): IPreferencesRenderer {
		if (editorModel instanceof SettingsEditorModel) {
			return this.instantiationService.createInstance(SettingsRenderer, this.editor, editorModel);
		}
		return null;
	}
}

export class SettingsRenderer extends Disposable implements IPreferencesRenderer {

	private initializationPromise: TPromise<void>;
	private settingHighlighter: SettingHighlighter;
	private editSettingActionRenderer: EditSettingRenderer;
	private modelChangeDelayer: Delayer<void> = new Delayer<void>(200);

	constructor(protected editor: ICodeEditor, protected settingsEditorModel: SettingsEditorModel,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService,
		@IMessageService private messageService: IMessageService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();
		this.settingHighlighter = this._register(instantiationService.createInstance(SettingHighlighter, editor));
		this.initializationPromise = this.initialize();
	}

	public render(): void {
		this.initializationPromise.then(() => this.editSettingActionRenderer.render(this.settingsEditorModel.settingsGroups));
	}

	private initialize(): TPromise<void> {
		return this.preferencesService.createDefaultPreferencesEditorModel(this.preferencesService.defaultSettingsResource)
			.then(defaultSettingsModel => {
				this.editSettingActionRenderer = this._register(this.instantiationService.createInstance(EditSettingRenderer, this.editor, this.settingsEditorModel, defaultSettingsModel, this.settingHighlighter));
				this._register(this.editor.getModel().onDidChangeContent(() => this.modelChangeDelayer.trigger(() => this.onModelChanged())));
				this._register(this.editSettingActionRenderer.onUpdateSetting(({setting, value}) => this.updatePreference(setting, value)));
				return null;
			});
	}

	private onModelChanged(): void {
		if (!this.editor.getModel()) {
			// model could have been disposed during the delay
			return;
		}
		this.render();
	}

	public updatePreference(setting: ISetting, value: any): void {
		this.telemetryService.publicLog('defaultSettingsActions.copySetting', { userConfigurationKeys: [setting.key] });
		this.configurationEditingService.writeConfiguration(this.settingsEditorModel.configurationTarget, { key: setting.key, value }, { writeToBuffer: true, autoSave: true })
			.then(() => this.onSettingUpdated(setting), error => this.messageService.show(Severity.Error, error));
	}

	private onSettingUpdated(setting: ISetting) {
		this.editor.focus();
		setting = this.settingsEditorModel.getSetting(setting.key);
		// TODO:@sandy Selection range should be template range
		this.editor.setSelection(setting.valueRange);
		this.settingHighlighter.highlight(this.settingsEditorModel.getSetting(setting.key), true);
	}
}

export class DefaultSettingsRenderer extends Disposable implements IPreferencesRenderer {

	private defaultSettingsEditorContextKey: IContextKey<boolean>;

	private settingHighlighter: SettingHighlighter;
	private settingsGroupTitleRenderer: SettingsGroupTitleRenderer;
	private filteredMatchesRenderer: FilteredMatchesRenderer;
	private filteredSettingsNavigationRenderer: FilteredSettingsNavigationRenderer;
	private hiddenAreasRenderer: HiddenAreasRenderer;
	private editSettingActionRenderer: EditSettingRenderer;
	private settingsCountWidget: SettingsCountWidget;

	constructor(protected editor: ICodeEditor, protected defaultSettingsEditorModel: DefaultSettingsEditorModel,
		private settingsEditorModel: SettingsEditorModel,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();
		this.defaultSettingsEditorContextKey = CONTEXT_DEFAULT_SETTINGS_EDITOR.bindTo(contextKeyService);
		this.settingHighlighter = this._register(instantiationService.createInstance(SettingHighlighter, editor));
		this.settingsGroupTitleRenderer = this._register(instantiationService.createInstance(SettingsGroupTitleRenderer, editor));
		this.filteredMatchesRenderer = this._register(instantiationService.createInstance(FilteredMatchesRenderer, editor));
		this.filteredSettingsNavigationRenderer = this._register(instantiationService.createInstance(FilteredSettingsNavigationRenderer, editor, this.settingHighlighter));
		this.editSettingActionRenderer = this._register(instantiationService.createInstance(EditSettingRenderer, editor, defaultSettingsEditorModel, settingsEditorModel, this.settingHighlighter));
		this._register(this.editSettingActionRenderer.onUpdateSetting(({setting, value}) => this.updatePreference(setting, value)));
		this.settingsCountWidget = this._register(instantiationService.createInstance(SettingsCountWidget, editor, this.getCount(defaultSettingsEditorModel.settingsGroups)));
		const paranthesisHidingRenderer = this._register(instantiationService.createInstance(StaticContentHidingRenderer, editor, defaultSettingsEditorModel.settingsGroups));
		this.hiddenAreasRenderer = this._register(instantiationService.createInstance(HiddenAreasRenderer, editor, [this.settingsGroupTitleRenderer, this.filteredMatchesRenderer, paranthesisHidingRenderer]));

		this._register(this.settingsGroupTitleRenderer.onHiddenAreasChanged(() => this.hiddenAreasRenderer.render()));
	}

	public render() {
		this.defaultSettingsEditorContextKey.set(true);
		this.settingsGroupTitleRenderer.render(this.defaultSettingsEditorModel.settingsGroups);
		this.editSettingActionRenderer.render(this.defaultSettingsEditorModel.settingsGroups);
		this.settingsCountWidget.render();
		this.hiddenAreasRenderer.render();
		this.filteredSettingsNavigationRenderer.render([]);
		this.settingsGroupTitleRenderer.showGroup(1);
		this.hiddenAreasRenderer.render();
	}

	public filterPreferences(filter: string) {
		const filterResult = this.defaultSettingsEditorModel.filterSettings(filter);
		this.filteredMatchesRenderer.render(filterResult);
		this.settingsGroupTitleRenderer.render(filterResult.filteredGroups);
		this.settingsCountWidget.show(this.getCount(filterResult.filteredGroups));

		if (!filter) {
			this.filteredSettingsNavigationRenderer.render([]);
			this.settingsGroupTitleRenderer.showGroup(1);
		} else {
			this.filteredSettingsNavigationRenderer.render(filterResult.filteredGroups);
		}
		this.hiddenAreasRenderer.render();
	}

	public focusNextSetting(): void {
		const setting = this.filteredSettingsNavigationRenderer.next();
		if (setting) {
			this.settingsGroupTitleRenderer.showSetting(setting);
		}
	}

	public collapseAll() {
		this.settingsGroupTitleRenderer.collapseAll();
	}

	public updatePreference(setting: ISetting, value: any): void {
		const settingsEditor = this.getEditableSettingsEditor();
		if (settingsEditor) {
			settingsEditor.getContribution<PreferencesEditorContribution>(SettingsEditorContribution.ID).getPreferencesRenderer().updatePreference(setting, value);
		}
	}

	private getEditableSettingsEditor(): editorCommon.ICommonCodeEditor {
		return this.editorService.getVisibleEditors()
			.filter(editor => {
				if (editorCommon.isCommonCodeEditor(editor.getControl())) {
					return (<editorCommon.ICommonCodeEditor>editor.getControl()).getModel().uri.fsPath === this.settingsEditorModel.uri.fsPath;
				}
			})
			.map(editor => <editorCommon.ICommonCodeEditor>editor.getControl())[0];
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

class FilteredSettingsNavigationRenderer extends Disposable {

	private iterator: ArrayIterator<ISetting>;

	constructor(private editor: ICodeEditor, private settingHighlighter: SettingHighlighter) {
		super();
	}

	public next(): ISetting {
		let setting = this.iterator.next() || this.iterator.first();
		if (setting) {
			this.settingHighlighter.highlight(setting, true);
			return setting;
		}
		return null;
	}

	public render(filteredGroups: ISettingsGroup[]) {
		this.settingHighlighter.clear(true);
		const settings: ISetting[] = [];
		for (const group of filteredGroups) {
			for (const section of group.sections) {
				settings.push(...section.settings);
			}
		}
		this.iterator = new ArrayIterator<ISetting>(settings);
	}
}

class EditSettingRenderer extends Disposable {

	private editPreferenceWidgetForCusorPosition: EditPreferenceWidget<ISetting>;
	private editPreferenceWidgetForMouseMove: EditPreferenceWidget<ISetting>;

	private settingsGroups: ISettingsGroup[];
	private toggleEditPreferencesForMouseMoveDelayer: Delayer<void>;

	private _onUpdateSetting: Emitter<{ setting: ISetting, value: any }> = new Emitter<{ setting: ISetting, value: any }>();
	public readonly onUpdateSetting: Event<{ setting: ISetting, value: any }> = this._onUpdateSetting.event;

	constructor(private editor: ICodeEditor, private masterSettingsModel: ISettingsEditorModel,
		private otherSettingsModel: ISettingsEditorModel,
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
		editPreferencesWidget.show(settings[0].valueRange.startLineNumber, settings);
		editPreferencesWidget.getDomNode().title = nls.localize('editTtile', "Edit");
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
							settings.push(setting);
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
				run: () => this.updateSetting(setting, true)
			}, <IAction>{
				id: 'falsyValue',
				label: 'false',
				enabled: true,
				run: () => this.updateSetting(setting, false)
			}];
		}
		if (jsonSchema.enum) {
			return jsonSchema.enum.map(value => {
				return <IAction>{
					id: value,
					label: JSON.stringify(value),
					enabled: true,
					run: () => this.updateSetting(setting, value)
				};
			});
		}
		return this.getDefaultActions(setting);
	}

	private getDefaultActions(setting: ISetting): IAction[] {
		const settingInOtherModel = this.otherSettingsModel.getSetting(setting.key);
		if (this.isDefaultSettings()) {
			return [<IAction>{
				id: 'setDefaultValue',
				label: settingInOtherModel ? nls.localize('replaceDefaultValue', "Replace in Settings") : nls.localize('copyDefaultValue', "Copy to Settings"),
				enabled: true,
				run: () => this.updateSetting(setting, setting.value)
			}];
		}
		return [];
	}

	private updateSetting(setting: ISetting, value: any): void {
		this._onUpdateSetting.fire({ setting, value });
	}
}

class SettingHighlighter extends Disposable {

	private fixedHighlighter: RangeHighlightDecorations;
	private volatileHighlighter: RangeHighlightDecorations;

	constructor(private editor: editorCommon.ICommonCodeEditor, @IInstantiationService instantiationService: IInstantiationService) {
		super();
		this.fixedHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
		this.volatileHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
	}

	highlight(setting: ISetting, fix: boolean = false) {
		this.volatileHighlighter.removeHighlightRange();
		this.fixedHighlighter.removeHighlightRange();

		const highlighter = fix ? this.fixedHighlighter : this.volatileHighlighter;
		highlighter.highlightRange({
			range: setting.valueRange,
			resource: this.editor.getModel().uri
		}, this.editor);

		this.editor.revealLinesInCenterIfOutsideViewport(setting.valueRange.startLineNumber, setting.valueRange.endLineNumber - 1);
	}

	clear(fix: boolean = false): void {
		this.volatileHighlighter.removeHighlightRange();
		if (fix) {
			this.fixedHighlighter.removeHighlightRange();
		}
	}
}

const DefaultSettingsEditorCommand = EditorCommand.bindToContribution<PreferencesEditorContribution>((editor: editorCommon.ICommonCodeEditor) => <PreferencesEditorContribution>editor.getContribution(DefaultSettingsEditorContribution.ID));

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