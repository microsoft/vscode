/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Selection } from 'vs/editor/common/core/selection';
import { localize } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IFileService } from 'vs/platform/files/common/files';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IMarker, IMarkerService } from 'vs/platform/markers/common/markers';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';



interface ISavedWorkbenchState {
	activeFile: string | undefined;
	visibleEditors: string[];
	activeEditorDiagnostics: IMarker[];
	allDiagnostics: IMarker[];
	currentSelections: Selection[];
	terminalData: string[];
}
class LogWorkbenchStateAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.logWorkbenchStateAction',
			title: { value: localize({ key: 'logWorkbenchState', comment: ['A developer only action to log the current state of the workbench.'] }, "Log Workbench State"), original: 'Log Workbench State' },
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const markerService = accessor.get(IMarkerService);
		const codeEditorService = accessor.get(ICodeEditorService);
		const terminalService = accessor.get(ITerminalService);
		const fileService = accessor.get(IFileService);
		const historyService = accessor.get(IHistoryService);

		const workspaceRoot = historyService.getLastActiveWorkspaceRoot();
		if (!workspaceRoot) {
			return;
		}
		const activeEditor = editorService.activeEditor;
		const activeEditorDiagnostics = activeEditor ? markerService.read({ resource: activeEditor.resource }) : undefined;
		const allDiagnostics = markerService.read();
		const allEditors = editorService.editors;
		const activeCodeEditor = codeEditorService.getActiveCodeEditor();
		const selections = activeCodeEditor?.getSelections() ?? [];
		const terminalContents = terminalService.activeInstance?.xterm?.getBufferReverseIterator();
		// Collect the last 10 lines of the terminal
		const terminalLines: string[] = [];
		if (terminalContents) {
			for (const line of terminalContents) {
				terminalLines.push(line);
				if (terminalLines.length === 10) {
					break;
				}
			}
			terminalLines.reverse();
		}
		const workbenchState: ISavedWorkbenchState = {
			activeFile: activeEditor?.resource?.fsPath.replace(workspaceRoot.fsPath, '.'),
			visibleEditors: allEditors.map(e => e.resource?.fsPath.replace(workspaceRoot.fsPath, '.') ?? e.getTitle()),
			activeEditorDiagnostics: activeEditorDiagnostics ?? [],
			allDiagnostics,
			currentSelections: selections,
			terminalData: terminalLines
		};

		const workbenchStateString = JSON.stringify(workbenchState, undefined, '\t');
		const stateFileURI = URI.joinPath(workspaceRoot, 'workbenchState.json');
		await fileService.createFile(stateFileURI, VSBuffer.fromString(workbenchStateString), { overwrite: true });
	}
}

registerAction2(LogWorkbenchStateAction);
