/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { wrapInHotClass1 } from '../../../../platform/observable/common/wrapInHotClass.js';
import { registerEditorAction, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { HoverParticipantRegistry } from '../../hover/browser/hoverTypes.js';
import { AcceptInlineCompletion, AcceptNextLineOfInlineCompletion, AcceptNextWordOfInlineCompletion, DevExtractReproSample, HideInlineCompletion, JumpToNextInlineEdit, ShowNextInlineSuggestionAction, ShowPreviousInlineSuggestionAction, ToggleAlwaysShowInlineSuggestionToolbar, TriggerInlineSuggestionAction, ToggleInlineCompletionShowCollapsed, AcceptInlineCompletionAlternativeAction } from './controller/commands.js';
import { InlineCompletionsController } from './controller/inlineCompletionsController.js';
import { InlineCompletionsHoverParticipant } from './hintsWidget/hoverParticipant.js';
import { InlineCompletionsAccessibleView } from './inlineCompletionsAccessibleView.js';
import { CancelSnoozeInlineCompletion, SnoozeInlineCompletion } from '../../../browser/services/inlineCompletionsService.js';
registerEditorContribution(InlineCompletionsController.ID, wrapInHotClass1(InlineCompletionsController.hot), 3 /* EditorContributionInstantiation.Eventually */);
registerEditorAction(TriggerInlineSuggestionAction);
registerEditorAction(ShowNextInlineSuggestionAction);
registerEditorAction(ShowPreviousInlineSuggestionAction);
registerEditorAction(AcceptNextWordOfInlineCompletion);
registerEditorAction(AcceptNextLineOfInlineCompletion);
registerEditorAction(AcceptInlineCompletion);
registerEditorAction(AcceptInlineCompletionAlternativeAction);
registerEditorAction(ToggleInlineCompletionShowCollapsed);
registerEditorAction(HideInlineCompletion);
registerEditorAction(JumpToNextInlineEdit);
registerAction2(ToggleAlwaysShowInlineSuggestionToolbar);
registerEditorAction(DevExtractReproSample);
registerAction2(SnoozeInlineCompletion);
registerAction2(CancelSnoozeInlineCompletion);
HoverParticipantRegistry.register(InlineCompletionsHoverParticipant);
AccessibleViewRegistry.register(new InlineCompletionsAccessibleView());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ29tcGxldGlvbnMuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9pbmxpbmVDb21wbGV0aW9ucy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDOUcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMzRixPQUFPLEVBQW1DLG9CQUFvQixFQUFFLDBCQUEwQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekksT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0UsT0FBTyxFQUFFLHNCQUFzQixFQUFFLGdDQUFnQyxFQUFFLGdDQUFnQyxFQUFFLHFCQUFxQixFQUFFLG9CQUFvQixFQUFFLG9CQUFvQixFQUFFLDhCQUE4QixFQUFFLGtDQUFrQyxFQUFFLHVDQUF1QyxFQUFFLDZCQUE2QixFQUFFLG1DQUFtQyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDbmEsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDMUYsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEYsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLHNCQUFzQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFN0gsMEJBQTBCLENBQUMsMkJBQTJCLENBQUMsRUFBRSxFQUFFLGVBQWUsQ0FBQywyQkFBMkIsQ0FBQyxHQUFHLENBQUMscURBQTZDLENBQUM7QUFFekosb0JBQW9CLENBQUMsNkJBQTZCLENBQUMsQ0FBQztBQUNwRCxvQkFBb0IsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO0FBQ3JELG9CQUFvQixDQUFDLGtDQUFrQyxDQUFDLENBQUM7QUFDekQsb0JBQW9CLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztBQUN2RCxvQkFBb0IsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO0FBQ3ZELG9CQUFvQixDQUFDLHNCQUFzQixDQUFDLENBQUM7QUFDN0Msb0JBQW9CLENBQUMsdUNBQXVDLENBQUMsQ0FBQztBQUM5RCxvQkFBb0IsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0FBQzFELG9CQUFvQixDQUFDLG9CQUFvQixDQUFDLENBQUM7QUFDM0Msb0JBQW9CLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUMzQyxlQUFlLENBQUMsdUNBQXVDLENBQUMsQ0FBQztBQUN6RCxvQkFBb0IsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0FBQzVDLGVBQWUsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0FBQ3hDLGVBQWUsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO0FBRTlDLHdCQUF3QixDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO0FBQ3JFLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxJQUFJLCtCQUErQixFQUFFLENBQUMsQ0FBQyJ9