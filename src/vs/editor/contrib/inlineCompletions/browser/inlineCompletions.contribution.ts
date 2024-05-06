/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { HoverParticipantRegistry } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { TriggerInlineSuggestionAction, ShowNextInlineSuggestionAction, ShowPreviousInlineSuggestionAction, AcceptNextWordOfInlineCompletion, AcceptInlineCompletion, HideInlineCompletion, ToggleAlwaysShowInlineSuggestionToolbar, AcceptNextLineOfInlineCompletion } from 'vs/editor/contrib/inlineCompletions/browser/commands';
import { InlineCompletionsHoverParticipant } from 'vs/editor/contrib/inlineCompletions/browser/hoverParticipant';
import { InlineCompletionsAccessibleView } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsAccessibleView';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { AccessibleViewRegistry } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { registerAction2 } from 'vs/platform/actions/common/actions';

registerEditorContribution(InlineCompletionsController.ID, InlineCompletionsController, EditorContributionInstantiation.Eventually);

registerEditorAction(TriggerInlineSuggestionAction);
registerEditorAction(ShowNextInlineSuggestionAction);
registerEditorAction(ShowPreviousInlineSuggestionAction);
registerEditorAction(AcceptNextWordOfInlineCompletion);
registerEditorAction(AcceptNextLineOfInlineCompletion);
registerEditorAction(AcceptInlineCompletion);
registerEditorAction(HideInlineCompletion);
registerAction2(ToggleAlwaysShowInlineSuggestionToolbar);

HoverParticipantRegistry.register(InlineCompletionsHoverParticipant);

AccessibleViewRegistry.register(new InlineCompletionsAccessibleView());
