/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../platform/log/common/log.js';
import { shouldUseSinglePaneLayout } from './parts/singlePaneEditorPart.js';
import { SinglePaneWorkbench } from './singlePaneWorkbench.js';
import { IWorkbenchOptions, Workbench } from './workbench.js';

/**
 * Creates the Agents window workbench, choosing the single-pane (docked
 * detail-panel) variant when the setting is enabled. The layout mode is fixed at
 * construction — toggling the setting requires a window reload.
 */
export function createSessionsWorkbench(parent: HTMLElement, options: IWorkbenchOptions | undefined, serviceCollection: ServiceCollection, logService: ILogService): Workbench {
	const configurationService = serviceCollection.get(IConfigurationService);
	const singlePane = !(configurationService instanceof SyncDescriptor)
		&& shouldUseSinglePaneLayout(configurationService);
	return singlePane
		? new SinglePaneWorkbench(parent, options, serviceCollection, logService)
		: new Workbench(parent, options, serviceCollection, logService);
}
