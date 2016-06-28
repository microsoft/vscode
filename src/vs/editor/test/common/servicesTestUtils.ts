/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {ConfigurationService, IContent, IStat} from 'vs/platform/configuration/common/configurationService';
import {EventService} from 'vs/platform/event/common/eventService';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {BaseWorkspaceContextService} from 'vs/platform/workspace/common/baseWorkspaceContextService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {ModeServiceImpl} from 'vs/editor/common/services/modeServiceImpl';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ModelServiceImpl} from 'vs/editor/common/services/modelServiceImpl';
import {MockExtensionService} from 'vs/editor/test/common/mocks/mockExtensionService';

class MockModeService extends ModeServiceImpl {}

class MockModelService extends ModelServiceImpl { }

export function createMockModeService(): IModeService {
	let services = new ServiceCollection();
	let inst = new InstantiationService(services);

	var extensionService = new MockExtensionService();
	services.set(IExtensionService, extensionService);

	var modeService = new MockModeService(inst, extensionService);
	services.set(IModeService, modeService);

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

	return new MockModelService(null, configurationService, null);
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
