/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { OperatingSystem, OS } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ENABLE_EARLY_STAGING_SETTING, isEarlyStagingSupported, isUnattendedRestartSupported, IUpdateService, RESTART_WHEN_IDLE_SETTING, StateType } from '../../../../platform/update/common/update.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IPowerService } from '../../../services/power/common/powerService.js';

/**
 * Coordinates renderer side update experiment defaults and scorecard triggers.
 */
export class UpdateExperiments extends Disposable {

	private isScreenLocked = false;

	constructor(
		private readonly os: OperatingSystem,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPowerService powerService: IPowerService,
		@IUpdateService private readonly updateService: IUpdateService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		const unattendedRestartSupported = isUnattendedRestartSupported(os);
		const earlyStagingSupported = isEarlyStagingSupported(os);
		if (!unattendedRestartSupported && !earlyStagingSupported) {
			return;
		}

		if (unattendedRestartSupported) {
			this._register(powerService.onDidLockScreen(() => {
				this.isScreenLocked = true;
				this.onUpdateOrLockStateChanged();
			}));
			this._register(powerService.onDidUnlockScreen(() => {
				this.isScreenLocked = false;
			}));
		}

		if (earlyStagingSupported) {
			this.syncEarlyStagingDefault();
			this._register(configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(ENABLE_EARLY_STAGING_SETTING)) {
					this.syncEarlyStagingDefault();
				}
			}));
		}

		this.onUpdateOrLockStateChanged();
		this._register(updateService.onStateChange(() => this.onUpdateOrLockStateChanged()));
	}

	private syncEarlyStagingDefault(): void {
		const defaultValue = this.configurationService.inspect<boolean>(ENABLE_EARLY_STAGING_SETTING).defaultValue === true;
		void this.updateService.setEarlyStagingDefault(defaultValue);
	}

	private onUpdateOrLockStateChanged(): void {
		const stateType = this.updateService.state.type;

		if (isUnattendedRestartSupported(this.os) && this.isScreenLocked && stateType === StateType.Ready) {
			logSettingExperimentTrigger(this.telemetryService, RESTART_WHEN_IDLE_SETTING);
		}

		if (isEarlyStagingSupported(this.os) && stateType === StateType.Downloading) {
			logSettingExperimentTrigger(this.telemetryService, ENABLE_EARLY_STAGING_SETTING);
		}
	}
}

export class UpdateExperimentsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.updateExperiments';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		this._register(instantiationService.createInstance(UpdateExperiments, OS));
	}
}
