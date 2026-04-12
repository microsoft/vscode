/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
export function registerPromptActions() {
    registerRunPromptActions();
    registerAttachPromptActions();
    registerSkillActions();
    registerHookActions();
    registerAction2(SaveAsPromptFileAction);
    registerAction2(SaveAsInstructionsFileAction);
    registerAction2(SaveAsAgentFileAction);
    registerAgentActions();
    registerNewPromptFileActions();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RmlsZUFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvcHJvbXB0U3ludGF4L3Byb21wdEZpbGVBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzVFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQzVELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3pFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNwRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsNEJBQTRCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUczSDs7R0FFRztBQUNILE1BQU0sVUFBVSxxQkFBcUI7SUFDcEMsd0JBQXdCLEVBQUUsQ0FBQztJQUMzQiwyQkFBMkIsRUFBRSxDQUFDO0lBQzlCLG9CQUFvQixFQUFFLENBQUM7SUFDdkIsbUJBQW1CLEVBQUUsQ0FBQztJQUN0QixlQUFlLENBQUMsc0JBQXNCLENBQUMsQ0FBQztJQUN4QyxlQUFlLENBQUMsNEJBQTRCLENBQUMsQ0FBQztJQUM5QyxlQUFlLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUN2QyxvQkFBb0IsRUFBRSxDQUFDO0lBQ3ZCLDRCQUE0QixFQUFFLENBQUM7QUFDaEMsQ0FBQyJ9