/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findFirstIdxMonotonousOrArrLen, findLastIdxMonotonous } from '../../../../util/vs/base/common/arraysFind';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';

export function toAstNode<T>(
	node: T,
	fn: (node: T) => Omit<IAstNode, 'children' | 'range'> & { range: OffsetRange; children?: readonly T[] }
): IAstNode {
	const data = fn(node);
	return {
		...data,
		range: [data.range.start, data.range.endExclusive],
		children: data.children?.map(child => toAstNode(child, fn)),
	};
}

export interface IAstVisualization {
	source: ISource | string;
	root: IAstNode;
}

interface IAstNode {
	label: string;
	isMarked?: boolean;
	range: IOffsetRange;
	children?: IAstNode[];
}

interface ISource {
	value: string;
	decorations: { range: IOffsetRange; color: string }[];
}

type IOffsetRange = [start: number, endEx: number];


export function subtractRange(range: OffsetRange, ranges: OffsetRange[]): OffsetRange[] {
	// idx of first element that touches range or that is after range
	const joinRangeStartIdx = findFirstIdxMonotonousOrArrLen(ranges, r => r.endExclusive >= range.start);
	// idx of element after { last element that touches range or that is before range }
	const joinRangeEndIdxExclusive = findLastIdxMonotonous(ranges, r => r.start <= range.endExclusive) + 1;

	if (joinRangeStartIdx === joinRangeEndIdxExclusive) {
		return [range];
	}

	const result: OffsetRange[] = [];
	let start = range.start;
	for (let i = joinRangeStartIdx; i < joinRangeEndIdxExclusive; i++) {
		const r = ranges[i];
		if (r.start > start) {
			result.push(new OffsetRange(start, r.start));
		}
		start = r.endExclusive;
	}
	if (start < range.endExclusive) {
		result.push(new OffsetRange(start, range.endExclusive));
	}

	return result;
}
