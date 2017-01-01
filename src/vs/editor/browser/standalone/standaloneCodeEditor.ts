/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService, ICommandHandler } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IActionDescriptor, ICodeEditorWidgetCreationOptions, IDiffEditorOptions, IModel, IModelChangedEvent, EventType } from 'vs/editor/common/editorCommon';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { StandaloneKeybindingService } from 'vs/editor/browser/standalone/simpleServices';
import { IEditorContextViewService } from 'vs/editor/browser/standalone/standaloneServices';
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditorWidget';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';

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
	addAction(descriptor: IActionDescriptor): void;
}

export interface IStandaloneDiffEditor extends IDiffEditor {
	addCommand(keybinding: number, handler: ICommandHandler, context: string): string;
	createContextKey<T>(key: string, defaultValue: T): IContextKey<T>;
	addAction(descriptor: IActionDescriptor): void;
}

export class StandaloneEditor extends CodeEditor implements IStandaloneCodeEditor {

	private _standaloneKeybindingService: StandaloneKeybindingService;
	private _contextViewService: IEditorContextViewService;
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
		@IContextViewService contextViewService: IContextViewService
	) {
		options = options || {};
		super(domElement, options, instantiationService, codeEditorService, commandService, contextKeyService);

		if (keybindingService instanceof StandaloneKeybindingService) {
			this._standaloneKeybindingService = keybindingService;
		}

		this._contextViewService = <IEditorContextViewService>contextViewService;
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

	public addCommand(keybinding: number, handler: ICommandHandler, context: string): string {
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot add command because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		return this._standaloneKeybindingService.addDynamicKeybinding(keybinding, handler, context);
	}

	public createContextKey<T>(key: string, defaultValue: T): IContextKey<T> {
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot create context key because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		return this._contextKeyService.createKey(key, defaultValue);
	}

	public addAction(descriptor: IActionDescriptor): void {
		super.addAction(descriptor);
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot add keybinding because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		if (Array.isArray(descriptor.keybindings)) {
			let handler: ICommandHandler = (accessor) => {
				return this.trigger('keyboard', descriptor.id, null);
			};
			descriptor.keybindings.forEach((kb) => {
				this._standaloneKeybindingService.addDynamicKeybinding(kb, handler, descriptor.keybindingContext, descriptor.id);
			});
		}
	}

	_attachModel(model: IModel): void {
		super._attachModel(model);
		if (this._view) {
			this._contextViewService.setContainer(this._view.domNode);
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
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(domElement, options, editorWorkerService, contextKeyService, instantiationService);

		if (keybindingService instanceof StandaloneKeybindingService) {
			this._standaloneKeybindingService = keybindingService;
		}

		this._contextViewService = <IEditorContextViewService>contextViewService;

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

	public addCommand(keybinding: number, handler: ICommandHandler, context: string): string {
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot add command because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		return this._standaloneKeybindingService.addDynamicKeybinding(keybinding, handler, context);
	}

	public createContextKey<T>(key: string, defaultValue: T): IContextKey<T> {
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot create context key because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		return this._contextKeyService.createKey(key, defaultValue);
	}

	public addAction(descriptor: IActionDescriptor): void {
		super.addAction(descriptor);
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot add keybinding because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		if (Array.isArray(descriptor.keybindings)) {
			let handler: ICommandHandler = (ctx) => {
				return this.trigger('keyboard', descriptor.id, null);
			};
			descriptor.keybindings.forEach((kb) => {
				this._standaloneKeybindingService.addDynamicKeybinding(kb, handler, descriptor.keybindingContext, descriptor.id);
			});
		}
	}
}
