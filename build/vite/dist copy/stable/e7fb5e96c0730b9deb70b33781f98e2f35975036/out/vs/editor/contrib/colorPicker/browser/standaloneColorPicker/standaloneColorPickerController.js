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
var StandaloneColorPickerController_1;
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorContextKeys } from '../../../../common/editorContextKeys.js';
import { StandaloneColorPickerWidget } from './standaloneColorPickerWidget.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
let StandaloneColorPickerController = class StandaloneColorPickerController extends Disposable {
    static { StandaloneColorPickerController_1 = this; }
    static { this.ID = 'editor.contrib.standaloneColorPickerController'; }
    constructor(_editor, _contextKeyService, _instantiationService) {
        super();
        this._editor = _editor;
        this._instantiationService = _instantiationService;
        this._standaloneColorPickerWidget = null;
        this._standaloneColorPickerVisible = EditorContextKeys.standaloneColorPickerVisible.bindTo(_contextKeyService);
        this._standaloneColorPickerFocused = EditorContextKeys.standaloneColorPickerFocused.bindTo(_contextKeyService);
    }
    showOrFocus() {
        if (!this._editor.hasModel()) {
            return;
        }
        if (!this._standaloneColorPickerVisible.get()) {
            this._standaloneColorPickerWidget = this._instantiationService.createInstance(StandaloneColorPickerWidget, this._editor, this._standaloneColorPickerVisible, this._standaloneColorPickerFocused);
        }
        else if (!this._standaloneColorPickerFocused.get()) {
            this._standaloneColorPickerWidget?.focus();
        }
    }
    hide() {
        this._standaloneColorPickerFocused.set(false);
        this._standaloneColorPickerVisible.set(false);
        this._standaloneColorPickerWidget?.hide();
        this._editor.focus();
    }
    insertColor() {
        this._standaloneColorPickerWidget?.updateEditor();
        this.hide();
    }
    static get(editor) {
        return editor.getContribution(StandaloneColorPickerController_1.ID);
    }
};
StandaloneColorPickerController = StandaloneColorPickerController_1 = __decorate([
    __param(1, IContextKeyService),
    __param(2, IInstantiationService)
], StandaloneColorPickerController);
export { StandaloneColorPickerController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZUNvbG9yUGlja2VyQ29udHJvbGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2NvbG9yUGlja2VyL2Jyb3dzZXIvc3RhbmRhbG9uZUNvbG9yUGlja2VyL3N0YW5kYWxvbmVDb2xvclBpY2tlckNvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBR3RHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUU5RCxJQUFNLCtCQUErQixHQUFyQyxNQUFNLCtCQUFnQyxTQUFRLFVBQVU7O2FBRWhELE9BQUUsR0FBRyxnREFBZ0QsQUFBbkQsQ0FBb0Q7SUFLcEUsWUFDa0IsT0FBb0IsRUFDakIsa0JBQXNDLEVBQ25DLHFCQUE2RDtRQUVwRixLQUFLLEVBQUUsQ0FBQztRQUpTLFlBQU8sR0FBUCxPQUFPLENBQWE7UUFFRywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBUDdFLGlDQUE0QixHQUF1QyxJQUFJLENBQUM7UUFVL0UsSUFBSSxDQUFDLDZCQUE2QixHQUFHLGlCQUFpQixDQUFDLDRCQUE0QixDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQy9HLElBQUksQ0FBQyw2QkFBNkIsR0FBRyxpQkFBaUIsQ0FBQyw0QkFBNEIsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUNoSCxDQUFDO0lBRU0sV0FBVztRQUNqQixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO1lBQzlCLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO1lBQy9DLElBQUksQ0FBQyw0QkFBNEIsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUM1RSwyQkFBMkIsRUFDM0IsSUFBSSxDQUFDLE9BQU8sRUFDWixJQUFJLENBQUMsNkJBQTZCLEVBQ2xDLElBQUksQ0FBQyw2QkFBNkIsQ0FDbEMsQ0FBQztRQUNILENBQUM7YUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUM7WUFDdEQsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEtBQUssRUFBRSxDQUFDO1FBQzVDLENBQUM7SUFDRixDQUFDO0lBRU0sSUFBSTtRQUNWLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM5QyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsSUFBSSxFQUFFLENBQUM7UUFDMUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRU0sV0FBVztRQUNqQixJQUFJLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxFQUFFLENBQUM7UUFDbEQsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2IsQ0FBQztJQUVNLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBbUI7UUFDcEMsT0FBTyxNQUFNLENBQUMsZUFBZSxDQUFrQyxpQ0FBK0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNwRyxDQUFDOztBQS9DVywrQkFBK0I7SUFTekMsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLHFCQUFxQixDQUFBO0dBVlgsK0JBQStCLENBZ0QzQyJ9