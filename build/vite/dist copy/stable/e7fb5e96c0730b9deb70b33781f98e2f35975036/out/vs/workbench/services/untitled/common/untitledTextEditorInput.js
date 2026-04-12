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
var UntitledTextEditorInput_1;
import { DEFAULT_EDITOR_ASSOCIATION, findViewStateForEditor, isUntitledResourceEditorInput } from '../../../common/editor.js';
import { AbstractTextResourceEditorInput } from '../../../common/editor/textResourceEditorInput.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { isEqual, toLocalResource } from '../../../../base/common/resources.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IPathService } from '../../path/common/pathService.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { ICustomEditorLabelService } from '../../editor/common/customEditorLabelService.js';
/**
 * An editor input to be used for untitled text buffers.
 */
let UntitledTextEditorInput = class UntitledTextEditorInput extends AbstractTextResourceEditorInput {
    static { UntitledTextEditorInput_1 = this; }
    static { this.ID = 'workbench.editors.untitledEditorInput'; }
    get typeId() {
        return UntitledTextEditorInput_1.ID;
    }
    get editorId() {
        return DEFAULT_EDITOR_ASSOCIATION.id;
    }
    constructor(model, textFileService, labelService, editorService, fileService, environmentService, pathService, filesConfigurationService, textModelService, textResourceConfigurationService, customEditorLabelService) {
        super(model.resource, undefined, editorService, textFileService, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
        this.model = model;
        this.environmentService = environmentService;
        this.pathService = pathService;
        this.textModelService = textModelService;
        this.modelResolve = undefined;
        this.modelDisposables = this._register(new DisposableStore());
        this.cachedUntitledTextEditorModelReference = undefined;
        this.registerModelListeners(model);
        this._register(this.textFileService.untitled.onDidCreate(model => this.onDidCreateUntitledModel(model)));
    }
    registerModelListeners(model) {
        this.modelDisposables.clear();
        // re-emit some events from the model
        this.modelDisposables.add(model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
        this.modelDisposables.add(model.onDidChangeName(() => this._onDidChangeLabel.fire()));
        // a reverted untitled text editor model renders this input disposed
        this.modelDisposables.add(model.onDidRevert(() => this.dispose()));
    }
    onDidCreateUntitledModel(model) {
        if (isEqual(model.resource, this.model.resource) && model !== this.model) {
            // Ensure that we keep our model up to date with
            // the actual model from the service so that we
            // never get out of sync with the truth.
            this.model = model;
            this.registerModelListeners(model);
        }
    }
    getName() {
        return this.model.name;
    }
    getDescription(verbosity = 1 /* Verbosity.MEDIUM */) {
        // Without associated path: only use if name and description differ
        if (!this.model.hasAssociatedFilePath) {
            const descriptionCandidate = this.resource.path;
            if (descriptionCandidate !== this.getName()) {
                return descriptionCandidate;
            }
            return undefined;
        }
        // With associated path: delegate to parent
        return super.getDescription(verbosity);
    }
    getTitle(verbosity) {
        // Without associated path: check if name and description differ to decide
        // if description should appear besides the name to distinguish better
        if (!this.model.hasAssociatedFilePath) {
            const name = this.getName();
            const description = this.getDescription();
            if (description && description !== name) {
                return `${name} • ${description}`;
            }
            return name;
        }
        // With associated path: delegate to parent
        return super.getTitle(verbosity);
    }
    isDirty() {
        return this.model.isDirty();
    }
    getEncoding() {
        return this.model.getEncoding();
    }
    setEncoding(encoding, mode /* ignored, we only have Encode */) {
        return this.model.setEncoding(encoding);
    }
    get hasLanguageSetExplicitly() { return this.model.hasLanguageSetExplicitly; }
    get hasAssociatedFilePath() { return this.model.hasAssociatedFilePath; }
    setLanguageId(languageId, source) {
        this.model.setLanguageId(languageId, source);
    }
    getLanguageId() {
        return this.model.getLanguageId();
    }
    async resolve() {
        if (!this.modelResolve) {
            this.modelResolve = (async () => {
                // Acquire a model reference
                this.cachedUntitledTextEditorModelReference = await this.textModelService.createModelReference(this.resource);
            })();
        }
        await this.modelResolve;
        // It is possible that this input was disposed before the model
        // finished resolving. As such, we need to make sure to dispose
        // the model reference to not leak it.
        if (this.isDisposed()) {
            this.disposeModelReference();
        }
        return this.model;
    }
    toUntyped(options) {
        const untypedInput = {
            resource: this.model.hasAssociatedFilePath ? toLocalResource(this.model.resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme) : this.resource,
            forceUntitled: true,
            options: {
                override: this.editorId
            }
        };
        if (typeof options?.preserveViewState === 'number') {
            untypedInput.encoding = this.getEncoding();
            untypedInput.languageId = this.getLanguageId();
            untypedInput.contents = this.model.isModified() ? this.model.textEditorModel?.getValue() : undefined;
            untypedInput.options.viewState = findViewStateForEditor(this, options.preserveViewState, this.editorService);
            if (typeof untypedInput.contents === 'string' && !this.model.hasAssociatedFilePath && !options.preserveResource) {
                // Given how generic untitled resources in the system are, we
                // need to be careful not to set our resource into the untyped
                // editor if we want to transport contents too, because of
                // issue https://github.com/microsoft/vscode/issues/140898
                // The workaround is to simply remove the resource association
                // if we have contents and no associated resource.
                // In that case we can ensure that a new untitled resource is
                // being created and the contents can be restored properly.
                untypedInput.resource = undefined;
            }
        }
        return untypedInput;
    }
    matches(otherInput) {
        if (this === otherInput) {
            return true;
        }
        if (otherInput instanceof UntitledTextEditorInput_1) {
            return isEqual(otherInput.resource, this.resource);
        }
        if (isUntitledResourceEditorInput(otherInput)) {
            return super.matches(otherInput);
        }
        return false;
    }
    dispose() {
        // Model
        this.modelResolve = undefined;
        // Model reference
        this.disposeModelReference();
        super.dispose();
    }
    disposeModelReference() {
        dispose(this.cachedUntitledTextEditorModelReference);
        this.cachedUntitledTextEditorModelReference = undefined;
    }
};
UntitledTextEditorInput = UntitledTextEditorInput_1 = __decorate([
    __param(1, ITextFileService),
    __param(2, ILabelService),
    __param(3, IEditorService),
    __param(4, IFileService),
    __param(5, IWorkbenchEnvironmentService),
    __param(6, IPathService),
    __param(7, IFilesConfigurationService),
    __param(8, ITextModelService),
    __param(9, ITextResourceConfigurationService),
    __param(10, ICustomEditorLabelService)
], UntitledTextEditorInput);
export { UntitledTextEditorInput };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW50aXRsZWRUZXh0RWRpdG9ySW5wdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdW50aXRsZWQvY29tbW9uL3VudGl0bGVkVGV4dEVkaXRvcklucHV0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsc0JBQXNCLEVBQUUsNkJBQTZCLEVBQW9FLE1BQU0sMkJBQTJCLENBQUM7QUFFaE0sT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFcEcsT0FBTyxFQUFvRCxnQkFBZ0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3hILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDOUYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFjLE1BQU0sc0NBQXNDLENBQUM7QUFDNUYsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDcEgsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0saURBQWlELENBQUM7QUFFNUY7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