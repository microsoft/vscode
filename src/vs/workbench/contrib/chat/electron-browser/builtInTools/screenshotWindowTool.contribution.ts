/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { ScreenshotWindowTool, ScreenshotWindowToolData } from '../../browser/tools/screenshotWindowTool.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';

/**
 * Registers the window screenshot tool on desktop, where the window can be captured without asking the
 * user to pick a screen. Both the workbench and the Agents window load this contribution.
 */
class ScreenshotWindowToolContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chat.screenshotWindowTool';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
	) {
		super();
		this._register(toolsService.registerTool(ScreenshotWindowToolData, instantiationService.createInstance(ScreenshotWindowTool)));
	}
}

registerWorkbenchContribution2(ScreenshotWindowToolContribution.ID, ScreenshotWindowToolContribution, WorkbenchPhase.AfterRestored);
