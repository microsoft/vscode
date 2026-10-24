/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { CLAUDE_PROVIDER_ANTHROPIC, CLAUDE_PROVIDER_COPILOT } from '../../common/claudeProviders.js';
import { JsonRpcErrorCodes } from '../../common/state/protocol/errors.js';
import type { ModelSelection, ModelSourceInfo } from '../../common/state/protocol/state.js';
import { ProtocolError } from '../../common/state/sessionProtocol.js';
import { toAgentModelProviderMeta } from '../../common/meta/agentModelProvider.js';
import { toSdkModelId } from './claudeModelId.js';
import type { ClaudeTransportMode } from './claudeTransportMode.js';

/** Read-only compatibility for selections persisted before typed model sources. */
const CLAUDE_MODEL_SELECTION_PREFIX = '@provider=';

export const claudeNativeModelSource: ModelSourceInfo = { id: CLAUDE_PROVIDER_ANTHROPIC, displayName: localize('claude.modelSource.anthropic', "Anthropic") };
export const claudeProxyModelSource: ModelSourceInfo = { id: CLAUDE_PROVIDER_COPILOT, displayName: localize('claude.modelSource.copilot', "GitHub Copilot") };

/** Only the adapter translates its source IDs to transports; unknown sources never fall back. */
export function claudeTransportForProvider(provider: string): ClaudeTransportMode {
	switch (provider) {
		case CLAUDE_PROVIDER_ANTHROPIC: return 'native';
		case CLAUDE_PROVIDER_COPILOT: return 'proxy';
		default: throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('claude.unknownModelSource', "Claude does not support the selected model source."));
	}
}

/** Decodes old stored IDs without teaching AHP clients a provider-specific syntax. */
export function normalizeClaudeModelSelection(selection: ModelSelection): ModelSelection {
	if (selection.modelSourceId !== undefined) {
		claudeTransportForProvider(selection.modelSourceId);
		return selection;
	}
	if (!selection.id.startsWith(CLAUDE_MODEL_SELECTION_PREFIX)) {
		return selection;
	}
	const separator = selection.id.indexOf(':', CLAUDE_MODEL_SELECTION_PREFIX.length);
	if (separator < 0) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('claude.invalidStoredModelSource', "The saved Claude model-source selection is invalid."));
	}
	let modelSourceId: string;
	let id: string;
	try {
		modelSourceId = decodeURIComponent(selection.id.slice(CLAUDE_MODEL_SELECTION_PREFIX.length, separator));
		id = decodeURIComponent(selection.id.slice(separator + 1));
	} catch (error) {
		if (!(error instanceof URIError)) {
			throw error;
		}
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('claude.invalidStoredModelSource', "The saved Claude model-source selection is invalid."));
	}
	claudeTransportForProvider(modelSourceId);
	if (!id.trim()) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('claude.invalidStoredModelSource', "The saved Claude model-source selection is invalid."));
	}
	return { ...selection, id, modelSourceId };
}

/** A genuinely unqualified legacy model retains the host-default transport. */
export function parseClaudeModelSelection(selection: ModelSelection): { readonly provider: string; readonly modelId: string; readonly explicitProvider: boolean } {
	const model = normalizeClaudeModelSelection(selection);
	return { provider: model.modelSourceId ?? CLAUDE_PROVIDER_COPILOT, modelId: model.id, explicitProvider: model.modelSourceId !== undefined };
}

/** The SDK receives its model name, never an AHP source ID or a legacy provider wrapper. */
export function toClaudeSdkModelId(model: ModelSelection): string;
export function toClaudeSdkModelId(model: ModelSelection | undefined): string | undefined;
export function toClaudeSdkModelId(model: ModelSelection | undefined): string | undefined {
	return model ? toSdkModelId(normalizeClaudeModelSelection(model).id) : undefined;
}

/** Explicit source selection wins; bare selections preserve the existing host-default behavior. */
export function resolveClaudeSessionTransport(inputs: {
	readonly model: ModelSelection | undefined;
	readonly defaultMode: ClaudeTransportMode;
}): ClaudeTransportMode {
	const model = inputs.model && normalizeClaudeModelSelection(inputs.model);
	return model?.modelSourceId !== undefined ? claudeTransportForProvider(model.modelSourceId) : inputs.defaultMode;
}

/** Publishes raw IDs and source references; the picker owns presentation order. */
export function mergeClaudeModelCatalogs(proxy: readonly IAgentModelInfo[], native: readonly IAgentModelInfo[]): IAgentModelInfo[] {
	return [
		...native.map(model => ({ ...model, modelSource: claudeNativeModelSource })),
		...proxy.map(model => ({
			...model,
			modelSource: claudeProxyModelSource,
			_meta: {
				...model._meta,
				...toAgentModelProviderMeta({ id: CLAUDE_PROVIDER_COPILOT, kind: 'copilot', label: claudeProxyModelSource.displayName }),
			},
		})),
	];
}
