/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionModelInfo } from '../../state/protocol/state.js';
import type { IAgentModelInfo } from '../../agent.js';

const VSCODE_ENSEMBLE_META_KEY = 'vscode.chat.ensemble';

export function withAgentModelEnsembleMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
	return { ...meta, [VSCODE_ENSEMBLE_META_KEY]: true };
}

export function readAgentModelEnsembleMeta(model: IAgentModelInfo | SessionModelInfo): boolean {
	return model._meta?.[VSCODE_ENSEMBLE_META_KEY] === true;
}
