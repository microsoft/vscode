/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IJSONSchema} from 'vs/base/common/jsonSchema';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {createInstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {Extensions, IJSONContributionRegistry} from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import {AbstractKeybindingService} from 'vs/platform/keybinding/browser/keybindingServiceImpl';
import {ICommandHandler, IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {Registry} from 'vs/platform/platform';
import {RemoteTelemetryServiceHelper} from 'vs/platform/telemetry/common/abstractRemoteTelemetryService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';
import {IActionDescriptor, ICodeEditorWidgetCreationOptions, IDiffEditorOptions, IModel} from 'vs/editor/common/editorCommon';
import {IMode} from 'vs/editor/common/modes';
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import {ILanguage} from 'vs/editor/common/modes/monarch/monarchTypes';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {ILanguageExtensionPoint} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ICodeEditor, IDiffEditor} from 'vs/editor/browser/editorBrowser';
import {Colorizer, IColorizerElementOptions, IColorizerOptions} from 'vs/editor/browser/standalone/colorizer';
import {SimpleEditorService, StandaloneKeybindingService} from 'vs/editor/browser/standalone/simpleServices';
import {IEditorContextViewService, IEditorOverrideServices, ensureDynamicPlatformServices, ensureStaticPlatformServices, getOrCreateStaticServices} from 'vs/editor/browser/standalone/standaloneServices';
import {CodeEditorWidget} from 'vs/editor/browser/widget/codeEditorWidget';
import {DiffEditorWidget} from 'vs/editor/browser/widget/diffEditorWidget';

// Set defaults for standalone editor
DefaultConfig.editor.wrappingIndent = 'none';
DefaultConfig.editor.folding = false;

export interface IEditorConstructionOptions extends ICodeEditorWidgetCreationOptions {
	value?: string;
	mode?: string;
}
export interface IDiffEditorConstructionOptions extends IDiffEditorOptions {
}

class StandaloneEditor extends CodeEditorWidget {

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
			model = (<any>self).Monaco.Editor.createModel(options.value || '', options.mode || 'text/plain');
			this._ownsModel = true;
		} else {
			model = options.model;
			delete options.model;
			this._ownsModel = false;
		}

		this._attachModel(model);
	}

	public dispose(): void {
		super.dispose();
		this._toDispose2 = disposeAll(this._toDispose2);
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

class StandaloneDiffEditor extends DiffEditorWidget {

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
		this._toDispose2 = disposeAll(this._toDispose2);
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

var startup = (function() {

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
				console.error('Call to Monaco.Editor.setupServices is ignored because it was called before');
				return;
			}
			setupServicesCalled = true;
			if (modesRegistryInitialized) {
				console.error('Call to Monaco.Editor.setupServices is ignored because other API was called before');
				return;
			}

			return ensureStaticPlatformServices(services);
		}
	};

})();

function shallowClone<T>(obj:T): T {
	var r:T = <any>{};
	if (obj) {
		for (var key in obj) {
			if (obj.hasOwnProperty(key)) {
				r[key] = obj[key];
			}
		}
	}
	return r;
}

export var setupServices = startup.setupServices;

export function create(domElement:HTMLElement, options:IEditorConstructionOptions, services:IEditorOverrideServices):ICodeEditor {
	startup.initStaticServicesIfNecessary();

	services = shallowClone(services);
	var editorService: SimpleEditorService = null;
	if (!services || !services.editorService) {
		editorService = new SimpleEditorService();
		services.editorService = editorService;
	}

	var t = prepareServices(domElement, services);
	var result = t.ctx.instantiationService.createInstance(StandaloneEditor, domElement, options, t.toDispose);

	if (editorService) {
		editorService.setEditor(result);
	}

	return result;
}

export function createDiffEditor(domElement:HTMLElement, options:IDiffEditorConstructionOptions, services: IEditorOverrideServices):IDiffEditor {
	startup.initStaticServicesIfNecessary();

	services = shallowClone(services);
	var editorService: SimpleEditorService = null;
	if (!services || !services.editorService) {
		editorService = new SimpleEditorService();
		services.editorService = editorService;
	}

	var t = prepareServices(domElement, services);
	var result = t.ctx.instantiationService.createInstance(StandaloneDiffEditor, domElement, options, t.toDispose);

	if (editorService) {
		editorService.setEditor(result);
	}

	return result;
}

function prepareServices(domElement: HTMLElement, services: IEditorOverrideServices): { ctx: IEditorOverrideServices; toDispose: IDisposable[]; } {
	services = ensureStaticPlatformServices(services);
	var toDispose = ensureDynamicPlatformServices(domElement, services);
	services.instantiationService = createInstantiationService(services);

	return {
		ctx: services,
		toDispose: toDispose
	};
}

function createModelWithRegistryMode(modelService:IModelService, modeService:IModeService, value:string, modeName:string, associatedResource?:URI): IModel {
	var modeInformation = modeService.lookup(modeName);
	if (modeInformation.length > 0) {
		// Force usage of the first existing mode
		modeName = modeInformation[0].modeId;
	} else {
		// Fall back to plain/text
		modeName = 'plain/text';
	}
	var mode = modeService.getMode(modeName);
	if (mode) {
		return modelService.createModel(value, mode, associatedResource);
	}
	return modelService.createModel(value, modeService.getOrCreateMode(modeName), associatedResource);
}

export function createModel(value:string, mode:string|ILanguage|IMode, associatedResource?:URI|string): IModel {
	startup.initStaticServicesIfNecessary();
	var modelService = ensureStaticPlatformServices(null).modelService;

	var resource:URI;
	if (typeof associatedResource === 'string') {
		resource = URI.parse(associatedResource);
	} else {
		// must be a URL
		resource = associatedResource;
	}

	if (typeof (<IMode>mode).getId === 'function') {
		// mode is an IMode
		return modelService.createModel(value, <IMode>mode, resource);
	}

	if (typeof mode === 'string') {
		// mode is a string
		var modeService = ensureStaticPlatformServices(null).modeService;
		return createModelWithRegistryMode(modelService, modeService, value, mode, resource);
	}

	// mode must be an ILanguage
	return modelService.createModel(value, createCustomMode(<ILanguage>mode), resource);
}

export function getOrCreateMode(mimetypes: string):TPromise<IMode> {
	startup.initStaticServicesIfNecessary();
	var modeService = ensureStaticPlatformServices(null).modeService;

	return modeService.getOrCreateMode(mimetypes);
}

export function configureMode(modeId: string, options: any): void {
	startup.initStaticServicesIfNecessary();
	var modeService = ensureStaticPlatformServices(null).modeService;

	modeService.configureModeById(modeId, options);
}

export function registerWorkerParticipant(modeId:string, moduleName:string, ctorName:string): void {
	ModesRegistry.registerWorkerParticipant(modeId, moduleName, ctorName);
}

export function createCustomMode(language:ILanguage): TPromise<IMode> {
	startup.initStaticServicesIfNecessary();
	let staticPlatformServices = ensureStaticPlatformServices(null);
	let modeService = staticPlatformServices.modeService;
	let modelService = staticPlatformServices.modelService;
	let editorWorkerService = staticPlatformServices.editorWorkerService;

	let modeId = language.name;
	let name = language.name;

	ModesRegistry.registerLanguage({
		id: modeId,
		aliases: [name]
	});

	let disposable = modeService.onDidCreateMode((mode) => {
		if (mode.getId() !== modeId) {
			return;
		}
		modeService.registerMonarchDefinition(modelService, editorWorkerService, modeId, language);
		disposable.dispose();
	});

	return modeService.getOrCreateMode(modeId);
}

export function registerStandaloneLanguage(language:ILanguageExtensionPoint, defModule:string): void {
	ModesRegistry.registerLanguage(language);

	ExtensionsRegistry.registerOneTimeActivationEventListener('onLanguage:' + language.id, () => {
		require([defModule], (value:{language:ILanguage}) => {
			if (!value.language) {
				console.error('Expected ' + defModule + ' to export a `language`');
				return;
			}

			startup.initStaticServicesIfNecessary();
			let staticPlatformServices = ensureStaticPlatformServices(null);
			let modeService = staticPlatformServices.modeService;
			let modelService = staticPlatformServices.modelService;
			let editorWorkerService = staticPlatformServices.editorWorkerService;

			modeService.registerMonarchDefinition(modelService, editorWorkerService, language.id, value.language);
		}, (err) => {
			console.error('Cannot find module ' + defModule, err);
		});
	});
}

export function registerStandaloneSchema(uri:string, schema:IJSONSchema) {
	let schemaRegistry = <IJSONContributionRegistry>Registry.as(Extensions.JSONContribution);
	schemaRegistry.registerSchema(uri, schema);
}

export function colorizeElement(domNode:HTMLElement, options:IColorizerElementOptions): TPromise<void> {
	startup.initStaticServicesIfNecessary();
	var modeService = ensureStaticPlatformServices(null).modeService;
	return Colorizer.colorizeElement(modeService, domNode, options);
}

export function colorize(text:string, mimeType:string, options:IColorizerOptions): TPromise<string> {
	startup.initStaticServicesIfNecessary();
	var modeService = ensureStaticPlatformServices(null).modeService;
	return Colorizer.colorize(modeService, text, mimeType, options);
}
