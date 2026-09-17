/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentInfoWithOffset } from '../prompt';
import { CursorContextInfo, getCursorContext } from './cursorContext';
import { WindowedMatcher } from './selectRelevance';
import { getBasicWindowDelineations } from './windowDelineations';

export class FixedWindowSizeJaccardMatcher extends WindowedMatcher {
	private windowLength: number;

	private constructor(referenceDoc: DocumentInfoWithOffset, windowLength: number) {
		super(referenceDoc);
		this.windowLength = windowLength;
	}

	static FACTORY = (windowLength: number) => {
		return {
			to: (referenceDoc: DocumentInfoWithOffset) => new FixedWindowSizeJaccardMatcher(referenceDoc, windowLength),
		};
	};

	protected id(): string {
		return 'fixed:' + this.windowLength;
	}

	protected getWindowsDelineations(lines: string[]): [number, number][] {
		return getBasicWindowDelineations(this.windowLength, lines);
	}

	protected _getCursorContextInfo(referenceDoc: DocumentInfoWithOffset): CursorContextInfo {
		return getCursorContext(referenceDoc, {
			maxLineCount: this.windowLength,
		});
	}

	protected similarityScore(a: Set<string>, b: Set<string>): number {
		return computeScore(a, b);
	}
}

/**
 * Compute the Jaccard metric of number of elements in the intersection
 * divided by number of elements in the union
 */
export function computeScore(a: Set<string>, b: Set<string>) {
	const intersection = new Set();
	a.forEach(x => {
		if (b.has(x)) {
			intersection.add(x);
		}
	});
	return intersection.size / (a.size + b.size - intersection.size);
}
