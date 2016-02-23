/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IContextMenuService, IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IFileService} from 'vs/platform/files/common/files';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {createInstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IMessageService} from 'vs/platform/message/common/message';
import {AbstractPluginService, ActivatedPlugin} from 'vs/platform/plugins/common/abstractPluginService';
import {IPluginService} from 'vs/platform/plugins/common/plugins';
import {IProgressService} from 'vs/platform/progress/common/progress';
import {IRequestService} from 'vs/platform/request/common/request';
import {ISearchService} from 'vs/platform/search/common/search';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {NULL_THREAD_SERVICE} from 'vs/platform/test/common/nullThreadService';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IModeService} from 'vs/editor/common/services/modeService';
import {ModeServiceImpl} from 'vs/editor/common/services/modeServiceImpl';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ModelServiceImpl} from 'vs/editor/common/services/modelServiceImpl';
import {IResourceService} from 'vs/editor/common/services/resourceService';

export interface IMockPlatformServices {
	threadService?:IThreadService;
	pluginService?:IPluginService;
	instantiationService?:IInstantiationService;
	lifecycleService?: ILifecycleService;
	messageService?:IMessageService;
	markerService?: IMarkerService;
	editorService?:IEditorService;
	requestService?:IRequestService;
	keybindingService?:IKeybindingService;
	contextService?:IWorkspaceContextService;
	contextViewService?:IContextViewService;
	contextMenuService?:IContextMenuService;
	telemetryService?:ITelemetryService;
	eventService?:IEventService;
	storageService?:IStorageService;
	searchService?:ISearchService;
	configurationService?:IConfigurationService;
	progressService?:IProgressService;
	fileService?:IFileService;
}

function createMockPlatformServices(mockPlatformServices:IMockPlatformServices = {}): any {
	return {
		threadService: mockPlatformServices.threadService,
		pluginService: mockPlatformServices.pluginService,
		instantiationService: mockPlatformServices.instantiationService,
		lifecycleService: mockPlatformServices.lifecycleService,
		messageService: mockPlatformServices.messageService,
		markerService:mockPlatformServices.markerService,
		editorService: mockPlatformServices.editorService,
		requestService: mockPlatformServices.requestService,
		keybindingService: mockPlatformServices.keybindingService,
		contextService: mockPlatformServices.contextService,
		contextViewService: mockPlatformServices.contextViewService,
		contextMenuService: mockPlatformServices.contextMenuService,
		telemetryService: mockPlatformServices.telemetryService,
		eventService: mockPlatformServices.eventService,
		storageService: mockPlatformServices.storageService,
		configurationService: mockPlatformServices.configurationService,
		searchService: mockPlatformServices.searchService,
		progressService: mockPlatformServices.progressService,
		fileService: mockPlatformServices.fileService
	};
}

export interface IMockEditorServices extends IMockPlatformServices {
	modelService?: IModelService;
	modeService?: IModeService;
}

export interface IMockEditorWorkerServices extends IMockPlatformServices {
	resourceService?: IResourceService;
}

export function createMockEditorWorkerServices(mockEditorWorkerServices: IMockEditorWorkerServices = {}):any {
	var ret = createMockPlatformServices(mockEditorWorkerServices);
	ret['resourceService'] = mockEditorWorkerServices.resourceService;
	return ret;
}

class MockModeService extends ModeServiceImpl {}
class MockPluginService extends AbstractPluginService<ActivatedPlugin> {
	constructor() {
		super(true);
	}

	protected _showMessage(severity: Severity, msg: string): void {
		switch (severity) {
			case Severity.Error:
				console.error(msg);
				break;
			case Severity.Warning:
				console.warn(msg);
				break;
			case Severity.Info:
				console.info(msg);
				break;
			default:
				console.log(msg);
		}
	}

	public deactivate(pluginId: string): void {
		// nothing to do
	}


	protected _createFailedPlugin(): any {
		throw new Error('not implemented');
	}

	protected _actualActivatePlugin(pluginDescription): any {
		throw new Error('not implemented');
	}
}

class MockModelService extends ModelServiceImpl { }

export function createMockModeService(): IModeService {
	var threadService = NULL_THREAD_SERVICE;
	var pluginService = new MockPluginService();
	var modeService = new MockModeService(threadService, pluginService);
	var inst = createInstantiationService({
		threadService: threadService,
		pluginService: pluginService,
		modeService: modeService
	});
	threadService.setInstantiationService(inst);
	return modeService;
}

export function createMockModelService(): IModelService {
	var threadService = NULL_THREAD_SERVICE;
	var pluginService = new MockPluginService();
	var modeService = new MockModeService(threadService, pluginService);
	var modelService = new MockModelService(threadService, null, modeService);
	var inst = createInstantiationService({
		threadService: threadService,
		pluginService: pluginService,
		modeService: modeService
	});
	threadService.setInstantiationService(inst);
	return modelService;
}