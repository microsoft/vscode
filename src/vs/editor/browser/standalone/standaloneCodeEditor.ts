/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import CodeEditorWidget = require('vs/editor/browser/widget/codeEditorWidget');
import SimpleServices = require('vs/editor/browser/standalone/simpleServices');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import standaloneServices = require('vs/editor/browser/standalone/standaloneServices');
import URI from 'vs/base/common/uri';
import Lifecycle = require('vs/base/common/lifecycle');
import MonarchTypes = require('vs/editor/common/modes/monarch/monarchTypes');
import InstantiationService = require('vs/platform/instantiation/common/instantiationService');
import DiffEditorWidget = require('vs/editor/browser/widget/diffEditorWidget');
import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';
import {PluginsRegistry} from 'vs/platform/plugins/common/pluginsRegistry';
import vscode = require('vscode');
import {RemoteTelemetryServiceHelper} from 'vs/platform/telemetry/common/abstractRemoteTelemetryService';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService, IKeybindingContextKey, ICommandHandler} from 'vs/platform/keybinding/common/keybindingService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';
import colorizer = require('vs/editor/browser/standalone/colorizer');
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import {Registry} from 'vs/platform/platform';
import {AbstractKeybindingService} from 'vs/platform/keybinding/browser/keybindingServiceImpl';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import * as JSONContributionRegistry from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import {ILanguageExtensionPoint} from 'vs/editor/common/services/modeService';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';

// Set defaults for standalone editor
DefaultConfig.editor.wrappingIndent = 'none';

export interface IEditorConstructionOptions extends EditorCommon.ICodeEditorWidgetCreationOptions {
	value?: string;
	mode?: string;
}
export interface IDiffEditorConstructionOptions extends EditorCommon.IDiffEditorOptions {
}

class StandaloneEditor extends CodeEditorWidget.CodeEditorWidget {

	private _editorService:IEditorService;
	private _standaloneKeybindingService: SimpleServices.StandaloneKeybindingService;
	private _contextViewService:standaloneServices.IEditorContextViewService;
	private _markerService: IMarkerService;
	private _ownsModel:boolean;
	private _toDispose2: Lifecycle.IDisposable[];

	constructor(
		domElement:HTMLElement,
		options:IEditorConstructionOptions,
		toDispose: Lifecycle.IDisposable[],
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

		if (keybindingService instanceof SimpleServices.StandaloneKeybindingService) {
			this._standaloneKeybindingService = <SimpleServices.StandaloneKeybindingService>keybindingService;
		}

		this._contextViewService = <standaloneServices.IEditorContextViewService>contextViewService;
		this._editorService = editorService;
		this._markerService = markerService;
		this._toDispose2 = toDispose;

		options = options || {};
		if (typeof options.model === 'undefined') {
			options.model = (<any>self).Monaco.Editor.createModel(options.value || '', options.mode || 'text/plain');
			this._ownsModel = true;
		} else {
			this._ownsModel = false;
		}

		super(domElement, options, instantiationService, codeEditorService, keybindingService, telemetryService);
	}

	public dispose(): void {
		super.dispose();
		this._toDispose2 = Lifecycle.disposeAll(this._toDispose2);
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

	public addAction(descriptor:EditorCommon.IActionDescriptor): void {
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

	_attachModel(model:EditorCommon.IModel):void {
		super._attachModel(model);
		if (this._view) {
			this._contextViewService.setContainer(this._view.domNode);
		}
	}

	_postDetachModelCleanup(detachedModel:EditorCommon.IModel): void {
		super._postDetachModelCleanup(detachedModel);
		if (detachedModel && this._ownsModel) {
			detachedModel.destroy();
			this._ownsModel = false;
		}
	}
}

class StandaloneDiffEditor extends DiffEditorWidget.DiffEditorWidget {

	private _editorService:IEditorService;
	private _contextViewService:standaloneServices.IEditorContextViewService;
	private _standaloneKeybindingService: SimpleServices.StandaloneKeybindingService;
	private _toDispose2: Lifecycle.IDisposable[];
	private _markerService: IMarkerService;
	private _telemetryService: ITelemetryService;

	constructor(
		domElement:HTMLElement,
		options:IDiffEditorConstructionOptions,
		toDispose: Lifecycle.IDisposable[],
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

		if (keybindingService instanceof SimpleServices.StandaloneKeybindingService) {
			this._standaloneKeybindingService = <SimpleServices.StandaloneKeybindingService>keybindingService;
		}

		this._contextViewService = <standaloneServices.IEditorContextViewService>contextViewService;
		this._editorService = editorService;
		this._markerService = markerService;
		this._telemetryService = telemetryService;

		this._toDispose2 = toDispose;

		options = options || {};

		super(domElement, options, editorWorkerService, instantiationService);

		this._contextViewService.setContainer(this._containerDomElement);
	}

	public dispose(): void {
		super.dispose();
		this._toDispose2 = Lifecycle.disposeAll(this._toDispose2);
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

	public addAction(descriptor:EditorCommon.IActionDescriptor): void {
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
			var staticServices = standaloneServices.getOrCreateStaticServices();

			// Instantiate thread actors
			staticServices.threadService.getRemotable(RemoteTelemetryServiceHelper);
		},

		setupServices: function(services: standaloneServices.IEditorOverrideServices): standaloneServices.IEditorOverrideServices {
			if (setupServicesCalled) {
				console.error('Call to Monaco.Editor.setupServices is ignored because it was called before');
				return;
			}
			setupServicesCalled = true;
			if (modesRegistryInitialized) {
				console.error('Call to Monaco.Editor.setupServices is ignored because other API was called before');
				return;
			}

			return standaloneServices.ensureStaticPlatformServices(services);
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

export function create(domElement:HTMLElement, options:IEditorConstructionOptions, services:standaloneServices.IEditorOverrideServices):EditorBrowser.ICodeEditor {
	startup.initStaticServicesIfNecessary();

	services = shallowClone(services);
	var editorService: SimpleServices.SimpleEditorService = null;
	if (!services || !services.editorService) {
		editorService = new SimpleServices.SimpleEditorService();
		services.editorService = editorService;
	}

	var t = prepareServices(domElement, services);
	var result = t.ctx.instantiationService.createInstance(StandaloneEditor, domElement, options, t.toDispose);

	if (editorService) {
		editorService.setEditor(result);
	}

	return result;
}

export function createDiffEditor(domElement:HTMLElement, options:IDiffEditorConstructionOptions, services: standaloneServices.IEditorOverrideServices):EditorBrowser.IDiffEditor {
	startup.initStaticServicesIfNecessary();

	services = shallowClone(services);
	var editorService: SimpleServices.SimpleEditorService = null;
	if (!services || !services.editorService) {
		editorService = new SimpleServices.SimpleEditorService();
		services.editorService = editorService;
	}

	var t = prepareServices(domElement, services);
	var result = t.ctx.instantiationService.createInstance(StandaloneDiffEditor, domElement, options, t.toDispose);

	if (editorService) {
		editorService.setEditor(result);
	}

	return result;
}

function prepareServices(domElement: HTMLElement, services: standaloneServices.IEditorOverrideServices): { ctx: standaloneServices.IEditorOverrideServices; toDispose: Lifecycle.IDisposable[]; } {
	services = standaloneServices.ensureStaticPlatformServices(services);
	var toDispose = standaloneServices.ensureDynamicPlatformServices(domElement, services);
	services.instantiationService = InstantiationService.create(services);

	return {
		ctx: services,
		toDispose: toDispose
	};
}

function createModelWithRegistryMode(modelService:IModelService, modeService:IModeService, value:string, modeName:string, associatedResource?:URI): EditorCommon.IModel {
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

export function createModel(value:string, mode:string|MonarchTypes.ILanguage|Modes.IMode, associatedResource?:URI|string): EditorCommon.IModel {
	startup.initStaticServicesIfNecessary();
	var modelService = standaloneServices.ensureStaticPlatformServices(null).modelService;

	var resource:URI;
	if (typeof associatedResource === 'string') {
		resource = URI.parse(associatedResource);
	} else {
		// must be a URL
		resource = associatedResource;
	}

	if (typeof (<Modes.IMode>mode).getId === 'function') {
		// mode is an IMode
		return modelService.createModel(value, <Modes.IMode>mode, resource);
	}

	if (typeof mode === 'string') {
		// mode is a string
		var modeService = standaloneServices.ensureStaticPlatformServices(null).modeService;
		return createModelWithRegistryMode(modelService, modeService, value, mode, resource);
	}

	// mode must be an ILanguage
	return modelService.createModel(value, createCustomMode(<MonarchTypes.ILanguage>mode), resource);
}

export function getOrCreateMode(mimetypes: string):TPromise<Modes.IMode> {
	startup.initStaticServicesIfNecessary();
	var modeService = standaloneServices.ensureStaticPlatformServices(null).modeService;

	return modeService.getOrCreateMode(mimetypes);
}

export function configureMode(modeId: string, options: any): void {
	startup.initStaticServicesIfNecessary();
	var modeService = standaloneServices.ensureStaticPlatformServices(null).modeService;

	modeService.configureModeById(modeId, options);
}

export function registerWorkerParticipant(modeId:string, moduleName:string, ctorName:string): void {
	ModesRegistry.registerWorkerParticipant(modeId, moduleName, ctorName);
}

export function getAPI(): typeof vscode {
	startup.initStaticServicesIfNecessary();
	return require('vscode');
}

export function createCustomMode(language:MonarchTypes.ILanguage): TPromise<Modes.IMode> {
	startup.initStaticServicesIfNecessary();
	var modeService = standaloneServices.ensureStaticPlatformServices(null).modeService;

	var modeId = language.name;
	var name = language.name;

	ModesRegistry.registerLanguage({
		id: modeId,
		aliases: [name]
	});

	PluginsRegistry.registerOneTimeActivationEventListener('onLanguage:' + modeId, () => {
		modeService.registerMonarchDefinition(modeId, language);
	});

	return modeService.getOrCreateMode(modeId);
}

export function registerStandaloneLanguage(language:ILanguageExtensionPoint, defModule:string): void {
	ModesRegistry.registerLanguage(language);

	PluginsRegistry.registerOneTimeActivationEventListener('onLanguage:' + language.id, () => {
		require([defModule], (value:{language:MonarchTypes.ILanguage}) => {
			if (!value.language) {
				console.error('Expected ' + defModule + ' to export a `language`');
				return;
			}

			startup.initStaticServicesIfNecessary();
			var modeService = standaloneServices.ensureStaticPlatformServices(null).modeService;
			modeService.registerMonarchDefinition(language.id, value.language);
		}, (err) => {
			console.error('Cannot find module ' + defModule, err);
		});
	});
}

export function registerStandaloneSchema(uri:string, schema:IJSONSchema) {
	let schemaRegistry = <JSONContributionRegistry.IJSONContributionRegistry>Registry.as(JSONContributionRegistry.Extensions.JSONContribution);
	schemaRegistry.registerSchema(uri, schema);
}

export function colorizeElement(domNode:HTMLElement, options:colorizer.IColorizerElementOptions): TPromise<void> {
	startup.initStaticServicesIfNecessary();
	var modeService = standaloneServices.ensureStaticPlatformServices(null).modeService;
	return colorizer.colorizeElement(modeService, domNode, options);
}

export function colorize(text:string, mimeType:string, options:colorizer.IColorizerOptions): TPromise<string> {
	startup.initStaticServicesIfNecessary();
	var modeService = standaloneServices.ensureStaticPlatformServices(null).modeService;
	return colorizer.colorize(modeService, text, mimeType, options);
}
