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

/**
 * Picks the single resource a path resolved to. A relative path present under several
 * workspace folders is ambiguous, and taking the first would open a file from a root the
 * response never mentioned.
 */
export function singleMatch(candidates: readonly (Uri | undefined)[]): Uri | undefined {
	const matches = candidates.filter((candidate): candidate is Uri => candidate !== undefined);
	return new Set(matches.map(match => match.toString())).size === 1 ? matches[0] : undefined;
}
