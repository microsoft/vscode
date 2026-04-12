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
import { BaseTextEditorModel } from './textEditorModel.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { ILanguageDetectionService } from '../../services/languageDetection/common/languageDetectionWorkerService.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
/**
 * An editor model for in-memory, readonly text content that
 * is backed by an existing editor model.
 */
let TextResourceEditorModel = class TextResourceEditorModel extends BaseTextEditorModel {
    constructor(resource, languageService, modelService, languageDetectionService, accessibilityService) {
        super(modelService, languageService, languageDetectionService, accessibilityService, resource);
    }
    dispose() {
        // force this class to dispose the underlying model
        if (this.textEditorModelHandle) {
            this.modelService.destroyModel(this.textEditorModelHandle);
        }
        super.dispose();
    }
};
TextResourceEditorModel = __decorate([
    __param(1, ILanguageService),
    __param(2, IModelService),
    __param(3, ILanguageDetectionService),
    __param(4, IAccessibilityService)
], TextResourceEditorModel);
export { TextResourceEditorModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dFJlc291cmNlRWRpdG9yTW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29tbW9uL2VkaXRvci90ZXh0UmVzb3VyY2VFZGl0b3JNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUUzRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNoRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDekUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMkVBQTJFLENBQUM7QUFDdEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFaEc7OztHQUdHO0FBQ0ksSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBd0IsU0FBUSxtQkFBbUI7SUFFL0QsWUFDQyxRQUFhLEVBQ0ssZUFBaUMsRUFDcEMsWUFBMkIsRUFDZix3QkFBbUQsRUFDdkQsb0JBQTJDO1FBRWxFLEtBQUssQ0FBQyxZQUFZLEVBQUUsZUFBZSxFQUFFLHdCQUF3QixFQUFFLG9CQUFvQixFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ2hHLENBQUM7SUFFUSxPQUFPO1FBRWYsbURBQW1EO1FBQ25ELElBQUksSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7WUFDaEMsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDNUQsQ0FBQztRQUVELEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNqQixDQUFDO0NBQ0QsQ0FBQTtBQXJCWSx1QkFBdUI7SUFJakMsV0FBQSxnQkFBZ0IsQ0FBQTtJQUNoQixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEseUJBQXlCLENBQUE7SUFDekIsV0FBQSxxQkFBcUIsQ0FBQTtHQVBYLHVCQUF1QixDQXFCbkMifQ==