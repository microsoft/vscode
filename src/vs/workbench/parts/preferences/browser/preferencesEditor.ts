/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import { hasClass, getDomNodePagePosition } from 'vs/base/browser/dom';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { flatten } from 'vs/base/common/arrays';
import { IAction } from 'vs/base/common/actions';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import Event, { Emitter } from 'vs/base/common/event';
import { LinkedMap as Map } from 'vs/base/common/map';
import { Registry } from 'vs/platform/platform';
import { EditorOptions, EditorInput, } from 'vs/workbench/common/editor';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { StringEditor } from 'vs/workbench/browser/parts/editor/stringEditor';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import {
	IPreferencesService, ISettingsGroup, ISetting, ISettingsEditorModel, IKeybindingsEditorModel, IPreferencesEditorModel, IFilterResult, CONTEXT_DEFAULT_SETTINGS_EDITOR,
	DEFAULT_EDITOR_COMMAND_COLLAPSE_ALL
} from 'vs/workbench/parts/preferences/common/preferences';
import { SettingsEditorModel, DefaultSettingsEditorModel } from 'vs/workbench/parts/preferences/common/preferencesModels';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { DefaultSettingsHeaderWidget, SettingsGroupTitleWidget, FloatingClickWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { IContextKeyService, IContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { CommonEditorRegistry, EditorCommand } from 'vs/editor/common/editorCommonExtensions';
import { DefineUserSettingAction, DefineWorkspaceSettingAction } from 'vs/workbench/parts/preferences/browser/preferencesActions';
import { ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';


export class DefaultPreferencesInput extends ResourceEditorInput {

	private _willDispose = new Emitter<void>();
	public willDispose: Event<void> = this._willDispose.event;

	constructor(
		name: string,
		description: string,
		resource: URI,
		@ITextModelResolverService textModelResolverService: ITextModelResolverService
	) {
		super(name, description, resource, textModelResolverService);
	}

	public getResource(): URI {
		return this.resource;
	}

	public dispose() {
		this._willDispose.fire();
		this._willDispose.dispose();
		super.dispose();
	}
}

export class DefaultSettingsInput extends DefaultPreferencesInput {
	private static INSTANCE: DefaultSettingsInput;

	public static getInstance(instantiationService: IInstantiationService, defaultSettings: ISettingsEditorModel): DefaultSettingsInput {
		if (!DefaultSettingsInput.INSTANCE) {
			DefaultSettingsInput.INSTANCE = instantiationService.createInstance(DefaultSettingsInput, nls.localize('defaultName', "Default Settings"), null, defaultSettings.uri);
		}
		return DefaultSettingsInput.INSTANCE;
	}
}

export class DefaultKeybindingsInput extends DefaultPreferencesInput {
	private static INSTANCE: DefaultKeybindingsInput;

	public static getInstance(instantiationService: IInstantiationService, defaultKeybindings: IKeybindingsEditorModel): DefaultKeybindingsInput {
		if (!DefaultKeybindingsInput.INSTANCE) {
			DefaultKeybindingsInput.INSTANCE = instantiationService.createInstance(DefaultKeybindingsInput, nls.localize('defaultKeybindings', "Default Keyboard Shortcuts"), null, defaultKeybindings.uri);
		}

		return DefaultKeybindingsInput.INSTANCE;
	}
}

export class DefaultPreferencesEditor extends StringEditor {

	public static ID = 'workbench.editors.defaultPrefrencesEditor';

	private static VIEW_STATE: Map<URI, editorCommon.IEditorViewState> = new Map<URI, editorCommon.IEditorViewState>();

	private inputDisposeListener;

	public getId(): string {
		return DefaultPreferencesEditor.ID;
	}

	protected getCodeEditorOptions(): editorCommon.IEditorOptions {
		const options = super.getCodeEditorOptions();
		options.lineNumbers = 'off';
		options.renderLineHighlight = 'none';
		options.scrollBeyondLastLine = false;
		options.folding = false;
		options.renderWhitespace = 'none';
		options.wrappingColumn = 0;
		return options;
	}


	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		this.listenToInput(input);
		return super.setInput(input, options);
	}

	public clearInput(): void {
		this.saveState(<DefaultPreferencesInput>this.input);
		if (this.inputDisposeListener) {
			this.inputDisposeListener.dispose();
		}
		super.clearInput();
	}

	protected restoreViewState(input: EditorInput) {
		const viewState = DefaultPreferencesEditor.VIEW_STATE.get((<DefaultPreferencesInput>input).getResource());
		if (viewState) {
			this.getControl().restoreViewState(viewState);
		}
	}

	private saveState(input: DefaultPreferencesInput) {
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
		if (input instanceof DefaultPreferencesInput) {
			this.inputDisposeListener = (<DefaultPreferencesInput>input).willDispose(() => this.saveState(<DefaultPreferencesInput>input));
		}
	}
}

export interface IPreferencesRenderer {
	render();
	dispose();
}

@editorContribution
export class PreferencesEditorContribution extends Disposable implements editorCommon.IEditorContribution {

	static ID: string = 'editor.contrib.preferences';
	private preferencesRenderer: IPreferencesRenderer;

	constructor(private editor: ICodeEditor,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPreferencesService private preferencesService: IPreferencesService
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

	private createPreferencesRenderer(editorModel: IPreferencesEditorModel): IPreferencesRenderer {
		if (editorModel instanceof DefaultSettingsEditorModel) {
			return this.instantiationService.createInstance(DefaultSettingsRenderer, this.editor, editorModel);
		}
		if (editorModel instanceof SettingsEditorModel) {
			return this.instantiationService.createInstance(SettingsRenderer, this.editor, editorModel);
		}
		return null;
	}

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

export class SettingsRenderer extends Disposable implements IPreferencesRenderer {

	private copySettingActionRenderer: CopySettingActionRenderer;
	private definePreferenceWidget: FloatingClickWidget;

	constructor(protected editor: ICodeEditor, protected settingsEditorModel: SettingsEditorModel,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();
		const ACTION = settingsEditorModel.configurationTarget === ConfigurationTarget.USER ? DefineUserSettingAction : DefineWorkspaceSettingAction;
		this.copySettingActionRenderer = this._register(instantiationService.createInstance(CopySettingActionRenderer, editor, false));
		this.definePreferenceWidget = this._register(instantiationService.createInstance(FloatingClickWidget, editor, ACTION.LABEL, ACTION.ID));
	}

	public render() {
		this.copySettingActionRenderer.render(this.settingsEditorModel.settingsGroups);
		this.definePreferenceWidget.render();
		this._register(this.definePreferenceWidget.onClick(() => this.preferencesService.pickSetting(this.settingsEditorModel.configurationTarget)));
	}
}

export class DefaultSettingsRenderer extends Disposable implements IPreferencesRenderer {

	private defaultSettingsEditorContextKey: IContextKey<boolean>;

	private headerWidget: DefaultSettingsHeaderWidget;
	private settingsGroupTitleRenderer: SettingsGroupTitleRenderer;
	private filteredMatchesRenderer: FilteredMatchesRenderer;
	private hiddenAreasRenderer: HiddenAreasRenderer;
	private copySettingActionRenderer: CopySettingActionRenderer;

	constructor(protected editor: ICodeEditor, protected settingsEditorModel: DefaultSettingsEditorModel,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();
		this.defaultSettingsEditorContextKey = CONTEXT_DEFAULT_SETTINGS_EDITOR.bindTo(contextKeyService);
		this.headerWidget = this._register(instantiationService.createInstance(DefaultSettingsHeaderWidget, editor));
		this.settingsGroupTitleRenderer = this._register(instantiationService.createInstance(SettingsGroupTitleRenderer, editor));
		this.filteredMatchesRenderer = this._register(instantiationService.createInstance(FilteredMatchesRenderer, editor));
		this.copySettingActionRenderer = this._register(instantiationService.createInstance(CopySettingActionRenderer, editor, true));
		const paranthesisHidingRenderer = this._register(instantiationService.createInstance(ParanthesisHidingRenderer, editor));
		this.hiddenAreasRenderer = this._register(instantiationService.createInstance(HiddenAreasRenderer, editor, [this.settingsGroupTitleRenderer, this.filteredMatchesRenderer, paranthesisHidingRenderer]));
	}

	public render() {
		this.defaultSettingsEditorContextKey.set(true);
		this.headerWidget.render();
		this.settingsGroupTitleRenderer.render(this.settingsEditorModel.settingsGroups);
		this._register(this.headerWidget.onDidChange(value => this.filterPreferences(value)));
		this.copySettingActionRenderer.render(this.settingsEditorModel.settingsGroups);
		this.editor.setScrollTop(0);
	}

	public filterPreferences(filter: string) {
		const filterResult = this.settingsEditorModel.filterSettings(filter);
		this.filteredMatchesRenderer.render(filterResult);
		this.settingsGroupTitleRenderer.render(filterResult.filteredGroups);
		this.editor.setScrollTop(0);
	}

	public collapseAll() {
		this.settingsGroupTitleRenderer.collapseAll();
	}

	public setSearchValue(value: string) {
		this.headerWidget.setInput(value);
	}

	dispose() {
		this.defaultSettingsEditorContextKey.reset();
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
	}

	public collapseAll() {
		this.editor.setPosition({ lineNumber: 1, column: 1 });
		this.hiddenGroups = this.settingsGroups.slice();
		for (const groupTitleWidget of this.settingsGroupTitleWidgets) {
			groupTitleWidget.collapse();
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
		for (const hiddenAreProvider of hiddenAreasProviders) {
			this._register(hiddenAreProvider.onHiddenAreasChanged(() => this.onHiddenAreasChanged()));
		}
		this.onHiddenAreasChanged();
	}

	private onHiddenAreasChanged() {
		const ranges: editorCommon.IRange[] = [];
		for (const hiddenAreaProvider of this.hiddenAreasProviders) {
			ranges.push(...hiddenAreaProvider.hiddenAreas);
		}
		this.editor.setHiddenAreas(ranges);
	}
}

export class FilteredMatchesRenderer extends Disposable implements HiddenAreasProvider {

	private decorationIds: string[] = [];
	public hiddenAreas: editorCommon.IRange[] = [];

	private _onHiddenAreasChanged: Emitter<void> = new Emitter<void>();
	get onHiddenAreasChanged(): Event<void> { return this._onHiddenAreasChanged.event; };

	constructor(private editor: ICodeEditor,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
	}

	public render(result: IFilterResult): void {
		const model = this.editor.getModel();
		this.hiddenAreas = [];
		model.changeDecorations(changeAccessor => {
			this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []);
		});
		if (result) {
			this.hiddenAreas = this.computeHiddenRanges(result.filteredGroups, result.allGroups, model);
			model.changeDecorations(changeAccessor => {
				this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, flatten(result.matches.values()).map(match => this.createDecoration(match, model)));
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
		if (this.decorationIds && this.editor.getModel()) {
			this.decorationIds = this.editor.getModel().changeDecorations(changeAccessor => {
				this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []);
			});
		}
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
				return {
					range: {
						startLineNumber: setting.valueRange.startLineNumber,
						startColumn: model.getLineMaxColumn(setting.valueRange.startLineNumber),
						endLineNumber: setting.valueRange.startLineNumber,
						endColumn: model.getLineMaxColumn(setting.valueRange.startLineNumber),
					},
					options: {
						afterContentClassName: 'copySetting',
						stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
						hoverMessage: canChooseValue ? this.isDefaultSettings ? nls.localize('selectAndCopySetting', "Select a value and copy to settings")
							: nls.localize('selectValue', "Select a value") : nls.localize('copy', "Copy to settings")
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
				if (hasClass(<HTMLElement>e.target.element, 'copySetting')) {
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
			if (actions) {
				let elementPosition = getDomNodePagePosition(<HTMLElement>e.target.element);
				const anchor = { x: elementPosition.left, y: elementPosition.top + elementPosition.height + 10 };
				this.contextMenuService.showContextMenu({
					getAnchor: () => anchor,
					getActions: () => TPromise.wrap(actions)
				});
				return;
			}
			this.settingsService.copyConfiguration(setting);
		}
	}

	private getSetting(lineNumber: number): ISetting {
		for (const group of this.settingsGroups) {
			if (lineNumber >= group.range.startLineNumber && lineNumber <= group.range.endLineNumber) {
				for (const section of group.sections) {
					for (const setting of section.settings) {
						if (lineNumber >= setting.valueRange.startLineNumber && lineNumber <= setting.valueRange.endLineNumber) {
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
					label: value,
					enabled: true,
					run: () => this.settingsService.copyConfiguration({ key: setting.key, value })
				};
			});
		}
		return null;
	}

	public dispose() {
		this.model.deltaDecorations(this.decorationIds, []);
		super.dispose();

	}
}

const DefaultSettingsEditorCommand = EditorCommand.bindToContribution<PreferencesEditorContribution>((editor: editorCommon.ICommonCodeEditor) => <PreferencesEditorContribution>editor.getContribution(PreferencesEditorContribution.ID));

CommonEditorRegistry.registerEditorCommand(new DefaultSettingsEditorCommand({
	id: DEFAULT_EDITOR_COMMAND_COLLAPSE_ALL,
	precondition: ContextKeyExpr.and(CONTEXT_DEFAULT_SETTINGS_EDITOR),
	handler: x => (<DefaultSettingsRenderer>x.getPreferencesRenderer()).collapseAll()
}));