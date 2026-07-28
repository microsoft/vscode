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
import { IExternalEditCorrelation } from './agentHostEditMarkerService.js';

const EXTERNAL_OBSERVATION_KEY_PREFIX = 'external-observation:';

/**
 * Tracks a single document.
*/
export class DocumentEditSourceTracker<T = void> extends Disposable {
	private _edits: AnnotatedStringEdit<EditKeySourceData> = AnnotatedStringEdit.empty;
	private _pendingExternalEdits: AnnotatedStringEdit<EditKeySourceData> = AnnotatedStringEdit.empty;

	private readonly _update = observableSignal(this);
	private readonly _representativePerKey: Map<string, TextModelEditSource> = new Map();
	private readonly _sumAddedCharactersPerKey: Map</* key */string, number> = new Map();
	private readonly _externalObservationIds = new Set<string>();
	private readonly _ignoredInitialExternalObservationIds = new Set<string>();
	private readonly _suppressedExternalObservationIds = new Set<string>();
	private readonly _invalidatedExternalObservationIds = new Set<string>();

	constructor(
		private readonly _doc: IDocumentWithAnnotatedEdits,
		public readonly data: T,
		private readonly _externalEditCorrelation?: IExternalEditCorrelation,
	) {
		super();

		this._register(runOnChange(this._doc.value, (_val, _prevVal, edits) => {
			let eComposed = AnnotatedStringEdit.compose(edits.map(e => e.edit));
			if (eComposed.replacements.every(e => e.data.source.category === 'external')) {
				if (this._edits.isEmpty() && !this._externalEditCorrelation) {
					// Ignore initial external edits
				} else {
					if (this._externalEditCorrelation) {
						const observationId = this._externalEditCorrelation.register(_prevVal.value, _val.value);
						this._externalObservationIds.add(observationId);
						if (this._externalEditCorrelation.isSuppressed(observationId)) {
							this._suppressedExternalObservationIds.add(observationId);
						}
						if (this._edits.isEmpty()) {
							this._ignoredInitialExternalObservationIds.add(observationId);
						}
						const key = `${EXTERNAL_OBSERVATION_KEY_PREFIX}${observationId}`;
						eComposed = eComposed.mapData(replacement => new EditKeySourceData(key, replacement.data.source, replacement.data.representative));
					}
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
		if (this._externalEditCorrelation) {
			this._register(this._externalEditCorrelation.onDidSuppress(observationId => {
				if (this._externalObservationIds.has(observationId)) {
					this._suppressedExternalObservationIds.add(observationId);
					this._update.trigger(undefined);
				}
			}));
			this._register(this._externalEditCorrelation.onDidInvalidate(observationId => {
				if (this._externalObservationIds.has(observationId)) {
					this._suppressedExternalObservationIds.delete(observationId);
					this._invalidatedExternalObservationIds.add(observationId);
					this._update.trigger(undefined);
				}
			}));
		}
	}

	public releaseExternalEditCorrelations(): void {
		for (const observationId of this._externalObservationIds) {
			this._externalEditCorrelation?.release(observationId);
		}
		this._externalObservationIds.clear();
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

	public getTotalInsertedCharactersCount(key: string, includeSuppressed = false): number {
		if (!this._shouldIncludeKey(key, includeSuppressed)) {
			return 0;
		}
		const val = this._sumAddedCharactersPerKey.get(key);
		return val ?? 0;
	}

	public getAllKeys(includeSuppressed = false): string[] {
		return Array.from(this._sumAddedCharactersPerKey.keys()).filter(key => this._shouldIncludeKey(key, includeSuppressed));
	}

	public getRepresentative(key: string): TextModelEditSource | undefined {
		return this._representativePerKey.get(key);
	}

	public applyPendingExternalEdits(): void {
		if (this._pendingExternalEdits.isEmpty()) {
			return;
		}
		this._applyEdit(this._pendingExternalEdits);
		this._pendingExternalEdits = AnnotatedStringEdit.empty;
		this._update.trigger(undefined);
	}

	public getTrackedRanges(reader?: IReader, includeSuppressed = false): TrackedEdit[] {
		this._update.read(reader);
		const ranges = this._edits.getNewRanges();
		return ranges.map((r, idx) => {
			const e = this._edits.replacements[idx];
			const te = new TrackedEdit(e.replaceRange, r, e.data.key, e.data.source, e.data.representative);
			return te;
		}).filter(edit => this._shouldIncludeKey(edit.sourceKey, includeSuppressed));
	}

	public isEmpty(): boolean {
		return this.getAllKeys().length === 0;
	}

	private _shouldIncludeKey(key: string, includeSuppressed: boolean): boolean {
		if (!key.startsWith(EXTERNAL_OBSERVATION_KEY_PREFIX)) {
			return true;
		}
		const observationId = key.substring(EXTERNAL_OBSERVATION_KEY_PREFIX.length);
		if (this._invalidatedExternalObservationIds.has(observationId)) {
			return true;
		}
		const isSuppressed = this._suppressedExternalObservationIds.has(observationId);
		if (this._ignoredInitialExternalObservationIds.has(observationId)) {
			return includeSuppressed && isSuppressed;
		}
		return includeSuppressed || !isSuppressed;
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
