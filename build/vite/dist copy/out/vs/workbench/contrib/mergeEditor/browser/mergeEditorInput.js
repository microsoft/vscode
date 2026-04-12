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
var MergeEditorInput_1;
import { assertFn } from '../../../../base/common/assert.js';
import { autorun } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { isDefined } from '../../../../base/common/types.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { DEFAULT_EDITOR_ASSOCIATION, isResourceMergeEditorInput } from '../../../common/editor.js';
import { ICustomEditorLabelService } from '../../../services/editor/common/customEditorLabelService.js';
import { AbstractTextResourceEditorInput } from '../../../common/editor/textResourceEditorInput.js';
import { TempFileMergeEditorModeFactory, WorkspaceMergeEditorModeFactory } from './mergeEditorInputModel.js';
import { MergeEditorTelemetry } from './telemetry.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { ILogService } from '../../../../platform/log/common/log.js';
export class MergeEditorInputData {
    constructor(uri, title, detail, description) {
        this.uri = uri;
        this.title = title;
        this.detail = detail;
        this.description = description;
    }
}
let MergeEditorInput = class MergeEditorInput extends AbstractTextResourceEditorInput {
    static { MergeEditorInput_1 = this; }
    static { this.ID = 'mergeEditor.Input'; }
    get useWorkingCopy() {
        return this.configurationService.getValue('mergeEditor.useWorkingCopy') ?? false;
    }
    constructor(base, input1, input2, result, _instaService, editorService, textFileService, labelService, fileService, configurationService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService, logService) {
        super(result, undefined, editorService, textFileService, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
        this.base = base;
        this.input1 = input1;
        this.input2 = input2;
        this.result = result;
        this._instaService = _instaService;
        this.configurationService = configurationService;
        this.logService = logService;
        this._focusedEditor = 'result';
        this.closeHandler = {
            showConfirm: () => this._inputModel?.shouldConfirmClose() ?? false,
            confirm: async (editors) => {
                assertFn(() => editors.every(e => e.editor instanceof MergeEditorInput_1));
                const inputModels = editors.map(e => e.editor._inputModel).filter(isDefined);
                return await this._inputModel.confirmClose(inputModels);
            },
        };
        this.mergeEditorModeFactory = this._instaService.createInstance(this.useWorkingCopy
            ? TempFileMergeEditorModeFactory
            : WorkspaceMergeEditorModeFactory, this._instaService.createInstance(MergeEditorTelemetry));
    }
    dispose() {
        super.dispose();
    }
    get typeId() {
        return MergeEditorInput_1.ID;
    }
    get editorId() {
        return DEFAULT_EDITOR_ASSOCIATION.id;
    }
    get capabilities() {
        let capabilities = super.capabilities | 256 /* EditorInputCapabilities.MultipleEditors */;
        if (this.useWorkingCopy) {
            capabilities |= 4 /* EditorInputCapabilities.Untitled */;
        }
        return capabilities;
    }
    getName() {
        return localize('name', "Merging: {0}", super.getName());
    }
    async resolve() {
        if (!this._inputModel) {
            const inputModel = this._register(await this.mergeEditorModeFactory.createInputModel({
                base: this.base,
                input1: this.input1,
                input2: this.input2,
                result: this.result,
            }));
            this._inputModel = inputModel;
            this._register(autorun(reader => {
                /** @description fire dirty event */
                inputModel.isDirty.read(reader);
                this._onDidChangeDirty.fire();
            }));
            await this._inputModel.model.onInitialized;
        }
        return this._inputModel;
    }
    async accept() {
        await this._inputModel?.accept();
    }
    async save(group, options) {
        await this._inputModel?.save(options);
        return undefined;
    }
    toUntyped() {
        return {
            input1: { resource: this.input1.uri, label: this.input1.title, description: this.input1.description, detail: this.input1.detail },
            input2: { resource: this.input2.uri, label: this.input2.title, description: this.input2.description, detail: this.input2.detail },
            base: { resource: this.base },
            result: { resource: this.result },
            options: {
                override: this.typeId
            }
        };
    }
    matches(otherInput) {
        if (this === otherInput) {
            return true;
        }
        if (otherInput instanceof MergeEditorInput_1) {
            return isEqual(this.base, otherInput.base)
                && isEqual(this.input1.uri, otherInput.input1.uri)
                && isEqual(this.input2.uri, otherInput.input2.uri)
                && isEqual(this.result, otherInput.result);
        }
        if (isResourceMergeEditorInput(otherInput)) {
            return (this.editorId === otherInput.options?.override || otherInput.options?.override === undefined)
                && isEqual(this.base, otherInput.base.resource)
                && isEqual(this.input1.uri, otherInput.input1.resource)
                && isEqual(this.input2.uri, otherInput.input2.resource)
                && isEqual(this.result, otherInput.result.resource);
        }
        return false;
    }
    async revert(group, options) {
        return this._inputModel?.revert(options);
    }
    // ---- FileEditorInput
    isDirty() {
        return this._inputModel?.isDirty.get() ?? false;
    }
    setLanguageId(languageId, source) {
        this._inputModel?.model.setLanguageId(languageId, source);
    }
    /**
     * Updates the focused editor and triggers a name change event
     */
    updateFocusedEditor(editor) {
        if (this._focusedEditor !== editor) {
            this._focusedEditor = editor;
            this.logService.trace('alertFocusedEditor', editor);
            alertFocusedEditor(editor);
        }
    }
};
MergeEditorInput = MergeEditorInput_1 = __decorate([
    __param(4, IInstantiationService),
    __param(5, IEditorService),
    __param(6, ITextFileService),
    __param(7, ILabelService),
    __param(8, IFileService),
    __param(9, IConfigurationService),
    __param(10, IFilesConfigurationService),
    __param(11, ITextResourceConfigurationService),
    __param(12, ICustomEditorLabelService),
    __param(13, ILogService)
], MergeEditorInput);
export { MergeEditorInput };
function alertFocusedEditor(editor) {
    switch (editor) {
        case 'input1':
            alert(localize('mergeEditor.input1', "Incoming, Left Input"));
            break;
        case 'input2':
            alert(localize('mergeEditor.input2', "Current, Right Input"));
            break;
        case 'result':
            alert(localize('mergeEditor.result', "Merge Result"));
            break;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVyZ2VFZGl0b3JJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvbWVyZ2VFZGl0b3JJbnB1dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTdELE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3BILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSwwQkFBMEIsRUFBc0UsMEJBQTBCLEVBQXVCLE1BQU0sMkJBQTJCLENBQUM7QUFFNUwsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDeEcsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDcEcsT0FBTyxFQUEwQiw4QkFBOEIsRUFBRSwrQkFBK0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3JJLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUN0SCxPQUFPLEVBQTBDLGdCQUFnQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDMUgsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVyRSxNQUFNLE9BQU8sb0JBQW9CO0lBQ2hDLFlBQ1UsR0FBUSxFQUNSLEtBQXlCLEVBQ3pCLE1BQTBCLEVBQzFCLFdBQStCO1FBSC9CLFFBQUcsR0FBSCxHQUFHLENBQUs7UUFDUixVQUFLLEdBQUwsS0FBSyxDQUFvQjtRQUN6QixXQUFNLEdBQU4sTUFBTSxDQUFvQjtRQUMxQixnQkFBVyxHQUFYLFdBQVcsQ0FBb0I7SUFDckMsQ0FBQztDQUNMO0FBRU0sSUFBTSxnQkFBZ0IsR0FBdEIsTUFBTSxnQkFBaUIsU0FBUSwrQkFBK0I7O2FBQ3BELE9BQUUsR0FBRyxtQkFBbUIsQUFBdEIsQ0FBdUI7SUFRekMsSUFBWSxjQUFjO1FBQ3pCLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLEtBQUssQ0FBQztJQUNsRixDQUFDO0lBRUQsWUFDaUIsSUFBUyxFQUNULE1BQTRCLEVBQzVCLE1BQTRCLEVBQzVCLE1BQVcsRUFDYSxhQUFvQyxFQUM1RCxhQUE2QixFQUMzQixlQUFpQyxFQUNwQyxZQUEyQixFQUM1QixXQUF5QixFQUNDLG9CQUEyQyxFQUN2RCx5QkFBcUQsRUFDOUMsZ0NBQW1FLEVBQzNFLHdCQUFtRCxFQUNoRCxVQUF1QjtRQUVyRCxLQUFLLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUseUJBQXlCLEVBQUUsZ0NBQWdDLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztRQWYzSixTQUFJLEdBQUosSUFBSSxDQUFLO1FBQ1QsV0FBTSxHQUFOLE1BQU0sQ0FBc0I7UUFDNUIsV0FBTSxHQUFOLE1BQU0sQ0FBc0I7UUFDNUIsV0FBTSxHQUFOLE1BQU0sQ0FBSztRQUNhLGtCQUFhLEdBQWIsYUFBYSxDQUF1QjtRQUtwQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBSXJELGVBQVUsR0FBVixVQUFVLENBQWE7UUFHckQsSUFBSSxDQUFDLGNBQWMsR0FBRyxRQUFRLENBQUM7UUFDL0IsSUFBSSxDQUFDLFlBQVksR0FBRztZQUNuQixXQUFXLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLEtBQUs7WUFDbEUsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsRUFBRTtnQkFDMUIsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxZQUFZLGtCQUFnQixDQUFDLENBQUMsQ0FBQztnQkFDekUsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFFLENBQUMsQ0FBQyxNQUEyQixDQUFDLFdBQVcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDbkcsT0FBTyxNQUFNLElBQUksQ0FBQyxXQUFZLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzFELENBQUM7U0FDRCxDQUFDO1FBQ0YsSUFBSSxDQUFDLHNCQUFzQixHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUM5RCxJQUFJLENBQUMsY0FBYztZQUNsQixDQUFDLENBQUMsOEJBQThCO1lBQ2hDLENBQUMsQ0FBQywrQkFBK0IsRUFDbEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLENBQUMsQ0FDdkQsQ0FBQztJQUNILENBQUM7SUFFUSxPQUFPO1FBQ2YsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxJQUFhLE1BQU07UUFDbEIsT0FBTyxrQkFBZ0IsQ0FBQyxFQUFFLENBQUM7SUFDNUIsQ0FBQztJQUVELElBQWEsUUFBUTtRQUNwQixPQUFPLDBCQUEwQixDQUFDLEVBQUUsQ0FBQztJQUN0QyxDQUFDO0lBRUQsSUFBYSxZQUFZO1FBQ3hCLElBQUksWUFBWSxHQUFHLEtBQUssQ0FBQyxZQUFZLG9EQUEwQyxDQUFDO1FBQ2hGLElBQUksSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3pCLFlBQVksNENBQW9DLENBQUM7UUFDbEQsQ0FBQztRQUNELE9BQU8sWUFBWSxDQUFDO0lBQ3JCLENBQUM7SUFFUSxPQUFPO1FBQ2YsT0FBTyxRQUFRLENBQUMsTUFBTSxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBSVEsS0FBSyxDQUFDLE9BQU87UUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN2QixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixDQUFDLGdCQUFnQixDQUFDO2dCQUNwRixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7Z0JBQ2YsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO2dCQUNuQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07Z0JBQ25CLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTthQUNuQixDQUFDLENBQUMsQ0FBQztZQUNKLElBQUksQ0FBQyxXQUFXLEdBQUcsVUFBVSxDQUFDO1lBRTlCLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO2dCQUMvQixvQ0FBb0M7Z0JBQ3BDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNoQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDL0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVKLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDO1FBQzVDLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDekIsQ0FBQztJQUVNLEtBQUssQ0FBQyxNQUFNO1FBQ2xCLE1BQU0sSUFBSSxDQUFDLFdBQVcsRUFBRSxNQUFNLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0lBRVEsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFhLEVBQUUsT0FBMEM7UUFDNUUsTUFBTSxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN0QyxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRVEsU0FBUztRQUNqQixPQUFPO1lBQ04sTUFBTSxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFO1lBQ2pJLE1BQU0sRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRTtZQUNqSSxJQUFJLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRTtZQUM3QixNQUFNLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNqQyxPQUFPLEVBQUU7Z0JBQ1IsUUFBUSxFQUFFLElBQUksQ0FBQyxNQUFNO2FBQ3JCO1NBQ0QsQ0FBQztJQUNILENBQUM7SUFFUSxPQUFPLENBQUMsVUFBNkM7UUFDN0QsSUFBSSxJQUFJLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDekIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsSUFBSSxVQUFVLFlBQVksa0JBQWdCLEVBQUUsQ0FBQztZQUM1QyxPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUM7bUJBQ3RDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxVQUFVLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQzttQkFDL0MsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLFVBQVUsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDO21CQUMvQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUNELElBQUksMEJBQTBCLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUM1QyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsS0FBSyxVQUFVLENBQUMsT0FBTyxFQUFFLFFBQVEsSUFBSSxVQUFVLENBQUMsT0FBTyxFQUFFLFFBQVEsS0FBSyxTQUFTLENBQUM7bUJBQ2pHLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO21CQUM1QyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsVUFBVSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7bUJBQ3BELE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxVQUFVLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQzttQkFDcEQsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN0RCxDQUFDO1FBRUQsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRVEsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFhLEVBQUUsT0FBd0I7UUFDNUQsT0FBTyxJQUFJLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBRUQsdUJBQXVCO0lBRWQsT0FBTztRQUNmLE9BQU8sSUFBSSxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsR0FBRyxFQUFFLElBQUksS0FBSyxDQUFDO0lBQ2pELENBQUM7SUFFRCxhQUFhLENBQUMsVUFBa0IsRUFBRSxNQUFlO1FBQ2hELElBQUksQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLGFBQWEsQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVEOztPQUVHO0lBQ0ksbUJBQW1CLENBQUMsTUFBdUI7UUFDakQsSUFBSSxJQUFJLENBQUMsY0FBYyxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ3BDLElBQUksQ0FBQyxjQUFjLEdBQUcsTUFBTSxDQUFDO1lBQzdCLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLG9CQUFvQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3BELGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVCLENBQUM7SUFDRixDQUFDOztBQWhLVyxnQkFBZ0I7SUFrQjFCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLGdCQUFnQixDQUFBO0lBQ2hCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFlBQUEsMEJBQTBCLENBQUE7SUFDMUIsWUFBQSxpQ0FBaUMsQ0FBQTtJQUNqQyxZQUFBLHlCQUF5QixDQUFBO0lBQ3pCLFlBQUEsV0FBVyxDQUFBO0dBM0JELGdCQUFnQixDQW1LNUI7O0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxNQUF1QjtJQUNsRCxRQUFRLE1BQU0sRUFBRSxDQUFDO1FBQ2hCLEtBQUssUUFBUTtZQUNaLEtBQUssQ0FBQyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1lBQzlELE1BQU07UUFDUCxLQUFLLFFBQVE7WUFDWixLQUFLLENBQUMsUUFBUSxDQUFDLG9CQUFvQixFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztZQUM5RCxNQUFNO1FBQ1AsS0FBSyxRQUFRO1lBQ1osS0FBSyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO1lBQ3RELE1BQU07SUFDUixDQUFDO0FBQ0YsQ0FBQyJ9