/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgent, IAgentChatContext } from '../common/agent.js';
import type { SessionMode } from '../common/agentHostSchema.js';
import { readAgentModelByokIdentifier } from '../common/agentModelByokMeta.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import type { SessionState, URI as ProtocolURI } from '../common/state/sessionState.js';
import { URI } from '../../../base/common/uri.js';
import type { AgentHostModelTelemetryKind } from './agentHostTelemetryReporter.js';

export interface IAgentHostTurnTelemetryContext {
	readonly model: string | undefined;
	readonly modelTelemetryKind: AgentHostModelTelemetryKind | undefined;
	readonly modelSelectionKind: 'default' | 'auto' | 'explicit';
	readonly permissionLevel: string | undefined;
	readonly interactionMode: SessionMode | undefined;
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
	const modelSelectionKind = modelId === undefined ? 'default' : modelId === 'auto' ? 'auto' : 'explicit';
	const effectiveModelId = modelId ?? agent.chats.getModel?.(URI.parse(chat), context)?.id;
	const modelContext = effectiveModelId === undefined || (modelId === undefined && effectiveModelId === 'auto')
		? { model: undefined, modelTelemetryKind: undefined }
		: getModelTelemetryContext(agent, effectiveModelId);
	return { ...modelContext, modelSelectionKind, permissionLevel, interactionMode };
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
