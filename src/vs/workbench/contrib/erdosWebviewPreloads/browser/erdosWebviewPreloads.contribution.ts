/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024-2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IErdosWebviewPreloadsService } from '../../../services/erdosWebviewPreloads/common/erdosWebviewPreloadsService.js';
import { ErdosWebviewPreloadsService } from './erdosWebviewPreloadsService.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

/**
 * ErdosWebviewPreloadsContribution class.
 */
class ErdosWebviewPreloadsContribution extends Disposable {
	constructor(
		@IErdosWebviewPreloadsService _erdosWebviewPreloadsService: IErdosWebviewPreloadsService
	) {
		super();
		// Service is ready
	}
}

// Register the service
registerSingleton(IErdosWebviewPreloadsService, ErdosWebviewPreloadsService, InstantiationType.Delayed);

// Register workbench contributions.
const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(ErdosWebviewPreloadsContribution, LifecyclePhase.Restored);
