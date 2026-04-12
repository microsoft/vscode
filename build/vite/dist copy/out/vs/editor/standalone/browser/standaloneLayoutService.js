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
import * as dom from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { coalesce } from '../../../base/common/arrays.js';
import { Event } from '../../../base/common/event.js';
import { ICodeEditorService } from '../../browser/services/codeEditorService.js';
import { registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { ILayoutService } from '../../../platform/layout/browser/layoutService.js';
let StandaloneLayoutService = class StandaloneLayoutService {
    get mainContainer() {
        return this._codeEditorService.listCodeEditors().at(0)?.getContainerDomNode() ?? mainWindow.document.body;
    }
    get activeContainer() {
        const activeCodeEditor = this._codeEditorService.getFocusedCodeEditor() ?? this._codeEditorService.getActiveCodeEditor();
        return activeCodeEditor?.getContainerDomNode() ?? this.mainContainer;
    }
    get mainContainerDimension() {
        return dom.getClientArea(this.mainContainer);
    }
    get activeContainerDimension() {
        return dom.getClientArea(this.activeContainer);
    }
    get containers() {
        return coalesce(this._codeEditorService.listCodeEditors().map(codeEditor => codeEditor.getContainerDomNode()));
    }
    getContainer() {
        return this.activeContainer;
    }
    whenContainerStylesLoaded() { return undefined; }
    focus() {
        this._codeEditorService.getFocusedCodeEditor()?.focus();
    }
    constructor(_codeEditorService) {
        this._codeEditorService = _codeEditorService;
        this.onDidLayoutMainContainer = Event.None;
        this.onDidLayoutActiveContainer = Event.None;
        this.onDidLayoutContainer = Event.None;
        this.onDidChangeActiveContainer = Event.None;
        this.onDidAddContainer = Event.None;
        this.mainContainerOffset = { top: 0, quickPickTop: 0 };
        this.activeContainerOffset = { top: 0, quickPickTop: 0 };
    }
};
StandaloneLayoutService = __decorate([
    __param(0, ICodeEditorService)
], StandaloneLayoutService);
let EditorScopedLayoutService = class EditorScopedLayoutService extends StandaloneLayoutService {
    get mainContainer() {
        return this._container;
    }
    constructor(_container, codeEditorService) {
        super(codeEditorService);
        this._container = _container;
    }
};
EditorScopedLayoutService = __decorate([
    __param(1, ICodeEditorService)
], EditorScopedLayoutService);
export { EditorScopedLayoutService };
registerSingleton(ILayoutService, StandaloneLayoutService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZUxheW91dFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3Ivc3RhbmRhbG9uZS9icm93c2VyL3N0YW5kYWxvbmVMYXlvdXRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDakYsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzVHLE9BQU8sRUFBcUIsY0FBYyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFdEcsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBdUI7SUFTNUIsSUFBSSxhQUFhO1FBQ2hCLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxtQkFBbUIsRUFBRSxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO0lBQzNHLENBQUM7SUFFRCxJQUFJLGVBQWU7UUFDbEIsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztRQUV6SCxPQUFPLGdCQUFnQixFQUFFLG1CQUFtQixFQUFFLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQztJQUN0RSxDQUFDO0lBRUQsSUFBSSxzQkFBc0I7UUFDekIsT0FBTyxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQsSUFBSSx3QkFBd0I7UUFDM0IsT0FBTyxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBS0QsSUFBSSxVQUFVO1FBQ2IsT0FBTyxRQUFRLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNoSCxDQUFDO0lBRUQsWUFBWTtRQUNYLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQztJQUM3QixDQUFDO0lBRUQseUJBQXlCLEtBQUssT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBRWpELEtBQUs7UUFDSixJQUFJLENBQUMsa0JBQWtCLENBQUMsb0JBQW9CLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQztJQUN6RCxDQUFDO0lBRUQsWUFDcUIsa0JBQThDO1FBQXRDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUExQzFELDZCQUF3QixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDdEMsK0JBQTBCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN4Qyx5QkFBb0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2xDLCtCQUEwQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDeEMsc0JBQWlCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQW9CL0Isd0JBQW1CLEdBQXNCLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDckUsMEJBQXFCLEdBQXNCLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLENBQUM7SUFrQjVFLENBQUM7Q0FFTCxDQUFBO0FBaERLLHVCQUF1QjtJQTZDMUIsV0FBQSxrQkFBa0IsQ0FBQTtHQTdDZix1QkFBdUIsQ0FnRDVCO0FBRU0sSUFBTSx5QkFBeUIsR0FBL0IsTUFBTSx5QkFBMEIsU0FBUSx1QkFBdUI7SUFDckUsSUFBYSxhQUFhO1FBQ3pCLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQztJQUN4QixDQUFDO0lBQ0QsWUFDUyxVQUF1QixFQUNYLGlCQUFxQztRQUV6RCxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUhqQixlQUFVLEdBQVYsVUFBVSxDQUFhO0lBSWhDLENBQUM7Q0FDRCxDQUFBO0FBVlkseUJBQXlCO0lBTW5DLFdBQUEsa0JBQWtCLENBQUE7R0FOUix5QkFBeUIsQ0FVckM7O0FBRUQsaUJBQWlCLENBQUMsY0FBYyxFQUFFLHVCQUF1QixvQ0FBNEIsQ0FBQyJ9