/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { isAutoApprovePolicyRestricted } from '../../../../../workbench/contrib/chat/common/agentHostConfigPolicy.js';
import { ChatConfiguration, ChatDefaultPermissionLevel, IChatDefaultConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';

/** Cloud draft vocabulary until the provisioned host supplies its authoritative schema. */
export function createCloudSandboxSessionConfig(configurationService: IConfigurationService): ResolveSessionConfigResult {
	const restricted = isAutoApprovePolicyRestricted(configurationService);
	const modes = ['interactive', 'plan', 'autopilot'];
	const approvals = restricted ? ['manual'] : ['manual', 'assisted', 'allow-all'];
	const defaults = configurationService.getValue<IChatDefaultConfiguration>(ChatConfiguration.DefaultConfiguration);
	const approval = defaults?.approvals === ChatDefaultPermissionLevel.AllowAll ? 'allow-all' : defaults?.approvals;
	return {
		schema: {
			type: 'object',
			properties: {
				mode: {
					type: 'string',
					title: localize('cloudSandbox.mode', "Agent Mode"),
					enum: modes,
					enumLabels: [localize('cloudSandbox.interactive', "Interactive"), localize('cloudSandbox.plan', "Plan"), localize('cloudSandbox.autopilot', "Autopilot")],
					enumDescriptions: [
						localize('cloudSandbox.interactiveDescription', "Works with you and asks for input when needed."),
						localize('cloudSandbox.planDescription', "Plans the task before making changes."),
						localize('cloudSandbox.autopilotDescription', "Continues working until the task is done."),
					],
					default: 'interactive',
				},
				approvalMode: {
					type: 'string',
					title: localize('cloudSandbox.approvals', "Approvals"),
					enum: approvals,
					default: restricted ? 'manual' : 'assisted',
				},
			},
		},
		values: {
			mode: defaults?.mode && modes.includes(defaults.mode) ? defaults.mode : 'interactive',
			approvalMode: approval && approvals.includes(approval) ? approval : restricted ? 'manual' : 'assisted',
		},
	};
}
