/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAttachPromptActions } from './attachInstructionsAction.js';
import { registerAgentActions } from './chatModeActions.js';
import { registerRunPromptActions } from './runPromptAction.js';
import { registerNewPromptFileActions } from './newPromptFileActions.js';
import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { SaveAsAgentFileAction, SaveAsInstructionsFileAction, SaveAsPromptFileAction } from './saveAsPromptFileActions.js';


/**
 * Helper to register all actions related to reusable prompt files.
 */
export function registerPromptActions(): void {
	registerRunPromptActions();
	registerAttachPromptActions();
	registerAction2(SaveAsPromptFileAction);
	registerAction2(SaveAsInstructionsFileAction);
	registerAction2(SaveAsAgentFileAction);
	registerAgentActions();
	registerNewPromptFileActions();
}
