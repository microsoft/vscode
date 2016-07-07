/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {AbstractKeybindingService} from 'vs/platform/keybinding/browser/keybindingServiceImpl';
import {IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {ICommandHandler} from 'vs/platform/commands/common/commands';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IActionDescriptor, ICodeEditorWidgetCreationOptions, IDiffEditorOptions, IModel, IModelChangedEvent, EventType} from 'vs/editor/common/editorCommon';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {StandaloneKeybindingService} from 'vs/editor/browser/standalone/simpleServices';
import {IEditorContextViewService, IEditorOverrideServices, ensureStaticPlatformServices, getOrCreateStaticServices} from 'vs/editor/browser/standalone/standaloneServices';
import {CodeEditorWidget} from 'vs/editor/browser/widget/codeEditorWidget';
import {DiffEditorWidget} from 'vs/editor/browser/widget/diffEditorWidget';
import {ICodeEditor, IDiffEditor} from 'vs/editor/browser/editorBrowser';

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
	addCommand(keybinding:number, handler:ICommandHandler, context:string): string;
	createContextKey<T>(key: string, defaultValue: T): IKeybindingContextKey<T>;
	addAction(descriptor:IActionDescriptor): void;
}

export interface IStandaloneDiffEditor extends IDiffEditor {
	addCommand(keybinding:number, handler:ICommandHandler, context:string): string;
	createContextKey<T>(key: string, defaultValue: T): IKeybindingContextKey<T>;
	addAction(descriptor:IActionDescriptor): void;
}

export class StandaloneEditor extends CodeEditorWidget implements IStandaloneCodeEditor {

	private _standaloneKeybindingService: StandaloneKeybindingService;
	private _contextViewService:IEditorContextViewService;
	private _ownsModel:boolean;
	private _toDispose2: IDisposable[];

	constructor(
		domElement:HTMLElement,
		options:IEditorConstructionOptions,
		toDispose: IDisposable[],
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IContextViewService contextViewService: IContextViewService
	) {
		if (keybindingService instanceof AbstractKeybindingService) {
			(<AbstractKeybindingService><any>keybindingService).setInstantiationService(instantiationService);
		}

		options = options || {};
		super(domElement, options, instantiationService, codeEditorService, keybindingService, telemetryService);

		if (keybindingService instanceof StandaloneKeybindingService) {
			this._standaloneKeybindingService = <StandaloneKeybindingService>keybindingService;
		}

		this._contextViewService = <IEditorContextViewService>contextViewService;
		this._toDispose2 = toDispose;

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

	public addCommand(keybinding:number, handler:ICommandHandler, context:string): string {
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot add command because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		return this._standaloneKeybindingService.addDynamicKeybinding(keybinding, handler, context);
	}

	public createContextKey<T>(key: string, defaultValue: T): IKeybindingContextKey<T> {
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot create context key because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		return this._standaloneKeybindingService.createKey(key, defaultValue);
	}

	public addAction(descriptor:IActionDescriptor): void {
		super.addAction(descriptor);
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot add keybinding because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		if (Array.isArray(descriptor.keybindings)) {
			var handler: ICommandHandler = (accessor) => {
				return this.trigger('keyboard', descriptor.id, null);
			};
			descriptor.keybindings.forEach((kb) => {
				this._standaloneKeybindingService.addDynamicKeybinding(kb, handler, descriptor.keybindingContext, descriptor.id);
			});
		}
	}

	_attachModel(model:IModel):void {
		super._attachModel(model);
		if (this._view) {
			this._contextViewService.setContainer(this._view.domNode);
		}
	}

	_postDetachModelCleanup(detachedModel:IModel): void {
		super._postDetachModelCleanup(detachedModel);
		if (detachedModel && this._ownsModel) {
			detachedModel.destroy();
			this._ownsModel = false;
		}
	}
}

export class StandaloneDiffEditor extends DiffEditorWidget implements IStandaloneDiffEditor {

	private _contextViewService:IEditorContextViewService;
	private _standaloneKeybindingService: StandaloneKeybindingService;
	private _toDispose2: IDisposable[];

	constructor(
		domElement:HTMLElement,
		options:IDiffEditorConstructionOptions,
		toDispose: IDisposable[],
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextViewService contextViewService: IContextViewService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		if (keybindingService instanceof AbstractKeybindingService) {
			(<AbstractKeybindingService><any>keybindingService).setInstantiationService(instantiationService);
		}

		super(domElement, options, editorWorkerService, instantiationService);

		if (keybindingService instanceof StandaloneKeybindingService) {
			this._standaloneKeybindingService = <StandaloneKeybindingService>keybindingService;
		}

		this._contextViewService = <IEditorContextViewService>contextViewService;

		this._toDispose2 = toDispose;

		this._contextViewService.setContainer(this._containerDomElement);
	}

	public dispose(): void {
		super.dispose();
		this._toDispose2 = dispose(this._toDispose2);
	}

	public destroy(): void {
		this.dispose();
	}

	public addCommand(keybinding:number, handler:ICommandHandler, context:string): string {
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot add command because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		return this._standaloneKeybindingService.addDynamicKeybinding(keybinding, handler, context);
	}

	public createContextKey<T>(key: string, defaultValue: T): IKeybindingContextKey<T> {
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot create context key because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		return this._standaloneKeybindingService.createKey(key, defaultValue);
	}

	public addAction(descriptor:IActionDescriptor): void {
		super.addAction(descriptor);
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot add keybinding because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		if (Array.isArray(descriptor.keybindings)) {
			var handler:ICommandHandler = (ctx) => {
				return this.trigger('keyboard', descriptor.id, null);
			};
			descriptor.keybindings.forEach((kb) => {
				this._standaloneKeybindingService.addDynamicKeybinding(kb, handler, descriptor.keybindingContext, descriptor.id);
			});
		}
	}
}

export var startup = (function() {

	var modesRegistryInitialized = false;
	var setupServicesCalled = false;

	return {
		initStaticServicesIfNecessary: function() {
			if (modesRegistryInitialized) {
				return;
			}
			modesRegistryInitialized = true;
			getOrCreateStaticServices();
		},

		setupServices: function(services: IEditorOverrideServices): IEditorOverrideServices {
			if (setupServicesCalled) {
				console.error('Call to monaco.editor.setupServices is ignored because it was called before');
				return;
			}
			setupServicesCalled = true;
			if (modesRegistryInitialized) {
				console.error('Call to monaco.editor.setupServices is ignored because other API was called before');
				return;
			}

			return ensureStaticPlatformServices(services);
		}
	};

})();
