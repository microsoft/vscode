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
var EditorResolverService_1;
import * as glob from '../../../../base/common/glob.js';
import { distinct, insert } from '../../../../base/common/arrays.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { basename, extname, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EditorActivation, EditorResolution } from '../../../../platform/editor/common/editor.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorResourceAccessor, isEditorInputWithOptions, isEditorInputWithOptionsAndGroup, isResourceDiffEditorInput, isResourceSideBySideEditorInput, isUntitledResourceEditorInput, isResourceMergeEditorInput, SideBySideEditor, isResourceMultiDiffEditorInput } from '../../../common/editor.js';
import { IEditorGroupsService } from '../common/editorGroupsService.js';
import { Schemas } from '../../../../base/common/network.js';
import { RegisteredEditorPriority, editorsAssociationsSettingId, globMatchesResource, IEditorResolverService, priorityToRank } from '../common/editorResolverService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { localize } from '../../../../nls.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { findGroup } from '../common/editorGroupFinder.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { PauseableEmitter } from '../../../../base/common/event.js';
let EditorResolverService = class EditorResolverService extends Disposable {
    static { EditorResolverService_1 = this; }
    // Constants
    static { this.configureDefaultID = 'promptOpenWith.configureDefault'; }
    static { this.cacheStorageID = 'editorOverrideService.cache'; }
    static { this.conflictingDefaultsStorageID = 'editorOverrideService.conflictingDefaults'; }
    constructor(editorGroupService, instantiationService, configurationService, quickInputService, notificationService, storageService, extensionService, logService) {
        super();
        this.editorGroupService = editorGroupService;
        this.instantiationService = instantiationService;
        this.configurationService = configurationService;
        this.quickInputService = quickInputService;
        this.notificationService = notificationService;
        this.storageService = storageService;
        this.extensionService = extensionService;
        this.logService = logService;
        // Events
        this._onDidChangeEditorRegistrations = this._register(new PauseableEmitter());
        this.onDidChangeEditorRegistrations = this._onDidChangeEditorRegistrations.event;
        // Data Stores
        this._editors = new Map();
        this._flattenedEditors = new Map();
        this._shouldReFlattenEditors = true;
        // Read in the cache on statup
        this.cache = new Set(JSON.parse(this.storageService.get(EditorResolverService_1.cacheStorageID, 0 /* StorageScope.PROFILE */, JSON.stringify([]))));
        this.storageService.remove(EditorResolverService_1.cacheStorageID, 0 /* StorageScope.PROFILE */);
        this._register(this.storageService.onWillSaveState(() => {
            // We want to store the glob patterns we would activate on, this allows us to know if we need to await the ext host on startup for opening a resource
            this.cacheEditors();
        }));
        // When extensions have registered we no longer need the cache
        this._register(this.extensionService.onDidRegisterExtensions(() => {
            this.cache = undefined;
        }));
    }
    resolveUntypedInputAndGroup(editor, preferredGroup) {
        const untypedEditor = editor;
        // Use the untyped editor to find a group
        const findGroupResult = this.instantiationService.invokeFunction(findGroup, untypedEditor, preferredGroup);
        if (findGroupResult instanceof Promise) {
            return findGroupResult.then(([group, activation]) => [untypedEditor, group, activation]);
        }
        else {
            const [group, activation] = findGroupResult;
            return [untypedEditor, group, activation];
        }
    }
    async resolveEditor(editor, preferredGroup) {
        // Update the flattened editors
        this._flattenedEditors = this._flattenEditorsMap();
        // Special case: side by side editors requires us to
        // independently resolve both sides and then build
        // a side by side editor with the result
        if (isResourceSideBySideEditorInput(editor)) {
            return this.doResolveSideBySideEditor(editor, preferredGroup);
        }
        let resolvedUntypedAndGroup;
        const resolvedUntypedAndGroupResult = this.resolveUntypedInputAndGroup(editor, preferredGroup);
        if (resolvedUntypedAndGroupResult instanceof Promise) {
            resolvedUntypedAndGroup = await resolvedUntypedAndGroupResult;
        }
        else {
            resolvedUntypedAndGroup = resolvedUntypedAndGroupResult;
        }
        if (!resolvedUntypedAndGroup) {
            return 2 /* ResolvedStatus.NONE */;
        }
        // Get the resolved untyped editor, group, and activation
        const [untypedEditor, group, activation] = resolvedUntypedAndGroup;
        if (activation) {
            untypedEditor.options = { ...untypedEditor.options, activation };
        }
        let resource = EditorResourceAccessor.getCanonicalUri(untypedEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
        // If it was resolved before we await for the extensions to activate and then proceed with resolution or else the backing extensions won't be registered
        if (this.cache && resource && this.resourceMatchesCache(resource)) {
            await this.extensionService.whenInstalledExtensionsRegistered();
        }
        // Undefined resource -> untilted. Other malformed URI's are unresolvable
        if (resource === undefined) {
            resource = URI.from({ scheme: Schemas.untitled });
        }
        else if (resource.scheme === undefined || resource === null) {
            return 2 /* ResolvedStatus.NONE */;
        }
        if (untypedEditor.options?.override === EditorResolution.PICK) {
            const picked = await this.doPickEditor(untypedEditor);
            // If the picker was cancelled we will stop resolving the editor
            if (!picked) {
                return 1 /* ResolvedStatus.ABORT */;
            }
            // Populate the options with the new ones
            untypedEditor.options = picked;
        }
        // Resolved the editor ID as much as possible, now find a given editor (cast here is ok because we resolve down to a string above)
        let { editor: selectedEditor, conflictingDefault } = this.getEditor(resource, untypedEditor.options?.override);
        // If no editor was found and this was a typed editor or an editor with an explicit override we could not resolve it
        if (!selectedEditor && (untypedEditor.options?.override || isEditorInputWithOptions(editor))) {
            return 2 /* ResolvedStatus.NONE */;
        }
        else if (!selectedEditor) {
            // Simple untyped editors that we could not resolve will be resolved to the default editor
            const resolvedEditor = this.getEditor(resource, DEFAULT_EDITOR_ASSOCIATION.id);
            selectedEditor = resolvedEditor?.editor;
            conflictingDefault = resolvedEditor?.conflictingDefault;
            if (!selectedEditor) {
                return 2 /* ResolvedStatus.NONE */;
            }
        }
        // In the special case of diff editors we do some more work to determine the correct editor for both sides
        if (isResourceDiffEditorInput(untypedEditor) && untypedEditor.options?.override === undefined) {
            let resource2 = EditorResourceAccessor.getCanonicalUri(untypedEditor, { supportSideBySide: SideBySideEditor.SECONDARY });
            if (!resource2) {
                resource2 = URI.from({ scheme: Schemas.untitled });
            }
            const { editor: selectedEditor2 } = this.getEditor(resource2, undefined);
            if (!selectedEditor2 || selectedEditor.editorInfo.id !== selectedEditor2.editorInfo.id) {
                const { editor: selectedDiff, conflictingDefault: conflictingDefaultDiff } = this.getEditor(resource, DEFAULT_EDITOR_ASSOCIATION.id);
                selectedEditor = selectedDiff;
                conflictingDefault = conflictingDefaultDiff;
            }
            if (!selectedEditor) {
                return 2 /* ResolvedStatus.NONE */;
            }
        }
        // If no override we take the selected editor id so that matches works with the isActive check
        untypedEditor.options = { override: selectedEditor.editorInfo.id, ...untypedEditor.options };
        // Check if diff can be created based on prescene of factory function
        if (selectedEditor.editorFactoryObject.createDiffEditorInput === undefined && isResourceDiffEditorInput(untypedEditor)) {
            return 2 /* ResolvedStatus.NONE */;
        }
        const input = await this.doResolveEditor(untypedEditor, group, selectedEditor);
        if (conflictingDefault && input) {
            // Show the conflicting default dialog
            await this.doHandleConflictingDefaults(resource, selectedEditor.editorInfo.label, untypedEditor, input.editor, group);
        }
        if (input) {
            if (input.editor.editorId !== selectedEditor.editorInfo.id) {
                this.logService.warn(`Editor ID Mismatch: ${input.editor.editorId} !== ${selectedEditor.editorInfo.id}. This will cause bugs. Please ensure editorInput.editorId matches the registered id`);
            }
            return { ...input, group };
        }
        return 1 /* ResolvedStatus.ABORT */;
    }
    async doResolveSideBySideEditor(editor, preferredGroup) {
        const primaryResolvedEditor = await this.resolveEditor(editor.primary, preferredGroup);
        if (!isEditorInputWithOptionsAndGroup(primaryResolvedEditor)) {
            return 2 /* ResolvedStatus.NONE */;
        }
        const secondaryResolvedEditor = await this.resolveEditor(editor.secondary, primaryResolvedEditor.group ?? preferredGroup);
        if (!isEditorInputWithOptionsAndGroup(secondaryResolvedEditor)) {
            return 2 /* ResolvedStatus.NONE */;
        }
        return {
            group: primaryResolvedEditor.group ?? secondaryResolvedEditor.group,
            editor: this.instantiationService.createInstance(SideBySideEditorInput, editor.label, editor.description, secondaryResolvedEditor.editor, primaryResolvedEditor.editor),
            options: editor.options
        };
    }
    bufferChangeEvents(callback) {
        this._onDidChangeEditorRegistrations.pause();
        try {
            callback();
        }
        finally {
            this._onDidChangeEditorRegistrations.resume();
        }
    }
    registerEditor(globPattern, editorInfo, options, editorFactoryObject) {
        let registeredEditor = this._editors.get(globPattern);
        if (registeredEditor === undefined) {
            registeredEditor = new Map();
            this._editors.set(globPattern, registeredEditor);
        }
        let editorsWithId = registeredEditor.get(editorInfo.id);
        if (editorsWithId === undefined) {
            editorsWithId = [];
        }
        const remove = insert(editorsWithId, {
            globPattern,
            editorInfo,
            options,
            editorFactoryObject
        });
        registeredEditor.set(editorInfo.id, editorsWithId);
        this._shouldReFlattenEditors = true;
        this._onDidChangeEditorRegistrations.fire();
        return toDisposable(() => {
            remove();
            if (editorsWithId && editorsWithId.length === 0) {
                registeredEditor?.delete(editorInfo.id);
            }
            this._shouldReFlattenEditors = true;
            this._onDidChangeEditorRegistrations.fire();
        });
    }
    getAssociationsForResource(resource) {
        const associations = this.getAllUserAssociations();
        let matchingAssociations = associations.filter(association => association.filenamePattern && globMatchesResource(association.filenamePattern, resource));
        // Sort matching associations based on glob length as a longer glob will be more specific
        matchingAssociations = matchingAssociations.sort((a, b) => (b.filenamePattern?.length ?? 0) - (a.filenamePattern?.length ?? 0));
        const allEditors = this._registeredEditors;
        // Ensure that the settings are valid editors
        return matchingAssociations.filter(association => allEditors.find(c => c.editorInfo.id === association.viewType));
    }
    getAllUserAssociations() {
        const inspectedEditorAssociations = this.configurationService.inspect(editorsAssociationsSettingId) || {};
        const defaultAssociations = inspectedEditorAssociations.defaultValue ?? {};
        const workspaceAssociations = inspectedEditorAssociations.workspaceValue ?? {};
        const userAssociations = inspectedEditorAssociations.userValue ?? {};
        const rawAssociations = { ...workspaceAssociations };
        // We want to apply the default associations and user associations on top of the workspace associations but ignore duplicate keys.
        for (const [key, value] of Object.entries({ ...defaultAssociations, ...userAssociations })) {
            if (rawAssociations[key] === undefined) {
                rawAssociations[key] = value;
            }
        }
        const associations = [];
        for (const [key, value] of Object.entries(rawAssociations)) {
            const association = {
                filenamePattern: key,
                viewType: value
            };
            associations.push(association);
        }
        return associations;
    }
    /**
     * Given the nested nature of the editors map, we merge factories of the same glob and id to make it flat
     * and easier to work with
     */
    _flattenEditorsMap() {
        // If we shouldn't be re-flattening (due to lack of update) then return early
        if (!this._shouldReFlattenEditors) {
            return this._flattenedEditors;
        }
        this._shouldReFlattenEditors = false;
        const editors = new Map();
        for (const [glob, value] of this._editors) {
            const registeredEditors = [];
            for (const editors of value.values()) {
                let registeredEditor = undefined;
                // Merge all editors with the same id and glob pattern together
                for (const editor of editors) {
                    if (!registeredEditor) {
                        registeredEditor = {
                            editorInfo: editor.editorInfo,
                            globPattern: editor.globPattern,
                            options: {},
                            editorFactoryObject: {}
                        };
                    }
                    // Merge options and factories
                    registeredEditor.options = { ...registeredEditor.options, ...editor.options };
                    registeredEditor.editorFactoryObject = { ...registeredEditor.editorFactoryObject, ...editor.editorFactoryObject };
                }
                if (registeredEditor) {
                    registeredEditors.push(registeredEditor);
                }
            }
            editors.set(glob, registeredEditors);
        }
        return editors;
    }
    /**
     * Returns all editors as an array. Possible to contain duplicates
     */
    get _registeredEditors() {
        return Array.from(this._flattenedEditors.values()).flat();
    }
    updateUserAssociations(globPattern, editorID) {
        const newAssociation = { viewType: editorID, filenamePattern: globPattern };
        const currentAssociations = this.getAllUserAssociations();
        const newSettingObject = Object.create(null);
        // Form the new setting object including the newest associations
        for (const association of [...currentAssociations, newAssociation]) {
            if (association.filenamePattern) {
                newSettingObject[association.filenamePattern] = association.viewType;
            }
        }
        this.configurationService.updateValue(editorsAssociationsSettingId, newSettingObject);
    }
    findMatchingEditors(resource) {
        // The user setting should be respected even if the editor doesn't specify that resource in package.json
        const userSettings = this.getAssociationsForResource(resource);
        const matchingEditors = [];
        // Then all glob patterns
        for (const [key, editors] of this._flattenedEditors) {
            for (const editor of editors) {
                const foundInSettings = userSettings.find(setting => setting.viewType === editor.editorInfo.id);
                if ((foundInSettings && editor.editorInfo.priority !== RegisteredEditorPriority.exclusive) || globMatchesResource(key, resource)) {
                    matchingEditors.push(editor);
                }
            }
        }
        // Return the editors sorted by their priority
        return matchingEditors.sort((a, b) => {
            // Very crude if priorities match longer glob wins as longer globs are normally more specific
            if (priorityToRank(b.editorInfo.priority) === priorityToRank(a.editorInfo.priority) && typeof b.globPattern === 'string' && typeof a.globPattern === 'string') {
                return b.globPattern.length - a.globPattern.length;
            }
            return priorityToRank(b.editorInfo.priority) - priorityToRank(a.editorInfo.priority);
        });
    }
    getEditors(resource) {
        this._flattenedEditors = this._flattenEditorsMap();
        // By resource
        if (URI.isUri(resource)) {
            const editors = this.findMatchingEditors(resource);
            if (editors.find(e => e.editorInfo.priority === RegisteredEditorPriority.exclusive)) {
                return [];
            }
            return editors.map(editor => editor.editorInfo);
        }
        // All
        return distinct(this._registeredEditors.map(editor => editor.editorInfo), editor => editor.id);
    }
    /**
     * Given a resource and an editorId selects the best possible editor
     * @returns The editor and whether there was another default which conflicted with it
     */
    getEditor(resource, editorId) {
        const findMatchingEditor = (editors, viewType) => {
            return editors.find((editor) => {
                if (editor.options?.canSupportResource !== undefined) {
                    return editor.editorInfo.id === viewType && editor.options.canSupportResource(resource);
                }
                return editor.editorInfo.id === viewType;
            });
        };
        if (editorId && editorId !== EditorResolution.EXCLUSIVE_ONLY) {
            // Specific id passed in doesn't have to match the resource, it can be anything
            const registeredEditors = this._registeredEditors;
            return {
                editor: findMatchingEditor(registeredEditors, editorId),
                conflictingDefault: false
            };
        }
        const editors = this.findMatchingEditors(resource);
        const associationsFromSetting = this.getAssociationsForResource(resource);
        // We only want minPriority+ if no user defined setting is found, else we won't resolve an editor
        const minPriority = editorId === EditorResolution.EXCLUSIVE_ONLY ? RegisteredEditorPriority.exclusive : RegisteredEditorPriority.builtin;
        let possibleEditors = editors.filter(editor => priorityToRank(editor.editorInfo.priority) >= priorityToRank(minPriority) && editor.editorInfo.id !== DEFAULT_EDITOR_ASSOCIATION.id);
        if (possibleEditors.length === 0) {
            return {
                editor: associationsFromSetting[0] && minPriority !== RegisteredEditorPriority.exclusive ? findMatchingEditor(editors, associationsFromSetting[0].viewType) : undefined,
                conflictingDefault: false
            };
        }
        // If the editor is exclusive we use that, else use the user setting, else we check canSupportResource, else take the viewtype of first possible editor
        const selectedViewType = possibleEditors[0].editorInfo.priority === RegisteredEditorPriority.exclusive ?
            possibleEditors[0].editorInfo.id :
            associationsFromSetting[0]?.viewType ||
                (possibleEditors.find(editor => (!editor.options?.canSupportResource || editor.options.canSupportResource(resource)))?.editorInfo.id) ||
                possibleEditors[0].editorInfo.id;
        let conflictingDefault = false;
        // Filter out exclusive before we check for conflicts as exclusive editors cannot be manually chosen
        // similar to above, need to check canSupportResource if nothing is exclusive
        possibleEditors = possibleEditors
            .filter(editor => editor.editorInfo.priority !== RegisteredEditorPriority.exclusive)
            .filter(editor => !editor.options?.canSupportResource || editor.options.canSupportResource(resource));
        if (associationsFromSetting.length === 0 && possibleEditors.length > 1) {
            conflictingDefault = true;
        }
        return {
            editor: findMatchingEditor(editors, selectedViewType),
            conflictingDefault
        };
    }
    async doResolveEditor(editor, group, selectedEditor) {
        let options = editor.options;
        const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
        // If no activation option is provided, populate it.
        if (options && typeof options.activation === 'undefined') {
            options = { ...options, activation: options.preserveFocus ? EditorActivation.RESTORE : undefined };
        }
        // If it's a merge editor we trigger the create merge editor input
        if (isResourceMergeEditorInput(editor)) {
            if (!selectedEditor.editorFactoryObject.createMergeEditorInput) {
                return;
            }
            const inputWithOptions = await selectedEditor.editorFactoryObject.createMergeEditorInput(editor, group);
            return { editor: inputWithOptions.editor, options: inputWithOptions.options ?? options };
        }
        // If it's a diff editor we trigger the create diff editor input
        if (isResourceDiffEditorInput(editor)) {
            if (!selectedEditor.editorFactoryObject.createDiffEditorInput) {
                return;
            }
            const inputWithOptions = await selectedEditor.editorFactoryObject.createDiffEditorInput(editor, group);
            return { editor: inputWithOptions.editor, options: inputWithOptions.options ?? options };
        }
        // If it's a diff list editor we trigger the create diff list editor input
        if (isResourceMultiDiffEditorInput(editor)) {
            if (!selectedEditor.editorFactoryObject.createMultiDiffEditorInput) {
                return;
            }
            const inputWithOptions = await selectedEditor.editorFactoryObject.createMultiDiffEditorInput(editor, group);
            return { editor: inputWithOptions.editor, options: inputWithOptions.options ?? options };
        }
        if (isResourceSideBySideEditorInput(editor)) {
            throw new Error(`Untyped side by side editor input not supported here.`);
        }
        if (isUntitledResourceEditorInput(editor)) {
            if (!selectedEditor.editorFactoryObject.createUntitledEditorInput) {
                return;
            }
            const inputWithOptions = await selectedEditor.editorFactoryObject.createUntitledEditorInput(editor, group);
            return { editor: inputWithOptions.editor, options: inputWithOptions.options ?? options };
        }
        // Should no longer have an undefined resource so lets throw an error if that's somehow the case
        if (resource === undefined) {
            throw new Error(`Undefined resource on non untitled editor input.`);
        }
        // If the editor states it can only be opened once per resource we must close all existing ones except one and move the new one into the group
        const singleEditorPerResource = typeof selectedEditor.options?.singlePerResource === 'function' ? selectedEditor.options.singlePerResource() : selectedEditor.options?.singlePerResource;
        if (singleEditorPerResource) {
            const existingEditors = this.findExistingEditorsForResource(resource, selectedEditor.editorInfo.id);
            if (existingEditors.length) {
                const editor = await this.moveExistingEditorForResource(existingEditors, group);
                if (editor) {
                    return { editor, options };
                }
                else {
                    return; // failed to move
                }
            }
        }
        // If no factory is above, return flow back to caller letting them know we could not resolve it
        if (!selectedEditor.editorFactoryObject.createEditorInput) {
            return;
        }
        // Respect options passed back
        const inputWithOptions = await selectedEditor.editorFactoryObject.createEditorInput(editor, group);
        options = inputWithOptions.options ?? options;
        const input = inputWithOptions.editor;
        return { editor: input, options };
    }
    /**
     * Moves the first existing editor for a resource to the target group unless already opened there.
     * Additionally will close any other editors that are open for that resource and viewtype besides the first one found
     * @param resource The resource of the editor
     * @param viewType the viewtype of the editor
     * @param targetGroup The group to move it to
     * @returns The moved editor input or `undefined` if the editor could not be moved
     */
    async moveExistingEditorForResource(existingEditorsForResource, targetGroup) {
        const editorToUse = existingEditorsForResource[0];
        // We should only have one editor but if there are multiple we close the others
        for (const { editor, group } of existingEditorsForResource) {
            if (editor !== editorToUse.editor) {
                const closed = await group.closeEditor(editor);
                if (!closed) {
                    return;
                }
            }
        }
        // Move the editor already opened to the target group
        if (targetGroup.id !== editorToUse.group.id) {
            const moved = editorToUse.group.moveEditor(editorToUse.editor, targetGroup);
            if (!moved) {
                return;
            }
        }
        return editorToUse.editor;
    }
    /**
     * Given a resource and an editorId, returns all editors open for that resource and editorId.
     * @param resource The resource specified
     * @param editorId The editorID
     * @returns A list of editors
     */
    findExistingEditorsForResource(resource, editorId) {
        const out = [];
        const orderedGroups = distinct([
            ...this.editorGroupService.groups,
        ]);
        for (const group of orderedGroups) {
            for (const editor of group.editors) {
                if (isEqual(editor.resource, resource) && editor.editorId === editorId) {
                    out.push({ editor, group });
                }
            }
        }
        return out;
    }
    async doHandleConflictingDefaults(resource, editorName, untypedInput, currentEditor, group) {
        const editors = this.findMatchingEditors(resource);
        const storedChoices = JSON.parse(this.storageService.get(EditorResolverService_1.conflictingDefaultsStorageID, 0 /* StorageScope.PROFILE */, '{}'));
        const globForResource = `*${extname(resource)}`;
        // Writes to the storage service that a choice has been made for the currently installed editors
        const writeCurrentEditorsToStorage = () => {
            storedChoices[globForResource] = [];
            editors.forEach(editor => storedChoices[globForResource].push(editor.editorInfo.id));
            this.storageService.store(EditorResolverService_1.conflictingDefaultsStorageID, JSON.stringify(storedChoices), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        };
        // If the user has already made a choice for this editor we don't want to ask them again
        if (storedChoices[globForResource]?.find(editorID => editorID === currentEditor.editorId)) {
            return;
        }
        const handle = this.notificationService.prompt(Severity.Warning, localize('editorResolver.conflictingDefaults', 'There are multiple default editors available for the resource.'), [{
                label: localize('editorResolver.configureDefault', 'Configure Default'),
                run: async () => {
                    // Show the picker and tell it to update the setting to whatever the user selected
                    const picked = await this.doPickEditor(untypedInput, true);
                    if (!picked) {
                        return;
                    }
                    untypedInput.options = picked;
                    const replacementEditor = await this.resolveEditor(untypedInput, group);
                    if (replacementEditor === 1 /* ResolvedStatus.ABORT */ || replacementEditor === 2 /* ResolvedStatus.NONE */) {
                        return;
                    }
                    // Replace the current editor with the picked one
                    group.replaceEditors([
                        {
                            editor: currentEditor,
                            replacement: replacementEditor.editor,
                            options: replacementEditor.options ?? picked,
                        }
                    ]);
                }
            },
            {
                label: localize('editorResolver.keepDefault', 'Keep {0}', editorName),
                run: writeCurrentEditorsToStorage
            }
        ]);
        // If the user pressed X we assume they want to keep the current editor as default
        const onCloseListener = handle.onDidClose(() => {
            writeCurrentEditorsToStorage();
            onCloseListener.dispose();
        });
    }
    mapEditorsToQuickPickEntry(resource, showDefaultPicker) {
        const currentEditor = this.editorGroupService.activeGroup.findEditors(resource).at(0);
        // If untitled, we want all registered editors
        let registeredEditors = resource.scheme === Schemas.untitled ? this._registeredEditors.filter(e => e.editorInfo.priority !== RegisteredEditorPriority.exclusive) : this.findMatchingEditors(resource);
        // We don't want duplicate Id entries
        registeredEditors = distinct(registeredEditors, c => c.editorInfo.id);
        const defaultSetting = this.getAssociationsForResource(resource)[0]?.viewType;
        // Not the most efficient way to do this, but we want to ensure the text editor is at the top of the quickpick
        registeredEditors = registeredEditors.sort((a, b) => {
            if (a.editorInfo.id === DEFAULT_EDITOR_ASSOCIATION.id) {
                return -1;
            }
            else if (b.editorInfo.id === DEFAULT_EDITOR_ASSOCIATION.id) {
                return 1;
            }
            else {
                return priorityToRank(b.editorInfo.priority) - priorityToRank(a.editorInfo.priority);
            }
        });
        const quickPickEntries = [];
        const currentlyActiveLabel = localize('promptOpenWith.currentlyActive', "Active");
        const currentDefaultLabel = localize('promptOpenWith.currentDefault', "Default");
        const currentDefaultAndActiveLabel = localize('promptOpenWith.currentDefaultAndActive', "Active and Default");
        // Default order = setting -> highest priority -> text
        let defaultViewType = defaultSetting;
        if (!defaultViewType && registeredEditors.length > 2 && registeredEditors[1]?.editorInfo.priority !== RegisteredEditorPriority.option) {
            defaultViewType = registeredEditors[1]?.editorInfo.id;
        }
        if (!defaultViewType) {
            defaultViewType = DEFAULT_EDITOR_ASSOCIATION.id;
        }
        // Map the editors to quickpick entries
        registeredEditors.forEach(editor => {
            const currentViewType = currentEditor?.editorId ?? DEFAULT_EDITOR_ASSOCIATION.id;
            const isActive = currentEditor ? editor.editorInfo.id === currentViewType : false;
            const isDefault = editor.editorInfo.id === defaultViewType;
            const quickPickEntry = {
                id: editor.editorInfo.id,
                label: editor.editorInfo.label,
                description: isActive && isDefault ? currentDefaultAndActiveLabel : isActive ? currentlyActiveLabel : isDefault ? currentDefaultLabel : undefined,
                detail: editor.editorInfo.detail ?? editor.editorInfo.priority,
            };
            quickPickEntries.push(quickPickEntry);
        });
        if (!showDefaultPicker && extname(resource) !== '') {
            const separator = { type: 'separator' };
            quickPickEntries.push(separator);
            const configureDefaultEntry = {
                id: EditorResolverService_1.configureDefaultID,
                label: localize('promptOpenWith.configureDefault', "Configure default editor for '{0}'...", `*${extname(resource)}`),
            };
            quickPickEntries.push(configureDefaultEntry);
        }
        return quickPickEntries;
    }
    async doPickEditor(editor, showDefaultPicker) {
        let resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
        if (resource === undefined) {
            resource = URI.from({ scheme: Schemas.untitled });
        }
        // Get all the editors for the resource as quickpick entries
        const editorPicks = this.mapEditorsToQuickPickEntry(resource, showDefaultPicker);
        // Create the editor picker
        const disposables = new DisposableStore();
        const editorPicker = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
        const placeHolderMessage = showDefaultPicker ?
            localize('promptOpenWith.updateDefaultPlaceHolder', "Select new default editor for '{0}'", `*${extname(resource)}`) :
            localize('promptOpenWith.placeHolder', "Select editor for '{0}'", basename(resource));
        editorPicker.placeholder = placeHolderMessage;
        editorPicker.canAcceptInBackground = true;
        editorPicker.items = editorPicks;
        const firstItem = editorPicker.items.find(item => item.type === 'item');
        if (firstItem) {
            editorPicker.selectedItems = [firstItem];
        }
        // Prompt the user to select an editor
        const picked = await new Promise(resolve => {
            disposables.add(editorPicker.onDidAccept(e => {
                let result = undefined;
                if (editorPicker.selectedItems.length === 1) {
                    result = {
                        item: editorPicker.selectedItems[0],
                        keyMods: editorPicker.keyMods,
                        openInBackground: e.inBackground
                    };
                }
                // If asked to always update the setting then update it even if the gear isn't clicked
                if (resource && showDefaultPicker && result?.item.id) {
                    this.updateUserAssociations(`*${extname(resource)}`, result.item.id);
                }
                resolve(result);
            }));
            disposables.add(editorPicker.onDidHide(() => {
                disposables.dispose();
                resolve(undefined);
            }));
            disposables.add(editorPicker.onDidTriggerItemButton(e => {
                // Trigger opening and close picker
                resolve({ item: e.item, openInBackground: false });
                // Persist setting
                if (resource && e.item?.id) {
                    this.updateUserAssociations(`*${extname(resource)}`, e.item.id);
                }
            }));
            editorPicker.show();
        });
        // Close picker
        editorPicker.dispose();
        // If the user picked an editor, look at how the picker was
        // used (e.g. modifier keys, open in background) and create the
        // options and group to use accordingly
        if (picked) {
            // If the user selected to configure default we trigger this picker again and tell it to show the default picker
            if (picked.item.id === EditorResolverService_1.configureDefaultID) {
                return this.doPickEditor(editor, true);
            }
            // Figure out options
            const targetOptions = {
                ...editor.options,
                override: picked.item.id,
                preserveFocus: picked.openInBackground || editor.options?.preserveFocus,
            };
            return targetOptions;
        }
        return undefined;
    }
    cacheEditors() {
        // Create a set to store glob patterns
        const cacheStorage = new Set();
        // Store just the relative pattern pieces without any path info
        for (const [globPattern, contribPoint] of this._flattenedEditors) {
            const nonOptional = !!contribPoint.find(c => c.editorInfo.priority !== RegisteredEditorPriority.option && c.editorInfo.id !== DEFAULT_EDITOR_ASSOCIATION.id);
            // Don't keep a cache of the optional ones as those wouldn't be opened on start anyways
            if (!nonOptional) {
                continue;
            }
            if (glob.isRelativePattern(globPattern)) {
                cacheStorage.add(`${globPattern.pattern}`);
            }
            else {
                cacheStorage.add(globPattern);
            }
        }
        // Also store the users settings as those would have to activate on startup as well
        const userAssociations = this.getAllUserAssociations();
        for (const association of userAssociations) {
            if (association.filenamePattern) {
                cacheStorage.add(association.filenamePattern);
            }
        }
        this.storageService.store(EditorResolverService_1.cacheStorageID, JSON.stringify(Array.from(cacheStorage)), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
    resourceMatchesCache(resource) {
        if (!this.cache) {
            return false;
        }
        for (const cacheEntry of this.cache) {
            if (globMatchesResource(cacheEntry, resource)) {
                return true;
            }
        }
        return false;
    }
};
EditorResolverService = EditorResolverService_1 = __decorate([
    __param(0, IEditorGroupsService),
    __param(1, IInstantiationService),
    __param(2, IConfigurationService),
    __param(3, IQuickInputService),
    __param(4, INotificationService),
    __param(5, IStorageService),
    __param(6, IExtensionService),
    __param(7, ILogService)
], EditorResolverService);
export { EditorResolverService };
registerSingleton(IEditorResolverService, EditorResolverService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9icm93c2VyL2VkaXRvclJlc29sdmVyU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzlHLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQWtCLE1BQU0sOENBQThDLENBQUM7QUFDbEgsT0FBTyxFQUFFLDBCQUEwQixFQUFFLHNCQUFzQixFQUEwRCx3QkFBd0IsRUFBRSxnQ0FBZ0MsRUFBRSx5QkFBeUIsRUFBRSwrQkFBK0IsRUFBRSw2QkFBNkIsRUFBRSwwQkFBMEIsRUFBdUIsZ0JBQWdCLEVBQUUsOEJBQThCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUVqWixPQUFPLEVBQWdCLG9CQUFvQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDdEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBd0Isd0JBQXdCLEVBQWtFLDRCQUE0QixFQUFFLG1CQUFtQixFQUFFLHNCQUFzQixFQUFFLGNBQWMsRUFBNEQsTUFBTSxvQ0FBb0MsQ0FBQztBQUN6VCxPQUFPLEVBQTJCLGtCQUFrQixFQUF1QyxNQUFNLHNEQUFzRCxDQUFDO0FBQ3hKLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUcsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVuRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQVc3RCxJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUFzQixTQUFRLFVBQVU7O0lBT3BELFlBQVk7YUFDWSx1QkFBa0IsR0FBRyxpQ0FBaUMsQUFBcEMsQ0FBcUM7YUFDdkQsbUJBQWMsR0FBRyw2QkFBNkIsQUFBaEMsQ0FBaUM7YUFDL0MsaUNBQTRCLEdBQUcsMkNBQTJDLEFBQTlDLENBQStDO0lBUW5HLFlBQ3VCLGtCQUF5RCxFQUN4RCxvQkFBNEQsRUFDNUQsb0JBQTRELEVBQy9ELGlCQUFzRCxFQUNwRCxtQkFBMEQsRUFDL0QsY0FBZ0QsRUFDOUMsZ0JBQW9ELEVBQzFELFVBQXdDO1FBRXJELEtBQUssRUFBRSxDQUFDO1FBVCtCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBc0I7UUFDdkMseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUMzQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQzlDLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7UUFDbkMsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFzQjtRQUM5QyxtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFDN0IscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFtQjtRQUN6QyxlQUFVLEdBQVYsVUFBVSxDQUFhO1FBdkJ0RCxTQUFTO1FBQ1Esb0NBQStCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGdCQUFnQixFQUFRLENBQUMsQ0FBQztRQUN2RixtQ0FBOEIsR0FBRyxJQUFJLENBQUMsK0JBQStCLENBQUMsS0FBSyxDQUFDO1FBT3JGLGNBQWM7UUFDTixhQUFRLEdBQXdFLElBQUksR0FBRyxFQUFrRSxDQUFDO1FBQzFKLHNCQUFpQixHQUEyRCxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3RGLDRCQUF1QixHQUFHLElBQUksQ0FBQztRQWN0Qyw4QkFBOEI7UUFDOUIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBUyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLHVCQUFxQixDQUFDLGNBQWMsZ0NBQXdCLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEosSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsdUJBQXFCLENBQUMsY0FBYywrQkFBdUIsQ0FBQztRQUV2RixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRTtZQUN2RCxxSkFBcUo7WUFDckosSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3JCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSiw4REFBOEQ7UUFDOUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsdUJBQXVCLENBQUMsR0FBRyxFQUFFO1lBQ2pFLElBQUksQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDO1FBQ3hCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sMkJBQTJCLENBQUMsTUFBMkIsRUFBRSxjQUEwQztRQUMxRyxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUM7UUFFN0IseUNBQXlDO1FBQ3pDLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLGFBQWEsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUMzRyxJQUFJLGVBQWUsWUFBWSxPQUFPLEVBQUUsQ0FBQztZQUN4QyxPQUFPLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxVQUFVLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxhQUFhLEVBQUUsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDMUYsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxHQUFHLGVBQWUsQ0FBQztZQUM1QyxPQUFPLENBQUMsYUFBYSxFQUFFLEtBQUssRUFBRSxVQUFVLENBQUMsQ0FBQztRQUMzQyxDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxhQUFhLENBQUMsTUFBMkIsRUFBRSxjQUEwQztRQUMxRiwrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBRW5ELG9EQUFvRDtRQUNwRCxrREFBa0Q7UUFDbEQsd0NBQXdDO1FBQ3hDLElBQUksK0JBQStCLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUM3QyxPQUFPLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUVELElBQUksdUJBQXNHLENBQUM7UUFDM0csTUFBTSw2QkFBNkIsR0FBRyxJQUFJLENBQUMsMkJBQTJCLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQy9GLElBQUksNkJBQTZCLFlBQVksT0FBTyxFQUFFLENBQUM7WUFDdEQsdUJBQXVCLEdBQUcsTUFBTSw2QkFBNkIsQ0FBQztRQUMvRCxDQUFDO2FBQU0sQ0FBQztZQUNQLHVCQUF1QixHQUFHLDZCQUE2QixDQUFDO1FBQ3pELENBQUM7UUFFRCxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUM5QixtQ0FBMkI7UUFDNUIsQ0FBQztRQUNELHlEQUF5RDtRQUN6RCxNQUFNLENBQUMsYUFBYSxFQUFFLEtBQUssRUFBRSxVQUFVLENBQUMsR0FBRyx1QkFBdUIsQ0FBQztRQUNuRSxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2hCLGFBQWEsQ0FBQyxPQUFPLEdBQUcsRUFBRSxHQUFHLGFBQWEsQ0FBQyxPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUM7UUFDbEUsQ0FBQztRQUVELElBQUksUUFBUSxHQUFHLHNCQUFzQixDQUFDLGVBQWUsQ0FBQyxhQUFhLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBRXRILHdKQUF3SjtRQUN4SixJQUFJLElBQUksQ0FBQyxLQUFLLElBQUksUUFBUSxJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ25FLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLGlDQUFpQyxFQUFFLENBQUM7UUFDakUsQ0FBQztRQUVELHlFQUF5RTtRQUN6RSxJQUFJLFFBQVEsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUM1QixRQUFRLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNuRCxDQUFDO2FBQU0sSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFLLFNBQVMsSUFBSSxRQUFRLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDL0QsbUNBQTJCO1FBQzVCLENBQUM7UUFFRCxJQUFJLGFBQWEsQ0FBQyxPQUFPLEVBQUUsUUFBUSxLQUFLLGdCQUFnQixDQUFDLElBQUksRUFBRSxDQUFDO1lBQy9ELE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUN0RCxnRUFBZ0U7WUFDaEUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNiLG9DQUE0QjtZQUM3QixDQUFDO1lBQ0QseUNBQXlDO1lBQ3pDLGFBQWEsQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO1FBQ2hDLENBQUM7UUFFRCxrSUFBa0k7UUFDbEksSUFBSSxFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsT0FBTyxFQUFFLFFBQWtFLENBQUMsQ0FBQztRQUN6SyxvSEFBb0g7UUFDcEgsSUFBSSxDQUFDLGNBQWMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsUUFBUSxJQUFJLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUM5RixtQ0FBMkI7UUFDNUIsQ0FBQzthQUFNLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUM1QiwwRkFBMEY7WUFDMUYsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsMEJBQTBCLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDL0UsY0FBYyxHQUFHLGNBQWMsRUFBRSxNQUFNLENBQUM7WUFDeEMsa0JBQWtCLEdBQUcsY0FBYyxFQUFFLGtCQUFrQixDQUFDO1lBQ3hELElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDckIsbUNBQTJCO1lBQzVCLENBQUM7UUFDRixDQUFDO1FBRUQsMEdBQTBHO1FBQzFHLElBQUkseUJBQXlCLENBQUMsYUFBYSxDQUFDLElBQUksYUFBYSxDQUFDLE9BQU8sRUFBRSxRQUFRLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDL0YsSUFBSSxTQUFTLEdBQUcsc0JBQXNCLENBQUMsZUFBZSxDQUFDLGFBQWEsRUFBRSxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDekgsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUNoQixTQUFTLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUNwRCxDQUFDO1lBQ0QsTUFBTSxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN6RSxJQUFJLENBQUMsZUFBZSxJQUFJLGNBQWMsQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLGVBQWUsQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ3hGLE1BQU0sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGtCQUFrQixFQUFFLHNCQUFzQixFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsMEJBQTBCLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3JJLGNBQWMsR0FBRyxZQUFZLENBQUM7Z0JBQzlCLGtCQUFrQixHQUFHLHNCQUFzQixDQUFDO1lBQzdDLENBQUM7WUFDRCxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQ3JCLG1DQUEyQjtZQUM1QixDQUFDO1FBQ0YsQ0FBQztRQUVELDhGQUE4RjtRQUM5RixhQUFhLENBQUMsT0FBTyxHQUFHLEVBQUUsUUFBUSxFQUFFLGNBQWMsQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLEdBQUcsYUFBYSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRTdGLHFFQUFxRTtRQUNyRSxJQUFJLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxxQkFBcUIsS0FBSyxTQUFTLElBQUkseUJBQXlCLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUN4SCxtQ0FBMkI7UUFDNUIsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyxhQUFhLEVBQUUsS0FBSyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQy9FLElBQUksa0JBQWtCLElBQUksS0FBSyxFQUFFLENBQUM7WUFDakMsc0NBQXNDO1lBQ3RDLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixDQUFDLFFBQVEsRUFBRSxjQUFjLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN2SCxDQUFDO1FBRUQsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEtBQUssY0FBYyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDNUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxRQUFRLGNBQWMsQ0FBQyxVQUFVLENBQUMsRUFBRSxzRkFBc0YsQ0FBQyxDQUFDO1lBQzlMLENBQUM7WUFDRCxPQUFPLEVBQUUsR0FBRyxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUM7UUFDNUIsQ0FBQztRQUNELG9DQUE0QjtJQUM3QixDQUFDO0lBRU8sS0FBSyxDQUFDLHlCQUF5QixDQUFDLE1BQXNDLEVBQUUsY0FBMEM7UUFDekgsTUFBTSxxQkFBcUIsR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxjQUFjLENBQUMsQ0FBQztRQUN2RixJQUFJLENBQUMsZ0NBQWdDLENBQUMscUJBQXFCLENBQUMsRUFBRSxDQUFDO1lBQzlELG1DQUEyQjtRQUM1QixDQUFDO1FBQ0QsTUFBTSx1QkFBdUIsR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxxQkFBcUIsQ0FBQyxLQUFLLElBQUksY0FBYyxDQUFDLENBQUM7UUFDMUgsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLHVCQUF1QixDQUFDLEVBQUUsQ0FBQztZQUNoRSxtQ0FBMkI7UUFDNUIsQ0FBQztRQUNELE9BQU87WUFDTixLQUFLLEVBQUUscUJBQXFCLENBQUMsS0FBSyxJQUFJLHVCQUF1QixDQUFDLEtBQUs7WUFDbkUsTUFBTSxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMscUJBQXFCLEVBQUUsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsV0FBVyxFQUFFLHVCQUF1QixDQUFDLE1BQU0sRUFBRSxxQkFBcUIsQ0FBQyxNQUFNLENBQUM7WUFDdkssT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPO1NBQ3ZCLENBQUM7SUFDSCxDQUFDO0lBRUQsa0JBQWtCLENBQUMsUUFBa0I7UUFDcEMsSUFBSSxDQUFDLCtCQUErQixDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzdDLElBQUksQ0FBQztZQUNKLFFBQVEsRUFBRSxDQUFDO1FBQ1osQ0FBQztnQkFBUyxDQUFDO1lBQ1YsSUFBSSxDQUFDLCtCQUErQixDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQy9DLENBQUM7SUFDRixDQUFDO0lBRUQsY0FBYyxDQUNiLFdBQTJDLEVBQzNDLFVBQWdDLEVBQ2hDLE9BQWdDLEVBQ2hDLG1CQUE2QztRQUU3QyxJQUFJLGdCQUFnQixHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3RELElBQUksZ0JBQWdCLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDcEMsZ0JBQWdCLEdBQUcsSUFBSSxHQUFHLEVBQTZCLENBQUM7WUFDeEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDbEQsQ0FBQztRQUVELElBQUksYUFBYSxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDeEQsSUFBSSxhQUFhLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDakMsYUFBYSxHQUFHLEVBQUUsQ0FBQztRQUNwQixDQUFDO1FBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLGFBQWEsRUFBRTtZQUNwQyxXQUFXO1lBQ1gsVUFBVTtZQUNWLE9BQU87WUFDUCxtQkFBbUI7U0FDbkIsQ0FBQyxDQUFDO1FBQ0gsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDbkQsSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQztRQUNwQyxJQUFJLENBQUMsK0JBQStCLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDNUMsT0FBTyxZQUFZLENBQUMsR0FBRyxFQUFFO1lBQ3hCLE1BQU0sRUFBRSxDQUFDO1lBQ1QsSUFBSSxhQUFhLElBQUksYUFBYSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDakQsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN6QyxDQUFDO1lBQ0QsSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQztZQUNwQyxJQUFJLENBQUMsK0JBQStCLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDN0MsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsMEJBQTBCLENBQUMsUUFBYTtRQUN2QyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztRQUNuRCxJQUFJLG9CQUFvQixHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsZUFBZSxJQUFJLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxlQUFlLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUN6Six5RkFBeUY7UUFDekYsb0JBQW9CLEdBQUcsb0JBQW9CLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLE1BQU0sSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEksTUFBTSxVQUFVLEdBQXNCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQztRQUM5RCw2Q0FBNkM7UUFDN0MsT0FBTyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDbkgsQ0FBQztJQUVELHNCQUFzQjtRQUNyQixNQUFNLDJCQUEyQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLENBQXdDLDRCQUE0QixDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2pKLE1BQU0sbUJBQW1CLEdBQUcsMkJBQTJCLENBQUMsWUFBWSxJQUFJLEVBQUUsQ0FBQztRQUMzRSxNQUFNLHFCQUFxQixHQUFHLDJCQUEyQixDQUFDLGNBQWMsSUFBSSxFQUFFLENBQUM7UUFDL0UsTUFBTSxnQkFBZ0IsR0FBRywyQkFBMkIsQ0FBQyxTQUFTLElBQUksRUFBRSxDQUFDO1FBQ3JFLE1BQU0sZUFBZSxHQUEwQyxFQUFFLEdBQUcscUJBQXFCLEVBQUUsQ0FBQztRQUM1RixrSUFBa0k7UUFDbEksS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsRUFBRSxHQUFHLG1CQUFtQixFQUFFLEdBQUcsZ0JBQWdCLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDNUYsSUFBSSxlQUFlLENBQUMsR0FBRyxDQUFDLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ3hDLGVBQWUsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7WUFDOUIsQ0FBQztRQUNGLENBQUM7UUFDRCxNQUFNLFlBQVksR0FBRyxFQUFFLENBQUM7UUFDeEIsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztZQUM1RCxNQUFNLFdBQVcsR0FBc0I7Z0JBQ3RDLGVBQWUsRUFBRSxHQUFHO2dCQUNwQixRQUFRLEVBQUUsS0FBSzthQUNmLENBQUM7WUFDRixZQUFZLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ2hDLENBQUM7UUFDRCxPQUFPLFlBQVksQ0FBQztJQUNyQixDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssa0JBQWtCO1FBQ3pCLDZFQUE2RTtRQUM3RSxJQUFJLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFDbkMsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUM7UUFDL0IsQ0FBQztRQUNELElBQUksQ0FBQyx1QkFBdUIsR0FBRyxLQUFLLENBQUM7UUFDckMsTUFBTSxPQUFPLEdBQUcsSUFBSSxHQUFHLEVBQXFELENBQUM7UUFDN0UsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUMzQyxNQUFNLGlCQUFpQixHQUFzQixFQUFFLENBQUM7WUFDaEQsS0FBSyxNQUFNLE9BQU8sSUFBSSxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQztnQkFDdEMsSUFBSSxnQkFBZ0IsR0FBaUMsU0FBUyxDQUFDO2dCQUMvRCwrREFBK0Q7Z0JBQy9ELEtBQUssTUFBTSxNQUFNLElBQUksT0FBTyxFQUFFLENBQUM7b0JBQzlCLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO3dCQUN2QixnQkFBZ0IsR0FBRzs0QkFDbEIsVUFBVSxFQUFFLE1BQU0sQ0FBQyxVQUFVOzRCQUM3QixXQUFXLEVBQUUsTUFBTSxDQUFDLFdBQVc7NEJBQy9CLE9BQU8sRUFBRSxFQUFFOzRCQUNYLG1CQUFtQixFQUFFLEVBQUU7eUJBQ3ZCLENBQUM7b0JBQ0gsQ0FBQztvQkFDRCw4QkFBOEI7b0JBQzlCLGdCQUFnQixDQUFDLE9BQU8sR0FBRyxFQUFFLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEdBQUcsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUM5RSxnQkFBZ0IsQ0FBQyxtQkFBbUIsR0FBRyxFQUFFLEdBQUcsZ0JBQWdCLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxNQUFNLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztnQkFDbkgsQ0FBQztnQkFDRCxJQUFJLGdCQUFnQixFQUFFLENBQUM7b0JBQ3RCLGlCQUFpQixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUMxQyxDQUFDO1lBQ0YsQ0FBQztZQUNELE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDdEMsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7SUFFRDs7T0FFRztJQUNILElBQVksa0JBQWtCO1FBQzdCLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUMzRCxDQUFDO0lBRUQsc0JBQXNCLENBQUMsV0FBbUIsRUFBRSxRQUFnQjtRQUMzRCxNQUFNLGNBQWMsR0FBc0IsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsQ0FBQztRQUMvRixNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBQzFELE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM3QyxnRUFBZ0U7UUFDaEUsS0FBSyxNQUFNLFdBQVcsSUFBSSxDQUFDLEdBQUcsbUJBQW1CLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUNwRSxJQUFJLFdBQVcsQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDakMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxRQUFRLENBQUM7WUFDdEUsQ0FBQztRQUNGLENBQUM7UUFDRCxJQUFJLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLDRCQUE0QixFQUFFLGdCQUFnQixDQUFDLENBQUM7SUFDdkYsQ0FBQztJQUVPLG1CQUFtQixDQUFDLFFBQWE7UUFDeEMsd0dBQXdHO1FBQ3hHLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMvRCxNQUFNLGVBQWUsR0FBdUIsRUFBRSxDQUFDO1FBQy9DLHlCQUF5QjtRQUN6QixLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLElBQUksSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDckQsS0FBSyxNQUFNLE1BQU0sSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDOUIsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEtBQUssTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDaEcsSUFBSSxDQUFDLGVBQWUsSUFBSSxNQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsS0FBSyx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsSUFBSSxtQkFBbUIsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FBQztvQkFDbEksZUFBZSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDOUIsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQ0QsOENBQThDO1FBQzlDLE9BQU8sZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNwQyw2RkFBNkY7WUFDN0YsSUFBSSxjQUFjLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsS0FBSyxjQUFjLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxPQUFPLENBQUMsQ0FBQyxXQUFXLEtBQUssUUFBUSxJQUFJLE9BQU8sQ0FBQyxDQUFDLFdBQVcsS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDL0osT0FBTyxDQUFDLENBQUMsV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQztZQUNwRCxDQUFDO1lBQ0QsT0FBTyxjQUFjLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsR0FBRyxjQUFjLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN0RixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTSxVQUFVLENBQUMsUUFBYztRQUMvQixJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFFbkQsY0FBYztRQUNkLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ3pCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNuRCxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFFBQVEsS0FBSyx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO2dCQUNyRixPQUFPLEVBQUUsQ0FBQztZQUNYLENBQUM7WUFDRCxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDakQsQ0FBQztRQUVELE1BQU07UUFDTixPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2hHLENBQUM7SUFFRDs7O09BR0c7SUFDSyxTQUFTLENBQUMsUUFBYSxFQUFFLFFBQThEO1FBRTlGLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxPQUEwQixFQUFFLFFBQWdCLEVBQUUsRUFBRTtZQUMzRSxPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtnQkFDOUIsSUFBSSxNQUFNLENBQUMsT0FBTyxFQUFFLGtCQUFrQixLQUFLLFNBQVMsRUFBRSxDQUFDO29CQUN0RCxPQUFPLE1BQU0sQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLFFBQVEsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN6RixDQUFDO2dCQUNELE9BQU8sTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssUUFBUSxDQUFDO1lBQzFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDO1FBRUYsSUFBSSxRQUFRLElBQUksUUFBUSxLQUFLLGdCQUFnQixDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQzlELCtFQUErRTtZQUMvRSxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQztZQUNsRCxPQUFPO2dCQUNOLE1BQU0sRUFBRSxrQkFBa0IsQ0FBQyxpQkFBaUIsRUFBRSxRQUFRLENBQUM7Z0JBQ3ZELGtCQUFrQixFQUFFLEtBQUs7YUFDekIsQ0FBQztRQUNILENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFbkQsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDMUUsaUdBQWlHO1FBQ2pHLE1BQU0sV0FBVyxHQUFHLFFBQVEsS0FBSyxnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsd0JBQXdCLENBQUMsT0FBTyxDQUFDO1FBQ3pJLElBQUksZUFBZSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxjQUFjLENBQUMsV0FBVyxDQUFDLElBQUksTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssMEJBQTBCLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDcEwsSUFBSSxlQUFlLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2xDLE9BQU87Z0JBQ04sTUFBTSxFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxJQUFJLFdBQVcsS0FBSyx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLE9BQU8sRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztnQkFDdkssa0JBQWtCLEVBQUUsS0FBSzthQUN6QixDQUFDO1FBQ0gsQ0FBQztRQUNELHVKQUF1SjtRQUN2SixNQUFNLGdCQUFnQixHQUFHLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsUUFBUSxLQUFLLHdCQUF3QixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3ZHLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbEMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEVBQUUsUUFBUTtnQkFDcEMsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsa0JBQWtCLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLEVBQUUsQ0FBQztnQkFDckksZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFFbEMsSUFBSSxrQkFBa0IsR0FBRyxLQUFLLENBQUM7UUFFL0Isb0dBQW9HO1FBQ3BHLDZFQUE2RTtRQUM3RSxlQUFlLEdBQUcsZUFBZTthQUMvQixNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsS0FBSyx3QkFBd0IsQ0FBQyxTQUFTLENBQUM7YUFDbkYsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLGtCQUFrQixJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUN2RyxJQUFJLHVCQUF1QixDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksZUFBZSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN4RSxrQkFBa0IsR0FBRyxJQUFJLENBQUM7UUFDM0IsQ0FBQztRQUVELE9BQU87WUFDTixNQUFNLEVBQUUsa0JBQWtCLENBQUMsT0FBTyxFQUFFLGdCQUFnQixDQUFDO1lBQ3JELGtCQUFrQjtTQUNsQixDQUFDO0lBQ0gsQ0FBQztJQUVPLEtBQUssQ0FBQyxlQUFlLENBQUMsTUFBMkIsRUFBRSxLQUFtQixFQUFFLGNBQWdDO1FBQy9HLElBQUksT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFDN0IsTUFBTSxRQUFRLEdBQUcsc0JBQXNCLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDakgsb0RBQW9EO1FBQ3BELElBQUksT0FBTyxJQUFJLE9BQU8sT0FBTyxDQUFDLFVBQVUsS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUMxRCxPQUFPLEdBQUcsRUFBRSxHQUFHLE9BQU8sRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNwRyxDQUFDO1FBRUQsa0VBQWtFO1FBQ2xFLElBQUksMEJBQTBCLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUN4QyxJQUFJLENBQUMsY0FBYyxDQUFDLG1CQUFtQixDQUFDLHNCQUFzQixFQUFFLENBQUM7Z0JBQ2hFLE9BQU87WUFDUixDQUFDO1lBQ0QsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDeEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixDQUFDLE9BQU8sSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUMxRixDQUFDO1FBRUQsZ0VBQWdFO1FBQ2hFLElBQUkseUJBQXlCLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUN2QyxJQUFJLENBQUMsY0FBYyxDQUFDLG1CQUFtQixDQUFDLHFCQUFxQixFQUFFLENBQUM7Z0JBQy9ELE9BQU87WUFDUixDQUFDO1lBQ0QsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdkcsT0FBTyxFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixDQUFDLE9BQU8sSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUMxRixDQUFDO1FBRUQsMEVBQTBFO1FBQzFFLElBQUksOEJBQThCLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUM1QyxJQUFJLENBQUMsY0FBYyxDQUFDLG1CQUFtQixDQUFDLDBCQUEwQixFQUFFLENBQUM7Z0JBQ3BFLE9BQU87WUFDUixDQUFDO1lBQ0QsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQywwQkFBMEIsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDNUcsT0FBTyxFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixDQUFDLE9BQU8sSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUMxRixDQUFDO1FBRUQsSUFBSSwrQkFBK0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQzdDLE1BQU0sSUFBSSxLQUFLLENBQUMsdURBQXVELENBQUMsQ0FBQztRQUMxRSxDQUFDO1FBRUQsSUFBSSw2QkFBNkIsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQzNDLElBQUksQ0FBQyxjQUFjLENBQUMsbUJBQW1CLENBQUMseUJBQXlCLEVBQUUsQ0FBQztnQkFDbkUsT0FBTztZQUNSLENBQUM7WUFDRCxNQUFNLGdCQUFnQixHQUFHLE1BQU0sY0FBYyxDQUFDLG1CQUFtQixDQUFDLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMzRyxPQUFPLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLENBQUMsT0FBTyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzFGLENBQUM7UUFFRCxnR0FBZ0c7UUFDaEcsSUFBSSxRQUFRLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDNUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxrREFBa0QsQ0FBQyxDQUFDO1FBQ3JFLENBQUM7UUFFRCw4SUFBOEk7UUFDOUksTUFBTSx1QkFBdUIsR0FBRyxPQUFPLGNBQWMsQ0FBQyxPQUFPLEVBQUUsaUJBQWlCLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsaUJBQWlCLENBQUM7UUFDekwsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO1lBQzdCLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxRQUFRLEVBQUUsY0FBYyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNwRyxJQUFJLGVBQWUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDNUIsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsNkJBQTZCLENBQUMsZUFBZSxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNoRixJQUFJLE1BQU0sRUFBRSxDQUFDO29CQUNaLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUM7Z0JBQzVCLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxPQUFPLENBQUMsaUJBQWlCO2dCQUMxQixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCwrRkFBK0Y7UUFDL0YsSUFBSSxDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzNELE9BQU87UUFDUixDQUFDO1FBRUQsOEJBQThCO1FBQzlCLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxjQUFjLENBQUMsbUJBQW1CLENBQUMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25HLE9BQU8sR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLElBQUksT0FBTyxDQUFDO1FBQzlDLE1BQU0sS0FBSyxHQUFHLGdCQUFnQixDQUFDLE1BQU0sQ0FBQztRQUV0QyxPQUFPLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNLLEtBQUssQ0FBQyw2QkFBNkIsQ0FDMUMsMEJBQStFLEVBQy9FLFdBQXlCO1FBRXpCLE1BQU0sV0FBVyxHQUFHLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWxELCtFQUErRTtRQUMvRSxLQUFLLE1BQU0sRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksMEJBQTBCLEVBQUUsQ0FBQztZQUM1RCxJQUFJLE1BQU0sS0FBSyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ25DLE1BQU0sTUFBTSxHQUFHLE1BQU0sS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDL0MsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUNiLE9BQU87Z0JBQ1IsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQscURBQXFEO1FBQ3JELElBQUksV0FBVyxDQUFDLEVBQUUsS0FBSyxXQUFXLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzdDLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDNUUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNaLE9BQU87WUFDUixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sV0FBVyxDQUFDLE1BQU0sQ0FBQztJQUMzQixDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSyw4QkFBOEIsQ0FDckMsUUFBYSxFQUNiLFFBQWdCO1FBRWhCLE1BQU0sR0FBRyxHQUF3RCxFQUFFLENBQUM7UUFDcEUsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDO1lBQzlCLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU07U0FDakMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxNQUFNLEtBQUssSUFBSSxhQUFhLEVBQUUsQ0FBQztZQUNuQyxLQUFLLE1BQU0sTUFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDcEMsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsSUFBSSxNQUFNLENBQUMsUUFBUSxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUN4RSxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7Z0JBQzdCLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sR0FBRyxDQUFDO0lBQ1osQ0FBQztJQUVPLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxRQUFhLEVBQUUsVUFBa0IsRUFBRSxZQUFpQyxFQUFFLGFBQTBCLEVBQUUsS0FBbUI7UUFJOUosTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ25ELE1BQU0sYUFBYSxHQUFpQixJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLHVCQUFxQixDQUFDLDRCQUE0QixnQ0FBd0IsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN4SixNQUFNLGVBQWUsR0FBRyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1FBQ2hELGdHQUFnRztRQUNoRyxNQUFNLDRCQUE0QixHQUFHLEdBQUcsRUFBRTtZQUN6QyxhQUFhLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3BDLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyRixJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyx1QkFBcUIsQ0FBQyw0QkFBNEIsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyw4REFBOEMsQ0FBQztRQUMzSixDQUFDLENBQUM7UUFFRix3RkFBd0Y7UUFDeEYsSUFBSSxhQUFhLENBQUMsZUFBZSxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsUUFBUSxLQUFLLGFBQWEsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQzNGLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUM5RCxRQUFRLENBQUMsb0NBQW9DLEVBQUUsZ0VBQWdFLENBQUMsRUFDaEgsQ0FBQztnQkFDQSxLQUFLLEVBQUUsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLG1CQUFtQixDQUFDO2dCQUN2RSxHQUFHLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQ2Ysa0ZBQWtGO29CQUNsRixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUMzRCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7d0JBQ2IsT0FBTztvQkFDUixDQUFDO29CQUNELFlBQVksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO29CQUM5QixNQUFNLGlCQUFpQixHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQ3hFLElBQUksaUJBQWlCLGlDQUF5QixJQUFJLGlCQUFpQixnQ0FBd0IsRUFBRSxDQUFDO3dCQUM3RixPQUFPO29CQUNSLENBQUM7b0JBQ0QsaURBQWlEO29CQUNqRCxLQUFLLENBQUMsY0FBYyxDQUFDO3dCQUNwQjs0QkFDQyxNQUFNLEVBQUUsYUFBYTs0QkFDckIsV0FBVyxFQUFFLGlCQUFpQixDQUFDLE1BQU07NEJBQ3JDLE9BQU8sRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLElBQUksTUFBTTt5QkFDNUM7cUJBQ0QsQ0FBQyxDQUFDO2dCQUNKLENBQUM7YUFDRDtZQUNEO2dCQUNDLEtBQUssRUFBRSxRQUFRLENBQUMsNEJBQTRCLEVBQUUsVUFBVSxFQUFFLFVBQVUsQ0FBQztnQkFDckUsR0FBRyxFQUFFLDRCQUE0QjthQUNqQztTQUNBLENBQUMsQ0FBQztRQUNKLGtGQUFrRjtRQUNsRixNQUFNLGVBQWUsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRTtZQUM5Qyw0QkFBNEIsRUFBRSxDQUFDO1lBQy9CLGVBQWUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUMzQixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTywwQkFBMEIsQ0FBQyxRQUFhLEVBQUUsaUJBQTJCO1FBQzVFLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0Riw4Q0FBOEM7UUFDOUMsSUFBSSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFFBQVEsS0FBSyx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3RNLHFDQUFxQztRQUNyQyxpQkFBaUIsR0FBRyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUM7UUFDOUUsOEdBQThHO1FBQzlHLGlCQUFpQixHQUFHLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNuRCxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLDBCQUEwQixDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUN2RCxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ1gsQ0FBQztpQkFBTSxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLDBCQUEwQixDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUM5RCxPQUFPLENBQUMsQ0FBQztZQUNWLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLGNBQWMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3RGLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sZ0JBQWdCLEdBQXlCLEVBQUUsQ0FBQztRQUNsRCxNQUFNLG9CQUFvQixHQUFHLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNsRixNQUFNLG1CQUFtQixHQUFHLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNqRixNQUFNLDRCQUE0QixHQUFHLFFBQVEsQ0FBQyx3Q0FBd0MsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQzlHLHNEQUFzRDtRQUN0RCxJQUFJLGVBQWUsR0FBRyxjQUFjLENBQUM7UUFDckMsSUFBSSxDQUFDLGVBQWUsSUFBSSxpQkFBaUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxRQUFRLEtBQUssd0JBQXdCLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDdkksZUFBZSxHQUFHLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDdkQsQ0FBQztRQUNELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN0QixlQUFlLEdBQUcsMEJBQTBCLENBQUMsRUFBRSxDQUFDO1FBQ2pELENBQUM7UUFDRCx1Q0FBdUM7UUFDdkMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ2xDLE1BQU0sZUFBZSxHQUFHLGFBQWEsRUFBRSxRQUFRLElBQUksMEJBQTBCLENBQUMsRUFBRSxDQUFDO1lBQ2pGLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssZUFBZSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7WUFDbEYsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssZUFBZSxDQUFDO1lBQzNELE1BQU0sY0FBYyxHQUFtQjtnQkFDdEMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxVQUFVLENBQUMsRUFBRTtnQkFDeEIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxVQUFVLENBQUMsS0FBSztnQkFDOUIsV0FBVyxFQUFFLFFBQVEsSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLDRCQUE0QixDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxTQUFTO2dCQUNqSixNQUFNLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRO2FBQzlELENBQUM7WUFDRixnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDdkMsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsaUJBQWlCLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDO1lBQ3BELE1BQU0sU0FBUyxHQUF3QixFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsQ0FBQztZQUM3RCxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDakMsTUFBTSxxQkFBcUIsR0FBRztnQkFDN0IsRUFBRSxFQUFFLHVCQUFxQixDQUFDLGtCQUFrQjtnQkFDNUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSx1Q0FBdUMsRUFBRSxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO2FBQ3BILENBQUM7WUFDRixnQkFBZ0IsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBQ0QsT0FBTyxnQkFBZ0IsQ0FBQztJQUN6QixDQUFDO0lBRU8sS0FBSyxDQUFDLFlBQVksQ0FBQyxNQUEyQixFQUFFLGlCQUEyQjtRQVFsRixJQUFJLFFBQVEsR0FBRyxzQkFBc0IsQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLEVBQUUsaUJBQWlCLEVBQUUsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUU5RyxJQUFJLFFBQVEsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUM1QixRQUFRLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNuRCxDQUFDO1FBRUQsNERBQTREO1FBQzVELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUVqRiwyQkFBMkI7UUFDM0IsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUMxQyxNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlLENBQWlCLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0SCxNQUFNLGtCQUFrQixHQUFHLGlCQUFpQixDQUFDLENBQUM7WUFDN0MsUUFBUSxDQUFDLHlDQUF5QyxFQUFFLHFDQUFxQyxFQUFFLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JILFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSx5QkFBeUIsRUFBRSxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUN2RixZQUFZLENBQUMsV0FBVyxHQUFHLGtCQUFrQixDQUFDO1FBQzlDLFlBQVksQ0FBQyxxQkFBcUIsR0FBRyxJQUFJLENBQUM7UUFDMUMsWUFBWSxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUM7UUFDakMsTUFBTSxTQUFTLEdBQUcsWUFBWSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBK0IsQ0FBQztRQUN0RyxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2YsWUFBWSxDQUFDLGFBQWEsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzFDLENBQUM7UUFFRCxzQ0FBc0M7UUFDdEMsTUFBTSxNQUFNLEdBQTJCLE1BQU0sSUFBSSxPQUFPLENBQXlCLE9BQU8sQ0FBQyxFQUFFO1lBQzFGLFdBQVcsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDNUMsSUFBSSxNQUFNLEdBQTJCLFNBQVMsQ0FBQztnQkFFL0MsSUFBSSxZQUFZLENBQUMsYUFBYSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDN0MsTUFBTSxHQUFHO3dCQUNSLElBQUksRUFBRSxZQUFZLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQzt3QkFDbkMsT0FBTyxFQUFFLFlBQVksQ0FBQyxPQUFPO3dCQUM3QixnQkFBZ0IsRUFBRSxDQUFDLENBQUMsWUFBWTtxQkFDaEMsQ0FBQztnQkFDSCxDQUFDO2dCQUVELHNGQUFzRjtnQkFDdEYsSUFBSSxRQUFRLElBQUksaUJBQWlCLElBQUksTUFBTSxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztvQkFDdEQsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUUsQ0FBQztnQkFDdkUsQ0FBQztnQkFFRCxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakIsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVKLFdBQVcsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUU7Z0JBQzNDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDdEIsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3BCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFSixXQUFXLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFFdkQsbUNBQW1DO2dCQUNuQyxPQUFPLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUVuRCxrQkFBa0I7Z0JBQ2xCLElBQUksUUFBUSxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUM7b0JBQzVCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFFLENBQUM7Z0JBQ2xFLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRUosWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3JCLENBQUMsQ0FBQyxDQUFDO1FBRUgsZUFBZTtRQUNmLFlBQVksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUV2QiwyREFBMkQ7UUFDM0QsK0RBQStEO1FBQy9ELHVDQUF1QztRQUN2QyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBRVosZ0hBQWdIO1lBQ2hILElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssdUJBQXFCLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztnQkFDakUsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN4QyxDQUFDO1lBRUQscUJBQXFCO1lBQ3JCLE1BQU0sYUFBYSxHQUFtQjtnQkFDckMsR0FBRyxNQUFNLENBQUMsT0FBTztnQkFDakIsUUFBUSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDeEIsYUFBYSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsSUFBSSxNQUFNLENBQUMsT0FBTyxFQUFFLGFBQWE7YUFDdkUsQ0FBQztZQUVGLE9BQU8sYUFBYSxDQUFDO1FBQ3RCLENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRU8sWUFBWTtRQUNuQixzQ0FBc0M7UUFDdEMsTUFBTSxZQUFZLEdBQWdCLElBQUksR0FBRyxFQUFVLENBQUM7UUFFcEQsK0RBQStEO1FBQy9ELEtBQUssTUFBTSxDQUFDLFdBQVcsRUFBRSxZQUFZLENBQUMsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUNsRSxNQUFNLFdBQVcsR0FBRyxDQUFDLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsUUFBUSxLQUFLLHdCQUF3QixDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSywwQkFBMEIsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM3Six1RkFBdUY7WUFDdkYsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNsQixTQUFTO1lBQ1YsQ0FBQztZQUNELElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3pDLFlBQVksQ0FBQyxHQUFHLENBQUMsR0FBRyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUM1QyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsWUFBWSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUMvQixDQUFDO1FBQ0YsQ0FBQztRQUVELG1GQUFtRjtRQUNuRixNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBQ3ZELEtBQUssTUFBTSxXQUFXLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztZQUM1QyxJQUFJLFdBQVcsQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDakMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDL0MsQ0FBQztRQUNGLENBQUM7UUFDRCxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyx1QkFBcUIsQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLDhEQUE4QyxDQUFDO0lBQ3hKLENBQUM7SUFFTyxvQkFBb0IsQ0FBQyxRQUFhO1FBQ3pDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDakIsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsS0FBSyxNQUFNLFVBQVUsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDckMsSUFBSSxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FBQztnQkFDL0MsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQzs7QUEveEJXLHFCQUFxQjtJQW1CL0IsV0FBQSxvQkFBb0IsQ0FBQTtJQUNwQixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLG9CQUFvQixDQUFBO0lBQ3BCLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLFdBQVcsQ0FBQTtHQTFCRCxxQkFBcUIsQ0FneUJqQzs7QUFFRCxpQkFBaUIsQ0FBQyxzQkFBc0IsRUFBRSxxQkFBcUIsa0NBQTBCLENBQUMifQ==