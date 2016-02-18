/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ModelServiceImpl} from 'vs/editor/common/services/modelServiceImpl';
import InstantiationService = require('vs/platform/instantiation/common/instantiationService');
import mainThreadService = require('vs/platform/thread/common/mainThreadService');
import MarkerService = require('vs/platform/markers/common/markerService');
import Env = require('vs/base/common/flags');
import URI from 'vs/base/common/uri';
import MainTelemetryService = require('vs/platform/telemetry/browser/mainTelemetryService');
import SimpleServices = require('vs/editor/browser/standalone/simpleServices');
import Lifecycle = require('vs/base/common/lifecycle');
import ContextViewService = require('vs/platform/contextview/browser/contextViewService');
import ContextMenuService = require('vs/platform/contextview/browser/contextMenuService');
import {BaseWorkspaceContextService} from 'vs/platform/workspace/common/baseWorkspaceContextService';
import _eventService = require('vs/platform/event/common/eventService');
import {CodeEditorServiceImpl} from 'vs/editor/browser/services/codeEditorServiceImpl';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {EditorWorkerServiceImpl} from 'vs/editor/common/services/editorWorkerServiceImpl';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IContextViewService, IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IFileService} from 'vs/platform/files/common/files';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IMessageService} from 'vs/platform/message/common/message';
import {IProgressService} from 'vs/platform/progress/common/progress';
import {IRequestService} from 'vs/platform/request/common/request';
import {ISearchService} from 'vs/platform/search/common/search';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IPluginService} from 'vs/platform/plugins/common/plugins';
import {IModeService} from 'vs/editor/common/services/modeService';
import {MainThreadModeServiceImpl} from 'vs/editor/common/services/modeServiceImpl';

export interface IEditorContextViewService extends IContextViewService {
	dispose(): void;
	setContainer(domNode:HTMLElement): void;
}

export interface IEditorOverrideServices {
	threadService?:IThreadService;
	modeService?: IModeService;
	pluginService?:IPluginService;
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
	threadService: IThreadService;
	modeService: IModeService;
	pluginService: IPluginService;
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

	services.threadService = services.threadService || statics.threadService;
	services.pluginService = services.pluginService || statics.pluginService;
	services.modeService = services.modeService || statics.modeService;
	services.contextService = services.contextService || statics.contextService;
	services.telemetryService = services.telemetryService || statics.telemetryService;
	services.requestService = services.requestService || statics.requestService;
	services.messageService = services.messageService || statics.messageService;
	services.modelService = services.modelService || statics.modelService;
	services.codeEditorService = services.codeEditorService || statics.codeEditorService;
	services.editorWorkerService = services.editorWorkerService || statics.editorWorkerService;
	services.eventService = services.eventService || statics.eventService;
	services.markerService = services.markerService || statics.markerService;
	services.instantiationService = statics.instantiationService;

	return services;
}

export function ensureDynamicPlatformServices(domElement:HTMLElement, services: IEditorOverrideServices): Lifecycle.IDisposable[] {
	var r:Lifecycle.IDisposable[] = [];

	if (typeof services.keybindingService === 'undefined') {
		var keybindingService = new SimpleServices.StandaloneKeybindingService(domElement);
		r.push(keybindingService);
		services.keybindingService = keybindingService;
	}

	if (typeof services.contextViewService === 'undefined') {
		var contextViewService = new ContextViewService.ContextViewService(domElement, services.telemetryService, services.messageService);
		r.push(contextViewService);
		services.contextViewService = contextViewService;
	}
	if (typeof services.contextMenuService === 'undefined') {
		var contextMenuService = new ContextMenuService.ContextMenuService(domElement, services.telemetryService, services.messageService, contextViewService);
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

	var contextService = services.contextService;
	if (!contextService) {
		var workspaceUri = URI.create('inmemory', 'model', '/');
		contextService = new BaseWorkspaceContextService({
			resource: workspaceUri,
			id: null,
			name: null,
			uid: null,
			mtime: null
		}, {});
	}

	var telemetryService = services.telemetryService;

	if (!telemetryService) {
		let config = contextService.getConfiguration();
		let enableTelemetry = config && config.env ? !!config.env.enableTelemetry: false;
		telemetryService = new MainTelemetryService.MainTelemetryService({enableTelemetry: enableTelemetry});
	}


	// warn the user that standaloneEdiktorTelemetryEndpint is absolete
	if (Env.standaloneEditorTelemetryEndpoint) {
		console.warn('standaloneEditorTelemetryEndpoint is obsolete');
	}

	var threadService = services.threadService;
	if (!threadService) {
		threadService = new mainThreadService.MainThreadService(contextService, 'vs/editor/common/worker/editorWorkerServer');
	}

	var messageService = services.messageService || new SimpleServices.SimpleMessageService();
	var pluginService = services.pluginService || new SimpleServices.SimplePluginService();
	var markerService = services.markerService || new MarkerService.MainProcessMarkerService(threadService);
	var requestService = services.requestService || new SimpleServices.SimpleEditorRequestService(contextService, telemetryService);

	var modelService = services.modelService || new ModelServiceImpl(threadService, markerService);

	var modeService = services.modeService;
	if (!modeService) {
		modeService = new MainThreadModeServiceImpl(threadService, pluginService, modelService);
	}

	var codeEditorService = services.codeEditorService || new CodeEditorServiceImpl();
	var editorWorkerService = services.editorWorkerService || new EditorWorkerServiceImpl(modelService);

	var eventService = services.eventService || new _eventService.EventService();

	staticServices = {
		pluginService: pluginService,
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

	var instantiationService = InstantiationService.create(staticServices);
	staticServices.instantiationService = InstantiationService.create(staticServices);
	if (threadService instanceof mainThreadService.MainThreadService) {
		threadService.setInstantiationService(instantiationService);
	}
	(<MainTelemetryService.MainTelemetryService> telemetryService).setInstantiationService(instantiationService);


	return staticServices;
}

