/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { OperatingSystem, OS } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isUnattendedRestartSupported, IUpdateService, RESTART_WHEN_IDLE_SETTING, StateType } from '../../../../platform/update/common/update.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IPowerService } from '../../../services/power/common/powerService.js';

/**
 * Logs the experiment trigger of `update.restartWhenIdle` when the countdown to an unattended
 * restart starts: when the screen gets locked while an update is ready to install, or when an
 * update gets ready while the screen is locked. This happens in every experiment arm, before
 * the restart could happen.
 */
export class UnattendedRestartExperimentTrigger extends Disposable {

	private isScreenLocked = false;

	constructor(
		os: OperatingSystem,
		@IPowerService powerService: IPowerService,
		@IUpdateService private readonly updateService: IUpdateService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		if (!isUnattendedRestartSupported(os, productService, configurationService)) {
			return;
		}

		this._register(powerService.onDidLockScreen(() => {
			this.isScreenLocked = true;
			this.logTriggerIfCountdownStarted();
		}));
		this._register(powerService.onDidUnlockScreen(() => this.isScreenLocked = false));
		this._register(updateService.onStateChange(() => this.logTriggerIfCountdownStarted()));
	}

	private logTriggerIfCountdownStarted(): void {
		if (this.isScreenLocked && this.updateService.state.type === StateType.Ready) {
			logSettingExperimentTrigger(this.telemetryService, RESTART_WHEN_IDLE_SETTING);
		}
	}
}

export class UnattendedRestartExperimentTriggerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.unattendedRestartExperimentTrigger';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		this._register(instantiationService.createInstance(UnattendedRestartExperimentTrigger, OS));
	}
}
