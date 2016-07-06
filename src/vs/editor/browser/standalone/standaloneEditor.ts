/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import './standaloneSchemas';
import 'vs/css!./media/standalone-tokens';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ContentWidgetPositionPreference, OverlayWidgetPositionPreference} from 'vs/editor/browser/editorBrowser';
import {ShallowCancelThenPromise} from 'vs/base/common/async';
import {StandaloneEditor, IStandaloneCodeEditor, StandaloneDiffEditor, IStandaloneDiffEditor, startup, IEditorConstructionOptions, IDiffEditorConstructionOptions} from 'vs/editor/browser/standalone/standaloneCodeEditor';
import {ScrollbarVisibility} from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';
import {IEditorOverrideServices, ensureDynamicPlatformServices, ensureStaticPlatformServices} from 'vs/editor/browser/standalone/standaloneServices';
import {IDisposable} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {IModel} from 'vs/editor/common/editorCommon';
import {IModelService} from 'vs/editor/common/services/modelService';
import {Colorizer, IColorizerElementOptions, IColorizerOptions} from 'vs/editor/browser/standalone/colorizer';
import {SimpleEditorService} from 'vs/editor/browser/standalone/simpleServices';
import * as modes from 'vs/editor/common/modes';
import {EditorWorkerClient} from 'vs/editor/common/services/editorWorkerServiceImpl';
import {IMarkerData} from 'vs/platform/markers/common/markers';
import {DiffNavigator} from 'vs/editor/contrib/diffNavigator/common/diffNavigator';

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

/**
 * Create a new editor under `domElement`.
 * `domElement` should be empty (not contain other dom nodes).
 * The editor will read the size of `domElement`.
 */
export function create(domElement:HTMLElement, options?:IEditorConstructionOptions, services?:IEditorOverrideServices):IStandaloneCodeEditor {
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

/**
 * Create a new diff editor under `domElement`.
 * `domElement` should be empty (not contain other dom nodes).
 * The editor will read the size of `domElement`.
 */
export function createDiffEditor(domElement:HTMLElement, options?:IDiffEditorConstructionOptions, services?: IEditorOverrideServices):IStandaloneDiffEditor {
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

export interface IDiffNavigator {
	canNavigate():boolean;
	next():void;
	previous():void;
	dispose():void;
}

export interface IDiffNavigatorOptions {
	followsCaret?:boolean;
	ignoreCharChanges?:boolean;
	alwaysRevealFirst?:boolean;
}

export function createDiffNavigator(diffEditor:IStandaloneDiffEditor, opts?:IDiffNavigatorOptions): IDiffNavigator {
	return new DiffNavigator(diffEditor, opts);
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

function doCreateModel(value:string, mode:TPromise<modes.IMode>, uri?:URI): IModel {
	let modelService = ensureStaticPlatformServices(null).modelService;

	return modelService.createModel(value, mode, uri);
}

/**
 * Create a new editor model.
 * You can specify the language that should be set for this model or let the language be inferred from the `uri`.
 */
export function createModel(value:string, language?:string, uri?:URI): IModel {
	startup.initStaticServicesIfNecessary();

	value = value || '';

	let modeService = ensureStaticPlatformServices(null).modeService;

	if (!language) {
		let path = uri ? uri.path : null;

		let firstLF = value.indexOf('\n');
		let firstLine = value;
		if (firstLF !== -1) {
			firstLine = value.substring(0, firstLF);
		}

		return doCreateModel(value, modeService.getOrCreateModeByFilenameOrFirstLine(path, firstLine), uri);
	}
	return doCreateModel(value, modeService.getOrCreateMode(language), uri);
}

/**
 * Change the language for a model.
 */
export function setModelLanguage(model:IModel, language:string): void {
	startup.initStaticServicesIfNecessary();
	let modeService = ensureStaticPlatformServices(null).modeService;

	model.setMode(modeService.getOrCreateMode(language));
}

/**
 * Set the markers for a model.
 */
export function setModelMarkers(model:IModel, owner:string, markers: IMarkerData[]): void {
	startup.initStaticServicesIfNecessary();
	var markerService = ensureStaticPlatformServices(null).markerService;
	markerService.changeOne(owner, model.uri, markers);
}

/**
 * Get the model that has `uri` if it exists.
 */
export function getModel(uri: URI): IModel {
	startup.initStaticServicesIfNecessary();
	var modelService = ensureStaticPlatformServices(null).modelService;
	return modelService.getModel(uri);
}

/**
 * Get all the created models.
 */
export function getModels(): IModel[] {
	startup.initStaticServicesIfNecessary();
	var modelService = ensureStaticPlatformServices(null).modelService;
	return modelService.getModels();
}

/**
 * Emitted when a model is created.
 */
export function onDidCreateModel(listener:(model:IModel)=>void): IDisposable {
	startup.initStaticServicesIfNecessary();
	var modelService = ensureStaticPlatformServices(null).modelService;
	return modelService.onModelAdded(listener);
}

/**
 * Emitted right before a model is disposed.
 */
export function onWillDisposeModel(listener:(model:IModel)=>void): IDisposable {
	startup.initStaticServicesIfNecessary();
	var modelService = ensureStaticPlatformServices(null).modelService;
	return modelService.onModelRemoved(listener);
}

/**
 * Emitted when a different language is set to a model.
 */
export function onDidChangeModelLanguage(listener:(e:{ model: IModel; oldLanguage: string; })=>void): IDisposable {
	startup.initStaticServicesIfNecessary();
	var modelService = ensureStaticPlatformServices(null).modelService;
	return modelService.onModelModeChanged((e) => {
		listener({
			model: e.model,
			oldLanguage: e.oldModeId
		});
	});
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
 * A web worker that can provide a proxy to an arbitrary file.
 */
export interface MonacoWebWorker<T> {
	/**
	 * Terminate the web worker, thus invalidating the returned proxy.
	 */
	dispose(): void;
	/**
	 * Get a proxy to the arbitrary loaded code.
	 */
	getProxy(): TPromise<T>;
	/**
	 * Synchronize (send) the models at `resources` to the web worker,
	 * making them available in the monaco.worker.getMirrorModels().
	 */
	withSyncedResources(resources: URI[]): TPromise<T>;
}

/**
 * @internal
 */
export class MonacoWebWorkerImpl<T> extends EditorWorkerClient implements MonacoWebWorker<T> {

	private _foreignModuleId: string;
	private _foreignModuleCreateData: any;
	private _foreignProxy: TPromise<T>;

	/**
	 * @internal
	 */
	constructor(modelService: IModelService, opts:IWebWorkerOptions) {
		super(modelService);
		this._foreignModuleId = opts.moduleId;
		this._foreignModuleCreateData = opts.createData || null;
		this._foreignProxy = null;
	}

	private _getForeignProxy(): TPromise<T> {
		if (!this._foreignProxy) {
			this._foreignProxy = new ShallowCancelThenPromise(this._getProxy().then((proxy) => {
				return proxy.loadForeignModule(this._foreignModuleId, this._foreignModuleCreateData).then((foreignMethods) => {
					this._foreignModuleId = null;
					this._foreignModuleCreateData = null;

					let proxyMethodRequest = (method:string, args:any[]): TPromise<any> => {
						return proxy.fmr(method, args);
					};

					let createProxyMethod = (method:string, proxyMethodRequest:(method:string, args:any[])=>TPromise<any>): Function => {
						return function () {
							let args = Array.prototype.slice.call(arguments, 0);
							return proxyMethodRequest(method, args);
						};
					};

					let foreignProxy = <T><any>{};
					for (let i = 0; i < foreignMethods.length; i++) {
						foreignProxy[foreignMethods[i]] = createProxyMethod(foreignMethods[i], proxyMethodRequest);
					}

					return foreignProxy;
				});
			}));
		}
		return this._foreignProxy;
	}

	public getProxy(): TPromise<T> {
		return this._getForeignProxy();
	}

	public withSyncedResources(resources: URI[]): TPromise<T> {
		return this._withSyncedResources(resources).then(_ => this.getProxy());
	}
}

export interface IWebWorkerOptions {
	/**
	 * The AMD moduleId to load.
	 * It should export a function `create` that should return the exported proxy.
	 */
	moduleId: string;
	/**
	 * The data to send over when calling create on the module.
	 */
	createData?: any;
}

/**
 * Create a new web worker that has model syncing capabilities built in.
 * Specify an AMD module to load that will `create` an object that will be proxied.
 */
export function createWebWorker<T>(opts:IWebWorkerOptions): MonacoWebWorker<T> {
	startup.initStaticServicesIfNecessary();
	let staticPlatformServices = ensureStaticPlatformServices(null);
	let modelService = staticPlatformServices.modelService;

	return new MonacoWebWorkerImpl<T>(modelService, opts);
}

/**
 * Colorize the contents of `domNode` using attribute `data-lang`.
 */
export function colorizeElement(domNode:HTMLElement, options:IColorizerElementOptions): TPromise<void> {
	startup.initStaticServicesIfNecessary();
	var modeService = ensureStaticPlatformServices(null).modeService;
	return Colorizer.colorizeElement(modeService, domNode, options);
}

/**
 * Colorize `text` using language `languageId`.
 */
export function colorize(text:string, languageId:string, options:IColorizerOptions): TPromise<string> {
	startup.initStaticServicesIfNecessary();
	var modeService = ensureStaticPlatformServices(null).modeService;
	return Colorizer.colorize(modeService, text, languageId, options);
}

/**
 * Colorize a line in a model.
 */
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
		createDiffNavigator: createDiffNavigator,

		createModel: createModel,
		setModelLanguage: setModelLanguage,
		setModelMarkers: setModelMarkers,
		getModels: getModels,
		getModel: getModel,
		onDidCreateModel: onDidCreateModel,
		onWillDisposeModel: onWillDisposeModel,
		onDidChangeModelLanguage: onDidChangeModelLanguage,


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
		TextEditorCursorBlinkingStyle: editorCommon.TextEditorCursorBlinkingStyle,
		ContentWidgetPositionPreference: ContentWidgetPositionPreference,
		OverlayWidgetPositionPreference: OverlayWidgetPositionPreference,

		// classes
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
		KEYBINDING_CONTEXT_EDITOR_READONLY: editorCommon.KEYBINDING_CONTEXT_EDITOR_READONLY,
		KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS: editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS,
		KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION: editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION,
		KEYBINDING_CONTEXT_EDITOR_LANGUAGE_ID: editorCommon.KEYBINDING_CONTEXT_EDITOR_LANGUAGE_ID,
	};
}
