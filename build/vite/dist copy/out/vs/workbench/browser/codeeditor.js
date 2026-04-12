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
var RangeHighlightDecorations_1;
import { Emitter } from '../../base/common/event.js';
import { Disposable, DisposableStore } from '../../base/common/lifecycle.js';
import { isEqual } from '../../base/common/resources.js';
import { isCodeEditor, isCompositeEditor } from '../../editor/browser/editorBrowser.js';
import { EmbeddedCodeEditorWidget } from '../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { ModelDecorationOptions } from '../../editor/common/model/textModel.js';
import { AbstractFloatingClickMenu, FloatingClickWidget } from '../../platform/actions/browser/floatingMenu.js';
import { IMenuService, MenuId } from '../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding.js';
import { IEditorService } from '../services/editor/common/editorService.js';
let RangeHighlightDecorations = class RangeHighlightDecorations extends Disposable {
    static { RangeHighlightDecorations_1 = this; }
    constructor(editorService) {
        super();
        this.editorService = editorService;
        this._onHighlightRemoved = this._register(new Emitter());
        this.onHighlightRemoved = this._onHighlightRemoved.event;
        this.rangeHighlightDecorationId = null;
        this.editor = null;
        this.editorDisposables = this._register(new DisposableStore());
    }
    removeHighlightRange() {
        if (this.editor && this.rangeHighlightDecorationId) {
            const decorationId = this.rangeHighlightDecorationId;
            this.editor.changeDecorations((accessor) => {
                accessor.removeDecoration(decorationId);
            });
            this._onHighlightRemoved.fire();
        }
        this.rangeHighlightDecorationId = null;
    }
    highlightRange(range, editor) {
        editor = editor ?? this.getEditor(range);
        if (isCodeEditor(editor)) {
            this.doHighlightRange(editor, range);
        }
        else if (isCompositeEditor(editor) && isCodeEditor(editor.activeCodeEditor)) {
            this.doHighlightRange(editor.activeCodeEditor, range);
        }
    }
    doHighlightRange(editor, selectionRange) {
        this.removeHighlightRange();
        editor.changeDecorations((changeAccessor) => {
            this.rangeHighlightDecorationId = changeAccessor.addDecoration(selectionRange.range, this.createRangeHighlightDecoration(selectionRange.isWholeLine));
        });
        this.setEditor(editor);
    }
    getEditor(resourceRange) {
        const resource = this.editorService.activeEditor?.resource;
        if (resource && isEqual(resource, resourceRange.resource) && isCodeEditor(this.editorService.activeTextEditorControl)) {
            return this.editorService.activeTextEditorControl;
        }
        return undefined;
    }
    setEditor(editor) {
        if (this.editor !== editor) {
            this.editorDisposables.clear();
            this.editor = editor;
            this.editorDisposables.add(this.editor.onDidChangeCursorPosition((e) => {
                if (e.reason === 0 /* CursorChangeReason.NotSet */
                    || e.reason === 3 /* CursorChangeReason.Explicit */
                    || e.reason === 5 /* CursorChangeReason.Undo */
                    || e.reason === 6 /* CursorChangeReason.Redo */) {
                    this.removeHighlightRange();
                }
            }));
            this.editorDisposables.add(this.editor.onDidChangeModel(() => { this.removeHighlightRange(); }));
            this.editorDisposables.add(this.editor.onDidDispose(() => {
                this.removeHighlightRange();
                this.editor = null;
            }));
        }
    }
    static { this._WHOLE_LINE_RANGE_HIGHLIGHT = ModelDecorationOptions.register({
        description: 'codeeditor-range-highlight-whole',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        className: 'rangeHighlight',
        isWholeLine: true
    }); }
    static { this._RANGE_HIGHLIGHT = ModelDecorationOptions.register({
        description: 'codeeditor-range-highlight',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        className: 'rangeHighlight'
    }); }
    createRangeHighlightDecoration(isWholeLine = true) {
        return (isWholeLine ? RangeHighlightDecorations_1._WHOLE_LINE_RANGE_HIGHLIGHT : RangeHighlightDecorations_1._RANGE_HIGHLIGHT);
    }
    dispose() {
        super.dispose();
        if (this.editor?.getModel()) {
            this.removeHighlightRange();
            this.editor = null;
        }
    }
};
RangeHighlightDecorations = RangeHighlightDecorations_1 = __decorate([
    __param(0, IEditorService)
], RangeHighlightDecorations);
export { RangeHighlightDecorations };
let FloatingEditorClickWidget = class FloatingEditorClickWidget extends FloatingClickWidget {
    constructor(editor, label, keyBindingAction, keybindingService) {
        super(keybindingService.appendKeybinding(label, keyBindingAction));
        this.editor = editor;
    }
    getId() {
        return 'editor.overlayWidget.floatingClickWidget';
    }
    getPosition() {
        return {
            preference: 1 /* OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER */
        };
    }
    render() {
        super.render();
        this.editor.addOverlayWidget(this);
    }
    dispose() {
        this.editor.removeOverlayWidget(this);
        super.dispose();
    }
};
FloatingEditorClickWidget = __decorate([
    __param(3, IKeybindingService)
], FloatingEditorClickWidget);
export { FloatingEditorClickWidget };
let FloatingEditorClickMenu = class FloatingEditorClickMenu extends AbstractFloatingClickMenu {
    static { this.ID = 'editor.contrib.floatingClickMenu'; }
    constructor(editor, instantiationService, menuService, contextKeyService) {
        super(MenuId.EditorContent, menuService, contextKeyService);
        this.editor = editor;
        this.instantiationService = instantiationService;
        this.render();
    }
    createWidget(action) {
        return this.instantiationService.createInstance(FloatingEditorClickWidget, this.editor, action.label, action.id);
    }
    isVisible() {
        return !(this.editor instanceof EmbeddedCodeEditorWidget) && this.editor?.hasModel() && !this.editor.getOption(70 /* EditorOption.inDiffEditor */);
    }
    getActionArg() {
        return this.editor.getModel()?.uri;
    }
};
FloatingEditorClickMenu = __decorate([
    __param(1, IInstantiationService),
    __param(2, IMenuService),
    __param(3, IContextKeyService)
], FloatingEditorClickMenu);
export { FloatingEditorClickMenu };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWVkaXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL2NvZGVlZGl0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUV6RCxPQUFPLEVBQXdGLFlBQVksRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzlLLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBTTlHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDaEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDN0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBUXJFLElBQU0seUJBQXlCLEdBQS9CLE1BQU0seUJBQTBCLFNBQVEsVUFBVTs7SUFTeEQsWUFBNEIsYUFBOEM7UUFDekUsS0FBSyxFQUFFLENBQUM7UUFEb0Msa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBUHpELHdCQUFtQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQ2xFLHVCQUFrQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7UUFFckQsK0JBQTBCLEdBQWtCLElBQUksQ0FBQztRQUNqRCxXQUFNLEdBQXVCLElBQUksQ0FBQztRQUN6QixzQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztJQUkzRSxDQUFDO0lBRUQsb0JBQW9CO1FBQ25CLElBQUksSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztZQUNwRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUM7WUFDckQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFO2dCQUMxQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDekMsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDakMsQ0FBQztRQUVELElBQUksQ0FBQywwQkFBMEIsR0FBRyxJQUFJLENBQUM7SUFDeEMsQ0FBQztJQUVELGNBQWMsQ0FBQyxLQUFnQyxFQUFFLE1BQWdCO1FBQ2hFLE1BQU0sR0FBRyxNQUFNLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN6QyxJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEMsQ0FBQzthQUFNLElBQUksaUJBQWlCLENBQUMsTUFBTSxDQUFDLElBQUksWUFBWSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLENBQUM7WUFDL0UsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN2RCxDQUFDO0lBQ0YsQ0FBQztJQUVPLGdCQUFnQixDQUFDLE1BQW1CLEVBQUUsY0FBeUM7UUFDdEYsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFFNUIsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUMsY0FBK0MsRUFBRSxFQUFFO1lBQzVFLElBQUksQ0FBQywwQkFBMEIsR0FBRyxjQUFjLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLDhCQUE4QixDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBQ3ZKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN4QixDQUFDO0lBRU8sU0FBUyxDQUFDLGFBQXdDO1FBQ3pELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQztRQUMzRCxJQUFJLFFBQVEsSUFBSSxPQUFPLENBQUMsUUFBUSxFQUFFLGFBQWEsQ0FBQyxRQUFRLENBQUMsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLENBQUM7WUFDdkgsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLHVCQUF1QixDQUFDO1FBQ25ELENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRU8sU0FBUyxDQUFDLE1BQW1CO1FBQ3BDLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUM1QixJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7WUFDckIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBOEIsRUFBRSxFQUFFO2dCQUNuRyxJQUNDLENBQUMsQ0FBQyxNQUFNLHNDQUE4Qjt1QkFDbkMsQ0FBQyxDQUFDLE1BQU0sd0NBQWdDO3VCQUN4QyxDQUFDLENBQUMsTUFBTSxvQ0FBNEI7dUJBQ3BDLENBQUMsQ0FBQyxNQUFNLG9DQUE0QixFQUN0QyxDQUFDO29CQUNGLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO2dCQUM3QixDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNKLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDakcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUU7Z0JBQ3hELElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO2dCQUM1QixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztZQUNwQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztJQUNGLENBQUM7YUFFdUIsZ0NBQTJCLEdBQUcsc0JBQXNCLENBQUMsUUFBUSxDQUFDO1FBQ3JGLFdBQVcsRUFBRSxrQ0FBa0M7UUFDL0MsVUFBVSw0REFBb0Q7UUFDOUQsU0FBUyxFQUFFLGdCQUFnQjtRQUMzQixXQUFXLEVBQUUsSUFBSTtLQUNqQixDQUFDLEFBTGlELENBS2hEO2FBRXFCLHFCQUFnQixHQUFHLHNCQUFzQixDQUFDLFFBQVEsQ0FBQztRQUMxRSxXQUFXLEVBQUUsNEJBQTRCO1FBQ3pDLFVBQVUsNERBQW9EO1FBQzlELFNBQVMsRUFBRSxnQkFBZ0I7S0FDM0IsQ0FBQyxBQUpzQyxDQUlyQztJQUVLLDhCQUE4QixDQUFDLGNBQXVCLElBQUk7UUFDakUsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsMkJBQXlCLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDLDJCQUF5QixDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFDM0gsQ0FBQztJQUVRLE9BQU87UUFDZixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFaEIsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDN0IsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDNUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7UUFDcEIsQ0FBQztJQUNGLENBQUM7O0FBbkdXLHlCQUF5QjtJQVN4QixXQUFBLGNBQWMsQ0FBQTtHQVRmLHlCQUF5QixDQW9HckM7O0FBRU0sSUFBTSx5QkFBeUIsR0FBL0IsTUFBTSx5QkFBMEIsU0FBUSxtQkFBbUI7SUFFakUsWUFDUyxNQUFtQixFQUMzQixLQUFhLEVBQ2IsZ0JBQStCLEVBQ1gsaUJBQXFDO1FBRXpELEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1FBTDNELFdBQU0sR0FBTixNQUFNLENBQWE7SUFNNUIsQ0FBQztJQUVELEtBQUs7UUFDSixPQUFPLDBDQUEwQyxDQUFDO0lBQ25ELENBQUM7SUFFRCxXQUFXO1FBQ1YsT0FBTztZQUNOLFVBQVUsNkRBQXFEO1NBQy9ELENBQUM7SUFDSCxDQUFDO0lBRVEsTUFBTTtRQUNkLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNmLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVRLE9BQU87UUFDZixJQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNqQixDQUFDO0NBRUQsQ0FBQTtBQS9CWSx5QkFBeUI7SUFNbkMsV0FBQSxrQkFBa0IsQ0FBQTtHQU5SLHlCQUF5QixDQStCckM7O0FBRU0sSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBd0IsU0FBUSx5QkFBeUI7YUFDckQsT0FBRSxHQUFHLGtDQUFrQyxBQUFyQyxDQUFzQztJQUV4RCxZQUNrQixNQUFtQixFQUNJLG9CQUEyQyxFQUNyRSxXQUF5QixFQUNuQixpQkFBcUM7UUFFekQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFMM0MsV0FBTSxHQUFOLE1BQU0sQ0FBYTtRQUNJLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFLbkYsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ2YsQ0FBQztJQUVrQixZQUFZLENBQUMsTUFBZTtRQUM5QyxPQUFPLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMseUJBQXlCLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNsSCxDQUFDO0lBRWtCLFNBQVM7UUFDM0IsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sWUFBWSx3QkFBd0IsQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsb0NBQTJCLENBQUM7SUFDM0ksQ0FBQztJQUVrQixZQUFZO1FBQzlCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRSxHQUFHLENBQUM7SUFDcEMsQ0FBQzs7QUF2QlcsdUJBQXVCO0lBS2pDLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLGtCQUFrQixDQUFBO0dBUFIsdUJBQXVCLENBd0JuQyJ9