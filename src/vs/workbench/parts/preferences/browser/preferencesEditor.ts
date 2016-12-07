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
import { LinkedMap as Map } from 'vs/base/common/map';
import { Registry } from 'vs/platform/platform';
import { EditorOptions, EditorInput } from 'vs/workbench/common/editor';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { Range } from 'vs/editor/common/core/range';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import {
	IPreferencesService, ISettingsGroup, ISetting, IPreferencesEditorModel, IFilterResult, CONTEXT_DEFAULT_SETTINGS_EDITOR,
	DEFAULT_EDITOR_COMMAND_COLLAPSE_ALL
} from 'vs/workbench/parts/preferences/common/preferences';
import { SettingsEditorModel, DefaultSettingsEditorModel } from 'vs/workbench/parts/preferences/common/preferencesModels';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { ICodeEditor, IEditorMouseEvent, IEditorContributionCtor } from 'vs/editor/browser/editorBrowser';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { DefaultSettingsHeaderWidget, SettingsGroupTitleWidget, SettingsCountWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { IContextKeyService, IContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { CommonEditorRegistry, EditorCommand } from 'vs/editor/common/editorCommonExtensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEventService } from 'vs/platform/event/common/event';
import { IMessageService } from 'vs/platform/message/common/message';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';

// Ignore following contributions
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { FindController } from 'vs/editor/contrib/find/browser/find';
import { SelectionHighlighter } from 'vs/editor/contrib/find/common/findController';


export class DefaultPreferencesEditorInput extends ResourceEditorInput {

	public static ID = 'workbench.editorinputs.defaultpreferences';

	private _willDispose = new Emitter<void>();
	public willDispose: Event<void> = this._willDispose.event;

	constructor(resource: URI, @ITextModelResolverService textModelResolverService: ITextModelResolverService
	) {
		super(nls.localize('settingsEditorName', "Default Settings"), '', resource, textModelResolverService);
	}

	getResource(): URI {
		return this.resource;
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
	private static VIEW_STATE: Map<URI, editorCommon.IEditorViewState> = new Map<URI, editorCommon.IEditorViewState>();

	private inputDisposeListener;
	private defaultSettingHeaderWidget: DefaultSettingsHeaderWidget;

	private delayedFilterLogging: Delayer<void>;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IMessageService messageService: IMessageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEventService eventService: IEventService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IThemeService themeService: IThemeService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService
	) {
		super(DefaultPreferencesEditor.ID, telemetryService, instantiationService, contextService, storageService, messageService, configurationService, eventService, editorService, themeService);
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
			options.overviewRulerLanes = 0;
			options.renderIndentGuides = false;
			options.rulers = [];
		}
		return options;
	}

	setInput(input: DefaultPreferencesEditorInput, options: EditorOptions): TPromise<void> {
		this.listenToInput(input);
		return super.setInput(input, options)
			.then(() => this.updateInput());
	}

	public layout(dimension: Dimension) {
		this.defaultSettingHeaderWidget.layout(dimension);
		const headerWidgetPosition = DOM.getDomNodePagePosition(this.defaultSettingHeaderWidget.domNode);
		this.getControl().layout({
			height: dimension.height - headerWidgetPosition.height,
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
			.then(editorModel => editorModel.load())
			.then(editorModel => this.getControl().setModel((<ResourceEditorModel>editorModel).textEditorModel));
	}

	private filterPreferences(filter: string) {
		this.delayedFilterLogging.trigger(() => this.reportFilteringUsed(filter));
		(<DefaultSettingsRenderer>this.getDefaultPreferencesContribution().getPreferencesRenderer()).filterPreferences(filter);
	}

	private focusNextPreference() {
		(<DefaultSettingsRenderer>this.getDefaultPreferencesContribution().getPreferencesRenderer()).focusNextSetting();
	}

	public clearInput(): void {
		this.getControl().setModel(null);
		this.saveState(<DefaultPreferencesEditorInput>this.input);
		if (this.inputDisposeListener) {
			this.inputDisposeListener.dispose();
		}
		super.clearInput();
	}

	private getDefaultPreferencesContribution(): PreferencesEditorContribution {
		return <PreferencesEditorContribution>(<CodeEditor>this.getControl()).getContribution(PreferencesEditorContribution.ID);
	}

	protected restoreViewState(input: EditorInput) {
		const viewState = DefaultPreferencesEditor.VIEW_STATE.get((<DefaultPreferencesEditorInput>input).getResource());
		if (viewState) {
			this.getControl().restoreViewState(viewState);
		}
	}

	private saveState(input: DefaultPreferencesEditorInput) {
		const state = this.getControl().saveViewState();
		if (state) {
			const resource = input.getResource();
			if (DefaultPreferencesEditor.VIEW_STATE.has(resource)) {
				DefaultPreferencesEditor.VIEW_STATE.delete(resource);
			}
			DefaultPreferencesEditor.VIEW_STATE.set(resource, state);
		}
	}

	private listenToInput(input: EditorInput) {
		if (this.inputDisposeListener) {
			this.inputDisposeListener.dispose();
		}
		if (input instanceof DefaultPreferencesEditorInput) {
			this.inputDisposeListener = (<DefaultPreferencesEditorInput>input).willDispose(() => this.saveState(<DefaultPreferencesEditorInput>input));
		}
	}

	private reportFilteringUsed(filter: string): void {
		let data = {};
		data['filter'] = filter;
		this.telemetryService.publicLog('defaultSettings.filter', data);
	}
}

class DefaultPreferencesCodeEditor extends CodeEditor {

	protected _getContributions(): IEditorContributionCtor[] {
		let contributions = super._getContributions();
		let skipContributions = [FoldingController.prototype, SelectionHighlighter.prototype, FindController.prototype];
		contributions.filter(c => skipContributions.indexOf(c.prototype) === -1);
		contributions.push(DefaultSettingsEditorContribution);
		return contributions;
	}
}

export interface IPreferencesRenderer {
	render();
	dispose();
}

export abstract class PreferencesEditorContribution extends Disposable implements editorCommon.IEditorContribution {

	static ID: string = 'editor.contrib.preferences';
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

	getId(): string {
		return PreferencesEditorContribution.ID;
	}

	getPreferencesRenderer(): IPreferencesRenderer {
		return this.preferencesRenderer;
	}

	protected abstract createPreferencesRenderer(editorModel: IPreferencesEditorModel): IPreferencesRenderer

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
	protected createPreferencesRenderer(editorModel: IPreferencesEditorModel): IPreferencesRenderer {
		if (editorModel instanceof DefaultSettingsEditorModel) {
			return this.instantiationService.createInstance(DefaultSettingsRenderer, this.editor, editorModel);
		}
		return null;
	}
}

@editorContribution
export class SettingsEditorContribution extends PreferencesEditorContribution implements editorCommon.IEditorContribution {
	protected createPreferencesRenderer(editorModel: IPreferencesEditorModel): IPreferencesRenderer {
		if (editorModel instanceof SettingsEditorModel) {
			return this.instantiationService.createInstance(SettingsRenderer, this.editor, editorModel);
		}
		return null;
	}
}

export class SettingsRenderer extends Disposable implements IPreferencesRenderer {

	private copySettingActionRenderer: CopySettingActionRenderer;
	private modelChangeDelayer: Delayer<void> = new Delayer<void>(200);

	constructor(protected editor: ICodeEditor, protected settingsEditorModel: SettingsEditorModel,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();
		this.copySettingActionRenderer = this._register(instantiationService.createInstance(CopySettingActionRenderer, editor, false));
		this._register(editor.getModel().onDidChangeContent(() => this.modelChangeDelayer.trigger(() => this.onModelChanged())));
	}

	public render(): void {
		this.copySettingActionRenderer.render(this.settingsEditorModel.settingsGroups);
	}

	private onModelChanged(): void {
		if (!this.editor.getModel()) {
			// model could have been disposed during the delay
			return;
		}
		this.render();
	}
}

export class DefaultSettingsRenderer extends Disposable implements IPreferencesRenderer {

	private defaultSettingsEditorContextKey: IContextKey<boolean>;

	private settingsGroupTitleRenderer: SettingsGroupTitleRenderer;
	private filteredMatchesRenderer: FilteredMatchesRenderer;
	private focusNextSettingRenderer: FocusNextSettingRenderer;
	private hiddenAreasRenderer: HiddenAreasRenderer;
	private copySettingActionRenderer: CopySettingActionRenderer;
	private settingsCountWidget: SettingsCountWidget;

	constructor(protected editor: ICodeEditor, protected settingsEditorModel: DefaultSettingsEditorModel,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();
		this.defaultSettingsEditorContextKey = CONTEXT_DEFAULT_SETTINGS_EDITOR.bindTo(contextKeyService);
		this.settingsGroupTitleRenderer = this._register(instantiationService.createInstance(SettingsGroupTitleRenderer, editor));
		this.filteredMatchesRenderer = this._register(instantiationService.createInstance(FilteredMatchesRenderer, editor));
		this.focusNextSettingRenderer = this._register(instantiationService.createInstance(FocusNextSettingRenderer, editor));
		this.copySettingActionRenderer = this._register(instantiationService.createInstance(CopySettingActionRenderer, editor, true));
		this.settingsCountWidget = this._register(instantiationService.createInstance(SettingsCountWidget, editor, this.getCount(settingsEditorModel.settingsGroups)));
		const paranthesisHidingRenderer = this._register(instantiationService.createInstance(ParanthesisHidingRenderer, editor));
		this.hiddenAreasRenderer = this._register(instantiationService.createInstance(HiddenAreasRenderer, editor, [this.settingsGroupTitleRenderer, this.filteredMatchesRenderer, paranthesisHidingRenderer]));
	}

	public render() {
		this.defaultSettingsEditorContextKey.set(true);
		this.settingsGroupTitleRenderer.render(this.settingsEditorModel.settingsGroups);
		this.copySettingActionRenderer.render(this.settingsEditorModel.settingsGroups);
		this.settingsCountWidget.render();
		this.hiddenAreasRenderer.render();
		this.focusNextSettingRenderer.render([]);
		this.settingsGroupTitleRenderer.showGroup(1);
	}

	public filterPreferences(filter: string) {
		const filterResult = this.settingsEditorModel.filterSettings(filter);
		this.filteredMatchesRenderer.render(filterResult);
		this.settingsGroupTitleRenderer.render(filterResult.filteredGroups);
		this.settingsCountWidget.show(this.getCount(filterResult.filteredGroups));

		if (!filter) {
			this.focusNextSettingRenderer.render([]);
			this.settingsGroupTitleRenderer.showGroup(1);
		} else {
			this.focusNextSettingRenderer.render(filterResult.filteredGroups);
		}
	}

	public focusNextSetting(): void {
		const setting = this.focusNextSettingRenderer.focusNext();
		if (setting) {
			this.settingsGroupTitleRenderer.showSetting(setting);
		}
	}

	public collapseAll() {
		this.settingsGroupTitleRenderer.collapseAll();
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
	onHiddenAreasChanged: Event<void>;
	hiddenAreas: editorCommon.IRange[];
}

export class ParanthesisHidingRenderer extends Disposable implements HiddenAreasProvider {

	private _onHiddenAreasChanged: Emitter<void> = new Emitter<void>();
	get onHiddenAreasChanged(): Event<void> { return this._onHiddenAreasChanged.event; };

	constructor(private editor: ICodeEditor
	) {
		super();
	}

	get hiddenAreas(): editorCommon.IRange[] {
		const model = this.editor.getModel();
		return [
			{
				startLineNumber: 1,
				startColumn: model.getLineMinColumn(1),
				endLineNumber: 1,
				endColumn: model.getLineMaxColumn(1)
			},
			{
				startLineNumber: model.getLineCount(),
				startColumn: model.getLineMinColumn(model.getLineCount()),
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

	private model: editorCommon.IModel;

	constructor(private editor: ICodeEditor, private hiddenAreasProviders: HiddenAreasProvider[],
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
		for (const hiddenAreProvider of hiddenAreasProviders) {
			this._register(hiddenAreProvider.onHiddenAreasChanged(() => this.render()));
		}
	}

	public render() {
		this.model = this.editor.getModel();
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
	private model: editorCommon.IModel;
	public hiddenAreas: editorCommon.IRange[] = [];

	private _onHiddenAreasChanged: Emitter<void> = new Emitter<void>();
	get onHiddenAreasChanged(): Event<void> { return this._onHiddenAreasChanged.event; };

	constructor(private editor: ICodeEditor,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
	}

	public render(result: IFilterResult): void {
		this.model = this.editor.getModel();
		this.hiddenAreas = [];
		this.model.changeDecorations(changeAccessor => {
			this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []);
		});
		if (result) {
			this.hiddenAreas = this.computeHiddenRanges(result.filteredGroups, result.allGroups, this.model);
			this.model.changeDecorations(changeAccessor => {
				this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, flatten(result.matches.values()).map(match => this.createDecoration(match, this.model)));
			});
		}
		this._onHiddenAreasChanged.fire();
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
					if (section.descriptionRange) {
						if (!this.containsLine(section.descriptionRange.startLineNumber, filteredGroup)) {
							notMatchesRanges.push(this.createCompleteRange(section.descriptionRange, model));
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
			if (section.descriptionRange && lineNumber >= section.descriptionRange.startLineNumber && lineNumber <= section.descriptionRange.endLineNumber) {
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
		if (this.decorationIds && this.model) {
			this.decorationIds = this.model.changeDecorations(changeAccessor => {
				return changeAccessor.deltaDecorations(this.decorationIds, []);
			});
		}
		super.dispose();
	}
}

export class FocusNextSettingRenderer extends Disposable {

	private iterator: ArrayIterator<ISetting>;
	private model: editorCommon.IModel;
	private decorationIds: string[] = [];

	constructor(private editor: ICodeEditor) {
		super();
	}

	public focusNext(): ISetting {
		this.clear();
		let setting = this.iterator.next() || this.iterator.first();
		if (setting) {
			this.model.changeDecorations(changeAccessor => {
				this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, [{
					range: {
						startLineNumber: setting.valueRange.startLineNumber,
						startColumn: this.model.getLineMinColumn(setting.valueRange.startLineNumber),
						endLineNumber: setting.valueRange.endLineNumber,
						endColumn: this.model.getLineMaxColumn(setting.valueRange.endLineNumber)
					},
					options: {
						stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
						className: 'rangeHighlight',
						isWholeLine: true
					}
				}]);
			});
			this.editor.revealLinesInCenterIfOutsideViewport(setting.valueRange.startLineNumber, setting.valueRange.endLineNumber - 1);
			return setting;
		}
		return null;
	}

	public render(filteredGroups: ISettingsGroup[]) {
		this.clear();
		this.model = this.editor.getModel();

		const settings: ISetting[] = [];
		for (const group of filteredGroups) {
			for (const section of group.sections) {
				settings.push(...section.settings);
			}
		}
		this.iterator = new ArrayIterator<ISetting>(settings);
	}

	private clear() {
		if (this.model) {
			this.model.changeDecorations(changeAccessor => {
				this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []);
			});
		}
	}

	public dispose() {
		this.clear();
		super.dispose();
	}
}

export class CopySettingActionRenderer extends Disposable {

	private decorationIds: string[] = [];
	private settingsGroups: ISettingsGroup[];
	private model: editorCommon.IModel;

	constructor(private editor: ICodeEditor, private isDefaultSettings: boolean,
		@IPreferencesService private settingsService: IPreferencesService,
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		super();
		this._register(editor.onMouseUp(e => this.onEditorMouseUp(e)));
	}

	public render(settingsGroups: ISettingsGroup[]): void {
		this.model = this.editor.getModel();
		this.settingsGroups = settingsGroups;
		this.model.changeDecorations(changeAccessor => {
			this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []);
		});
		this.model.changeDecorations(changeAccessor => {
			this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, this.createDecorations(this.model));
		});
	}

	private createDecorations(model: editorCommon.IModel): editorCommon.IModelDeltaDecoration[] {
		let result: editorCommon.IModelDeltaDecoration[] = [];
		for (const settingsGroup of this.settingsGroups) {
			for (const settingsSection of settingsGroup.sections) {
				for (const setting of settingsSection.settings) {
					const decoration = this.createSettingDecoration(setting, model);
					if (decoration) {
						result.push(decoration);
					}
				}
			}
		}
		return result;
	}

	private createSettingDecoration(setting: ISetting, model: editorCommon.IModel): editorCommon.IModelDeltaDecoration {
		const jsonSchema: IJSONSchema = this.getConfigurationsMap()[setting.key];
		if (jsonSchema) {
			const canChooseValue = jsonSchema.enum || jsonSchema.type === 'boolean';
			if (this.isDefaultSettings || canChooseValue) {
				const lineNumber = setting.keyRange.startLineNumber;
				return {
					range: {
						startLineNumber: lineNumber,
						startColumn: model.getLineMaxColumn(lineNumber),
						endLineNumber: lineNumber,
						endColumn: model.getLineMaxColumn(lineNumber),
					},
					options: {
						afterContentClassName: 'copySetting',
						stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
						hoverMessage: canChooseValue ? this.isDefaultSettings ? nls.localize('selectAndCopySetting', "Select a value and copy to Settings")
							: nls.localize('selectValue', "Select a value") : nls.localize('copy', "Copy to Settings")
					}
				};
			}
		}
		return null;
	}

	private onEditorMouseUp(e: IEditorMouseEvent): void {
		let range = e.target.range;
		if (!range || !range.isEmpty) {
			return;
		}
		if (!e.event.leftButton) {
			return;
		}

		switch (e.target.type) {
			case editorCommon.MouseTargetType.CONTENT_EMPTY:
				if (DOM.hasClass(<HTMLElement>e.target.element, 'copySetting')) {
					this.onClick(e);
				}
				return;
			default:
				return;
		}
	}

	private getConfigurationsMap(): { [qualifiedKey: string]: IJSONSchema } {
		return Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
	}

	private onClick(e: IEditorMouseEvent) {
		const setting = this.getSetting(e.target.range.startLineNumber);
		if (setting) {
			let jsonSchema: IJSONSchema = this.getConfigurationsMap()[setting.key];
			const actions = this.getActions(setting, jsonSchema);
			let elementPosition = DOM.getDomNodePagePosition(<HTMLElement>e.target.element);
			const anchor = { x: elementPosition.left, y: elementPosition.top + elementPosition.height + 10 };
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => TPromise.wrap(actions)
			});
		}
	}

	private getSetting(lineNumber: number): ISetting {
		for (const group of this.settingsGroups) {
			if (lineNumber >= group.range.startLineNumber && lineNumber <= group.range.endLineNumber) {
				for (const section of group.sections) {
					for (const setting of section.settings) {
						if (lineNumber >= setting.keyRange.startLineNumber && lineNumber <= setting.keyRange.endLineNumber) {
							return setting;
						}
					}
				}
			}
		}
		return null;
	}

	private getActions(setting: ISetting, jsonSchema: IJSONSchema): IAction[] {
		if (jsonSchema.type === 'boolean') {
			return [<IAction>{
				id: 'truthyValue',
				label: 'true',
				enabled: true,
				run: () => this.settingsService.copyConfiguration({ key: setting.key, value: true })
			}, <IAction>{
				id: 'falsyValue',
				label: 'false',
				enabled: true,
				run: () => this.settingsService.copyConfiguration({ key: setting.key, value: false })
			}];
		}
		if (jsonSchema.enum) {
			return jsonSchema.enum.map(value => {
				return <IAction>{
					id: value,
					label: JSON.stringify(value),
					enabled: true,
					run: () => this.settingsService.copyConfiguration({ key: setting.key, value })
				};
			});
		}
		return [<IAction>{
			id: 'copyToSettings',
			label: nls.localize('copyToSettings', "Copy to Settings"),
			enabled: true,
			run: () => this.settingsService.copyConfiguration(setting)
		}];
	}

	public dispose() {
		if (this.model) {
			this.model.deltaDecorations(this.decorationIds, []);
		}
		super.dispose();
	}
}

const DefaultSettingsEditorCommand = EditorCommand.bindToContribution<PreferencesEditorContribution>((editor: editorCommon.ICommonCodeEditor) => <PreferencesEditorContribution>editor.getContribution(PreferencesEditorContribution.ID));

CommonEditorRegistry.registerEditorCommand(new DefaultSettingsEditorCommand({
	id: DEFAULT_EDITOR_COMMAND_COLLAPSE_ALL,
	precondition: ContextKeyExpr.and(CONTEXT_DEFAULT_SETTINGS_EDITOR),
	handler: x => (<DefaultSettingsRenderer>x.getPreferencesRenderer()).collapseAll()
}));