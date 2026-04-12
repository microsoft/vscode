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
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { TERMINAL_VIEW_ID } from '../common/terminal.js';
let TerminalEditingService = class TerminalEditingService {
    constructor(_viewsService) {
        this._viewsService = _viewsService;
    }
    getEditableData(instance) {
        return this._editable && this._editable.instance === instance ? this._editable.data : undefined;
    }
    setEditable(instance, data) {
        if (!data) {
            this._editable = undefined;
        }
        else {
            this._editable = { instance: instance, data };
        }
        const pane = this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
        const isEditing = this.isEditable(instance);
        pane?.terminalTabbedView?.setEditable(isEditing);
    }
    isEditable(instance) {
        return !!this._editable && (this._editable.instance === instance || !instance);
    }
    getEditingTerminal() {
        return this._editingTerminal;
    }
    setEditingTerminal(instance) {
        this._editingTerminal = instance;
    }
};
TerminalEditingService = __decorate([
    __param(0, IViewsService)
], TerminalEditingService);
export { TerminalEditingService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFZGl0aW5nU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxFZGl0aW5nU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFL0UsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFHbEQsSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBc0I7SUFNbEMsWUFDaUMsYUFBNEI7UUFBNUIsa0JBQWEsR0FBYixhQUFhLENBQWU7SUFFN0QsQ0FBQztJQUVELGVBQWUsQ0FBQyxRQUEyQjtRQUMxQyxPQUFPLElBQUksQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0lBQ2pHLENBQUM7SUFFRCxXQUFXLENBQUMsUUFBMkIsRUFBRSxJQUEwQjtRQUNsRSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDWCxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUM1QixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxTQUFTLEdBQUcsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDO1FBQy9DLENBQUM7UUFDRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLG1CQUFtQixDQUFtQixnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3hGLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDNUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNsRCxDQUFDO0lBRUQsVUFBVSxDQUFDLFFBQXVDO1FBQ2pELE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsS0FBSyxRQUFRLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBRUQsa0JBQWtCO1FBQ2pCLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDO0lBQzlCLENBQUM7SUFFRCxrQkFBa0IsQ0FBQyxRQUF1QztRQUN6RCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsUUFBUSxDQUFDO0lBQ2xDLENBQUM7Q0FDRCxDQUFBO0FBckNZLHNCQUFzQjtJQU9oQyxXQUFBLGFBQWEsQ0FBQTtHQVBILHNCQUFzQixDQXFDbEMifQ==