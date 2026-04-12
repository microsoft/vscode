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
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ChatCollapsibleListContentPart } from '../chatReferencesContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { getToolApprovalMessage } from './chatToolPartUtilities.js';
let ChatResultListSubPart = class ChatResultListSubPart extends BaseChatToolInvocationSubPart {
    constructor(toolInvocation, context, message, toolDetails, listPool, instantiationService) {
        super(toolInvocation);
        this.codeblocks = [];
        const collapsibleListPart = this._register(instantiationService.createInstance(ChatCollapsibleListContentPart, toolDetails.map(detail => ({
            kind: 'reference',
            reference: detail,
        })), message, context, listPool, getToolApprovalMessage(toolInvocation)));
        collapsibleListPart.icon = Codicon.check;
        this.domNode = collapsibleListPart.domNode;
    }
};
ChatResultListSubPart = __decorate([
    __param(5, IInstantiationService)
], ChatResultListSubPart);
export { ChatResultListSubPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFJlc3VsdExpc3RTdWJQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFJlc3VsdExpc3RTdWJQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUl2RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUk1RyxPQUFPLEVBQUUsOEJBQThCLEVBQWlELE1BQU0saUNBQWlDLENBQUM7QUFDaEksT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDL0UsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFN0QsSUFBTSxxQkFBcUIsR0FBM0IsTUFBTSxxQkFBc0IsU0FBUSw2QkFBNkI7SUFJdkUsWUFDQyxjQUFtRSxFQUNuRSxPQUFzQyxFQUN0QyxPQUFpQyxFQUNqQyxXQUFrQyxFQUNsQyxRQUE2QixFQUNOLG9CQUEyQztRQUVsRSxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7UUFWUCxlQUFVLEdBQXlCLEVBQUUsQ0FBQztRQVlyRCxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUM3RSw4QkFBOEIsRUFDOUIsV0FBVyxDQUFDLEdBQUcsQ0FBMkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3BELElBQUksRUFBRSxXQUFXO1lBQ2pCLFNBQVMsRUFBRSxNQUFNO1NBQ2pCLENBQUMsQ0FBQyxFQUNILE9BQU8sRUFDUCxPQUFPLEVBQ1AsUUFBUSxFQUNSLHNCQUFzQixDQUFDLGNBQWMsQ0FBQyxDQUN0QyxDQUFDLENBQUM7UUFDSCxtQkFBbUIsQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQztRQUN6QyxJQUFJLENBQUMsT0FBTyxHQUFHLG1CQUFtQixDQUFDLE9BQU8sQ0FBQztJQUM1QyxDQUFDO0NBQ0QsQ0FBQTtBQTVCWSxxQkFBcUI7SUFVL0IsV0FBQSxxQkFBcUIsQ0FBQTtHQVZYLHFCQUFxQixDQTRCakMifQ==