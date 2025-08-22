/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024-2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IErdosIPyWidgetsService } from '../../../services/erdosIPyWidgets/common/erdosIPyWidgetsService.js';
import { ErdosIPyWidgetsService } from './erdosIPyWidgetsService.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

/**
 * ErdosIPyWidgetsContribution class.
 */
class ErdosIPyWidgetsContribution extends Disposable {
	constructor(
		@IErdosIPyWidgetsService private readonly _erdosIPyWidgetsService: IErdosIPyWidgetsService
	) {
		super();
		this._erdosIPyWidgetsService.initialize();
	}
}

// Register the service
registerSingleton(IErdosIPyWidgetsService, ErdosIPyWidgetsService, InstantiationType.Delayed);

// Register workbench contributions.
const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(ErdosIPyWidgetsContribution, LifecyclePhase.Restored);
