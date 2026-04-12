/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../nls.js';
import { assertReturnsDefined } from '../../base/common/types.js';
import { URI } from '../../base/common/uri.js';
import { Disposable, toDisposable } from '../../base/common/lifecycle.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { FileType } from '../../platform/files/common/files.js';
import { Schemas } from '../../base/common/network.js';
import { createErrorWithActions, isErrorWithActions } from '../../base/common/errorMessage.js';
import { toAction } from '../../base/common/actions.js';
import Severity from '../../base/common/severity.js';
// Static values for editor contributions
export const EditorExtensions = {
    EditorPane: 'workbench.contributions.editors',
    EditorFactory: 'workbench.contributions.editor.inputFactories'
};
// Static information regarding the text editor
export const DEFAULT_EDITOR_ASSOCIATION = {
    id: 'default',
    displayName: localize('promptOpenWith.defaultEditor.displayName', "Text Editor"),
    providerDisplayName: localize('builtinProviderDisplayName', "Built-in")
};
/**
 * Side by side editor id.
 */
export const SIDE_BY_SIDE_EDITOR_ID = 'workbench.editor.sidebysideEditor';
/**
 * Text diff editor id.
 */
export const TEXT_DIFF_EDITOR_ID = 'workbench.editors.textDiffEditor';
/**
 * Binary diff editor id.
 */
export const BINARY_DIFF_EDITOR_ID = 'workbench.editors.binaryResourceDiffEditor';
export var EditorPaneSelectionChangeReason;
(function (EditorPaneSelectionChangeReason) {
    /**
     * The selection was changed as a result of a programmatic
     * method invocation.
     *
     * For a text editor pane, this for example can be a selection
     * being restored from previous view state automatically.
     */
    EditorPaneSelectionChangeReason[EditorPaneSelectionChangeReason["PROGRAMMATIC"] = 1] = "PROGRAMMATIC";
    /**
     * The selection was changed by the user.
     *
     * This typically means the user changed the selection
     * with mouse or keyboard.
     */
    EditorPaneSelectionChangeReason[EditorPaneSelectionChangeReason["USER"] = 2] = "USER";
    /**
     * The selection was changed as a result of editing in
     * the editor pane.
     *
     * For a text editor pane, this for example can be typing
     * in the text of the editor pane.
     */
    EditorPaneSelectionChangeReason[EditorPaneSelectionChangeReason["EDIT"] = 3] = "EDIT";
    /**
     * The selection was changed as a result of a navigation
     * action.
     *
     * For a text editor pane, this for example can be a result
     * of selecting an entry from a text outline view.
     */
    EditorPaneSelectionChangeReason[EditorPaneSelectionChangeReason["NAVIGATION"] = 4] = "NAVIGATION";
    /**
     * The selection was changed as a result of a jump action
     * from within the editor pane.
     *
     * For a text editor pane, this for example can be a result
     * of invoking "Go to definition" from a symbol.
     */
    EditorPaneSelectionChangeReason[EditorPaneSelectionChangeReason["JUMP"] = 5] = "JUMP";
})(EditorPaneSelectionChangeReason || (EditorPaneSelectionChangeReason = {}));
export var EditorPaneSelectionCompareResult;
(function (EditorPaneSelectionCompareResult) {
    /**
     * The selections are identical.
     */
    EditorPaneSelectionCompareResult[EditorPaneSelectionCompareResult["IDENTICAL"] = 1] = "IDENTICAL";
    /**
     * The selections are similar.
     *
     * For a text editor this can mean that the one
     * selection is in close proximity to the other
     * selection.
     *
     * Upstream clients may decide in this case to
     * not treat the selection different from the
     * previous one because it is not distinct enough.
     */
    EditorPaneSelectionCompareResult[EditorPaneSelectionCompareResult["SIMILAR"] = 2] = "SIMILAR";
    /**
     * The selections are entirely different.
     */
    EditorPaneSelectionCompareResult[EditorPaneSelectionCompareResult["DIFFERENT"] = 3] = "DIFFERENT";
})(EditorPaneSelectionCompareResult || (EditorPaneSelectionCompareResult = {}));
export function isEditorPaneWithSelection(editorPane) {
    const candidate = editorPane;
    return !!candidate && typeof candidate.getSelection === 'function' && !!candidate.onDidChangeSelection;
}
export function isEditorPaneWithScrolling(editorPane) {
    const candidate = editorPane;
    return !!candidate && typeof candidate.getScrollPosition === 'function' && typeof candidate.setScrollPosition === 'function' && !!candidate.onDidChangeScroll;
}
/**
 * Try to retrieve the view state for the editor pane that
 * has the provided editor input opened, if at all.
 *
 * This method will return `undefined` if the editor input
 * is not visible in any of the opened editor panes.
 */
export function findViewStateForEditor(input, group, editorService) {
    for (const editorPane of editorService.visibleEditorPanes) {
        if (editorPane.group.id === group && input.matches(editorPane.input)) {
            return editorPane.getViewState();
        }
    }
    return undefined;
}
export function isResourceEditorInput(editor) {
    if (isEditorInput(editor)) {
        return false; // make sure to not accidentally match on typed editor inputs
    }
    const candidate = editor;
    return URI.isUri(candidate?.resource);
}
export function isResourceDiffEditorInput(editor) {
    if (isEditorInput(editor)) {
        return false; // make sure to not accidentally match on typed editor inputs
    }
    const candidate = editor;
    return candidate?.original !== undefined && candidate.modified !== undefined;
}
export function isResourceMultiDiffEditorInput(editor) {
    if (isEditorInput(editor)) {
        return false; // make sure to not accidentally match on typed editor inputs
    }
    const candidate = editor;
    if (!candidate) {
        return false;
    }
    if (candidate.resources && !Array.isArray(candidate.resources)) {
        return false;
    }
    return !!candidate.resources || !!candidate.multiDiffSource;
}
export function isResourceSideBySideEditorInput(editor) {
    if (isEditorInput(editor)) {
        return false; // make sure to not accidentally match on typed editor inputs
    }
    if (isResourceDiffEditorInput(editor)) {
        return false; // make sure to not accidentally match on diff editors
    }
    const candidate = editor;
    return candidate?.primary !== undefined && candidate.secondary !== undefined;
}
export function isUntitledResourceEditorInput(editor) {
    if (isEditorInput(editor)) {
        return false; // make sure to not accidentally match on typed editor inputs
    }
    const candidate = editor;
    if (!candidate) {
        return false;
    }
    return candidate.resource === undefined || candidate.resource.scheme === Schemas.untitled || candidate.forceUntitled === true;
}
export function isResourceMergeEditorInput(editor) {
    if (isEditorInput(editor)) {
        return false; // make sure to not accidentally match on typed editor inputs
    }
    const candidate = editor;
    return URI.isUri(candidate?.base?.resource) && URI.isUri(candidate?.input1?.resource) && URI.isUri(candidate?.input2?.resource) && URI.isUri(candidate?.result?.resource);
}
export var Verbosity;
(function (Verbosity) {
    Verbosity[Verbosity["SHORT"] = 0] = "SHORT";
    Verbosity[Verbosity["MEDIUM"] = 1] = "MEDIUM";
    Verbosity[Verbosity["LONG"] = 2] = "LONG";
})(Verbosity || (Verbosity = {}));
export var SaveReason;
(function (SaveReason) {
    /**
     * Explicit user gesture.
     */
    SaveReason[SaveReason["EXPLICIT"] = 1] = "EXPLICIT";
    /**
     * Auto save after a timeout.
     */
    SaveReason[SaveReason["AUTO"] = 2] = "AUTO";
    /**
     * Auto save after editor focus change.
     */
    SaveReason[SaveReason["FOCUS_CHANGE"] = 3] = "FOCUS_CHANGE";
    /**
     * Auto save after window change.
     */
    SaveReason[SaveReason["WINDOW_CHANGE"] = 4] = "WINDOW_CHANGE";
})(SaveReason || (SaveReason = {}));
class SaveSourceFactory {
    constructor() {
        this.mapIdToSaveSource = new Map();
    }
    /**
     * Registers a `SaveSource` with an identifier and label
     * to the registry so that it can be used in save operations.
     */
    registerSource(id, label) {
        let sourceDescriptor = this.mapIdToSaveSource.get(id);
        if (!sourceDescriptor) {
            sourceDescriptor = { source: id, label };
            this.mapIdToSaveSource.set(id, sourceDescriptor);
        }
        return sourceDescriptor.source;
    }
    getSourceLabel(source) {
        return this.mapIdToSaveSource.get(source)?.label ?? source;
    }
}
export const SaveSourceRegistry = new SaveSourceFactory();
export var EditorInputCapabilities;
(function (EditorInputCapabilities) {
    /**
     * Signals no specific capability for the input.
     */
    EditorInputCapabilities[EditorInputCapabilities["None"] = 0] = "None";
    /**
     * Signals that the input is readonly.
     */
    EditorInputCapabilities[EditorInputCapabilities["Readonly"] = 2] = "Readonly";
    /**
     * Signals that the input is untitled.
     */
    EditorInputCapabilities[EditorInputCapabilities["Untitled"] = 4] = "Untitled";
    /**
     * Signals that the input can only be shown in one group
     * and not be split into multiple groups.
     */
    EditorInputCapabilities[EditorInputCapabilities["Singleton"] = 8] = "Singleton";
    /**
     * Signals that the input requires workspace trust.
     */
    EditorInputCapabilities[EditorInputCapabilities["RequiresTrust"] = 16] = "RequiresTrust";
    /**
     * Signals that the editor can split into 2 in the same
     * editor group.
     */
    EditorInputCapabilities[EditorInputCapabilities["CanSplitInGroup"] = 32] = "CanSplitInGroup";
    /**
     * Signals that the editor wants its description to be
     * visible when presented to the user. By default, a UI
     * component may decide to hide the description portion
     * for brevity.
     */
    EditorInputCapabilities[EditorInputCapabilities["ForceDescription"] = 64] = "ForceDescription";
    /**
     * Signals that the editor supports dropping into the
     * editor by holding shift.
     */
    EditorInputCapabilities[EditorInputCapabilities["CanDropIntoEditor"] = 128] = "CanDropIntoEditor";
    /**
     * Signals that the editor is composed of multiple editors
     * within.
     */
    EditorInputCapabilities[EditorInputCapabilities["MultipleEditors"] = 256] = "MultipleEditors";
    /**
     * Signals that the editor cannot be in a dirty state
     * and may still have unsaved changes
     */
    EditorInputCapabilities[EditorInputCapabilities["Scratchpad"] = 512] = "Scratchpad";
    /**
     * Signals that the editor should be revealed when being
     * opened if it is already opened in any editor group.
     */
    EditorInputCapabilities[EditorInputCapabilities["ForceReveal"] = 1024] = "ForceReveal";
    /**
     * Signals that the editor must be opened in a modal editor
     * part, overriding the `workbench.editor.useModal` setting.
     */
    EditorInputCapabilities[EditorInputCapabilities["RequiresModal"] = 2048] = "RequiresModal";
})(EditorInputCapabilities || (EditorInputCapabilities = {}));
export class AbstractEditorInput extends Disposable {
}
export function isEditorInput(editor) {
    return editor instanceof AbstractEditorInput;
}
function isEditorInputWithPreferredResource(editor) {
    const candidate = editor;
    return URI.isUri(candidate?.preferredResource);
}
export function isSideBySideEditorInput(editor) {
    const candidate = editor;
    return isEditorInput(candidate?.primary) && isEditorInput(candidate?.secondary);
}
export function isDiffEditorInput(editor) {
    const candidate = editor;
    return isEditorInput(candidate?.modified) && isEditorInput(candidate?.original);
}
export function createTooLargeFileError(group, input, options, message, preferencesService) {
    return createEditorOpenError(message, [
        toAction({
            id: 'workbench.action.openLargeFile', label: localize('openLargeFile', "Open Anyway"), run: () => {
                const fileEditorOptions = {
                    ...options,
                    limits: {
                        size: Number.MAX_VALUE
                    }
                };
                group.openEditor(input, fileEditorOptions);
            }
        }),
        toAction({
            id: 'workbench.action.configureEditorLargeFileConfirmation', label: localize('configureEditorLargeFileConfirmation', "Configure Limit"), run: () => {
                return preferencesService.openUserSettings({ query: 'workbench.editorLargeFileConfirmation' });
            }
        }),
    ], {
        forceMessage: true,
        forceSeverity: Severity.Warning
    });
}
export function isEditorInputWithOptions(editor) {
    const candidate = editor;
    return isEditorInput(candidate?.editor);
}
export function isEditorInputWithOptionsAndGroup(editor) {
    const candidate = editor;
    return isEditorInputWithOptions(editor) && candidate?.group !== undefined;
}
export function isEditorIdentifier(identifier) {
    const candidate = identifier;
    return typeof candidate?.groupId === 'number' && isEditorInput(candidate.editor);
}
export function isEditorCommandsContext(context) {
    const candidate = context;
    return typeof candidate?.groupId === 'number';
}
/**
 * More information around why an editor was closed in the model.
 */
export var EditorCloseContext;
(function (EditorCloseContext) {
    /**
     * No specific context for closing (e.g. explicit user gesture).
     */
    EditorCloseContext[EditorCloseContext["UNKNOWN"] = 0] = "UNKNOWN";
    /**
     * The editor closed because it was replaced with another editor.
     * This can either happen via explicit replace call or when an
     * editor is in preview mode and another editor opens.
     */
    EditorCloseContext[EditorCloseContext["REPLACE"] = 1] = "REPLACE";
    /**
     * The editor closed as a result of moving it to another group.
     */
    EditorCloseContext[EditorCloseContext["MOVE"] = 2] = "MOVE";
    /**
     * The editor closed because another editor turned into preview
     * and this used to be the preview editor before.
     */
    EditorCloseContext[EditorCloseContext["UNPIN"] = 3] = "UNPIN";
})(EditorCloseContext || (EditorCloseContext = {}));
export var GroupModelChangeKind;
(function (GroupModelChangeKind) {
    /* Group Changes */
    GroupModelChangeKind[GroupModelChangeKind["GROUP_ACTIVE"] = 0] = "GROUP_ACTIVE";
    GroupModelChangeKind[GroupModelChangeKind["GROUP_INDEX"] = 1] = "GROUP_INDEX";
    GroupModelChangeKind[GroupModelChangeKind["GROUP_LABEL"] = 2] = "GROUP_LABEL";
    GroupModelChangeKind[GroupModelChangeKind["GROUP_LOCKED"] = 3] = "GROUP_LOCKED";
    /* Editors Change */
    GroupModelChangeKind[GroupModelChangeKind["EDITORS_SELECTION"] = 4] = "EDITORS_SELECTION";
    /* Editor Changes */
    GroupModelChangeKind[GroupModelChangeKind["EDITOR_OPEN"] = 5] = "EDITOR_OPEN";
    GroupModelChangeKind[GroupModelChangeKind["EDITOR_CLOSE"] = 6] = "EDITOR_CLOSE";
    GroupModelChangeKind[GroupModelChangeKind["EDITOR_MOVE"] = 7] = "EDITOR_MOVE";
    GroupModelChangeKind[GroupModelChangeKind["EDITOR_ACTIVE"] = 8] = "EDITOR_ACTIVE";
    GroupModelChangeKind[GroupModelChangeKind["EDITOR_LABEL"] = 9] = "EDITOR_LABEL";
    GroupModelChangeKind[GroupModelChangeKind["EDITOR_CAPABILITIES"] = 10] = "EDITOR_CAPABILITIES";
    GroupModelChangeKind[GroupModelChangeKind["EDITOR_PIN"] = 11] = "EDITOR_PIN";
    GroupModelChangeKind[GroupModelChangeKind["EDITOR_TRANSIENT"] = 12] = "EDITOR_TRANSIENT";
    GroupModelChangeKind[GroupModelChangeKind["EDITOR_STICKY"] = 13] = "EDITOR_STICKY";
    GroupModelChangeKind[GroupModelChangeKind["EDITOR_DIRTY"] = 14] = "EDITOR_DIRTY";
    GroupModelChangeKind[GroupModelChangeKind["EDITOR_WILL_DISPOSE"] = 15] = "EDITOR_WILL_DISPOSE";
})(GroupModelChangeKind || (GroupModelChangeKind = {}));
export var SideBySideEditor;
(function (SideBySideEditor) {
    SideBySideEditor[SideBySideEditor["PRIMARY"] = 1] = "PRIMARY";
    SideBySideEditor[SideBySideEditor["SECONDARY"] = 2] = "SECONDARY";
    SideBySideEditor[SideBySideEditor["BOTH"] = 3] = "BOTH";
    SideBySideEditor[SideBySideEditor["ANY"] = 4] = "ANY";
})(SideBySideEditor || (SideBySideEditor = {}));
class EditorResourceAccessorImpl {
    getOriginalUri(editor, options) {
        if (!editor) {
            return undefined;
        }
        // Merge editors are handled with `merged` result editor
        if (isResourceMergeEditorInput(editor)) {
            return EditorResourceAccessor.getOriginalUri(editor.result, options);
        }
        // Optionally support side-by-side editors
        if (options?.supportSideBySide) {
            const { primary, secondary } = this.getSideEditors(editor);
            if (primary && secondary) {
                if (options?.supportSideBySide === SideBySideEditor.BOTH) {
                    return {
                        primary: this.getOriginalUri(primary, { filterByScheme: options.filterByScheme }),
                        secondary: this.getOriginalUri(secondary, { filterByScheme: options.filterByScheme })
                    };
                }
                else if (options?.supportSideBySide === SideBySideEditor.ANY) {
                    return this.getOriginalUri(primary, { filterByScheme: options.filterByScheme }) ?? this.getOriginalUri(secondary, { filterByScheme: options.filterByScheme });
                }
                editor = options.supportSideBySide === SideBySideEditor.PRIMARY ? primary : secondary;
            }
        }
        if (isResourceDiffEditorInput(editor) || isResourceMultiDiffEditorInput(editor) || isResourceSideBySideEditorInput(editor) || isResourceMergeEditorInput(editor)) {
            return undefined;
        }
        // Original URI is the `preferredResource` of an editor if any
        const originalResource = isEditorInputWithPreferredResource(editor) ? editor.preferredResource : editor.resource;
        if (!originalResource || !options?.filterByScheme) {
            return originalResource;
        }
        return this.filterUri(originalResource, options.filterByScheme);
    }
    getSideEditors(editor) {
        if (isSideBySideEditorInput(editor) || isResourceSideBySideEditorInput(editor)) {
            return { primary: editor.primary, secondary: editor.secondary };
        }
        if (isDiffEditorInput(editor) || isResourceDiffEditorInput(editor)) {
            return { primary: editor.modified, secondary: editor.original };
        }
        return { primary: undefined, secondary: undefined };
    }
    getCanonicalUri(editor, options) {
        if (!editor) {
            return undefined;
        }
        // Merge editors are handled with `merged` result editor
        if (isResourceMergeEditorInput(editor)) {
            return EditorResourceAccessor.getCanonicalUri(editor.result, options);
        }
        // Optionally support side-by-side editors
        if (options?.supportSideBySide) {
            const { primary, secondary } = this.getSideEditors(editor);
            if (primary && secondary) {
                if (options?.supportSideBySide === SideBySideEditor.BOTH) {
                    return {
                        primary: this.getCanonicalUri(primary, { filterByScheme: options.filterByScheme }),
                        secondary: this.getCanonicalUri(secondary, { filterByScheme: options.filterByScheme })
                    };
                }
                else if (options?.supportSideBySide === SideBySideEditor.ANY) {
                    return this.getCanonicalUri(primary, { filterByScheme: options.filterByScheme }) ?? this.getCanonicalUri(secondary, { filterByScheme: options.filterByScheme });
                }
                editor = options.supportSideBySide === SideBySideEditor.PRIMARY ? primary : secondary;
            }
        }
        if (isResourceDiffEditorInput(editor) || isResourceMultiDiffEditorInput(editor) || isResourceSideBySideEditorInput(editor) || isResourceMergeEditorInput(editor)) {
            return undefined;
        }
        // Canonical URI is the `resource` of an editor
        const canonicalResource = editor.resource;
        if (!canonicalResource || !options?.filterByScheme) {
            return canonicalResource;
        }
        return this.filterUri(canonicalResource, options.filterByScheme);
    }
    filterUri(resource, filter) {
        // Multiple scheme filter
        if (Array.isArray(filter)) {
            if (filter.some(scheme => resource.scheme === scheme)) {
                return resource;
            }
        }
        // Single scheme filter
        else {
            if (filter === resource.scheme) {
                return resource;
            }
        }
        return undefined;
    }
}
export var EditorCloseMethod;
(function (EditorCloseMethod) {
    EditorCloseMethod[EditorCloseMethod["UNKNOWN"] = 0] = "UNKNOWN";
    EditorCloseMethod[EditorCloseMethod["KEYBOARD"] = 1] = "KEYBOARD";
    EditorCloseMethod[EditorCloseMethod["MOUSE"] = 2] = "MOUSE";
})(EditorCloseMethod || (EditorCloseMethod = {}));
export function preventEditorClose(group, editor, method, configuration) {
    if (!group.isSticky(editor)) {
        return false; // only interested in sticky editors
    }
    switch (configuration.preventPinnedEditorClose) {
        case 'keyboardAndMouse': return method === EditorCloseMethod.MOUSE || method === EditorCloseMethod.KEYBOARD;
        case 'mouse': return method === EditorCloseMethod.MOUSE;
        case 'keyboard': return method === EditorCloseMethod.KEYBOARD;
    }
    return false;
}
export const EditorResourceAccessor = new EditorResourceAccessorImpl();
export var CloseDirection;
(function (CloseDirection) {
    CloseDirection[CloseDirection["LEFT"] = 0] = "LEFT";
    CloseDirection[CloseDirection["RIGHT"] = 1] = "RIGHT";
})(CloseDirection || (CloseDirection = {}));
class EditorFactoryRegistry {
    constructor() {
        this.editorSerializerConstructors = new Map();
        this.editorSerializerInstances = new Map();
    }
    start(accessor) {
        const instantiationService = this.instantiationService = accessor.get(IInstantiationService);
        for (const [key, ctor] of this.editorSerializerConstructors) {
            this.createEditorSerializer(key, ctor, instantiationService);
        }
        this.editorSerializerConstructors.clear();
    }
    createEditorSerializer(editorTypeId, ctor, instantiationService) {
        const instance = instantiationService.createInstance(ctor);
        this.editorSerializerInstances.set(editorTypeId, instance);
    }
    registerFileEditorFactory(factory) {
        if (this.fileEditorFactory) {
            throw new Error('Can only register one file editor factory.');
        }
        this.fileEditorFactory = factory;
    }
    getFileEditorFactory() {
        return assertReturnsDefined(this.fileEditorFactory);
    }
    registerEditorSerializer(editorTypeId, ctor) {
        if (this.editorSerializerConstructors.has(editorTypeId) || this.editorSerializerInstances.has(editorTypeId)) {
            throw new Error(`A editor serializer with type ID '${editorTypeId}' was already registered.`);
        }
        if (!this.instantiationService) {
            this.editorSerializerConstructors.set(editorTypeId, ctor);
        }
        else {
            this.createEditorSerializer(editorTypeId, ctor, this.instantiationService);
        }
        return toDisposable(() => {
            this.editorSerializerConstructors.delete(editorTypeId);
            this.editorSerializerInstances.delete(editorTypeId);
        });
    }
    getEditorSerializer(arg1) {
        return this.editorSerializerInstances.get(typeof arg1 === 'string' ? arg1 : arg1.typeId);
    }
}
Registry.add(EditorExtensions.EditorFactory, new EditorFactoryRegistry());
export async function pathsToEditors(paths, fileService, logService) {
    if (!paths?.length) {
        return [];
    }
    return await Promise.all(paths.map(async (path) => {
        const resource = URI.revive(path.fileUri);
        if (!resource) {
            logService.info('Cannot resolve the path because it is not valid.', path);
            return undefined;
        }
        const canHandleResource = await fileService.canHandleResource(resource);
        if (!canHandleResource) {
            logService.info('Cannot resolve the path because it cannot be handled', path);
            return undefined;
        }
        let exists = path.exists;
        let type = path.type;
        if (typeof exists !== 'boolean' || typeof type !== 'number') {
            try {
                type = (await fileService.stat(resource)).isDirectory ? FileType.Directory : FileType.Unknown;
                exists = true;
            }
            catch (error) {
                logService.error(error);
                exists = false;
            }
        }
        if (!exists && path.openOnlyIfExists) {
            logService.info('Cannot resolve the path because it does not exist', path);
            return undefined;
        }
        if (type === FileType.Directory) {
            logService.info('Cannot resolve the path because it is a directory', path);
            return undefined;
        }
        const options = {
            ...path.options,
            pinned: true
        };
        if (!exists) {
            return { resource, options, forceUntitled: true };
        }
        return { resource, options };
    }));
}
export var EditorsOrder;
(function (EditorsOrder) {
    /**
     * Editors sorted by most recent activity (most recent active first)
     */
    EditorsOrder[EditorsOrder["MOST_RECENTLY_ACTIVE"] = 0] = "MOST_RECENTLY_ACTIVE";
    /**
     * Editors sorted by sequential order
     */
    EditorsOrder[EditorsOrder["SEQUENTIAL"] = 1] = "SEQUENTIAL";
})(EditorsOrder || (EditorsOrder = {}));
export function isTextEditorViewState(candidate) {
    const viewState = candidate;
    if (!viewState) {
        return false;
    }
    const diffEditorViewState = viewState;
    if (diffEditorViewState.modified) {
        return isTextEditorViewState(diffEditorViewState.modified);
    }
    const codeEditorViewState = viewState;
    return !!(codeEditorViewState.contributionsState && codeEditorViewState.viewState && Array.isArray(codeEditorViewState.cursorState));
}
export function isEditorOpenError(obj) {
    return isErrorWithActions(obj);
}
export function createEditorOpenError(messageOrError, actions, options) {
    const error = createErrorWithActions(messageOrError, actions);
    error.forceMessage = options?.forceMessage;
    error.forceSeverity = options?.forceSeverity;
    error.allowDialog = options?.allowDialog;
    return error;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUV4QyxPQUFPLEVBQTJCLG9CQUFvQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDM0YsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxVQUFVLEVBQWUsWUFBWSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFJdkYsT0FBTyxFQUFFLHFCQUFxQixFQUEyRCxNQUFNLHNEQUFzRCxDQUFDO0FBRXRKLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUl0RSxPQUFPLEVBQUUsUUFBUSxFQUFpQyxNQUFNLHNDQUFzQyxDQUFDO0FBRy9GLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUd2RCxPQUFPLEVBQXFCLHNCQUFzQixFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbEgsT0FBTyxFQUFXLFFBQVEsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ2pFLE9BQU8sUUFBUSxNQUFNLCtCQUErQixDQUFDO0FBSXJELHlDQUF5QztBQUN6QyxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRztJQUMvQixVQUFVLEVBQUUsaUNBQWlDO0lBQzdDLGFBQWEsRUFBRSwrQ0FBK0M7Q0FDOUQsQ0FBQztBQUVGLCtDQUErQztBQUMvQyxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRztJQUN6QyxFQUFFLEVBQUUsU0FBUztJQUNiLFdBQVcsRUFBRSxRQUFRLENBQUMsMENBQTBDLEVBQUUsYUFBYSxDQUFDO0lBQ2hGLG1CQUFtQixFQUFFLFFBQVEs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