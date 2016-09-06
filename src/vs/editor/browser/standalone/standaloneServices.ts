/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Disposable} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ContextMenuService} from 'vs/platform/contextview/browser/contextMenuService';
import {IContextMenuService, IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {ContextViewService} from 'vs/platform/contextview/browser/contextViewService';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {EventService} from 'vs/platform/event/common/eventService';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {createDecorator, IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {ICommandService} from 'vs/platform/commands/common/commands';
import {IOpenerService} from 'vs/platform/opener/common/opener';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {IContextKeyService} from 'vs/platform/contextkey/common/contextkey';
import {MarkerService} from 'vs/platform/markers/common/markerService';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IMessageService} from 'vs/platform/message/common/message';
import {IProgressService} from 'vs/platform/progress/common/progress';
import {IStorageService, NullStorageService} from 'vs/platform/storage/common/storage';
import {ITelemetryService, NullTelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService, WorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {EditorWorkerServiceImpl} from 'vs/editor/common/services/editorWorkerServiceImpl';
import {IModeService} from 'vs/editor/common/services/modeService';
import {MainThreadModeServiceImpl} from 'vs/editor/common/services/modeServiceImpl';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ModelServiceImpl} from 'vs/editor/common/services/modelServiceImpl';
import {CodeEditorServiceImpl} from 'vs/editor/browser/services/codeEditorServiceImpl';
import {SimpleConfigurationService, SimpleMessageService, SimpleExtensionService, StandaloneKeybindingService, StandaloneCommandService} from 'vs/editor/browser/standalone/simpleServices';
import {ContextKeyService} from 'vs/platform/contextkey/browser/contextKeyService';
import {IMenuService} from 'vs/platform/actions/common/actions';
import {MenuService} from 'vs/platform/actions/common/menuService';
import {ICompatWorkerService} from 'vs/editor/common/services/compatWorkerService';
import {MainThreadCompatWorkerService} from 'vs/editor/common/services/compatWorkerServiceMain';

export interface IEditorContextViewService extends IContextViewService {
	dispose(): void;
	setContainer(domNode:HTMLElement): void;
}

export interface IEditorOverrideServices {
	/**
	 * @internal
	 */
	compatWorkerService?: ICompatWorkerService;
	/**
	 * @internal
	 */
	modeService?: IModeService;
	/**
	 * @internal
	 */
	extensionService?:IExtensionService;
	/**
	 * @internal
	 */
	instantiationService?:IInstantiationService;
	/**
	 * @internal
	 */
	messageService?:IMessageService;
	/**
	 * @internal
	 */
	markerService?:IMarkerService;
	/**
	 * @internal
	 */
	menuService?:IMenuService;
	/**
	 * @internal
	 */
	editorService?:IEditorService;
	/**
	 * @internal
	 */
	commandService?:ICommandService;
	/**
	 * @internal
	 */
	openerService?:IOpenerService;
	/**
	 * @internal
	 */
	contextKeyService?:IContextKeyService;
	/**
	 * @internal
	 */
	keybindingService?:IKeybindingService;
	/**
	 * @internal
	 */
	contextService?:IWorkspaceContextService;
	/**
	 * @internal
	 */
	contextViewService?:IEditorContextViewService;
	/**
	 * @internal
	 */
	contextMenuService?:IContextMenuService;
	/**
	 * @internal
	 */
	telemetryService?:ITelemetryService;
	/**
	 * @internal
	 */
	eventService?:IEventService;
	/**
	 * @internal
	 */
	storageService?:IStorageService;
	/**
	 * @internal
	 */
	configurationService?:IConfigurationService;
	/**
	 * @internal
	 */
	progressService?:IProgressService;
	/**
	 * @internal
	 */
	modelService?: IModelService;
	/**
	 * @internal
	 */
	codeEditorService?: ICodeEditorService;
	/**
	 * @internal
	 */
	editorWorkerService?: IEditorWorkerService;
}

export interface IStaticServices {
	configurationService: IConfigurationService;
	compatWorkerService: ICompatWorkerService;
	modeService: IModeService;
	extensionService: IExtensionService;
	markerService: IMarkerService;
	contextService: IWorkspaceContextService;
	messageService: IMessageService;
	telemetryService: ITelemetryService;
	modelService: IModelService;
	codeEditorService: ICodeEditorService;
	editorWorkerService: IEditorWorkerService;
	eventService: IEventService;
	storageService: IStorageService;
	instantiationService: IInstantiationService;
}

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

export function ensureStaticPlatformServices(services: IEditorOverrideServices): IEditorOverrideServices {
	services = shallowClone(services);

	var statics = getOrCreateStaticServices(services);

	let keys = Object.keys(statics);
	for (let i = 0, len = keys.length; i < len; i++) {
		let serviceId = keys[i];
		if (!services.hasOwnProperty(serviceId)) {
			services[serviceId] = statics[serviceId];
		}
	}

	return services;
}

export class DynamicStandaloneServices extends Disposable {

	public services: IEditorOverrideServices;

	constructor(domElement:HTMLElement, _services: IEditorOverrideServices) {
		super();

		let services: IEditorOverrideServices = {};
		for (var serviceId in _services) {
			services[serviceId] = _services[serviceId];
		}

		const serviceCollection = new ServiceCollection();
		services.instantiationService = new InstantiationService(serviceCollection);

		if (typeof services.contextKeyService === 'undefined') {
			services.contextKeyService = this._register(new ContextKeyService(services.configurationService));
		}

		if (typeof services.commandService === 'undefined') {
			services.commandService = new StandaloneCommandService(services.instantiationService, services.extensionService);
		}

		if (typeof services.keybindingService === 'undefined') {
			services.keybindingService = this._register(new StandaloneKeybindingService(services.contextKeyService, services.commandService, services.messageService, domElement));
		}

		if (typeof services.contextViewService === 'undefined') {
			services.contextViewService = this._register(new ContextViewService(domElement, services.telemetryService, services.messageService));
		}

		if (typeof services.contextMenuService === 'undefined') {
			services.contextMenuService = this._register(new ContextMenuService(domElement, services.telemetryService, services.messageService, services.contextViewService));
		}

		if (typeof services.menuService === 'undefined') {
			services.menuService = new MenuService(services.extensionService, services.commandService);
		}

		for (let serviceId in services) {
			if (services.hasOwnProperty(serviceId)) {
				let service = services[serviceId];
				serviceCollection.set(createDecorator(serviceId), service);
			}
		}

		this.services = services;
	}
}

// The static services represents a map of services that once 1 editor has been created must be used for all subsequent editors
var staticServices: IStaticServices = null;
export function getOrCreateStaticServices(services?: IEditorOverrideServices): IStaticServices {
	if (staticServices) {
		return staticServices;
	}
	services = services || {};

	let serviceCollection = new ServiceCollection();
	const instantiationService = new InstantiationService(serviceCollection, true);

	let contextService = services.contextService || new WorkspaceContextService({
		resource: URI.from({ scheme: 'inmemory', authority: 'model', path: '/' })
	});
	serviceCollection.set(IWorkspaceContextService, contextService);

	let telemetryService = services.telemetryService || NullTelemetryService;
	serviceCollection.set(ITelemetryService, telemetryService);

	let eventService = services.eventService || new EventService();
	serviceCollection.set(IEventService, eventService);

	let configurationService = services.configurationService || new SimpleConfigurationService();
	serviceCollection.set(IConfigurationService, configurationService);

	let messageService = services.messageService || new SimpleMessageService();
	serviceCollection.set(IMessageService, messageService);

	let extensionService = services.extensionService || new SimpleExtensionService();
	serviceCollection.set(IExtensionService, extensionService);

	let markerService = services.markerService || new MarkerService();
	serviceCollection.set(IMarkerService, markerService);

	let modeService = services.modeService || new MainThreadModeServiceImpl(instantiationService, extensionService, configurationService);
	serviceCollection.set(IModeService, modeService);

	let modelService = services.modelService || new ModelServiceImpl(markerService, configurationService, messageService);
	serviceCollection.set(IModelService, modelService);

	let compatWorkerService = services.compatWorkerService || new MainThreadCompatWorkerService(modelService);
	serviceCollection.set(ICompatWorkerService, compatWorkerService);

	let editorWorkerService = services.editorWorkerService || new EditorWorkerServiceImpl(modelService);
	serviceCollection.set(IEditorWorkerService, editorWorkerService);

	let codeEditorService = services.codeEditorService || new CodeEditorServiceImpl();
	serviceCollection.set(ICodeEditorService, codeEditorService);

	staticServices = {
		configurationService: configurationService,
		extensionService: extensionService,
		compatWorkerService: compatWorkerService,
		modeService: modeService,
		markerService: markerService,
		contextService: contextService,
		telemetryService: telemetryService,
		messageService: messageService,
		modelService: modelService,
		codeEditorService: codeEditorService,
		editorWorkerService: editorWorkerService,
		eventService: eventService,
		storageService: services.storageService || NullStorageService,
		instantiationService: instantiationService
	};

	return staticServices;
}

