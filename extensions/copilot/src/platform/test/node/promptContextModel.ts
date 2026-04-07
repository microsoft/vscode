/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import type * as vscode from 'vscode';
import { ExtHostNotebookDocumentData } from '../../../util/common/test/shims/notebookDocument';
import { ExtHostNotebookEditor } from '../../../util/common/test/shims/notebookEditor';
import { createTextDocumentData } from '../../../util/common/test/shims/textDocument';
import { ExtHostTextEditor } from '../../../util/common/test/shims/textEditor';
import { Event } from '../../../util/vs/base/common/event';
import * as path from '../../../util/vs/base/common/path';
import { isEqual } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { NotebookRange } from '../../../util/vs/workbench/api/common/extHostTypes/notebooks';
import { Diagnostic, DiagnosticRelatedInformation, Location, Range, Selection, SymbolInformation, Uri } from '../../../vscodeTypes';
import { RepoContext } from '../../git/common/gitService';
import type { ISerializedWorkspaceState, IWorkspaceStateChangeFile, IWorkspaceStateTestFailure } from '../../workspaceState/common/promptContextModel';
import { extensionHostWorkspaceUri, isInExtensionHost } from './isInExtensionHost';
import { WORKSPACE_PATH } from './simulationWorkspaceServices';

/**
 * Contains a subset of the properties of the prompt context model.
 * This is what is hydrated from the snapshot to form the testing prompt context model
 */
export interface IDeserializedWorkspaceState {
	// The repo context for each workspace folder. Undefined if the workspace folder is not a git repo
	readonly repositories: Array<RepoContext | undefined> | undefined;
	readonly workspaceFolders: URI[] | undefined;
	readonly workspaceFolderPath: string | undefined;
	readonly activeTextEditor: vscode.TextEditor | undefined;
	readonly __notebookExtHostDocuments: ExtHostNotebookDocumentData[];
	readonly activeNotebookEditor: vscode.NotebookEditor | undefined;
	readonly workspaceSymbols: readonly vscode.SymbolInformation[];
	readonly notebookDocuments: readonly vscode.NotebookDocument[];
	readonly activeFileDiagnostics: vscode.Diagnostic[];
	readonly debugConsoleOutput: string;
	readonly terminalBuffer: string;
	readonly terminalLastCommand: vscode.TerminalExecutedCommand | undefined;
	readonly terminalSelection: string;
	readonly terminalShellType: string;
	readonly changeFiles: IWorkspaceStateChangeFile[];
	readonly textDocumentFilePaths: string[];
	readonly lsifIndex: string | undefined;
	readonly testFailures: IWorkspaceStateTestFailure[] | undefined;
}

function copyFolderContents(src: string, dest: string) {
	if (src === dest) {
		return;
	}
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		fs.cpSync(srcPath, destPath, { recursive: true });
	}
}

export function deserializeWorkbenchState(scenarioFolderPath: string, stateFilePath: string): IDeserializedWorkspaceState {
	const state: ISerializedWorkspaceState = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));

	if (state.workspaceFoldersFilePaths && state.workspaceFoldersFilePaths.length > 1) {
		throw new Error('Currently only supporting a single workspace folder');
	}

	// workspace folder is relative to the scenario folder
	let workspaceFolderPath = state.workspaceFoldersFilePaths ? path.join(scenarioFolderPath, state.workspaceFoldersFilePaths[0]) : scenarioFolderPath;
	let workspaceFolderUri = state.workspaceFolderFilePath ? Uri.file(path.join(scenarioFolderPath, state.workspaceFolderFilePath)) : URI.file(WORKSPACE_PATH);
	let workspaceFolders = [workspaceFolderUri];

	if (isInExtensionHost) {
		workspaceFolderUri = extensionHostWorkspaceUri();
		copyFolderContents(workspaceFolderPath, workspaceFolderUri.fsPath);
		workspaceFolderPath = workspaceFolderUri.fsPath;
		workspaceFolders = [workspaceFolderUri];
	}

	// all other resources are relative to the workspace folder
	function readFileSync(filePath: string) {
		return fs.readFileSync(path.join(workspaceFolderPath, filePath), 'utf8');
	}

	const repositories = state?.repoContexts;
	const activeFileDiagnostics = state.activeFileDiagnostics?.map(diagnostic => {
		const relatedInformation = diagnostic.relatedInformation?.map(relatedInfo => (new DiagnosticRelatedInformation(
			new Location(
				Uri.joinPath(workspaceFolderUri, relatedInfo.filePath),
				new Range(relatedInfo.start.line, relatedInfo.start.character, relatedInfo.end.line, relatedInfo.end.character)
			),
			relatedInfo.message
		)));
		const diag = new Diagnostic(new Range(diagnostic.start.line, diagnostic.start.character, diagnostic.end.line, diagnostic.end.character), diagnostic.message, diagnostic.severity);
		diag.relatedInformation = relatedInformation;
		return diag;
	});
	const workspaceSymbols = (state.symbols ?? []).map(symbol => {
		return new SymbolInformation(
			symbol.name,
			symbol.kind,
			new Range(symbol.start.line, symbol.start.character, symbol.end.line, symbol.end.character),
			Uri.joinPath(workspaceFolderUri, symbol.filePath),
			symbol.containerName,
		);
	});

	const terminalLastCommand = state.terminalLastCommand ? { terminal: null!, ...state.terminalLastCommand } : undefined;

	const notebookExtHostDocuments = state.notebookDocumentFilePaths?.map((path: string) => {
		const fileContents = readFileSync(path);
		const notebookFileUri = URI.joinPath(workspaceFolderUri, path);
		const notebook = ExtHostNotebookDocumentData.createJupyterNotebook(notebookFileUri, fileContents);
		return notebook;
	}) ?? [];

	const notebookDocuments = notebookExtHostDocuments.map(doc => doc.document);
	let extHostNotebookEditor: ExtHostNotebookEditor | undefined;

	if (state.activeNotebookEditor) {
		const activeNotebookEditor = state.activeNotebookEditor;
		const notebookFileUri = URI.joinPath(workspaceFolderUri, activeNotebookEditor.documentFilePath);

		let activeNotebookDocument = notebookExtHostDocuments.find(doc => isEqual(doc.document.uri, notebookFileUri));

		if (!activeNotebookDocument) {
			const fileContents = readFileSync(activeNotebookEditor.documentFilePath);
			activeNotebookDocument = ExtHostNotebookDocumentData.createJupyterNotebook(notebookFileUri, fileContents);
			notebookExtHostDocuments.push(activeNotebookDocument);
		}

		extHostNotebookEditor = new ExtHostNotebookEditor(activeNotebookDocument, activeNotebookEditor.selections.map(selection => new NotebookRange(selection.start, selection.end)));
	}

	// No active text editor so skip constructing one
	if (!state.activeTextEditor) {
		return {
			activeFileDiagnostics,
			workspaceSymbols,
			activeTextEditor: undefined,
			__notebookExtHostDocuments: notebookExtHostDocuments,
			activeNotebookEditor: extHostNotebookEditor?.apiEditor,
			terminalBuffer: state.terminalBuffer,
			terminalLastCommand,
			terminalSelection: state.terminalSelection,
			terminalShellType: state.terminalShellType,
			debugConsoleOutput: state.debugConsoleOutput,
			repositories,
			notebookDocuments,
			workspaceFolders,
			workspaceFolderPath,
			textDocumentFilePaths: state.textDocumentFilePaths || [],
			changeFiles: state.changeFiles || [],
			lsifIndex: state.lsifIndex,
			testFailures: state.testFailures,
		};
	}
	const fileContents = readFileSync(state.activeTextEditor.documentFilePath);
	const activeEditorFileUri = URI.joinPath(workspaceFolderUri, state.activeTextEditor.documentFilePath);
	const selections: Selection[] = [];
	for (const selection of state.activeTextEditor.selections) {
		const mockSelection = new Selection(
			selection.anchor.line,
			selection.anchor.character,
			selection.active.line,
			selection.active.character
		);
		selections.push(mockSelection);
	}

	const visibleRanges: Range[] = [];
	for (const visibleRange of state.activeTextEditor.visibleRanges) {
		const mockRange = new Range(
			visibleRange.start.line,
			visibleRange.start.character,
			visibleRange.end.line,
			visibleRange.end.character
		);
		visibleRanges.push(mockRange);
	}
	const mockTextDocument = createTextDocumentData(
		activeEditorFileUri,
		fileContents,
		state.activeTextEditor.languageId,
	).document;
	const mockTextEditor = new ExtHostTextEditor(mockTextDocument, selections, {}, visibleRanges, undefined).value;
	return {
		activeFileDiagnostics,
		workspaceSymbols,
		activeTextEditor: mockTextEditor,
		__notebookExtHostDocuments: notebookExtHostDocuments,
		activeNotebookEditor: extHostNotebookEditor?.apiEditor,
		terminalBuffer: state.terminalBuffer,
		terminalLastCommand,
		terminalSelection: state.terminalSelection,
		terminalShellType: state.terminalShellType,
		debugConsoleOutput: state.debugConsoleOutput,
		repositories,
		notebookDocuments,
		workspaceFolders,
		workspaceFolderPath,
		textDocumentFilePaths: state.textDocumentFilePaths,
		changeFiles: state.changeFiles || [],
		lsifIndex: state.lsifIndex,
		testFailures: state.testFailures,
	};
}

export const noopFileSystemWatcher = new class implements vscode.FileSystemWatcher {
	ignoreCreateEvents = false;
	ignoreChangeEvents = false;
	ignoreDeleteEvents = false;
	onDidCreate = Event.None;
	onDidChange = Event.None;
	onDidDelete = Event.None;
	dispose() {
		// noop
	}
};
