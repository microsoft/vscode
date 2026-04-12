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
var KeybindingsEditorInput_1;
import { Codicon } from '../../../../base/common/codicons.js';
import { OS } from '../../../../base/common/platform.js';
import * as nls from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { KeybindingsEditorModel } from './keybindingsEditorModel.js';
const KeybindingsEditorIcon = registerIcon('keybindings-editor-label-icon', Codicon.keyboard, nls.localize('keybindingsEditorLabelIcon', 'Icon of the keybindings editor label.'));
let KeybindingsEditorInput = class KeybindingsEditorInput extends EditorInput {
    static { KeybindingsEditorInput_1 = this; }
    static { this.ID = 'workbench.input.keybindings'; }
    constructor(instantiationService) {
        super();
        this.searchOptions = null;
        this.resource = undefined;
        this.keybindingsModel = instantiationService.createInstance(KeybindingsEditorModel, OS);
    }
    get typeId() {
        return KeybindingsEditorInput_1.ID;
    }
    getName() {
        return nls.localize('keybindingsInputName', "Keyboard Shortcuts");
    }
    getIcon() {
        return KeybindingsEditorIcon;
    }
    async resolve() {
        return this.keybindingsModel;
    }
    matches(otherInput) {
        return otherInput instanceof KeybindingsEditorInput_1;
    }
    dispose() {
        this.keybindingsModel.dispose();
        super.dispose();
    }
};
KeybindingsEditorInput = KeybindingsEditorInput_1 = __decorate([
    __param(0, IInstantiationService)
], KeybindingsEditorInput);
export { KeybindingsEditorInput };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ3NFZGl0b3JJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9icm93c2VyL2tleWJpbmRpbmdzRWRpdG9ySW5wdXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsRUFBRSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFekQsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFakYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBUXJFLE1BQU0scUJBQXFCLEdBQUcsWUFBWSxDQUFDLCtCQUErQixFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSx1Q0FBdUMsQ0FBQyxDQUFDLENBQUM7QUFFNUssSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBdUIsU0FBUSxXQUFXOzthQUV0QyxPQUFFLEdBQVcsNkJBQTZCLEFBQXhDLENBQXlDO0lBTzNELFlBQW1DLG9CQUEyQztRQUM3RSxLQUFLLEVBQUUsQ0FBQztRQUxULGtCQUFhLEdBQTJDLElBQUksQ0FBQztRQUVwRCxhQUFRLEdBQUcsU0FBUyxDQUFDO1FBSzdCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsc0JBQXNCLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDekYsQ0FBQztJQUVELElBQWEsTUFBTTtRQUNsQixPQUFPLHdCQUFzQixDQUFDLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0lBRVEsT0FBTztRQUNmLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFUSxPQUFPO1FBQ2YsT0FBTyxxQkFBcUIsQ0FBQztJQUM5QixDQUFDO0lBRVEsS0FBSyxDQUFDLE9BQU87UUFDckIsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUM7SUFDOUIsQ0FBQztJQUVRLE9BQU8sQ0FBQyxVQUE2QztRQUM3RCxPQUFPLFVBQVUsWUFBWSx3QkFBc0IsQ0FBQztJQUNyRCxDQUFDO0lBRVEsT0FBTztRQUNmLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUVoQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQzs7QUF2Q1csc0JBQXNCO0lBU3JCLFdBQUEscUJBQXFCLENBQUE7R0FUdEIsc0JBQXNCLENBd0NsQyJ9