/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A failed content load with recovery scoped to recorded history or live interaction. */
export interface IChatSessionHistoryStatus {
	readonly kind: 'history' | 'live';
	readonly message: string;
	readonly action: { readonly label: string; readonly run: () => Promise<void> };
}
