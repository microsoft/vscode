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
var EditorGroupModel_1;
import { Event, Emitter } from '../../../base/common/event.js';
import { EditorExtensions, SideBySideEditor, EditorCloseContext } from '../editor.js';
import { EditorInput } from './editorInput.js';
import { SideBySideEditorInput } from './sideBySideEditorInput.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { dispose, Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { coalesce } from '../../../base/common/arrays.js';
const EditorOpenPositioning = {
    LEFT: 'left',
    RIGHT: 'right',
    FIRST: 'first',
    LAST: 'last'
};
export function isSerializedEditorGroupModel(group) {
    const candidate = group;
    return !!(candidate && typeof candidate === 'object' && Array.isArray(candidate.editors) && Array.isArray(candidate.mru));
}
export function isGroupEditorChangeEvent(e) {
    const candidate = e;
    return candidate.editor && candidate.editorIndex !== undefined;
}
export function isGroupEditorOpenEvent(e) {
    const candidate = e;
    return candidate.kind === 5 /* GroupModelChangeKind.EDITOR_OPEN */ && candidate.editorIndex !== undefined;
}
export function isGroupEditorMoveEvent(e) {
    const candidate = e;
    return candidate.kind === 7 /* GroupModelChangeKind.EDITOR_MOVE */ && candidate.editorIndex !== undefined && candidate.oldEditorIndex !== undefined;
}
export function isGroupEditorCloseEvent(e) {
    const candidate = e;
    return candidate.kind === 6 /* GroupModelChangeKind.EDITOR_CLOSE */ && candidate.editorIndex !== undefined && candidate.context !== undefined && candidate.sticky !== undefined;
}
let EditorGroupModel = class EditorGroupModel extends Disposable {
    static { EditorGroupModel_1 = this; }
    static { this.IDS = 0; }
    get id() { return this._id; }
    get active() {
        return this.selection[0] ?? null;
    }
    constructor(labelOrSerializedGroup, instantiationService, configurationService) {
        super();
        this.instantiationService = instantiationService;
        this.configurationService = configurationService;
        //#region events
        this._onDidModelChange = this._register(new Emitter({ leakWarningThreshold: 500 /* increased for users with hundreds of inputs opened */ }));
        this.onDidModelChange = this._onDidModelChange.event;
        this.editors = [];
        this.mru = [];
        this.editorListeners = new Set();
        this.locked = false;
        this.selection = []; // editors in selected state, first one is active
        this.preview = null; // editor in preview state
        this.sticky = -1; // index of first editor in sticky state
        this.transient = new Set(); // editors in transient state
        if (isSerializedEditorGroupModel(labelOrSerializedGroup)) {
            this._id = this.deserialize(labelOrSerializedGroup);
        }
        else {
            this._id = EditorGroupModel_1.IDS++;
        }
        this.onConfigurationUpdated();
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));
    }
    onConfigurationUpdated(e) {
        if (e && !e.affectsConfiguration('workbench.editor.openPositioning') && !e.affectsConfiguration('workbench.editor.focusRecentEditorAfterClose')) {
            return;
        }
        this.editorOpenPositioning = this.configurationService.getValue('workbench.editor.openPositioning');
        this.focusRecentEditorAfterClose = this.configurationService.getValue('workbench.editor.focusRecentEditorAfterClose');
    }
    get count() {
        return this.editors.length;
    }
    get stickyCount() {
        return this.sticky + 1;
    }
    getEditors(order, options) {
        const editors = order === 0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */ ? this.mru.slice(0) : this.editors.slice(0);
        if (options?.excludeSticky) {
            // MRU: need to check for index on each
            if (order === 0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */) {
                return editors.filter(editor => !this.isSticky(editor));
            }
            // Sequential: simply start after sticky index
            return editors.slice(this.sticky + 1);
        }
        return editors;
    }
    getEditorByIndex(index) {
        return this.editors[index];
    }
    get activeEditor() {
        return this.active;
    }
    isActive(candidate) {
        return this.matches(this.active, candidate);
    }
    get previewEditor() {
        return this.preview;
    }
    openEditor(candidate, options) {
        const makeSticky = options?.sticky || (typeof options?.index === 'number' && this.isSticky(options.index));
        const makePinned = options?.pinned || options?.sticky;
        const makeTransient = !!options?.transient;
        const makeActive = options?.active || !this.activeEditor || (!makePinned && this.preview === this.activeEditor);
        const existingEditorAndIndex = this.findEditor(candidate, options);
        // New editor
        if (!existingEditorAndIndex) {
            const newEditor = candidate;
            const indexOfActive = this.indexOf(this.active);
            // Insert into specific position
            let targetIndex;
            if (options && typeof options.index === 'number') {
                targetIndex = options.index;
            }
            // Insert to the BEGINNING
            else if (this.editorOpenPositioning === EditorOpenPositioning.FIRST) {
                targetIndex = 0;
                // Always make sure targetIndex is after sticky editors
                // unless we are explicitly told to make the editor sticky
                if (!makeSticky && this.isSticky(targetIndex)) {
                    targetIndex = this.sticky + 1;
                }
            }
            // Insert to the END
            else if (this.editorOpenPositioning === EditorOpenPositioning.LAST) {
                targetIndex = this.editors.length;
            }
            // Insert to LEFT or RIGHT of active editor
            else {
                // Insert to the LEFT of active editor
                if (this.editorOpenPositioning === EditorOpenPositioning.LEFT) {
                    if (indexOfActive === 0 || !this.editors.length) {
                        targetIndex = 0; // to the left becoming first editor in list
                    }
                    else {
                        targetIndex = indexOfActive; // to the left of active editor
                    }
                }
                // Insert to the RIGHT of active editor
                else {
                    targetIndex = indexOfActive + 1;
                }
                // Always make sure targetIndex is after sticky editors
                // unless we are explicitly told to make the editor sticky
                if (!makeSticky && this.isSticky(targetIndex)) {
                    targetIndex = this.sticky + 1;
                }
            }
            // If the editor becomes sticky, increment the sticky index and adjust
            // the targetIndex to be at the end of sticky editors unless already.
            if (makeSticky) {
                this.sticky++;
                if (!this.isSticky(targetIndex)) {
                    targetIndex = this.sticky;
                }
            }
            // Insert into our list of editors if pinned or we have no preview editor
            if (makePinned || !this.preview) {
                this.splice(targetIndex, false, newEditor);
            }
            // Handle transient
            if (makeTransient) {
                this.doSetTransient(newEditor, targetIndex, true);
            }
            // Handle preview
            if (!makePinned) {
                // Replace existing preview with this editor if we have a preview
                if (this.preview) {
                    const indexOfPreview = this.indexOf(this.preview);
                    if (targetIndex > indexOfPreview) {
                        targetIndex--; // accommodate for the fact that the preview editor closes
                    }
                    this.replaceEditor(this.preview, newEditor, targetIndex, !makeActive);
                }
                this.preview = newEditor;
            }
            // Listeners
            this.registerEditorListeners(newEditor);
            // Event
            const event = {
                kind: 5 /* GroupModelChangeKind.EDITOR_OPEN */,
                editor: newEditor,
                editorIndex: targetIndex
            };
            this._onDidModelChange.fire(event);
            // Handle active editor / selected editors
            this.setSelection(makeActive ? newEditor : this.activeEditor, options?.inactiveSelection ?? []);
            return {
                editor: newEditor,
                isNew: true
            };
        }
        // Existing editor
        else {
            const [existingEditor, existingEditorIndex] = existingEditorAndIndex;
            // Update transient (existing editors do not turn transient if they were not before)
            this.doSetTransient(existingEditor, existingEditorIndex, makeTransient === false ? false : this.isTransient(existingEditor));
            // Pin it
            if (makePinned) {
                this.doPin(existingEditor, existingEditorIndex);
            }
            // Handle active editor / selected editors
            this.setSelection(makeActive ? existingEditor : this.activeEditor, options?.inactiveSelection ?? []);
            // Respect index
            if (options && typeof options.index === 'number') {
                this.moveEditor(existingEditor, options.index);
            }
            // Stick it (intentionally after the moveEditor call in case
            // the editor was already moved into the sticky range)
            if (makeSticky) {
                this.doStick(existingEditor, this.indexOf(existingEditor));
            }
            return {
                editor: existingEditor,
                isNew: false
            };
        }
    }
    registerEditorListeners(editor) {
        const listeners = new DisposableStore();
        this.editorListeners.add(listeners);
        // Re-emit disposal of editor input as our own event
        listeners.add(Event.once(editor.onWillDispose)(() => {
            const editorIndex = this.editors.indexOf(editor);
            if (editorIndex >= 0) {
                const event = {
                    kind: 15 /* GroupModelChangeKind.EDITOR_WILL_DISPOSE */,
                    editor,
                    editorIndex
                };
                this._onDidModelChange.fire(event);
            }
        }));
        // Re-Emit dirty state changes
        listeners.add(editor.onDidChangeDirty(() => {
            const event = {
                kind: 14 /* GroupModelChangeKind.EDITOR_DIRTY */,
                editor,
                editorIndex: this.editors.indexOf(editor)
            };
            this._onDidModelChange.fire(event);
        }));
        // Re-Emit label changes
        listeners.add(editor.onDidChangeLabel(() => {
            const event = {
                kind: 9 /* GroupModelChangeKind.EDITOR_LABEL */,
                editor,
                editorIndex: this.editors.indexOf(editor)
            };
            this._onDidModelChange.fire(event);
        }));
        // Re-Emit capability changes
        listeners.add(editor.onDidChangeCapabilities(() => {
            const event = {
                kind: 10 /* GroupModelChangeKind.EDITOR_CAPABILITIES */,
                editor,
                editorIndex: this.editors.indexOf(editor)
            };
            this._onDidModelChange.fire(event);
        }));
        // Clean up dispose listeners once the editor gets closed
        listeners.add(this.onDidModelChange(event => {
            if (event.kind === 6 /* GroupModelChangeKind.EDITOR_CLOSE */ && event.editor?.matches(editor)) {
                dispose(listeners);
                this.editorListeners.delete(listeners);
            }
        }));
    }
    replaceEditor(toReplace, replaceWith, replaceIndex, openNext = true) {
        const closeResult = this.doCloseEditor(toReplace, EditorCloseContext.REPLACE, openNext); // optimization to prevent multiple setActive() in one call
        // We want to first add the new editor into our model before emitting the close event because
        // firing the close event can trigger a dispose on the same editor that is now being added.
        // This can lead into opening a disposed editor which is not what we want.
        this.splice(replaceIndex, false, replaceWith);
        if (closeResult) {
            const event = {
                kind: 6 /* GroupModelChangeKind.EDITOR_CLOSE */,
                ...closeResult
            };
            this._onDidModelChange.fire(event);
        }
    }
    closeEditor(candidate, context = EditorCloseContext.UNKNOWN, openNext = true) {
        const closeResult = this.doCloseEditor(candidate, context, openNext);
        if (closeResult) {
            const event = {
                kind: 6 /* GroupModelChangeKind.EDITOR_CLOSE */,
                ...closeResult
            };
            this._onDidModelChange.fire(event);
            return closeResult;
        }
        return undefined;
    }
    doCloseEditor(candidate, context, openNext) {
        const index = this.indexOf(candidate);
        if (index === -1) {
            return undefined; // not found
        }
        const editor = this.editors[index];
        const sticky = this.isSticky(index);
        // Active editor closed
        const isActiveEditor = this.active === editor;
        if (openNext && isActiveEditor) {
            // More than one editor
            if (this.mru.length > 1) {
                let newActive;
                if (this.focusRecentEditorAfterClose) {
                    newActive = this.mru[1]; // active editor is always first in MRU, so pick second editor after as new active
                }
                else {
                    if (index === this.editors.length - 1) {
                        newActive = this.editors[index - 1]; // last editor is closed, pick previous as new active
                    }
                    else {
                        newActive = this.editors[index + 1]; // pick next editor as new active
                    }
                }
                // Select editor as active
                const newInactiveSelectedEditors = this.selection.filter(selected => selected !== editor && selected !== newActive);
                this.doSetSelection(newActive, this.editors.indexOf(newActive), newInactiveSelectedEditors);
            }
            // Last editor closed: clear selection
            else {
                this.doSetSelection(null, undefined, []);
            }
        }
        // Inactive editor closed
        else if (!isActiveEditor) {
            // Remove editor from inactive selection
            if (this.doIsSelected(editor)) {
                const newInactiveSelectedEditors = this.selection.filter(selected => selected !== editor && selected !== this.activeEditor);
                this.doSetSelection(this.activeEditor, this.indexOf(this.activeEditor), newInactiveSelectedEditors);
            }
        }
        // Preview Editor closed
        if (this.preview === editor) {
            this.preview = null;
        }
        // Remove from transient
        this.transient.delete(editor);
        // Remove from arrays
        this.splice(index, true);
        // Event
        return { editor, sticky, editorIndex: index, context };
    }
    moveEditor(candidate, toIndex) {
        // Ensure toIndex is in bounds of our model
        if (toIndex >= this.editors.length) {
            toIndex = this.editors.length - 1;
        }
        else if (toIndex < 0) {
            toIndex = 0;
        }
        const index = this.indexOf(candidate);
        if (index < 0 || toIndex === index) {
            return;
        }
        const editor = this.editors[index];
        const sticky = this.sticky;
        // Adjust sticky index: editor moved out of sticky state into unsticky state
        if (this.isSticky(index) && toIndex > this.sticky) {
            this.sticky--;
        }
        // ...or editor moved into sticky state from unsticky state
        else if (!this.isSticky(index) && toIndex <= this.sticky) {
            this.sticky++;
        }
        // Move
        this.editors.splice(index, 1);
        this.editors.splice(toIndex, 0, editor);
        // Move Event
        const event = {
            kind: 7 /* GroupModelChangeKind.EDITOR_MOVE */,
            editor,
            oldEditorIndex: index,
            editorIndex: toIndex
        };
        this._onDidModelChange.fire(event);
        // Sticky Event (if sticky changed as part of the move)
        if (sticky !== this.sticky) {
            const event = {
                kind: 13 /* GroupModelChangeKind.EDITOR_STICKY */,
                editor,
                editorIndex: toIndex
            };
            this._onDidModelChange.fire(event);
        }
        return editor;
    }
    setActive(candidate) {
        let result;
        if (!candidate) {
            this.setGroupActive();
        }
        else {
            result = this.setEditorActive(candidate);
        }
        return result;
    }
    setGroupActive() {
        // We do not really keep the `active` state in our model because
        // it has no special meaning to us here. But for consistency
        // we emit a `onDidModelChange` event so that components can
        // react.
        this._onDidModelChange.fire({ kind: 0 /* GroupModelChangeKind.GROUP_ACTIVE */ });
    }
    setEditorActive(candidate) {
        const res = this.findEditor(candidate);
        if (!res) {
            return; // not found
        }
        const [editor, editorIndex] = res;
        this.doSetSelection(editor, editorIndex, []);
        return editor;
    }
    get selectedEditors() {
        return this.editors.filter(editor => this.doIsSelected(editor)); // return in sequential order
    }
    isSelected(editorCandidateOrIndex) {
        let editor;
        if (typeof editorCandidateOrIndex === 'number') {
            editor = this.editors[editorCandidateOrIndex];
        }
        else {
            editor = this.findEditor(editorCandidateOrIndex)?.[0];
        }
        return !!editor && this.doIsSelected(editor);
    }
    doIsSelected(editor) {
        return this.selection.includes(editor);
    }
    setSelection(activeSelectedEditorCandidate, inactiveSelectedEditorCandidates) {
        const res = this.findEditor(activeSelectedEditorCandidate);
        if (!res) {
            return; // not found
        }
        const [activeSelectedEditor, activeSelectedEditorIndex] = res;
        const inactiveSelectedEditors = new Set();
        for (const inactiveSelectedEditorCandidate of inactiveSelectedEditorCandidates) {
            const res = this.findEditor(inactiveSelectedEditorCandidate);
            if (!res) {
                return; // not found
            }
            const [inactiveSelectedEditor] = res;
            if (inactiveSelectedEditor === activeSelectedEditor) {
                continue; // already selected
            }
            inactiveSelectedEditors.add(inactiveSelectedEditor);
        }
        this.doSetSelection(activeSelectedEditor, activeSelectedEditorIndex, Array.from(inactiveSelectedEditors));
    }
    doSetSelection(activeSelectedEditor, activeSelectedEditorIndex, inactiveSelectedEditors) {
        const previousActiveEditor = this.activeEditor;
        const previousSelection = this.selection;
        let newSelection;
        if (activeSelectedEditor) {
            newSelection = [activeSelectedEditor, ...inactiveSelectedEditors];
        }
        else {
            newSelection = [];
        }
        // Update selection
        this.selection = newSelection;
        // Update active editor if it has changed
        const activeEditorChanged = activeSelectedEditor && typeof activeSelectedEditorIndex === 'number' && previousActiveEditor !== activeSelectedEditor;
        if (activeEditorChanged) {
            // Bring to front in MRU list
            const mruIndex = this.indexOf(activeSelectedEditor, this.mru);
            this.mru.splice(mruIndex, 1);
            this.mru.unshift(activeSelectedEditor);
            // Event
            const event = {
                kind: 8 /* GroupModelChangeKind.EDITOR_ACTIVE */,
                editor: activeSelectedEditor,
                editorIndex: activeSelectedEditorIndex
            };
            this._onDidModelChange.fire(event);
        }
        // Fire event if the selection has changed
        if (activeEditorChanged ||
            previousSelection.length !== newSelection.length ||
            previousSelection.some(editor => !newSelection.includes(editor))) {
            const event = {
                kind: 4 /* GroupModelChangeKind.EDITORS_SELECTION */
            };
            this._onDidModelChange.fire(event);
        }
    }
    setIndex(index) {
        // We do not really keep the `index` in our model because
        // it has no special meaning to us here. But for consistency
        // we emit a `onDidModelChange` event so that components can
        // react.
        this._onDidModelChange.fire({ kind: 1 /* GroupModelChangeKind.GROUP_INDEX */ });
    }
    setLabel(label) {
        // We do not really keep the `label` in our model because
        // it has no special meaning to us here. But for consistency
        // we emit a `onDidModelChange` event so that components can
        // react.
        this._onDidModelChange.fire({ kind: 2 /* GroupModelChangeKind.GROUP_LABEL */ });
    }
    pin(candidate) {
        const res = this.findEditor(candidate);
        if (!res) {
            return; // not found
        }
        const [editor, editorIndex] = res;
        this.doPin(editor, editorIndex);
        return editor;
    }
    doPin(editor, editorIndex) {
        if (this.isPinned(editor)) {
            return; // can only pin a preview editor
        }
        // Clear Transient
        this.setTransient(editor, false);
        // Convert the preview editor to be a pinned editor
        this.preview = null;
        // Event
        const event = {
            kind: 11 /* GroupModelChangeKind.EDITOR_PIN */,
            editor,
            editorIndex
        };
        this._onDidModelChange.fire(event);
    }
    unpin(candidate) {
        const res = this.findEditor(candidate);
        if (!res) {
            return; // not found
        }
        const [editor, editorIndex] = res;
        this.doUnpin(editor, editorIndex);
        return editor;
    }
    doUnpin(editor, editorIndex) {
        if (!this.isPinned(editor)) {
            return; // can only unpin a pinned editor
        }
        // Set new
        const oldPreview = this.preview;
        this.preview = editor;
        // Event
        const event = {
            kind: 11 /* GroupModelChangeKind.EDITOR_PIN */,
            editor,
            editorIndex
        };
        this._onDidModelChange.fire(event);
        // Close old preview editor if any
        if (oldPreview) {
            this.closeEditor(oldPreview, EditorCloseContext.UNPIN);
        }
    }
    isPinned(editorCandidateOrIndex) {
        let editor;
        if (typeof editorCandidateOrIndex === 'number') {
            editor = this.editors[editorCandidateOrIndex];
        }
        else {
            editor = editorCandidateOrIndex;
        }
        return !this.matches(this.preview, editor);
    }
    stick(candidate) {
        const res = this.findEditor(candidate);
        if (!res) {
            return; // not found
        }
        const [editor, editorIndex] = res;
        this.doStick(editor, editorIndex);
        return editor;
    }
    doStick(editor, editorIndex) {
        if (this.isSticky(editorIndex)) {
            return; // can only stick a non-sticky editor
        }
        // Pin editor
        this.pin(editor);
        // Move editor to be the last sticky editor
        const newEditorIndex = this.sticky + 1;
        this.moveEditor(editor, newEditorIndex);
        // Adjust sticky index
        this.sticky++;
        // Event
        const event = {
            kind: 13 /* GroupModelChangeKind.EDITOR_STICKY */,
            editor,
            editorIndex: newEditorIndex
        };
        this._onDidModelChange.fire(event);
    }
    unstick(candidate) {
        const res = this.findEditor(candidate);
        if (!res) {
            return; // not found
        }
        const [editor, editorIndex] = res;
        this.doUnstick(editor, editorIndex);
        return editor;
    }
    doUnstick(editor, editorIndex) {
        if (!this.isSticky(editorIndex)) {
            return; // can only unstick a sticky editor
        }
        // Move editor to be the first non-sticky editor
        const newEditorIndex = this.sticky;
        this.moveEditor(editor, newEditorIndex);
        // Adjust sticky index
        this.sticky--;
        // Event
        const event = {
            kind: 13 /* GroupModelChangeKind.EDITOR_STICKY */,
            editor,
            editorIndex: newEditorIndex
        };
        this._onDidModelChange.fire(event);
    }
    isSticky(candidateOrIndex) {
        if (this.sticky < 0) {
            return false; // no sticky editor
        }
        let index;
        if (typeof candidateOrIndex === 'number') {
            index = candidateOrIndex;
        }
        else {
            index = this.indexOf(candidateOrIndex);
        }
        if (index < 0) {
            return false;
        }
        return index <= this.sticky;
    }
    setTransient(candidate, transient) {
        if (!transient && this.transient.size === 0) {
            return; // no transient editor
        }
        const res = this.findEditor(candidate);
        if (!res) {
            return; // not found
        }
        const [editor, editorIndex] = res;
        this.doSetTransient(editor, editorIndex, transient);
        return editor;
    }
    doSetTransient(editor, editorIndex, transient) {
        if (transient) {
            if (this.transient.has(editor)) {
                return;
            }
            this.transient.add(editor);
        }
        else {
            if (!this.transient.has(editor)) {
                return;
            }
            this.transient.delete(editor);
        }
        // Event
        const event = {
            kind: 12 /* GroupModelChangeKind.EDITOR_TRANSIENT */,
            editor,
            editorIndex
        };
        this._onDidModelChange.fire(event);
    }
    isTransient(editorCandidateOrIndex) {
        if (this.transient.size === 0) {
            return false; // no transient editor
        }
        let editor;
        if (typeof editorCandidateOrIndex === 'number') {
            editor = this.editors[editorCandidateOrIndex];
        }
        else {
            editor = this.findEditor(editorCandidateOrIndex)?.[0];
        }
        return !!editor && this.transient.has(editor);
    }
    splice(index, del, editor) {
        const editorToDeleteOrReplace = this.editors[index];
        // Perform on sticky index
        if (del && this.isSticky(index)) {
            this.sticky--;
        }
        // Perform on editors array
        if (editor) {
            this.editors.splice(index, del ? 1 : 0, editor);
        }
        else {
            this.editors.splice(index, del ? 1 : 0);
        }
        // Perform on MRU
        {
            // Add
            if (!del && editor) {
                if (this.mru.length === 0) {
                    // the list of most recent editors is empty
                    // so this editor can only be the most recent
                    this.mru.push(editor);
                }
                else {
                    // we have most recent editors. as such we
                    // put this newly opened editor right after
                    // the current most recent one because it cannot
                    // be the most recently active one unless
                    // it becomes active. but it is still more
                    // active then any other editor in the list.
                    this.mru.splice(1, 0, editor);
                }
            }
            // Remove / Replace
            else {
                const indexInMRU = this.indexOf(editorToDeleteOrReplace, this.mru);
                // Remove
                if (del && !editor) {
                    this.mru.splice(indexInMRU, 1); // remove from MRU
                }
                // Replace
                else if (del && editor) {
                    this.mru.splice(indexInMRU, 1, editor); // replace MRU at location
                }
            }
        }
    }
    indexOf(candidate, editors = this.editors, options) {
        let index = -1;
        if (!candidate) {
            return index;
        }
        for (let i = 0; i < editors.length; i++) {
            const editor = editors[i];
            if (this.matches(editor, candidate, options)) {
                // If we are to support side by side matching, it is possible that
                // a better direct match is found later. As such, we continue finding
                // a matching editor and prefer that match over the side by side one.
                if (options?.supportSideBySide && editor instanceof SideBySideEditorInput && !(candidate instanceof SideBySideEditorInput)) {
                    index = i;
                }
                else {
                    index = i;
                    break;
                }
            }
        }
        return index;
    }
    findEditor(candidate, options) {
        const index = this.indexOf(candidate, this.editors, options);
        if (index === -1) {
            return undefined;
        }
        return [this.editors[index], index];
    }
    isFirst(candidate, editors = this.editors) {
        return this.matches(editors[0], candidate);
    }
    isLast(candidate, editors = this.editors) {
        return this.matches(editors[editors.length - 1], candidate);
    }
    contains(candidate, options) {
        return this.indexOf(candidate, this.editors, options) !== -1;
    }
    matches(editor, candidate, options) {
        if (!editor || !candidate) {
            return false;
        }
        if (options?.supportSideBySide && editor instanceof SideBySideEditorInput && !(candidate instanceof SideBySideEditorInput)) {
            switch (options.supportSideBySide) {
                case SideBySideEditor.ANY:
                    if (this.matches(editor.primary, candidate, options) || this.matches(editor.secondary, candidate, options)) {
                        return true;
                    }
                    break;
                case SideBySideEditor.BOTH:
                    if (this.matches(editor.primary, candidate, options) && this.matches(editor.secondary, candidate, options)) {
                        return true;
                    }
                    break;
            }
        }
        const strictEquals = editor === candidate;
        if (options?.strictEquals) {
            return strictEquals;
        }
        return strictEquals || editor.matches(candidate);
    }
    get isLocked() {
        return this.locked;
    }
    lock(locked) {
        if (this.isLocked !== locked) {
            this.locked = locked;
            this._onDidModelChange.fire({ kind: 3 /* GroupModelChangeKind.GROUP_LOCKED */ });
        }
    }
    clone() {
        const clone = this.instantiationService.createInstance(EditorGroupModel_1, undefined);
        // Copy over group properties
        clone.editors = this.editors.slice(0);
        clone.mru = this.mru.slice(0);
        clone.preview = this.preview;
        clone.selection = this.selection.slice(0);
        clone.sticky = this.sticky;
        // Ensure to register listeners for each editor
        for (const editor of clone.editors) {
            clone.registerEditorListeners(editor);
        }
        return clone;
    }
    serialize() {
        const registry = Registry.as(EditorExtensions.EditorFactory);
        // Serialize all editor inputs so that we can store them.
        // Editors that cannot be serialized need to be ignored
        // from mru, active, preview and sticky if any.
        const serializableEditors = [];
        const serializedEditors = [];
        let serializablePreviewIndex;
        let serializableSticky = this.sticky;
        for (let i = 0; i < this.editors.length; i++) {
            const editor = this.editors[i];
            let canSerializeEditor = false;
            const editorSerializer = registry.getEditorSerializer(editor);
            if (editorSerializer) {
                const value = editorSerializer.canSerialize(editor) ? editorSerializer.serialize(editor) : undefined;
                // Editor can be serialized
                if (typeof value === 'string') {
                    canSerializeEditor = true;
                    serializedEditors.push({ id: editor.typeId, value });
                    serializableEditors.push(editor);
                    if (this.preview === editor) {
                        serializablePreviewIndex = serializableEditors.length - 1;
                    }
                }
                // Editor cannot be serialized
                else {
                    canSerializeEditor = false;
                }
            }
            // Adjust index of sticky editors if the editor cannot be serialized and is pinned
            if (!canSerializeEditor && this.isSticky(i)) {
                serializableSticky--;
            }
        }
        const serializableMru = this.mru.map(editor => this.indexOf(editor, serializableEditors)).filter(i => i >= 0);
        return {
            id: this.id,
            locked: this.locked ? true : undefined,
            editors: serializedEditors,
            mru: serializableMru,
            preview: serializablePreviewIndex,
            sticky: serializableSticky >= 0 ? serializableSticky : undefined
        };
    }
    deserialize(data) {
        const registry = Registry.as(EditorExtensions.EditorFactory);
        if (typeof data.id === 'number') {
            this._id = data.id;
            EditorGroupModel_1.IDS = Math.max(data.id + 1, EditorGroupModel_1.IDS); // make sure our ID generator is always larger
        }
        else {
            this._id = EditorGroupModel_1.IDS++; // backwards compatibility
        }
        if (data.locked) {
            this.locked = true;
        }
        this.editors = coalesce(data.editors.map((e, index) => {
            let editor;
            const editorSerializer = registry.getEditorSerializer(e.id);
            if (editorSerializer) {
                const deserializedEditor = editorSerializer.deserialize(this.instantiationService, e.value);
                if (deserializedEditor instanceof EditorInput) {
                    editor = deserializedEditor;
                    this.registerEditorListeners(editor);
                }
            }
            if (!editor && typeof data.sticky === 'number' && index <= data.sticky) {
                data.sticky--; // if editor cannot be deserialized but was sticky, we need to decrease sticky index
            }
            return editor;
        }));
        this.mru = coalesce(data.mru.map(i => this.editors[i]));
        this.selection = this.mru.length > 0 ? [this.mru[0]] : [];
        if (typeof data.preview === 'number') {
            this.preview = this.editors[data.preview];
        }
        if (typeof data.sticky === 'number') {
            this.sticky = data.sticky;
        }
        return this._id;
    }
    dispose() {
        dispose(Array.from(this.editorListeners));
        this.editorListeners.clear();
        this.transient.clear();
        super.dispose();
    }
};
EditorGroupModel = EditorGroupModel_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IConfigurationService)
], EditorGroupModel);
export { EditorGroupModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yR3JvdXBNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yL2VkaXRvckdyb3VwTW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUF5RCxnQkFBZ0IsRUFBdUIsZ0JBQWdCLEVBQUUsa0JBQWtCLEVBQTZDLE1BQU0sY0FBYyxDQUFDO0FBQzdNLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUMvQyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNuRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQTZCLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDM0gsT0FBTyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDekYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUUxRCxNQUFNLHFCQUFxQixHQUFHO0lBQzdCLElBQUksRUFBRSxNQUFNO0lBQ1osS0FBSyxFQUFFLE9BQU87SUFDZCxLQUFLLEVBQUUsT0FBTztJQUNkLElBQUksRUFBRSxNQUFNO0NBQ1osQ0FBQztBQStCRixNQUFNLFVBQVUsNEJBQTRCLENBQUMsS0FBZTtJQUMzRCxNQUFNLFNBQVMsR0FBRyxLQUFnRCxDQUFDO0lBRW5FLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxJQUFJLE9BQU8sU0FBUyxLQUFLLFFBQVEsSUFBSSxLQUFL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