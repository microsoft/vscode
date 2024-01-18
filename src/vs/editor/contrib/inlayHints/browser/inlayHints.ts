/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { CancellationError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { InlayHint, InlayHintList, InlayHintsProvider, Command } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';

export class InlayHintAnchor {
	constructor(readonly range: Range, readonly direction: 'before' | 'after') { }
}

export class InlayHintItem {

	private _isResolved: boolean = false;
	private _currentResolve?: Promise<void>;

	constructor(readonly hint: InlayHint, readonly anchor: InlayHintAnchor, readonly provider: InlayHintsProvider) { }

	with(delta: { anchor: InlayHintAnchor }): InlayHintItem {
		const result = new InlayHintItem(this.hint, delta.anchor, this.provider);
		result._isResolved = this._isResolved;
		result._currentResolve = this._currentResolve;
		return result;
	}

	async resolve(token: CancellationToken): Promise<void> {
		if (typeof this.provider.resolveInlayHint !== 'function') {
			return;
		}
		if (this._currentResolve) {
			// wait for an active resolve operation and try again
			// when that's done.
			await this._currentResolve;
			if (token.isCancellationRequested) {
				return;
			}
			return this.resolve(token);
		}
		if (!this._isResolved) {
			this._currentResolve = this._doResolve(token)
				.finally(() => this._currentResolve = undefined);
		}
		await this._currentResolve;
	}

	private async _doResolve(token: CancellationToken) {
		try {
			const newHint = await Promise.resolve(this.provider.resolveInlayHint!(this.hint, token));
			this.hint.tooltip = newHint?.tooltip ?? this.hint.tooltip;
			this.hint.label = newHint?.label ?? this.hint.label;
			this.hint.textEdits = newHint?.textEdits ?? this.hint.textEdits;
			this._isResolved = true;
		} catch (err) {
			onUnexpectedExternalError(err);
			this._isResolved = false;
		}
	}
}

export class InlayHintsFragments {

	private static _emptyInlayHintList: InlayHintList = Object.freeze({ dispose() { }, hints: [] });

	static async create(registry: LanguageFeatureRegistry<InlayHintsProvider>, model: ITextModel, ranges: Range[], token: CancellationToken): Promise<InlayHintsFragments> {

		const data: [InlayHintList, InlayHintsProvider][] = [];

		const promises = registry.ordered(model).reverse().map(provider => ranges.map(async range => {
			try {
				const result = await provider.provideInlayHints(model, range, token);
				if (result?.hints.length || provider.onDidChangeInlayHints) {
					data.push([result ?? InlayHintsFragments._emptyInlayHintList, provider]);
				}
			} catch (err) {
				onUnexpectedExternalError(err);
			}
		}));

		await Promise.all(promises.flat());

		if (token.isCancellationRequested || model.isDisposed()) {
			throw new CancellationError();
		}

		return new InlayHintsFragments(ranges, data, model);
	}

	private readonly _disposables = new DisposableStore();

	readonly items: readonly InlayHintItem[];
	readonly ranges: readonly Range[];
	readonly provider: Set<InlayHintsProvider>;

	private constructor(ranges: Range[], data: [InlayHintList, InlayHintsProvider][], model: ITextModel) {
		this.ranges = ranges;
		this.provider = new Set();
		const items: InlayHintItem[] = [];
		for (const [list, provider] of data) {
			this._disposables.add(list);
			this.provider.add(provider);

			for (const hint of list.hints) {
				// compute the range to which the item should be attached to
				const position = model.validatePosition(hint.position);
				let direction: 'before' | 'after' = 'before';

				const wordRange = InlayHintsFragments._getRangeAtPosition(model, position);
				let range: Range;

				if (wordRange.getStartPosition().isBefore(position)) {
					range = Range.fromPositions(wordRange.getStartPosition(), position);
					direction = 'after';
				} else {
					range = Range.fromPositions(position, wordRange.getEndPosition());
					direction = 'before';
				}

				items.push(new InlayHintItem(hint, new InlayHintAnchor(range, direction), provider));
			}
		}
		this.items = items.sort((a, b) => Position.compare(a.hint.position, b.hint.position));
	}

	dispose(): void {
		this._disposables.dispose();
	}

	private static _getRangeAtPosition(model: ITextModel, position: IPosition): Range {
		const line = position.lineNumber;
		const word = model.getWordAtPosition(position);
		if (word) {
			// always prefer the word range
			return new Range(line, word.startColumn, line, word.endColumn);
		}

		model.tokenization.tokenizeIfCheap(line);
		const tokens = model.tokenization.getLineTokens(line);
		const offset = position.column - 1;
		const idx = tokens.findTokenIndexAtOffset(offset);

		let start = tokens.getStartOffset(idx);
		let end = tokens.getEndOffset(idx);

		if (end - start === 1) {
			// single character token, when at its end try leading/trailing token instead
			if (start === offset && idx > 1) {
				// leading token
				start = tokens.getStartOffset(idx - 1);
				end = tokens.getEndOffset(idx - 1);
			} else if (end === offset && idx < tokens.getCount() - 1) {
				// trailing token
				start = tokens.getStartOffset(idx + 1);
				end = tokens.getEndOffset(idx + 1);
			}
		}

		return new Range(line, start + 1, line, end + 1);
	}
}

export function asCommandLink(command: Command): string {
	return URI.from({
		scheme: Schemas.command,
		path: command.id,
		query: command.arguments && encodeURIComponent(JSON.stringify(command.arguments))
	}).toString();
}
