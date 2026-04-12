/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Composite } from '../../composite.js';
import { isEditorInput } from '../../../common/editor.js';
import { LRUCache } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { isEmptyObject } from '../../../../base/common/types.js';
import { DEFAULT_EDITOR_MIN_DIMENSIONS, DEFAULT_EDITOR_MAX_DIMENSIONS } from './editor.js';
import { joinPath, isEqual } from '../../../../base/common/resources.js';
import { indexOfPath } from '../../../../base/common/extpath.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getWindowById } from '../../../../base/browser/dom.js';
/**
 * The base class of editors in the workbench. Editors register themselves for specific editor inputs.
 * Editors are layed out in the editor part of the workbench in editor groups. Multiple editors can be
 * open at the same time. Each editor has a minimized representation that is good enough to provide some
 * information about the state of the editor data.
 *
 * The workbench will keep an editor alive after it has been created and show/hide it based on
 * user interaction. The lifecycle of a editor goes in the order:
 *
 * - `createEditor()`
 * - `setEditorVisible()`
 * - `layout()`
 * - `setInput()`
 * - `focus()`
 * - `dispose()`: when the editor group the editor is in closes
 *
 * During use of the workbench, a editor will often receive a `clearInput()`, `setEditorVisible()`, `layout()` and
 * `focus()` calls, but only one `create()` and `dispose()` call.
 *
 * This class is only intended to be subclassed and not instantiated.
 */
export class EditorPane extends Composite {
    //#endregion
    static { this.EDITOR_MEMENTOS = new Map(); }
    get minimumWidth() { return DEFAULT_EDITOR_MIN_DIMENSIONS.width; }
    get maximumWidth() { return DEFAULT_EDITOR_MAX_DIMENSIONS.width; }
    get minimumHeight() { return DEFAULT_EDITOR_MIN_DIMENSIONS.height; }
    get maximumHeight() { return DEFAULT_EDITOR_MAX_DIMENSIONS.height; }
    get input() { return this._input; }
    get options() { return this._options; }
    get window() { return getWindowById(this.group.windowId, true).window; }
    /**
     * Should be overridden by editors that have their own ScopedContextKeyService
     */
    get scopedContextKeyService() { return undefined; }
    constructor(id, group, telemetryService, themeService, storageService) {
        super(id, telemetryService, themeService, storageService);
        this.group = group;
        //#region Events
        this.onDidChangeSizeConstraints = Event.None;
        this._onDidChangeControl = this._register(new Emitter());
        this.onDidChangeControl = this._onDidChangeControl.event;
    }
    create(parent) {
        super.create(parent);
        // Create Editor
        this.createEditor(parent);
    }
    /**
     * Note: Clients should not call this method, the workbench calls this
     * method. Calling it otherwise may result in unexpected behavior.
     *
     * Sets the given input with the options to the editor. The input is guaranteed
     * to be different from the previous input that was set using the `input.matches()`
     * method.
     *
     * The provided context gives more information around how the editor was opened.
     *
     * The provided cancellation token should be used to test if the operation
     * was cancelled.
     */
    async setInput(input, options, context, token) {
        this._input = input;
        this._options = options;
    }
    /**
     * Called to indicate to the editor that the input should be cleared and
     * resources associated with the input should be freed.
     *
     * This method can be called based on different contexts, e.g. when opening
     * a different input or different editor control or when closing all editors
     * in a group.
     *
     * To monitor the lifecycle of editor inputs, you should not rely on this
     * method, rather refer to the listeners on `IEditorGroup` via `IEditorGroupsService`.
     */
    clearInput() {
        this._input = undefined;
        this._options = undefined;
    }
    /**
     * Note: Clients should not call this method, the workbench calls this
     * method. Calling it otherwise may result in unexpected behavior.
     *
     * Sets the given options to the editor. Clients should apply the options
     * to the current input.
     */
    setOptions(options) {
        this._options = options;
    }
    setVisible(visible) {
        super.setVisible(visible);
        // Propagate to Editor
        this.setEditorVisible(visible);
    }
    /**
     * Indicates that the editor control got visible or hidden.
     *
     * @param visible the state of visibility of this editor
     */
    setEditorVisible(visible) {
        // Subclasses can implement
    }
    setBoundarySashes(_sashes) {
        // Subclasses can implement
    }
    getEditorMemento(editorGroupService, configurationService, key, limit = 10) {
        const mementoKey = `${this.getId()}${key}`;
        let editorMemento = EditorPane.EDITOR_MEMENTOS.get(mementoKey);
        if (!editorMemento) {
            editorMemento = this._register(new EditorMemento(this.getId(), key, this.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */), limit, editorGroupService, configurationService));
            EditorPane.EDITOR_MEMENTOS.set(mementoKey, editorMemento);
        }
        return editorMemento;
    }
    getViewState() {
        // Subclasses to override
        return undefined;
    }
    saveState() {
        // Save all editor memento for this editor type
        for (const [, editorMemento] of EditorPane.EDITOR_MEMENTOS) {
            if (editorMemento.id === this.getId()) {
                editorMemento.saveState();
            }
        }
        super.saveState();
    }
    dispose() {
        this._input = undefined;
        this._options = undefined;
        super.dispose();
    }
}
export class EditorMemento extends Disposable {
    static { this.SHARED_EDITOR_STATE = -1; } // pick a number < 0 to be outside group id range
    constructor(id, key, memento, limit, editorGroupService, configurationService) {
        super();
        this.id = id;
        this.key = key;
        this.memento = memento;
        this.limit = limit;
        this.editorGroupService = editorGroupService;
        this.configurationService = configurationService;
        this.cleanedUp = false;
        this.shareEditorState = false;
        this.updateConfiguration(undefined);
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.configurationService.onDidChangeConfiguration(e => this.updateConfiguration(e)));
    }
    updateConfiguration(e) {
        if (!e || e.affectsConfiguration(undefined, 'workbench.editor.sharedViewState')) {
            this.shareEditorState = this.configurationService.getValue(undefined, 'workbench.editor.sharedViewState') === true;
        }
    }
    saveEditorState(group, resourceOrEditor, state) {
        const resource = this.doGetResource(resourceOrEditor);
        if (!resource || !group) {
            return; // we are not in a good state to save any state for a resource
        }
        const cache = this.doLoad();
        // Ensure mementos for resource map
        let mementosForResource = cache.get(resource.toString());
        if (!mementosForResource) {
            mementosForResource = Object.create(null);
            cache.set(resource.toString(), mementosForResource);
        }
        // Store state for group
        mementosForResource[group.id] = state;
        // Store state as most recent one based on settings
        if (this.shareEditorState) {
            mementosForResource[EditorMemento.SHARED_EDITOR_STATE] = state;
        }
        // Automatically clear when editor input gets disposed if any
        if (isEditorInput(resourceOrEditor)) {
            this.clearEditorStateOnDispose(resource, resourceOrEditor);
        }
    }
    loadEditorState(group, resourceOrEditor) {
        const resource = this.doGetResource(resourceOrEditor);
        if (!resource || !group) {
            return; // we are not in a good state to load any state for a resource
        }
        const cache = this.doLoad();
        const mementosForResource = cache.get(resource.toString());
        if (mementosForResource) {
            const mementoForResourceAndGroup = mementosForResource[group.id];
            // Return state for group if present
            if (mementoForResourceAndGroup) {
                return mementoForResourceAndGroup;
            }
            // Return most recent state based on settings otherwise
            if (this.shareEditorState) {
                return mementosForResource[EditorMemento.SHARED_EDITOR_STATE];
            }
        }
        return undefined;
    }
    clearEditorState(resourceOrEditor, group) {
        if (isEditorInput(resourceOrEditor)) {
            this.editorDisposables?.delete(resourceOrEditor);
        }
        const resource = this.doGetResource(resourceOrEditor);
        if (resource) {
            const cache = this.doLoad();
            // Clear state for group
            if (group) {
                const mementosForResource = cache.get(resource.toString());
                if (mementosForResource) {
                    delete mementosForResource[group.id];
                    if (isEmptyObject(mementosForResource)) {
                        cache.delete(resource.toString());
                    }
                }
            }
            // Clear state across all groups for resource
            else {
                cache.delete(resource.toString());
            }
        }
    }
    clearEditorStateOnDispose(resource, editor) {
        if (!this.editorDisposables) {
            this.editorDisposables = new Map();
        }
        if (!this.editorDisposables.has(editor)) {
            this.editorDisposables.set(editor, Event.once(editor.onWillDispose)(() => {
                this.clearEditorState(resource);
                this.editorDisposables?.delete(editor);
            }));
        }
    }
    moveEditorState(source, target, comparer) {
        const cache = this.doLoad();
        // We need a copy of the keys to not iterate over
        // newly inserted elements.
        const cacheKeys = [...cache.keys()];
        for (const cacheKey of cacheKeys) {
            const resource = URI.parse(cacheKey);
            if (!comparer.isEqualOrParent(resource, source)) {
                continue; // not matching our resource
            }
            // Determine new resulting target resource
            let targetResource;
            if (isEqual(source, resource)) {
                targetResource = target; // file got moved
            }
            else {
                const index = indexOfPath(resource.path, source.path);
                targetResource = joinPath(target, resource.path.substr(index + source.path.length + 1)); // parent folder got moved
            }
            // Don't modify LRU state
            const value = cache.get(cacheKey, 0 /* Touch.None */);
            if (value) {
                cache.delete(cacheKey);
                cache.set(targetResource.toString(), value);
            }
        }
    }
    doGetResource(resourceOrEditor) {
        if (isEditorInput(resourceOrEditor)) {
            return resourceOrEditor.resource;
        }
        return resourceOrEditor;
    }
    doLoad() {
        if (!this.cache) {
            this.cache = new LRUCache(this.limit);
            // Restore from serialized map state
            const rawEditorMemento = this.memento[this.key];
            if (Array.isArray(rawEditorMemento)) {
                this.cache.fromJSON(rawEditorMemento);
            }
        }
        return this.cache;
    }
    saveState() {
        const cache = this.doLoad();
        // Cleanup once during session
        if (!this.cleanedUp) {
            this.cleanUp();
            this.cleanedUp = true;
        }
        this.memento[this.key] = cache.toJSON();
    }
    cleanUp() {
        const cache = this.doLoad();
        // Remove groups from states that no longer exist. Since we modify the
        // cache and its is a LRU cache make a copy to ensure iteration succeeds
        const entries = [...cache.entries()];
        for (const [resource, mapGroupToMementos] of entries) {
            for (const group of Object.keys(mapGroupToMementos)) {
                const groupId = Number(group);
                if (groupId === EditorMemento.SHARED_EDITOR_STATE && this.shareEditorState) {
                    continue; // skip over shared entries if sharing is enabled
                }
                if (!this.editorGroupService.getGroup(groupId)) {
                    delete mapGroupToMementos[groupId];
                    if (isEmptyObject(mapGroupToMementos)) {
                        cache.delete(resource);
                    }
                }
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yUGFuZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUMvQyxPQUFPLEVBQW9FLGFBQWEsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBTzVILE9BQU8sRUFBRSxRQUFRLEVBQVMsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDakUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLDZCQUE2QixFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQzNGLE9BQU8sRUFBRSxRQUFRLEVBQVcsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUsvRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFaEU7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBb0JHO0FBQ0gsTUFBTSxPQUFnQixVQUFnRCxTQUFRLFNBQXNCO0lBU25HLFlBQVk7YUFFWSxvQkFBZSxHQUFHLElBQUksR0FBRyxFQUFrQyxBQUE1QyxDQUE2QztJQUVwRixJQUFJLFlBQVksS0FBSyxPQUFPLDZCQUE2QixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDbEUsSUFBSSxZQUFZLEtBQUssT0FBTyw2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