/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionModelInfo } from './state/protocol/state.js';
import type { IAgentModelInfo } from './agentService.js';

/**
 * Well-known key for the renderer LM-service identifier of the BYOK model an
 * agent-host model is a copy of, carried under a model's open `_meta` bag (see
 * {@link IAgentModelInfo._meta} / {@link SessionModelInfo._meta}).
 *
 * A renderer BYOK model is registered under `<vendor>/<group>/<id>` (or `<vendor>/<id>`
 * without a configured group) — exactly the id the "Manage Models" view keys visibility
 * by. That identifier is not otherwise recoverable once the model round-trips the
 * agent-host bridge, so the renderer attaches it here so the chat model picker can honour
 * the model's visibility toggle.
 */
export const BYOK_MODEL_IDENTIFIER_META_KEY = 'byokModelIdentifier';

/**
 * Builds a `_meta` payload carrying the BYOK model identifier, or `undefined` when there
 * is none so callers can avoid attaching an empty `_meta` object.
 */
export function createAgentModelByokMeta(modelIdentifier: string | undefined): Record<string, unknown> | undefined {
	return modelIdentifier !== undefined ? { [BYOK_MODEL_IDENTIFIER_META_KEY]: modelIdentifier } : undefined;
}

/**
 * Reads the BYOK model identifier from a model's open `_meta` bag, ignoring unrelated
 * keys and values of the wrong type.
 */
export function readAgentModelByokIdentifier(model: IAgentModelInfo | SessionModelInfo): string | undefined {
	const meta = model._meta;
	if (!meta) {
		return undefined;
	}
	const value = meta[BYOK_MODEL_IDENTIFIER_META_KEY];
	return typeof value === 'string' ? value : undefined;
}
