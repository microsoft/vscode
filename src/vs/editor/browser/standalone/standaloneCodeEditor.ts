/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { empty as emptyDisposable, IDisposable, dispose, combinedDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CommandsRegistry, ICommandService, ICommandHandler } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions, IActionDescriptor, ICodeEditorWidgetCreationOptions, IDiffEditorOptions, IModel, IModelChangedEvent, EventType } from 'vs/editor/common/editorCommon';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { StandaloneKeybindingService } from 'vs/editor/browser/standalone/simpleServices';
import { IEditorContextViewService } from 'vs/editor/browser/standalone/standaloneServices';
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditorWidget';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IStandaloneThemeService } from 'vs/editor/common/services/standaloneThemeService';
import { InternalEditorAction } from 'vs/editor/common/editorAction';
import { MenuId, MenuRegistry, IMenuItem } from 'vs/platform/actions/common/actions';

/**
 * The options to create an editor.
 */
export interface IEditorConstructionOptions extends ICodeEditorWidgetCreationOptions {
	/**
	 * The initial value of the auto created model in the editor.
	 * To not create automatically a model, use `model: null`.
	 */
	value?: string;
	/**
	 * The initial language of the auto created model in the editor.
	 * To not create automatically a model, use `model: null`.
	 */
	language?: string;
}

/**
 * The options to create a diff editor.
 */
export interface IDiffEditorConstructionOptions extends IDiffEditorOptions {
}

export interface IStandaloneCodeEditor extends ICodeEditor {
	addCommand(keybinding: number, handler: ICommandHandler, context: string): string;
	createContextKey<T>(key: string, defaultValue: T): IContextKey<T>;
	addAction(descriptor: IActionDescriptor): IDisposable;
}

export interface IStandaloneDiffEditor extends IDiffEditor {
	addCommand(keybinding: number, handler: ICommandHandler, context: string): string;
	createContextKey<T>(key: string, defaultValue: T): IContextKey<T>;
	addAction(descriptor: IActionDescriptor): IDisposable;

	getOriginalEditor(): IStandaloneCodeEditor;
	getModifiedEditor(): IStandaloneCodeEditor;
}

let LAST_GENERATED_COMMAND_ID = 0;

/**
 * A code editor to be used both by the standalone editor and the standalone diff editor.
 */
export class StandaloneCodeEditor extends CodeEditor implements IStandaloneCodeEditor {

	private _standaloneKeybindingService: StandaloneKeybindingService;

	constructor(
		domElement: HTMLElement,
		options: IEditorConstructionOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(domElement, options, instantiationService, codeEditorService, commandService, contextKeyService);

		if (keybindingService instanceof StandaloneKeybindingService) {
			this._standaloneKeybindingService = keybindingService;
		}
	}

	public addCommand(keybinding: number, handler: ICommandHandler, context: string): string {
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot add command because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		let commandId = 'DYNAMIC_' + (++LAST_GENERATED_COMMAND_ID);
		let whenExpression = ContextKeyExpr.deserialize(context);
		this._standaloneKeybindingService.addDynamicKeybinding(commandId, keybinding, handler, whenExpression);
		return commandId;
	}

	public createContextKey<T>(key: string, defaultValue: T): IContextKey<T> {
		return this._contextKeyService.createKey(key, defaultValue);
	}

	public addAction(_descriptor: IActionDescriptor): IDisposable {
		if ((typeof _descriptor.id !== 'string') || (typeof _descriptor.label !== 'string') || (typeof _descriptor.run !== 'function')) {
			throw new Error('Invalid action descriptor, `id`, `label` and `run` are required properties!');
		}
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot add keybinding because the editor is configured with an unrecognized KeybindingService');
			return emptyDisposable;
		}

		// Read descriptor options
		const id = _descriptor.id;
		const label = _descriptor.label;
		const precondition = ContextKeyExpr.and(
			ContextKeyExpr.equals('editorId', this.getId()),
			ContextKeyExpr.deserialize(_descriptor.precondition)
		);
		const keybindings = _descriptor.keybindings;
		const keybindingsWhen = ContextKeyExpr.and(
			precondition,
			ContextKeyExpr.deserialize(_descriptor.keybindingContext)
		);
		const contextMenuGroupId = _descriptor.contextMenuGroupId || null;
		const contextMenuOrder = _descriptor.contextMenuOrder || 0;
		const run = (): TPromise<void> => {
			return TPromise.as(_descriptor.run(this));
		};


		let toDispose: IDisposable[] = [];

		// Generate a unique id to allow the same descriptor.id across multiple editor instances
		const uniqueId = this.getId() + ':' + id;

		// Register the command
		toDispose.push(CommandsRegistry.registerCommand(uniqueId, run));

		// Register the context menu item
		if (contextMenuGroupId) {
			let menuItem: IMenuItem = {
				command: {
					id: uniqueId,
					title: label
				},
				when: precondition,
				group: contextMenuGroupId,
				order: contextMenuOrder
			};
			toDispose.push(MenuRegistry.appendMenuItem(MenuId.EditorContext, menuItem));
		}

		// Register the keybindings
		if (Array.isArray(keybindings)) {
			toDispose = toDispose.concat(
				keybindings.map((kb) => {
					return this._standaloneKeybindingService.addDynamicKeybinding(uniqueId, kb, run, keybindingsWhen);
				})
			);
		}

		// Finally, register an internal editor action
		let internalAction = new InternalEditorAction(
			uniqueId,
			label,
			label,
			precondition,
			run,
			this._contextKeyService
		);

		// Store it under the original id, such that trigger with the original id will work
		this._actions[id] = internalAction;
		toDispose.push({
			dispose: () => {
				delete this._actions[id];
			}
		});

		return combinedDisposable(toDispose);
	}
}

export class StandaloneEditor extends StandaloneCodeEditor implements IStandaloneCodeEditor {

	private _contextViewService: IEditorContextViewService;
	private _standaloneThemeService: IStandaloneThemeService;
	private _ownsModel: boolean;
	private _toDispose2: IDisposable[];

	constructor(
		domElement: HTMLElement,
		options: IEditorConstructionOptions,
		toDispose: IDisposable,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextViewService contextViewService: IContextViewService,
		@IStandaloneThemeService standaloneThemeService: IStandaloneThemeService
	) {
		options = options || {};
		if (typeof options.theme === 'string') {
			options.theme = standaloneThemeService.setTheme(options.theme);
		}

		super(domElement, options, instantiationService, codeEditorService, commandService, contextKeyService, keybindingService);

		this._contextViewService = <IEditorContextViewService>contextViewService;
		this._standaloneThemeService = standaloneThemeService;
		this._toDispose2 = [toDispose];

		let model: IModel = null;
		if (typeof options.model === 'undefined') {
			model = (<any>self).monaco.editor.createModel(options.value || '', options.language || 'text/plain');
			this._ownsModel = true;
		} else {
			model = options.model;
			delete options.model;
			this._ownsModel = false;
		}

		this._attachModel(model);
		if (model) {
			let e: IModelChangedEvent = {
				oldModelUrl: null,
				newModelUrl: model.uri
			};
			this.emit(EventType.ModelChanged, e);
		}
	}

	public dispose(): void {
		super.dispose();
		this._toDispose2 = dispose(this._toDispose2);
	}

	public destroy(): void {
		this.dispose();
	}

	public updateOptions(newOptions: IEditorOptions): void {
		if (typeof newOptions.theme === 'string') {
			newOptions.theme = this._standaloneThemeService.setTheme(newOptions.theme);
		}
		super.updateOptions(newOptions);
	}

	_attachModel(model: IModel): void {
		super._attachModel(model);
		if (this._view) {
			this._contextViewService.setContainer(this._view.domNode.domNode);
		}
	}

	_postDetachModelCleanup(detachedModel: IModel): void {
		super._postDetachModelCleanup(detachedModel);
		if (detachedModel && this._ownsModel) {
			detachedModel.dispose();
			this._ownsModel = false;
		}
	}
}

export class StandaloneDiffEditor extends DiffEditorWidget implements IStandaloneDiffEditor {

	private _contextViewService: IEditorContextViewService;
	private _standaloneThemeService: IStandaloneThemeService;
	private _standaloneKeybindingService: StandaloneKeybindingService;
	private _toDispose2: IDisposable[];

	constructor(
		domElement: HTMLElement,
		options: IDiffEditorConstructionOptions,
		toDispose: IDisposable,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextViewService contextViewService: IContextViewService,
		@IStandaloneThemeService standaloneColorService: IStandaloneThemeService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
		@ICodeEditorService codeEditorService: ICodeEditorService
	) {
		options = options || {};
		if (typeof options.theme === 'string') {
			options.theme = standaloneColorService.setTheme(options.theme);
		}

		super(domElement, options, editorWorkerService, contextKeyService, instantiationService, codeEditorService);

		if (keybindingService instanceof StandaloneKeybindingService) {
			this._standaloneKeybindingService = keybindingService;
		}

		this._contextViewService = <IEditorContextViewService>contextViewService;
		this._standaloneThemeService = standaloneColorService;

		this._toDispose2 = [toDispose];

		this._contextViewService.setContainer(this._containerDomElement);
	}

	public dispose(): void {
		super.dispose();
		this._toDispose2 = dispose(this._toDispose2);
	}

	public destroy(): void {
		this.dispose();
	}

	public updateOptions(newOptions: IEditorOptions): void {
		if (typeof newOptions.theme === 'string') {
			newOptions.theme = this._standaloneThemeService.setTheme(newOptions.theme);
		}
		super.updateOptions(newOptions);
	}

	protected _createInnerEditor(instantiationService: IInstantiationService, container: HTMLElement, options: IEditorOptions): CodeEditor {
		return instantiationService.createInstance(StandaloneCodeEditor, container, options);
	}

	public getOriginalEditor(): IStandaloneCodeEditor {
		return <StandaloneCodeEditor>super.getOriginalEditor();
	}

	public getModifiedEditor(): IStandaloneCodeEditor {
		return <StandaloneCodeEditor>super.getModifiedEditor();
	}

	public addCommand(keybinding: number, handler: ICommandHandler, context: string): string {
		return this.getModifiedEditor().addCommand(keybinding, handler, context);
	}

	public createContextKey<T>(key: string, defaultValue: T): IContextKey<T> {
		return this.getModifiedEditor().createContextKey(key, defaultValue);
	}

	public addAction(descriptor: IActionDescriptor): IDisposable {
		return this.getModifiedEditor().addAction(descriptor);
	}
}
