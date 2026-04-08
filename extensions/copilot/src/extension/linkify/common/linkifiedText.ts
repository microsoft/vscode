/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Location, SymbolInformation, Uri } from '../../../vscodeTypes';

export class LinkifyLocationAnchor {
	constructor(
		public readonly value: Uri | Location,
		public readonly title?: string
	) { }
}

export class LinkifySymbolAnchor {
	constructor(
		public readonly symbolInformation: SymbolInformation,
		public readonly resolve?: (token: CancellationToken) => Promise<SymbolInformation>,
	) { }
}

export type LinkifiedPart = string | LinkifyLocationAnchor | LinkifySymbolAnchor;

export interface LinkifiedText {
	readonly parts: readonly LinkifiedPart[];
}

/**
 * Coalesces adjacent string parts into a single string part.
 */
export function coalesceParts(parts: readonly LinkifiedPart[]): LinkifiedPart[] {
	const out: LinkifiedPart[] = [];

	for (const part of parts) {
		const previous = out.at(-1);
		if (typeof part === 'string' && typeof previous === 'string') {
			out[out.length - 1] = previous + part;
		} else {
			out.push(part);
		}
	}

	return out;
}
