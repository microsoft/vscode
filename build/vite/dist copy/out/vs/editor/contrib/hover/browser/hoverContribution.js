/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DecreaseHoverVerbosityLevel, GoToBottomHoverAction, GoToTopHoverAction, HideContentHoverAction, IncreaseHoverVerbosityLevel, PageDownHoverAction, PageUpHoverAction, ScrollDownHoverAction, ScrollLeftHoverAction, ScrollRightHoverAction, ScrollUpHoverAction, ShowDefinitionPreviewHoverAction, ShowOrFocusHoverAction } from './hoverActions.js';
import { registerEditorAction, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { editorHoverBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { HIDE_LONG_LINE_WARNING_HOVER_ACTION_ID } from './hoverActionIds.js';
import { HoverParticipantRegistry } from './hoverTypes.js';
import { MarkdownHoverParticipant } from './markdownHoverParticipant.js';
import { MarkerHoverParticipant } from './markerHoverParticipant.js';
import { ContentHoverController } from './contentHoverController.js';
import { GlyphHoverController } from './glyphHoverController.js';
import './hover.css';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ExtHoverAccessibleView, HoverAccessibilityHelp, HoverAccessibleView } from './hoverAccessibleViews.js';
registerEditorContribution(ContentHoverController.ID, ContentHoverController, 2 /* EditorContributionInstantiation.BeforeFirstInteraction */);
registerEditorContribution(GlyphHoverController.ID, GlyphHoverController, 2 /* EditorContributionInstantiation.BeforeFirstInteraction */);
registerEditorAction(ShowOrFocusHoverAction);
registerEditorAction(ShowDefinitionPreviewHoverAction);
registerEditorAction(HideContentHoverAction);
registerEditorAction(ScrollUpHoverAction);
registerEditorAction(ScrollDownHoverAction);
registerEditorAction(ScrollLeftHoverAction);
registerEditorAction(ScrollRightHoverAction);
registerEditorAction(PageUpHoverAction);
registerEditorAction(PageDownHoverAction);
registerEditorAction(GoToTopHoverAction);
registerEditorAction(GoToBottomHoverAction);
registerEditorAction(IncreaseHoverVerbosityLevel);
registerEditorAction(DecreaseHoverVerbosityLevel);
HoverParticipantRegistry.register(MarkdownHoverParticipant);
HoverParticipantRegistry.register(MarkerHoverParticipant);
CommandsRegistry.registerCommand(HIDE_LONG_LINE_WARNING_HOVER_ACTION_ID, (accessor) => {
    accessor.get(IConfigurationService).updateValue('editor.hover.showLongLineWarning', false);
});
// theming
registerThemingParticipant((theme, collector) => {
    const hoverBorder = theme.getColor(editorHoverBorder);
    if (hoverBorder) {
        collector.addRule(`.monaco-editor .monaco-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
        collector.addRule(`.monaco-editor .monaco-hover hr { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
        collector.addRule(`.monaco-editor .monaco-hover hr { border-bottom: 0px solid ${hoverBorder.transparent(0.5)}; }`);
    }
});
AccessibleViewRegistry.register(new HoverAccessibleView());
AccessibleViewRegistry.register(new HoverAccessibilityHelp());
AccessibleViewRegistry.register(new ExtHoverAccessibleView());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJDb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2hvdmVyQ29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxxQkFBcUIsRUFBRSxrQkFBa0IsRUFBRSxzQkFBc0IsRUFBRSwyQkFBMkIsRUFBRSxtQkFBbUIsRUFBRSxpQkFBaUIsRUFBRSxxQkFBcUIsRUFBRSxxQkFBcUIsRUFBRSxzQkFBc0IsRUFBRSxtQkFBbUIsRUFBRSxnQ0FBZ0MsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzdWLE9BQU8sRUFBbUMsb0JBQW9CLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6SSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMvRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsc0NBQXNDLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUM3RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzRCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNyRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNyRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztB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