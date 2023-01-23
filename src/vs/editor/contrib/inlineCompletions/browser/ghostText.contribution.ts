/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { HoverParticipantRegistry } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { AcceptInlineCompletion, AcceptNextWordOfInlineCompletion, DisableSuggestionHints, GhostTextController, HideInlineCompletion, ShowNextInlineSuggestionAction, ShowPreviousInlineSuggestionAction, TriggerInlineSuggestionAction, UndoAcceptPart } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';
import { InlineCompletionsHoverParticipant } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextHoverParticipant';

registerEditorContribution(GhostTextController.ID, GhostTextController, EditorContributionInstantiation.Eventually);
registerEditorAction(TriggerInlineSuggestionAction);
registerEditorAction(ShowNextInlineSuggestionAction);
registerEditorAction(ShowPreviousInlineSuggestionAction);
registerEditorAction(AcceptNextWordOfInlineCompletion);
registerEditorAction(AcceptInlineCompletion);
registerEditorAction(HideInlineCompletion);
registerEditorAction(UndoAcceptPart);
registerEditorAction(DisableSuggestionHints);

HoverParticipantRegistry.register(InlineCompletionsHoverParticipant);
