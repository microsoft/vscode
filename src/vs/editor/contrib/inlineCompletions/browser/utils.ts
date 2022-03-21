/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, IReference } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';

export function createDisposableRef<T>(object: T, disposable?: IDisposable): IReference<T> {
	return {
		object,
		dispose: () => disposable?.dispose(),
	};
}

export function applyEdits(text: string, edits: { range: IRange; text: string }[]): string {
	const transformer = new PositionOffsetTransformer(text);
	const offsetEdits = edits.map(e => {
		const range = Range.lift(e.range);
		return ({
			startOffset: transformer.getOffset(range.getStartPosition()),
			endOffset: transformer.getOffset(range.getEndPosition()),
			text: e.text
		});
	});

	offsetEdits.sort((a, b) => b.startOffset - a.startOffset);

	for (const edit of offsetEdits) {
		text = text.substring(0, edit.startOffset) + edit.text + text.substring(edit.endOffset);
	}

	return text;
}

class PositionOffsetTransformer {
	private readonly lineStartOffsetByLineIdx: number[];

	constructor(text: string) {
		this.lineStartOffsetByLineIdx = [];
		this.lineStartOffsetByLineIdx.push(0);
		for (let i = 0; i < text.length; i++) {
			if (text.charAt(i) === '\n') {
				this.lineStartOffsetByLineIdx.push(i + 1);
			}
		}
	}

	getOffset(position: Position): number {
		return this.lineStartOffsetByLineIdx[position.lineNumber - 1] + position.column - 1;
	}
}

const array: ReadonlyArray<any> = [];
export function getReadonlyEmptyArray<T>(): readonly T[] {
	return array;
}
