/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';
import { IDebugOutputService } from '../../../platform/debug/common/debugOutputService';
import { IGitService } from '../../../platform/git/common/gitService';
import { ILanguageDiagnosticsService } from '../../../platform/languages/common/languageDiagnosticsService';
import { ILanguageFeaturesService } from '../../../platform/languages/common/languageFeaturesService';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { ITerminalService } from '../../../platform/terminal/common/terminalService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { ISerializedDiagnosticRelatedInformation, ISerializedWorkspaceState } from '../../../platform/workspaceState/common/promptContextModel';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { relativePath } from '../../../util/vs/base/common/resources';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IExtensionContribution } from '../../common/contributions';

export class LogWorkspaceStateContribution extends Disposable implements IExtensionContribution {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		// register command "Developer: Log Workbench State"
		this._register(vscode.commands.registerCommand('github.copilot.debug.workbenchState', async () => {
			const symbolQueries = await vscode.window.showInputBox({
				prompt: 'Enter a comma-separated list of symbol queries. Can be left blank if not using WorkspaceSymbols',
			});
			// Show a quick input asking the user for a file name
			const fileName = await vscode.window.showInputBox({
				prompt: 'Enter a file name - .state.json will be appended as the extension',
				value: 'workspaceState',
			});
			if (!fileName) {
				return;
			}
			const state = await instantiationService.createInstance(WorkspaceStateSnapshotHelper).captureWorkspaceStateSnapshot(symbolQueries?.split(',') ?? []);
			// Get workspace root
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri;
			if (!workspaceRoot) {
				return;
			}
			// Write the file
			const fileUri = vscode.Uri.joinPath(workspaceRoot, `${fileName}.state.json`);
			let serializedState = JSON.stringify(state, null, 2);
			// Replace workspaceRoot with `./` to make the file path relative
			serializedState = serializedState.replace(new RegExp(`${workspaceRoot.fsPath}/`, 'g'), './');
			vscode.workspace.fs.writeFile(fileUri, Buffer.from(serializedState));
		}));
	}
}

export class WorkspaceStateSnapshotHelper {
	/**
	 * Constructs a new instance of the PromptContextModel.
	 *
	 * @param tabAndEditorsService - Service for managing tabs and editors.
	 * @param languageDiagnosticService - Service for providing language diagnostics.
	 * @param languageService - Service for language features.
	 * @param workspaceService - Service for workspace management.
	 * @param terminalService - Service for terminal operations.
	 * @param debugOutputService - Service for debug output.
	 * @param gitService - Service for Git operations.
	 */
	constructor(
		@ITabsAndEditorsService private readonly tabAndEditorsService: ITabsAndEditorsService,
		@ILanguageDiagnosticsService private readonly languageDiagnosticService: ILanguageDiagnosticsService,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IDebugOutputService private readonly debugOutputService: IDebugOutputService,
		@IGitService private readonly gitService: IGitService
	) { }

	public async captureWorkspaceStateSnapshot(symbolQueries: string[]): Promise<ISerializedWorkspaceState> {
		const workspaceFoldersFilePaths = this.workspaceService.getWorkspaceFolders().map(w => w.fsPath + '/');
		const notebookDocumentFilePaths = this.workspaceService.notebookDocuments.map(d => d.uri.fsPath);
		const symbols = (await Promise.all(symbolQueries.map(q => this.languageService.getWorkspaceSymbols(q)))).flat();
		const serializedSymbols = symbols.map(s => ({
			name: s.name,
			kind: s.kind,
			containerName: s.containerName,
			filePath: s.location.uri.fsPath,
			start: s.location.range.start,
			end: s.location.range.end,
		}));
		const activeFileDiagnostics = !this.tabAndEditorsService.activeTextEditor ? [] : this.languageDiagnosticService.getDiagnostics(this.tabAndEditorsService.activeTextEditor.document.uri).map(d => ({
			start: d.range.start,
			end: d.range.end,
			message: d.message,
			severity: d.severity,
			relatedInformation: d.relatedInformation?.map(serializeRelatedInformation)
		}));
		const activeTextEditor = this.tabAndEditorsService.activeTextEditor ? {
			selections: this.tabAndEditorsService.activeTextEditor?.selections.map(s => ({
				anchor: s.anchor,
				active: s.active,
				isReversed: s.isReversed,
			})) ?? [],
			documentFilePath: this.tabAndEditorsService.activeTextEditor?.document.uri.fsPath ?? '',
			visibleRanges: this.tabAndEditorsService.activeTextEditor?.visibleRanges.map(r => ({
				start: r.start,
				end: r.end
			})) ?? [],
			languageId: this.tabAndEditorsService.activeTextEditor?.document.languageId ?? 'javascript',
		} : undefined;
		const terminalLastCommand = this.terminalService.terminalLastCommand ? {
			commandLine: this.terminalService.terminalLastCommand.commandLine,
			cwd: typeof this.terminalService.terminalLastCommand.cwd === 'object' ? this.terminalService.terminalLastCommand.cwd.toString() : this.terminalService.terminalLastCommand.cwd,
			exitCode: this.terminalService.terminalLastCommand.exitCode,
			output: this.terminalService.terminalLastCommand.output,
		} : undefined;
		const workspaceState: ISerializedWorkspaceState = {
			workspaceFoldersFilePaths,
			workspaceFolderFilePath: undefined,
			symbols: serializedSymbols,
			activeFileDiagnostics,
			activeTextEditor,
			debugConsoleOutput: this.debugOutputService.consoleOutput,
			terminalBuffer: this.terminalService.terminalBuffer,
			terminalLastCommand,
			terminalSelection: this.terminalService.terminalSelection,
			terminalShellType: this.terminalService.terminalShellType,
			repoContexts: this.gitService.repositories,
			notebookDocumentFilePaths,
			textDocumentFilePaths: coalesce(this.workspaceService.textDocuments.map(doc => {
				const parentFolder = this.workspaceService.getWorkspaceFolder(doc.uri);
				return parentFolder ? relativePath(parentFolder, doc.uri) : undefined;
			})),
			activeNotebookEditor: undefined
		};

		return workspaceState;
	}
}

function serializeRelatedInformation(r: vscode.DiagnosticRelatedInformation): ISerializedDiagnosticRelatedInformation {
	return {
		filePath: r.location.uri.fsPath,
		start: r.location.range.start,
		end: r.location.range.end,
		message: r.message
	};
}
