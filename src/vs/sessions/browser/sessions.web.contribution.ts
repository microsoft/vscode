/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from '../../platform/actions/common/actions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../workbench/common/contributions.js';
import { OpenInVSCodeAction, OpenInVSCodeWidgetContribution } from './actions/vscodeActions.js';
import { OpenInEditorExperimentContribution } from './openInEditorExperiment.js';

// Actions
(function registerActions(): void {
	registerAction2(OpenInVSCodeAction);
})();

(function registerWorkbenchContributions(): void {
	registerWorkbenchContribution2(OpenInVSCodeWidgetContribution.ID, OpenInVSCodeWidgetContribution, WorkbenchPhase.BlockRestore);
	registerWorkbenchContribution2(OpenInEditorExperimentContribution.ID, OpenInEditorExperimentContribution, WorkbenchPhase.BlockRestore);
})();
