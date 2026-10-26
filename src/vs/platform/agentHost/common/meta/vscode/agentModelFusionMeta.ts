/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import type { SessionModelInfo } from '../../state/protocol/state.js';
import type { IAgentModelInfo } from '../../agent.js';

const VSCODE_FUSION_META_KEY = 'vscode.chat.fusion';

/** Marks the host's Auto model as presented as Copilot Fusion. */
export function withAgentModelFusionMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
	// An object, with the retired `balanceUsesHydraFusion` field, for clients that still read it.
	return { ...meta, [VSCODE_FUSION_META_KEY]: { balanceUsesHydraFusion: false } };
}

/** Whether the host presents its Auto model as Copilot Fusion. */
export function isAgentModelFusion(model: IAgentModelInfo | SessionModelInfo): boolean {
	return isObject(model._meta?.[VSCODE_FUSION_META_KEY]);
}
