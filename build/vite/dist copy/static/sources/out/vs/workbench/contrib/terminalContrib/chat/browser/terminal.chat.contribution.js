/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalInlineChatAccessibleView } from './terminalChatAccessibleView.js';
import { TerminalChatController } from './terminalChatController.js';
// #region Terminal Contributions
registerTerminalContribution(TerminalChatController.ID, TerminalChatController, false);
// #endregion
// #region Contributions
AccessibleViewRegistry.register(new TerminalInlineChatAccessibleView());
AccessibleViewRegistry.register(new TerminalChatAccessibilityHelp());
registerWorkbenchContribution2(TerminalChatEnabler.Id, TerminalChatEnabler, 3 /* WorkbenchPhase.AfterRestored */);
// #endregion
// #region Actions
import './terminalChatActions.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { TerminalChatAccessibilityHelp } from './terminalChatAccessibilityHelp.js';
import { registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { TerminalChatEnabler } from './terminalChatEnabler.js';
import { registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ITerminalChatService } from '../../../terminal/browser/terminal.js';
import { TerminalChatService } from './terminalChatService.js';
// #region Services
registerSingleton(ITerminalChatService, TerminalChatService, 1 /* InstantiationType.Delayed */);
// #endregion
// #endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuY2hhdC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdC9icm93c2VyL3Rlcm1pbmFsLmNoYXQuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRXJFLGlDQUFpQztBQUVqQyw0QkFBNEIsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLEVBQUUsc0JBQXNCLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFFdkYsYUFBYTtBQUViLHdCQUF3QjtBQUV4QixzQkFBc0IsQ0FBQyxRQUFRLENBQUMsSUFBSSxnQ0FBZ0MsRUFBRSxDQUFDLENBQUM7QUFDeEUsc0JBQXNCLENBQUMsUUFBUSxDQUFDLElBQUksNkJBQTZCLEVBQUUsQ0FBQyxDQUFDO0FBRXJFLDhCQUE4QixDQUFDLG1CQUFtQixDQUFDLEVBQUUsRUFBRSxtQkFBbUIsdUNBQStCLENBQUM7QUFFMUcsYUFBYTtBQUViLGtCQUFrQjtBQUVsQixPQUFPLDBCQUEwQixDQUFDO0FBQ2xDLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBQ2pILE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSw4QkFBOEIsRUFBa0IsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMvRCxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbEgsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDN0UsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFL0QsbUJBQW1CO0FBRW5CLGlCQUFpQixDQUFDLG9CQUFvQixFQUFFLG1CQUFtQixvQ0FBNEIsQ0FBQztBQUV4RixhQUFhO0FBRWIsYUFBYSJ9