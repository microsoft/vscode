/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerRunPromptActions } from './chatRunPromptAction.js';
import { registerSaveToPromptActions } from './chatSaveToPromptAction.js';
import { registerAttachPromptActions } from './chatAttachInstructionsAction.js';
export { runAttachInstructionsAction } from './chatAttachInstructionsAction.js';

/**
 * Helper to register all actions related to reusable prompt files.
 */
export const registerPromptActions = () => {
	registerRunPromptActions();
	registerAttachPromptActions();
	registerSaveToPromptActions();
};
