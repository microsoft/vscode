/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CodexModelProvider } from './agentHostTelemetry.js';
import { parseProviderQualifiedModelId, toProviderQualifiedModelId } from './providerQualifiedModelId.js';
import type { ModelSelection } from './state/sessionState.js';

export const CODEX_COPILOT_MODEL_PROVIDER = 'vscode-proxy';

export function toCodexModelSelectionId(modelProvider: string, modelId: string): string {
	return toProviderQualifiedModelId(modelProvider, modelId);
}

export function parseCodexModelSelection(selection: ModelSelection): { readonly modelProvider: string; readonly modelId: string } {
	const parsed = parseProviderQualifiedModelId(selection.id);
	return parsed
		? { modelProvider: parsed.provider, modelId: parsed.modelId }
		: { modelProvider: CODEX_COPILOT_MODEL_PROVIDER, modelId: selection.id };
}

/** Bounds the provider actually used at dispatch; legacy model IDs are not evidence. */
export function toCodexModelProvider(provider: string | undefined): CodexModelProvider {
	return provider === 'openai' ? 'openai' : provider === CODEX_COPILOT_MODEL_PROVIDER ? 'copilot' : provider ? 'other' : 'unknown';
}
