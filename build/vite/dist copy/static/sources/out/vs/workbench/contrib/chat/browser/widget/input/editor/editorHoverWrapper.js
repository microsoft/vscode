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
import './media/editorHoverWrapper.css';
import * as dom from '../../../../../../../base/browser/dom.js';
import { HoverAction } from '../../../../../../../base/browser/ui/hover/hoverWidget.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
const $ = dom.$;
const h = dom.h;
/**
 * This borrows some of HoverWidget so that a chat editor hover can be rendered in the same way as a workbench hover.
 * Maybe it can be reusable in a generic way.
 */
let ChatEditorHoverWrapper = class ChatEditorHoverWrapper {
    constructor(hoverContentElement, actions, keybindingService) {
        this.keybindingService = keybindingService;
        const hoverElement = h('.chat-editor-hover-wrapper@root', [h('.chat-editor-hover-wrapper-content@content')]);
        this.domNode = hoverElement.root;
        hoverElement.content.appendChild(hoverContentElement);
        if (actions && actions.length > 0) {
            const statusBarElement = $('.hover-row.status-bar');
            const actionsElement = $('.actions');
            actions.forEach(action => {
                const keybinding = this.keybindingService.lookupKeybinding(action.commandId);
                const keybindingLabel = keybinding ? keybinding.getLabel() : null;
                HoverAction.render(actionsElement, {
                    label: action.label,
                    commandId: action.commandId,
                    run: e => {
                        action.run(e);
                    },
                    iconClass: action.iconClass
                }, keybindingLabel);
            });
            statusBarElement.appendChild(actionsElement);
            this.domNode.appendChild(statusBarElement);
        }
    }
};
ChatEditorHoverWrapper = __decorate([
    __param(2, IKeybindingService)
], ChatEditorHoverWrapper);
export { ChatEditorHoverWrapper };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9ySG92ZXJXcmFwcGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9lZGl0b3IvZWRpdG9ySG92ZXJXcmFwcGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sZ0NBQWdDLENBQUM7QUFDeEMsT0FBTyxLQUFLLEdBQUcsTUFBTSwwQ0FBMEMsQ0FBQztBQUVoRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDeEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFbkcsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNoQixNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRWhCOzs7R0FHRztBQUNJLElBQU0sc0JBQXNCLEdBQTVCLE1BQU0sc0JBQXNCO0lBR2xDLFlBQ0MsbUJBQWdDLEVBQ2hDLE9BQW1DLEVBQ0UsaUJBQXFDO1FBQXJDLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7UUFFMUUsTUFBTSxZQUFZLEdBQUcsQ0FBQyxDQUNyQixpQ0FBaUMsRUFDakMsQ0FBQyxDQUFDLENBQUMsNENBQTRDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLE9BQU8sR0FBRyxZQUFZLENBQUMsSUFBSSxDQUFDO1FBQ2pDLFlBQVksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFFdEQsSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNuQyxNQUFNLGdCQUFnQixHQUFHLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQ3BELE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNyQyxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO2dCQUN4QixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUM3RSxNQUFNLGVBQWUsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUNsRSxXQUFXLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRTtvQkFDbEMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLO29CQUNuQixTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVM7b0JBQzNCLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRTt3QkFDUixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNmLENBQUM7b0JBQ0QsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTO2lCQUMzQixFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQ3JCLENBQUMsQ0FBQyxDQUFDO1lBQ0gsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQzdDLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDNUMsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFBO0FBakNZLHNCQUFzQjtJQU1oQyxXQUFBLGtCQUFrQixDQUFBO0dBTlIsc0JBQXNCLENBaUNsQyJ9