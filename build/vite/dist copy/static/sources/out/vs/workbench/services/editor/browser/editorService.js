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
var EditorService_1;
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SideBySideEditor, isEditorInputWithOptions, EditorResourceAccessor, isResourceDiffEditorInput, isResourceEditorInput, isEditorInput, isEditorInputWithOptionsAndGroup, isResourceMergeEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import { IFileService, FileChangesEvent } from '../../../../platform/files/common/files.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { joinPath } from '../../../../base/common/resources.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { SideBySideEditor as SideBySideEditorPane } from '../../../browser/parts/editor/sideBySideEditor.js';
import { IEditorGroupsService, isEditorReplacement } from '../common/editorGroupsService.js';
import { IEditorService, isPreferredGroup } from '../common/editorService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable, dispose, DisposableStore } from '../../../../base/common/lifecycle.js';
import { coalesce, distinct } from '../../../../base/common/arrays.js';
import { isCodeEditor, isDiffEditor, isCompositeEditor } from '../../../../editor/browser/editorBrowser.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { isUndefined } from '../../../../base/common/types.js';
import { EditorsObserver } from '../../../browser/parts/editor/editorsObserver.js';
import { Promises, timeout } from '../../../../base/common/async.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { indexOfPath } from '../../../../base/common/extpath.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IEditorResolverService } from '../common/editorResolverService.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IHostService } from '../../host/browser/host.js';
import { findGroup } from '../common/editorGroupFinder.js';
import { ITextEditorService } from '../../textfile/common/textEditorService.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
let EditorService = EditorService_1 = class EditorService extends Disposable {
    constructor(editorGroupsContainer, editorGroupService, instantiationService, fileService, configurationService, contextService, uriIdentityService, editorResolverService, workspaceTrustRequestService, hostService, textEditorService) {
        super();
        this.editorGroupService = editorGroupService;
        this.instantiationService = instantiationService;
        this.fileService = fileService;
        this.configurationService = configurationService;
        this.contextService = contextService;
        this.uriIdentityService = uriIdentityService;
        this.editorResolverService = editorResolverService;
        this.workspaceTrustRequestService = workspaceTrustRequestService;
        this.hostService = hostService;
        this.textEditorService = textEditorService;
        //#region events
        this._onDidActiveEditorChange = this._register(new Emitter());
        this.onDidActiveEditorChange = this._onDidActiveEditorChange.event;
        this._onDidVisibleEditorsChange = this._register(new Emitter());
        this.onDidVisibleEditorsChange = this._onDidVisibleEditorsChange.event;
        this._onDidEditorsChange = this._register(new Emitter());
        this.onDidEditorsChange = this._onDidEditorsChange.event;
        this._onWillOpenEditor = this._register(new Emitter());
        this.onWillOpenEditor = this._onWillOpenEditor.event;
        this._onDidCloseEditor = this._register(new Emitter());
        this.onDidCloseEditor = this._onDidCloseEditor.event;
        this._onDidOpenEditorFail = this._register(new Emitter());
        this.onDidOpenEditorFail = this._onDidOpenEditorFail.event;
        this._onDidMostRecentlyActiveEditorsChange = this._register(new Emitter());
        this.onDidMostRecentlyActiveEditorsChange = this._onDidMostRecentlyActiveEditorsChange.event;
        //#region Editor & group event handlers
        this.lastActiveEditor = undefined;
        //#endregion
        //#region Visible Editors Change: Install file watchers for out of workspace resources that became visible
        this.activeOutOfWorkspaceWatchers = new ResourceMap();
        this.closeOnFileDelete = false;
        this.editorGroupsContainer = editorGroupsContainer ?? editorGroupService;
        this.editorsObserver = this._register(this.instantiationService.createInstance(EditorsObserver, this.editorGroupsContainer));
        this.onConfigurationUpdated();
        this.registerListeners();
    }
    createScoped(editorGroupsContainer, disposables) {
        return disposables.add(new EditorService_1(editorGroupsContainer, this.editorGroupService, this.instantiationService, this.fileService, this.configurationService, this.contextService, this.uriIdentityService, this.editorResolverService, this.workspaceTrustRequestService, this.hostService, this.textEditorService));
    }
    registerListeners() {
        // Editor & group changes
        if (this.editorGroupsContainer === this.editorGroupService.mainPart || this.editorGroupsContainer === this.editorGroupService) {
            this.editorGroupService.whenReady.then(() => this.onEditorGroupsReady());
        }
        else {
            this.onEditorGroupsReady();
        }
        this._register(this.editorGroupsContainer.onDidChangeActiveGroup(group => this.handleActiveEditorChange(group)));
        this._register(this.editorGroupsContainer.onDidAddGroup(group => this.registerGroupListeners(group)));
        this._register(this.editorsObserver.onDidMostRecentlyActiveEditorsChange(() => this._onDidMostRecentlyActiveEditorsChange.fire()));
        // Out of workspace file watchers
        this._register(this.onDidVisibleEditorsChange(() => this.handleVisibleEditorsChange()));
        // File changes & operations
        // Note: there is some duplication with the two file event handlers- Since we cannot always rely on the disk events
        // carrying all necessary data in all environments, we also use the file operation events to make sure operations are handled.
        // In any case there is no guarantee if the local event is fired first or the disk one. Thus, code must handle the case
        // that the event ordering is random as well as might not carry all information needed.
        this._register(this.fileService.onDidRunOperation(e => this.onDidRunFileOperation(e)));
        this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
        // Configuration
        this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));
    }
    onEditorGroupsReady() {
        // Register listeners to each opened group
        for (const group of this.editorGroupsContainer.groups) {
            this.registerGroupListeners(group);
        }
        // Fire initial set of editor events if there is an active editor
        if (this.activeEditor) {
            this.doHandleActiveEditorChangeEvent();
            this._onDidVisibleEditorsChange.fire();
        }
    }
    handleActiveEditorChange(group) {
        if (group !== this.editorGroupsContainer.activeGroup) {
            return; // ignore if not the active group
        }
        if (!this.lastActiveEditor && !group.activeEditor) {
            return; // ignore if we still have no active editor
        }
        this.doHandleActiveEditorChangeEvent();
    }
    doHandleActiveEditorChangeEvent() {
        // Remember as last active
        const activeGroup = this.editorGroupsContainer.activeGroup;
        this.lastActiveEditor = activeGroup.activeEditor ?? undefined;
        // Fire event to outside parties
        this._onDidActiveEditorChange.fire();
    }
    registerGroupListeners(group) {
        const groupDisposables = new DisposableStore();
        groupDisposables.add(group.onDidModelChange(e => {
            this._onDidEditorsChange.fire({ groupId: group.id, event: e });
        }));
        groupDisposables.add(group.onDidActiveEditorChange(() => {
            this.handleActiveEditorChange(group);
            this._onDidVisibleEditorsChange.fire();
        }));
        groupDisposables.add(group.onWillOpenEditor(e => {
            this._onWillOpenEditor.fire(e);
        }));
        groupDisposables.add(group.onDidCloseEditor(e => {
            this._onDidCloseEditor.fire(e);
        }));
        groupDisposables.add(group.onDidOpenEditorFail(editor => {
            this._onDidOpenEditorFail.fire({ editor, groupId: group.id });
        }));
        Event.once(group.onWillDispose)(() => {
            dispose(groupDisposables);
        });
    }
    handleVisibleEditorsChange() {
        const visibleOutOfWorkspaceResources = new ResourceSet();
        for (const editor of this.visibleEditors) {
            const resources = distinct(coalesce([
                EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }),
                EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY })
            ]), resource => resource.toString());
            for (const resource of resources) {
                if (this.fileService.hasProvider(resource) && !this.contextService.isInsideWorkspace(resource)) {
                    visibleOutOfWorkspaceResources.add(resource);
                }
            }
        }
        // Handle no longer visible out of workspace resources
        for (const resource of this.activeOutOfWorkspaceWatchers.keys()) {
            if (!visibleOutOfWorkspaceResources.has(resource)) {
                dispose(this.activeOutOfWorkspaceWatchers.get(resource));
                this.activeOutOfWorkspaceWatchers.delete(resource);
            }
        }
        // Handle newly visible out of workspace resources
        for (const resource of visibleOutOfWorkspaceResources.keys()) {
            if (!this.activeOutOfWorkspaceWatchers.get(resource)) {
                const disposable = this.fileService.watch(resource);
                this.activeOutOfWorkspaceWatchers.set(resource, disposable);
            }
        }
    }
    //#endregion
    //#region File Changes: Move & Deletes to move or close opend editors
    async onDidRunFileOperation(e) {
        // Handle moves specially when file is opened
        if (e.isOperation(2 /* FileOperation.MOVE */)) {
            this.handleMovedFile(e.resource, e.target.resource);
        }
        // Handle deletes
        if (e.isOperation(1 /* FileOperation.DELETE */) || e.isOperation(2 /* FileOperation.MOVE */)) {
            this.handleDeletedFile(e.resource, false, e.target ? e.target.resource : undefined);
        }
    }
    onDidFilesChange(e) {
        if (e.gotDeleted()) {
            this.handleDeletedFile(e, true);
        }
    }
    async handleMovedFile(source, target) {
        for (const group of this.editorGroupsContainer.groups) {
            const replacements = [];
            for (const editor of group.editors) {
                const resource = editor.resource;
                if (!resource || !this.uriIdentityService.extUri.isEqualOrParent(resource, source)) {
                    continue; // not matching our resource
                }
                // Determine new resulting target resource
                let targetResource;
                if (this.uriIdentityService.extUri.isEqual(source, resource)) {
                    targetResource = target; // file got moved
                }
                else {
                    const index = indexOfPath(resource.path, source.path, this.uriIdentityService.extUri.ignorePathCasing(resource));
                    targetResource = joinPath(target, resource.path.substr(index + source.path.length + 1)); // parent folder got moved
                }
                // Delegate rename() to editor instance
                const moveResult = await editor.rename(group.id, targetResource);
                if (!moveResult) {
                    return; // not target - ignore
                }
                const optionOverrides = {
                    preserveFocus: true,
                    pinned: group.isPinned(editor),
                    sticky: group.isSticky(editor),
                    index: group.getIndexOfEditor(editor),
                    inactive: !group.isActive(editor)
                };
                // Construct a replacement with our extra options mixed in
                if (isEditorInput(moveResult.editor)) {
                    replacements.push({
                        editor,
                        replacement: moveResult.editor,
                        options: {
                            ...moveResult.options,
                            ...optionOverrides
                        }
                    });
                }
                else {
                    replacements.push({
                        editor,
                        replacement: {
                            ...moveResult.editor,
                            options: {
                                ...moveResult.editor.options,
                                ...optionOverrides
                            }
                        }
                    });
                }
            }
            // Apply replacements
            if (replacements.length) {
                this.replaceEditors(replacements, group);
            }
        }
    }
    onConfigurationUpdated(e) {
        if (e && !e.affectsConfiguration('workbench.editor.closeOnFileDelete')) {
            return;
        }
        const configuration = this.configurationService.getValue();
        if (typeof configuration.workbench?.editor?.closeOnFileDelete === 'boolean') {
            this.closeOnFileDelete = configuration.workbench.editor.closeOnFileDelete;
        }
        else {
            this.closeOnFileDelete = false; // default
        }
    }
    handleDeletedFile(arg1, isExternal, movedTo) {
        for (const editor of this.getAllNonDirtyEditors({ includeUntitled: false, supportSideBySide: true })) {
            (async () => {
                const resource = editor.resource;
                if (!resource) {
                    return;
                }
                // Handle deletes in opened editors depending on:
                // - we close any editor when `closeOnFileDelete: true`
                // - we close any editor when the delete occurred from within VSCode
                if (this.closeOnFileDelete || !isExternal) {
                    // Do NOT close any opened editor that matches the resource path (either equal or being parent) of the
                    // resource we move to (movedTo). Otherwise we would close a resource that has been renamed to the same
                    // path but different casing.
                    if (movedTo && this.uriIdentityService.extUri.isEqualOrParent(resource, movedTo)) {
                        return;
                    }
                    let matches = false;
                    if (arg1 instanceof FileChangesEvent) {
                        matches = arg1.contains(resource, 2 /* FileChangeType.DELETED */);
                    }
                    else {
                        matches = this.uriIdentityService.extUri.isEqualOrParent(resource, arg1);
                    }
                    if (!matches) {
                        return;
                    }
                    // We have received reports of users seeing delete events even though the file still
                    // exists (network shares issue: https://github.com/microsoft/vscode/issues/13665).
                    // Since we do not want to close an editor without reason, we have to check if the
                    // file is really gone and not just a faulty file event.
                    // This only applies to external file events, so we need to check for the isExternal
                    // flag.
                    let exists = false;
                    if (isExternal && this.fileService.hasProvider(resource)) {
                        await timeout(100);
                        exists = await this.fileService.exists(resource);
                    }
                    if (!exists && !editor.isDisposed()) {
                        editor.dispose();
                    }
                }
            })();
        }
    }
    getAllNonDirtyEditors(options) {
        const editors = [];
        function conditionallyAddEditor(editor) {
            if (editor.hasCapability(4 /* EditorInputCapabilities.Untitled */) && !options.includeUntitled) {
                return;
            }
            if (editor.isDirty()) {
                return;
            }
            editors.push(editor);
        }
        for (const editor of this.editors) {
            if (options.supportSideBySide && editor instanceof SideBySideEditorInput) {
                conditionallyAddEditor(editor.primary);
                conditionallyAddEditor(editor.secondary);
            }
            else {
                conditionallyAddEditor(editor);
            }
        }
        return editors;
    }
    get activeEditorPane() {
        return this.editorGroupsContainer.activeGroup?.activeEditorPane;
    }
    get activeTextEditorControl() {
        const activeEditorPane = this.activeEditorPane;
        if (activeEditorPane) {
            const activeControl = activeEditorPane.getControl();
            if (isCodeEditor(activeControl) || isDiffEditor(activeControl)) {
                return activeControl;
            }
            if (isCompositeEditor(activeControl) && isCodeEditor(activeControl.activeCodeEditor)) {
                return activeControl.activeCodeEditor;
            }
        }
        return undefined;
    }
    get activeTextEditorLanguageId() {
        let activeCodeEditor = undefined;
        const activeTextEditorControl = this.activeTextEditorControl;
        if (isDiffEditor(activeTextEditorControl)) {
            activeCodeEditor = activeTextEditorControl.getModifiedEditor();
        }
        else {
            activeCodeEditor = activeTextEditorControl;
        }
        return activeCodeEditor?.getModel()?.getLanguageId();
    }
    get count() {
        return this.editorsObserver.count;
    }
    get editors() {
        return this.getEditors(1 /* EditorsOrder.SEQUENTIAL */).map(({ editor }) => editor);
    }
    getEditors(order, options) {
        switch (order) {
            // MRU
            case 0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */:
                if (options?.excludeSticky) {
                    return this.editorsObserver.editors.filter(({ groupId, editor }) => !this.editorGroupsContainer.getGroup(groupId)?.isSticky(editor));
                }
                return this.editorsObserver.editors;
            // Sequential
            case 1 /* EditorsOrder.SEQUENTIAL */: {
                const editors = [];
                for (const group of this.editorGroupsContainer.getGroups(2 /* GroupsOrder.GRID_APPEARANCE */)) {
                    editors.push(...group.getEditors(1 /* EditorsOrder.SEQUENTIAL */, options).map(editor => ({ editor, groupId: group.id })));
                }
                return editors;
            }
        }
    }
    get activeEditor() {
        const activeGroup = this.editorGroupsContainer.activeGroup;
        return activeGroup ? activeGroup.activeEditor ?? undefined : undefined;
    }
    get visibleEditorPanes() {
        return coalesce(this.editorGroupsContainer.groups.map(group => group.activeEditorPane));
    }
    get visibleTextEditorControls() {
        return this.doGetVisibleTextEditorControls(this.visibleEditorPanes);
    }
    doGetVisibleTextEditorControls(editorPanes) {
        const visibleTextEditorControls = [];
        for (const editorPane of editorPanes) {
            const controls = [];
            if (editorPane instanceof SideBySideEditorPane) {
                controls.push(editorPane.getPrimaryEditorPane()?.getControl());
                controls.push(editorPane.getSecondaryEditorPane()?.getControl());
            }
            else {
                controls.push(editorPane.getControl());
            }
            for (const control of controls) {
                if (isCodeEditor(control) || isDiffEditor(control)) {
                    visibleTextEditorControls.push(control);
                }
            }
        }
        return visibleTextEditorControls;
    }
    getVisibleTextEditorControls(order) {
        return this.doGetVisibleTextEditorControls(coalesce(this.editorGroupsContainer.getGroups(order === 1 /* EditorsOrder.SEQUENTIAL */ ? 2 /* GroupsOrder.GRID_APPEARANCE */ : 1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */).map(group => group.activeEditorPane)));
    }
    get visibleEditors() {
        return coalesce(this.editorGroupsContainer.groups.map(group => group.activeEditor));
    }
    async openEditor(editor, optionsOrPreferredGroup, preferredGroup) {
        let typedEditor = undefined;
        let options = isEditorInput(editor) ? optionsOrPreferredGroup : editor.options;
        let group = undefined;
        if (isPreferredGroup(optionsOrPreferredGroup)) {
            preferredGroup = optionsOrPreferredGroup;
        }
        // Resolve override unless disabled
        if (!isEditorInput(editor)) {
            const resolvedEditor = await this.editorResolverService.resolveEditor(editor, preferredGroup);
            if (resolvedEditor === 1 /* ResolvedStatus.ABORT */) {
                return; // skip editor if override is aborted
            }
            // We resolved an editor to use
            if (isEditorInputWithOptionsAndGroup(resolvedEditor)) {
                typedEditor = resolvedEditor.editor;
                options = resolvedEditor.options;
                group = resolvedEditor.group;
            }
        }
        // Override is disabled or did not apply: fallback to default
        if (!typedEditor) {
            typedEditor = isEditorInput(editor) ? editor : await this.textEditorService.resolveTextEditor(editor);
        }
        // If group still isn't defined because of a disabled override we resolve it
        if (!group) {
            let activation = undefined;
            const findGroupResult = this.instantiationService.invokeFunction(findGroup, { editor: typedEditor, options }, preferredGroup);
            if (findGroupResult instanceof Promise) {
                ([group, activation] = await findGroupResult);
            }
            else {
                ([group, activation] = findGroupResult);
            }
            // Mixin editor group activation if returned
            if (activation) {
                options = { ...options, activation };
            }
        }
        // Modal group: override `preserveFocus` to move focus into the modal because there is nothing to preserve if this is the first modal editor
        if (options?.preserveFocus &&
            this.editorGroupService.activeModalEditorPart?.groups.some(modalGroup => modalGroup.id === group.id) &&
            this.editorGroupService.activeModalEditorPart.count === 1 &&
            this.editorGroupService.activeModalEditorPart.groups[0].isEmpty) {
            options = { ...options, preserveFocus: false };
        }
        return group.openEditor(typedEditor, options);
    }
    async openEditors(editors, preferredGroup, options) {
        // Pass all editors to trust service to determine if
        // we should proceed with opening the editors if we
        // are asked to validate trust.
        if (options?.validateTrust) {
            const editorsTrusted = await this.handleWorkspaceTrust(editors);
            if (!editorsTrusted) {
                return [];
            }
        }
        // Find target groups for editors to open
        const mapGroupToTypedEditors = new Map();
        for (const editor of editors) {
            let typedEditor = undefined;
            let group = undefined;
            // Resolve override unless disabled
            if (!isEditorInputWithOptions(editor)) {
                const resolvedEditor = await this.editorResolverService.resolveEditor(editor, preferredGroup);
                if (resolvedEditor === 1 /* ResolvedStatus.ABORT */) {
                    continue; // skip editor if override is aborted
                }
                // We resolved an editor to use
                if (isEditorInputWithOptionsAndGroup(resolvedEditor)) {
                    typedEditor = resolvedEditor;
                    group = resolvedEditor.group;
                }
            }
            // Override is disabled or did not apply: fallback to default
            if (!typedEditor) {
                typedEditor = isEditorInputWithOptions(editor) ? editor : { editor: await this.textEditorService.resolveTextEditor(editor), options: editor.options };
            }
            // If group still isn't defined because of a disabled override we resolve it
            if (!group) {
                const findGroupResult = this.instantiationService.invokeFunction(findGroup, typedEditor, preferredGroup);
                if (findGroupResult instanceof Promise) {
                    ([group] = await findGroupResult);
                }
                else {
                    ([group] = findGroupResult);
                }
            }
            // Modal group: override `preserveFocus` to move focus into the modal there is nothing to preserve if this is the first modal editor
            if (typedEditor.options?.preserveFocus &&
                this.editorGroupService.activeModalEditorPart?.groups.some(modalGroup => modalGroup.id === group.id) &&
                this.editorGroupService.activeModalEditorPart.count === 1 &&
                this.editorGroupService.activeModalEditorPart.groups[0].isEmpty) {
                typedEditor = { ...typedEditor, options: { ...typedEditor.options, preserveFocus: false } };
            }
            // Update map of groups to editors
            let targetGroupEditors = mapGroupToTypedEditors.get(group);
            if (!targetGroupEditors) {
                targetGroupEditors = [];
                mapGroupToTypedEditors.set(group, targetGroupEditors);
            }
            targetGroupEditors.push(typedEditor);
        }
        // Open in target groups
        const result = [];
        for (const [group, editors] of mapGroupToTypedEditors) {
            result.push(group.openEditors(editors));
        }
        return coalesce(await Promises.settled(result));
    }
    async handleWorkspaceTrust(editors) {
        const { resources, diffMode, mergeMode } = this.extractEditorResources(editors);
        const trustResult = await this.workspaceTrustRequestService.requestOpenFilesTrust(resources);
        switch (trustResult) {
            case 1 /* WorkspaceTrustUriResponse.Open */:
                return true;
            case 2 /* WorkspaceTrustUriResponse.OpenInNewWindow */:
                await this.hostService.openWindow(resources.map(resource => ({ fileUri: resource })), { forceNewWindow: true, diffMode, mergeMode });
                return false;
            case 3 /* WorkspaceTrustUriResponse.Cancel */:
                return false;
        }
    }
    extractEditorResources(editors) {
        const resources = new ResourceSet();
        let diffMode = false;
        let mergeMode = false;
        for (const editor of editors) {
            // Typed Editor
            if (isEditorInputWithOptions(editor)) {
                const resource = EditorResourceAccessor.getOriginalUri(editor.editor, { supportSideBySide: SideBySideEditor.BOTH });
                if (URI.isUri(resource)) {
                    resources.add(resource);
                }
                else if (resource) {
                    if (resource.primary) {
                        resources.add(resource.primary);
                    }
                    if (resource.secondary) {
                        resources.add(resource.secondary);
                    }
                    diffMode = editor.editor instanceof DiffEditorInput;
                }
            }
            // Untyped editor
            else {
                if (isResourceMergeEditorInput(editor)) {
                    if (URI.isUri(editor.input1)) {
                        resources.add(editor.input1.resource);
                    }
                    if (URI.isUri(editor.input2)) {
                        resources.add(editor.input2.resource);
                    }
                    if (URI.isUri(editor.base)) {
                        resources.add(editor.base.resource);
                    }
                    if (URI.isUri(editor.result)) {
                        resources.add(editor.result.resource);
                    }
                    mergeMode = true;
                }
                if (isResourceDiffEditorInput(editor)) {
                    if (URI.isUri(editor.original.resource)) {
                        resources.add(editor.original.resource);
                    }
                    if (URI.isUri(editor.modified.resource)) {
                        resources.add(editor.modified.resource);
                    }
                    diffMode = true;
                }
                else if (isResourceEditorInput(editor)) {
                    resources.add(editor.resource);
                }
            }
        }
        return {
            resources: Array.from(resources.keys()),
            diffMode,
            mergeMode
        };
    }
    //#endregion
    //#region isOpened() / isVisible()
    isOpened(editor) {
        return this.editorsObserver.hasEditor({
            resource: this.uriIdentityService.asCanonicalUri(editor.resource),
            typeId: editor.typeId,
            editorId: editor.editorId
        });
    }
    isVisible(editor) {
        for (const group of this.editorGroupsContainer.groups) {
            if (group.activeEditor?.matches(editor)) {
                return true;
            }
        }
        return false;
    }
    //#endregion
    //#region closeEditor()
    async closeEditor({ editor, groupId }, options) {
        const group = this.editorGroupsContainer.getGroup(groupId);
        await group?.closeEditor(editor, options);
    }
    //#endregion
    //#region closeEditors()
    async closeEditors(editors, options) {
        const mapGroupToEditors = new Map();
        for (const { editor, groupId } of editors) {
            const group = this.editorGroupsContainer.getGroup(groupId);
            if (!group) {
                continue;
            }
            let editors = mapGroupToEditors.get(group);
            if (!editors) {
                editors = [];
                mapGroupToEditors.set(group, editors);
            }
            editors.push(editor);
        }
        for (const [group, editors] of mapGroupToEditors) {
            await group.closeEditors(editors, options);
        }
    }
    findEditors(arg1, options, arg2) {
        const resource = URI.isUri(arg1) ? arg1 : arg1.resource;
        const typeId = URI.isUri(arg1) ? undefined : arg1.typeId;
        // Do a quick check for the resource via the editor observer
        // which is a very efficient way to find an editor by resource.
        // However, we can only do that unless we are asked to find an
        // editor on the secondary side of a side by side editor, because
        // the editor observer provides fast lookups only for primary
        // editors.
        if (options?.supportSideBySide !== SideBySideEditor.ANY && options?.supportSideBySide !== SideBySideEditor.SECONDARY) {
            if (!this.editorsObserver.hasEditors(resource)) {
                if (URI.isUri(arg1) || isUndefined(arg2)) {
                    return [];
                }
                return undefined;
            }
        }
        // Search only in specific group
        if (!isUndefined(arg2)) {
            const targetGroup = typeof arg2 === 'number' ? this.editorGroupsContainer.getGroup(arg2) : arg2;
            // Resource provided: result is an array
            if (URI.isUri(arg1)) {
                if (!targetGroup) {
                    return [];
                }
                return targetGroup.findEditors(resource, options);
            }
            // Editor identifier provided, result is single
            else {
                if (!targetGroup) {
                    return undefined;
                }
                const editors = targetGroup.findEditors(resource, options);
                for (const editor of editors) {
                    if (editor.typeId === typeId) {
                        return editor;
                    }
                }
                return undefined;
            }
        }
        // Search across all groups in MRU order
        else {
            const result = [];
            for (const group of this.editorGroupsContainer.getGroups(options?.order === 1 /* EditorsOrder.SEQUENTIAL */ ? 2 /* GroupsOrder.GRID_APPEARANCE */ : 1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */)) {
                const editors = [];
                // Resource provided: result is an array
                if (URI.isUri(arg1)) {
                    editors.push(...this.findEditors(arg1, options, group));
                }
                // Editor identifier provided, result is single
                else {
                    const editor = this.findEditors(arg1, options, group);
                    if (editor) {
                        editors.push(editor);
                    }
                }
                result.push(...editors.map(editor => ({ editor, groupId: group.id })));
            }
            return result;
        }
    }
    async replaceEditors(replacements, group) {
        const targetGroup = typeof group === 'number' ? this.editorGroupsContainer.getGroup(group) : group;
        // Convert all replacements to typed editors unless already
        // typed and handle overrides properly.
        const typedReplacements = [];
        for (const replacement of replacements) {
            let typedReplacement = undefined;
            // Resolve override unless disabled
            if (!isEditorInput(replacement.replacement)) {
                const resolvedEditor = await this.editorResolverService.resolveEditor(replacement.replacement, targetGroup);
                if (resolvedEditor === 1 /* ResolvedStatus.ABORT */) {
                    continue; // skip editor if override is aborted
                }
                // We resolved an editor to use
                if (isEditorInputWithOptionsAndGroup(resolvedEditor)) {
                    typedReplacement = {
                        editor: replacement.editor,
                        replacement: resolvedEditor.editor,
                        options: resolvedEditor.options,
                        forceReplaceDirty: replacement.forceReplaceDirty
                    };
                }
            }
            // Override is disabled or did not apply: fallback to default
            if (!typedReplacement) {
                typedReplacement = {
                    editor: replacement.editor,
                    replacement: isEditorReplacement(replacement) ? replacement.replacement : await this.textEditorService.resolveTextEditor(replacement.replacement),
                    options: isEditorReplacement(replacement) ? replacement.options : replacement.replacement.options,
                    forceReplaceDirty: replacement.forceReplaceDirty
                };
            }
            typedReplacements.push(typedReplacement);
        }
        return targetGroup?.replaceEditors(typedReplacements);
    }
    //#endregion
    //#region save/revert
    async save(editors, options) {
        // Convert to array
        if (!Array.isArray(editors)) {
            editors = [editors];
        }
        // Make sure to not save the same editor multiple times
        // by using the `matches()` method to find duplicates
        const uniqueEditors = this.getUniqueEditors(editors);
        // Split editors up into a bucket that is saved in parallel
        // and sequentially. Unless "Save As", all non-untitled editors
        // can be saved in parallel to speed up the operation. Remaining
        // editors are potentially bringing up some UI and thus run
        // sequentially.
        const editorsToSaveParallel = [];
        const editorsToSaveSequentially = [];
        if (options?.saveAs) {
            editorsToSaveSequentially.push(...uniqueEditors);
        }
        else {
            for (const { groupId, editor } of uniqueEditors) {
                if (editor.hasCapability(4 /* EditorInputCapabilities.Untitled */)) {
                    editorsToSaveSequentially.push({ groupId, editor });
                }
                else {
                    editorsToSaveParallel.push({ groupId, editor });
                }
            }
        }
        // Editors to save in parallel
        const saveResults = await Promises.settled(editorsToSaveParallel.map(({ groupId, editor }) => {
            // Use save as a hint to pin the editor if used explicitly
            if (options?.reason === 1 /* SaveReason.EXPLICIT */) {
                this.editorGroupsContainer.getGroup(groupId)?.pinEditor(editor);
            }
            // Save
            return editor.save(groupId, options);
        }));
        // Editors to save sequentially
        for (const { groupId, editor } of editorsToSaveSequentially) {
            if (editor.isDisposed()) {
                continue; // might have been disposed from the save already
            }
            // Preserve view state by opening the editor first if the editor
            // is untitled or we "Save As". This also allows the user to review
            // the contents of the editor before making a decision.
            const editorPane = await this.openEditor(editor, groupId);
            const editorOptions = {
                pinned: true,
                viewState: editorPane?.getViewState()
            };
            const result = options?.saveAs ? await editor.saveAs(groupId, options) : await editor.save(groupId, options);
            saveResults.push(result);
            if (!result) {
                break; // failed or cancelled, abort
            }
            // Replace editor preserving viewstate (either across all groups or
            // only selected group) if the resulting editor is different from the
            // current one.
            if (!editor.matches(result)) {
                const targetGroups = editor.hasCapability(4 /* EditorInputCapabilities.Untitled */) ? this.editorGroupsContainer.groups.map(group => group.id) /* untitled replaces across all groups */ : [groupId];
                for (const targetGroup of targetGroups) {
                    if (result instanceof EditorInput) {
                        await this.replaceEditors([{ editor, replacement: result, options: editorOptions }], targetGroup);
                    }
                    else {
                        await this.replaceEditors([{ editor, replacement: { ...result, options: editorOptions } }], targetGroup);
                    }
                }
            }
        }
        return {
            success: saveResults.every(result => !!result),
            editors: coalesce(saveResults)
        };
    }
    saveAll(options) {
        return this.save(this.getAllModifiedEditors(options), options);
    }
    async revert(editors, options) {
        // Convert to array
        if (!Array.isArray(editors)) {
            editors = [editors];
        }
        // Make sure to not revert the same editor multiple times
        // by using the `matches()` method to find duplicates
        const uniqueEditors = this.getUniqueEditors(editors);
        await Promises.settled(uniqueEditors.map(async ({ groupId, editor }) => {
            // Use revert as a hint to pin the editor
            this.editorGroupsContainer.getGroup(groupId)?.pinEditor(editor);
            return editor.revert(groupId, options);
        }));
        return !uniqueEditors.some(({ editor }) => editor.isDirty());
    }
    async revertAll(options) {
        return this.revert(this.getAllModifiedEditors(options), options);
    }
    getAllModifiedEditors(options) {
        const editors = [];
        for (const group of this.editorGroupsContainer.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */)) {
            for (const editor of group.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)) {
                if (!editor.isModified()) {
                    continue;
                }
                if ((typeof options?.includeUntitled === 'boolean' || !options?.includeUntitled?.includeScratchpad)
                    && editor.hasCapability(512 /* EditorInputCapabilities.Scratchpad */)) {
                    continue;
                }
                if (!options?.includeUntitled && editor.hasCapability(4 /* EditorInputCapabilities.Untitled */)) {
                    continue;
                }
                if (options?.excludeSticky && group.isSticky(editor)) {
                    continue;
                }
                editors.push({ groupId: group.id, editor });
            }
        }
        return editors;
    }
    getUniqueEditors(editors) {
        const uniqueEditors = [];
        for (const { editor, groupId } of editors) {
            if (uniqueEditors.some(uniqueEditor => uniqueEditor.editor.matches(editor))) {
                continue;
            }
            uniqueEditors.push({ editor, groupId });
        }
        return uniqueEditors;
    }
    //#endregion
    dispose() {
        super.dispose();
        // Dispose remaining watchers if any
        this.activeOutOfWorkspaceWatchers.forEach(disposable => dispose(disposable));
        this.activeOutOfWorkspaceWatchers.clear();
    }
};
EditorService = EditorService_1 = __decorate([
    __param(1, IEditorGroupsService),
    __param(2, IInstantiationService),
    __param(3, IFileService),
    __param(4, IConfigurationService),
    __param(5, IWorkspaceContextService),
    __param(6, IUriIdentityService),
    __param(7, IEditorResolverService),
    __param(8, IWorkspaceTrustRequestService),
    __param(9, IHostService),
    __param(10, ITextEditorService)
], EditorService);
export { EditorService };
registerSingleton(IEditorService, new SyncDescriptor(EditorService, [undefined], false));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvYnJvd3Nlci9lZGl0b3JTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVuRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQW9ILHdCQUF3QixFQUFzSSxzQkFBc0IsRUFBK0MseUJBQXlCLEVBQXVCLHFCQUFxQixFQUFFLGFBQWEsRUFBRSxnQ0FBZ0MsRUFBc0IsMEJBQTBCLEVBQXNFLE1BQU0sMkJBQTJCLENBQUM7QUFDOW5CLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxZQUFZLEVBQXFDLGdCQUFnQixFQUFrQixNQUFNLDRDQUE0QyxDQUFDO0FBQy9JLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGdCQUFnQixJQUFJLG9CQUFvQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDN0csT0FBTyxFQUFFLG9CQUFvQixFQUFpRCxtQkFBbUIsRUFBK0MsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6TCxPQUFPLEVBQTZC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