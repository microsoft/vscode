/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SelectionAnchorController_1;
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import './anchorSelect.css';
import { EditorAction, registerEditorAction, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { Selection } from '../../../common/core/selection.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { localize, localize2 } from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
export const SelectionAnchorSet = new RawContextKey('selectionAnchorSet', false);
let SelectionAnchorController = class SelectionAnchorController {
    static { SelectionAnchorController_1 = this; }
    static { this.ID = 'editor.contrib.selectionAnchorController'; }
    static get(editor) {
        return editor.getContribution(SelectionAnchorController_1.ID);
    }
    constructor(editor, contextKeyService) {
        this.editor = editor;
        this.selectionAnchorSetContextKey = SelectionAnchorSet.bindTo(contextKeyService);
        this.modelChangeListener = editor.onDidChangeModel(() => this.selectionAnchorSetContextKey.reset());
    }
    setSelectionAnchor() {
        if (this.editor.hasModel()) {
            const position = this.editor.getPosition();
            this.editor.changeDecorations((accessor) => {
                if (this.decorationId) {
                    accessor.removeDecoration(this.decorationId);
                }
                this.decorationId = accessor.addDecoration(Selection.fromPositions(position, position), {
                    description: 'selection-anchor',
                    stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
                    hoverMessage: new MarkdownString().appendText(localize('selectionAnchor', "Selection Anchor")),
                    className: 'selection-anchor'
                });
            });
            this.selectionAnchorSetContextKey.set(!!this.decorationId);
            alert(localize('anchorSet', "Anchor set at {0}:{1}", position.lineNumber, position.column));
        }
    }
    goToSelectionAnchor() {
        if (this.editor.hasModel() && this.decorationId) {
            const anchorPosition = this.editor.getModel().getDecorationRange(this.decorationId);
            if (anchorPosition) {
                this.editor.setPosition(anchorPosition.getStartPosition());
            }
        }
    }
    selectFromAnchorToCursor() {
        if (this.editor.hasModel() && this.decorationId) {
            const start = this.editor.getModel().getDecorationRange(this.decorationId);
            if (start) {
                const end = this.editor.getPosition();
                this.editor.setSelection(Selection.fromPositions(start.getStartPosition(), end));
                this.cancelSelectionAnchor();
            }
        }
    }
    cancelSelectionAnchor() {
        if (this.decorationId) {
            const decorationId = this.decorationId;
            this.editor.changeDecorations((accessor) => {
                accessor.removeDecoration(decorationId);
                this.decorationId = undefined;
            });
            this.selectionAnchorSetContextKey.set(false);
        }
    }
    dispose() {
        this.cancelSelectionAnchor();
        this.modelChangeListener.dispose();
    }
};
SelectionAnchorController = SelectionAnchorController_1 = __decorate([
    __param(1, IContextKeyService)
], SelectionAnchorController);
class SetSelectionAnchor extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.setSelectionAnchor',
            label: localize2('setSelectionAnchor', "Set Selection Anchor"),
            precondition: undefined,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    async run(_accessor, editor) {
        SelectionAnchorController.get(editor)?.setSelectionAnchor();
    }
}
class GoToSelectionAnchor extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.goToSelectionAnchor',
            label: localize2('goToSelectionAnchor', "Go to Selection Anchor"),
            precondition: SelectionAnchorSet,
        });
    }
    async run(_accessor, editor) {
        SelectionAnchorController.get(editor)?.goToSelectionAnchor();
    }
}
class SelectFromAnchorToCursor extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.selectFromAnchorToCursor',
            label: localize2('selectFromAnchorToCursor', "Select from Anchor to Cursor"),
            precondition: SelectionAnchorSet,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    async run(_accessor, editor) {
        SelectionAnchorController.get(editor)?.selectFromAnchorToCursor();
    }
}
class CancelSelectionAnchor extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.cancelSelectionAnchor',
            label: localize2('cancelSelectionAnchor', "Cancel Selection Anchor"),
            precondition: SelectionAnchorSet,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 9 /* KeyCode.Escape */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    async run(_accessor, editor) {
        SelectionAnchorController.get(editor)?.cancelSelectionAnchor();
    }
}
registerEditorContribution(SelectionAnchorController.ID, SelectionAnchorController, 4 /* EditorContributionInstantiation.Lazy */);
registerEditorAction(SetSelectionAnchor);
registerEditorAction(GoToSelectionAnchor);
registerEditorAction(SelectFromAnchorToCursor);
registerEditorAction(CancelSelectionAnchor);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5jaG9yU2VsZWN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvYW5jaG9yU2VsZWN0L2Jyb3dzZXIvYW5jaG9yU2VsZWN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDakUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxRQUFRLEVBQW1CLE1BQU0scUNBQXFDLENBQUM7QUFFaEYsT0FBTyxvQkFBb0IsQ0FBQztBQUU1QixPQUFPLEVBQUUsWUFBWSxFQUFtQyxvQkFBb0IsRUFBRSwwQkFBMEIsRUFBb0IsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6SyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFOUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFekUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFHdEgsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxhQUFhLENBQUMsb0JBQW9CLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFFakYsSUFBTSx5QkFBeUIsR0FBL0IsTUFBTSx5QkFBeUI7O2FBRVAsT0FBRSxHQUFHLDBDQUEwQyxBQUE3QyxDQUE4QztJQUV2RSxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQW1CO1FBQzdCLE9BQU8sTUFBTSxDQUFDLGVBQWUsQ0FBNEIsMkJBQXlCLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDeEYsQ0FBQztJQU1ELFlBQ1MsTUFBbUIsRUFDUCxpQkFB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