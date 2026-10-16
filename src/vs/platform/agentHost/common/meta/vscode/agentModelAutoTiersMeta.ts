/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import type { SessionModelInfo } from '../../state/protocol/state.js';
import type { IAgentModelInfo } from '../../agent.js';

const VSCODE_AUTO_TIERS_META_KEY = 'vscode.chat.autoTiers';

/** One Auto tier the picker lists, in the provider's order. */
export interface IAgentModelAutoTier {
	readonly id: string;
	readonly label: string;
	/** `false` when the provider lists the tier but does not let this account select it. */
	readonly enabled: boolean;
	/** Why the tier is unavailable, from the provider. */
	readonly message?: string;
}

/**
 * The provider's Auto tiers for the picker, including ones it lists as unavailable. The model's
 * `tier` schema `enum` holds only the selectable ones, so clients that do not read this keep
 * working; clients that do can show the unavailable ones as disabled.
 */
export interface IAgentModelAutoTiersMeta {
	readonly tiers: readonly IAgentModelAutoTier[];
}

export function withAgentModelAutoTiersMeta(meta: Record<string, unknown> | undefined, autoTiers: IAgentModelAutoTiersMeta): Record<string, unknown> {
	return {
		...meta,
		[VSCODE_AUTO_TIERS_META_KEY]: {
			tiers: autoTiers.tiers.map(tier => ({ id: tier.id, label: tier.label, enabled: tier.enabled, ...(tier.message ? { message: tier.message } : {}) })),
		},
	};
}

export function readAgentModelAutoTiersMeta(model: IAgentModelInfo | SessionModelInfo): IAgentModelAutoTiersMeta | undefined {
	const value = model._meta?.[VSCODE_AUTO_TIERS_META_KEY];
	const tiers = isObject(value) ? (value as { tiers?: unknown }).tiers : undefined;
	if (!Array.isArray(tiers)) {
		return undefined;
	}
	const result: IAgentModelAutoTier[] = [];
	for (const tier of tiers) {
		if (!isObject(tier)) {
			return undefined;
		}
		const { id, label, enabled, message } = tier as { id?: unknown; label?: unknown; enabled?: unknown; message?: unknown };
		if (typeof id !== 'string' || !id || typeof label !== 'string' || typeof enabled !== 'boolean' || (message !== undefined && typeof message !== 'string')) {
			return undefined;
		}
		result.push({ id, label, enabled, ...(message ? { message } : {}) });
	}
	return { tiers: result };
}
