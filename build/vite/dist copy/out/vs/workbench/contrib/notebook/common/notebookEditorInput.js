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
var NotebookEditorInput_1;
import * as glob from '../../../../base/common/glob.js';
import { isResourceEditorInput } from '../../../common/editor.js';
import { INotebookService, SimpleNotebookProviderInfo } from './notebookService.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual, toLocalResource } from '../../../../base/common/resources.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotebookEditorModelResolverService } from './notebookEditorModelResolverService.js';
import { CellUri } from './notebookCommon.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { Schemas } from '../../../../base/common/network.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { AbstractResourceEditorInput } from '../../../common/editor/resourceEditorInput.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { localize } from '../../../../nls.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { ICustomEditorLabelService } from '../../../services/editor/common/customEditorLabelService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { isAbsolute } from '../../../../base/common/path.js';
let NotebookEditorInput = class NotebookEditorInput extends AbstractResourceEditorInput {
    static { NotebookEditorInput_1 = this; }
    static getOrCreate(instantiationService, resource, preferredResource, viewType, options = {}) {
        const editor = instantiationService.createInstance(NotebookEditorInput_1, resource, preferredResource, viewType, options);
        if (preferredResource) {
            editor.setPreferredResource(preferredResource);
        }
        return editor;
    }
    static { this.ID = 'workbench.input.notebook'; }
    constructor(resource, preferredResource, viewType, options, _notebookService, _notebookModelResolverService, _fileDialogService, labelService, fileService, filesConfigurationService, extensionService, editorService, textResourceConfigurationService, customEditorLabelService, environmentService, pathService) {
        super(resource, preferredResource, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
        this.viewType = viewType;
        this.options = options;
        this._notebookService = _notebookService;
        this._notebookModelResolverService = _notebookModelResolverService;
        this._fileDialogService = _fileDialogService;
        this.environmentService = environmentService;
        this.pathService = pathService;
        this.editorModelReference = null;
        this._defaultDirtyState = false;
        this._defaultDirtyState = !!options.startDirty;
        // Automatically resolve this input when the "wanted" model comes to life via
        // some other way. This happens only once per input and resolve disposes
        // this listener
        this._sideLoadedListener = _notebookService.onDidAddNotebookDocument(e => {
            if (e.viewType === this.viewType && e.uri.toString() === this.resource.toString()) {
                this.resolve().catch(onUnexpectedError);
            }
        });
        this._register(extensionService.onWillStop(e => {
            if (!e.auto && !this.isDirty()) {
                return;
            }
            const reason = e.auto
                ? localize('vetoAutoExtHostRestart', "An extension provided notebook for '{0}' is still open that would close otherwise.", this.getName())
                : localize('vetoExtHostRestart', "An extension provided notebook for '{0}' could not be saved.", this.getName());
            e.veto((async () => {
                const editors = editorService.findEditors(this);
                if (e.auto) {
                    return true;
                }
                if (editors.length > 0) {
                    const result = await editorService.save(editors[0]);
                    if (result.success) {
                        return false; // Don't Veto
                    }
                }
                return true; // Veto
            })(), reason);
        }));
    }
    dispose() {
        this._sideLoadedListener.dispose();
        this.editorModelReference?.dispose();
        this.editorModelReference = null;
        super.dispose();
    }
    get typeId() {
        return NotebookEditorInput_1.ID;
    }
    get editorId() {
        return this.viewType;
    }
    get capabilities() {
        let capabilities = 0 /* EditorInputCapabilities.None */;
        if (this.resource.scheme === Schemas.untitled) {
            capabilities |= 4 /* EditorInputCapabilities.Untitled */;
        }
        if (this.editorModelReference) {
            if (this.editorModelReference.object.isReadonly()) {
                capabilities |= 2 /* EditorInputCapabilities.Readonly */;
            }
        }
        else {
            if (this.filesConfigurationService.isReadonly(this.resource)) {
                capabilities |= 2 /* EditorInputCapabilities.Readonly */;
            }
        }
        if (!(capabilities & 2 /* EditorInputCapabilities.Readonly */)) {
            capabilities |= 128 /* EditorInputCapabilities.CanDropIntoEditor */;
        }
        return capabilities;
    }
    getDescription(verbosity = 1 /* Verbosity.MEDIUM */) {
        if (!this.hasCapability(4 /* EditorInputCapabilities.Untitled */) || this.editorModelReference?.object.hasAssociatedFilePath()) {
            return super.getDescription(verbosity);
        }
        return undefined; // no description for untitled notebooks without associated file path
    }
    isReadonly() {
        if (!this.editorModelReference) {
            return this.filesConfigurationService.isReadonly(this.resource);
        }
        return this.editorModelReference.object.isReadonly();
    }
    isDirty() {
        if (!this.editorModelReference) {
            return this._defaultDirtyState;
        }
        return this.editorModelReference.object.isDirty();
    }
    isSaving() {
        const model = this.editorModelReference?.object;
        if (!model || !model.isDirty() || model.hasErrorState || this.hasCapability(4 /* EditorInputCapabilities.Untitled */)) {
            return false; // require the model to be dirty, file-backed and not in an error state
        }
        // if a short auto save is configured, treat this as being saved
        return this.filesConfigurationService.hasShortAutoSaveDelay(this);
    }
    async save(group, options) {
        if (this.editorModelReference) {
            if (this.hasCapability(4 /* EditorInputCapabilities.Untitled */)) {
                return this.saveAs(group, options);
            }
            else {
                await this.editorModelReference.object.save(options);
            }
            return this;
        }
        return undefined;
    }
    async saveAs(group, options) {
        if (!this.editorModelReference) {
            return undefined;
        }
        const provider = this._notebookService.getContributedNotebookType(this.viewType);
        if (!provider) {
            return undefined;
        }
        const pathCandidate = this.hasCapability(4 /* EditorInputCapabilities.Untitled */)
            ? await this._suggestName(provider)
            : this.editorModelReference.object.resource;
        let target;
        if (this.editorModelReference.object.hasAssociatedFilePath()) {
            target = pathCandidate;
        }
        else {
            target = await this._fileDialogService.pickFileToSave(pathCandidate, options?.availableFileSystems);
            if (!target) {
                return undefined; // save cancelled
            }
        }
        if (!provider.matches(target)) {
            const patterns = provider.selectors.map(pattern => {
                if (typeof pattern === 'string') {
                    return pattern;
                }
                if (glob.isRelativePattern(pattern)) {
                    return `${pattern} (base ${pattern.base})`;
                }
                if (pattern.exclude) {
                    return `${pattern.include} (exclude: ${pattern.exclude})`;
                }
                else {
                    return `${pattern.include}`;
                }
            }).join(', ');
            throw new Error(`File name ${target} is not supported by ${provider.providerDisplayName}.\n\nPlease make sure the file name matches following patterns:\n${patterns}`);
        }
        return await this.editorModelReference.object.saveAs(target);
    }
    async _suggestName(provider) {
        const resource = await this.ensureAbsolutePath(this.ensureProviderExtension(provider));
        const remoteAuthority = this.environmentService.remoteAuthority;
        return toLocalResource(resource, remoteAuthority, this.pathService.defaultUriScheme);
    }
    async ensureAbsolutePath(resource) {
        if (resource.scheme !== Schemas.untitled || isAbsolute(resource.path)) {
            return resource;
        }
        const defaultFilePath = await this._fileDialogService.defaultFilePath();
        return URI.joinPath(defaultFilePath, resource.path);
    }
    ensureProviderExtension(provider) {
        const firstSelector = provider.selectors[0];
        let selectorStr = firstSelector && typeof firstSelector === 'string' ? firstSelector : undefined;
        if (!selectorStr && firstSelector) {
            const include = firstSelector.include;
            if (typeof include === 'string') {
                selectorStr = include;
            }
        }
        const resource = this.resource;
        if (selectorStr) {
            const matches = /^\*\.([A-Za-z_-]*)$/.exec(selectorStr);
            if (matches && matches.length > 1) {
                const fileExt = matches[1];
                if (!resource.path.endsWith(fileExt)) {
                    return resource.with({ path: resource.path + '.' + fileExt });
                }
            }
        }
        return resource;
    }
    // called when users rename a notebook document
    async rename(group, target) {
        if (this.editorModelReference) {
            return { editor: { resource: target }, options: { override: this.viewType } };
        }
        return undefined;
    }
    async revert(_group, options) {
        if (this.editorModelReference && this.editorModelReference.object.isDirty()) {
            await this.editorModelReference.object.revert(options);
        }
    }
    async resolve(_options, perf) {
        if (!await this._notebookService.canResolve(this.viewType)) {
            return null;
        }
        perf?.mark('extensionActivated');
        // we are now loading the notebook and don't need to listen to
        // "other" loading anymore
        this._sideLoadedListener.dispose();
        if (!this.editorModelReference) {
            const scratchpad = this.capabilities & 512 /* EditorInputCapabilities.Scratchpad */ ? true : false;
            const ref = await this._notebookModelResolverService.resolve(this.resource, this.viewType, { limits: this.ensureLimits(_options), scratchpad, viewType: this.editorId });
            if (this.editorModelReference) {
                // Re-entrant, double resolve happened. Dispose the addition references and proceed
                // with the truth.
                ref.dispose();
                return this.editorModelReference.object;
            }
            this.editorModelReference = ref;
            if (this.isDisposed()) {
                this.editorModelReference.dispose();
                this.editorModelReference = null;
                return null;
            }
            this._register(this.editorModelReference.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
            this._register(this.editorModelReference.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
            this._register(this.editorModelReference.object.onDidRevertUntitled(() => this.dispose()));
            if (this.editorModelReference.object.isDirty()) {
                this._onDidChangeDirty.fire();
            }
        }
        else {
            this.editorModelReference.object.load({ limits: this.ensureLimits(_options) });
        }
        if (this.options._backupId) {
            const info = await this._notebookService.withNotebookDataProvider(this.editorModelReference.object.notebook.viewType);
            if (!(info instanceof SimpleNotebookProviderInfo)) {
                throw new Error('CANNOT open file notebook with this provider');
            }
            const data = await info.serializer.dataToNotebook(VSBuffer.fromString(JSON.stringify({ __webview_backup: this.options._backupId })));
            this.editorModelReference.object.notebook.applyEdits([
                {
                    editType: 1 /* CellEditType.Replace */,
                    index: 0,
                    count: this.editorModelReference.object.notebook.length,
                    cells: data.cells
                }
            ], true, undefined, () => undefined, undefined, false);
            if (this.options._workingCopy) {
                this.options._backupId = undefined;
                this.options._workingCopy = undefined;
                this.options.startDirty = undefined;
            }
        }
        return this.editorModelReference.object;
    }
    toUntyped() {
        return {
            resource: this.resource,
            options: {
                override: this.viewType
            }
        };
    }
    matches(otherInput) {
        if (super.matches(otherInput)) {
            return true;
        }
        if (otherInput instanceof NotebookEditorInput_1) {
            return this.viewType === otherInput.viewType && isEqual(this.resource, otherInput.resource);
        }
        if (isResourceEditorInput(otherInput) && otherInput.resource.scheme === CellUri.scheme) {
            return isEqual(this.resource, CellUri.parse(otherInput.resource)?.notebook);
        }
        return false;
    }
};
NotebookEditorInput = NotebookEditorInput_1 = __decorate([
    __param(4, INotebookService),
    __param(5, INotebookEditorModelResolverService),
    __param(6, IFileDialogService),
    __param(7, ILabelService),
    __param(8, IFileService),
    __param(9, IFilesConfigurationService),
    __param(10, IExtensionService),
    __param(11, IEditorService),
    __param(12, ITextResourceConfigurationService),
    __param(13, ICustomEditorLabelService),
    __param(14, IWorkbenchEnvironmentService),
    __param(15, IPathService)
], NotebookEditorInput);
export { NotebookEditorInput };
export function isCompositeNotebookEditorInput(thing) {
    return !!thing
        && typeof thing === 'object'
        && Array.isArray(thing.editorInputs)
        && (thing.editorInputs.every(input => input instanceof NotebookEditorInput));
}
export function isNotebookEditorInput(thing) {
    return !!thing
        && typeof thing === 'object'
        && thing.typeId === NotebookEditorInput.ID;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tFZGl0b3JJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0VkaXRvcklucHV0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssSUFBSSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hELE9BQU8sRUFBdUoscUJBQXFCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUV2TixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUNwRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVoRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUU5RixPQUFPLEVBQWdCLE9BQU8sRUFBZ0MsTUFBTSxxQkFBcUIsQ0FBQztBQUMxRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDM0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUU1RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFJN0QsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sMEVBQTBFLENBQUM7QUFDdEgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUVsRixPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNwSCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUN4RyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBV3RELElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW9CLFNBQVEsMkJBQTJCOztJQUVuRSxNQUFNLENBQUMsV0FBVyxDQUFDLG9CQUEyQyxFQUFFLFFBQWEsRUFBRSxpQkFBa0MsRUFBRSxRQUFnQixFQUFFLFVBQXNDLEVBQUU7UUFDNUssTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHFCQUFtQixFQUFFLFFBQVEsRUFBRSxpQkFBaUIsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDeEgsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO1lBQ3ZCLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7YUFFZSxPQUFFLEdBQVcsMEJBQTBCLEFBQXJDLENBQXNDO0lBTXhELFlBQ0MsUUFBYSxFQUNiLGlCQUFrQyxFQUNsQixRQUFnQixFQUNoQixPQUFtQyxFQUNqQyxnQkFBbUQsRUFDaEMsNkJBQW1GLEVBQ3BHLGtCQUF1RCxFQUM1RCxZQUEyQixFQUM1QixXQUF5QixFQUNYLHlCQUFxRCxFQUM5RCxnQkFBbUMsRUFDdEMsYUFBNkIsRUFDVixnQ0FBbUUsRUFDM0Usd0JBQW1ELEVBQ2hELGtCQUFtRSxFQUNuRixXQUEwQztRQUV4RCxLQUFLLENBQUMsUUFBUSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUseUJBQXlCLEVBQUUsZ0NBQWdDLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztRQWZySSxhQUFRLEdBQVIsUUFBUSxDQUFRO1FBQ2hCLFlBQU8sR0FBUCxPQUFPLENBQTRCO1FBQ2hCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBa0I7UUFDZixrQ0FBNkIsR0FBN0IsNkJBQTZCLENBQXFDO1FBQ25GLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFRMUIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUE4QjtRQUNsRSxnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQXBCL0MseUJBQW9CLEdBQW9ELElBQUksQ0FBQztRQUUvRSx1QkFBa0IsR0FBWSxLQUFLLENBQUM7UUFxQjNDLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQztRQUUvQyw2RUFBNkU7UUFDN0Usd0VBQXdFO1FBQ3hFLGdCQUFnQjtRQUNoQixJQUFJLENBQUMsbUJBQW1CLEdBQUcsZ0JBQWdCLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDeEUsSUFBSSxDQUFDLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7Z0JBQ25GLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQztZQUN6QyxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUM5QyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDO2dCQUNoQyxPQUFPO1lBQ1IsQ0FBQztZQUVELE1BQU0sTUFBTSxHQUFHLENBQUMsQ0FBQyxJQUFJO2dCQUNwQixDQUFDLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLG9GQUFvRixFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDMUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSw4REFBOEQsRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUVsSCxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxJQUFJLEVBQUU7Z0JBQ2xCLE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ2hELElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO29CQUNaLE9BQU8sSUFBSSxDQUFDO2dCQUNiLENBQUM7Z0JBQ0QsSUFBSSxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUN4QixNQUFNLE1BQU0sR0FBRyxNQUFNLGFBQWEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3BELElBQUksTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO3dCQUNwQixPQUFPLEtBQUssQ0FBQyxDQUFDLGFBQWE7b0JBQzVCLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxPQUFPLElBQUksQ0FBQyxDQUFDLE9BQU87WUFDckIsQ0FBQyxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNmLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRVEsT0FBTztRQUNmLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsT0FBTyxFQUFFLENBQUM7UUFDckMsSUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksQ0FBQztRQUNqQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQztJQUVELElBQWEsTUFBTTtRQUNsQixPQUFPLHFCQUFtQixDQUFDLEVBQUUsQ0FBQztJQUMvQixDQUFDO0lBRUQsSUFBYSxRQUFRO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUN0QixDQUFDO0lBRUQsSUFBYSxZQUFZO1FBQ3hCLElBQUksWUFBWSx1Q0FBK0IsQ0FBQztRQUVoRCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUMvQyxZQUFZLDRDQUFvQyxDQUFDO1FBQ2xELENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQy9CLElBQUksSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDO2dCQUNuRCxZQUFZLDRDQUFvQyxDQUFDO1lBQ2xELENBQUM7UUFDRixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksSUFBSSxDQUFDLHlCQUF5QixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztnQkFDOUQsWUFBWSw0Q0FBb0MsQ0FBQztZQUNsRCxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQyxDQUFDLFlBQVksMkNBQW1DLENBQUMsRUFBRSxDQUFDO1lBQ3hELFlBQVksdURBQTZDLENBQUM7UUFDM0QsQ0FBQztRQUVELE9BQU8sWUFBWSxDQUFDO0lBQ3JCLENBQUM7SUFFUSxjQUFjLENBQUMsU0FBUywyQkFBbUI7UUFDbkQsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLDBDQUFrQyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxNQUFNLENBQUMscUJBQXFCLEVBQUUsRUFBRSxDQUFDO1lBQ3hILE9BQU8sS0FBSyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN4QyxDQUFDO1FBRUQsT0FBTyxTQUFTLENBQUMsQ0FBQyxxRUFBcUU7SUFDeEYsQ0FBQztJQUVRLFVBQVU7UUFDbEIsSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQ2hDLE9BQU8sSUFBSSxDQUFDLHlCQUF5QixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDakUsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUN0RCxDQUFDO0lBRVEsT0FBTztRQUNmLElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUNoQyxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQztRQUNoQyxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ25ELENBQUM7SUFFUSxRQUFRO1FBQ2hCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxNQUFNLENBQUM7UUFDaEQsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsSUFBSSxLQUFLLENBQUMsYUFBYSxJQUFJLElBQUksQ0FBQyxhQUFhLDBDQUFrQyxFQUFFLENBQUM7WUFDL0csT0FBTyxLQUFLLENBQUMsQ0FBQyx1RUFBdUU7UUFDdEYsQ0FBQztRQUVELGdFQUFnRTtRQUNoRSxPQUFPLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBRVEsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFzQixFQUFFLE9BQXNCO1FBQ2pFLElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFFL0IsSUFBSSxJQUFJLENBQUMsYUFBYSwwQ0FBa0MsRUFBRSxDQUFDO2dCQUMxRCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3BDLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3RELENBQUM7WUFFRCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRVEsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFzQixFQUFFLE9BQXNCO1FBQ25FLElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUNoQyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVqRixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGFBQWEsMENBQWtDO1lBQ3pFLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDO1lBQ25DLENBQUMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztRQUU3QyxJQUFJLE1BQXVCLENBQUM7UUFDNUIsSUFBSSxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLHFCQUFxQixFQUFFLEVBQUUsQ0FBQztZQUM5RCxNQUFNLEdBQUcsYUFBYSxDQUFDO1FBQ3hCLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxhQUFhLEVBQUUsT0FBTyxFQUFFLG9CQUFvQixDQUFDLENBQUM7WUFDcEcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNiLE9BQU8sU0FBUyxDQUFDLENBQUMsaUJBQWlCO1lBQ3BDLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUMvQixNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRTtnQkFDakQsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDakMsT0FBTyxPQUFPLENBQUM7Z0JBQ2hCLENBQUM7Z0JBRUQsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztvQkFDckMsT0FBTyxHQUFHLE9BQU8sVUFBVSxPQUFPLENBQUMsSUFBSSxHQUFHLENBQUM7Z0JBQzVDLENBQUM7Z0JBRUQsSUFBSSxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ3JCLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxjQUFjLE9BQU8sQ0FBQyxPQUFPLEdBQUcsQ0FBQztnQkFDM0QsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQzdCLENBQUM7WUFFRixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDZCxNQUFNLElBQUksS0FBSyxDQUFDLGFBQWEsTUFBTSx3QkFBd0IsUUFBUSxDQUFDLG1CQUFtQixvRUFBb0UsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUN4SyxDQUFDO1FBRUQsT0FBTyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFTyxLQUFLLENBQUMsWUFBWSxDQUFDLFFBQThCO1FBQ3hELE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ3ZGLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLENBQUM7UUFDaEUsT0FBTyxlQUFlLENBQUMsUUFBUSxFQUFFLGVBQWUsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFDdEYsQ0FBQztJQUVPLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxRQUFhO1FBQzdDLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsUUFBUSxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUN2RSxPQUFPLFFBQVEsQ0FBQztRQUNqQixDQUFDO1FBRUQsTUFBTSxlQUFlLEdBQUcsTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDeEUsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDckQsQ0FBQztJQUVPLHVCQUF1QixDQUFDLFFBQThCO1FBQzdELE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUMsSUFBSSxXQUFXLEdBQUcsYUFBYSxJQUFJLE9BQU8sYUFBYSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDakcsSUFBSSxDQUFDLFdBQVcsSUFBSSxhQUFhLEVBQUUsQ0FBQztZQUNuQyxNQUFNLE9BQU8sR0FBSSxhQUFzQyxDQUFDLE9BQU8sQ0FBQztZQUNoRSxJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUNqQyxXQUFXLEdBQUcsT0FBTyxDQUFDO1lBQ3ZCLENBQUM7UUFDRixDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztRQUMvQixJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ2pCLE1BQU0sT0FBTyxHQUFHLHFCQUFxQixDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN4RCxJQUFJLE9BQU8sSUFBSSxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNuQyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzNCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO29CQUN0QyxPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksR0FBRyxHQUFHLEdBQUcsT0FBTyxFQUFFLENBQUMsQ0FBQztnQkFDL0QsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUVELCtDQUErQztJQUN0QyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQXNCLEVBQUUsTUFBVztRQUN4RCxJQUFJLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQy9CLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBRS9FLENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRVEsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUF1QixFQUFFLE9BQXdCO1FBQ3RFLElBQUksSUFBSSxDQUFDLG9CQUFvQixJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztZQUM3RSxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3hELENBQUM7SUFDRixDQUFDO0lBRVEsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUF5QyxFQUFFLElBQXdCO1FBQ3pGLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDNUQsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsSUFBSSxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBRWpDLDhEQUE4RDtRQUM5RCwwQkFBMEI7UUFDMUIsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRW5DLElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUNoQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsWUFBWSwrQ0FBcUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7WUFDekYsTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMsNkJBQTZCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDekssSUFBSSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztnQkFDL0IsbUZBQW1GO2dCQUNuRixrQkFBa0I7Z0JBQ2xCLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDZCxPQUFrRCxJQUFJLENBQUMsb0JBQXFCLENBQUMsTUFBTSxDQUFDO1lBQ3JGLENBQUM7WUFDRCxJQUFJLENBQUMsb0JBQW9CLEdBQUcsR0FBRyxDQUFDO1lBQ2hDLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7Z0JBQ3ZCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDcEMsSUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksQ0FBQztnQkFDakMsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1lBQ0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdkcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDakgsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDM0YsSUFBSSxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7Z0JBQ2hELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUMvQixDQUFDO1FBQ0YsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNoRixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQzVCLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3RILElBQUksQ0FBQyxDQUFDLElBQUksWUFBWSwwQkFBMEIsQ0FBQyxFQUFFLENBQUM7Z0JBQ25ELE1BQU0sSUFBSSxLQUFLLENBQUMsOENBQThDLENBQUMsQ0FBQztZQUNqRSxDQUFDO1lBRUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQztnQkFDcEQ7b0JBQ0MsUUFBUSw4QkFBc0I7b0JBQzlCLEtBQUssRUFBRSxDQUFDO29CQUNSLEtBQUssRUFBRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNO29CQUN2RCxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7aUJBQ2pCO2FBQ0QsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFFdkQsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUMvQixJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7Z0JBQ25DLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxHQUFHLFNBQVMsQ0FBQztnQkFDdEMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDO1lBQ3JDLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDO0lBQ3pDLENBQUM7SUFFUSxTQUFTO1FBQ2pCLE9BQU87WUFDTixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDdkIsT0FBTyxFQUFFO2dCQUNSLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTthQUN2QjtTQUNELENBQUM7SUFDSCxDQUFDO0lBRVEsT0FBTyxDQUFDLFVBQTZDO1FBQzdELElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQy9CLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELElBQUksVUFBVSxZQUFZLHFCQUFtQixFQUFFLENBQUM7WUFDL0MsT0FBTyxJQUFJLENBQUMsUUFBUSxLQUFLLFVBQVUsQ0FBQyxRQUFRLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzdGLENBQUM7UUFDRCxJQUFJLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN4RixPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzdFLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7O0FBclZXLG1CQUFtQjtJQXFCN0IsV0FBQSxnQkFBZ0IsQ0FBQTtJQUNoQixXQUFBLG1DQUFtQyxDQUFBO0lBQ25DLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsMEJBQTBCLENBQUE7SUFDMUIsWUFBQSxpQkFBaUIsQ0FBQTtJQUNqQixZQUFBLGNBQWMsQ0FBQTtJQUNkLFlBQUEsaUNBQWlDLENBQUE7SUFDakMsWUFBQSx5QkFBeUIsQ0FBQTtJQUN6QixZQUFBLDRCQUE0QixDQUFBO0lBQzVCLFlBQUEsWUFBWSxDQUFBO0dBaENGLG1CQUFtQixDQXNWL0I7O0FBTUQsTUFBTSxVQUFVLDhCQUE4QixDQUFDLEtBQWM7SUFDNUQsT0FBTyxDQUFDLENBQUMsS0FBSztXQUNWLE9BQU8sS0FBSyxLQUFLLFFBQVE7V0FDekIsS0FBSyxDQUFDLE9BQU8sQ0FBaUMsS0FBTSxDQUFDLFlBQVksQ0FBQztXQUNsRSxDQUFpQyxLQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssWUFBWSxtQkFBbUIsQ0FBQyxDQUFDLENBQUM7QUFDaEgsQ0FBQztBQUVELE1BQU0sVUFBVSxxQkFBcUIsQ0FBQyxLQUE4QjtJQUNuRSxPQUFPLENBQUMsQ0FBQyxLQUFLO1dBQ1YsT0FBTyxLQUFLLEtBQUssUUFBUTtXQUN6QixLQUFLLENBQUMsTUFBTSxLQUFLLG1CQUFtQixDQUFDLEVBQUUsQ0FBQztBQUM3QyxDQUFDIn0=