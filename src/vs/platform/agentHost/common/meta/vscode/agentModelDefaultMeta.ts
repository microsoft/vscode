/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionModelInfo } from '../../state/protocol/state.js';
import type { IAgentModelInfo } from '../../agent.js';

/**
 * VS Code-owned model metadata marking the model an agent runs when a session selects none.
 * The protocol defines no order for an agent's models, so a client must not infer a default
 * from their position.
 */
export const VSCODE_DEFAULT_MODEL_META_KEY = 'vscode.defaultModel';

/** Builds the `_meta` payload marking a model as the one its agent runs when a session selects none. */
export function createAgentModelDefaultMeta(): Record<string, unknown> {
	return { [VSCODE_DEFAULT_MODEL_META_KEY]: true };
}

/** Whether a model is marked as its agent's default, ignoring any value other than `true`. */
export function readAgentModelIsDefault(model: IAgentModelInfo | SessionModelInfo): boolean {
	return model._meta?.[VSCODE_DEFAULT_MODEL_META_KEY] === true;
}
