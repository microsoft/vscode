/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IHasCheckoutOperationMeta {
	readonly _meta?: Record<string, unknown>;
}

const TREEISH_META_KEY = 'treeish';

/** Creates request metadata for a Checkout changeset operation. */
export function checkoutOperationMeta(treeish: string): Record<string, unknown> {
	return { [TREEISH_META_KEY]: treeish };
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
