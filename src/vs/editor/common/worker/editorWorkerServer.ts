/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// include these in the editor bundle because they are widely used by many languages
import 'vs/editor/common/languages.common';
import 'vs/editor/common/worker/validationHelper';
import Severity from 'vs/base/common/severity';
import {TPromise} from 'vs/base/common/winjs.base';
import {WorkerServer} from 'vs/base/common/worker/workerServer';
import {EventService} from 'vs/platform/event/common/eventService';
import {AbstractExtensionService, ActivatedExtension} from 'vs/platform/extensions/common/abstractExtensionService';
import {IExtensionDescription} from 'vs/platform/extensions/common/extensions';
import {createInstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {SecondaryMarkerService} from 'vs/platform/markers/common/markerService';
import {BaseRequestService} from 'vs/platform/request/common/baseRequestService';
import {WorkerTelemetryService} from 'vs/platform/telemetry/common/workerTelemetryService';
import {WorkerThreadService} from 'vs/platform/thread/common/workerThreadService';
import {BaseWorkspaceContextService} from 'vs/platform/workspace/common/baseWorkspaceContextService';
import {IWorkspace} from 'vs/platform/workspace/common/workspace';
import {ModeServiceImpl, ModeServiceWorkerHelper} from 'vs/editor/common/services/modeServiceImpl';
import {ModelServiceWorkerHelper} from 'vs/editor/common/services/modelServiceImpl';
import {ResourceService} from 'vs/editor/common/services/resourceServiceImpl';

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

		var extensionService = new WorkerExtensionService();

		var contextService = new BaseWorkspaceContextService(initData.contextService.workspace, initData.contextService.configuration, initData.contextService.options);

		this.threadService = new WorkerThreadService(mainThread.getRemoteCom());
		this.threadService.setInstantiationService(createInstantiationService({ threadService: this.threadService }));

		var telemetryServiceInstance = new WorkerTelemetryService(this.threadService);

		var resourceService = new ResourceService();
		var markerService = new SecondaryMarkerService(this.threadService);

		var modeService = new ModeServiceImpl(this.threadService, extensionService);

		var requestService = new BaseRequestService(contextService, telemetryServiceInstance);

		var _services : any = {
			threadService: this.threadService,
			extensionService: extensionService,
			modeService: modeService,
			contextService: contextService,
			eventService: new EventService(),
			resourceService: resourceService,
			markerService: markerService,
			telemetryService: telemetryServiceInstance,
			requestService: requestService
		};

		var instantiationService = createInstantiationService(_services);
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
