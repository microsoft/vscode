/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { CopilotPickerActionViewItemContribution, registerCopilotSandboxPickerActions } from '../../../../../workbench/contrib/sessions/providers/copilotChatSessions/browser/copilotSandboxPickers.js';

registerCopilotSandboxPickerActions();

registerWorkbenchContribution2(CopilotPickerActionViewItemContribution.ID, CopilotPickerActionViewItemContribution, WorkbenchPhase.BlockRestore);
