/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { ipcRenderer as ipc } from 'electron';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';

class SleepResumeRepaintMinimap implements IWorkbenchContribution {

	constructor(
		@ICodeEditorService codeEditorService: ICodeEditorService
	) {
		ipc.on('vscode:osResume', () => {
			codeEditorService.listCodeEditors().forEach(editor => editor.render(true));
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SleepResumeRepaintMinimap, LifecyclePhase.Eventually);
