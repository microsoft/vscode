/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as flags from 'vs/base/common/flags';
import {IDisposable} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ContextMenuService} from 'vs/platform/contextview/browser/contextMenuService';
import {IContextMenuService, IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {ContextViewService} from 'vs/platform/contextview/browser/contextViewService';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {EventService} from 'vs/platform/event/common/eventService';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IFileService} from 'vs/platform/files/common/files';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {createInstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {MainProcessMarkerService} from 'vs/platform/markers/common/markerService';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IMessageService} from 'vs/platform/message/common/message';
import {IProgressService} from 'vs/platform/progress/common/progress';
import {IRequestService} from 'vs/platform/request/common/request';
import {ISearchService} from 'vs/platform/search/common/search';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {MainTelemetryService} from 'vs/platform/telemetry/browser/mainTelemetryService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {MainThreadService} from 'vs/platform/thread/common/mainThreadService';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {BaseWorkspaceContextService} from 'vs/platform/workspace/common/baseWorkspaceContextService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {EditorWorkerServiceImpl} from 'vs/editor/common/services/editorWorkerServiceImpl';
import {IModeService} from 'vs/editor/common/services/modeService';
import {MainThreadModeServiceImpl} from 'vs/editor/common/services/modeServiceImpl';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ModelServiceImpl} from 'vs/editor/common/services/modelServiceImpl';
import {CodeEditorServiceImpl} from 'vs/editor/browser/services/codeEditorServiceImpl';
import {SimpleConfigurationService, SimpleEditorRequestService, SimpleMessageService, SimpleExtensionService, StandaloneKeybindingService} from 'vs/editor/browser/standalone/simpleServices';

export interface IEditorContextViewService extends IContextViewService {
	dispose(): void;
	setContainer(domNode:HTMLElement): void;
}

export interface IEditorOverrideServices {
	threadService?:IThreadService;
	modeService?: IModeService;
	extensionService?:IExtensionService;
	instantiationService?:IInstantiationService;
	messageService?:IMessageService;
	markerService?:IMarkerService;
	editorService?:IEditorService;
	requestService?:IRequestService;
	keybindingService?:IKeybindingService;
	contextService?:IWorkspaceContextService;
	contextViewService?:IEditorContextViewService;
	contextMenuService?:IContextMenuService;
	telemetryService?:ITelemetryService;
	eventService?:IEventService;
	storageService?:IStorageService;
	searchService?:ISearchService;
	configurationService?:IConfigurationService;
	progressService?:IProgressService;
	fileService?:IFileService;
	modelService?: IModelService;
	codeEditorService?: ICodeEditorService;
	editorWorkerService?: IEditorWorkerService;
}

export interface IStaticServices {
	configurationService: IConfigurationService;
	threadService: IThreadService;
	modeService: IModeService;
	extensionService: IExtensionService;
	markerService: IMarkerService;
	contextService: IWorkspaceContextService;
	requestService: IRequestService;
	messageService: IMessageService;
	telemetryService: ITelemetryService;
	modelService: IModelService;
	codeEditorService: ICodeEditorService;
	editorWorkerService: IEditorWorkerService;
	eventService: IEventService;
	instantiationService: IInstantiationService;
}

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

export function ensureStaticPlatformServices(services: IEditorOverrideServices): IEditorOverrideServices {
	services = shallowClone(services);

	var statics = getOrCreateStaticServices(services);

	for (var serviceId in statics) {
		if (statics.hasOwnProperty(serviceId)) {
			if (!services.hasOwnProperty(serviceId)) {
				services[serviceId] = statics[serviceId];
			}
		}
	}

	return services;
}

export function ensureDynamicPlatformServices(domElement:HTMLElement, services: IEditorOverrideServices): IDisposable[] {
	var r:IDisposable[] = [];

	if (typeof services.keybindingService === 'undefined') {
		var keybindingService = new StandaloneKeybindingService(services.configurationService, domElement);
		r.push(keybindingService);
		services.keybindingService = keybindingService;
	}

	if (typeof services.contextViewService === 'undefined') {
		var contextViewService = new ContextViewService(domElement, services.telemetryService, services.messageService);
		r.push(contextViewService);
		services.contextViewService = contextViewService;
	}
	if (typeof services.contextMenuService === 'undefined') {
		var contextMenuService = new ContextMenuService(domElement, services.telemetryService, services.messageService, contextViewService);
		r.push(contextMenuService);
		services.contextMenuService = contextMenuService;
	}

	return r;
}

// The static services represents a map of services that once 1 editor has been created must be used for all subsequent editors
var staticServices: IStaticServices = null;
export function getOrCreateStaticServices(services?: IEditorOverrideServices): IStaticServices {
	if (staticServices) {
		return staticServices;
	}
	services = services || {};

	let contextService = services.contextService;
	if (!contextService) {
		contextService = new BaseWorkspaceContextService({
			resource: URI.create('inmemory', 'model', '/'),
			id: null,
			name: null,
			uid: null,
			mtime: null
		}, {});
	}

	let telemetryService = services.telemetryService;

	if (!telemetryService) {
		let config = contextService.getConfiguration();
		let enableTelemetry = config && config.env ? !!config.env.enableTelemetry: false;
		telemetryService = new MainTelemetryService({enableTelemetry: enableTelemetry});
	}

	let eventService = services.eventService || new EventService();
	let configurationService = services.configurationService || new SimpleConfigurationService(contextService, eventService);

	// warn the user that standaloneEdiktorTelemetryEndpint is absolete
	if (flags.standaloneEditorTelemetryEndpoint) {
		console.warn('standaloneEditorTelemetryEndpoint is obsolete');
	}

	let threadService = services.threadService || new MainThreadService(contextService, 'vs/editor/common/worker/editorWorkerServer', 2);
	let messageService = services.messageService || new SimpleMessageService();
	let extensionService = services.extensionService || new SimpleExtensionService();
	let markerService = services.markerService || new MainProcessMarkerService(threadService);
	let requestService = services.requestService || new SimpleEditorRequestService(contextService, telemetryService);
	let modeService = services.modeService || new MainThreadModeServiceImpl(threadService, extensionService, configurationService);
	let modelService = services.modelService || new ModelServiceImpl(threadService, markerService, modeService, configurationService, messageService);
	let editorWorkerService = services.editorWorkerService || new EditorWorkerServiceImpl(modelService);
	let codeEditorService = services.codeEditorService || new CodeEditorServiceImpl();

	staticServices = {
		configurationService: configurationService,
		extensionService: extensionService,
		modeService: modeService,
		threadService: threadService,
		markerService: markerService,
		contextService: contextService,
		telemetryService: telemetryService,
		requestService: requestService,
		messageService: messageService,
		modelService: modelService,
		codeEditorService: codeEditorService,
		editorWorkerService: editorWorkerService,
		eventService: eventService,
		instantiationService: void 0
	};

	let instantiationService = createInstantiationService(staticServices);
	staticServices.instantiationService = createInstantiationService(staticServices);
	if (threadService instanceof MainThreadService) {
		threadService.setInstantiationService(instantiationService);
	}
	(<MainTelemetryService> telemetryService).setInstantiationService(instantiationService);


	return staticServices;
}

