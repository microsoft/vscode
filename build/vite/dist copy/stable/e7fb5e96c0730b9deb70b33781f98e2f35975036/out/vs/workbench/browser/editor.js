/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../nls.js';
import { EditorResourceAccessor, EditorExtensions, SideBySideEditor, EditorCloseContext } from '../common/editor.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { toDisposable } from '../../base/common/lifecycle.js';
import { Promises } from '../../base/common/async.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkingCopyService } from '../services/workingCopy/common/workingCopyService.js';
import { Schemas } from '../../base/common/network.js';
import { Iterable } from '../../base/common/iterator.js';
import { Emitter } from '../../base/common/event.js';
/**
 * A lightweight descriptor of an editor pane. The descriptor is deferred so that heavy editor
 * panes can load lazily in the workbench.
 */
export class EditorPaneDescriptor {
    static { this.instantiatedEditorPanes = new Set(); }
    static didInstantiateEditorPane(typeId) {
        return EditorPaneDescriptor.instantiatedEditorPanes.has(typeId);
    }
    static { this._onWillInstantiateEditorPane = new Emitter(); }
    static { this.onWillInstantiateEditorPane = EditorPaneDescriptor._onWillInstantiateEditorPane.event; }
    static create(ctor, typeId, name) {
        return new EditorPaneDescriptor(ctor, typeId, name);
    }
    constructor(ctor, typeId, name) {
        this.ctor = ctor;
        this.typeId = typeId;
        this.name = name;
    }
    instantiate(instantiationService, group) {
        EditorPaneDescriptor._onWillInstantiateEditorPane.fire({ typeId: this.typeId });
        const pane = instantiationService.createInstance(this.ctor, group);
        EditorPaneDescriptor.instantiatedEditorPanes.add(this.typeId);
        return pane;
    }
    describes(editorPane) {
        return editorPane.getId() === this.typeId;
    }
}
export class EditorPaneRegistry {
    constructor() {
        this.mapEditorPanesToEditors = new Map();
        //#endregion
    }
    registerEditorPane(editorPaneDescriptor, editorDescriptors) {
        this.mapEditorPanesToEditors.set(editorPaneDescriptor, editorDescriptors);
        return toDisposable(() => {
            this.mapEditorPanesToEditors.delete(editorPaneDescriptor);
        });
    }
    getEditorPane(editor) {
        const descriptors = this.findEditorPaneDescriptors(editor);
        if (descriptors.length === 0) {
            return undefined;
        }
        if (descriptors.length === 1) {
            return descriptors[0];
        }
        return editor.prefersEditorPane(descriptors);
    }
    findEditorPaneDescriptors(editor, byInstanceOf) {
        const matchingEditorPaneDescriptors = [];
        for (const editorPane of this.mapEditorPanesToEditors.keys()) {
            const editorDescriptors = this.mapEditorPanesToEditors.get(editorPane) || [];
            for (const editorDescriptor of editorDescriptors) {
                const editorClass = editorDescriptor.ctor;
                // Direct check on constructor type (ignores prototype chain)
                if (!byInstanceOf && editor.constructor === editorClass) {
                    matchingEditorPaneDescriptors.push(editorPane);
                    break;
                }
                // Normal instanceof check
                else if (byInstanceOf && editor instanceof editorClass) {
                    matchingEditorPaneDescriptors.push(editorPane);
                    break;
                }
            }
        }
        // If no descriptors found, continue search using instanceof and prototype chain
        if (!byInstanceOf && matchingEditorPaneDescriptors.length === 0) {
            return this.findEditorPaneDescriptors(editor, true);
        }
        return matchingEditorPaneDescriptors;
    }
    //#region Used for tests only
    getEditorPaneByType(typeId) {
        return Iterable.find(this.mapEditorPanesToEditors.keys(), editor => editor.typeId === typeId);
    }
    getEditorPanes() {
        return Array.from(this.mapEditorPanesToEditors.keys());
    }
    getEditors() {
        const editorClasses = [];
        for (const editorPane of this.mapEditorPanesToEditors.keys()) {
            const editorDescriptors = this.mapEditorPanesToEditors.get(editorPane);
            if (editorDescriptors) {
                editorClasses.push(...editorDescriptors.map(editorDescriptor => editorDescriptor.ctor));
            }
        }
        return editorClasses;
    }
}
Registry.add(EditorExtensions.EditorPane, new EditorPaneRegistry());
//#endregion
//#region Editor Close Tracker
export function whenEditorClosed(accessor, resources) {
    const editorService = accessor.get(IEditorService);
    const uriIdentityService = accessor.get(IUriIdentityService);
    const workingCopyService = accessor.get(IWorkingCopyService);
    return new Promise(resolve => {
        let remainingResources = [...resources];
        // Observe any editor closing from this moment on
        const listener = editorService.onDidCloseEditor(async (event) => {
            if (event.context === EditorCloseContext.MOVE) {
                return; // ignore move events where the editor will open in another group
            }
            let primaryResource = EditorResourceAccessor.getOriginalUri(event.editor, { supportSideBySide: SideBySideEditor.PRIMARY });
            let secondaryResource = EditorResourceAccessor.getOriginalUri(event.editor, { supportSideBySide: SideBySideEditor.SECONDARY });
            // Specially handle an editor getting replaced: if the new active editor
            // matches any of the resources from the closed editor, ignore those
            // resources because they were actually not closed, but replaced.
            // (see https://github.com/microsoft/vscode/issues/134299)
            if (event.context === EditorCloseContext.REPLACE) {
                const newPrimaryResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
                const newSecondaryResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.SECONDARY });
                if (uriIdentityService.extUri.isEqual(primaryResource, newPrimaryResource)) {
                    primaryResource = undefined;
                }
                if (uriIdentityService.extUri.isEqual(secondaryResource, newSecondaryResource)) {
                    secondaryResource = undefined;
                }
            }
            // Remove from resources to wait for being closed based on the
            // resources from editors that got closed
            remainingResources = remainingResources.filter(resource => {
                // Closing editor matches resource directly: remove from remaining
                if (uriIdentityService.extUri.isEqual(resource, primaryResource) || uriIdentityService.extUri.isEqual(resource, secondaryResource)) {
                    return false;
                }
                // Closing editor is untitled with associated resource
                // that matches resource directly: remove from remaining
                // but only if the editor was not replaced, otherwise
                // saving an untitled with associated resource would
                // release the `--wait` call.
                // (see https://github.com/microsoft/vscode/issues/141237)
                if (event.context !== EditorCloseContext.REPLACE) {
                    if ((primaryResource?.scheme === Schemas.untitled && uriIdentityService.extUri.isEqual(resource, primaryResource.with({ scheme: resource.scheme }))) ||
                        (secondaryResource?.scheme === Schemas.untitled && uriIdentityService.extUri.isEqual(resource, secondaryResource.with({ scheme: resource.scheme })))) {
                        return false;
                    }
                }
                // Editor is not yet closed, so keep it in waiting mode
                return true;
            });
            // All resources to wait for being closed are closed
            if (remainingResources.length === 0) {
                // If auto save is configured with the default delay (1s) it is possible
                // to close the editor while the save still continues in the background. As such
                // we have to also check if the editors to track for are dirty and if so wait
                // for them to get saved.
                const dirtyResources = resources.filter(resource => workingCopyService.isDirty(resource));
                if (dirtyResources.length > 0) {
                    await Promises.settled(dirtyResources.map(async (resource) => await new Promise(resolve => {
                        if (!workingCopyService.isDirty(resource)) {
                            return resolve(); // return early if resource is not dirty
                        }
                        // Otherwise resolve promise when resource is saved
                        const listener = workingCopyService.onDidChangeDirty(workingCopy => {
                            if (!workingCopy.isDirty() && uriIdentityService.extUri.isEqual(resource, workingCopy.resource)) {
                                listener.dispose();
                                return resolve();
                            }
                        });
                    })));
                }
                listener.dispose();
                return resolve();
            }
        });
    });
}
//#endregion
//#region ARIA
export function computeEditorAriaLabel(input, index, group, groupCount) {
    let ariaLabel = input.getAriaLabel();
    if (group && !group.isPinned(input)) {
        ariaLabel = localize('preview', "{0}, preview", ariaLabel);
    }
    if (group?.isSticky(index ?? input)) {
        ariaLabel = localize('pinned', "{0}, pinned", ariaLabel);
    }
    // Apply group information to help identify in
    // which group we are (only if more than one group
    // is actually opened)
    if (group && typeof groupCount === 'number' && groupCount > 1) {
        ariaLabel = `${ariaLabel}, ${group.ariaLabel}`;
    }
    return ariaLabel;
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvZWRpdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDeEMsT0FBTyxFQUFFLHNCQUFzQixFQUFFLGdCQUFnQixFQUFFLGdCQUFnQixFQUFnRCxrQkFBa0IsRUFBbUMsTUFBTSxxQkFBcUIsQ0FBQztBQUdwTSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFHdEUsT0FBTyxFQUFlLFlBQVksRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDNUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDdkYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFM0YsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRXZELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUF5QnJEOzs7R0FHRztBQUNILE1BQU0sT0FBTyxvQkFBb0I7YUFFUiw0QkFBdUIsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBQ3BFLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxNQUFjO1FBQzdDLE9BQU8sb0JBQW9CLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2pFLENBQUM7YUFFdUIsaUNBQTRCLEdBQUcsSUFBSSxPQUFPLEVBQW1DLENBQUM7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