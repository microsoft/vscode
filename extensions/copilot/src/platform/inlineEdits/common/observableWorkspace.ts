/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../util/vs/base/common/assert';
import { Disposable, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { autorunWithStore, derivedHandleChanges, derivedWithStore, IObservable, IObservableWithChange, ISettableObservable, ITransaction, observableValue, runOnChange, subtransaction } from '../../../util/vs/base/common/observableInternal';
import { URI } from '../../../util/vs/base/common/uri';
import { StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';
import { DiagnosticData } from './dataTypes/diagnosticData';
import { DocumentId } from './dataTypes/documentId';
import { LanguageId } from './dataTypes/languageId';
import { EditReason } from './editReason';

export abstract class ObservableWorkspace {
	abstract get openDocuments(): IObservableWithChange<readonly IObservableDocument[], { added: readonly IObservableDocument[]; removed: readonly IObservableDocument[] }>;

	abstract getWorkspaceRoot(documentId: DocumentId): URI | undefined;

	getFirstOpenDocument(): IObservableDocument | undefined {
		return this.openDocuments.get()[0];
	}

	getDocument(documentId: DocumentId): IObservableDocument | undefined {
		return this.openDocuments.get().find(d => d.id === documentId);
	}

	private _version = 0;

	/**
	 * Is fired when any open document changes.
	*/
	public readonly onDidOpenDocumentChange = derivedHandleChanges({
		owner: this,
		changeTracker: {
			createChangeSummary: () => ({ didChange: false }),
			handleChange: (ctx, changeSummary) => {
				if (!ctx.didChange(this.openDocuments)) {
					changeSummary.didChange = true; // A document changed
				}
				return true;
			}
		}
	}, (reader, changeSummary) => {
		const docs = this.openDocuments.read(reader);
		for (const d of docs) {
			d.value.read(reader); // add dependency
		}
		if (changeSummary.didChange) {
			this._version++; // to force a change
		}
		return this._version;

		// TODO@hediet make this work:
		/*
		const docs = this.openDocuments.read(reader);
		for (const d of docs) {
			if (reader.readChangesSinceLastRun(d.value).length > 0) {
				reader.reportChange(d);
			}
		}
		return undefined;
		*/
	});

	public readonly lastActiveDocument = derivedWithStore((_reader, store) => {
		const obs = observableValue('lastActiveDocument', undefined as IObservableDocument | undefined);
		store.add(autorunWithStore((reader, store) => {
			const docs = this.openDocuments.read(reader);
			for (const d of docs) {
				store.add(runOnChange(d.value, () => {
					obs.set(d, undefined);
				}));
			}
		}));
		return obs;
	}).flatten();
}

export interface IObservableDocument {
	readonly id: DocumentId;
	readonly value: IObservableWithChange<StringText, StringEditWithReason>;

	/**
	 * Increases whenever the value changes. Is also used to reference document states from the past.
	*/
	readonly version: IObservable<number>;

	/**
	 * `selection` is an array because of `multi-cursor` support.
	 */
	readonly selection: IObservable<readonly OffsetRange[]>;
	/**
	 * 0-based line number of the primary cursor.
	 */
	readonly primarySelectionLine: IObservable<number | undefined>;
	readonly visibleRanges: IObservable<readonly OffsetRange[]>;
	readonly languageId: IObservable<LanguageId>;
	readonly diagnostics: IObservable<readonly DiagnosticData[]>;
}

export class StringEditWithReason extends StringEdit {
	constructor(
		replacements: StringEdit['replacements'],
		public readonly reason: EditReason,
	) {
		super(replacements);
	}
}

export class MutableObservableWorkspace extends ObservableWorkspace {
	private readonly _openDocuments = observableValue<readonly IObservableDocument[], { added: readonly IObservableDocument[]; removed: readonly IObservableDocument[] }>(this, []);
	public readonly openDocuments = this._openDocuments;

	private readonly _documents = new Map<DocumentId, MutableObservableDocument>();

	/**
	 * Dispose to remove.
	*/
	public addDocument(options: { id: DocumentId; workspaceRoot?: URI; initialValue?: string; initialVersionId?: number; languageId?: LanguageId }, tx: ITransaction | undefined = undefined): MutableObservableDocument {
		assert(!this._documents.has(options.id));

		const document = new MutableObservableDocument(
			options.id,
			new StringText(options.initialValue ?? ''),
			[],
			options.languageId ?? LanguageId.PlainText,
			() => {
				this._documents.delete(options.id);
				const docs = this._openDocuments.get();
				const filteredDocs = docs.filter(d => d.id !== document.id);
				if (filteredDocs.length !== docs.length) {
					this._openDocuments.set(filteredDocs, tx, { added: [], removed: [document] });
				}
			},
			options.initialVersionId ?? 0,
			options.workspaceRoot,
		);

		this._documents.set(options.id, document);
		this._openDocuments.set([...this._openDocuments.get(), document], tx, { added: [document], removed: [] });

		return document;
	}

	public override getDocument(id: DocumentId): MutableObservableDocument | undefined {
		return this._documents.get(id);
	}

	public clear(): void {
		this._openDocuments.set([], undefined, { added: [], removed: this._openDocuments.get() });
		for (const doc of this._documents.values()) {
			doc.dispose();
		}
		this._documents.clear();
	}

	getWorkspaceRoot(documentId: DocumentId): URI | undefined {
		return this._documents.get(documentId)?.workspaceRoot;
	}
}

export class MutableObservableDocument extends Disposable implements IObservableDocument {
	private readonly _value: ISettableObservable<StringText, StringEditWithReason>;
	public get value(): IObservableWithChange<StringText, StringEditWithReason> { return this._value; }

	private readonly _selection: ISettableObservable<readonly OffsetRange[]>;
	public get selection(): IObservable<readonly OffsetRange[]> { return this._selection; }

	private readonly _primarySelectionLine: ISettableObservable<number | undefined>;
	public get primarySelectionLine(): IObservable<number | undefined> { return this._primarySelectionLine; }

	private readonly _visibleRanges: ISettableObservable<readonly OffsetRange[]>;
	public get visibleRanges(): IObservable<readonly OffsetRange[]> { return this._visibleRanges; }

	private readonly _languageId: ISettableObservable<LanguageId>;
	public get languageId(): IObservable<LanguageId> { return this._languageId; }

	private readonly _version: ISettableObservable<number>;
	public get version(): IObservable<number> { return this._version; }

	private readonly _diagnostics: ISettableObservable<readonly DiagnosticData[]>;
	public get diagnostics(): IObservable<readonly DiagnosticData[]> { return this._diagnostics; }

	constructor(
		public readonly id: DocumentId,
		value: StringText,
		selection: readonly OffsetRange[],
		languageId: LanguageId,
		onDispose: () => void,
		versionId: number,
		public readonly workspaceRoot: URI | undefined,
	) {
		super();

		this._value = observableValue(this, value);
		this._selection = observableValue(this, selection);
		this._primarySelectionLine = observableValue(this, undefined);
		this._visibleRanges = observableValue(this, []);
		this._languageId = observableValue(this, languageId);
		this._version = observableValue(this, versionId);
		this._diagnostics = observableValue(this, []);

		this._register(toDisposable(onDispose));
	}

	setSelection(selection: readonly OffsetRange[], tx: ITransaction | undefined = undefined, primaryLine?: number): void {
		this._selection.set(selection, tx);
		this._primarySelectionLine.set(primaryLine, tx);
	}

	setVisibleRange(visibleRanges: readonly OffsetRange[], tx: ITransaction | undefined = undefined): void {
		this._visibleRanges.set(visibleRanges, tx);
	}

	applyEdit(edit: StringEdit | StringEditWithReason, tx: ITransaction | undefined = undefined, newVersion: number | undefined = undefined): void {
		const newValue = edit.applyOnText(this.value.get());
		const e = edit instanceof StringEditWithReason ? edit : new StringEditWithReason(edit.replacements, EditReason.unknown);
		subtransaction(tx, tx => {
			this._value.set(newValue, tx, e);
			this._version.set(newVersion ?? this._version.get() + 1, tx);
		});
	}

	updateSelection(selection: readonly OffsetRange[], tx: ITransaction | undefined = undefined, primaryLine?: number): void {
		this._selection.set(selection, tx);
		this._primarySelectionLine.set(primaryLine, tx);
	}

	setValue(value: StringText, tx: ITransaction | undefined = undefined, newVersion: number | undefined = undefined): void {
		const reason = EditReason.unknown;
		const e = new StringEditWithReason([StringReplacement.replace(new OffsetRange(0, this.value.get().value.length), value.value)], reason);
		subtransaction(tx, tx => {
			this._value.set(value, tx, e);
			this._version.set(newVersion ?? this._version.get() + 1, tx);
		});
	}

	updateDiagnostics(diagnostics: readonly DiagnosticData[], tx: ITransaction | undefined = undefined): void {
		this._diagnostics.set(diagnostics, tx);
	}
}
