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
var TextResourceEditorInput_1;
import { DEFAULT_EDITOR_ASSOCIATION, isResourceEditorInput } from '../editor.js';
import { AbstractResourceEditorInput } from './resourceEditorInput.js';
import { ITextFileService } from '../../services/textfile/common/textfiles.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { Schemas } from '../../../base/common/network.js';
import { isEqual } from '../../../base/common/resources.js';
import { ITextModelService } from '../../../editor/common/services/resolverService.js';
import { TextResourceEditorModel } from './textResourceEditorModel.js';
import { createTextBufferFactory } from '../../../editor/common/model/textModel.js';
import { IFilesConfigurationService } from '../../services/filesConfiguration/common/filesConfigurationService.js';
import { ITextResourceConfigurationService } from '../../../editor/common/services/textResourceConfiguration.js';
import { ICustomEditorLabelService } from '../../services/editor/common/customEditorLabelService.js';
/**
 * The base class for all editor inputs that open in text editors.
 */
let AbstractTextResourceEditorInput = class AbstractTextResourceEditorInput extends AbstractResourceEditorInput {
    constructor(resource, preferredResource, editorService, textFileService, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService) {
        super(resource, preferredResource, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
        this.editorService = editorService;
        this.textFileService = textFileService;
    }
    save(group, options) {
        // If this is neither an `untitled` resource, nor a resource
        // we can handle with the file service, we can only "Save As..."
        if (this.resource.scheme !== Schemas.untitled && !this.fileService.hasProvider(this.resource)) {
            return this.saveAs(group, options);
        }
        // Normal save
        return this.doSave(options, false, group);
    }
    saveAs(group, options) {
        return this.doSave(options, true, group);
    }
    async doSave(options, saveAs, group) {
        // Save / Save As
        let target;
        if (saveAs) {
            target = await this.textFileService.saveAs(this.resource, undefined, { ...options, suggestedTarget: this.preferredResource });
        }
        else {
            target = await this.textFileService.save(this.resource, options);
        }
        if (!target) {
            return undefined; // save cancelled
        }
        return { resource: target };
    }
    async revert(group, options) {
        await this.textFileService.revert(this.resource, options);
    }
};
AbstractTextResourceEditorInput = __decorate([
    __param(2, IEditorService),
    __param(3, ITextFileService),
    __param(4, ILabelService),
    __param(5, IFileService),
    __param(6, IFilesConfigurationService),
    __param(7, ITextResourceConfigurationService),
    __param(8, ICustomEditorLabelService)
], AbstractTextResourceEditorInput);
export { AbstractTextResourceEditorInput };
/**
 * A read-only text editor input whos contents are made of the provided resource that points to an existing
 * code editor model.
 */
let TextResourceEditorInput = class TextResourceEditorInput extends AbstractTextResourceEditorInput {
    static { TextResourceEditorInput_1 = this; }
    static { this.ID = 'workbench.editors.resourceEditorInput'; }
    get typeId() {
        return TextResourceEditorInput_1.ID;
    }
    get editorId() {
        return DEFAULT_EDITOR_ASSOCIATION.id;
    }
    constructor(resource, name, description, preferredLanguageId, preferredContents, textModelService, textFileService, editorService, fileService, labelService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService) {
        super(resource, undefined, editorService, textFileService, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
        this.name = name;
        this.description = description;
        this.preferredLanguageId = preferredLanguageId;
        this.preferredContents = preferredContents;
        this.textModelService = textModelService;
        this.cachedModel = undefined;
        this.modelReference = undefined;
    }
    getName() {
        return this.name || super.getName();
    }
    setName(name) {
        if (this.name !== name) {
            this.name = name;
            this._onDidChangeLabel.fire();
        }
    }
    getDescription() {
        return this.description;
    }
    setDescription(description) {
        if (this.description !== description) {
            this.description = description;
            this._onDidChangeLabel.fire();
        }
    }
    setLanguageId(languageId, source) {
        this.setPreferredLanguageId(languageId);
        this.cachedModel?.setLanguageId(languageId, source);
    }
    setPreferredLanguageId(languageId) {
        this.preferredLanguageId = languageId;
    }
    setPreferredContents(contents) {
        this.preferredContents = contents;
    }
    async resolve() {
        // Unset preferred contents and language after resolving
        // once to prevent these properties to stick. We still
        // want the user to change the language in the editor
        // and want to show updated contents (if any) in future
        // `resolve` calls.
        const preferredContents = this.preferredContents;
        const preferredLanguageId = this.preferredLanguageId;
        this.preferredContents = undefined;
        this.preferredLanguageId = undefined;
        if (!this.modelReference) {
            this.modelReference = this.textModelService.createModelReference(this.resource);
        }
        const ref = await this.modelReference;
        // Ensure the resolved model is of expected type
        const model = ref.object;
        if (!(model instanceof TextResourceEditorModel)) {
            ref.dispose();
            this.modelReference = undefined;
            throw new Error(`Unexpected model for TextResourceEditorInput: ${this.resource}`);
        }
        this.cachedModel = model;
        // Set contents and language if preferred
        if (typeof preferredContents === 'string' || typeof preferredLanguageId === 'string') {
            model.updateTextEditorModel(typeof preferredContents === 'string' ? createTextBufferFactory(preferredContents) : undefined, preferredLanguageId);
        }
        return model;
    }
    matches(otherInput) {
        if (this === otherInput) {
            return true;
        }
        if (otherInput instanceof TextResourceEditorInput_1) {
            return isEqual(otherInput.resource, this.resource);
        }
        if (isResourceEditorInput(otherInput)) {
            return super.matches(otherInput);
        }
        return false;
    }
    dispose() {
        if (this.modelReference) {
            this.modelReference.then(ref => ref.dispose());
            this.modelReference = undefined;
        }
        this.cachedModel = undefined;
        super.dispose();
    }
};
TextResourceEditorInput = TextResourceEditorInput_1 = __decorate([
    __param(5, ITextModelService),
    __param(6, ITextFileService),
    __param(7, IEditorService),
    __param(8, IFileService),
    __param(9, ILabelService),
    __param(10, IFilesConfigurationService),
    __param(11, ITextResourceConfigurationService),
    __param(12, ICustomEditorLabelService)
], TextResourceEditorInput);
export { TextResourceEditorInput };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dFJlc291cmNlRWRpdG9ySW5wdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29tbW9uL2VkaXRvci90ZXh0UmVzb3VyY2VFZGl0b3JJbnB1dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLDBCQUEwQixFQUFtQyxxQkFBcUIsRUFBdUIsTUFBTSxjQUFjLENBQUM7QUFFdkksT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFdkUsT0FBTyxFQUFFLGdCQUFnQixFQUEwQyxNQUFNLDZDQUE2QyxDQUFDO0FBQ3ZILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDNUQsT0FBTyxFQUFvQixpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRXZFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQ25ILE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2pILE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRXJHOztHQUVHO0FBQ0ksSUFBZSwrQkFBK0IsR0FBOUMsTUFBZSwrQkFBZ0MsU0FBUSwyQkFBMkI7SUFFeEYsWUFDQyxRQUFhLEVBQ2IsaUJBQWtDLEVBQ0MsYUFBNkIsRUFDM0IsZUFBaUMsRUFDdkQsWUFBMkIsRUFDNUIsV0FBeUIsRUFDWCx5QkFBcUQsRUFDOUMsZ0NBQW1FLEVBQzNFLHdCQUFtRDtRQUU5RSxLQUFLLENBQUMsUUFBUSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUseUJBQXlCLEVBQUUsZ0NBQWdDLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztRQVJsSCxrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7UUFDM0Isb0JBQWUsR0FBZixlQUFlLENBQWtCO0lBUXZFLENBQUM7SUFFUSxJQUFJLENBQUMsS0FBc0IsRUFBRSxPQUE4QjtRQUVuRSw0REFBNEQ7UUFDNUQsZ0VBQWdFO1FBQ2hFLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEtBQUssT0FBTyxDQUFDLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQy9GLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDcEMsQ0FBQztRQUVELGNBQWM7UUFDZCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRVEsTUFBTSxDQUFDLEtBQXNCLEVBQUUsT0FBOEI7UUFDckUsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUVPLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBeUMsRUFBRSxNQUFlLEVBQUUsS0FBa0M7UUFFbEgsaUJBQWlCO1FBQ2pCLElBQUksTUFBdUIsQ0FBQztRQUM1QixJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsRUFBRSxHQUFHLE9BQU8sRUFBRSxlQUFlLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQztRQUMvSCxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDbEUsQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE9BQU8sU0FBUyxDQUFDLENBQUMsaUJBQWlCO1FBQ3BDLENBQUM7UUFFRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDO0lBQzdCLENBQUM7SUFFUSxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQXNCLEVBQUUsT0FBd0I7UUFDckUsTUFBTSxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzNELENBQUM7Q0FDRCxDQUFBO0FBcERxQiwrQkFBK0I7SUFLbEQsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLGdCQUFnQixDQUFBO0lBQ2hCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLDBCQUEwQixDQUFBO0lBQzFCLFdBQUEsaUNBQWlDLENBQUE7SUFDakMsV0FBQSx5QkFBeUIsQ0FBQTtHQVhOLCtCQUErQixDQW9EcEQ7O0FBRUQ7OztHQUdHO0FBQ0ksSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBd0IsU0FBUSwrQkFBK0I7O2FBRTNELE9BQUUsR0FBVyx1Q0FBdUMsQUFBbEQsQ0FBbUQ7SUFFckUsSUFBYSxNQUFNO1FBQ2xCLE9BQU8seUJBQXVCLENBQUMsRUFBRSxDQUFDO0lBQ25DLENBQUM7SUFFRCxJQUFhLFFBQVE7UUFDcEIsT0FBTywwQkFBMEIsQ0FBQyxFQUFFLENBQUM7SUFDdEMsQ0FBQztJQUtELFlBQ0MsUUFBYSxFQUNMLElBQXdCLEVBQ3hCLFdBQStCLEVBQy9CLG1CQUF1QyxFQUN2QyxpQkFBcUMsRUFDMUIsZ0JBQW9ELEVBQ3JELGVBQWlDLEVBQ25DLGFBQTZCLEVBQy9CLFdBQXlCLEVBQ3hCLFlBQTJCLEVBQ2QseUJBQXFELEVBQzlDLGdDQUFtRSxFQUMzRSx3QkFBbUQ7UUFFOUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLHlCQUF5QixFQUFFLGdDQUFnQyxFQUFFLHdCQUF3QixDQUFDLENBQUM7UUFickssU0FBSSxHQUFKLElBQUksQ0FBb0I7UUFDeEIsZ0JBQVcsR0FBWCxXQUFXLENBQW9CO1FBQy9CLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBb0I7UUFDdkMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUNULHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFUaEUsZ0JBQVcsR0FBd0MsU0FBUyxDQUFDO1FBQzdELG1CQUFjLEdBQXNELFNBQVMsQ0FBQztJQWtCdEYsQ0FBQztJQUVRLE9BQU87UUFDZixPQUFPLElBQUksQ0FBQyxJQUFJLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFRCxPQUFPLENBQUMsSUFBWTtRQUNuQixJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDeEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7WUFFakIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQy9CLENBQUM7SUFDRixDQUFDO0lBRVEsY0FBYztRQUN0QixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDekIsQ0FBQztJQUVELGNBQWMsQ0FBQyxXQUFtQjtRQUNqQyxJQUFJLElBQUksQ0FBQyxXQUFXLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDdEMsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7WUFFL0IsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQy9CLENBQUM7SUFDRixDQUFDO0lBRUQsYUFBYSxDQUFDLFVBQWtCLEVBQUUsTUFBZTtRQUNoRCxJQUFJLENBQUMsc0JBQXNCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFeEMsSUFBSSxDQUFDLFdBQVcsRUFBRSxhQUFhLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFRCxzQkFBc0IsQ0FBQyxVQUFrQjtRQUN4QyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsVUFBVSxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxvQkFBb0IsQ0FBQyxRQUFnQjtRQUNwQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsUUFBUSxDQUFDO0lBQ25DLENBQUM7SUFFUSxLQUFLLENBQUMsT0FBTztRQUVyQix3REFBd0Q7UUFDeEQsc0RBQXNEO1FBQ3RELHFEQUFxRDtRQUNyRCx1REFBdUQ7UUFDdkQsbUJBQW1CO1FBQ25CLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDO1FBQ2pELE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDO1FBQ3JELElBQUksQ0FBQyxpQkFBaUIsR0FBRyxTQUFTLENBQUM7UUFDbkMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLFNBQVMsQ0FBQztRQUVyQyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNqRixDQUFDO1FBRUQsTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDO1FBRXRDLGdEQUFnRDtRQUNoRCxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxDQUFDLEtBQUssWUFBWSx1QkFBdUIsQ0FBQyxFQUFFLENBQUM7WUFDakQsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLGNBQWMsR0FBRyxTQUFTLENBQUM7WUFFaEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxpREFBaUQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDbkYsQ0FBQztRQUVELElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBRXpCLHlDQUF5QztRQUN6QyxJQUFJLE9BQU8saUJBQWlCLEtBQUssUUFBUSxJQUFJLE9BQU8sbUJBQW1CLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDdEYsS0FBSyxDQUFDLHFCQUFxQixDQUFDLE9BQU8saUJBQWlCLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUNsSixDQUFDO1FBRUQsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRVEsT0FBTyxDQUFDLFVBQTZDO1FBQzdELElBQUksSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQ3pCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUVELElBQUksVUFBVSxZQUFZLHlCQUF1QixFQUFFLENBQUM7WUFDbkQsT0FBTyxPQUFPLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDcEQsQ0FBQztRQUVELElBQUkscUJBQXFCLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUN2QyxPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbEMsQ0FBQztRQUVELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVRLE9BQU87UUFDZixJQUFJLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQy9DLElBQUksQ0FBQyxjQUFjLEdBQUcsU0FBUyxDQUFDO1FBQ2pDLENBQUM7UUFFRCxJQUFJLENBQUMsV0FBVyxHQUFHLFNBQVMsQ0FBQztRQUU3QixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQzs7QUFySVcsdUJBQXVCO0lBcUJqQyxXQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFdBQUEsZ0JBQWdCLENBQUE7SUFDaEIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsYUFBYSxDQUFBO0lBQ2IsWUFBQSwwQkFBMEIsQ0FBQTtJQUMxQixZQUFBLGlDQUFpQyxDQUFBO0lBQ2pDLFlBQUEseUJBQXlCLENBQUE7R0E1QmYsdUJBQXVCLENBc0luQyJ9