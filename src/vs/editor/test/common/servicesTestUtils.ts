/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ConfigurationService, IContent, IStat} from 'vs/platform/configuration/common/configurationService';
import {IEventService} from 'vs/platform/event/common/event';
import {EventService} from 'vs/platform/event/common/eventService';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {NULL_THREAD_SERVICE} from 'vs/platform/test/common/nullThreadService';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {BaseWorkspaceContextService} from 'vs/platform/workspace/common/baseWorkspaceContextService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IModeService} from 'vs/editor/common/services/modeService';
import {ModeServiceImpl} from 'vs/editor/common/services/modeServiceImpl';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ModelServiceImpl} from 'vs/editor/common/services/modelServiceImpl';
import {MockExtensionService} from 'vs/editor/test/common/mocks/mockExtensionService';

class MockModeService extends ModeServiceImpl {}

class MockModelService extends ModelServiceImpl { }

export function createMockModeService(): IModeService {
	var threadService = NULL_THREAD_SERVICE;
	var extensionService = new MockExtensionService();
	var modeService = new MockModeService(threadService, extensionService);
	var services = new ServiceCollection();
	services.set(IThreadService, threadService);
	services.set(IExtensionService, extensionService);
	services.set(IModeService, modeService);
	var inst = new InstantiationService(services);
	threadService.setInstantiationService(inst);
	return modeService;
}

export function createMockModelService(): IModelService {
	let contextService = new BaseWorkspaceContextService({
		resource: URI.from({ scheme: 'inmemory', authority: 'model', path: '/' }),
		id: null,
		name: null,
		uid: null,
		mtime: null
	}, {});
	let eventService = new EventService();
	let configurationService = new MockConfigurationService(contextService, eventService);
	var threadService = NULL_THREAD_SERVICE;
	var extensionService = new MockExtensionService();
	var modeService = new MockModeService(threadService, extensionService);
	var modelService = new MockModelService(threadService, null, modeService, configurationService, null);

	var services = new ServiceCollection();
	services.set(IThreadService, threadService);
	services.set(IExtensionService, extensionService);
	services.set(IModeService, modeService);
	services.set(IWorkspaceContextService, contextService);
	services.set(IEventService, eventService);
	services.set(IConfigurationService, configurationService);
	var inst = new InstantiationService(services);

	threadService.setInstantiationService(inst);
	return modelService;
}

export class MockConfigurationService extends ConfigurationService {

	protected resolveContents(resources: URI[]): TPromise<IContent[]> {
		return TPromise.as(resources.map((resource) => {
			return {
				resource: resource,
				value: ''
			};
		}));
	}

	protected resolveContent(resource: URI): TPromise<IContent> {
		return TPromise.as({
			resource: resource,
			value: ''
		});
	}

	protected resolveStat(resource: URI): TPromise<IStat> {
		return TPromise.as({
			resource: resource,
			isDirectory: false
		});
	}

	setUserConfiguration(key: any, value: any) : Thenable<void> {
		return TPromise.as(null);
	}

}
