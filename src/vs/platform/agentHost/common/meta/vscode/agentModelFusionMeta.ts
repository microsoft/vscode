/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import type { SessionModelInfo } from '../../state/protocol/state.js';
import type { IAgentModelInfo } from '../../agent.js';

const VSCODE_FUSION_META_KEY = 'vscode.chat.fusion';

/**
 * Marks the host's Auto model as presented as Copilot Fusion. `inlineChatTier` is the tier the host runs
 * Fusion at for editor and terminal inline chat, whatever effort level is selected, when it pins one.
 */
export function withAgentModelFusionMeta(meta: Record<string, unknown> | undefined, inlineChatTier?: string): Record<string, unknown> {
	// An object, with the retired `balanceUsesHydraFusion` field, for clients that still read it.
	return { ...meta, [VSCODE_FUSION_META_KEY]: { balanceUsesHydraFusion: false, ...(inlineChatTier !== undefined ? { inlineChatTier } : {}) } };
}

/** Whether the host presents its Auto model as Copilot Fusion. */
export function isAgentModelFusion(model: IAgentModelInfo | SessionModelInfo): boolean {
	return isObject(model._meta?.[VSCODE_FUSION_META_KEY]);
}

/**
 * The tier the host runs Copilot Fusion at for editor and terminal inline chat, whatever effort level is
 * selected, or `undefined` when the host pins none there, as older and other hosts do not.
 */
export function readAgentModelFusionInlineChatTier(model: IAgentModelInfo | SessionModelInfo): string | undefined {
	const fusion = model._meta?.[VSCODE_FUSION_META_KEY];
	if (!isObject(fusion)) {
		return undefined;
	}
	const { inlineChatTier }: { inlineChatTier?: unknown } = fusion;
	return typeof inlineChatTier === 'string' ? inlineChatTier : undefined;
}
