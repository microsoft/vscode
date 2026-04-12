/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './highlightDecorations.css';
import { OverviewRulerLane } from '../../../common/model.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { DocumentHighlightKind } from '../../../common/languages.js';
import * as nls from '../../../../nls.js';
import { activeContrastBorder, editorSelectionHighlight, minimapSelectionOccurrenceHighlight, overviewRulerSelectionHighlightForeground, registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { registerThemingParticipant, themeColorFromId } from '../../../../platform/theme/common/themeService.js';
const wordHighlightBackground = registerColor('editor.wordHighlightBackground', { dark: '#575757B8', light: '#57575740', hcDark: null, hcLight: null }, nls.localize('wordHighlight', 'Background color of a symbol during read-access, like reading a variable. The color must not be opaque so as not to hide underlying decorations.'), true);
registerColor('editor.wordHighlightStrongBackground', { dark: '#004972B8', light: '#0e639c40', hcDark: null, hcLight: null }, nls.localize('wordHighlightStrong', 'Background color of a symbol during write-access, like writing to a variable. The color must not be opaque so as not to hide underlying decorations.'), true);
registerColor('editor.wordHighlightTextBackground', wordHighlightBackground, nls.localize('wordHighlightText', 'Background color of a textual occurrence for a symbol. The color must not be opaque so as not to hide underlying decorations.'), true);
const wordHighlightBorder = registerColor('editor.wordHighlightBorder', { light: null, dark: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder }, nls.localize('wordHighlightBorder', 'Border color of a symbol during read-access, like reading a variable.'));
registerColor('editor.wordHighlightStrongBorder', { light: null, dark: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder }, nls.localize('wordHighlightStrongBorder', 'Border color of a symbol during write-access, like writing to a variable.'));
registerColor('editor.wordHighlightTextBorder', wordHighlightBorder, nls.localize('wordHighlightTextBorder', "Border color of a textual occurrence for a symbol."));
const overviewRulerWordHighlightForeground = registerColor('editorOverviewRuler.wordHighlightForeground', '#A0A0A0CC', nls.localize('overviewRulerWordHighlightForeground', 'Overview ruler marker color for symbol highlights. The color must not be opaque so as not to hide underlying decorations.'), true);
const overviewRulerWordHighlightStrongForeground = registerColor('editorOverviewRuler.wordHighlightStrongForeground', '#C0A0C0CC', nls.localize('overviewRulerWordHighlightStrongForeground', 'Overview ruler marker color for write-access symbol highlights. The color must not be opaque so as not to hide underlying decorations.'), true);
const overviewRulerWordHighlightTextForeground = registerColor('editorOverviewRuler.wordHighlightTextForeground', overviewRulerSelectionHighlightForeground, nls.localize('overviewRulerWordHighlightTextForeground', 'Overview ruler marker color of a textual occurrence for a symbol. The color must not be opaque so as not to hide underlying decorations.'), true);
const _WRITE_OPTIONS = ModelDecorationOptions.register({
    description: 'word-highlight-strong',
    stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
    className: 'wordHighlightStrong',
    overviewRuler: {
        color: themeColorFromId(overviewRulerWordHighlightStrongForeground),
        position: OverviewRulerLane.Center
    },
    minimap: {
        color: themeColorFromId(minimapSelectionOccurrenceHighlight),
        position: 1 /* MinimapPosition.Inline */
    },
});
const _TEXT_OPTIONS = ModelDecorationOptions.register({
    description: 'word-highlight-text',
    stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
    className: 'wordHighlightText',
    overviewRuler: {
        color: themeColorFromId(overviewRulerWordHighlightTextForeground),
        position: OverviewRulerLane.Center
    },
    minimap: {
        color: themeColorFromId(minimapSelectionOccurrenceHighlight),
        position: 1 /* MinimapPosition.Inline */
    },
});
const _SELECTION_HIGHLIGHT_OPTIONS = ModelDecorationOptions.register({
    description: 'selection-highlight-overview',
    stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
    className: 'selectionHighlight',
    overviewRuler: {
        color: themeColorFromId(overviewRulerSelectionHighlightForeground),
        position: OverviewRulerLane.Center
    },
    minimap: {
        color: themeColorFromId(minimapSelectionOccurrenceHighlight),
        position: 1 /* MinimapPosition.Inline */
    },
});
const _SELECTION_HIGHLIGHT_OPTIONS_NO_OVERVIEW = ModelDecorationOptions.register({
    description: 'selection-highlight',
    stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
    className: 'selectionHighlight',
});
const _REGULAR_OPTIONS = ModelDecorationOptions.register({
    description: 'word-highlight',
    stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
    className: 'wordHighlight',
    overviewRuler: {
        color: themeColorFromId(overviewRulerWordHighlightForeground),
        position: OverviewRulerLane.Center
    },
    minimap: {
        color: themeColorFromId(minimapSelectionOccurrenceHighlight),
        position: 1 /* MinimapPosition.Inline */
    },
});
export function getHighlightDecorationOptions(kind) {
    if (kind === DocumentHighlightKind.Write) {
        return _WRITE_OPTIONS;
    }
    else if (kind === DocumentHighlightKind.Text) {
        return _TEXT_OPTIONS;
    }
    else {
        return _REGULAR_OPTIONS;
    }
}
export function getSelectionHighlightDecorationOptions(hasSemanticHighlights) {
    // Show in overviewRuler only if model has no semantic highlighting
    return (hasSemanticHighlights ? _SELECTION_HIGHLIGHT_OPTIONS_NO_OVERVIEW : _SELECTION_HIGHLIGHT_OPTIONS);
}
registerThemingParticipant((theme, collector) => {
    const selectionHighlight = theme.getColor(editorSelectionHighlight);
    if (selectionHighlight) {
        collector.addRule(`.monaco-editor .selectionHighlight { background-color: ${selectionHighlight.transparent(0.5)}; }`);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGlnaGxpZ2h0RGVjb3JhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi93b3JkSGlnaGxpZ2h0ZXIvYnJvd3Nlci9oaWdobGlnaHREZWNvcmF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLDRCQUE0QixDQUFDO0FBQ3BDLE9BQU8sRUFBbUIsaUJBQWlCLEVBQTBCLE1BQU0sMEJBQTBCLENBQUM7QUFDdEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDckUsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsd0JBQXdCLEVBQUUsbUNBQW1DLEVBQUUseUNBQXlDLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDbk4sT0FBTyxFQUFFLDBCQUEwQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFakgsTUFBTSx1QkFBdUIsR0FBRyxhQUFhLENBQUMsZ0NBQWdDLEVBQUUsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUsa0pBQWtKLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNqVixhQUFhLENBQUMsc0NBQXNDLEVBQUUsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxx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