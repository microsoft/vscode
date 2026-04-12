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
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMarkerService } from '../../../../platform/markers/common/markers.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
let EditorAutoSave = class EditorAutoSave extends Disposable {
    static { this.ID = 'workbench.contrib.editorAutoSave'; }
    constructor(filesConfigurationService, hostService, editorService, editorGroupService, workingCopyService, logService, markerService, uriIdentityService) {
        super();
        this.filesConfigurationService = filesConfigurationService;
        this.hostService = hostService;
        this.editorService = editorService;
        this.editorGroupService = editorGroupService;
        this.workingCopyService = workingCopyService;
        this.logService = logService;
        this.markerService = markerService;
        this.uriIdentityService = uriIdentityService;
        // Auto save: after delay
        this.scheduledAutoSavesAfterDelay = new Map();
        // Auto save: focus change & window change
        this.lastActiveEditor = undefined;
        this.lastActiveGroupId = undefined;
        this.lastActiveEditorControlDisposable = this._register(new DisposableStore());
        // Auto save: waiting on specific condition
        this.waitingOnConditionAutoSaveWorkingCopies = new ResourceMap(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
        this.waitingOnConditionAutoSaveEditors = new ResourceMap(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
        // Fill in initial dirty working copies
        for (const dirtyWorkingCopy of this.workingCopyService.dirtyWorkingCopies) {
            this.onDidRegister(dirtyWorkingCopy);
        }
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.hostService.onDidChangeFocus(focused => this.onWindowFocusChange(focused)));
        this._register(this.hostService.onDidChangeActiveWindow(() => this.onActiveWindowChange()));
        this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));
        this._register(this.filesConfigurationService.onDidChangeAutoSaveConfiguration(() => this.onDidChangeAutoSaveConfiguration()));
        // Working Copy events
        this._register(this.workingCopyService.onDidRegister(workingCopy => this.onDidRegister(workingCopy)));
        this._register(this.workingCopyService.onDidUnregister(workingCopy => this.onDidUnregister(workingCopy)));
        this._register(this.workingCopyService.onDidChangeDirty(workingCopy => this.onDidChangeDirty(workingCopy)));
        this._register(this.workingCopyService.onDidChangeContent(workingCopy => this.onDidChangeContent(workingCopy)));
        // Condition changes
        this._register(this.markerService.onMarkerChanged(e => this.onConditionChanged(e, 3 /* AutoSaveDisabledReason.ERRORS */)));
        this._register(this.filesConfigurationService.onDidChangeAutoSaveDisabled(resource => this.onConditionChanged([resource], 4 /* AutoSaveDisabledReason.DISABLED */)));
    }
    onConditionChanged(resources, condition) {
        for (const resource of resources) {
            // Waiting working copies
            const workingCopyResult = this.waitingOnConditionAutoSaveWorkingCopies.get(resource);
            if (workingCopyResult?.condition === condition) {
                if (workingCopyResult.workingCopy.isDirty() &&
                    this.filesConfigurationService.getAutoSaveMode(workingCopyResult.workingCopy.resource, workingCopyResult.reason).mode !== 0 /* AutoSaveMode.OFF */) {
                    this.discardAutoSave(workingCopyResult.workingCopy);
                    this.logService.trace(`[editor auto save] running auto save from condition change event`, workingCopyResult.workingCopy.resource.toString(), workingCopyResult.workingCopy.typeId);
                    workingCopyResult.workingCopy.save({ reason: workingCopyResult.reason });
                }
            }
            // Waiting editors
            else {
                const editorResult = this.waitingOnConditionAutoSaveEditors.get(resource);
                if (editorResult?.condition === condition &&
                    !editorResult.editor.editor.isDisposed() &&
                    editorResult.editor.editor.isDirty() &&
                    this.filesConfigurationService.getAutoSaveMode(editorResult.editor.editor, editorResult.reason).mode !== 0 /* AutoSaveMode.OFF */) {
                    this.waitingOnConditionAutoSaveEditors.delete(resource);
                    this.logService.trace(`[editor auto save] running auto save from condition change event with reason ${editorResult.reason}`);
                    this.editorService.save(editorResult.editor, { reason: editorResult.reason });
                }
            }
        }
    }
    onWindowFocusChange(focused) {
        if (!focused) {
            this.maybeTriggerAutoSave(4 /* SaveReason.WINDOW_CHANGE */);
        }
    }
    onActiveWindowChange() {
        this.maybeTriggerAutoSave(4 /* SaveReason.WINDOW_CHANGE */);
    }
    onDidActiveEditorChange() {
        // Treat editor change like a focus change for our last active editor if any
        if (this.lastActiveEditor && typeof this.lastActiveGroupId === 'number') {
            this.maybeTriggerAutoSave(3 /* SaveReason.FOCUS_CHANGE */, { groupId: this.lastActiveGroupId, editor: this.lastActiveEditor });
        }
        // Remember as last active
        const activeGroup = this.editorGroupService.activeGroup;
        const activeEditor = this.lastActiveEditor = activeGroup.activeEditor ?? undefined;
        this.lastActiveGroupId = activeGroup.id;
        // Dispose previous active control listeners
        this.lastActiveEditorControlDisposable.clear();
        // Listen to focus changes on control for auto save
        const activeEditorPane = this.editorService.activeEditorPane;
        if (activeEditor && activeEditorPane) {
            this.lastActiveEditorControlDisposable.add(activeEditorPane.onDidBlur(() => {
                this.maybeTriggerAutoSave(3 /* SaveReason.FOCUS_CHANGE */, { groupId: activeGroup.id, editor: activeEditor });
            }));
        }
    }
    maybeTriggerAutoSave(reason, editorIdentifier) {
        if (editorIdentifier) {
            if (!editorIdentifier.editor.isDirty() ||
                editorIdentifier.editor.isReadonly() ||
                editorIdentifier.editor.hasCapability(4 /* EditorInputCapabilities.Untitled */)) {
                return; // no auto save for non-dirty, readonly or untitled editors
            }
            const autoSaveMode = this.filesConfigurationService.getAutoSaveMode(editorIdentifier.editor, reason);
            if (autoSaveMode.mode !== 0 /* AutoSaveMode.OFF */) {
                // Determine if we need to save all. In case of a window focus change we also save if
                // auto save mode is configured to be ON_FOCUS_CHANGE (editor focus change)
                if ((reason === 4 /* SaveReason.WINDOW_CHANGE */ && (autoSaveMode.mode === 3 /* AutoSaveMode.ON_FOCUS_CHANGE */ || autoSaveMode.mode === 4 /* AutoSaveMode.ON_WINDOW_CHANGE */)) ||
                    (reason === 3 /* SaveReason.FOCUS_CHANGE */ && autoSaveMode.mode === 3 /* AutoSaveMode.ON_FOCUS_CHANGE */)) {
                    this.logService.trace(`[editor auto save] triggering auto save with reason ${reason}`);
                    this.editorService.save(editorIdentifier, { reason });
                }
            }
            else if (editorIdentifier.editor.resource && (autoSaveMode.reason === 3 /* AutoSaveDisabledReason.ERRORS */ || autoSaveMode.reason === 4 /* AutoSaveDisabledReason.DISABLED */)) {
                this.waitingOnConditionAutoSaveEditors.set(editorIdentifier.editor.resource, { editor: editorIdentifier, reason, condition: autoSaveMode.reason });
            }
        }
        else {
            this.saveAllDirtyAutoSaveables(reason);
        }
    }
    onDidChangeAutoSaveConfiguration() {
        // Trigger a save-all when auto save is enabled
        let reason = undefined;
        switch (this.filesConfigurationService.getAutoSaveMode(undefined).mode) {
            case 3 /* AutoSaveMode.ON_FOCUS_CHANGE */:
                reason = 3 /* SaveReason.FOCUS_CHANGE */;
                break;
            case 4 /* AutoSaveMode.ON_WINDOW_CHANGE */:
                reason = 4 /* SaveReason.WINDOW_CHANGE */;
                break;
            case 1 /* AutoSaveMode.AFTER_SHORT_DELAY */:
            case 2 /* AutoSaveMode.AFTER_LONG_DELAY */:
                reason = 2 /* SaveReason.AUTO */;
                break;
        }
        if (reason) {
            this.saveAllDirtyAutoSaveables(reason);
        }
    }
    saveAllDirtyAutoSaveables(reason) {
        for (const workingCopy of this.workingCopyService.dirtyWorkingCopies) {
            if (workingCopy.capabilities & 2 /* WorkingCopyCapabilities.Untitled */) {
                continue; // we never auto save untitled working copies
            }
            const autoSaveMode = this.filesConfigurationService.getAutoSaveMode(workingCopy.resource, reason);
            if (autoSaveMode.mode !== 0 /* AutoSaveMode.OFF */) {
                workingCopy.save({ reason });
            }
            else if (autoSaveMode.reason === 3 /* AutoSaveDisabledReason.ERRORS */ || autoSaveMode.reason === 4 /* AutoSaveDisabledReason.DISABLED */) {
                this.waitingOnConditionAutoSaveWorkingCopies.set(workingCopy.resource, { workingCopy, reason, condition: autoSaveMode.reason });
            }
        }
    }
    onDidRegister(workingCopy) {
        if (workingCopy.isDirty()) {
            this.scheduleAutoSave(workingCopy);
        }
    }
    onDidUnregister(workingCopy) {
        this.discardAutoSave(workingCopy);
    }
    onDidChangeDirty(workingCopy) {
        if (workingCopy.isDirty()) {
            this.scheduleAutoSave(workingCopy);
        }
        else {
            this.discardAutoSave(workingCopy);
        }
    }
    onDidChangeContent(workingCopy) {
        if (workingCopy.isDirty()) {
            // this listener will make sure that the auto save is
            // pushed out for as long as the user is still changing
            // the content of the working copy.
            this.scheduleAutoSave(workingCopy);
        }
    }
    scheduleAutoSave(workingCopy) {
        if (workingCopy.capabilities & 2 /* WorkingCopyCapabilities.Untitled */) {
            return; // we never auto save untitled working copies
        }
        const autoSaveAfterDelay = this.filesConfigurationService.getAutoSaveConfiguration(workingCopy.resource).autoSaveDelay;
        if (typeof autoSaveAfterDelay !== 'number') {
            return; // auto save after delay must be enabled
        }
        // Clear any running auto save operation
        this.discardAutoSave(workingCopy);
        this.logService.trace(`[editor auto save] scheduling auto save after ${autoSaveAfterDelay}ms`, workingCopy.resource.toString(), workingCopy.typeId);
        // Schedule new auto save
        const handle = setTimeout(() => {
            // Clear pending
            this.discardAutoSave(workingCopy);
            // Save if dirty and unless prevented by other conditions such as error markers
            if (workingCopy.isDirty()) {
                const reason = 2 /* SaveReason.AUTO */;
                const autoSaveMode = this.filesConfigurationService.getAutoSaveMode(workingCopy.resource, reason);
                if (autoSaveMode.mode !== 0 /* AutoSaveMode.OFF */) {
                    this.logService.trace(`[editor auto save] running auto save`, workingCopy.resource.toString(), workingCopy.typeId);
                    workingCopy.save({ reason });
                }
                else if (autoSaveMode.reason === 3 /* AutoSaveDisabledReason.ERRORS */ || autoSaveMode.reason === 4 /* AutoSaveDisabledReason.DISABLED */) {
                    this.waitingOnConditionAutoSaveWorkingCopies.set(workingCopy.resource, { workingCopy, reason, condition: autoSaveMode.reason });
                }
            }
        }, autoSaveAfterDelay);
        // Keep in map for disposal as needed
        this.scheduledAutoSavesAfterDelay.set(workingCopy, toDisposable(() => {
            this.logService.trace(`[editor auto save] clearing pending auto save`, workingCopy.resource.toString(), workingCopy.typeId);
            clearTimeout(handle);
        }));
    }
    discardAutoSave(workingCopy) {
        dispose(this.scheduledAutoSavesAfterDelay.get(workingCopy));
        this.scheduledAutoSavesAfterDelay.delete(workingCopy);
        this.waitingOnConditionAutoSaveWorkingCopies.delete(workingCopy.resource);
        this.waitingOnConditionAutoSaveEditors.delete(workingCopy.resource);
    }
};
EditorAutoSave = __decorate([
    __param(0, IFilesConfigurationService),
    __param(1, IHostService),
    __param(2, IEditorService),
    __param(3, IEditorGroupsService),
    __param(4, IWorkingCopyService),
    __param(5, ILogService),
    __param(6, IMarkerService),
    __param(7, IUriIdentityService)
], EditorAutoSave);
export { EditorAutoSave };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yQXV0b1NhdmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQXV0b1NhdmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZILE9BQU8sRUFBRSwwQkFBMEIsRUFBd0MsTUFBTSwwRUFBMEUsQ0FBQztBQUM1SixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFHdEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRWpHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFaEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBRXRGLElBQU0sY0FBYyxHQUFwQixNQUFNLGNBQWUsU0FBUSxVQUFVO2FBRTdCLE9BQUUsR0FBRyxrQ0FBa0MsQUFBckMsQ0FBc0M7SUFjeEQsWUFDNkIseUJBQXNFLEVBQ3BGLFdBQTBDLEVBQ3hDLGFBQThDLEVBQ3hDLGtCQUF5RCxFQUMxRCxrQkFBd0QsRUFDaEUsVUFBd0MsRUFDckMsYUFBOEMsRUFDekMsa0JBQXdEO1FBRTdFLEtBQUssRUFBRSxDQUFDO1FBVHFDLDhCQUF5QixHQUF6Qix5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