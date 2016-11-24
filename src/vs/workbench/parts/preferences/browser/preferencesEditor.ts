/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import { hasClass, getDomNodePagePosition } from 'vs/base/browser/dom';
import { parse } from 'vs/base/common/json';
import { Disposable } from 'vs/base/common/lifecycle';
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
import { IFoldingController, ID as FoldingContributionId } from 'vs/editor/contrib/folding/common/folding';
import { IPreferencesService, ISettingsGroup, ISetting, ISettingsEditorModel, IKeybindingsEditorModel } from 'vs/workbench/parts/preferences/common/preferences';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';

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
		} else if (input instanceof DefaultSettingsInput) {
			this.foldAll();
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

	private foldAll() {
		const foldingController = (<editorCommon.ICommonCodeEditor>this.getControl()).getContribution<IFoldingController>(FoldingContributionId);
		foldingController.foldAll();
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

@editorContribution
export class DefaultSettingsContribution extends Disposable implements editorCommon.IEditorContribution {

	private settingsActions: SettingsActionsDecorators = null;

	constructor(private editor: ICodeEditor,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super();
		this._register(editor.onDidChangeModel(() => this.onModelChanged()));
	}

	public getId(): string {
		return 'editor.contrib.settings';
	}

	private onModelChanged(): void {
		const model = this.editor.getModel();

		if (!this.canHandle(model)) {
			if (this.settingsActions) {
				this.settingsActions.dispose();
				this.settingsActions = null;
			}
			return;
		}

		if (model.uri.fsPath === this.preferencesService.defaultSettings.uri.fsPath) {
			this.styleDefaultSettings(model);
		}
	}

	private canHandle(model: editorCommon.IModel) {
		if (model) {
			if (model.uri.fsPath === this.preferencesService.defaultSettings.uri.fsPath) {
				return true;
			}
		}
		return false;
	}

	private styleDefaultSettings(model: editorCommon.IModel) {
		this.renderDecorations(model);
	}

	private renderDecorations(model: editorCommon.IModel) {
		this.settingsActions = this.instantiationService.createInstance(SettingsActionsDecorators, this.editor);
		this.settingsActions.render(this.preferencesService.defaultSettings.settingsGroups);
	}
}

export class SettingsActionsDecorators extends Disposable {

	private decorationIds: string[] = [];

	constructor(private editor: ICodeEditor,
		@IPreferencesService private settingsService: IPreferencesService,
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		super();
		this._register(editor.onMouseUp(e => this.onEditorMouseUp(e)));
	}

	public render(settingGroups: ISettingsGroup[]): void {
		const model = this.editor.getModel();
		model.changeDecorations(changeAccessor => {
			this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []);
		});
		model.changeDecorations(changeAccessor => {
			this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, this.createDecorations(settingGroups, model));
		});
	}

	private createDecorations(settingsGroups: ISettingsGroup[], model: editorCommon.IModel): editorCommon.IModelDeltaDecoration[] {
		let result: editorCommon.IModelDeltaDecoration[] = [];
		for (const settingsGroup of settingsGroups) {
			for (const settingsSection of settingsGroup.sections) {
				for (const setting of settingsSection.settings) {
					result.push(this.createDecoration(setting, model));
				}
			}
		}
		return result;
	}

	private createDecoration(setting: ISetting, model: editorCommon.IModel): editorCommon.IModelDeltaDecoration {
		const jsonSchema: IJSONSchema = this.getConfigurationsMap()[setting.key];
		const maxColumn = model.getLineMaxColumn(setting.valueRange.startLineNumber);
		const range = {
			startLineNumber: setting.valueRange.startLineNumber,
			startColumn: maxColumn,
			endLineNumber: setting.valueRange.startLineNumber,
			endColumn: maxColumn
		};
		return {
			range, options: {
				afterContentClassName: `copySetting${(jsonSchema.enum || jsonSchema.type === 'boolean') ? '.select' : ''}`,
			}
		};
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
		const model = this.editor.getModel();
		const setting = parse('{' + model.getLineContent(e.target.range.startLineNumber) + '}');
		const key = Object.keys(setting)[0];
		let value = setting[key];
		let jsonSchema: IJSONSchema = this.getConfigurationsMap()[key];
		const actions = this.getActions(key, jsonSchema);
		if (actions) {
			let elementPosition = getDomNodePagePosition(<HTMLElement>e.target.element);
			const anchor = { x: elementPosition.left + elementPosition.width, y: elementPosition.top + elementPosition.height + 10 };
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => TPromise.wrap(actions)
			});
			return;
		}
		this.settingsService.copyConfiguration({ key, value });
	}

	private getActions(key: string, jsonSchema: IJSONSchema): IAction[] {
		if (jsonSchema.type === 'boolean') {
			return [<IAction>{
				id: 'truthyValue',
				label: 'true',
				enabled: true,
				run: () => this.settingsService.copyConfiguration({ key, value: true })
			}, <IAction>{
				id: 'falsyValue',
				label: 'false',
				enabled: true,
				run: () => this.settingsService.copyConfiguration({ key, value: false })
			}];
		}
		if (jsonSchema.enum) {
			return jsonSchema.enum.map(value => {
				return <IAction>{
					id: value,
					label: value,
					enabled: true,
					run: () => this.settingsService.copyConfiguration({ key, value })
				};
			});
		}
		return null;
	}
}