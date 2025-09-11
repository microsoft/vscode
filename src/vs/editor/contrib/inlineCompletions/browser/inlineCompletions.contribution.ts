/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { wrapInHotClass1 } from '../../../../platform/observable/common/wrapInHotClass.js';
import { EditorContributionInstantiation, registerEditorAction, registerEditorCommand, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { HoverParticipantRegistry } from '../../hover/browser/hoverTypes.js';
import { AcceptInlineCompletion, AcceptNextLineOfInlineCompletion, AcceptNextWordOfInlineCompletion, DevExtractReproSample, HideInlineCompletion, JumpToNextInlineEdit, ShowNextInlineSuggestionAction, ShowPreviousInlineSuggestionAction, ToggleAlwaysShowInlineSuggestionToolbar, ExplicitTriggerInlineEditAction, TriggerInlineSuggestionAction, TriggerInlineEditAction, ToggleInlineCompletionShowCollapsed } from './controller/commands.js';
import { InlineCompletionsController } from './controller/inlineCompletionsController.js';
import { InlineCompletionsHoverParticipant } from './hintsWidget/hoverParticipant.js';
import { InlineCompletionsAccessibleView } from './inlineCompletionsAccessibleView.js';
import { CancelSnoozeInlineCompletion, SnoozeInlineCompletion } from '../../../browser/services/inlineCompletionsService.js';

registerEditorContribution(InlineCompletionsController.ID, wrapInHotClass1(InlineCompletionsController.hot), EditorContributionInstantiation.Eventually);

registerEditorAction(TriggerInlineSuggestionAction);
registerEditorAction(ExplicitTriggerInlineEditAction);
registerEditorCommand(new TriggerInlineEditAction());
registerEditorAction(ShowNextInlineSuggestionAction);
registerEditorAction(ShowPreviousInlineSuggestionAction);
registerEditorAction(AcceptNextWordOfInlineCompletion);
registerEditorAction(AcceptNextLineOfInlineCompletion);
registerEditorAction(AcceptInlineCompletion);
registerEditorAction(ToggleInlineCompletionShowCollapsed);
registerEditorAction(HideInlineCompletion);
registerEditorAction(JumpToNextInlineEdit);
registerAction2(ToggleAlwaysShowInlineSuggestionToolbar);
registerEditorAction(DevExtractReproSample);
registerAction2(SnoozeInlineCompletion);
registerAction2(CancelSnoozeInlineCompletion);

HoverParticipantRegistry.register(InlineCompletionsHoverParticipant);
AccessibleViewRegistry.register(new InlineCompletionsAccessibleView());
