/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

class SleepResumeRepaintMinimap extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sleepResumeRepaintMinimap';

	constructor(
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@INativeHostService nativeHostService: INativeHostService
	) {
		super();

		this._register(nativeHostService.onDidResumeOS(() => {
			codeEditorService.listCodeEditors().forEach(editor => editor.render(true));
		}));
	}
}

registerWorkbenchContribution2(SleepResumeRepaintMinimap.ID, SleepResumeRepaintMinimap, WorkbenchPhase.Eventually);
