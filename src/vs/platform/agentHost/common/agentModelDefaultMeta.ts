/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionModelInfo } from './state/protocol/state.js';
import type { IAgentModelInfo } from './agent.js';

/**
 * Well-known key marking the model a new session uses when the caller does not choose one,
 * carried under a model's open `_meta` bag (see {@link IAgentModelInfo._meta} /
 * {@link SessionModelInfo._meta}). A host sets it when its runtime reports a default, for
 * example an organization-managed default model.
 */
export const DEFAULT_MODEL_META_KEY = 'isDefault';

/**
 * Builds a `_meta` payload marking the default model, or `undefined` when the model is not the
 * default so callers can avoid attaching an empty `_meta` object.
 */
export function createAgentModelDefaultMeta(isDefault: boolean | undefined): Record<string, unknown> | undefined {
	return isDefault ? { [DEFAULT_MODEL_META_KEY]: true } : undefined;
}

/**
 * Whether a model's open `_meta` bag marks it as the default model, ignoring values of the
 * wrong type.
 */
export function readAgentModelIsDefault(model: IAgentModelInfo | SessionModelInfo): boolean {
	return model._meta?.[DEFAULT_MODEL_META_KEY] === true;
}
