/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAttachPromptActions } from './attachInstructionsAction.js';
import { registerChatModeActions } from './chatModeActions.js';
import { registerRunPromptActions } from './runPromptAction.js';
import { registerSaveToPromptActions } from './saveToPromptAction.js';
import { registerNewPromptFileActions } from './newPromptFileActions.js';


/**
 * Helper to register all actions related to reusable prompt files.
 */
export function registerPromptActions(): void {
	registerRunPromptActions();
	registerAttachPromptActions();
	registerSaveToPromptActions();
	registerChatModeActions();
	registerNewPromptFileActions();
}
