/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/editor/standalone-languages/all';
import './standaloneSchemas';
import 'vs/css!./media/standalone-tokens';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ContentWidgetPositionPreference, OverlayWidgetPositionPreference} from 'vs/editor/browser/editorBrowser';
import {ShallowCancelThenPromise} from 'vs/base/common/async';
import {StandaloneEditor, StandaloneDiffEditor, startup, IEditorConstructionOptions, IDiffEditorConstructionOptions} from 'vs/editor/browser/standalone/standaloneCodeEditor';
import {ScrollbarVisibility} from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';
import {IEditorOverrideServices, ensureDynamicPlatformServices, ensureStaticPlatformServices} from 'vs/editor/browser/standalone/standaloneServices';
import {IDisposable} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {IModel} from 'vs/editor/common/editorCommon';
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import {ILanguage} from 'vs/editor/common/modes/monarch/monarchTypes';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ICodeEditor, IDiffEditor} from 'vs/editor/browser/editorBrowser';
import {Colorizer, IColorizerElementOptions, IColorizerOptions} from 'vs/editor/browser/standalone/colorizer';
import {SimpleEditorService} from 'vs/editor/browser/standalone/simpleServices';
import * as modes from 'vs/editor/common/modes';
import {EditorModelManager} from 'vs/editor/common/services/editorWorkerServiceImpl';
import {SimpleWorkerClient} from 'vs/base/common/worker/simpleWorker';
import {DefaultWorkerFactory} from 'vs/base/worker/defaultWorkerFactory';
import {StandaloneWorker} from 'vs/editor/browser/standalone/standaloneWorker';
import {IMarkerData} from 'vs/platform/markers/common/markers';

function shallowClone<T>(obj:T): T {
	let r:T = <any>{};
	if (obj) {
		let keys = Object.keys(obj);
		for (let i = 0, len = keys.length; i < len; i++) {
			let key = keys[i];
			r[key] = obj[key];
		}
	}
	return r;
}

/**
 * @internal
 */
export function setupServices(services: IEditorOverrideServices): IEditorOverrideServices {
	return startup.setupServices(services);
}

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

	var collection = new ServiceCollection();
	for (var legacyServiceId in services) {
		if (services.hasOwnProperty(legacyServiceId)) {
			let id = createDecorator(legacyServiceId);
			let service = services[legacyServiceId];
			collection.set(id, service);
		}
	}
	services.instantiationService = new InstantiationService(collection);

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

export function createModel(value:string, mode:string|ILanguage|modes.IMode, associatedResource?:URI|string): IModel {
	startup.initStaticServicesIfNecessary();
	var modelService = ensureStaticPlatformServices(null).modelService;

	var resource:URI;
	if (typeof associatedResource === 'string') {
		resource = URI.parse(associatedResource);
	} else {
		// must be a URL
		resource = associatedResource;
	}

	if (typeof (<modes.IMode>mode).getId === 'function') {
		// mode is an modes.IMode
		return modelService.createModel(value, <modes.IMode>mode, resource);
	}

	if (typeof mode === 'string') {
		// mode is a string
		var modeService = ensureStaticPlatformServices(null).modeService;
		return createModelWithRegistryMode(modelService, modeService, value, mode, resource);
	}

	// mode must be an ILanguage
	return modelService.createModel(value, createCustomMode(<ILanguage>mode), resource);
}

export function getModels(): IModel[] {
	startup.initStaticServicesIfNecessary();
	var modelService = ensureStaticPlatformServices(null).modelService;
	return modelService.getModels();
}

export function getModel(uri: URI): IModel {
	startup.initStaticServicesIfNecessary();
	var modelService = ensureStaticPlatformServices(null).modelService;
	return modelService.getModel(uri);
}

export function onDidCreateModel(listener:(model:IModel)=>void): IDisposable {
	startup.initStaticServicesIfNecessary();
	var modelService = ensureStaticPlatformServices(null).modelService;
	return modelService.onModelAdded(listener);
}

export function onWillDisposeModel(listener:(model:IModel)=>void): IDisposable {
	startup.initStaticServicesIfNecessary();
	var modelService = ensureStaticPlatformServices(null).modelService;
	return modelService.onModelRemoved(listener);
}

export function onDidChangeModelMode(listener:(e:{ model: IModel; oldModeId: string; })=>void): IDisposable {
	startup.initStaticServicesIfNecessary();
	var modelService = ensureStaticPlatformServices(null).modelService;
	return modelService.onModelModeChanged(listener);
}

export function setMarkers(model:IModel, owner:string, markers: IMarkerData[]): void {
	startup.initStaticServicesIfNecessary();
	var markerService = ensureStaticPlatformServices(null).markerService;
	markerService.changeOne(owner, model.uri, markers);
}

/**
 * @internal
 */
export function getOrCreateMode(modeId: string):TPromise<modes.IMode> {
	startup.initStaticServicesIfNecessary();
	var modeService = ensureStaticPlatformServices(null).modeService;

	return modeService.getOrCreateMode(modeId);
}

/**
 * @internal
 */
export function configureMode(modeId: string, options: any): void {
	startup.initStaticServicesIfNecessary();
	var modeService = ensureStaticPlatformServices(null).modeService;

	modeService.configureModeById(modeId, options);
}

/**
 * @internal
 */
export function createCustomMode(language:ILanguage): TPromise<modes.IMode> {
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

interface IMonacoWebWorkerState<T> {
	myProxy:StandaloneWorker;
	foreignProxy:T;
	modelMananger: EditorModelManager;
}

export class MonacoWebWorker<T> {

	private _loaded: TPromise<IMonacoWebWorkerState<T>>;
	private _client: SimpleWorkerClient<StandaloneWorker>;

	/**
	 * @internal
	 */
	constructor(modelService: IModelService, opts:IWebWorkerOptions) {
		this._client = new SimpleWorkerClient<StandaloneWorker>(new DefaultWorkerFactory(), 'vs/editor/browser/standalone/standaloneWorker', null);

		this._loaded = this._client.getProxyObject().then((proxy) => {

			let proxyMethodRequest = (method:string, args:any[]): TPromise<any> => {
				return proxy.fmr(method, args);
			};

			let createProxyMethod = (method:string, proxyMethodRequest:(method:string, args:any[])=>TPromise<any>): Function => {
				return function () {
					let args = Array.prototype.slice.call(arguments, 0);
					return proxyMethodRequest(method, args);
				};
			};

			const manager = new EditorModelManager(proxy, modelService, true);

			return proxy.loadModule(opts.moduleId).then((foreignMethods): IMonacoWebWorkerState<T> => {

				let foreignProxy = <T><any>{};
				for (let i = 0; i < foreignMethods.length; i++) {
					foreignProxy[foreignMethods[i]] = createProxyMethod(foreignMethods[i], proxyMethodRequest);
				}

				return {
					myProxy: proxy,
					foreignProxy: foreignProxy,
					modelMananger: manager
				};
			});
		});
	}

	public dispose(): void {
		console.log('TODO: I should dispose now');
	}

	public getProxy(): TPromise<T> {
		return new ShallowCancelThenPromise(this._loaded.then(data => data.foreignProxy));
	}

	public withSyncedResources(resources: URI[]): TPromise<void> {
		return new ShallowCancelThenPromise(this._loaded.then(data => data.modelMananger.withSyncedResources(resources)));
	}
}

export interface IWebWorkerOptions {
	moduleId: string;
}

export function createWebWorker<T>(opts:IWebWorkerOptions): MonacoWebWorker<T> {
	startup.initStaticServicesIfNecessary();
	let staticPlatformServices = ensureStaticPlatformServices(null);
	let modelService = staticPlatformServices.modelService;

	return new MonacoWebWorker(modelService, opts);
}

export function colorizeElement(domNode:HTMLElement, options:IColorizerElementOptions): TPromise<void> {
	startup.initStaticServicesIfNecessary();
	var modeService = ensureStaticPlatformServices(null).modeService;
	return Colorizer.colorizeElement(modeService, domNode, options);
}

export function colorize(text:string, modeId:string, options:IColorizerOptions): TPromise<string> {
	startup.initStaticServicesIfNecessary();
	var modeService = ensureStaticPlatformServices(null).modeService;
	return Colorizer.colorize(modeService, text, modeId, options);
}

export function colorizeModelLine(model:IModel, lineNumber:number, tabSize:number = 4): string {
	return Colorizer.colorizeModelLine(model, lineNumber, tabSize);
}

/**
 * @internal
 */
export function createMonacoEditorAPI(): typeof monaco.editor {
	return {
		// methods
		create: create,
		createDiffEditor: createDiffEditor,

		createModel: createModel,
		getModels: getModels,
		getModel: getModel,
		onDidCreateModel: onDidCreateModel,
		onWillDisposeModel: onWillDisposeModel,
		onDidChangeModelMode: onDidChangeModelMode,

		setMarkers: setMarkers,

		// getOrCreateMode: getOrCreateMode,
		// createCustomMode: createCustomMode,
		createWebWorker: createWebWorker,
		colorizeElement: colorizeElement,
		colorize: colorize,
		colorizeModelLine: colorizeModelLine,

		// enums
		ScrollbarVisibility: ScrollbarVisibility,
		WrappingIndent: editorCommon.WrappingIndent,
		OverviewRulerLane: editorCommon.OverviewRulerLane,
		EndOfLinePreference: editorCommon.EndOfLinePreference,
		DefaultEndOfLine: editorCommon.DefaultEndOfLine,
		EndOfLineSequence: editorCommon.EndOfLineSequence,
		TrackedRangeStickiness: editorCommon.TrackedRangeStickiness,
		CursorChangeReason: editorCommon.CursorChangeReason,
		MouseTargetType: editorCommon.MouseTargetType,
		TextEditorCursorStyle: editorCommon.TextEditorCursorStyle,
		ContentWidgetPositionPreference: ContentWidgetPositionPreference,
		OverlayWidgetPositionPreference: OverlayWidgetPositionPreference,

		// classes
		MonacoWebWorker: <any>MonacoWebWorker,
		InternalEditorScrollbarOptions: <any>editorCommon.InternalEditorScrollbarOptions,
		EditorWrappingInfo: <any>editorCommon.EditorWrappingInfo,
		InternalEditorViewOptions: <any>editorCommon.InternalEditorViewOptions,
		EditorContribOptions: <any>editorCommon.EditorContribOptions,
		InternalEditorOptions: <any>editorCommon.InternalEditorOptions,
		OverviewRulerPosition: <any>editorCommon.OverviewRulerPosition,
		EditorLayoutInfo: <any>editorCommon.EditorLayoutInfo,
		BareFontInfo: <any>editorCommon.BareFontInfo,
		FontInfo: <any>editorCommon.FontInfo,

		// vars
		EditorType: editorCommon.EditorType,
		Handler: editorCommon.Handler,

		// consts
		KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS: editorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS,
		KEYBINDING_CONTEXT_EDITOR_FOCUS: editorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS,
		KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS: editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS,
		KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION: editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION,
		KEYBINDING_CONTEXT_EDITOR_LANGUAGE_ID: editorCommon.KEYBINDING_CONTEXT_EDITOR_LANGUAGE_ID,
	};
}
