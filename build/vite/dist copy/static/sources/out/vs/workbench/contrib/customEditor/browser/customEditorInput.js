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
var CustomEditorInput_1;
import { getWindow } from '../../../../base/browser/dom.js';
import { toAction } from '../../../../base/common/actions.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/path.js';
import { dirname, isEqual } from '../../../../base/common/resources.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { createEditorOpenError } from '../../../common/editor.js';
import { ICustomEditorLabelService } from '../../../services/editor/common/customEditorLabelService.js';
import { ICustomEditorService } from '../common/customEditor.js';
import { IWebviewService } from '../../webview/browser/webview.js';
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IUntitledTextEditorService } from '../../../services/untitled/common/untitledTextEditorService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
let CustomEditorInput = class CustomEditorInput extends LazilyResolvedWebviewEditorInput {
    static { CustomEditorInput_1 = this; }
    static create(instantiationService, init, group, options) {
        return instantiationService.invokeFunction(accessor => {
            // If it's an untitled file we must populate the untitledDocumentData
            const untitledTextEditorService = accessor.get(IUntitledTextEditorService);
            const untitledTextModel = untitledTextEditorService.get(init.resource);
            const untitledString = untitledTextModel?.textEditorModel?.getValue();
            const untitledDocumentData = untitledString ? VSBuffer.fromString(untitledString) : undefined;
            // If we're taking over an untitled text editor, revert it so it's no longer
            // tracked as a dirty working copy (fixes #125293).
            untitledTextModel?.revert();
            const webview = accessor.get(IWebviewService).createWebviewOverlay({
                providedViewType: init.viewType,
                title: init.webviewTitle,
                options: { customClasses: options?.customClasses },
                contentOptions: {},
                extension: undefined,
            });
            const input = instantiationService.createInstance(CustomEditorInput_1, init, webview, { untitledDocumentData: untitledDocumentData, oldResource: options?.oldResource });
            if (typeof group !== 'undefined') {
                input.updateGroup(group);
            }
            return input;
        });
    }
    static { this.typeId = 'workbench.editors.webviewEditor'; }
    get resource() { return this._editorResource; }
    constructor(init, webview, options, themeService, webviewWorkbenchService, instantiationService, labelService, customEditorService, fileDialogService, undoRedoService, fileService, filesConfigurationService, editorGroupsService, layoutService, customEditorLabelService) {
        super({ providedId: init.viewType, viewType: init.viewType, name: '', iconPath: init.iconPath }, webview, themeService, webviewWorkbenchService);
        this.instantiationService = instantiationService;
        this.labelService = labelService;
        this.customEditorService = customEditorService;
        this.fileDialogService = fileDialogService;
        this.undoRedoService = undoRedoService;
        this.fileService = fileService;
        this.filesConfigurationService = filesConfigurationService;
        this.editorGroupsService = editorGroupsService;
        this.layoutService = layoutService;
        this.customEditorLabelService = customEditorLabelService;
        this._editorName = undefined;
        this._shortDescription = undefined;
        this._mediumDescription = undefined;
        this._longDescription = undefined;
        this._shortTitle = undefined;
        this._mediumTitle = undefined;
        this._longTitle = undefined;
        this._editorResource = init.resource;
        this.oldResource = options.oldResource;
        this._defaultDirtyState = options.startsDirty;
        this._backupId = options.backupId;
        this._untitledDocumentData = options.untitledDocumentData;
        this.registerListeners();
    }
    registerListeners() {
        // Clear our labels on certain label related events
        this._register(this.labelService.onDidChangeFormatters(e => this.onLabelEvent(e.scheme)));
        this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(e => this.onLabelEvent(e.scheme)));
        this._register(this.fileService.onDidChangeFileSystemProviderCapabilities(e => this.onLabelEvent(e.scheme)));
        this._register(this.customEditorLabelService.onDidChange(() => this.updateLabel()));
        this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
    }
    onLabelEvent(scheme) {
        if (scheme === this.resource.scheme) {
            this.updateLabel();
        }
    }
    updateLabel() {
        // Clear any cached labels from before
        this._editorName = undefined;
        this._shortDescription = undefined;
        this._mediumDescription = undefined;
        this._longDescription = undefined;
        this._shortTitle = undefined;
        this._mediumTitle = undefined;
        this._longTitle = undefined;
        // Trigger recompute of label
        this._onDidChangeLabel.fire();
    }
    get typeId() {
        return CustomEditorInput_1.typeId;
    }
    get editorId() {
        return this.viewType;
    }
    get capabilities() {
        let capabilities = 0 /* EditorInputCapabilities.None */;
        capabilities |= 128 /* EditorInputCapabilities.CanDropIntoEditor */;
        if (!this.customEditorService.getCustomEditorCapabilities(this.viewType)?.supportsMultipleEditorsPerDocument) {
            capabilities |= 8 /* EditorInputCapabilities.Singleton */;
        }
        if (this._modelRef) {
            if (this._modelRef.object.isReadonly()) {
                capabilities |= 2 /* EditorInputCapabilities.Readonly */;
            }
        }
        else {
            if (this.filesConfigurationService.isReadonly(this.resource)) {
                capabilities |= 2 /* EditorInputCapabilities.Readonly */;
            }
        }
        if (this.resource.scheme === Schemas.untitled) {
            capabilities |= 4 /* EditorInputCapabilities.Untitled */;
        }
        return capabilities;
    }
    getName() {
        const customTitle = this.getWebviewTitle();
        if (customTitle) {
            return customTitle;
        }
        this._editorName ??= this.customEditorLabelService.getName(this.resource) ?? basename(this.labelService.getUriLabel(this.resource));
        return this._editorName;
    }
    getDescription(verbosity = 1 /* Verbosity.MEDIUM */) {
        switch (verbosity) {
            case 0 /* Verbosity.SHORT */:
                return this.shortDescription;
            case 2 /* Verbosity.LONG */:
                return this.longDescription;
            case 1 /* Verbosity.MEDIUM */:
            default:
                return this.mediumDescription;
        }
    }
    get shortDescription() {
        this._shortDescription ??= this.labelService.getUriBasenameLabel(dirname(this.resource));
        return this._shortDescription;
    }
    get mediumDescription() {
        this._mediumDescription ??= this.labelService.getUriLabel(dirname(this.resource), { relative: true });
        return this._mediumDescription;
    }
    get longDescription() {
        this._longDescription ??= this.labelService.getUriLabel(dirname(this.resource));
        return this._longDescription;
    }
    get shortTitle() {
        this._shortTitle ??= this.getName();
        return this._shortTitle;
    }
    get mediumTitle() {
        this._mediumTitle ??= this.labelService.getUriLabel(this.resource, { relative: true });
        return this._mediumTitle;
    }
    get longTitle() {
        this._longTitle ??= this.labelService.getUriLabel(this.resource);
        return this._longTitle;
    }
    getTitle(verbosity) {
        const customTitle = this.getWebviewTitle();
        if (customTitle) {
            return customTitle;
        }
        switch (verbosity) {
            case 0 /* Verbosity.SHORT */:
                return this.shortTitle;
            case 2 /* Verbosity.LONG */:
                return this.longTitle;
            default:
            case 1 /* Verbosity.MEDIUM */:
                return this.mediumTitle;
        }
    }
    matches(other) {
        if (super.matches(other)) {
            return true;
        }
        return this === other || (other instanceof CustomEditorInput_1
            && this.viewType === other.viewType
            && isEqual(this.resource, other.resource));
    }
    copy() {
        return CustomEditorInput_1.create(this.instantiationService, { resource: this.resource, viewType: this.viewType, webviewTitle: this.getWebviewTitle(), iconPath: this.iconPath, }, this.group, this.webview.options);
    }
    isReadonly() {
        if (!this._modelRef) {
            return this.filesConfigurationService.isReadonly(this.resource);
        }
        return this._modelRef.object.isReadonly();
    }
    isDirty() {
        if (!this._modelRef) {
            return !!this._defaultDirtyState;
        }
        return this._modelRef.object.isDirty();
    }
    async save(groupId, options) {
        if (!this._modelRef) {
            return undefined;
        }
        const target = await this._modelRef.object.saveCustomEditor(options);
        if (!target) {
            return undefined; // save cancelled
        }
        // Different URIs == untyped input returned to allow resolver to possibly resolve to a different editor type
        if (!isEqual(target, this.resource)) {
            return { resource: target };
        }
        return this;
    }
    async saveAs(groupId, options) {
        if (!this._modelRef) {
            return undefined;
        }
        const dialogPath = this._editorResource;
        const target = await this.fileDialogService.pickFileToSave(dialogPath, options?.availableFileSystems);
        if (!target) {
            return undefined; // save cancelled
        }
        if (!await this._modelRef.object.saveCustomEditorAs(this._editorResource, target, options)) {
            return undefined;
        }
        return (await this.rename(groupId, target))?.editor;
    }
    async revert(group, options) {
        if (this._modelRef) {
            return this._modelRef.object.revert(options);
        }
        this._defaultDirtyState = false;
        this._onDidChangeDirty.fire();
    }
    async resolve() {
        await super.resolve();
        if (this.isDisposed()) {
            return null;
        }
        if (!this._modelRef) {
            const oldCapabilities = this.capabilities;
            this._modelRef = this._register(assertReturnsDefined(await this.customEditorService.models.tryRetain(this.resource, this.viewType)));
            this._register(this._modelRef.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
            this._register(this._modelRef.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
            // If we're loading untitled file data we should ensure it's dirty
            if (this._untitledDocumentData) {
                this._defaultDirtyState = true;
            }
            if (this.isDirty()) {
                this._onDidChangeDirty.fire();
            }
            if (this.capabilities !== oldCapabilities) {
                this._onDidChangeCapabilities.fire();
            }
        }
        return null;
    }
    async rename(group, newResource) {
        // We return an untyped editor input which can then be resolved in the editor service
        return { editor: { resource: newResource } };
    }
    undo() {
        assertReturnsDefined(this._modelRef);
        return this.undoRedoService.undo(this.resource);
    }
    redo() {
        assertReturnsDefined(this._modelRef);
        return this.undoRedoService.redo(this.resource);
    }
    onMove(handler) {
        // TODO: Move this to the service
        this._moveHandler = handler;
    }
    transfer(other) {
        if (!super.transfer(other)) {
            return;
        }
        other._moveHandler = this._moveHandler;
        this._moveHandler = undefined;
        return other;
    }
    get backupId() {
        if (this._modelRef) {
            return this._modelRef.object.backupId;
        }
        return this._backupId;
    }
    get untitledDocumentData() {
        return this._untitledDocumentData;
    }
    toUntyped() {
        return {
            resource: this.resource,
            options: {
                override: this.viewType
            }
        };
    }
    claim(claimant, targetWindow, scopedContextKeyService) {
        if (this.doCanMove(targetWindow.vscodeWindowId) !== true) {
            throw createEditorOpenError(localize('editorUnsupportedInWindow', "Unable to open the editor in this window, it contains modifications that can only be saved in the original window."), [
                toAction({
                    id: 'openInOriginalWindow',
                    label: localize('reopenInOriginalWindow', "Open in Original Window"),
                    run: async () => {
                        const originalPart = this.editorGroupsService.getPart(this.layoutService.getContainer(getWindow(this.webview.container).window));
                        const currentPart = this.editorGroupsService.getPart(this.layoutService.getContainer(targetWindow.window));
                        currentPart.activeGroup.moveEditor(this, originalPart.activeGroup);
                    }
                })
            ], { forceMessage: true });
        }
        return super.claim(claimant, targetWindow, scopedContextKeyService);
    }
    canMove(sourceGroup, targetGroup) {
        const resolvedTargetGroup = this.editorGroupsService.getGroup(targetGroup);
        if (resolvedTargetGroup) {
            const canMove = this.doCanMove(resolvedTargetGroup.windowId);
            if (typeof canMove === 'string') {
                return canMove;
            }
        }
        return super.canMove(sourceGroup, targetGroup);
    }
    doCanMove(targetWindowId) {
        if (this.isModified() && this._modelRef?.object.canHotExit === false) {
            const sourceWindowId = getWindow(this.webview.container).vscodeWindowId;
            if (sourceWindowId !== targetWindowId) {
                // The custom editor is modified, not backed by a file and without a backup.
                // We have to assume that the modified state is enclosed into the webview
                // managed by an extension. As such, we cannot just move the webview
                // into another window because that means, we potentally loose the modified
                // state and thus trigger data loss.
                return localize('editorCannotMove', "Unable to move '{0}': The editor contains changes that can only be saved in its current window.", this.getName());
            }
        }
        return true;
    }
};
CustomEditorInput = CustomEditorInput_1 = __decorate([
    __param(3, IThemeService),
    __param(4, IWebviewWorkbenchService),
    __param(5, IInstantiationService),
    __param(6, ILabelService),
    __param(7, ICustomEditorService),
    __param(8, IFileDialogService),
    __param(9, IUndoRedoService),
    __param(10, IFileService),
    __param(11, IFilesConfigurationService),
    __param(12, IEditorGroupsService),
    __param(13, IWorkbenchLayoutService),
    __param(14, ICustomEditorLabelService)
], CustomEditorInput);
export { CustomEditorInput };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9tRWRpdG9ySW5wdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jdXN0b21FZGl0b3IvYnJvd3Nlci9jdXN0b21FZGl0b3JJbnB1dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFHN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXhFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUVwRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3BGLE9BQU8sRUFBdUgscUJBQXFCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUV2TCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUN4RyxPQUFP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