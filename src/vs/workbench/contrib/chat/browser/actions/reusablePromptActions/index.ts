/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerRunPromptActions } from './chatRunPromptAction.js';
import { registerAttachPromptActions } from './chatAttachPromptAction.js';

/**
 * Helper to register all actions related to reusable prompt files.
 */
export const registerReusablePromptActions = () => {
	registerRunPromptActions();
	registerAttachPromptActions();
};

export { runAttachPromptAction } from './chatAttachPromptAction.js';
