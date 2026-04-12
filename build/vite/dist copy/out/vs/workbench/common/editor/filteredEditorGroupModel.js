/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
class FilteredEditorGroupModel extends Disposable {
    constructor(model) {
        super();
        this.model = model;
        this._onDidModelChange = this._register(new Emitter());
        this.onDidModelChange = this._onDidModelChange.event;
        this._register(this.model.onDidModelChange(e => {
            const candidateOrIndex = e.editorIndex ?? e.editor;
            if (candidateOrIndex !== undefined) {
                if (!this.filter(candidateOrIndex)) {
                    return; // exclude events for excluded items
                }
            }
            this._onDidModelChange.fire(e);
        }));
    }
    get id() { return this.model.id; }
    get isLocked() { return this.model.isLocked; }
    get stickyCount() { return this.model.stickyCount; }
    get activeEditor() { return this.model.activeEditor && this.filter(this.model.activeEditor) ? this.model.activeEditor : null; }
    get previewEditor() { return this.model.previewEditor && this.filter(this.model.previewEditor) ? this.model.previewEditor : null; }
    get selectedEditors() { return this.model.selectedEditors.filter(e => this.filter(e)); }
    isPinned(editorOrIndex) { return this.model.isPinned(editorOrIndex); }
    isTransient(editorOrIndex) { return this.model.isTransient(editorOrIndex); }
    isSticky(editorOrIndex) { return this.model.isSticky(editorOrIndex); }
    isActive(editor) { return this.model.isActive(editor); }
    isSelected(editorOrIndex) { return this.model.isSelected(editorOrIndex); }
    isFirst(editor) {
        return this.model.isFirst(editor, this.getEditors(1 /* EditorsOrder.SEQUENTIAL */));
    }
    isLast(editor) {
        return this.model.isLast(editor, this.getEditors(1 /* EditorsOrder.SEQUENTIAL */));
    }
    getEditors(order, options) {
        const editors = this.model.getEditors(order, options);
        return editors.filter(e => this.filter(e));
    }
    findEditor(candidate, options) {
        const result = this.model.findEditor(candidate, options);
        if (!result) {
            return undefined;
        }
        return this.filter(result[1]) ? result : undefined;
    }
}
export class StickyEditorGroupModel extends FilteredEditorGroupModel {
    get count() { return this.model.stickyCount; }
    getEditors(order, options) {
        if (options?.excludeSticky) {
            return [];
        }
        if (order === 1 /* EditorsOrder.SEQUENTIAL */) {
            return this.model.getEditors(1 /* EditorsOrder.SEQUENTIAL */).slice(0, this.model.stickyCount);
        }
        return super.getEditors(order, options);
    }
    isSticky(editorOrIndex) {
        return true;
    }
    getEditorByIndex(index) {
        return index < this.count ? this.model.getEditorByIndex(index) : undefined;
    }
    indexOf(editor, editors, options) {
        const editorIndex = this.model.indexOf(editor, editors, options);
        if (editorIndex < 0 || editorIndex >= this.model.stickyCount) {
            return -1;
        }
        return editorIndex;
    }
    contains(candidate, options) {
        const editorIndex = this.model.indexOf(candidate, undefined, options);
        return editorIndex >= 0 && editorIndex < this.model.stickyCount;
    }
    filter(candidateOrIndex) {
        return this.model.isSticky(candidateOrIndex);
    }
}
export class UnstickyEditorGroupModel extends FilteredEditorGroupModel {
    get count() { return this.model.count - this.model.stickyCount; }
    get stickyCount() { return 0; }
    isSticky(editorOrIndex) {
        return false;
    }
    getEditors(order, options) {
        if (order === 1 /* EditorsOrder.SEQUENTIAL */) {
            return this.model.getEditors(1 /* EditorsOrder.SEQUENTIAL */).slice(this.model.stickyCount);
        }
        return super.getEditors(order, options);
    }
    getEditorByIndex(index) {
        return index >= 0 ? this.model.getEditorByIndex(index + this.model.stickyCount) : undefined;
    }
    indexOf(editor, editors, options) {
        const editorIndex = this.model.indexOf(editor, editors, options);
        if (editorIndex < this.model.stickyCount || editorIndex >= this.model.count) {
            return -1;
        }
        return editorIndex - this.model.stickyCount;
    }
    contains(candidate, options) {
        const editorIndex = this.model.indexOf(candidate, undefined, options);
        return editorIndex >= this.model.stickyCount && editorIndex < this.model.count;
    }
    filter(candidateOrIndex) {
        return !this.model.isSticky(candidateOrIndex);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsdGVyZWRFZGl0b3JHcm91cE1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IvZmlsdGVyZWRFZGl0b3JHcm91cE1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV4RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFL0QsTUFBZSx3QkFBeUIsU0FBUSxVQUFVO0lBS3pELFlBQ29CLEtBQWdDO1FBRW5ELEtBQUssRUFBRSxDQUFDO1FBRlcsVUFBSyxHQUFMLEtBQUssQ0FBMkI7UUFKbkMsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBMEIsQ0FBQyxDQUFDO1FBQ2xGLHFCQUFnQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7UUFPeEQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzlDLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDLFdBQVcsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDO1lBQ25ELElBQUksZ0JBQWdCLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ3BDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQztvQkFDcEMsT0FBTyxDQUFDLG9DQUFvQztnQkFDN0MsQ0FBQztZQUNGLENBQUM7WUFDRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsSUFBSSxFQUFFLEtBQXNCLE9BQU8sSUFB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