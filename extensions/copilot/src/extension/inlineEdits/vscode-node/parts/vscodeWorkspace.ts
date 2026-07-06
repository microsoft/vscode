/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CodeAction, CodeActionKind, commands, Diagnostic, DiagnosticSeverity, languages, NotebookCell, NotebookCellKind, NotebookDocument, Range, TextDocument, TextEditor, Uri, window, workspace } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { CodeActionData } from '../../../../platform/inlineEdits/common/dataTypes/codeActionData';
import { DiagnosticData } from '../../../../platform/inlineEdits/common/dataTypes/diagnosticData';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { LanguageId } from '../../../../platform/inlineEdits/common/dataTypes/languageId';
import { EditReason } from '../../../../platform/inlineEdits/common/editReason';
import { IObservableDocument, ObservableWorkspace, StringEditWithReason } from '../../../../platform/inlineEdits/common/observableWorkspace';
import { createAlternativeNotebookDocument, IAlternativeNotebookDocument, toAltNotebookCellChangeEdit, toAltNotebookChangeEdit } from '../../../../platform/notebook/common/alternativeNotebookTextDocument';
import { getDefaultLanguage } from '../../../../platform/notebook/common/helpers';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { getLanguage } from '../../../../util/common/languages';
import { findNotebook } from '../../../../util/common/notebooks';
import { coalesce } from '../../../../util/vs/base/common/arrays';
import { asPromise, raceCancellation, raceTimeout } from '../../../../util/vs/base/common/async';
import { diffMaps } from '../../../../util/vs/base/common/collections';
import { onUnexpectedError } from '../../../../util/vs/base/common/errors';
import { Lazy } from '../../../../util/vs/base/common/lazy';
import { DisposableStore, IDisposable } from '../../../../util/vs/base/common/lifecycle';
import { ResourceSet } from '../../../../util/vs/base/common/map';
import { Schemas } from '../../../../util/vs/base/common/network';
import { autorun, derived, IObservable, IReader, ISettableObservable, mapObservableArrayCached, observableFromEvent, observableValue, transaction } from '../../../../util/vs/base/common/observableInternal';
import { isDefined } from '../../../../util/vs/base/common/types';
import { URI } from '../../../../util/vs/base/common/uri';
import { TextReplacement } from '../../../../util/vs/editor/common/core/edits/textEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { toInternalTextEdit } from '../utils/translations';
import { editFromTextDocumentContentChangeEvents, stringValueFromDoc } from './common';
import { DocumentFilter } from './documentFilter';
import { VerifyTextDocumentChanges } from './verifyTextDocumentChanges';

export class VSCodeWorkspace extends ObservableWorkspace implements IDisposable {
	private readonly _openDocuments = observableValue<readonly IVSCodeObservableDocument[], { added: readonly IVSCodeObservableDocument[]; removed: readonly IVSCodeObservableDocument[] }>(this, []);
	public readonly openDocuments = this._openDocuments;

	private readonly _store = new DisposableStore();
	private readonly _filter = this._instaService.createInstance(DocumentFilter);
	private get _useAlternativeNotebookFormat(): boolean {
		return this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.UseAlternativeNESNotebookFormat, this._experimentationService)
			|| this._configurationService.getExperimentBasedConfig(ConfigKey.UseAlternativeNESNotebookFormat, this._experimentationService);
	}
	private readonly _markdownNotebookCells = new Lazy<ResourceSet>(() => {
		const markdownCellUris = new ResourceSet();
		workspace.notebookDocuments.forEach(doc => trackMarkdownCells(doc.getCells(), markdownCellUris));
		return markdownCellUris;
	});

	constructor(
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
	) {
		super();

		const config = this._configurationService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.VerifyTextDocumentChanges, this._experimentationService);
		this._store.add(autorun(reader => {
			if (config.read(reader)) {
				reader.store.add(this._instaService.createInstance(VerifyTextDocumentChanges));
			}
		}));

		let lastDocs: Map<DocumentId, IVSCodeObservableDocument> = new Map();
		this._store.add(autorun(reader => {
			// Manually copy over the documents to get the delta
			const curDocs = this._obsDocsByDocId.read(reader);
			const diff = diffMaps(lastDocs, curDocs);
			lastDocs = curDocs;

			this._openDocuments.set([...curDocs.values()], undefined, {
				added: diff.added,
				removed: diff.removed,
			});
		}));

		this._store.add(workspace.onDidChangeTextDocument(e => {
			const doc = this._getDocumentByDocumentAndUpdateShouldTrack(e.document.uri);
			if (!doc) {
				return;
			}
			if (doc instanceof VSCodeObservableTextDocument) {
				const edit = editFromTextDocumentContentChangeEvents(e.contentChanges);
				const editWithReason = new StringEditWithReason(edit.replacements, EditReason.create(e.detailedReason?.metadata as any));
				transaction(tx => {
					doc.languageId.set(LanguageId.create(e.document.languageId), tx);
					doc.value.set(stringValueFromDoc(e.document), tx, editWithReason);
					doc.version.set(e.document.version, tx);
				});
			} else {
				const edit = toAltNotebookCellChangeEdit(doc.altNotebook, e.document, e.contentChanges);
				doc.altNotebook.applyCellChanges(e.document, e.contentChanges);
				const editWithReason = new StringEditWithReason(edit.replacements, EditReason.create(e.detailedReason?.metadata as any));
				transaction(tx => {
					doc.value.set(stringValueFromDoc(doc.altNotebook), tx, editWithReason);
					doc.version.set(doc.notebook.version, tx);
				});
			}
		}));

		if (this._useAlternativeNotebookFormat) {
			this._store.add(workspace.onDidOpenNotebookDocument(e => trackMarkdownCells(e.getCells(), this._markdownNotebookCells.value)));
		}

		this._store.add(workspace.onDidChangeNotebookDocument(e => {
			const doc = this._getDocumentByDocumentAndUpdateShouldTrack(e.notebook.uri);
			if (!doc || !e.contentChanges.length || doc instanceof VSCodeObservableTextDocument) {
				return;
			}
			const edit = toAltNotebookChangeEdit(doc.altNotebook, e.contentChanges);
			if (!edit) {
				return;
			}
			doc.altNotebook.applyNotebookChanges(e.contentChanges);
			const editWithReason = new StringEditWithReason(edit.replacements, EditReason.unknown);
			transaction(tx => {
				doc.value.set(stringValueFromDoc(doc.altNotebook), tx, editWithReason);
				doc.version.set(doc.notebook.version, tx);
			});

			if (this._useAlternativeNotebookFormat) {
				e.contentChanges.map(c => c.removedCells).flat().forEach(c => {
					this._markdownNotebookCells.value.delete(c.document.uri);
				});
				trackMarkdownCells(e.contentChanges.map(c => c.addedCells).flat(), this._markdownNotebookCells.value);
			}
		}));

		this._store.add(window.onDidChangeTextEditorSelection(e => {
			const doc = this._getDocumentByDocumentAndUpdateShouldTrack(e.textEditor.document.uri);
			if (!doc) {
				return;
			}
			const selections = doc instanceof VSCodeObservableTextDocument ?
				coalesce(e.selections.map(s => doc.toOffsetRange(e.textEditor.document, s))) :
				this.getNotebookSelections(doc.notebook, e.textEditor);
			doc.selection.set(selections, undefined);
			doc.primarySelectionLine.set(e.selections[0]?.start.line, undefined);
		}));

		this._store.add(window.onDidChangeTextEditorVisibleRanges(e => {
			const doc = this._getDocumentByDocumentAndUpdateShouldTrack(e.textEditor.document.uri);
			if (!doc) {
				return;
			}
			const visibleRanges = doc instanceof VSCodeObservableTextDocument ?
				coalesce(e.visibleRanges.map(r => doc.toOffsetRange(e.textEditor.document, r))) :
				this.getNotebookVisibleRanges(doc.notebook);
			doc.visibleRanges.set(visibleRanges, undefined);
		}));

		this._store.add(languages.onDidChangeDiagnostics(e => {
			e.uris.forEach(uri => {
				const document = this._getDocumentByDocumentAndUpdateShouldTrack(uri);
				if (!document) {
					return;
				}
				const diagnostics = document instanceof VSCodeObservableTextDocument ?
					this._createTextDocumentDiagnosticData(document) :
					this._createNotebookDiagnosticData(document.altNotebook);
				document.diagnostics.set(diagnostics, undefined);
			});
		}));
	}

	public dispose(): void {
		this._store.dispose();
	}

	private readonly _obsDocsByDocId = derived(this, reader => {
		const textDocs = this._textDocsWithShouldTrackFlag.read(reader);
		const obsDocs = textDocs.map(d => d.obsDoc.read(reader)).filter(isDefined);
		const map: Map<DocumentId, VSCodeObservableTextDocument | VSCodeObservableNotebookDocument> = new Map(obsDocs.map(d => [d.id, d]));
		const notebookDocs = this._notebookDocsWithShouldTrackFlag.read(reader);
		const obsNotebookDocs = notebookDocs.map(d => d.obsDoc.read(reader)).filter(isDefined);
		obsNotebookDocs.forEach(d => map.set(d.id, d));

		return map;
	});

	private readonly _vscodeTextDocuments: IObservable<readonly TextDocument[]> = getObservableTextDocumentList(this._useAlternativeNotebookFormat, this._markdownNotebookCells.value);
	private readonly _textDocsWithShouldTrackFlag = mapObservableArrayCached(this, this._vscodeTextDocuments, (doc, store) => {
		const shouldTrack = observableValue<boolean>(this, false);
		const updateShouldTrack = () => {
			// @ulugbekna: not sure if invoking `isCopilotIgnored` on every textDocument-edit event is a good idea
			// 	also not sure if we should be enforcing local copilot-ignore rules (vs only remote-exclusion rules)
			this._filter.isTrackingEnabled(doc).then(v => {
				shouldTrack.set(v, undefined);
			}).catch(e => {
				onUnexpectedError(e);
			});
		};
		const obsDoc = derived(this, reader => {
			if (!shouldTrack.read(reader)) {
				return undefined;
			}

			const documentId = DocumentId.create(doc.uri.toString());
			const openedTextEditor = window.visibleTextEditors.find(e => e.document.uri.toString() === doc.uri.toString());
			const document = new VSCodeObservableTextDocument(documentId, stringValueFromDoc(doc), doc.version, [], [], LanguageId.create(doc.languageId), [], doc);

			const selections = coalesce((openedTextEditor?.selections || []).map(s => document.toOffsetRange(doc, s)));
			const visibleRanges = coalesce((openedTextEditor?.visibleRanges || []).map(r => document.toOffsetRange(doc, r)));
			transaction(tx => {
				document.selection.set(selections, tx);
				document.primarySelectionLine.set(openedTextEditor?.selections[0]?.start.line, tx);
				document.visibleRanges.set(visibleRanges, tx);
				document.diagnostics.set(this._createTextDocumentDiagnosticData(document), tx);
			});
			return document;
		}).recomputeInitiallyAndOnChange(store);

		updateShouldTrack();
		return {
			doc,
			updateShouldTrack,
			obsDoc,
		};
	});

	private getNotebookDocuments() {
		if (!this._useAlternativeNotebookFormat) {
			return observableValue('', []);
		}
		return getNotebookDocuments();
	}
	private readonly _vscodeNotebookDocuments: IObservable<readonly NotebookDocument[]> = this.getNotebookDocuments();
	private readonly _altNotebookDocs = new WeakMap<NotebookDocument, IAlternativeNotebookDocument>();
	private getAltNotebookDocument(doc: NotebookDocument): IAlternativeNotebookDocument {
		let altNotebook = this._altNotebookDocs.get(doc);
		if (!altNotebook) {
			altNotebook = createAlternativeNotebookDocument(doc, true);
			this._altNotebookDocs.set(doc, altNotebook);
		}
		return altNotebook;
	}
	private readonly _notebookDocsWithShouldTrackFlag = mapObservableArrayCached(this, this._vscodeNotebookDocuments, (doc, store) => {
		const shouldTrack = observableValue<boolean>(this, false);
		const updateShouldTrack = () => {
			// @ulugbekna: not sure if invoking `isCopilotIgnored` on every textDocument-edit event is a good idea
			// 	also not sure if we should be enforcing local copilot-ignore rules (vs only remote-exclusion rules)
			this._filter.isTrackingEnabled(doc).then(v => {
				shouldTrack.set(v, undefined);
			}).catch(e => {
				onUnexpectedError(e);
			});
		};
		const obsDoc = derived(this, reader => {
			if (!shouldTrack.read(reader)) {
				return undefined;
			}
			const altNotebook = this.getAltNotebookDocument(doc);
			const documentId = DocumentId.create(doc.uri.toString());
			const selections = this.getNotebookSelections(doc);
			const visibleRanges = this.getNotebookVisibleRanges(doc);
			const diagnostics = this._createNotebookDiagnosticData(altNotebook);
			const language = getLanguage(getDefaultLanguage(altNotebook.notebook)).languageId;
			const document = new VSCodeObservableNotebookDocument(documentId, stringValueFromDoc(altNotebook), doc.version, selections ?? [], visibleRanges ?? [], LanguageId.create(language), diagnostics, doc, altNotebook);
			return document;
		}).recomputeInitiallyAndOnChange(store);

		updateShouldTrack();
		return {
			doc,
			updateShouldTrack,
			obsDoc,
		};
	});

	private getNotebookSelections(doc: NotebookDocument, activeCellEditor?: TextEditor) {
		const altNotebook = this.getAltNotebookDocument(doc);
		const visibleTextEditors = new Map(window.visibleTextEditors.map(e => [e.document, e]));
		// As notebooks have multiple cells, and each cell can have its own selection,
		// We should focus on the active cell to determine the cursor position.
		const selectedCellRange = window.activeNotebookEditor?.selection;
		const selectedCell = activeCellEditor ? altNotebook.getCell(activeCellEditor.document) : (selectedCellRange && selectedCellRange.start < doc.cellCount ? doc.cellAt(selectedCellRange.start) : undefined);
		const selectedCellEditor = selectedCell ? visibleTextEditors.get(selectedCell.document) : undefined;
		// We only care about the active cell where cursor is, don't care about multi-cursor.
		// As the edits are to be performed around wher the cursor is.
		return (selectedCellEditor && selectedCell) ? altNotebook.toAltOffsetRange(selectedCell, selectedCellEditor.selections) : [];
	}

	private getNotebookVisibleRanges(doc: NotebookDocument) {
		const altNotebook = this.getAltNotebookDocument(doc);
		const visibleTextEditors = new Map(window.visibleTextEditors.map(e => [e.document, e]));
		const cellTextEditors = coalesce(doc.getCells().map(cell => visibleTextEditors.has(cell.document) ? [cell, visibleTextEditors.get(cell.document)!] as const : undefined));
		return cellTextEditors.flatMap(e => altNotebook.toAltOffsetRange(e[0], e[1].visibleRanges));
	}

	private _getDocumentByDocumentAndUpdateShouldTrack(uri: URI): VSCodeObservableTextDocument | VSCodeObservableNotebookDocument | undefined {
		const internalDoc = this._getInternalDocument(uri);
		if (!internalDoc) {
			return undefined;
		}
		internalDoc.updateShouldTrack();
		return internalDoc.obsDoc.get();
	}

	private _getInternalDocument(uri: Uri, reader?: IReader) {
		const document = this._obsDocsWithUpdateIgnored.read(reader).get(uri.toString());
		return document;
	}

	private _createTextDocumentDiagnosticData(document: VSCodeObservableTextDocument) {
		return languages.getDiagnostics(document.textDocument.uri).map(d => this._createDiagnosticData(d, document)).filter(isDefined);
	}

	private _createDiagnosticData(diagnostic: Diagnostic, doc: VSCodeObservableTextDocument): DiagnosticData | undefined {
		return toDiagnosticData(diagnostic, doc.textDocument.uri, (range) => doc.toOffsetRange(doc.textDocument, range));
	}

	private _createNotebookDiagnosticData(altNotebook: IAlternativeNotebookDocument) {
		return coalesce(altNotebook.notebook.getCells().flatMap(c => languages.getDiagnostics(c.document.uri).map(d => this._createNotebookCellDiagnosticData(d, altNotebook, c.document))));
	}

	private _createNotebookCellDiagnosticData(diagnostic: Diagnostic, altNotebook: IAlternativeNotebookDocument, doc: TextDocument): DiagnosticData | undefined {
		const cell = altNotebook.getCell(doc);
		if (!cell) {
			return undefined;
		}
		return toDiagnosticData(diagnostic, altNotebook.notebook.uri, range => {
			const offsetRanges = altNotebook.toAltOffsetRange(cell, [range]);
			return offsetRanges.length ? offsetRanges[0] : undefined;
		});
	}

	private readonly _obsDocsWithUpdateIgnored = derived(this, reader => {
		const docs = this._textDocsWithShouldTrackFlag.read(reader);
		const map: Map<string, {
			doc: TextDocument | NotebookDocument;
			updateShouldTrack: () => void;
			obsDoc: IObservable<VSCodeObservableTextDocument | VSCodeObservableNotebookDocument | undefined>;
		}> = new Map(docs.map(d => [d.doc.uri.toString(), d]));
		const notebookDocs = this._notebookDocsWithShouldTrackFlag.read(reader);
		notebookDocs.forEach(d => {
			map.set(d.doc.uri.toString(), d);
			// Markdown cells will be treated as standalone text documents (old behaviour).
			d.doc.getCells().filter(cell => cell.kind === NotebookCellKind.Code).forEach(cell => map.set(cell.document.uri.toString(), d));
		});
		return map;
	});

	/**
	 * Returns undefined for documents that are not tracked (e.g. filtered out).
	*/
	public getDocumentByTextDocument(doc: TextDocument, reader?: IReader): IVSCodeObservableDocument | undefined {
		this._store.assertNotDisposed();

		const internalDoc = this._getInternalDocument(doc.uri, reader);
		if (!internalDoc) {
			return undefined;
		}
		return internalDoc.obsDoc.get();
	}

	public getWorkspaceRoot(documentId: DocumentId): URI | undefined {
		let uri = documentId.toUri();
		if (uri.scheme === Schemas.vscodeNotebookCell) {
			const notebook = findNotebook(uri, this._workspaceService.notebookDocuments);
			if (notebook) {
				uri = notebook.uri;
			}
		}
		return workspace.getWorkspaceFolder(uri)?.uri;
	}
}

export interface IVSCodeObservableDocument extends IObservableDocument {
	/**
	 * Converts the OffsetRange of the Observable document to a range within the provided Text document.
	 * If this is a Text Document, performs a simple OffsetRange to Range translation.
	 * If this is a Notebook Document, then this method converts an offset range of the Observable document to a range within the provided notebook cell. If the range provided does not belong to the provided cell (as identified by TextDocument), it returns undefined.
	 */
	fromOffsetRange(textDocument: TextDocument, range: OffsetRange): Range | undefined;
	/**
	 * Converts the OffsetRange of the Observable document to range(s) within the provided Text document.
	 * If this is a Text Document, performs a simple OffsetRange to Range translation.
	 * If this is a Notebook Document, then this method converts an offset range of the Observable document to a range(s) of multiple notebook cells.
	 */
	fromOffsetRange(range: OffsetRange): [TextDocument, Range][];

	/**
	 * Converts the Range of the Observable document to a range within the provided Text document.
	 * If this is a Text Document, then this returns the same value passed in.
	 * If this is a Notebook Document, then this method converts a range of the Observable document to a range within the provided notebook cell. If the range provided does not belong to the provided cell (as identified by TextDocument), it returns undefined.
	*/
	fromRange(textDocument: TextDocument, range: Range): Range | undefined;
	/**
	 * Converts the Range of the Observable document to range(s) within the provided Text document.
	 * If this is a Text Document, then this returns the same value passed in.
	 * If this is a Notebook Document, then this method converts a range of the Observable document to a range(s) of multiple notebook cells.
	 */
	fromRange(range: Range): [TextDocument, Range][];

	/**
	 * Converts the Range of the provided Text Document into an OffsetRange within the Observable Document.
	 * If this is a Text Document, performs a simple Range to OffsetRange translation.
	 * If this is a Notebook Document, then this method converts a range within the provided Notebook Cell to an Offset within the Observable document. If the provided document does not belong to the Notebook Cell, it returns undefined.
	 */
	toOffsetRange(textDocument: TextDocument, range: Range): OffsetRange | undefined;

	/**
	 * Converts the Range of the provided Text Document into a Range within the Observable Document.
	 * If this is a Text Document, then this returns the same value passed in.
	 * If this is a Notebook Document, then this method converts a range within the provided Notebook Cell to a Range within the Observable document. If the provided document does not belong to the Notebook Cell, it returns undefined.
	 */
	toRange(textDocument: TextDocument, range: Range): Range | undefined;

	/**
	 * Gets code actions for the specific range within the document
	 * @param itemResolveCount Number of code actions to resolve (too large numbers slow down code actions)
	 */
	getCodeActions(range: OffsetRange, itemResolveCount: number, token: CancellationToken): Promise<CodeActionData[] | undefined>;
}

abstract class AbstractVSCodeObservableDocument {
	public readonly value: ISettableObservable<StringText, StringEditWithReason>;
	public readonly version: ISettableObservable<number>;
	public readonly selection: ISettableObservable<readonly OffsetRange[]>;
	public readonly primarySelectionLine: ISettableObservable<number | undefined>;
	public readonly visibleRanges: ISettableObservable<readonly OffsetRange[]>;
	public readonly languageId: ISettableObservable<LanguageId>;
	public readonly diagnostics: ISettableObservable<readonly DiagnosticData[]>;

	constructor(
		public readonly id: DocumentId,
		value: StringText,
		versionId: number,
		selection: readonly OffsetRange[],
		visibleRanges: readonly OffsetRange[],
		languageId: LanguageId,
		diagnostics: DiagnosticData[]
	) {
		this.value = observableValue(this, value);
		this.version = observableValue(this, versionId);
		this.selection = observableValue(this, selection);
		this.primarySelectionLine = observableValue(this, undefined);
		this.visibleRanges = observableValue(this, visibleRanges);
		this.languageId = observableValue(this, languageId);
		this.diagnostics = observableValue(this, diagnostics);
	}
}

class VSCodeObservableTextDocument extends AbstractVSCodeObservableDocument implements IVSCodeObservableDocument {
	constructor(
		id: DocumentId,
		value: StringText,
		versionId: number,
		selection: readonly OffsetRange[],
		visibleRanges: readonly OffsetRange[],
		languageId: LanguageId,
		diagnostics: DiagnosticData[],
		public readonly textDocument: TextDocument,
	) {
		super(id, value, versionId, selection, visibleRanges, languageId, diagnostics);
	}

	fromOffsetRange(textDocument: TextDocument, range: OffsetRange): Range | undefined;
	fromOffsetRange(range: OffsetRange): [TextDocument, Range][];
	fromOffsetRange(arg1: TextDocument | OffsetRange, range?: OffsetRange): Range | undefined | [TextDocument, Range][] {
		let textDocument: TextDocument = this.textDocument;
		let offsetRange: OffsetRange | undefined;

		if (arg1 instanceof OffsetRange) {
			offsetRange = arg1;
		} else if (range !== undefined) {
			textDocument = arg1;
			offsetRange = range;
		}
		if (textDocument !== this.textDocument) {
			throw new Error('TextDocument does not match the one of this observable document.');
		}
		if (!offsetRange) {
			throw new Error('OffsetRange is not defined.');
		}
		const result = new Range(
			textDocument.positionAt(offsetRange.start),
			textDocument.positionAt(offsetRange.endExclusive)
		);
		if (arg1 instanceof OffsetRange) {
			return [[this.textDocument, result]];
		} else {
			return result;
		}
	}
	toOffsetRange(textDocument: TextDocument, range: Range): OffsetRange | undefined {
		return new OffsetRange(textDocument.offsetAt(range.start), textDocument.offsetAt(range.end));
	}

	fromRange(textDocument: TextDocument, range: Range): Range | undefined;
	fromRange(range: Range): [TextDocument, Range][];
	fromRange(arg1: TextDocument | Range, range?: Range): Range | undefined | [TextDocument, Range][] {
		if (arg1 instanceof Range) {
			return [[this.textDocument, arg1]];
		} else if (range !== undefined) {
			if (arg1 !== this.textDocument) {
				throw new Error('TextDocument does not match the one of this observable document.');
			}
			return range;
		} else {
			return undefined;
		}
	}

	toRange(_textDocument: TextDocument, range: Range): Range | undefined {
		return range;
	}

	async getCodeActions(offsetRange: OffsetRange, itemResolveCount: number, token: CancellationToken): Promise<CodeActionData[] | undefined> {
		const range = this.fromOffsetRange(this.textDocument, offsetRange);
		if (!range) {
			return;
		}
		const actions = await raceTimeout(
			raceCancellation(
				getQuickFixCodeActions(this.textDocument.uri, range, itemResolveCount),
				token
			),
			1000
		);

		return actions?.map(action => toCodeActionData(action, this, range => this.toOffsetRange(this.textDocument, range)));
	}
}

class VSCodeObservableNotebookDocument extends AbstractVSCodeObservableDocument implements IVSCodeObservableDocument {
	constructor(
		id: DocumentId,
		value: StringText,
		versionId: number,
		selection: readonly OffsetRange[],
		visibleRanges: readonly OffsetRange[],
		languageId: LanguageId,
		diagnostics: DiagnosticData[],
		public readonly notebook: NotebookDocument,
		public readonly altNotebook: IAlternativeNotebookDocument,
	) {
		super(id, value, versionId, selection, visibleRanges, languageId, diagnostics);
	}

	fromOffsetRange(textDocument: TextDocument, range: OffsetRange): Range | undefined;
	fromOffsetRange(range: OffsetRange): [TextDocument, Range][];
	fromOffsetRange(arg1: TextDocument | OffsetRange, range?: OffsetRange): Range | undefined | [TextDocument, Range][] {
		if (arg1 instanceof OffsetRange) {
			return this.altNotebook.fromAltOffsetRange(arg1).map(r => [r[0].document, r[1]]);
		} else if (range !== undefined) {
			const cell = this.altNotebook.getCell(arg1);
			if (!cell) {
				return undefined;
			}
			const results = this.altNotebook.fromAltOffsetRange(range);
			const found = results.find(r => r[0].document === arg1);
			return found ? found[1] : undefined;
		}
		return undefined;
	}

	fromRange(textDocument: TextDocument, range: Range): Range | undefined;
	fromRange(range: Range): [TextDocument, Range][];
	fromRange(arg1: TextDocument | Range, range?: Range): Range | undefined | [TextDocument, Range][] {
		if (arg1 instanceof Range) {
			return this.altNotebook.fromAltRange(arg1).map(r => [r[0].document, r[1]]);
		} else if (range !== undefined) {
			const cell = this.altNotebook.getCell(arg1);
			if (!cell) {
				return undefined;
			}
			const results = this.altNotebook.fromAltRange(range);
			const found = results.find(r => r[0].document === arg1);
			return found ? found[1] : undefined;
		}
	}

	toOffsetRange(textDocument: TextDocument, range: Range): OffsetRange | undefined {
		const cell = this.altNotebook.getCell(textDocument);
		if (!cell) {
			return undefined;
		}
		const offsetRanges = this.altNotebook.toAltOffsetRange(cell, [range]);
		return offsetRanges.length ? offsetRanges[0] : undefined;
	}

	toRange(textDocument: TextDocument, range: Range): Range | undefined {
		const cell = this.altNotebook.getCell(textDocument);
		if (!cell) {
			return undefined;
		}
		const ranges = this.altNotebook.toAltRange(cell, [range]);
		return ranges.length > 0 ? ranges[0] : undefined;
	}

	async getCodeActions(offsetRange: OffsetRange, itemResolveCount: number, token: CancellationToken): Promise<CodeActionData[] | undefined> {
		const cellRanges = this.fromOffsetRange(offsetRange);
		if (!cellRanges || cellRanges.length === 0) {
			return;
		}
		return Promise.all(cellRanges.map(async ([cellTextDocument, range]) => {
			const cell = this.altNotebook.getCell(cellTextDocument);
			if (!cell) {
				return undefined;
			}
			const actions = await raceTimeout(
				raceCancellation(
					getQuickFixCodeActions(cellTextDocument.uri, range, itemResolveCount),
					token
				),
				1000
			);

			return actions?.map(action => toCodeActionData(action, this, (range) => {
				const offsetRanges = this.altNotebook.toAltOffsetRange(cell, [range]);
				return offsetRanges.length ? offsetRanges[0] : undefined;
			}));
		})).then(results => coalesce(results.flat()));
	}
}

function getObservableTextDocumentList(excludeNotebookCells: boolean, markdownCellUris: ResourceSet): IObservable<readonly TextDocument[]> {
	return observableFromEvent(undefined, e => {
		const d1 = workspace.onDidOpenTextDocument(e);
		const d2 = workspace.onDidCloseTextDocument(e);
		return {
			dispose: () => {
				d1.dispose();
				d2.dispose();
			}
		};
		// If we're meant to exclude notebook cells, we will still include the markdown cells as separate documents.
		// Thats because markdown cells will be treated as standalone text documents in the editor.
	}, () => excludeNotebookCells ? workspace.textDocuments.filter(doc => doc.uri.scheme !== Schemas.vscodeNotebookCell || markdownCellUris.has(doc.uri)) : workspace.textDocuments);
}

function getNotebookDocuments(): IObservable<readonly NotebookDocument[]> {
	return observableFromEvent(undefined, e => {
		const d1 = workspace.onDidOpenNotebookDocument(e);
		const d2 = workspace.onDidCloseNotebookDocument(e);
		return {
			dispose: () => {
				d1.dispose();
				d2.dispose();
			}
		};
	}, () => workspace.notebookDocuments);
}

function trackMarkdownCells(cells: NotebookCell[], resources: ResourceSet): void {
	cells.forEach(c => {
		if (c.kind === NotebookCellKind.Markup) {
			resources.add(c.document.uri);
		}
	});
}

function toDiagnosticData(diagnostic: Diagnostic, uri: URI, translateRange: (range: Range) => OffsetRange | undefined) {
	if (!diagnostic.source || (diagnostic.severity !== DiagnosticSeverity.Error && diagnostic.severity !== DiagnosticSeverity.Warning)) {
		return undefined;
	}

	const range = translateRange(diagnostic.range);
	if (!range) {
		return undefined;
	}
	return new DiagnosticData(
		uri,
		diagnostic.message,
		diagnostic.severity === DiagnosticSeverity.Error ? 'error' : 'warning',
		range,
		diagnostic.code && !(typeof diagnostic.code === 'number') && !(typeof diagnostic.code === 'string') ? diagnostic.code.value : diagnostic.code,
		diagnostic.source
	);
}

function toCodeActionData(codeAction: CodeAction, workspaceDocument: IVSCodeObservableDocument, translateRange: (range: Range) => OffsetRange | undefined): CodeActionData {
	const uri = workspaceDocument.id.toUri();
	const diagnostics = coalesce((codeAction.diagnostics || []).map(d => toDiagnosticData(d, uri, translateRange))).concat(
		getCommandDiagnostics(codeAction, uri, translateRange)
	);

	// remove no-op edits
	let documentEdits = getDocumentEdits(codeAction, workspaceDocument);
	if (documentEdits) {
		const documentContent = workspaceDocument.value.get();
		documentEdits = documentEdits.filter(edit => documentContent.getValueOfRange(edit.range) !== edit.text);
	}

	const codeActionData = new CodeActionData(
		codeAction.title,
		diagnostics,
		documentEdits,
	);
	return codeActionData;
}

function getCommandDiagnostics(codeAction: CodeAction, uri: URI, translateRange: (range: Range) => OffsetRange | undefined): DiagnosticData[] {
	const commandArgs = codeAction.command?.arguments || [];

	return coalesce(commandArgs.map(arg => {
		if (arg && typeof arg === 'object' && 'diagnostic' in arg) {
			const diagnostic = arg.diagnostic;
			// @benibenj Can we not check `diagnostic instanceOf vscode.Diagnostic?
			if (diagnostic && typeof diagnostic === 'object' && 'range' in diagnostic && 'message' in diagnostic && 'severity' in diagnostic) {
				return toDiagnosticData(diagnostic, uri, translateRange);
			}
		}
	}));
}

function getDocumentEdits(codeAction: CodeAction, workspaceDocument: IVSCodeObservableDocument): TextReplacement[] | undefined {
	const edit = codeAction.edit;
	if (!edit) {
		return undefined;
	}

	if (workspaceDocument instanceof VSCodeObservableTextDocument) {
		return edit.get(workspaceDocument.id.toUri()).map(e => toInternalTextEdit(e.range, e.newText));
	} else if (workspaceDocument instanceof VSCodeObservableNotebookDocument) {
		const edits = coalesce(workspaceDocument.notebook.getCells().flatMap(cell =>
			edit.get(cell.document.uri).map(e => {
				const range = workspaceDocument.toRange(cell.document, e.range);
				return range ? toInternalTextEdit(range, e.newText) : undefined;
			})
		));
		return edits.length ? edits : undefined;
	}
}

async function getQuickFixCodeActions(uri: Uri, range: Range, itemResolveCount: number): Promise<CodeAction[]> {
	return asPromise(
		() => commands.executeCommand<CodeAction[]>(
			'vscode.executeCodeActionProvider',
			uri,
			range,
			CodeActionKind.QuickFix.value,
			itemResolveCount
		)
	);
}
