/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// include these in the editor bundle because they are widely used by many languages
import 'vs/editor/common/languages.common';
import Severity from 'vs/base/common/severity';
import {TPromise} from 'vs/base/common/winjs.base';
import {WorkerServer} from 'vs/base/common/worker/workerServer';
import {EventService} from 'vs/platform/event/common/eventService';
import {IEventService} from 'vs/platform/event/common/event';
import {AbstractExtensionService, ActivatedExtension} from 'vs/platform/extensions/common/abstractExtensionService';
import {IExtensionDescription, IExtensionService} from 'vs/platform/extensions/common/extensions';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {SecondaryMarkerService} from 'vs/platform/markers/common/markerService';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {BaseRequestService} from 'vs/platform/request/common/baseRequestService';
import {IRequestService} from 'vs/platform/request/common/request';
import {NullTelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {WorkerThreadService} from 'vs/platform/thread/common/workerThreadService';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {BaseWorkspaceContextService} from 'vs/platform/workspace/common/baseWorkspaceContextService';
import {IWorkspaceContextService, IWorkspace} from 'vs/platform/workspace/common/workspace';
import {ModeServiceImpl, ModeServiceWorkerHelper} from 'vs/editor/common/services/modeServiceImpl';
import {IModeService} from 'vs/editor/common/services/modeService';
import {ModelServiceWorkerHelper} from 'vs/editor/common/services/modelServiceImpl';
import {ResourceService} from 'vs/editor/common/services/resourceServiceImpl';
import {IResourceService} from 'vs/editor/common/services/resourceService';


export interface IInitData {
	contextService: {
		workspace:any;
		configuration:any;
		options:any;
	};
}

interface IWorkspaceWithTelemetry extends IWorkspace {
	telemetry?:string;
}

interface IWorkspaceWithSearch extends IWorkspace {
	search?:string;
}

export interface ICallback {
	(something:any):void;
}

class WorkerExtensionService extends AbstractExtensionService<ActivatedExtension> {

	constructor() {
		super(true);
	}

	protected _showMessage(severity:Severity, msg:string): void {
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

	protected _createFailedExtension(): ActivatedExtension {
		throw new Error('unexpected');
	}

	protected _actualActivateExtension(extensionDescription: IExtensionDescription): TPromise<ActivatedExtension> {
		throw new Error('unexpected');
	}

}

export class EditorWorkerServer {

	private threadService:WorkerThreadService;

	constructor() {
	}

	public initialize(mainThread:WorkerServer, complete:ICallback, error:ICallback, progress:ICallback, initData:IInitData):void {

		const services = new ServiceCollection();

		const extensionService = new WorkerExtensionService();
		const contextService = new BaseWorkspaceContextService(initData.contextService.workspace, initData.contextService.configuration, initData.contextService.options);
		this.threadService = new WorkerThreadService(mainThread.getRemoteCom());
		this.threadService.setInstantiationService(new InstantiationService(new ServiceCollection([IThreadService, this.threadService])));
		const resourceService = new ResourceService();
		const markerService = new SecondaryMarkerService(this.threadService);
		const modeService = new ModeServiceImpl(this.threadService, extensionService);
		const requestService = new BaseRequestService(contextService, NullTelemetryService);

		services.set(IExtensionService, extensionService);
		services.set(IThreadService, this.threadService);
		services.set(IModeService, modeService);
		services.set(IWorkspaceContextService, contextService);
		services.set(IEventService, new EventService());
		services.set(IResourceService, resourceService);
		services.set(IMarkerService, markerService);
		services.set(IRequestService, requestService);

		const instantiationService = new InstantiationService(services);
		this.threadService.setInstantiationService(instantiationService);

		// Instantiate thread actors
		this.threadService.getRemotable(ModeServiceWorkerHelper);
		this.threadService.getRemotable(ModelServiceWorkerHelper);

		complete(undefined);
	}

	public request(mainThread:WorkerServer, complete:ICallback, error:ICallback, progress:ICallback, data:any):void {
		this.threadService.dispatch(data).then(complete, error, progress);
	}
}

export var value = new EditorWorkerServer();
