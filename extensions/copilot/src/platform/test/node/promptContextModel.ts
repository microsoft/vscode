/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ExtHostNotebookDocumentData } from '../../../util/common/test/shims/notebookDocument';
import { Event } from '../../../util/vs/base/common/event';
import { URI } from '../../../util/vs/base/common/uri';
import { RepoContext } from '../../git/common/gitService';
import type { IWorkspaceStateChangeFile, IWorkspaceStateTestFailure } from '../../workspaceState/common/promptContextModel';

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
