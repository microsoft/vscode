/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelSelection } from '../state/protocol/state.js';
import { parseCodexModelSelection, toCodexModelSelectionId } from '../codexModelSelection.js';

/** Namespaced {@link SessionSummary._meta} slot carrying a Codex provider model. */
export const CODEX_SESSION_MODEL_META_KEY = 'vscode.codex.modelSelection';

interface IHasCodexSessionModelMeta {
	readonly _meta?: Record<string, unknown>;
}

interface ICodexSessionModelMeta {
	readonly id: string;
}

/**
 * Reads a canonical Codex provider model from session metadata.
 *
 * Legacy model ids do not identify their provider, so they deliberately fail
 * closed rather than being interpreted as Copilot models by the legacy parser.
 */
export function readCodexSessionModel(source: IHasCodexSessionModelMeta | undefined): ModelSelection | undefined {
	const value = source?._meta?.[CODEX_SESSION_MODEL_META_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const id = (value as Partial<ICodexSessionModelMeta>).id;
	if (typeof id !== 'string' || id.length === 0) {
		return undefined;
	}
	const parsed = parseCodexModelSelection({ id });
	return parsed.modelProvider.length > 0
		&& parsed.modelId.length > 0
		&& toCodexModelSelectionId(parsed.modelProvider, parsed.modelId) === id
		? { id }
		: undefined;
}

/** Adds or removes the validated Codex provider model metadata slot. */
export function withCodexSessionModel(meta: Record<string, unknown> | undefined, model: ModelSelection | undefined): Record<string, unknown> | undefined {
	const validated = model ? readCodexSessionModel({ _meta: { [CODEX_SESSION_MODEL_META_KEY]: { id: model.id } } }) : undefined;
	if (validated) {
		return { ...meta, [CODEX_SESSION_MODEL_META_KEY]: { id: validated.id } satisfies ICodexSessionModelMeta };
	}
	if (!meta || !Object.hasOwn(meta, CODEX_SESSION_MODEL_META_KEY)) {
		return meta;
	}
	const next = { ...meta };
	delete next[CODEX_SESSION_MODEL_META_KEY];
	return Object.keys(next).length > 0 ? next : undefined;
}
