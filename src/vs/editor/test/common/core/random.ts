/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { numberComparator } from 'vs/base/common/arrays';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { Position } from 'vs/editor/common/core/position';
import { PositionOffsetTransformer } from 'vs/editor/common/core/positionToOffset';
import { Range } from 'vs/editor/common/core/range';
import { AbstractText, SingleTextEdit, TextEdit } from 'vs/editor/common/core/textEdit';

export abstract class Random {
	public static basicAlphabet: string = '      abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	public static basicAlphabetMultiline: string = '      \n\n\nabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

	public static create(seed: number): Random {
		return new MersenneTwister(seed);
	}

	public abstract nextIntRange(start: number, endExclusive: number): number;

	public nextString(length: number, alphabet = Random.basicAlphabet): string {
		let randomText: string = '';
		for (let i = 0; i < length; i++) {
			const characterIndex = this.nextIntRange(0, alphabet.length);
			randomText += alphabet.charAt(characterIndex);
		}
		return randomText;
	}

	public nextMultiLineString(lineCount: number, lineLengthRange: OffsetRange, alphabet = Random.basicAlphabet): string {
		const lines: string[] = [];
		for (let i = 0; i < lineCount; i++) {
			const lineLength = this.nextIntRange(lineLengthRange.start, lineLengthRange.endExclusive);
			lines.push(this.nextString(lineLength, alphabet));
		}
		return lines.join('\n');
	}

	public nextConsecutivePositions(source: AbstractText, count: number): Position[] {
		const t = new PositionOffsetTransformer(source.getValue());
		const offsets = OffsetRange.ofLength(count).map(() => this.nextIntRange(0, t.text.length));
		offsets.sort(numberComparator);
		return offsets.map(offset => t.getPosition(offset));
	}

	public nextRange(source: AbstractText): Range {
		const [start, end] = this.nextConsecutivePositions(source, 2);
		return Range.fromPositions(start, end);
	}

	public nextTextEdit(target: AbstractText, singleTextEditCount: number): TextEdit {
		const singleTextEdits: SingleTextEdit[] = [];

		const positions = this.nextConsecutivePositions(target, singleTextEditCount * 2);

		for (let i = 0; i < singleTextEditCount; i++) {
			const start = positions[i * 2];
			const end = positions[i * 2 + 1];
			const newText = this.nextString(end.column - start.column, Random.basicAlphabetMultiline);
			singleTextEdits.push(new SingleTextEdit(Range.fromPositions(start, end), newText));
		}

		return new TextEdit(singleTextEdits).normalize();
	}
}

class MersenneTwister extends Random {
	private readonly mt = new Array(624);
	private index = 0;

	constructor(seed: number) {
		super();

		this.mt[0] = seed >>> 0;
		for (let i = 1; i < 624; i++) {
			const s = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
			this.mt[i] = (((((s & 0xffff0000) >>> 16) * 0x6c078965) << 16) + (s & 0x0000ffff) * 0x6c078965 + i) >>> 0;
		}
	}

	private _nextInt() {
		if (this.index === 0) {
			this.generateNumbers();
		}

		let y = this.mt[this.index];
		y = y ^ (y >>> 11);
		y = y ^ ((y << 7) & 0x9d2c5680);
		y = y ^ ((y << 15) & 0xefc60000);
		y = y ^ (y >>> 18);

		this.index = (this.index + 1) % 624;

		return y >>> 0;
	}

	public nextIntRange(start: number, endExclusive: number) {
		const range = endExclusive - start;
		return Math.floor(this._nextInt() / (0x100000000 / range)) + start;
	}

	private generateNumbers() {
		for (let i = 0; i < 624; i++) {
			const y = (this.mt[i] & 0x80000000) + (this.mt[(i + 1) % 624] & 0x7fffffff);
			this.mt[i] = this.mt[(i + 397) % 624] ^ (y >>> 1);
			if ((y % 2) !== 0) {
				this.mt[i] = this.mt[i] ^ 0x9908b0df;
			}
		}
	}
}
