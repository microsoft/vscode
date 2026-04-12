/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { QuickInputButtonLocation } from '../../../../platform/quickinput/common/quickInput.js';
import { getCodeEditor } from '../../../browser/editorBrowser.js';
import { CursorColumns } from '../../../common/core/cursorColumns.js';
import { AbstractEditorNavigationQuickAccessProvider } from './editorNavigationQuickAccess.js';
export class AbstractGotoLineQuickAccessProvider extends AbstractEditorNavigationQuickAccessProvider {
    static { this.GO_TO_LINE_PREFIX = ':'; }
    static { this.GO_TO_OFFSET_PREFIX = '::'; }
    static { this.ZERO_BASED_OFFSET_STORAGE_KEY = 'gotoLine.useZeroBasedOffset'; }
    constructor() {
        super({ canAcceptInBackground: true });
    }
    get useZeroBasedOffset() {
        return this.storageService.getBoolean(AbstractGotoLineQuickAccessProvider.ZERO_BASED_OFFSET_STORAGE_KEY, -1 /* StorageScope.APPLICATION */, false);
    }
    set useZeroBasedOffset(value) {
        this.storageService.store(AbstractGotoLineQuickAccessProvider.ZERO_BASED_OFFSET_STORAGE_KEY, value, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
    }
    provideWithoutTextEditor(picker) {
        const label = localize('gotoLine.noEditor', "Open a text editor first to go to a line or an offset.");
        picker.items = [{ label }];
        picker.ariaLabel = label;
        return Disposable.None;
    }
    provideWithTextEditor(context, picker, token) {
        const editor = context.editor;
        const disposables = new DisposableStore();
        // Set initial ariaLabel for screen readers
        picker.ariaLabel = localize('gotoLine.ariaLabel', "Go to line. Type a line number, optionally followed by colon and column number.");
        // Goto line once picked
        disposables.add(picker.onDidAccept(event => {
            const [item] = picker.selectedItems;
            if (item) {
                if (!item.lineNumber) {
                    return;
                }
                this.gotoLocation(context, { range: this.toRange(item.lineNumber, item.column), keyMods: picker.keyMods, preserveFocus: event.inBackground });
                if (!event.inBackground) {
                    picker.hide();
                }
            }
        }));
        // Add a toggle to switch between 1- and 0-based offsets.
        const offsetButton = {
            iconClass: ThemeIcon.asClassName(Codicon.indexZero),
            tooltip: localize('gotoLineToggleButton', "Toggle Zero-Based Offset"),
            location: QuickInputButtonLocation.Input,
            toggle: { checked: this.useZeroBasedOffset }
        };
        // React to picker changes
        const updatePickerAndEditor = () => {
            const inputText = picker.value.trim().substring(AbstractGotoLineQuickAccessProvider.GO_TO_LINE_PREFIX.length);
            const { inOffsetMode, lineNumber, column, label } = this.parsePosition(editor, inputText);
            // Show toggle only when input text starts with '::'.
            picker.buttons = inOffsetMode ? [offsetButton] : [];
            // Picker
            picker.items = [{
                    lineNumber,
                    column,
                    label,
                    ariaLabel: lineNumber
                        ? localize('gotoLine.itemAriaLabel', "Go to line {0}, column {1}. Press Enter to navigate.", lineNumber, column || 1)
                        : label,
                }];
            // Clear decorations for invalid range
            if (!lineNumber) {
                this.clearDecorations(editor);
                return;
            }
            // Reveal
            const range = this.toRange(lineNumber, column);
            editor.revealRangeInCenter(range, 0 /* ScrollType.Smooth */);
            // Decorate
            this.addDecorations(editor, range);
        };
        disposables.add(picker.onDidTriggerButton(button => {
            if (button === offsetButton) {
                this.useZeroBasedOffset = button.toggle?.checked ?? !this.useZeroBasedOffset;
                updatePickerAndEditor();
            }
        }));
        updatePickerAndEditor();
        disposables.add(picker.onDidChangeValue(() => updatePickerAndEditor()));
        // Adjust line number visibility as needed
        const codeEditor = getCodeEditor(editor);
        if (codeEditor) {
            const options = codeEditor.getOptions();
            const lineNumbers = options.get(76 /* EditorOption.lineNumbers */);
            if (lineNumbers.renderType === 2 /* RenderLineNumbersType.Relative */) {
                codeEditor.updateOptions({ lineNumbers: 'on' });
                disposables.add(toDisposable(() => codeEditor.updateOptions({ lineNumbers: 'relative' })));
            }
        }
        return disposables;
    }
    toRange(lineNumber = 1, column = 1) {
        return {
            startLineNumber: lineNumber,
            startColumn: column,
            endLineNumber: lineNumber,
            endColumn: column
        };
    }
    parsePosition(editor, value) {
        const model = this.getModel(editor);
        if (!model) {
            return {
                label: localize('gotoLine.noEditor', "Open a text editor first to go to a line or an offset.")
            };
        }
        // Support ::<offset> notation to navigate to a specific offset in the model.
        if (value.startsWith(':')) {
            let offset = parseInt(value.substring(1), 10);
            const maxOffset = model.getValueLength();
            if (isNaN(offset)) {
                // No valid offset specified.
                return {
                    inOffsetMode: true,
                    label: this.useZeroBasedOffset ?
                        localize('gotoLine.offsetPromptZero', "Type a character position to go to (from 0 to {0}).", maxOffset - 1) :
                        localize('gotoLine.offsetPrompt', "Type a character position to go to (from 1 to {0}).", maxOffset)
                };
            }
            else {
                const reverse = offset < 0;
                if (!this.useZeroBasedOffset) {
                    // Convert 1-based offset to model's 0-based.
                    offset -= Math.sign(offset);
                }
                if (reverse) {
                    // Offset from the end of the buffer
                    offset += maxOffset;
                }
                const pos = model.getPositionAt(offset);
                const visibleColumn = CursorColumns.visibleColumnFromColumn(model.getLineContent(pos.lineNumber), pos.column, model.getOptions().tabSize) + 1;
                return {
                    ...pos,
                    inOffsetMode: true,
                    label: localize('gotoLine.goToPosition', "Press 'Enter' to go to line {0} at column {1}.", pos.lineNumber, visibleColumn)
                };
            }
        }
        else {
            // Support line-col formats of `line,col`, `line:col`, `line#col`
            const parts = value.split(/,|:|#/);
            const maxLine = model.getLineCount();
            let lineNumber = parseInt(parts[0]?.trim(), 10);
            if (parts.length < 1 || isNaN(lineNumber)) {
                return {
                    label: localize('gotoLine.linePrompt', "Type a line number to go to (from 1 to {0}).", maxLine)
                };
            }
            // Handle negative line numbers and clip to valid range.
            lineNumber = lineNumber >= 0 ? lineNumber : (maxLine + 1) + lineNumber;
            lineNumber = Math.min(Math.max(1, lineNumber), maxLine);
            // Treat column number as visible column
            const tabSize = model.getOptions().tabSize;
            const lineContent = model.getLineContent(lineNumber);
            const maxColumn = CursorColumns.visibleColumnFromColumn(lineContent, model.getLineMaxColumn(lineNumber), tabSize) + 1;
            let column = parseInt(parts[1]?.trim(), 10);
            if (parts.length < 2 || isNaN(column)) {
                return {
                    lineNumber,
                    column: 1,
                    label: parts.length < 2 ?
                        localize('gotoLine.lineColumnPrompt', "Press 'Enter' to go to line {0} or enter colon : to add a column number.", lineNumber) :
                        localize('gotoLine.columnPrompt', "Press 'Enter' to go to line {0} or enter a column number (from 1 to {1}).", lineNumber, maxColumn)
                };
            }
            // Handle negative column numbers and clip to valid range.
            column = column >= 0 ? column : maxColumn + column;
            column = Math.min(Math.max(1, column), maxColumn);
            const realColumn = CursorColumns.columnFromVisibleColumn(lineContent, column - 1, tabSize);
            return {
                lineNumber,
                column: realColumn,
                label: localize('gotoLine.goToPosition', "Press 'Enter' to go to line {0} at column {1}.", lineNumber, column)
            };
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ290b0xpbmVRdWlja0FjY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL3F1aWNrQWNjZXNzL2Jyb3dzZXIvZ290b0xpbmVRdWlja0FjY2Vzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDOUcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQWlELHdCQUF3QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFL0ksT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUl0RSxPQUFPLEVBQUUsMkNBQTJDLEVBQWlDLE1BQU0sa0NBQWtDLENBQUM7QUFJOUgsTUFBTSxPQUFnQixtQ0FBb0MsU0FBUSwyQ0FBMkM7YUFFNUYsc0JBQWlCLEdBQUcsR0FBRyxDQUFDO2FBQ3hCLHdCQUFtQixHQUFHLElBQUksQ0FBQzthQUNuQixrQ0FBNkIsR0FBRyw2QkFBNkIsQ0FBQztJQUV0RjtRQUNDLEtBQUssQ0FBQyxFQUFFLHFCQUFxQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUlELElBQVksa0JBQWtCO1FBQzdCLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQ3BDLG1DQUFtQyxDQUFDLDZCQUE2QixxQ0FFakUsS0FBSyxDQUFDLENBQUM7SUFDVCxDQUFDO0lBRUQsSUFBWSxrQkFBa0Is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