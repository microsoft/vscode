/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Lazy } from '../../../../../util/vs/base/common/lazy';
import { StringEdit, StringReplacement } from '../../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../../util/vs/editor/common/core/ranges/offsetRange';
import { TextLength } from '../../../../../util/vs/editor/common/core/text/textLength';

export abstract class StringFragment {
	abstract get length(): number;

	abstract get textLength(): TextLength;

	abstract get text(): string;

	toString() { return this.text; }

	toEditFromOriginal(originalLength: number): StringEdit {
		const replacements: StringReplacement[] = [];
		let lastOriginalIdx = 0;
		let text = '';

		function emit(originalPos: number) {
			if (lastOriginalIdx !== originalPos || text.length > 0) {
				replacements.push(new StringReplacement(
					new OffsetRange(lastOriginalIdx, originalPos),
					text
				));
				text = '';
			}
		}

		function process(fragment: StringFragment) {
			if (fragment instanceof ConcatenatedStringFragment) {
				for (const f of fragment.fragments) {
					process(f);
				}
			} else if (fragment instanceof LiteralStringFragment) {
				text += fragment.text;
			} else if (fragment instanceof OriginalStringFragment) {
				emit(fragment.range.start);
				lastOriginalIdx = fragment.range.endExclusive;
			}
		}

		process(this);
		emit(originalLength);
		return new StringEdit(replacements);
	}
}

export class LiteralStringFragment extends StringFragment {
	constructor(
		public readonly text: string
	) {
		super();
	}

	get length(): number { return this.text.length; }

	private readonly _textLength = new Lazy(() => TextLength.ofText(this.text));

	get textLength() { return this._textLength.value; }
}

export class OriginalStringFragment extends StringFragment {
	constructor(
		public readonly range: OffsetRange,
		public readonly originalText: string
	) {
		super();
	}

	get length(): number { return this.range.length; }

	get text(): string { return this.range.substring(this.originalText); }

	trimStart(): OriginalStringFragment {
		const trimmed = this.text.trimStart();
		if (trimmed.length === this.length) { return this; }
		return new OriginalStringFragment(new OffsetRange(this.range.endExclusive - trimmed.length, this.range.endExclusive), this.originalText);
	}

	trimEnd(): OriginalStringFragment {
		const trimmed = this.text.trimEnd();
		if (trimmed.length === this.length) { return this; }
		return new OriginalStringFragment(new OffsetRange(this.range.start, this.range.start + trimmed.length), this.originalText);
	}

	startsWith(str: string): boolean { return this.text.startsWith(str); }
	endsWith(str: string): boolean { return this.text.endsWith(str); }

	tryJoin(other: OriginalStringFragment): OriginalStringFragment | null {
		if (this.range.endExclusive === other.range.start) {
			return new OriginalStringFragment(new OffsetRange(this.range.start, other.range.endExclusive), this.originalText);
		}
		return null;
	}

	private readonly _textLength = new Lazy(() => TextLength.ofSubstr(this.originalText, this.range));

	get textLength() { return this._textLength.value; }
}

export class ConcatenatedStringFragment extends StringFragment {
	static from(result: StringFragment[]): StringFragment {
		if (result.length === 0) {
			return new LiteralStringFragment('');
		}
		if (result.length === 1) {
			return result[0];
		}
		return new ConcatenatedStringFragment(result);
	}

	readonly length = this.fragments.reduce((prev, cur) => prev + cur.length, 0);

	constructor(
		public readonly fragments: readonly StringFragment[]
	) {
		super();
	}

	get text(): string {
		return this.fragments.map(f => f.text).join('');
	}

	private readonly _textLength = new Lazy(() => TextLength.sum(this.fragments, f => f.textLength));

	get textLength() { return this._textLength.value; }
}

export function pushFragment(fragments: StringFragment[], fragment: StringFragment): void {
	if (fragment.length === 0) { return; }
	const last = fragments[fragments.length - 1];
	if (last && last instanceof OriginalStringFragment && fragment instanceof OriginalStringFragment) {
		const joined = last.tryJoin(fragment);
		if (joined) {
			fragments[fragments.length - 1] = joined;
			return;
		}
	}
	fragments.push(fragment);
}
