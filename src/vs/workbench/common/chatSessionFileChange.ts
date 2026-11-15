/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../base/common/uri.js';

export interface IChatSessionFileChange {
	readonly modifiedUri: URI;
	readonly originalUri?: URI;
	readonly insertions: number;
	readonly deletions: number;
	readonly reviewed?: boolean;
}

export interface IChatSessionFileChange2 {
	readonly uri: URI;
	readonly originalUri?: URI;
	readonly modifiedUri?: URI;
	readonly insertions: number;
	readonly deletions: number;
	readonly reviewed?: boolean;
}

export function isIChatSessionFileChange2(obj: unknown): obj is IChatSessionFileChange2 {
	const candidate = obj as IChatSessionFileChange2;
	return candidate && candidate.uri instanceof URI && typeof candidate.insertions === 'number' && typeof candidate.deletions === 'number';
}
