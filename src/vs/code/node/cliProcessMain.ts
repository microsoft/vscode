/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParsedArgs } from 'vs/code/node/argv';
import { TPromise } from 'vs/base/common/winjs.base';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IEventService } from 'vs/platform/event/common/event';
import { EventService } from 'vs/platform/event/common/eventService';
import { IExtensionManagementService, IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getExtensionId } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { ITelemetryService, NullTelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IRequestService } from 'vs/platform/request/common/request';
import { NodeRequestService } from 'vs/platform/request/node/nodeRequestService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { NodeConfigurationService } from 'vs/platform/configuration/node/nodeConfigurationService';

class Main {

	constructor(
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService
	) {}

	run(argv: ParsedArgs): TPromise<any> {
		if (argv['list-extensions']) {
			return this.extensionManagementService.getInstalled().then(extensions => {
				extensions.forEach(e => console.log(`${ e.displayName } (${ getExtensionId(e) })`));
			});
		}
	}
}

export function main(argv: ParsedArgs): TPromise<void> {
	const services = new ServiceCollection();

	services.set(IEventService, new SyncDescriptor(EventService));
	services.set(IEnvironmentService, new SyncDescriptor(EnvironmentService));
	services.set(ITelemetryService, NullTelemetryService);
	services.set(IConfigurationService, new SyncDescriptor(NodeConfigurationService));
	services.set(IRequestService, new SyncDescriptor(NodeRequestService));
	services.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementService));
	services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryService));

	const instantiationService: IInstantiationService = new InstantiationService(services);
	const main = instantiationService.createInstance(Main);
	return main.run(argv);
}
