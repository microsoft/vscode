/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { COPILOT_CLI_AGENT_PROVIDER_ID, type IAgent, type IAgentChatContext } from '../common/agent.js';
import type { SessionMode } from '../common/agentHostSchema.js';
import type { IAgentProviderTurnTelemetryContext } from '../common/agentHostTelemetry.js';
import { readAgentModelByokIdentifier } from '../common/agentModelByokMeta.js';
import { COPILOT_HYDRA_FUSION_MODEL_ID } from '../common/copilotCliConfig.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import type { SessionState, URI as ProtocolURI } from '../common/state/sessionState.js';
import { URI } from '../../../base/common/uri.js';
import type { AgentHostModelSelectionKind, AgentHostModelTelemetryKind } from './agentHostTelemetryReporter.js';
import { getCodexAccountTelemetryData } from './codex/codexAccountTelemetry.js';

export interface IAgentHostTurnTelemetryContext {
	readonly model: string | undefined;
	readonly modelTelemetryKind: AgentHostModelTelemetryKind | undefined;
	readonly modelSelectionKind: AgentHostModelSelectionKind;
	readonly permissionLevel: string | undefined;
	readonly interactionMode: SessionMode | undefined;
}

export function captureProviderTurnTelemetryContext(agent: IAgent): IAgentProviderTurnTelemetryContext | undefined {
	const codex = agent.id === 'codex' ? getCodexAccountTelemetryData(agent.captureTurnTelemetryContext?.().codex) : undefined;
	return codex ? Object.freeze({ codex: Object.freeze(codex) }) : undefined;
}

export function getConfiguredSessionMode(config: SessionState['config'] | undefined): SessionMode | undefined {
	const value = config?.values[SessionConfigKey.Mode] ?? config?.schema.properties[SessionConfigKey.Mode]?.default;
	switch (value) {
		case 'interactive':
		case 'plan':
		case 'autopilot':
			return value;
		default:
			return undefined;
	}
}

export function getTurnTelemetryContext(agent: IAgent, chat: ProtocolURI, context: IAgentChatContext, state: SessionState | undefined, modelId: string | undefined): IAgentHostTurnTelemetryContext {
	const permissionValue = state?.config?.values[SessionConfigKey.AutoApprove];
	const permissionLevel = typeof permissionValue === 'string' ? permissionValue : undefined;
	const interactionMode = getConfiguredSessionMode(state?.config);
	const effectiveModelId = modelId ?? agent.chats.getModel?.(URI.parse(chat), context)?.id;
	const modelSelectionKind = getModelSelectionKind(agent.id, modelId, effectiveModelId);
	const modelContext = effectiveModelId === undefined || (modelId === undefined && effectiveModelId === 'auto')
		? { model: undefined, modelTelemetryKind: undefined }
		: getModelTelemetryContext(agent, effectiveModelId);
	return { ...modelContext, modelSelectionKind, permissionLevel, interactionMode };
}

function getModelSelectionKind(provider: string, modelId: string | undefined, effectiveModelId = modelId): AgentHostModelSelectionKind {
	if (provider === COPILOT_CLI_AGENT_PROVIDER_ID && effectiveModelId === COPILOT_HYDRA_FUSION_MODEL_ID) {
		return 'hydrafusion';
	}
	if (effectiveModelId === 'auto') {
		return 'auto';
	}
	return modelId === undefined ? 'default' : 'explicit';
}

export function getModelTelemetryContext(agent: IAgent, modelId: string): { model: string; modelTelemetryKind: AgentHostModelTelemetryKind } {
	const model = agent.models.get().find(model => model.id === modelId);
	let modelTelemetryKind: AgentHostModelTelemetryKind;
	if (modelId === 'auto') {
		modelTelemetryKind = 'trusted';
	} else if (model === undefined) {
		modelTelemetryKind = 'unknown';
	} else {
		modelTelemetryKind = readAgentModelByokIdentifier(model) === undefined ? 'trusted' : 'byok';
	}
	return { model: modelId, modelTelemetryKind };
}
