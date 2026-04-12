/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import './dnd.css';
import { registerEditorContribution } from '../../../browser/editorExtensions.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { DragAndDropCommand } from './dragAndDropCommand.js';
function hasTriggerModifier(e) {
    if (isMacintosh) {
        return e.altKey;
    }
    else {
        return e.ctrlKey;
    }
}
export class DragAndDropController extends Disposable {
    static { this.ID = 'editor.contrib.dragAndDrop'; }
    static { this.TRIGGER_KEY_VALUE = isMacintosh ? 6 /* KeyCode.Alt */ : 5 /* KeyCode.Ctrl */; }
    static get(editor) {
        return editor.getContribution(DragAndDropController.ID);
    }
    constructor(editor) {
        super();
        this._editor = editor;
        this._dndDecorationIds = this._editor.createDecorationsCollection();
        this._register(this._editor.onMouseDown((e) => this._onEditorMouseDown(e)));
        this._register(this._editor.onMouseUp((e) => this._onEditorMouseUp(e)));
        this._register(this._editor.onMouseDrag((e) => this._onEditorMouseDrag(e)));
        this._register(this._editor.onMouseDrop((e) => this._onEditorMouseDrop(e)));
        this._register(this._editor.onMouseDropCanceled(() => this._onEditorMouseDropCanceled()));
        this._register(this._editor.onKeyDown((e) => this.onEditorKeyDown(e)));
        this._register(this._editor.onKeyUp((e) => this.onEditorKeyUp(e)));
        this._register(this._editor.onDidBlurEditorWidget(() => this.onEditorBlur()));
        this._register(this._editor.onDidBlurEditorText(() => this.onEditorBlur()));
        this._mouseDown = false;
        this._modifierPressed = false;
        this._dragSelection = null;
    }
    onEditorBlur() {
        this._removeDecoration();
        this._dragSelection = null;
        this._mouseDown = false;
        this._modifierPressed = false;
    }
    onEditorKeyDown(e) {
        if (!this._editor.getOption(42 /* EditorOption.dragAndDrop */) || this._editor.getOption(28 /* EditorOption.columnSelection */)) {
            return;
        }
        if (hasTriggerModifier(e)) {
            this._modifierPressed = true;
        }
        if (this._mouseDown && hasTriggerModifier(e)) {
            this._editor.updateOptions({
                mouseStyle: 'copy'
            });
        }
    }
    onEditorKeyUp(e) {
        if (!this._editor.getOption(42 /* EditorOption.dragAndDrop */) || this._editor.getOption(28 /* EditorOption.columnSelection */)) {
            return;
        }
        if (hasTriggerModifier(e)) {
            this._modifierPressed = false;
        }
        if (this._mouseDown && e.keyCode === DragAndDropController.TRIGGER_KEY_VALUE) {
            this._editor.updateOptions({
                mouseStyle: 'default'
            });
        }
    }
    _onEditorMouseDown(mouseEvent) {
        this._mouseDown = true;
    }
    _onEditorMouseUp(mouseEvent) {
        this._mouseDown = false;
        // Whenever users release the mouse, the drag and drop operation should finish and the cursor should revert to text.
        this._editor.updateOptions({
            mouseStyle: 'text'
        });
    }
    _onEditorMouseDrag(mouseEvent) {
        const target = mouseEvent.target;
        if (this._dragSelection === null) {
            const selections = this._editor.getSelections() || [];
            const possibleSelections = selections.filter(selection => target.position && selection.containsPosition(target.position));
            if (possibleSelections.length === 1) {
                this._dragSelection = possibleSelections[0];
            }
            else {
                return;
            }
        }
        if (hasTriggerModifier(mouseEvent.event)) {
            this._editor.updateOptions({
                mouseStyle: 'copy'
            });
        }
        else {
            this._editor.updateOptions({
                mouseStyle: 'default'
            });
        }
        if (target.position) {
            if (this._dragSelection.containsPosition(target.position)) {
                this._removeDecoration();
            }
            else {
                this.showAt(target.position);
            }
        }
    }
    _onEditorMouseDropCanceled() {
        this._editor.updateOptions({
            mouseStyle: 'text'
        });
        this._removeDecoration();
        this._dragSelection = null;
        this._mouseDown = false;
    }
    _onEditorMouseDrop(mouseEvent) {
        if (mouseEvent.target && (this._hitContent(mouseEvent.target) || this._hitMargin(mouseEvent.target)) && mouseEvent.target.position) {
            const newCursorPosition = new Position(mouseEvent.target.position.lineNumber, mouseEvent.target.position.column);
            if (this._dragSelection === null) {
                let newSelections = null;
                if (mouseEvent.event.shiftKey) {
                    const primarySelection = this._editor.getSelection();
                    if (primarySelection) {
                        const { selectionStartLineNumber, selectionStartColumn } = primarySelection;
                        newSelections = [new Selection(selectionStartLineNumber, selectionStartColumn, newCursorPosition.lineNumber, newCursorPosition.column)];
                    }
                }
                else {
                    newSelections = (this._editor.getSelections() || []).map(selection => {
                        if (selection.containsPosition(newCursorPosition)) {
                            return new Selection(newCursorPosition.lineNumber, newCursorPosition.column, newCursorPosition.lineNumber, newCursorPosition.column);
                        }
                        else {
                            return selection;
                        }
                    });
                }
                // Use `mouse` as the source instead of `api` and setting the reason to explicit (to behave like any other mouse operation).
                this._editor.setSelections(newSelections || [], 'mouse', 3 /* CursorChangeReason.Explicit */);
            }
            else if (!this._dragSelection.containsPosition(newCursorPosition) ||
                ((hasTriggerModifier(mouseEvent.event) ||
                    this._modifierPressed) && (this._dragSelection.getEndPosition().equals(newCursorPosition) || this._dragSelection.getStartPosition().equals(newCursorPosition)) // we allow users to paste content beside the selection
                )) {
                this._editor.pushUndoStop();
                this._editor.executeCommand(DragAndDropController.ID, new DragAndDropCommand(this._dragSelection, newCursorPosition, hasTriggerModifier(mouseEvent.event) || this._modifierPressed));
                this._editor.pushUndoStop();
            }
        }
        this._editor.updateOptions({
            mouseStyle: 'text'
        });
        this._removeDecoration();
        this._dragSelection = null;
        this._mouseDown = false;
    }
    static { this._DECORATION_OPTIONS = ModelDecorationOptions.register({
        description: 'dnd-target',
        className: 'dnd-target'
    }); }
    showAt(position) {
        this._dndDecorationIds.set([{
                range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
                options: DragAndDropController._DECORATION_OPTIONS
            }]);
        this._editor.revealPosition(position, 1 /* ScrollType.Immediate */);
    }
    _removeDecoration() {
        this._dndDecorationIds.clear();
    }
    _hitContent(target) {
        return target.type === 6 /* MouseTargetType.CONTENT_TEXT */ ||
            target.type === 7 /* MouseTargetType.CONTENT_EMPTY */;
    }
    _hitMargin(target) {
        return target.type === 2 /* MouseTargetType.GUTTER_GLYPH_MARGIN */ ||
            target.type === 3 /* MouseTargetType.GUTTER_LINE_NUMBERS */ ||
            target.type === 4 /* MouseTargetType.GUTTER_LINE_DECORATIONS */;
    }
    dispose() {
        this._removeDecoration();
        this._dragSelection = null;
        this._mouseDown = false;
        this._modifierPressed = false;
        super.dispose();
    }
}
registerEditorContribution(DragAndDropController.ID, DragAndDropController, 2 /* EditorContributionInstantiation.BeforeFirstInteraction */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG5kLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZG5kL2Jyb3dzZXIvZG5kLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBS2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxXQUFXLENBQUM7QUFFbkIsT0FBTyxFQUFtQywwQkFBMEIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBSW5ILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTlELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRTdELFNBQVMsa0JBQWtCLENBQUMsQ0FBK0I7SUFDMUQsSUFBSSxXQUFXLEVBQUUsQ0FBQztRQUNqQixPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDakIsQ0FBQztTQUFNLENBQUM7UUFDUCxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUM7SUFDbEIsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLE9BQU8scUJBQXNCLFNBQVEsVUFBVTthQUU3QixPQUFFLEdBQUcsNEJBQTRCLENBQUM7YUFPekMsc0JBQWlCLEdBQUcsV0FBVyxDQUFDLENBQUMscUJBQWEsQ0FBQyxxQkFBYSxDQUFDO0lBRTdFLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBbUI7UUFDN0IsT0FBTyxNQUFNLENBQUMsZUFBZSxDQUF3QixxQkFBcUIsQ0FBQyxFQUFFLENB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