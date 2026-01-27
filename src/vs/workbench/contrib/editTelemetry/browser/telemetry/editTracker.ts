/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableSignal, runOnChange, IReader } from '../../../../../base/common/observable.js';
import { AnnotatedStringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { TextModelEditSource } from '../../../../../editor/common/textModelEditSource.js';
import { IDocumentWithAnnotatedEdits, EditKeySourceData, EditSource } from '../helpers/documentWithAnnotatedEdits.js';

/**
 * Tracks a single document.
*/
export class DocumentEditSourceTracker<T = void> extends Disposable {
	private _edits: AnnotatedStringEdit<EditKeySourceData> = AnnotatedStringEdit.empty;
	private _pendingExternalEdits: AnnotatedStringEdit<EditKeySourceData> = AnnotatedStringEdit.empty;

	private readonly _update = observableSignal(this);
	private readonly _representativePerKey: Map<string, TextModelEditSource> = new Map();
	private readonly _sumAddedCharactersPerKey: Map</* key */string, number> = new Map();

	constructor(
		private readonly _doc: IDocumentWithAnnotatedEdits,
		public readonly data: T,
	) {
		super();

		this._register(runOnChange(this._doc.value, (_val, _prevVal, edits) => {
			const eComposed = AnnotatedStringEdit.compose(edits.map(e => e.edit));
			if (eComposed.replacements.every(e => e.data.source.category === 'external')) {
				if (this._edits.isEmpty()) {
					// Ignore initial external edits
				} else {
					// queue pending external edits
					this._pendingExternalEdits = this._pendingExternalEdits.compose(eComposed);
				}
			} else {
				if (!this._pendingExternalEdits.isEmpty()) {
					this._applyEdit(this._pendingExternalEdits);
					this._pendingExternalEdits = AnnotatedStringEdit.empty;
				}
				this._applyEdit(eComposed);
			}

			this._update.trigger(undefined);
		}));
	}

	private _applyEdit(e: AnnotatedStringEdit<EditKeySourceData>): void {
		for (const r of e.replacements) {
			let existing = this._sumAddedCharactersPerKey.get(r.data.key);
			if (existing === undefined) {
				existing = 0;
				this._representativePerKey.set(r.data.key, r.data.representative);
			}
			const newCount = existing + r.getNewLength();
			this._sumAddedCharactersPerKey.set(r.data.key, newCount);
		}

		this._edits = this._edits.compose(e);
	}

	async waitForQueue(): Promise<void> {
		await this._doc.waitForQueue();
	}

	public getTotalInsertedCharactersCount(key: string): number {
		const val = this._sumAddedCharactersPerKey.get(key);
		return val ?? 0;
	}

	public getAllKeys(): string[] {
		return Array.from(this._sumAddedCharactersPerKey.keys());
	}

	public getRepresentative(key: string): TextModelEditSource | undefined {
		return this._representativePerKey.get(key);
	}

	public getTrackedRanges(reader?: IReader): TrackedEdit[] {
		this._update.read(reader);
		const ranges = this._edits.getNewRanges();
		return ranges.map((r, idx) => {
			const e = this._edits.replacements[idx];
			const te = new TrackedEdit(e.replaceRange, r, e.data.key, e.data.source, e.data.representative);
			return te;
		});
	}

	public isEmpty(): boolean {
		return this._edits.isEmpty();
	}

	public _getDebugVisualization() {
		const ranges = this.getTrackedRanges();
		const txt = this._doc.value.get().value;

		return {
			...{ $fileExtension: 'text.w' },
			'value': txt,
			'decorations': ranges.map(r => {
				return {
					range: [r.range.start, r.range.endExclusive],
					color: r.source.getColor(),
				};
			})
		};
	}
}

export class TrackedEdit {
	constructor(
		public readonly originalRange: OffsetRange,
		public readonly range: OffsetRange,
		public readonly sourceKey: string,
		public readonly source: EditSource,
		public readonly sourceRepresentative: TextModelEditSource,
	) { }
}
