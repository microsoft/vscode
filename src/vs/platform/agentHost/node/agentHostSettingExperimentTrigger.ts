/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { logSettingExperimentTrigger } from '../../telemetry/common/experimentTrigger.js';
import type { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { CopilotCliVSCodeAssignmentContextKey } from '../common/copilotCliConfig.js';
import type { IAgentConfigurationService } from './agentConfigurationService.js';

/**
 * Logs the experiment trigger of an experiment-controlled setting from the
 * agent host, where the control and treatment arms diverge.
 *
 * Agent host telemetry only carries the assignment context that ExP
 * attributes the event by once the workbench has forwarded it through root
 * config, so a trigger reached before then stays pending and is logged when
 * the context arrives.
 */
export class AgentHostSettingExperimentTrigger extends Disposable {

	/** Set while the divergence was reached before the assignment context arrived. */
	private _pending = false;

	constructor(
		private readonly _settingId: string,
		private readonly _configurationService: IAgentConfigurationService,
		private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._register(this._configurationService.onDidRootConfigChange(() => {
			if (this._pending) {
				// Deferred so that the listener installing the forwarded assignment context on telemetry runs first.
				queueMicrotask(() => {
					if (this._pending && !this._store.isDisposed) {
						this.report();
					}
				});
			}
		}));
	}

	/** Reports that the arms diverge here. Safe to call on every evaluation: the trigger is logged at most once per process. */
	report(): void {
		this._pending = typeof this._configurationService.getRootConfigValues?.()[CopilotCliVSCodeAssignmentContextKey] !== 'string';
		if (!this._pending) {
			logSettingExperimentTrigger(this._telemetryService, this._settingId);
		}
	}
}
