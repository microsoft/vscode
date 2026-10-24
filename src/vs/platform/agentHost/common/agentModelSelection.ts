/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../base/common/types.js';
import type { IAgent, IAgentCreateSessionConfig } from './agent.js';
import { ActionType, type ChatAction, type StateAction } from './state/sessionActions.js';
import { PendingMessageKind, type AgentCapabilities, type AgentInfo, type ChatState, type Message, type ModelSelection } from './state/sessionState.js';
import type { AutomationDefinition } from './state/protocol/channels-automation/state.js';

/** A local catalog key, never a runtime model ID or policy allowlist value. */
export function getModelSelectionKey(model: ModelSelection): string {
	return JSON.stringify([model.modelSourceId ?? null, model.id]);
}

/** Provider-owned legacy decoding; standard source-qualified identities are never reinterpreted. */
export function normalizeAgentModelMessage(agent: Pick<IAgent, 'normalizeModelSelection'> | undefined, message: Message): Message {
	const model = message.model && agent?.normalizeModelSelection?.(message.model);
	return model && model !== message.model ? { ...message, model } : message;
}

export function normalizeAgentModelAction<T extends StateAction>(agent: Pick<IAgent, 'normalizeModelSelection'> | undefined, action: T): T {
	if (action.type === ActionType.ChatDraftChanged) {
		const draft = action.draft && normalizeAgentModelMessage(agent, action.draft);
		return draft !== action.draft ? { ...action, draft } : action;
	}
	if (action.type === ActionType.ChatTurnStarted || action.type === ActionType.ChatPendingMessageSet) {
		const message = normalizeAgentModelMessage(agent, action.message);
		return message !== action.message ? { ...action, message } : action;
	}
	return action;
}

export function supportsModelSourceSelection(capabilities: Pick<AgentCapabilities, 'modelSourceSelection'> | undefined): boolean {
	return isObject(capabilities?.modelSourceSelection);
}

/** Validates the atomic catalog without guessing identities for malformed rows. */
export function getModelSourceCatalogError(agent: Pick<AgentInfo, 'models' | 'modelSources'> & { readonly provider?: string }): string | undefined {
	if (!Array.isArray(agent.models) || (agent.modelSources !== undefined && !Array.isArray(agent.modelSources))) {
		return 'Invalid model source catalog.';
	}
	const sources = new Set<string>();
	for (const source of agent.modelSources ?? []) {
		if (!source || typeof source.id !== 'string' || !source.id.trim() || typeof source.displayName !== 'string' || !source.displayName.trim() || sources.has(source.id)) {
			return 'Invalid or duplicate model source descriptor.';
		}
		sources.add(source.id);
	}
	const models = new Map<string, Set<string | undefined>>();
	for (const model of agent.models) {
		if (!model || typeof model.id !== 'string' || !model.id.trim()) {
			return 'Invalid model identity.';
		}
		if (agent.provider !== undefined && model.provider !== agent.provider) {
			return 'Model belongs to a different agent harness.';
		}
		if (model.modelSourceId !== undefined && (!sources.has(model.modelSourceId) || !model.modelSourceId.trim())) {
			return 'Model references an unknown model source.';
		}
		const key = JSON.stringify([model.provider, model.id]);
		const owners = models.get(key);
		if (owners && (owners.has(model.modelSourceId) || owners.has(undefined) || model.modelSourceId === undefined)) {
			return 'Model catalog contains an ambiguous model identity.';
		}
		if (owners) {
			owners.add(model.modelSourceId);
		} else {
			models.set(key, new Set([model.modelSourceId]));
		}
	}
	return undefined;
}

/** Qualified rows are deliberately unavailable to a client or harness without exact-selection support. */
export function projectLegacyModelSourceCatalog(agent: AgentInfo): AgentInfo {
	const counts = new Map<string, number>();
	for (const model of agent.models) {
		counts.set(model.id, (counts.get(model.id) ?? 0) + 1);
	}
	const models = agent.models.filter(model => model.modelSourceId === undefined && counts.get(model.id) === 1);
	if (models.length === agent.models.length && agent.modelSources === undefined) {
		return agent;
	}
	const { modelSources, ...legacy } = agent;
	return { ...legacy, models };
}

export function getModelSourceSelectionError(model: ModelSelection | undefined, agent: Pick<AgentInfo, 'models' | 'modelSources' | 'capabilities'> | undefined): string | undefined {
	if (!model) {
		return undefined;
	}
	if (model.modelSourceId === undefined) {
		return agent && (agent.models.some(candidate => candidate.id === model.id && candidate.modelSourceId !== undefined) || agent.models.filter(candidate => candidate.id === model.id).length > 1)
			? 'An exact model source is required for this model.'
			: undefined;
	}
	if (!supportsModelSourceSelection(agent?.capabilities)) {
		return 'This agent does not support exact model-source selection.';
	}
	if (!agent || getModelSourceCatalogError(agent) || !agent.models.some(candidate => candidate.id === model.id && candidate.modelSourceId === model.modelSourceId)) {
		return 'The selected model source and model are not available.';
	}
	return undefined;
}

export function chatHasModelSourceSelection(chat: ChatState | undefined): boolean {
	return !!chat && [
		chat.draft,
		chat.activeTurn?.message,
		chat.steeringMessage?.message,
		...(chat.queuedMessages ?? []).map(pending => pending.message),
		...chat.turns.map(turn => turn.message),
	].some(message => message?.model?.modelSourceId !== undefined);
}

export function automationHasModelSourceSelection(definition: Pick<AutomationDefinition, 'session' | 'message'>): boolean {
	return definition.session.model?.modelSourceId !== undefined || definition.message.model?.modelSourceId !== undefined;
}

export function conversationHasModelSourceSelection(conversation: NonNullable<IAgentCreateSessionConfig['importConversation']>): boolean {
	return conversation.model?.modelSourceId !== undefined || conversation.turns.some(turn => turn.message.model?.modelSourceId !== undefined);
}

export function getModelSourceActionError(action: ChatAction, chat: ChatState | undefined, agent: AgentInfo | undefined, clientSupportsSelection: boolean): string | undefined {
	if (action.type === ActionType.ChatTurnResume) {
		const turn = chat?.activeTurn?.id === action.turnId ? chat.activeTurn : chat?.turns.find(turn => turn.id === action.turnId);
		return !clientSupportsSelection && chatHasModelSourceSelection(chat)
			? 'This client cannot resume source-qualified model selections.'
			: getModelSourceSelectionError(turn?.message.model, agent);
	}
	if (action.type !== ActionType.ChatTurnStarted && action.type !== ActionType.ChatPendingMessageSet && action.type !== ActionType.ChatDraftChanged) {
		return undefined;
	}
	const message = action.type === ActionType.ChatDraftChanged ? action.draft : action.message;
	if (!clientSupportsSelection && (message?.model?.modelSourceId !== undefined || chatHasModelSourceSelection(chat))) {
		return 'This client cannot replace or execute source-qualified model selections.';
	}
	if (action.type === ActionType.ChatTurnStarted && action.queuedMessageId) {
		const pendingModel = chat?.queuedMessages?.find(pending => pending.id === action.queuedMessageId)?.message.model;
		if (pendingModel?.modelSourceId !== undefined && (message?.model?.modelSourceId !== pendingModel.modelSourceId || message.model.id !== pendingModel.id)) {
			return 'Consuming a pending message must preserve its exact model source and model.';
		}
	}
	if (action.type === ActionType.ChatPendingMessageSet && action.kind === PendingMessageKind.Steering && chat?.activeTurn) {
		const active = chat.activeTurn.message.model;
		if ((message?.model?.modelSourceId !== undefined || active?.modelSourceId !== undefined)
			&& (message?.model?.modelSourceId !== active?.modelSourceId || message?.model?.id !== active?.id)) {
			return 'Steering an active turn must preserve its exact model source and model.';
		}
	}
	const model = message?.model ?? (action.type === ActionType.ChatTurnStarted
		? chat?.turns.findLast(turn => turn.message.model !== undefined)?.message.model ?? chat?.draft?.model
		: undefined);
	return getModelSourceSelectionError(model, agent);
}
