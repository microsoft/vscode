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
var InPlaceReplaceController_1;
import { createCancelablePromise, timeout } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { EditorState } from '../../editorState/browser/editorState.js';
import { EditorAction, registerEditorAction, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { IEditorWorkerService } from '../../../common/services/editorWorker.js';
import * as nls from '../../../../nls.js';
import { InPlaceReplaceCommand } from './inPlaceReplaceCommand.js';
import './inPlaceReplace.css';
let InPlaceReplaceController = class InPlaceReplaceController {
    static { InPlaceReplaceController_1 = this; }
    static { this.ID = 'editor.contrib.inPlaceReplaceController'; }
    static get(editor) {
        return editor.getContribution(InPlaceReplaceController_1.ID);
    }
    static { this.DECORATION = ModelDecorationOptions.register({
        description: 'in-place-replace',
        className: 'valueSetReplacement'
    }); }
    constructor(editor, editorWorkerService) {
        this.editor = editor;
        this.editorWorkerService = editorWorkerService;
        this.decorations = this.editor.createDecorationsCollection();
    }
    dispose() {
    }
    run(source, up) {
        // cancel any pending request
        this.currentRequest?.cancel();
        const editorSelection = this.editor.getSelection();
        const model = this.editor.getModel();
        if (!model || !editorSelection) {
            return undefined;
        }
        let selection = editorSelection;
        if (selection.startLineNumber !== selection.endLineNumber) {
            // Can't accept multiline selection
            return undefined;
        }
        const state = new EditorState(this.editor, 1 /* CodeEditorStateFlag.Value */ | 4 /* CodeEditorStateFlag.Position */);
        const modelURI = model.uri;
        if (!this.editorWorkerService.canNavigateValueSet(modelURI)) {
            return Promise.resolve(undefined);
        }
        this.currentRequest = createCancelablePromise(token => this.editorWorkerService.navigateValueSet(modelURI, selection, up));
        return this.currentRequest.then(result => {
            if (!result || !result.range || !result.value) {
                // No proper result
                return;
            }
            if (!state.validate(this.editor)) {
                // state has changed
                return;
            }
            // Selection
            const editRange = Range.lift(result.range);
            let highlightRange = result.range;
            const diff = result.value.length - (selection.endColumn - selection.startColumn);
            // highlight
            highlightRange = {
                startLineNumber: highlightRange.startLineNumber,
                startColumn: highlightRange.startColumn,
                endLineNumber: highlightRange.endLineNumber,
                endColumn: highlightRange.startColumn + result.value.length
            };
            if (diff > 1) {
                selection = new Selection(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn + diff - 1);
            }
            // Insert new text
            const command = new InPlaceReplaceCommand(editRange, selection, result.value);
            this.editor.pushUndoStop();
            this.editor.executeCommand(source, command);
            this.editor.pushUndoStop();
            // add decoration
            this.decorations.set([{
                    range: highlightRange,
                    options: InPlaceReplaceController_1.DECORATION
                }]);
            // remove decoration after delay
            this.decorationRemover?.cancel();
            this.decorationRemover = timeout(350);
            this.decorationRemover.then(() => this.decorations.clear()).catch(onUnexpectedError);
        }).catch(onUnexpectedError);
    }
};
InPlaceReplaceController = InPlaceReplaceController_1 = __decorate([
    __param(1, IEditorWorkerService)
], InPlaceReplaceController);
class InPlaceReplaceUp extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.inPlaceReplace.up',
            label: nls.localize2('InPlaceReplaceAction.previous.label', "Replace with Previous Value"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 87 /* KeyCode.Comma */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(accessor, editor) {
        const controller = InPlaceReplaceController.get(editor);
        if (!controller) {
            return Promise.resolve(undefined);
        }
        return controller.run(this.id, false);
    }
}
class InPlaceReplaceDown extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.inPlaceReplace.down',
            label: nls.localize2('InPlaceReplaceAction.next.label', "Replace with Next Value"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 89 /* KeyCode.Period */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(accessor, editor) {
        const controller = InPlaceReplaceController.get(editor);
        if (!controller) {
            return Promise.resolve(undefined);
        }
        return controller.run(this.id, true);
    }
}
registerEditorContribution(InPlaceReplaceController.ID, InPlaceReplaceController, 4 /* EditorContributionInstantiation.Lazy */);
registerEditorAction(InPlaceReplaceUp);
registerEditorAction(InPlaceReplaceDown);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5QbGFjZVJlcGxhY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pblBsYWNlUmVwbGFjZS9icm93c2VyL2luUGxhY2VSZXBsYWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXRFLE9BQU8sRUFBdUIsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFNUYsT0FBTyxFQUFFLFlBQVksRUFBbUMsb0JBQW9CLEVBQUUsMEJBQTBCLEVBQW9CLE1BQU0sc0NBQXNDLENBQUM7QUFDekssT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUU5RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU1RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRixPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBRTFDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ25FLE9BQU8sc0JBQXNCLENBQUM7QUFFOUIsSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBd0I7O2FBRU4sT0FBRSxHQUFHLHlDQUF5QyxBQUE1QyxDQUE2QztJQUV0RSxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQW1CO1FBQzdCLE9BQU8sTUFBTSxDQUFDLGVBQWUsQ0FBMkIsMEJBQXdCLENB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