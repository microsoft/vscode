/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { InlayHint, InlayHintList, InlayHintsProvider, InlayHintsProviderRegistry } from 'vs/editor/common/languages';
import { ITextModel, IWordAtPosition } from 'vs/editor/common/model';

export class InlayHintAnchor {
	constructor(public range: Range, readonly direction: 'before' | 'after', readonly usesWordRange: boolean) { }
}

export class InlayHintItem {

	readonly resolve: (token: CancellationToken) => Promise<void>;

	constructor(readonly hint: InlayHint, readonly anchor: InlayHintAnchor, provider: InlayHintsProvider) {
		if (!provider.resolveInlayHint) {
			this.resolve = async () => { };
		} else {
			let isResolved = false;
			this.resolve = async token => {
				if (isResolved) {
					return;
				}
				try {
					const newHint = await provider.resolveInlayHint!(this.hint, token);
					this.hint.tooltip = newHint?.tooltip ?? this.hint.tooltip;
					this.hint.label = newHint?.label ?? this.hint.label;
					isResolved = true;
				} catch (err) {
					onUnexpectedExternalError(err);
				}
			};
		}
	}
}

export class InlayHintsFragments {

	static async create(model: ITextModel, ranges: Range[], token: CancellationToken): Promise<InlayHintsFragments> {

		const data: [InlayHintList, InlayHintsProvider][] = [];

		const promises = InlayHintsProviderRegistry.ordered(model).reverse().map(provider => ranges.map(async range => {
			try {
				const result = await provider.provideInlayHints(model, range, token);
				if (result?.hints.length) {
					data.push([result, provider]);
				}
			} catch (err) {
				onUnexpectedExternalError(err);
			}
		}));

		await Promise.all(promises.flat());

		return new InlayHintsFragments(data, model);
	}

	private readonly _disposables = new DisposableStore();
	private readonly _onDidChange = new Emitter<void>();

	readonly onDidReceiveProviderSignal: Event<void> = this._onDidChange.event;
	readonly items: readonly InlayHintItem[];

	private constructor(data: [InlayHintList, InlayHintsProvider][], model: ITextModel) {
		const items: InlayHintItem[] = [];
		for (const [list, provider] of data) {
			this._disposables.add(list);
			for (let hint of list.hints) {

				// compute the range to which the item should be attached to
				let position = hint.position;
				let direction: 'before' | 'after' = 'before';
				let range = Range.fromPositions(position);
				let word = model.getWordAtPosition(position);
				let usesWordRange = false;
				if (word) {
					if (word.endColumn === position.column) {
						direction = 'after';
						usesWordRange = true;
						range = wordToRange(word, position.lineNumber);
					} else if (word.startColumn === position.column) {
						usesWordRange = true;
						range = wordToRange(word, position.lineNumber);
					}
				}

				items.push(new InlayHintItem(hint, new InlayHintAnchor(range, direction, usesWordRange), provider));
			}
			if (provider.onDidChangeInlayHints) {
				provider.onDidChangeInlayHints(this._onDidChange.fire, this._onDidChange, this._disposables);
			}
		}
		this.items = items.sort((a, b) => Position.compare(a.hint.position, b.hint.position));
	}

	dispose(): void {
		this._onDidChange.dispose();
		this._disposables.dispose();
	}
}

function wordToRange(word: IWordAtPosition, lineNumber: number): Range {
	return new Range(
		lineNumber,
		word.startColumn,
		lineNumber,
		word.endColumn
	);
}
