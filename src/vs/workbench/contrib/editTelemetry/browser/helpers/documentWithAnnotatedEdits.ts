/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncReader, AsyncReaderEndOfStream } from '../../../../../base/common/async.js';
import { CachedFunction } from '../../../../../base/common/cache.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservableWithChange, ISettableObservable, observableValue, runOnChange } from '../../../../../base/common/observable.js';
import { AnnotatedStringEdit, IEditData, StringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { TextModelEditSource } from '../../../../../editor/common/textModelEditSource.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IObservableDocument } from './observableWorkspace.js';
import { iterateObservableChanges, mapObservableDelta } from './utils.js';

export interface IDocumentWithAnnotatedEdits<TEditData extends IEditData<TEditData> = EditKeySourceData> {
	readonly value: IObservableWithChange<StringText, { edit: AnnotatedStringEdit<TEditData> }>;
	waitForQueue(): Promise<void>;
}

/**
 * Creates a document that is a delayed copy of the original document,
 * but with edits annotated with the source of the edit.
*/
export class DocumentWithSourceAnnotatedEdits extends Disposable implements IDocumentWithAnnotatedEdits<EditSourceData> {
	public readonly value: IObservableWithChange<StringText, { edit: AnnotatedStringEdit<EditSourceData> }>;

	constructor(private readonly _originalDoc: IObservableDocument) {
		super();

		const v = this.value = observableValue(this, _originalDoc.value.get());

		this._register(runOnChange(this._originalDoc.value, (val, _prevVal, edits) => {
			const eComposed = AnnotatedStringEdit.compose(edits.map(e => {
				const editSourceData = new EditSourceData(e.reason);
				return e.mapData(() => editSourceData);
			}));

			v.set(val, undefined, { edit: eComposed });
		}));
	}

	public waitForQueue(): Promise<void> {
		return Promise.resolve();
	}
}

/**
 * Only joins touching edits if the source and the metadata is the same (e.g. requestUuids must be equal).
*/
export class EditSourceData implements IEditData<EditSourceData> {
	public readonly source;
	public readonly key;

	constructor(
		public readonly editSource: TextModelEditSource
	) {
		this.key = this.editSource.toKey(1);
		this.source = EditSourceBase.create(this.editSource);
	}

	join(data: EditSourceData): EditSourceData | undefined {
		if (this.editSource !== data.editSource) {
			return undefined;
		}
		return this;
	}

	toEditSourceData(): EditKeySourceData {
		return new EditKeySourceData(this.key, this.source, this.editSource);
	}
}

export class EditKeySourceData implements IEditData<EditKeySourceData> {
	constructor(
		public readonly key: string,
		public readonly source: EditSource,
		public readonly representative: TextModelEditSource,
	) { }

	join(data: EditKeySourceData): EditKeySourceData | undefined {
		if (this.key !== data.key) {
			return undefined;
		}
		if (this.source !== data.source) {
			return undefined;
		}
		// The representatives could be different! (But equal modulo key)
		return this;
	}
}

export abstract class EditSourceBase {
	private static _cache = new CachedFunction({ getCacheKey: v => v.toString() }, (arg: EditSource) => arg);

	public static create(reason: TextModelEditSource): EditSource {
		const data = reason.metadata;
		switch (data.source) {
			case 'reloadFromDisk':
				return this._cache.get(new ExternalEditSource());
			case 'inlineCompletionPartialAccept':
			case 'inlineCompletionAccept': {
				const type = 'type' in data ? data.type : undefined;
				if ('$nes' in data && data.$nes) {
					return this._cache.get(new InlineSuggestEditSource('nes', data.$extensionId ?? '', data.$providerId ?? '', type));
				}
				return this._cache.get(new InlineSuggestEditSource('completion', data.$extensionId ?? '', data.$providerId ?? '', type));
			}
			case 'snippet':
				return this._cache.get(new IdeEditSource('suggest'));
			case 'unknown':
				if (!data.name) {
					return this._cache.get(new UnknownEditSource());
				}
				switch (data.name) {
					case 'formatEditsCommand':
						return this._cache.get(new IdeEditSource('format'));
				}
				return this._cache.get(new UnknownEditSource());

			case 'Chat.applyEdits':
				return this._cache.get(new ChatEditSource('sidebar'));
			case 'inlineChat.applyEdits':
				return this._cache.get(new ChatEditSource('inline'));
			case 'cursor':
				return this._cache.get(new UserEditSource());
			default:
				return this._cache.get(new UnknownEditSource());
		}
	}

	public abstract getColor(): string;
}

export type EditSource = InlineSuggestEditSource | ChatEditSource | IdeEditSource | UserEditSource | UnknownEditSource | ExternalEditSource;

export class InlineSuggestEditSource extends EditSourceBase {
	public readonly category = 'ai';
	public readonly feature = 'inlineSuggest';
	constructor(
		public readonly kind: 'completion' | 'nes',
		public readonly extensionId: string,
		public readonly providerId: string,
		public readonly type: 'word' | 'line' | undefined,
	) { super(); }

	override toString() { return `${this.category}/${this.feature}/${this.kind}/${this.extensionId}/${this.type}`; }

	public getColor(): string { return '#00ff0033'; }
}

class ChatEditSource extends EditSourceBase {
	public readonly category = 'ai';
	public readonly feature = 'chat';
	constructor(
		public readonly kind: 'sidebar' | 'inline',
	) { super(); }

	override toString() { return `${this.category}/${this.feature}/${this.kind}`; }

	public getColor(): string { return '#00ff0066'; }
}

class IdeEditSource extends EditSourceBase {
	public readonly category = 'ide';
	constructor(
		public readonly feature: 'suggest' | 'format' | string,
	) { super(); }

	override toString() { return `${this.category}/${this.feature}`; }

	public getColor(): string { return this.feature === 'format' ? '#0000ff33' : '#80808033'; }
}

class UserEditSource extends EditSourceBase {
	public readonly category = 'user';
	constructor() { super(); }

	override toString() { return this.category; }

	public getColor(): string { return '#d3d3d333'; }
}

/** Caused by external tools that trigger a reload from disk */
class ExternalEditSource extends EditSourceBase {
	public readonly category = 'external';
	constructor() { super(); }

	override toString() { return this.category; }

	public getColor(): string { return '#009ab254'; }
}

class UnknownEditSource extends EditSourceBase {
	public readonly category = 'unknown';
	constructor() { super(); }

	override toString() { return this.category; }

	public getColor(): string { return '#ff000033'; }
}

export class CombineStreamedChanges<TEditData extends (EditKeySourceData | EditSourceData) & IEditData<TEditData>> extends Disposable implements IDocumentWithAnnotatedEdits<TEditData> {
	private readonly _value: ISettableObservable<StringText, { edit: AnnotatedStringEdit<TEditData> }>;
	readonly value: IObservableWithChange<StringText, { edit: AnnotatedStringEdit<TEditData> }>;
	private readonly _runStore = this._register(new DisposableStore());
	private _runQueue: Promise<void> = Promise.resolve();

	private readonly _diffService: DiffService;

	constructor(
		private readonly _originalDoc: IDocumentWithAnnotatedEdits<TEditData>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._diffService = this._instantiationService.createInstance(DiffService);
		this.value = this._value = observableValue(this, _originalDoc.value.get());
		this._restart();

	}

	async _restart(): Promise<void> {
		this._runStore.clear();
		const iterator = iterateObservableChanges(this._originalDoc.value, this._runStore)[Symbol.asyncIterator]();
		const p = this._runQueue;
		this._runQueue = this._runQueue.then(() => this._run(iterator));
		await p;
	}

	private async _run(iterator: AsyncIterator<{ value: StringText; prevValue: StringText; change: { edit: AnnotatedStringEdit<TEditData> }[] }, any, any>) {
		const reader = new AsyncReader(iterator);
		while (true) {
			let peeked = await reader.peek();
			if (peeked === AsyncReaderEndOfStream) {
				return;
			} else if (isChatEdit(peeked)) {
				const first = peeked;

				let last = first;
				let chatEdit = AnnotatedStringEdit.empty as AnnotatedStringEdit<TEditData>;

				do {
					reader.readBufferedOrThrow();
					last = peeked;
					chatEdit = chatEdit.compose(AnnotatedStringEdit.compose(peeked.change.map(c => c.edit)));
					const peekedOrUndefined = await reader.peekTimeout(1000);
					if (!peekedOrUndefined) {
						break;
					}
					peeked = peekedOrUndefined;
				} while (peeked !== AsyncReaderEndOfStream && isChatEdit(peeked));

				if (!chatEdit.isEmpty()) {
					const data = chatEdit.replacements[0].data;
					const diffEdit = await this._diffService.computeDiff(first.prevValue.value, last.value.value);
					const edit = diffEdit.mapData(_e => data);
					this._value.set(last.value, undefined, { edit });
				}
			} else {
				reader.readBufferedOrThrow();
				const e = AnnotatedStringEdit.compose(peeked.change.map(c => c.edit));
				this._value.set(peeked.value, undefined, { edit: e });
			}
		}
	}

	async waitForQueue(): Promise<void> {
		await this._originalDoc.waitForQueue();
		await this._restart();
	}
}

export class DiffService {
	constructor(
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) {
	}

	public async computeDiff(original: string, modified: string): Promise<StringEdit> {
		const diffEdit = await this._editorWorkerService.computeStringEditFromDiff(original, modified, { maxComputationTimeMs: 500 }, 'advanced');
		return diffEdit;
	}
}

function isChatEdit(next: { value: StringText; change: { edit: AnnotatedStringEdit<EditKeySourceData | EditSourceData> }[] }) {
	return next.change.every(c => c.edit.replacements.every(e => {
		if (e.data.source.category === 'ai' && e.data.source.feature === 'chat') {
			return true;
		}
		return false;
	}));
}

export class MinimizeEditsProcessor<TEditData extends IEditData<TEditData>> extends Disposable implements IDocumentWithAnnotatedEdits<TEditData> {
	readonly value: IObservableWithChange<StringText, { edit: AnnotatedStringEdit<TEditData> }>;

	constructor(
		private readonly _originalDoc: IDocumentWithAnnotatedEdits<TEditData>,
	) {
		super();

		const v = this.value = observableValue(this, _originalDoc.value.get());

		let prevValue: string = this._originalDoc.value.get().value;
		this._register(runOnChange(this._originalDoc.value, (val, _prevVal, edits) => {
			const eComposed = AnnotatedStringEdit.compose(edits.map(e => e.edit));

			const e = eComposed.removeCommonSuffixAndPrefix(prevValue);
			prevValue = val.value;

			v.set(val, undefined, { edit: e });
		}));
	}

	async waitForQueue(): Promise<void> {
		await this._originalDoc.waitForQueue();
	}
}

/**
 * Removing the metadata allows touching edits from the same source to merged, even if they were caused by different actions (e.g. two user edits).
 */
export function createDocWithJustReason(docWithAnnotatedEdits: IDocumentWithAnnotatedEdits<EditSourceData>, store: DisposableStore): IDocumentWithAnnotatedEdits<EditKeySourceData> {
	const docWithJustReason: IDocumentWithAnnotatedEdits<EditKeySourceData> = {
		value: mapObservableDelta(docWithAnnotatedEdits.value, edit => ({ edit: edit.edit.mapData(d => d.data.toEditSourceData()) }), store),
		waitForQueue: () => docWithAnnotatedEdits.waitForQueue(),
	};
	return docWithJustReason;
}

