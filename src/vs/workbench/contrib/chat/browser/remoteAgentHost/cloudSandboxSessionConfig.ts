/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { disposableTimeout, raceCancellationError } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { createContextSizeConfigSchemaPropertyFromLimits } from '../../../../../platform/agentHost/common/agentModelConfiguration.js';
import { ICAPIModelBilling } from '../../../../../platform/agentHost/common/meta/agentModelMeta.js';
import { filterSessionConfigValues, isSessionConfigWritable, validateSessionConfigWrite } from '../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { ResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ConfigPropertySchema, SessionModelInfo } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { getChatDefaultConfiguration, isAutoApprovePolicyRestricted } from '../../common/agentHostConfigPolicy.js';
import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem } from '../../common/chatSessionsService.js';
import { ChatDefaultPermissionLevel } from '../../common/constants.js';
import { filterConfigurationToSchema } from '../widget/input/chatModelConfigurationLogic.js';

/** Maps the Cloud catalogue's named context tiers to the model configuration the host accepts. */
export function createCloudSandboxContextTierSchema(billing: ICAPIModelBilling | undefined): ConfigPropertySchema | undefined {
	const standard = billing?.tokenPrices?.contextMax;
	const extended = billing?.tokenPrices?.longContext?.contextMax;
	if (standard === undefined || extended === undefined || standard <= 0 || !Number.isFinite(standard) || !Number.isFinite(extended)) {
		return undefined;
	}
	const sizes = createContextSizeConfigSchemaPropertyFromLimits(standard, extended);
	return sizes ? { ...sizes, type: 'string', enum: ['default', 'long_context'], default: 'default' } : undefined;
}

/** Adds only the draft compatibility vocabulary; connected host schemas must never use this fallback. */
export function withCloudSandboxDraftModelConfig(model: SessionModelInfo): SessionModelInfo {
	if (model.provider !== CLOUD_SANDBOX_AGENT_PROVIDER || model.configSchema?.properties.contextTier || model.configSchema?.properties.contextSize) {
		return model;
	}
	// TODO: Remove this draft-only fallback once the pre-session catalogue supplies host-owned model configuration.
	return {
		...model,
		configSchema: {
			type: 'object',
			...model.configSchema,
			properties: {
				...model.configSchema?.properties,
				contextTier: {
					type: 'string',
					title: localize('cloudSandbox.contextTier', "Context Size"),
					enum: ['default', 'long_context'],
					enumLabels: [localize('cloudSandbox.defaultContext', "Default"), localize('cloudSandbox.longContext', "Long context")],
					enumDescriptions: [
						localize('cloudSandbox.defaultContextDescription', "Use the model's standard context window. The token limit is not reported."),
						localize('cloudSandbox.longContextDescription', "Request the larger context window. The token limit is not reported; the host must accept this choice before sending."),
					],
					default: 'default',
				},
			},
		},
	};
}

/** Validates draft model choices against the real host catalogue, never the client's supplemental models. */
export async function validateCloudSandboxModelConfig(connection: IAgentConnection, modelId: string, values: Readonly<Record<string, unknown>>, token: CancellationToken): Promise<void> {
	if (!Object.keys(values).length) {
		return;
	}
	const store = new DisposableStore();
	const cancellation = store.add(new CancellationTokenSource(token));
	let timedOut = false;
	store.add(disposableTimeout(() => {
		timedOut = true;
		cancellation.cancel();
	}, 30_000));
	try {
		while (true) {
			if (cancellation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			const root = connection.rootState.value;
			if (root instanceof Error) {
				throw root;
			}
			const models = root?.agents.find(agent => agent.provider === CLOUD_SANDBOX_AGENT_PROVIDER)?.models;
			if (models?.length) {
				const model = models.find(model => model.id === modelId && model.provider === CLOUD_SANDBOX_AGENT_PROVIDER);
				if (!model || model.policyState === 'disabled') {
					throw new Error(localize('cloudSandbox.modelUnavailable', "The sandbox does not offer the selected model {0}. Your prompt was not sent.", modelId));
				}
				const schema = { properties: model.configSchema?.properties };
				const accepted = filterConfigurationToSchema(values, schema);
				for (const [key, value] of Object.entries(values)) {
					if (model.configSchema?.properties[key]?.readOnly || !Object.hasOwn(accepted, key) || accepted[key] !== value) {
						throw new Error(localize('cloudSandbox.modelOptionUnavailable', "The sandbox cannot apply the selected {0} for {1}. Your prompt was not sent.", key, model.name));
					}
				}
				return;
			}
			const changed = Event.toPromise(connection.rootState.onDidChange);
			try {
				await raceCancellationError(changed, cancellation.token);
			} finally {
				changed.cancel();
			}
		}
	} catch (error) {
		if (timedOut) {
			throw new Error(localize('cloudSandbox.modelConfigTimeout', "Timed out waiting for the sandbox's model configuration. Your prompt was not sent."));
		}
		throw error;
	} finally {
		store.dispose();
	}
}

/** Cloud draft vocabulary until the provisioned host supplies its authoritative schema. */
export function createCloudSandboxSessionConfig(configurationService: IConfigurationService): ResolveSessionConfigResult {
	const restricted = isAutoApprovePolicyRestricted(configurationService);
	const modes = ['interactive', 'plan', 'autopilot'];
	const approvals = restricted ? ['manual'] : ['manual', 'assisted', 'allow-all'];
	const defaults = getChatDefaultConfiguration(configurationService);
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
					enumLabels: [
						localize('cloudSandbox.manualPermissions', "Manual permissions"),
						...restricted ? [] : [
							localize('cloudSandbox.assistedPermissions', "Assisted permissions"),
							localize('cloudSandbox.allowAll', "Allow all"),
						],
					],
					enumDescriptions: [
						localize('cloudSandbox.manualPermissionsDescription', "Asks when approval settings don't apply"),
						...restricted ? [] : [
							localize('cloudSandbox.assistedPermissionsDescription', "Evaluates risk before running tools"),
							localize('cloudSandbox.allowAllDescription', "Runs tool calls without asking"),
						],
					],
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
	const resolveConfig = (config: Record<string, unknown>) => raceCancellationError(connection.resolveSessionConfig({ provider: CLOUD_SANDBOX_AGENT_PROVIDER, config }), token);
	let requestedConfig = { ...values };
	let config = await resolveConfig(requestedConfig);
	const imageGeneration = config.schema.properties.imageGeneration;

	// Match local Copilot's native image-generation opt-in only when the host advertises it.
	if (!Object.hasOwn(requestedConfig, 'imageGeneration') && imageGeneration?.type === 'boolean'
		&& isSessionConfigWritable(imageGeneration, true)
		&& filterSessionConfigValues(config.schema, { imageGeneration: true }).imageGeneration === true) {
		requestedConfig = { ...requestedConfig, imageGeneration: true };
		config = await resolveConfig(requestedConfig);
	}

	for (const [key, value] of Object.entries(requestedConfig)) {
		validateSessionConfigWrite(config.schema, config.values, key, value, true);
		if (config.values[key] !== value) {
			throw new Error(localize('cloudSandbox.configNotApplied', "The sandbox could not apply the selected {0}. Your prompt was not sent.", key));
		}
	}
	return requestedConfig;
}

function cloudSandboxConfigIcon(key: string, value: string): ThemeIcon {
	if (key === 'approvalMode') {
		return value === 'allow-all' ? Codicon.warning : value === 'assisted' ? Codicon.sparkle : Codicon.shield;
	}
	return value === 'autopilot' ? Codicon.rocket : value === 'plan' ? Codicon.checklist : Codicon.commentDiscussion;
}

/**
 * Stores draft selections as session options while the shared Agent Host pickers render them.
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
			when: 'false',
			description: property.description,
			icon: items.find(item => item.default)?.icon,
			items,
		});
	}
	return groups;
}

/** Resolves draft picks against current defaults, ignoring stale or foreign values. */
export function readCloudSandboxDraftConfig(options: ReadonlyMap<string, string | IChatSessionProviderOptionItem> | undefined, config: ResolveSessionConfigResult): Record<string, unknown> {
	const values: Record<string, unknown> = { ...config.values };
	for (const [key, property] of Object.entries(config.schema.properties)) {
		const selected = options?.get(key);
		const value = typeof selected === 'string' ? selected : selected?.id;
		if (value !== undefined && property.enum?.includes(value)) {
			values[key] = value;
		}
	}
	return values;
}
