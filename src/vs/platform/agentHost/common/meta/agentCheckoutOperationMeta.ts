/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../../base/common/types.js';

interface IHasCheckoutOperationMeta {
	readonly _meta?: Record<string, unknown>;
}

const TREEISH_META_KEY = 'treeish';
const PRE_CHECKOUT_ACTION_META_KEY = 'preCheckoutAction';
const DIRTY_WORKING_TREE_ERROR_REASON = 'dirtyWorkingTree';
const ERROR_REASON_KEY = 'reason';

export const enum CheckoutOperationPreAction {
	Stash = 'stash',
	Commit = 'commit',
}

/** Creates request metadata for a Checkout changeset operation. */
export function checkoutOperationMeta(treeish: string, preCheckoutAction?: CheckoutOperationPreAction): Record<string, unknown> {
	return {
		[TREEISH_META_KEY]: treeish,
		...(preCheckoutAction
			? { [PRE_CHECKOUT_ACTION_META_KEY]: preCheckoutAction }
			: {}),
	};
}

/** Reads and validates the treeish requested by a Checkout changeset operation. */
export function readCheckoutOperationTreeish(source: IHasCheckoutOperationMeta): string | undefined {
	const meta = source._meta;
	if (!meta) {
		return undefined;
	}
	const treeish = meta[TREEISH_META_KEY];
	return typeof treeish === 'string' && treeish.length > 0 ? treeish : undefined;
}

/** Reads and validates the action requested before a Checkout changeset operation. */
export function readCheckoutOperationPreAction(source: IHasCheckoutOperationMeta): CheckoutOperationPreAction | undefined {
	const meta = source._meta;
	if (!meta) {
		return undefined;
	}
	const preCheckoutAction = meta[PRE_CHECKOUT_ACTION_META_KEY];
	return preCheckoutAction === CheckoutOperationPreAction.Stash || preCheckoutAction === CheckoutOperationPreAction.Commit
		? preCheckoutAction
		: undefined;
}

/** Creates structured error data for a Checkout operation blocked by a dirty working tree. */
export function checkoutOperationDirtyWorkingTreeErrorData(): Record<string, unknown> {
	return { [ERROR_REASON_KEY]: DIRTY_WORKING_TREE_ERROR_REASON };
}

function hasErrorReason(data: unknown): data is { readonly reason: unknown } {
	return typeof data === 'object' && data !== null && hasKey(data, { reason: true });
}

/** Returns whether error data identifies a Checkout operation blocked by a dirty working tree. */
export function isCheckoutOperationDirtyWorkingTreeErrorData(data: unknown): boolean {
	return hasErrorReason(data) && data.reason === DIRTY_WORKING_TREE_ERROR_REASON;
}
