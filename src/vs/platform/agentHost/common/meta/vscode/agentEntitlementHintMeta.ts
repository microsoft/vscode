/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';

const entitlementKey = 'vscode.authentication.entitlement';

/** Client-observed account metadata used only to request discovery revalidation. */
export interface IAgentEntitlementHint {
	readonly trackingId: string;
	readonly sku: string;
}

export function readAgentEntitlementHint(source: { readonly _meta?: Record<string, unknown> }): IAgentEntitlementHint | undefined {
	const value = source._meta?.[entitlementKey];
	if (!isObject(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw.trackingId !== 'string' || !raw.trackingId.trim()
		|| typeof raw.sku !== 'string' || !raw.sku.trim()) {
		return undefined;
	}
	return { trackingId: raw.trackingId, sku: raw.sku };
}

export function agentEntitlementHintMeta(hint: IAgentEntitlementHint): Record<string, unknown> {
	return { [entitlementKey]: { ...hint } };
}
