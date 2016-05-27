/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {AbstractKeybindingService} from 'vs/platform/keybinding/browser/keybindingServiceImpl';
import {ICommandHandler, IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {RemoteTelemetryServiceHelper} from 'vs/platform/telemetry/common/remoteTelemetryService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IActionDescriptor, ICodeEditorWidgetCreationOptions, IDiffEditorOptions, IModel, IModelChangedEvent, EventType} from 'vs/editor/common/editorCommon';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {StandaloneKeybindingService} from 'vs/editor/browser/standalone/simpleServices';
import {IEditorContextViewService, IEditorOverrideServices, ensureStaticPlatformServices, getOrCreateStaticServices} from 'vs/editor/browser/standalone/standaloneServices';
import {CodeEditorWidget} from 'vs/editor/browser/widget/codeEditorWidget';
import {DiffEditorWidget} from 'vs/editor/browser/widget/diffEditorWidget';

export interface IEditorConstructionOptions extends ICodeEditorWidgetCreationOptions {
	value?: string;
	mode?: string;
}

export interface IDiffEditorConstructionOptions extends IDiffEditorOptions {
}

export class StandaloneEditor extends CodeEditorWidget {

	private _editorService:IEditorService;
	private _standaloneKeybindingService: StandaloneKeybindingService;
	private _contextViewService:IEditorContextViewService;
	private _markerService: IMarkerService;
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
		@IContextViewService contextViewService: IContextViewService,
		@IEditorService editorService: IEditorService,
		@IMarkerService markerService: IMarkerService
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
		this._editorService = editorService;
		this._markerService = markerService;
		this._toDispose2 = toDispose;

		let model: IModel = null;
		if (typeof options.model === 'undefined') {
			model = (<any>self).monaco.editor.createModel(options.value || '', options.mode || 'text/plain');
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
				newModelUrl: model.uri.toString()
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

	public getMarkerService():IMarkerService {
		return this._markerService;
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

	public getTelemetryService():ITelemetryService {
		return this._telemetryService;
	}

	public getEditorService():IEditorService {
		return this._editorService;
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

export class StandaloneDiffEditor extends DiffEditorWidget {

	private _contextViewService:IEditorContextViewService;
	private _standaloneKeybindingService: StandaloneKeybindingService;
	private _toDispose2: IDisposable[];
	private _markerService: IMarkerService;
	private _telemetryService: ITelemetryService;

	constructor(
		domElement:HTMLElement,
		options:IDiffEditorConstructionOptions,
		toDispose: IDisposable[],
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextViewService contextViewService: IContextViewService,
		@IEditorService editorService: IEditorService,
		@IMarkerService markerService: IMarkerService,
		@ITelemetryService telemetryService: ITelemetryService,
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

		this._markerService = markerService;
		this._telemetryService = telemetryService;

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

	public getMarkerService():IMarkerService {
		return this._markerService;
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

	public getTelemetryService():ITelemetryService {
		return this._telemetryService;
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
			var staticServices = getOrCreateStaticServices();

			// Instantiate thread actors
			staticServices.threadService.getRemotable(RemoteTelemetryServiceHelper);
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
