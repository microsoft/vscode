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
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextEditorService } from '../../../../services/textfile/common/textEditorService.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { NO_TYPE_ID } from '../../../../services/workingCopy/common/workingCopy.js';
import { IWorkingCopyEditorService } from '../../../../services/workingCopy/common/workingCopyEditorService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
export class FileEditorInputSerializer {
    canSerialize(editorInput) {
        return true;
    }
    serialize(editorInput) {
        const fileEditorInput = editorInput;
        const resource = fileEditorInput.resource;
        const preferredResource = fileEditorInput.preferredResource;
        const serializedFileEditorInput = {
            resourceJSON: resource.toJSON(),
            preferredResourceJSON: isEqual(resource, preferredResource) ? undefined : preferredResource, // only storing preferredResource if it differs from the resource
            name: fileEditorInput.getPreferredName(),
            description: fileEditorInput.getPreferredDescription(),
            encoding: fileEditorInput.getEncoding(),
            modeId: fileEditorInput.getPreferredLanguageId() // only using the preferred user associated language here if available to not store redundant data
        };
        return JSON.stringify(serializedFileEditorInput);
    }
    deserialize(instantiationService, serializedEditorInput) {
        return instantiationService.invokeFunction(accessor => {
            const serializedFileEditorInput = JSON.parse(serializedEditorInput);
            const resource = URI.revive(serializedFileEditorInput.resourceJSON);
            const preferredResource = URI.revive(serializedFileEditorInput.preferredResourceJSON);
            const name = serializedFileEditorInput.name;
            const description = serializedFileEditorInput.description;
            const encoding = serializedFileEditorInput.encoding;
            const languageId = serializedFileEditorInput.modeId;
            const fileEditorInput = accessor.get(ITextEditorService).createTextEditor({ resource, label: name, description, encoding, languageId, forceFile: true });
            if (preferredResource) {
                fileEditorInput.setPreferredResource(preferredResource);
            }
            return fileEditorInput;
        });
    }
}
let FileEditorWorkingCopyEditorHandler = class FileEditorWorkingCopyEditorHandler extends Disposable {
    static { this.ID = 'workbench.contrib.fileEditorWorkingCopyEditorHandler'; }
    constructor(workingCopyEditorService, textEditorService, fileService) {
        super();
        this.textEditorService = textEditorService;
        this.fileService = fileService;
        this._register(workingCopyEditorService.registerHandler(this));
    }
    handles(workingCopy) {
        return workingCopy.typeId === NO_TYPE_ID && this.fileService.canHandleResource(workingCopy.resource);
    }
    handlesSync(workingCopy) {
        return workingCopy.typeId === NO_TYPE_ID && this.fileService.hasProvider(workingCopy.resource);
    }
    isOpen(workingCopy, editor) {
        if (!this.handlesSync(workingCopy)) {
            return false;
        }
        // Naturally it would make sense here to check for `instanceof FileEditorInput`
        // but because some custom editors also leverage text file based working copies
        // we need to do a weaker check by only comparing for the resource
        return isEqual(workingCopy.resource, editor.resource);
    }
    createEditor(workingCopy) {
        return this.textEditorService.createTextEditor({ resource: workingCopy.resource, forceFile: true });
    }
};
FileEditorWorkingCopyEditorHandler = __decorate([
    __param(0, IWorkingCopyEditorService),
    __param(1, ITextEditorService),
    __param(2, IFileService)
], FileEditorWorkingCopyEditorHandler);
export { FileEditorWorkingCopyEditorHandler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUVkaXRvckhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9maWxlcy9icm93c2VyL2VkaXRvcnMvZmlsZUVkaXRvckhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sbUNBQW1DLENBQUM7QUFHdkUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDL0YsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBR2xFLE9BQU8sRUFBMEIsVUFBVSxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDNUcsT0FBTyxFQUE2Qix5QkFBeUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBRTNJLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQVc3RSxNQUFNLE9BQU8seUJBQXlCO0lBRXJDLFlBQVksQ0FBQyxXQUF3QjtRQUNwQyxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxTQUFTLENBQUMsV0FBd0I7UUFDakMsTUFBTSxlQUFlLEdBQUcsV0FBOEIsQ0FBQztRQUN2RCxNQUFNLFFBQVEsR0FBRyxlQUFlLENBQUMsUUFBUSxDQUFDO1FBQzFDLE1BQU0saUJBQWlCLEdBQUcsZUFBZSxDQUFDLGlCQUFpQixDQUFDO1FBQzVELE1BQU0seUJBQXlCLEdBQStCO1lBQzdELFlBQVksRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFO1lBQy9CLHFCQUFxQixFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsRUFB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