/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from '../../../base/common/arrays.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ExtHostEditorsShape, IEditorPropertiesChangeData, IMainContext, ITextDocumentShowOptions, ITextEditorDiffInformation, ITextEditorPositionData, MainContext, MainThreadTextEditorsShape } from './extHost.protocol.js';
import { ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import { ExtHostTextEditor, TextEditorDecorationType } from './extHostTextEditor.js';
import * as TypeConverters from './extHostTypeConverters.js';
import { TextEditorSelectionChangeKind, TextEditorChangeKind } from './extHostTypes.js';
import * as vscode from 'vscode';

export class ExtHostEditors extends Disposable implements ExtHostEditorsShape {

	private readonly _onDidChangeTextEditorSelection = new Emitter<Omit<vscode.TextEditorSelectionChangeEvent, 'textEditor'>&{textEditor: ExtHostTextEditor}>();
	private readonly _onDidChangeTextEditorOptions = new Emitter<Omit<vscode.TextEditorOptionsChangeEvent, 'textEditor'>&{textEditor: ExtHostTextEditor}>();
	private readonly _onDidChangeTextEditorVisibleRanges = new Emitter<Omit<vscode.TextEditorVisibleRangesChangeEvent, 'textEditor'>&{textEditor: ExtHostTextEditor}>();
	private readonly _onDidChangeTextEditorViewColumn = new Emitter<Omit<vscode.TextEditorViewColumnChangeEvent, 'textEditor'>&{textEditor: ExtHostTextEditor}>();
	private readonly _onDidChangeTextEditorDiffInformation = new Emitter<Omit<vscode.TextEditorDiffInformationChangeEvent, 'textEditor'>&{textEditor: ExtHostTextEditor}>();
	private readonly _onDidChangeActiveTextEditor = new Emitter<ExtHostTextEditor | undefined>();
	private readonly _onDidChangeVisibleTextEditors = new Emitter<readonly ExtHostTextEditor[]>();

	readonly onDidChangeTextEditorSelection: Event<Omit<vscode.TextEditorSelectionChangeEvent, 'textEditor'>&{textEditor: ExtHostTextEditor}> = this._onDidChangeTextEditorSelection.event;
	readonly onDidChangeTextEditorOptions: Event<Omit<vscode.TextEditorOptionsChangeEvent, 'textEditor'>&{textEditor: ExtHostTextEditor}> = this._onDidChangeTextEditorOptions.event;
	readonly onDidChangeTextEditorVisibleRanges: Event<Omit<vscode.TextEditorVisibleRangesChangeEvent, 'textEditor'>&{textEditor: ExtHostTextEditor}> = this._onDidChangeTextEditorVisibleRanges.event;
	readonly onDidChangeTextEditorViewColumn: Event<Omit<vscode.TextEditorViewColumnChangeEvent, 'textEditor'>&{textEditor: ExtHostTextEditor}> = this._onDidChangeTextEditorViewColumn.event;
	readonly onDidChangeTextEditorDiffInformation: Event<Omit<vscode.TextEditorDiffInformationChangeEvent, 'textEditor'>&{textEditor: ExtHostTextEditor}> = this._onDidChangeTextEditorDiffInformation.event;
	readonly onDidChangeActiveTextEditor: Event<ExtHostTextEditor | undefined> = this._onDidChangeActiveTextEditor.event;
	readonly onDidChangeVisibleTextEditors: Event<readonly ExtHostTextEditor[]> = this._onDidChangeVisibleTextEditors.event;

	private readonly _proxy: MainThreadTextEditorsShape;

	constructor(
		mainContext: IMainContext,
		private readonly _extHostDocumentsAndEditors: ExtHostDocumentsAndEditors,
	) {
		super();
		this._proxy = mainContext.getProxy(MainContext.MainThreadTextEditors);

		this._register(this._extHostDocumentsAndEditors.onDidChangeVisibleTextEditors(e => this._onDidChangeVisibleTextEditors.fire(e)));
		this._register(this._extHostDocumentsAndEditors.onDidChangeActiveTextEditor(e => this._onDidChangeActiveTextEditor.fire(e)));
	}

	getActiveTextEditor(extensionId: ExtensionIdentifier|string|null): vscode.TextEditor | undefined {
		return this._extHostDocumentsAndEditors.activeEditor(extensionId);
	}

	getVisibleTextEditors(extensionId: ExtensionIdentifier|string|null): vscode.TextEditor[];
	getVisibleTextEditors(internal: true): ExtHostTextEditor[];
	getVisibleTextEditors(internalOrExtensionId: true|ExtensionIdentifier|string|null): ExtHostTextEditor[] | vscode.TextEditor[] {
		const editors = this._extHostDocumentsAndEditors.allEditors(extensionId);
		return internalOrExtensionId === true
			? editors
			: editors.map(editor => editor.value(extensionId));
	}

	showTextDocument(extensionId: ExtensionIdentifier|string|null, document: vscode.TextDocument, column: vscode.ViewColumn, preserveFocus: boolean): Promise<vscode.TextEditor>;
	showTextDocument(extensionId: ExtensionIdentifier|string|null, document: vscode.TextDocument, options: { column: vscode.ViewColumn; preserveFocus: boolean; pinned: boolean }): Promise<vscode.TextEditor>;
	showTextDocument(extensionId: ExtensionIdentifier|string|null, document: vscode.TextDocument, columnOrOptions: vscode.ViewColumn | vscode.TextDocumentShowOptions | undefined, preserveFocus?: boolean): Promise<vscode.TextEditor>;
	async showTextDocument(extensionId: ExtensionIdentifier|string|null, document: vscode.TextDocument, columnOrOptions: vscode.ViewColumn | vscode.TextDocumentShowOptions | undefined, preserveFocus?: boolean): Promise<vscode.TextEditor> {
		let options: ITextDocumentShowOptions;
		if (typeof columnOrOptions === 'number') {
			options = {
				position: TypeConverters.ViewColumn.from(columnOrOptions),
				preserveFocus
			};
		} else if (typeof columnOrOptions === 'object') {
			options = {
				position: TypeConverters.ViewColumn.from(columnOrOptions.viewColumn),
				preserveFocus: columnOrOptions.preserveFocus,
				selection: typeof columnOrOptions.selection === 'object' ? TypeConverters.Range.from(columnOrOptions.selection) : undefined,
				pinned: typeof columnOrOptions.preview === 'boolean' ? !columnOrOptions.preview : undefined
			};
		} else {
			options = {
				preserveFocus: false
			};
		}

		const editorId = await this._proxy.$tryShowTextDocument(document.uri, options);
		const editor = editorId && this._extHostDocumentsAndEditors.getEditor(editorId);
		if (editor) {
			return editor.value(extensionId);
		}
		// we have no editor... having an id means that we had an editor
		// on the main side and that it isn't the current editor anymore...
		if (editorId) {
			throw new Error(`Could NOT open editor for "${document.uri.toString()}" because another editor opened in the meantime.`);
		} else {
			throw new Error(`Could NOT open editor for "${document.uri.toString()}".`);
		}
	}

	createTextEditorDecorationType(extension: IExtensionDescription, options: vscode.DecorationRenderOptions): vscode.TextEditorDecorationType {
		return new TextEditorDecorationType(this._proxy, extension, options).value;
	}

	// --- called from main thread

	$acceptEditorPropertiesChanged(id: string, data: IEditorPropertiesChangeData): void {
		const textEditor = this._extHostDocumentsAndEditors.getEditor(id);
		if (!textEditor) {
			throw new Error('unknown text editor');
		}

		// (1) set all properties
		if (data.options) {
			textEditor._acceptOptions(data.options);
		}
		if (data.selections) {
			const selections = data.selections.selections.map(TypeConverters.Selection.to);
			textEditor._acceptSelections(selections);
		}
		if (data.visibleRanges) {
			const visibleRanges = arrays.coalesce(data.visibleRanges.map(TypeConverters.Range.to));
			textEditor._acceptVisibleRanges(visibleRanges);
		}

		// (2) fire change events
		if (data.options) {
			this._onDidChangeTextEditorOptions.fire({
				textEditor: textEditor,
				options: { ...data.options, lineNumbers: TypeConverters.TextEditorLineNumbersStyle.to(data.options.lineNumbers) }
			});
		}
		if (data.selections) {
			const kind = TextEditorSelectionChangeKind.fromValue(data.selections.source);
			const selections = data.selections.selections.map(TypeConverters.Selection.to);
			this._onDidChangeTextEditorSelection.fire({
				textEditor: textEditor,
				selections,
				kind
			});
		}
		if (data.visibleRanges) {
			const visibleRanges = arrays.coalesce(data.visibleRanges.map(TypeConverters.Range.to));
			this._onDidChangeTextEditorVisibleRanges.fire({
				textEditor: textEditor,
				visibleRanges
			});
		}
	}

	$acceptEditorPositionData(data: ITextEditorPositionData): void {
		for (const id in data) {
			const textEditor = this._extHostDocumentsAndEditors.getEditor(id);
			if (!textEditor) {
				throw new Error('Unknown text editor');
			}
			const viewColumn = TypeConverters.ViewColumn.to(data[id]);
			if (textEditor.value(null).viewColumn !== viewColumn) {
				textEditor._acceptViewColumn(viewColumn);
				this._onDidChangeTextEditorViewColumn.fire({ textEditor, viewColumn });
			}
		}
	}

	$acceptEditorDiffInformation(id: string, diffInformation: ITextEditorDiffInformation[] | undefined): void {
		const textEditor = this._extHostDocumentsAndEditors.getEditor(id);
		if (!textEditor) {
			throw new Error('unknown text editor');
		}

		if (!diffInformation) {
			textEditor._acceptDiffInformation(undefined);
			this._onDidChangeTextEditorDiffInformation.fire({
				textEditor,
				diffInformation: undefined
			});
			return;
		}

		const that = this;
		const result = diffInformation.map(diff => {
			const original = URI.revive(diff.original);
			const modified = URI.revive(diff.modified);

			const changes = diff.changes.map(change => {
				const [originalStartLineNumber, originalEndLineNumberExclusive, modifiedStartLineNumber, modifiedEndLineNumberExclusive] = change;

				let kind: vscode.TextEditorChangeKind;
				if (originalStartLineNumber === originalEndLineNumberExclusive) {
					kind = TextEditorChangeKind.Addition;
				} else if (modifiedStartLineNumber === modifiedEndLineNumberExclusive) {
					kind = TextEditorChangeKind.Deletion;
				} else {
					kind = TextEditorChangeKind.Modification;
				}

				return {
					original: {
						startLineNumber: originalStartLineNumber,
						endLineNumberExclusive: originalEndLineNumberExclusive
					},
					modified: {
						startLineNumber: modifiedStartLineNumber,
						endLineNumberExclusive: modifiedEndLineNumberExclusive
					},
					kind
				} satisfies vscode.TextEditorChange;
			});

			return Object.freeze({
				documentVersion: diff.documentVersion,
				original,
				modified,
				changes,
				get isStale(): boolean {
					const document = that._extHostDocumentsAndEditors.getDocument(modified);
					return document?.version !== diff.documentVersion;
				}
			});
		});

		textEditor._acceptDiffInformation(result);
		this._onDidChangeTextEditorDiffInformation.fire({
			textEditor,
			diffInformation: result
		});
	}

	getDiffInformation(id: string): Promise<vscode.LineChange[]> {
		return Promise.resolve(this._proxy.$getDiffInformation(id));
	}
}
