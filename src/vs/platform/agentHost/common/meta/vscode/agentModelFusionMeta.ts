/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import type { SessionModelInfo } from '../../state/protocol/state.js';
import type { IAgentModelInfo } from '../../agent.js';

const VSCODE_FUSION_META_KEY = 'vscode.chat.fusion';

/** How the host presents its Auto model as Fusion. */
export interface IAgentModelFusionMeta {
	readonly balanceUsesHydraFusion: boolean;
	readonly nativeAutoTiers?: boolean;
}

export function withAgentModelFusionMeta(meta: Record<string, unknown> | undefined, fusion: IAgentModelFusionMeta): Record<string, unknown> {
	return { ...meta, [VSCODE_FUSION_META_KEY]: { balanceUsesHydraFusion: fusion.balanceUsesHydraFusion, ...(fusion.nativeAutoTiers ? { nativeAutoTiers: true } : {}) } };
}

export function readAgentModelFusionMeta(model: IAgentModelInfo | SessionModelInfo): IAgentModelFusionMeta | undefined {
	const value = model._meta?.[VSCODE_FUSION_META_KEY];
	const balanceUsesHydraFusion = isObject(value) ? (value as { balanceUsesHydraFusion?: unknown }).balanceUsesHydraFusion : undefined;
	const nativeAutoTiers = isObject(value) ? (value as { nativeAutoTiers?: unknown }).nativeAutoTiers : undefined;
	return typeof balanceUsesHydraFusion === 'boolean' ? { balanceUsesHydraFusion, ...(nativeAutoTiers === true ? { nativeAutoTiers: true } : {}) } : undefined;
}
