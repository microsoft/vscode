/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../../../base/common/types.js';

interface IHasCheckoutOperationMeta {
	readonly _meta?: Record<string, unknown>;
}

const TREEISH_META_KEY = 'treeish';
const PRE_CHECKOUT_ACTION_META_KEY = 'preCheckoutAction';
const DIRTY_WORKING_TREE_ERROR_REASON = 'dirtyWorkingTree';
const ERROR_REASON_KEY = 'reason';
const CREATE_BRANCH_META_KEY = 'vscode.createBranch';

/** Creates metadata for a Create Branch operation, without changing the checkout for worktree isolation. */
export function createBranchOperationMeta(branchName: string, startPoint: string, checkout: boolean): Record<string, unknown> {
	return { [CREATE_BRANCH_META_KEY]: { branchName, startPoint, checkout } };
}

function hasCreateBranchFields(value: unknown): value is { branchName: unknown; startPoint: unknown; checkout: unknown } {
	return typeof value === 'object' && value !== null && hasKey(value, { branchName: true, startPoint: true, checkout: true });
}

/** Reads the complete, typed input of a Create Branch operation. */
export function readCreateBranchOperationMeta(source: IHasCheckoutOperationMeta): { branchName: string; startPoint: string; checkout: boolean } | undefined {
	const value = source._meta?.[CREATE_BRANCH_META_KEY];
	if (!hasCreateBranchFields(value)) {
		return undefined;
	}
	return typeof value.branchName === 'string' && value.branchName.length > 0 && !value.branchName.startsWith('-')
		&& typeof value.startPoint === 'string' && value.startPoint.length > 0 && !value.startPoint.startsWith('-')
		&& typeof value.checkout === 'boolean'
		? { branchName: value.branchName, startPoint: value.startPoint, checkout: value.checkout }
		: undefined;
}

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
