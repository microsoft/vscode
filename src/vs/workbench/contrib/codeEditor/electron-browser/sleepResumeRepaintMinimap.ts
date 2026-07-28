/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

class SleepResumeRepaintMinimap extends Disposable implements IWorkbenchContribution {

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

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SleepResumeRepaintMinimap, LifecyclePhase.Eventually);
