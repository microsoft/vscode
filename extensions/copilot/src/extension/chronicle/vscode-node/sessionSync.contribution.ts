/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { RemoteSessionExporter } from './remoteSessionExporter';
import { SessionSyncStatus } from './sessionSyncStatus';

export function create(accessor: ServicesAccessor): IDisposable {
	const instantiationService = accessor.get(IInstantiationService);
	const configService = accessor.get(IConfigurationService);
	const expService = accessor.get(IExperimentationService);

	const disposableStore = new DisposableStore();

	// Create the exporter (manages cloud sync + state)
	const exporter = instantiationService.createInstance(RemoteSessionExporter);
	disposableStore.add(exporter);

	// Create the status item (renders state in the chat status bar popup)
	const statusItem = new SessionSyncStatus(exporter, configService, expService);
	disposableStore.add(statusItem);

	return disposableStore;
}
