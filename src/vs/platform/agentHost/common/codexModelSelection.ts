/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CodexModelProvider } from './agentHostTelemetry.js';
import type { ModelSelection } from './state/sessionState.js';

const CODEX_MODEL_SELECTION_PREFIX = '@provider=';
const CODEX_COPILOT_MODEL_PROVIDER = 'vscode-proxy';

export function toCodexModelSelectionId(modelProvider: string, modelId: string): string {
	return `${CODEX_MODEL_SELECTION_PREFIX}${encodeURIComponent(modelProvider)}:${encodeURIComponent(modelId)}`;
}

export function parseCodexModelSelection(selection: ModelSelection): { readonly modelProvider: string; readonly modelId: string } {
	if (!selection.id.startsWith(CODEX_MODEL_SELECTION_PREFIX)) {
		return { modelProvider: CODEX_COPILOT_MODEL_PROVIDER, modelId: selection.id };
	}
	const separator = selection.id.indexOf(':', CODEX_MODEL_SELECTION_PREFIX.length);
	if (separator < CODEX_MODEL_SELECTION_PREFIX.length) {
		return { modelProvider: CODEX_COPILOT_MODEL_PROVIDER, modelId: selection.id };
	}
	try {
		return {
			modelProvider: decodeURIComponent(selection.id.slice(CODEX_MODEL_SELECTION_PREFIX.length, separator)),
			modelId: decodeURIComponent(selection.id.slice(separator + 1)),
		};
	} catch {
		return { modelProvider: CODEX_COPILOT_MODEL_PROVIDER, modelId: selection.id };
	}
}

/** Bounds the provider actually used at dispatch; legacy model IDs are not evidence. */
export function toCodexModelProvider(provider: string | undefined): CodexModelProvider {
	return provider === 'openai' ? 'openai' : provider === 'vscode-proxy' ? 'copilot' : provider ? 'other' : 'unknown';
}
