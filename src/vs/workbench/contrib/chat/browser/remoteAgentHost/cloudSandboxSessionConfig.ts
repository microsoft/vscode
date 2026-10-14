/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { raceCancellationError } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { validateSessionConfigWrite } from '../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { ResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { isAutoApprovePolicyRestricted } from '../../common/agentHostConfigPolicy.js';
import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem } from '../../common/chatSessionsService.js';
import { ChatConfiguration, ChatDefaultPermissionLevel, IChatDefaultConfiguration } from '../../common/constants.js';

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

/**
 * Validates draft configuration against the provisioned host and rejects anything the host would
 * silently change, so the first turn runs with what the user picked or not at all.
 */
export async function resolveCloudSandboxSessionConfig(connection: IAgentConnection, values: Readonly<Record<string, unknown>>, token: CancellationToken): Promise<Record<string, unknown>> {
	const config = await raceCancellationError(connection.resolveSessionConfig({ provider: CLOUD_SANDBOX_AGENT_PROVIDER, config: { ...values } }), token);
	for (const [key, value] of Object.entries(values)) {
		validateSessionConfigWrite(config.schema, config.values, key, value, true);
		if (config.values[key] !== value) {
			throw new Error(localize('cloudSandbox.configNotApplied', "The sandbox could not apply the selected {0}. Your prompt was not sent.", key));
		}
	}
	return { ...values };
}

function cloudSandboxConfigIcon(key: string, value: string): ThemeIcon {
	if (key === 'approvalMode') {
		return value === 'allow-all' ? Codicon.warning : value === 'assisted' ? Codicon.sparkle : Codicon.shield;
	}
	return value === 'autopilot' ? Codicon.rocket : value === 'plan' ? Codicon.checklist : Codicon.commentDiscussion;
}

/**
 * Presents the draft vocabulary as chat session option groups, for surfaces that render
 * generic option pickers rather than Agent Host configuration chips.
 */
export function createCloudSandboxDraftOptionGroups(config: ResolveSessionConfigResult): IChatSessionProviderOptionGroup[] {
	const groups: IChatSessionProviderOptionGroup[] = [];
	for (const [key, property] of Object.entries(config.schema.properties)) {
		const values = (property.enum ?? []).filter((value): value is string => typeof value === 'string');
		if (values.length === 0) {
			continue;
		}
		const selected = config.values[key];
		const items = values.map((value, index): IChatSessionProviderOptionItem => ({
			id: value,
			name: property.enumLabels?.[index] ?? value,
			description: property.enumDescriptions?.[index],
			icon: cloudSandboxConfigIcon(key, value),
			default: value === selected,
		}));
		groups.push({
			id: key,
			name: property.title ?? key,
			description: property.description,
			icon: items.find(item => item.default)?.icon,
			items,
		});
	}
	return groups;
}

/** The draft's picks for the vocabulary in `config`, ignoring stale or foreign values. */
export function readCloudSandboxDraftConfig(options: ReadonlyMap<string, string | IChatSessionProviderOptionItem> | undefined, config: ResolveSessionConfigResult): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	for (const [key, property] of Object.entries(config.schema.properties)) {
		const selected = options?.get(key);
		const value = typeof selected === 'string' ? selected : selected?.id;
		if (value !== undefined && property.enum?.includes(value)) {
			values[key] = value;
		}
	}
	return values;
}
