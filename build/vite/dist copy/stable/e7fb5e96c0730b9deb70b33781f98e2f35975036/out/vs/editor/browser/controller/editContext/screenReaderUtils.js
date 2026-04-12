/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from '../../../common/core/range.js';
import * as nls from '../../../../nls.js';
export class SimplePagedScreenReaderStrategy {
    _getPageOfLine(lineNumber, linesPerPage) {
        return Math.floor((lineNumber - 1) / linesPerPage);
    }
    _getRangeForPage(page, linesPerPage) {
        const offset = page * linesPerPage;
        const startLineNumber = offset + 1;
        const endLineNumber = offset + linesPerPage;
        return new Range(startLineNumber, 1, endLineNumber + 1, 1);
    }
    fromEditorSelection(model, selection, linesPerPage, trimLongText) {
        // Chromium handles very poorly text even of a few thousand chars
        // Cut text to avoid stalling the entire UI
        const LIMIT_CHARS = 500;
        const selectionStartPage = this._getPageOfLine(selection.startLineNumber, linesPerPage);
        const selectionStartPageRange = this._getRangeForPage(selectionStartPage, linesPerPage);
        const selectionEndPage = this._getPageOfLine(selection.endLineNumber, linesPerPage);
        const selectionEndPageRange = this._getRangeForPage(selectionEndPage, linesPerPage);
        let pretextRange = selectionStartPageRange.intersectRanges(new Range(1, 1, selection.startLineNumber, selection.startColumn));
        if (trimLongText && model.getValueLengthInRange(pretextRange, 1 /* EndOfLinePreference.LF */) > LIMIT_CHARS) {
            const pretextStart = model.modifyPosition(pretextRange.getEndPosition(), -LIMIT_CHARS);
            pretextRange = Range.fromPositions(pretextStart, pretextRange.getEndPosition());
        }
        const pretext = model.getValueInRange(pretextRange, 1 /* EndOfLinePreference.LF */);
        const lastLine = model.getLineCount();
        const lastLineMaxColumn = model.getLineMaxColumn(lastLine);
        let posttextRange = selectionEndPageRange.intersectRanges(new Range(selection.endLineNumber, selection.endColumn, lastLine, lastLineMaxColumn));
        if (trimLongText && model.getValueLengthInRange(posttextRange, 1 /* EndOfLinePreference.LF */) > LIMIT_CHARS) {
            const posttextEnd = model.modifyPosition(posttextRange.getStartPosition(), LIMIT_CHARS);
            posttextRange = Range.fromPositions(posttextRange.getStartPosition(), posttextEnd);
        }
        const posttext = model.getValueInRange(posttextRange, 1 /* EndOfLinePreference.LF */);
        let text;
        if (selectionStartPage === selectionEndPage || selectionStartPage + 1 === selectionEndPage) {
            // take full selection
            text = model.getValueInRange(selection, 1 /* EndOfLinePreference.LF */);
        }
        else {
            const selectionRange1 = selectionStartPageRange.intersectRanges(selection);
            const selectionRange2 = selectionEndPageRange.intersectRanges(selection);
            text = (model.getValueInRange(selectionRange1, 1 /* EndOfLinePreference.LF */)
                + String.fromCharCode(8230)
                + model.getValueInRange(selectionRange2, 1 /* EndOfLinePreference.LF */));
        }
        if (trimLongText && text.length > 2 * LIMIT_CHARS) {
            text = text.substring(0, LIMIT_CHARS) + String.fromCharCode(8230) + text.substring(text.length - LIMIT_CHARS, text.length);
        }
        let selectionStart;
        let selectionEnd;
        if (selection.getDirection() === 0 /* SelectionDirection.LTR */) {
            selectionStart = pretext.length;
            selectionEnd = pretext.length + text.length;
        }
        else {
            selectionEnd = pretext.length;
            selectionStart = pretext.length + text.length;
        }
        return {
            value: pretext + text + posttext,
            selection: selection,
            selectionStart,
            selectionEnd,
            startPositionWithinEditor: pretextRange.getStartPosition(),
            newlineCountBeforeSelection: pretextRange.endLineNumber - pretextRange.startLineNumber,
        };
    }
}
export function ariaLabelForScreenReaderContent(options, keybindingService) {
    const accessibilitySupport = options.get(2 /* EditorOption.accessibilitySupport */);
    if (accessibilitySupport === 1 /* AccessibilitySupport.Disabled */) {
        const toggleKeybindingLabel = keybindingService.lookupKeybinding('editor.action.toggleScreenReaderAccessibilityMode')?.getAriaLabel();
        const runCommandKeybindingLabel = keybindingService.lookupKeybinding('workbench.action.showCommands')?.getAriaLabel();
        const keybindingEditorKeybindingLabel = keybindingService.lookupKeybinding('workbench.action.openGlobalKeybindings')?.getAriaLabel();
        const editorNotAccessibleMessage = nls.localize('accessibilityModeOff', "The editor is not accessible at this time.");
        if (toggleKeybindingLabel) {
            return nls.localize('accessibilityOffAriaLabel', "{0} To enable screen reader optimized mode, use {1}", editorNotAccessibleMessage, toggleKeybindingLabel);
        }
        else if (runCommandKeybindingLabel) {
            return nls.localize('accessibilityOffAriaLabelNoKb', "{0} To enable screen reader optimized mode, open the quick pick with {1} and run the command Toggle Screen Reader Accessibility Mode, which is currently not triggerable via keyboard.", editorNotAccessibleMessage, runCommandKeybindingLabel);
        }
        else if (keybindingEditorKeybindingLabel) {
            return nls.localize('accessibilityOffAriaLabelNoKbs', "{0} Please assign a keybinding for the command Toggle Screen Reader Accessibility Mode by accessing the keybindings editor with {1} and run it.", editorNotAccessibleMessage, keybindingEditorKeybindingLabel);
        }
        else {
            // SOS
            return editorNotAccessibleMessage;
        }
    }
    return options.get(8 /* EditorOption.ariaLabel */);
}
export function newlinecount(text) {
    let result = 0;
    let startIndex = -1;
    do {
        startIndex = text.indexOf('\n', startIndex + 1);
        if (startIndex === -1) {
            break;
        }
        result++;
    } while (true);
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyZWVuUmVhZGVyVXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9jb250cm9sbGVyL2VkaXRDb250ZXh0L3NjcmVlblJlYWRlclV0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUt0RCxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBMEIxQyxNQUFNLE9BQU8sK0JBQStCO0lBQ25DLGNBQWMsQ0FBQyxVQUFrQixFQUFFLFlBQW9CO1FBQzlELE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsR0FBRyxZQUFZLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRU8sZ0JBQWdCLENBQUMsSUFBWSxFQUFFLFlBQW9CO1FBQzFELE1BQU0sTUFBTSxHQUFHLElBQUksR0FBRyxZQUFZLENBQUM7UUFDbkMsTUFBTSxlQUFlLEdBQUcsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNuQyxNQUFNLGFBQWEsR0FBRyxNQUFNLEdBQUcsWUFBWSxDQUFDO1FBQzVDLE9BQU8sSUFBSSxLQUFLLENBQUMsZUFBZSxFQUFFLENBQUMsRUFBRSxhQUFhLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFTSxtQkFBbUIsQ0FBQyxLQUFtQixFQUFFLFNBQW9CLEVBQUUsWUFBb0IsRUFBRSxZQUFxQjtRQUNoSCxpRUFBaUU7UUFDakUsMkNBQTJDO1FBQzNDLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQztRQUV4QixNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLGVBQWUsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN4RixNQUFNLHVCQUF1QixHQUFHLElB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