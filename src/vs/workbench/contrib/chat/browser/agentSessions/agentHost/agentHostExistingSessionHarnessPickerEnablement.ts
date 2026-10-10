/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { AGENT_HOST_EXISTING_SESSION_HARNESS_PICKER_ENABLED_CONTEXT_KEY, AgentHostExistingSessionHarnessPickerEnabledSettingId } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IConfigurationService, isConfigured } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IWorkbenchAssignmentService } from '../../../../../services/assignment/common/assignmentService.js';

const treatmentId = `config.${AgentHostExistingSessionHarnessPickerEnabledSettingId}`;

/**
 * Resolves the strictly hidden editor harness-picker setting against its experiment treatment.
 * Hidden settings are excluded from the generic configuration experiment resolver.
 */
export class AgentHostExistingSessionHarnessPickerEnablement extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostExistingSessionHarnessPickerEnablement';

	private readonly enabledContext: IContextKey<boolean>;
	private updateRequest = 0;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.enabledContext = AGENT_HOST_EXISTING_SESSION_HARNESS_PICKER_ENABLED_CONTEXT_KEY.bindTo(contextKeyService);
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AgentHostExistingSessionHarnessPickerEnabledSettingId)) {
				void this.update();
			}
		}));
		this._register(this.assignmentService.onDidRefetchAssignments(() => void this.update()));
		void this.update();
	}

	private async update(): Promise<void> {
		const request = ++this.updateRequest;
		const inspection = this.configurationService.inspect<boolean>(AgentHostExistingSessionHarnessPickerEnabledSettingId);
		if (isConfigured(inspection)) {
			this.enabledContext.set(inspection.value === true);
			return;
		}

		let enabled = false;
		try {
			enabled = await this.assignmentService.getTreatment<boolean>(treatmentId) === true;
		} catch (error) {
			if (this._store.isDisposed || request !== this.updateRequest) {
				return;
			}
			this.logService.warn(`[AgentHostExistingSessionHarnessPickerEnablement] Failed to resolve treatment '${treatmentId}'.`, error);
		}

		if (this._store.isDisposed || request !== this.updateRequest) {
			return;
		}

		const currentInspection = this.configurationService.inspect<boolean>(AgentHostExistingSessionHarnessPickerEnabledSettingId);
		this.enabledContext.set(isConfigured(currentInspection) ? currentInspection.value === true : enabled);
	}
}
