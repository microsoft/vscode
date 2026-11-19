/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { registerAttachPromptActions } from './attachInstructionsAction.js';
import { registerAgentActions } from './chatModeActions.js';
import { registerRunPromptActions } from './runPromptAction.js';
import { registerNewPromptFileActions } from './newPromptFileActions.js';
import { registerSkillActions } from './skillActions.js';
import { registerHookActions } from './hookActions.js';
import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { SaveAsAgentFileAction, SaveAsInstructionsFileAction, SaveAsPromptFileAction } from './saveAsPromptFileActions.js';


/**
 * Helper to register all actions related to reusable prompt files.
 */
export function registerPromptActions(): DisposableStore {
	const store = new DisposableStore();
	store.add(registerRunPromptActions());
	store.add(registerAttachPromptActions());
	store.add(registerSkillActions());
	store.add(registerHookActions());
	store.add(registerAction2(SaveAsPromptFileAction));
	store.add(registerAction2(SaveAsInstructionsFileAction));
	store.add(registerAction2(SaveAsAgentFileAction));
	store.add(registerAgentActions());
	store.add(registerNewPromptFileActions());

	return store;
}
