/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import type * as vscode from 'vscode';
import { getLanguage, getLanguageForResource, ILanguage } from '../../../util/common/languages';
import { getLanguageId } from '../../../util/common/markdown';
import { ExtHostNotebookDocumentData } from '../../../util/common/test/shims/notebookDocument';
import { ExtHostNotebookEditor } from '../../../util/common/test/shims/notebookEditor';
import { createTextDocumentData, IExtHostDocumentData, setDocText } from '../../../util/common/test/shims/textDocument';
import { ExtHostTextEditor } from '../../../util/common/test/shims/textEditor';
import { isUri } from '../../../util/common/types';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { Schemas } from '../../../util/vs/base/common/network';
import * as path from '../../../util/vs/base/common/path';
import { isString } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../util/vs/platform/instantiation/common/descriptors';
import { Range, Selection, Uri } from '../../../vscodeTypes';
import { IDebugOutputService } from '../../debug/common/debugOutputService';
import { IDialogService } from '../../dialog/common/dialogService';
import { IDiffService } from '../../diff/common/diffService';
import { DiffServiceImpl } from '../../diff/node/diffServiceImpl';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { IGitService } from '../../git/common/gitService';
import { ILanguageDiagnosticsService } from '../../languages/common/languageDiagnosticsService';
import { ILanguageFeaturesService } from '../../languages/common/languageFeaturesService';
import { IAlternativeNotebookContentService } from '../../notebook/common/alternativeContent';
import { AlternativeNotebookContentEditGenerator, IAlternativeNotebookContentEditGenerator } from '../../notebook/common/alternativeContentEditGenerator';
import { INotebookService } from '../../notebook/common/notebookService';
import { IReviewService } from '../../review/common/reviewService';
import { ISearchService } from '../../search/common/searchService';
import { ITabsAndEditorsService } from '../../tabs/common/tabsAndEditorsService';
import { ITerminalService } from '../../terminal/common/terminalService';
import { NullWorkspaceMutationManager } from '../../testing/common/nullWorkspaceMutationManager';
import { IWorkspaceMutationManager } from '../../testing/common/workspaceMutationManager';
import { ISetupTestsDetector, NullSetupTestsDetector } from '../../testing/node/setupTestDetector';
import { ITestDepsResolver, TestDepsResolver } from '../../testing/node/testDepsResolver';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { IDeserializedWorkspaceState } from './promptContextModel';
import { TestingServiceCollection } from './services';
import { SimulationAlternativeNotebookContentService, SimulationFileSystemAdaptor, SimulationLanguageDiagnosticsService, SimulationNotebookService, SimulationReviewService, SimulationWorkspaceService, SnapshotSearchService, TestingDebugOutputService, TestingDialogService, TestingGitService, TestingLanguageService, TestingTabsAndEditorsService, TestingTerminalService, WORKSPACE_PATH } from './simulationWorkspaceServices';

export interface IRelativeFile {
	readonly kind: 'relativeFile';
	readonly fileName: string;
	readonly fileContents: string;
	readonly languageId?: string;
}

export interface IQualifiedFile {
	readonly kind: 'qualifiedFile';
	readonly uri: Uri;
	readonly fileContents: string;
	readonly languageId?: string;
}

export function isQualifiedFile(file: any): file is IQualifiedFile {
	return file && file.kind === 'qualifiedFile' && isUri(file.uri) && isString(file.fileContents) && (file.languageId === undefined || isString(file.languageId));
}

export function isRelativeFile(file: any): file is IRelativeFile {
	return file && file.kind === 'relativeFile' && isString(file.fileName) && isString(file.fileContents) && (file.languageId === undefined || isString(file.languageId));
}

export type IFile = IRelativeFile | IQualifiedFile;

function getWorkspaceFolderPath(workspaceFolders: Uri[] | undefined): string {
	let workspaceFolder = WORKSPACE_PATH;
	if (workspaceFolders) {
		assert.ok(workspaceFolders.length === 1, 'filePathToUri: not sure how to pick a workspace folder when there are multiple possible');
		workspaceFolder = workspaceFolders[0].path;
	}
	return workspaceFolder;
}

function filePathToUri(filePath: string, workspaceFolders: Uri[] | undefined): vscode.Uri {
	const workspaceFolder = getWorkspaceFolderPath(workspaceFolders);
	if (filePath.includes('#index')) {
		// this is a notebook cell. filePath: errors#index2.py
		const parts = filePath.split('#');
		const fileName = parts[0] + '.ipynb';
		const index = parts[1].replace('.py', '');
		return Uri.file(path.join(workspaceFolder, fileName)).with({ scheme: Schemas.vscodeNotebookCell, fragment: index });
	}
	return Uri.file(path.join(workspaceFolder, filePath));
}

function uriToFilePath(uri: vscode.Uri, workspaceFolders: Uri[] | undefined): string {
	const workspaceFolder = getWorkspaceFolderPath(workspaceFolders);
	if (uri.scheme === Schemas.vscodeNotebookCell) {
		// we need to append fragment to the path
		const filePathWithoutSuffix = uri.fsPath.substring(workspaceFolder.length, uri.fsPath.length - '.ipynb'.length);
		return `${filePathWithoutSuffix}#${uri.fragment}.py`;
	}

	return uri.fsPath.substring(workspaceFolder.length);
}

export function isNotebook(file: string | vscode.Uri | vscode.TextDocument) {
	if (typeof file === 'string') {
		return file.endsWith('.ipynb');
	}

	if ('path' in file) {
		return file.path.endsWith('.ipynb');
	}

	return file.uri.scheme === Schemas.vscodeNotebookCell || file.uri.fsPath.endsWith('.ipynb');
}

export class SimulationWorkspace extends Disposable {

	private readonly _onDidChangeDiagnostics = this._register(new Emitter<vscode.DiagnosticChangeEvent>());
	public readonly onDidChangeDiagnostics = this._onDidChangeDiagnostics.event;

	private _workspaceState: IDeserializedWorkspaceState | undefined;
	private _workspaceFolders: Uri[] | undefined;
	private readonly _docs = new ResourceMap<IExtHostDocumentData>();
	private readonly _notebooks = new ResourceMap<ExtHostNotebookDocumentData>();
	private _diagnostics = new ResourceMap<vscode.Diagnostic[]>();
	private currentEditor: ExtHostTextEditor | undefined = undefined;
	private currentNotebookEditor: ExtHostNotebookEditor | undefined = undefined;

	public get repositories() { return this._workspaceState?.repositories; }
	public get workspaceSymbols() { return this._workspaceState?.workspaceSymbols; }
	public get debugConsoleOutput() { return this._workspaceState?.debugConsoleOutput; }
	public get terminalBuffer() { return this._workspaceState?.terminalBuffer; }
	public get terminalLastCommand() { return this._workspaceState?.terminalLastCommand; }
	public get terminalSelection() { return this._workspaceState?.terminalSelection; }
	public get terminalShellType() { return this._workspaceState?.terminalShellType; }
	public get changeFiles() { return this._workspaceState?.changeFiles; }
	public get lsifIndex() { return this._workspaceState?.lsifIndex; }
	public get testFailures() { return this._workspaceState?.testFailures; }
	public get workspaceFolderPath() { return this._workspaceState?.workspaceFolderPath; }

	public get documents(): IExtHostDocumentData[] {
		return Array.from(this._docs.values());
	}

	public get activeTextEditor(): vscode.TextEditor | undefined {
		return this.currentEditor?.value;
	}

	public get activeNotebookEditor(): vscode.NotebookEditor | undefined {
		return this.currentNotebookEditor?.apiEditor;
	}

	public get workspaceFolders() {
		return this._workspaceFolders ?? [filePathToUri('/', this._workspaceFolders)];
	}

	public get activeFileDiagnostics(): vscode.Diagnostic[] {
		const uri = this.currentEditor?.value.document.uri;
		if (!uri) {
			return [];
		}
		return this._diagnostics.get(uri) ?? [];
	}

	constructor() {
		super();
		this._clear();
	}

	public override dispose(): void {
		super.dispose();
		this._clear();
	}

	/**
	 * Clear out all fields.
	 */
	private _clear() {
		this._workspaceState = undefined;
		this._workspaceFolders = undefined;
		this._docs.clear();
		this._notebooks.clear();
		this._diagnostics = new ResourceMap<vscode.Diagnostic[]>();
		this.currentEditor = undefined;
		this.currentNotebookEditor = undefined;
	}

	public setupServices(testingServiceCollection: TestingServiceCollection) {
		testingServiceCollection.define(IFileSystemService, new SyncDescriptor(SimulationFileSystemAdaptor, [this]));
		testingServiceCollection.define(IWorkspaceService, new SyncDescriptor(SimulationWorkspaceService, [this]));
		testingServiceCollection.define(INotebookService, new SyncDescriptor(SimulationNotebookService, [this]));
		testingServiceCollection.define(ILanguageFeaturesService, new SyncDescriptor(TestingLanguageService, [this]));
		testingServiceCollection.define(ISearchService, new SyncDescriptor(SnapshotSearchService));
		testingServiceCollection.define(ITabsAndEditorsService, new SyncDescriptor(
			TestingTabsAndEditorsService,
			[{
				getActiveTextEditor: () => this.activeTextEditor,
				getVisibleTextEditors: () => this.activeTextEditor ? [this.activeTextEditor] : [],
				getActiveNotebookEditor: () => this.activeNotebookEditor
			}]
		));
		testingServiceCollection.define(ILanguageDiagnosticsService, new SyncDescriptor(SimulationLanguageDiagnosticsService, [this]));
		testingServiceCollection.define(ITerminalService, new SyncDescriptor(TestingTerminalService, [this]));
		testingServiceCollection.define(IDebugOutputService, new SyncDescriptor(TestingDebugOutputService, [this]));
		testingServiceCollection.define(IGitService, new SyncDescriptor(TestingGitService, [this]));
		testingServiceCollection.define(IDialogService, new SyncDescriptor(TestingDialogService));
		testingServiceCollection.define(ITestDepsResolver, new SyncDescriptor(TestDepsResolver));
		testingServiceCollection.define(ISetupTestsDetector, new SyncDescriptor(NullSetupTestsDetector));
		testingServiceCollection.define(IWorkspaceMutationManager, new SyncDescriptor(NullWorkspaceMutationManager));
		testingServiceCollection.define(IReviewService, new SyncDescriptor(SimulationReviewService));
		testingServiceCollection.define(IAlternativeNotebookContentService, new SyncDescriptor(SimulationAlternativeNotebookContentService));
		testingServiceCollection.define(IAlternativeNotebookContentEditGenerator, new SyncDescriptor(AlternativeNotebookContentEditGenerator));
		testingServiceCollection.define(IDiffService, new SyncDescriptor(DiffServiceImpl));
	}

	public resetFromDeserializedWorkspaceState(workspaceState: IDeserializedWorkspaceState | undefined) {
		this._clear();
		if (workspaceState) {
			this._workspaceState = workspaceState;
			this._workspaceFolders = workspaceState.workspaceFolders;
			if (workspaceState.activeTextEditor) {
				const sourceDoc = workspaceState.activeTextEditor.document;
				const doc = createTextDocumentData(sourceDoc.uri, sourceDoc.getText(), sourceDoc.languageId);
				this.addDocument(doc);
				this.setCurrentDocument(doc.document.uri);
				this.setCurrentSelection(workspaceState.activeTextEditor.selection);
				this.setCurrentVisibleRanges(workspaceState.activeTextEditor.visibleRanges);
			}
			if (workspaceState.textDocumentFilePaths) {
				for (const filePath of workspaceState.textDocumentFilePaths) {
					if (workspaceState.workspaceFolderPath && workspaceState.workspaceFolders) {
						const fileContents = fs.readFileSync(path.join(workspaceState.workspaceFolderPath, filePath), 'utf8');
						const documentUri = URI.joinPath(workspaceState.workspaceFolders[0], filePath);
						const doc = createTextDocumentData(documentUri, fileContents, getLanguageId(documentUri));
						this.addDocument(doc);
					}
				}
			}
			if (workspaceState.activeFileDiagnostics && workspaceState.activeFileDiagnostics.length > 0) {
				if (!workspaceState.activeTextEditor) {
					throw new Error(`Cannot have active file diagnostics without an active text editor!`);
				}
				this.setDiagnostics(new ResourceMap<vscode.Diagnostic[]>([
					[workspaceState.activeTextEditor.document.uri, workspaceState.activeFileDiagnostics]
				]));
			}
			for (const notebookDoc of workspaceState.__notebookExtHostDocuments) {
				this._notebooks.set(notebookDoc.uri, notebookDoc);
			}
			if (workspaceState.activeNotebookEditor) {
				const sourceDocUri = workspaceState.activeNotebookEditor.notebook.uri;
				this.setCurrentNotebookDocument(this.getNotebook(sourceDocUri));
				this.setCurrentNotebookSelection(workspaceState.activeNotebookEditor.selections);
			}
		}
	}

	public resetFromFiles(files: IFile[], workspaceFolders: Uri[] | undefined) {
		this._clear();

		if (workspaceFolders !== undefined) {
			assert(workspaceFolders.length > 0, 'workspaceFolders must not be empty');
			this._workspaceFolders = workspaceFolders;
		}

		for (const file of files) {
			if (file.kind === 'qualifiedFile') {
				if (isNotebook(file.uri)) {
					this._setNotebookFile(file.uri, file.fileContents);
				} else {
					const language = file.languageId ? getLanguage(file.languageId) : getLanguageForFile(file);
					const doc = createTextDocumentData(
						file.uri,
						file.fileContents,
						language.languageId
					);
					this._docs.set(doc.document.uri, doc);
				}
			} else if (isNotebook(file.fileName)) {
				this._setNotebookFile(this.getUriFromFilePath(file.fileName), file.fileContents);
			} else {
				const language = getLanguageForFile(file);
				const doc = createTextDocumentData(
					this.getUriFromFilePath(file.fileName),
					file.fileContents,
					language.languageId
				);
				this._docs.set(doc.document.uri, doc);
			}
		}
	}

	private _setNotebookFile(uri: vscode.Uri, contents: string) {
		const notebook = ExtHostNotebookDocumentData.createJupyterNotebook(uri, contents);
		for (let index = 0; index < notebook.cells.length; index++) {
			const cell = notebook.cellAt(index);
			this._docs.set(cell.documentData.document.uri, cell.documentData);
		}
		this._notebooks.set(notebook.uri, notebook);

		const doc = createTextDocumentData(
			uri,
			contents,
			'json'
		);
		this._docs.set(doc.document.uri, doc);
	}

	public setCurrentDocument(uri: vscode.Uri): void {
		if (uri.toString() === this.currentEditor?.value.document.uri.toString()) {
			// no change
			return;
		}
		const doc = this.getDocument(uri);
		this.currentEditor = new ExtHostTextEditor(
			doc.document,
			[],
			{},
			[],
			undefined
		);
	}

	public setCurrentDocumentIndentInfo(options: vscode.FormattingOptions): void {
		if (!this.currentEditor) {
			throw new Error('cannot set doc indent info before there is a document');
		}
		this.currentEditor?._acceptOptions(options);
	}

	public setCurrentSelection(selection: vscode.Selection): void {
		if (this.currentEditor) {
			this.currentEditor._acceptSelections([selection]);
		}
	}

	public setCurrentVisibleRanges(visibleRanges: readonly vscode.Range[]): void {
		if (this.currentEditor) {
			this.currentEditor._acceptVisibleRanges(visibleRanges);
		}
	}

	public setDiagnostics(diagnostics: ResourceMap<vscode.Diagnostic[]>): void {
		const changedUris = new ResourceMap<vscode.Uri>();
		for (const uri of this._diagnostics.keys()) {
			changedUris.set(uri, uri);
		}
		for (const uri of diagnostics.keys()) {
			changedUris.set(uri, uri);
		}
		const changeEvent: vscode.DiagnosticChangeEvent = {
			uris: Array.from(changedUris.values())
		};
		this._diagnostics = diagnostics;
		this._onDidChangeDiagnostics.fire(changeEvent);
	}

	public getDiagnostics(uri: Uri): vscode.Diagnostic[] {
		return this._diagnostics.get(uri) ?? [];
	}

	public getAllDiagnostics(): [vscode.Uri, vscode.Diagnostic[]][] {
		return Array.from(this._diagnostics.entries());
	}

	public getDocument(filePathOrUri: string | vscode.Uri): IExtHostDocumentData {
		const queryUri = typeof filePathOrUri === 'string' ? this.getUriFromFilePath(filePathOrUri) : filePathOrUri;
		const candidateFile = this._docs.get(queryUri);
		if (!candidateFile) {
			throw new Error(`Missing file ${JSON.stringify(filePathOrUri, null, '\t')}\n\nHave ${Array.from(this._docs.keys()).map(k => k.toString()).join('\n')}`);
		}
		return candidateFile;
	}

	public hasDocument(uri: vscode.Uri): boolean {
		return this._docs.has(uri);
	}

	public addDocument(doc: IExtHostDocumentData): void {
		this._docs.set(doc.document.uri, doc);
	}

	public hasNotebookDocument(uri: vscode.Uri): boolean {
		return this._notebooks.has(uri);
	}

	public getNotebookDocuments(): readonly vscode.NotebookDocument[] {
		return Array.from(this._notebooks.values()).map(data => data.document);
	}

	public addNotebookDocument(notebook: ExtHostNotebookDocumentData): void {
		this._notebooks.set(notebook.uri, notebook);
	}

	public tryGetNotebook(filePathOrUri: string | vscode.Uri): ExtHostNotebookDocumentData | undefined {
		const queryUri = typeof filePathOrUri === 'string' ? this.getUriFromFilePath(filePathOrUri) : filePathOrUri;
		if (queryUri.scheme === Schemas.vscodeNotebookCell) {
			// loop through notebooks to find the one matching the path
			for (const notebook of this._notebooks.values()) {
				if (notebook.uri.path === queryUri.path) {
					// found it
					return notebook;
				}
			}
		}

		return this._notebooks.get(queryUri);
	}

	public getNotebook(filePathOrUri: string | vscode.Uri): ExtHostNotebookDocumentData {
		const candidateFile = this.tryGetNotebook(filePathOrUri);
		if (!candidateFile) {
			throw new Error(`Missing file ${JSON.stringify(filePathOrUri, null, '\t')}\n\nHave ${Array.from(this._docs.keys()).map(k => k.toString()).join('\n')}`);
		}
		return candidateFile;
	}

	public setCurrentNotebookDocument(notebook: ExtHostNotebookDocumentData): void {
		if (notebook.uri.toString() === this.currentNotebookEditor?.apiEditor.notebook.uri.toString()) {
			// no change
			return;
		}
		const doc = this.getNotebook(notebook.uri);
		this.currentNotebookEditor = new ExtHostNotebookEditor(doc, []);
	}

	public setCurrentNotebookSelection(selections: readonly vscode.NotebookRange[]): void {
		if (this.currentNotebookEditor) {
			this.currentNotebookEditor.apiEditor.selections = selections;
			this.currentNotebookEditor.apiEditor.selection = selections[0];
		}
	}

	public getFilePath(uri: vscode.Uri): string {
		return uriToFilePath(uri, this.workspaceFolders);
	}

	public getUriFromFilePath(filePath: string): vscode.Uri {
		return filePathToUri(filePath, this.workspaceFolders);
	}

	public applyEdits(uri: vscode.Uri, edits: vscode.TextEdit[], initialRange?: vscode.Range): vscode.Range {
		if (uri.toString() === this.currentEditor?.value.document.uri.toString()) {
			return this._applyEditsOnCurrentEditor(this.currentEditor, edits, initialRange);
		}
		const { range } = applyEdits(
			this.getDocument(uri),
			edits,
			initialRange ?? new Range(0, 0, 0, 0),
			new Range(0, 0, 0, 0)
		);
		return range;
	}

	public applyNotebookEdits(uri: vscode.Uri, edits: vscode.NotebookEdit[]) {
		applyNotebookEdits(
			this.getNotebook(uri),
			edits,
			this
		);
	}

	private _applyEditsOnCurrentEditor(editor: ExtHostTextEditor, edits: vscode.TextEdit[], initialRange: vscode.Range | undefined): vscode.Range {
		const { range, selection } = applyEdits(
			this.getDocument(editor.value.document.uri),
			edits,
			initialRange ?? editor.value.selection,
			editor.value.selection
		);
		editor._acceptSelections([selection]);
		return range;
	}

	public mapLocation(uri: Uri, forWriting = false): URI {
		if (this.workspaceFolderPath && uri.scheme === Schemas.file && uri.path.startsWith(WORKSPACE_PATH)) {
			const location = Uri.file(path.join(this.workspaceFolderPath, uri.path.substring(WORKSPACE_PATH.length)));
			if (forWriting) {
				console.log('Warning: Writing to simulation folder');
			}
			return location;
		}
		return uri;
	}
}

/**
 * Apply edits to `file` and return the new range and the new selection.
 */
export function applyEdits(
	doc: IExtHostDocumentData,
	edits: vscode.TextEdit[],
	range: vscode.Range,
	selection: vscode.Range
): { range: vscode.Range; selection: vscode.Selection } {
	const offsetBasedEdits: OffsetBasedEdit[] = edits.map(edit => {
		return {
			range: convertRangeToOffsetBasedRange(doc.document, edit.range),
			text: edit.newText,
		};
	});
	const {
		fileContents: newFileContents,
		range: newRange,
		selection: newSelection,
	} = doApplyEdits(
		doc.getText(),
		offsetBasedEdits,
		convertRangeToOffsetBasedRange(doc.document, range),
		convertRangeToOffsetBasedRange(doc.document, selection)
	);
	setDocText(doc, newFileContents);
	return {
		range: convertOffsetBasedRangeToSelection(doc.document, newRange),
		selection: convertOffsetBasedRangeToSelection(doc.document, newSelection),
	};
}

/**
 * Apply edits to `notebook`.
 */
function applyNotebookEdits(
	doc: ExtHostNotebookDocumentData,
	edits: vscode.NotebookEdit[],
	simulationWorkspace?: SimulationWorkspace
) {
	ExtHostNotebookDocumentData.applyEdits(doc, edits, simulationWorkspace);
}

interface OffsetBasedRange {
	readonly offset: number;
	readonly length: number;
}

function convertRangeToOffsetBasedRange(doc: vscode.TextDocument, range: vscode.Range): OffsetBasedRange {
	const startOffset = doc.offsetAt(range.start);
	const endOffset = doc.offsetAt(range.end);
	return {
		offset: startOffset,
		length: endOffset - startOffset,
	};
}

function convertOffsetBasedRangeToSelection(doc: vscode.TextDocument, range: OffsetBasedRange): vscode.Selection {
	const start = doc.positionAt(range.offset);
	const end = doc.positionAt(range.offset + range.length);
	return new Selection(start, end);
}

interface OffsetBasedEdit {
	range: OffsetBasedRange;
	text: string;
}

function doApplyEdits(
	fileContents: string,
	edits: OffsetBasedEdit[],
	range: OffsetBasedRange,
	selection: OffsetBasedRange
): { fileContents: string; range: OffsetBasedRange; selection: OffsetBasedRange } {
	// Sort edits by start position
	edits.sort((a, b) => {
		return a.range.offset - b.range.offset;
	});

	// Check that edits are not overlapping
	for (let i = 0; i < edits.length - 1; i++) {
		const aRange = edits[i].range;
		const bRange = edits[i + 1].range;
		if (aRange.offset + aRange.length > bRange.offset) {
			throw new Error(`Overlapping edits are not allowed!`);
		}
	}

	// Reduce edits at edges
	for (const edit of edits) {
		const prefixLen = commonPrefixLen(
			fileContents.substring(edit.range.offset, edit.range.offset + edit.range.length),
			edit.text
		);
		edit.range = { offset: edit.range.offset + prefixLen, length: edit.range.length - prefixLen };
		edit.text = edit.text.substring(prefixLen);

		const suffixLen = commonSuffixLen(
			fileContents.substring(edit.range.offset, edit.range.offset + edit.range.length),
			edit.text
		);
		edit.range = { offset: edit.range.offset, length: edit.range.length - suffixLen };
		edit.text = edit.text.substring(0, edit.text.length - suffixLen);
	}

	// Apply edits
	let fileText = fileContents;
	let hasNewSelection = false;
	for (let i = edits.length - 1; i >= 0; i--) {
		const edit = edits[i];
		const { offset, length } = edit.range;
		const editText = edit.text;

		range = adjustRangeAfterEdit(range, edit);

		// apply the edit on the file text
		fileText = fileText.substring(0, offset) + editText + fileText.substring(offset + length);

		if (!hasNewSelection) {
			// selection goes at the end of the inserted text
			const selectionCandidate = { offset: offset + editText.length, length: 0 };

			// a selection is considered only if it is inside the range
			// this is to accomodate edits unrelated to the range
			if (selectionCandidate.offset >= range.offset && selectionCandidate.offset <= range.offset + range.length) {
				selection = selectionCandidate;
				hasNewSelection = true;
			}
		}
	}

	return { fileContents: fileText, range, selection };
}

function adjustRangeAfterEdit(range: OffsetBasedRange, edit: OffsetBasedEdit): OffsetBasedRange {
	const rangeStart = range.offset;
	const rangeEnd = range.offset + range.length;
	const editStart = edit.range.offset;
	const editEnd = edit.range.offset + edit.range.length;
	const editText = edit.text;
	const charDelta = editText.length - edit.range.length;

	if (editEnd < rangeStart) {
		// the edit is before the range, the range is pushed down by the delta
		//                  [---range---]
		//     [---edit---]
		return offsetRangeFromOffsets(rangeStart + charDelta, rangeEnd + charDelta);
	}

	if (editStart <= rangeStart && editEnd <= rangeEnd) {
		// the edit begins before the range, and it intersects the range, but doesn't encompass it
		//                  [---range---]
		//            [---edit---]
		return offsetRangeFromOffsets(editStart, rangeEnd + charDelta);
	}

	if (editStart <= rangeStart && editEnd >= rangeEnd) {
		// the edit begins before the range, and it encompasses the range
		//                  [---range---]
		//            [---edit------------]
		return offsetRangeFromOffsets(editStart, editStart + editText.length);
	}

	if (editStart <= rangeEnd && editEnd <= rangeEnd) {
		// the edit is in the range, and it ends in the range
		//          [-----range-----]
		//            [---edit---]
		return offsetRangeFromOffsets(rangeStart, rangeEnd + charDelta);
	}

	if (editStart <= rangeEnd && editEnd >= rangeEnd) {
		// the edit is in the range, and it ends after the range
		//          [---range---]
		//              [---edit---]
		return offsetRangeFromOffsets(rangeStart, editStart + editText.length);
	}

	if (editStart >= rangeEnd) {
		// the edit begins after the range
		//       [---range---]
		//                      [---edit---]
		return range;
	}

	throw new Error('Unexpected');
}

function offsetRangeFromOffsets(start: number, end: number): OffsetBasedRange {
	return { offset: start, length: end - start };
}

function commonPrefixLen(a: string, b: string): number {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) {
		i++;
	}
	return i;
}

function commonSuffixLen(a: string, b: string): number {
	let i = 0;
	while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) {
		i++;
	}
	return i;
}

export function getLanguageForFile(file: IFile): ILanguage {
	if (file.kind === 'relativeFile') {
		if (file.languageId) {
			return getLanguage(file.languageId);
		}
		return getLanguageForResource(URI.from({ scheme: 'fake', 'path': '/' + file.fileName }));
	} else {
		return getLanguageForResource(file.uri);
	}
}
