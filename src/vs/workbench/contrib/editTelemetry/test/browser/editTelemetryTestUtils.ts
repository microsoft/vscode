/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, IObservableWithChange, ISettableObservable, ITransaction, observableValue, subtransaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { StringEdit, StringReplacement } from '../../../../../editor/common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { EditSources } from '../../../../../editor/common/textModelEditSource.js';
import { IObservableDocument, ObservableWorkspace, StringEditWithReason } from '../../browser/helpers/observableWorkspace.js';

type SearchString = string;

function findOffsetRange(str: string, search: SearchString): OffsetRange {
	const startContextIndex = search.indexOf('≪');
	const endContextIndex = search.indexOf('≫');

	let searchStr: string;
	let beforeContext = '';
	let afterContext = '';

	if (startContextIndex !== -1 && endContextIndex !== -1 && endContextIndex > startContextIndex) {
		beforeContext = search.substring(0, startContextIndex);
		afterContext = search.substring(endContextIndex + 1);
		searchStr = search.substring(startContextIndex + 1, endContextIndex);
	} else {
		searchStr = search;
	}

	const startIndex = str.indexOf(beforeContext + searchStr + afterContext);
	if (startIndex === -1) {
		throw new Error(`Could not find context "${beforeContext}" + "${searchStr}" + "${afterContext}" in string "${str}"`);
	}

	const matchStart = startIndex + beforeContext.length;
	return new OffsetRange(matchStart, matchStart + searchStr.length);
}

export class MutableObservableWorkspace extends ObservableWorkspace {
	private readonly _openDocuments = observableValue<readonly IObservableDocument[], { added: readonly IObservableDocument[]; removed: readonly IObservableDocument[] }>(this, []);
	public readonly documents = this._openDocuments;

	private readonly _documents = new Map</* uri */ string, MutableObservableDocument>();

	constructor() {
		super();
	}

	/**
	 * Dispose to remove.
	*/
	public createDocument(options: { uri: URI; workspaceRoot?: URI; initialValue?: string; initialVersionId?: number; languageId?: string }, tx: ITransaction | undefined = undefined): MutableObservableDocument {
		assert(!this._documents.has(options.uri.toString()));

		const document = new MutableObservableDocument(
			options.uri,
			new StringText(options.initialValue ?? ''),
			[],
			options.languageId ?? 'plaintext',
			() => {
				this._documents.delete(options.uri.toString());
				const docs = this._openDocuments.get();
				const filteredDocs = docs.filter(d => d.uri.toString() !== document.uri.toString());
				if (filteredDocs.length !== docs.length) {
					this._openDocuments.set(filteredDocs, tx, { added: [], removed: [document] });
				}
			},
			options.initialVersionId ?? 0,
			options.workspaceRoot,
		);

		this._documents.set(options.uri.toString(), document);
		this._openDocuments.set([...this._openDocuments.get(), document], tx, { added: [document], removed: [] });

		return document;
	}

	public override getDocument(id: URI): MutableObservableDocument | undefined {
		return this._documents.get(id.toString());
	}

	public clear(): void {
		this._openDocuments.set([], undefined, { added: [], removed: this._openDocuments.get() });
		for (const doc of this._documents.values()) {
			doc.dispose();
		}
		this._documents.clear();
	}
}

export class MutableObservableDocument extends Disposable implements IObservableDocument {
	private readonly _value: ISettableObservable<StringText, StringEditWithReason>;
	public get value(): IObservableWithChange<StringText, StringEditWithReason> { return this._value; }

	private readonly _selection: ISettableObservable<readonly OffsetRange[]>;
	public get selection(): IObservable<readonly OffsetRange[]> { return this._selection; }

	private readonly _visibleRanges: ISettableObservable<readonly OffsetRange[]>;
	public get visibleRanges(): IObservable<readonly OffsetRange[]> { return this._visibleRanges; }

	private readonly _languageId: ISettableObservable<string>;
	public get languageId(): IObservable<string> { return this._languageId; }

	private readonly _version: ISettableObservable<number>;
	public get version(): IObservable<number> { return this._version; }

	constructor(
		public readonly uri: URI,
		value: StringText,
		selection: readonly OffsetRange[],
		languageId: string,
		onDispose: () => void,
		versionId: number,
		public readonly workspaceRoot: URI | undefined,
	) {
		super();

		this._value = observableValue(this, value);
		this._selection = observableValue(this, selection);
		this._visibleRanges = observableValue(this, []);
		this._languageId = observableValue(this, languageId);
		this._version = observableValue(this, versionId);

		this._register(toDisposable(onDispose));
	}

	setSelection(selection: readonly OffsetRange[], tx: ITransaction | undefined = undefined): void {
		this._selection.set(selection, tx);
	}

	setVisibleRange(visibleRanges: readonly OffsetRange[], tx: ITransaction | undefined = undefined): void {
		this._visibleRanges.set(visibleRanges, tx);
	}

	applyEdit(edit: StringEdit | StringEditWithReason, tx: ITransaction | undefined = undefined, newVersion: number | undefined = undefined): void {
		const newValue = edit.applyOnText(this.value.get());
		const e = edit instanceof StringEditWithReason ? edit : new StringEditWithReason(edit.replacements, EditSources.unknown({}));
		subtransaction(tx, tx => {
			this._value.set(newValue, tx, e);
			this._version.set(newVersion ?? this._version.get() + 1, tx);
		});
	}

	updateSelection(selection: readonly OffsetRange[], tx: ITransaction | undefined = undefined): void {
		this._selection.set(selection, tx);
	}

	setValue(value: StringText, tx: ITransaction | undefined = undefined, newVersion: number | undefined = undefined): void {
		const reason = EditSources.unknown({});
		const e = new StringEditWithReason([StringReplacement.replace(new OffsetRange(0, this.value.get().value.length), value.value)], reason);
		subtransaction(tx, tx => {
			this._value.set(value, tx, e);
			this._version.set(newVersion ?? this._version.get() + 1, tx);
		});
	}

	findRange(search: SearchString): OffsetRange {
		return findOffsetRange(this.value.get().value, search);
	}
}