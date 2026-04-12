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
import * as dom from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ChatProgressContentPart } from './chatProgressContentPart.js';
import { ChatCollapsibleListContentPart } from './chatReferencesContentPart.js';
let ChatTaskContentPart = class ChatTaskContentPart extends Disposable {
    constructor(task, contentReferencesListPool, chatContentMarkdownRenderer, context, instantiationService) {
        super();
        this.task = task;
        if (task.progress.length) {
            this.isSettled = true;
            const refsPart = this._register(instantiationService.createInstance(ChatCollapsibleListContentPart, task.progress, task.content.value, context, contentReferencesListPool, undefined));
            this.domNode = dom.$('.chat-progress-task');
            this.domNode.appendChild(refsPart.domNode);
        }
        else {
            const isSettled = task.kind === 'progressTask' ?
                task.isSettled() :
                true;
            this.isSettled = isSettled;
            const showSpinner = !isSettled && !context.element.isComplete;
            const progressPart = this._register(instantiationService.createInstance(ChatProgressContentPart, task, chatContentMarkdownRenderer, context, showSpinner, true, undefined, undefined, undefined));
            this.domNode = progressPart.domNode;
        }
    }
    hasSameContent(other) {
        if (other.kind === 'progressTask' &&
            this.task.kind === 'progressTask' &&
            other.isSettled() !== this.isSettled) {
            return false;
        }
        return other.kind === this.task.kind &&
            other.progress.length === this.task.progress.length;
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
};
ChatTaskContentPart = __decorate([
    __param(4, IInstantiationService)
], ChatTaskContentPart);
export { ChatTaskContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRhc2tDb250ZW50UGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0VGFza0NvbnRlbnRQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBS3pHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSw4QkFBOEIsRUFBdUIsTUFBTSxnQ0FBZ0MsQ0FBQztBQUU5RixJQUFNLG1CQUFtQixHQUF6QixNQUFNLG1CQUFvQixTQUFRLFVBQVU7SUFLbEQsWUFDa0IsSUFBcUMsRUFDdEQseUJBQThDLEVBQzlDLDJCQUE4QyxFQUM5QyxPQUFzQyxFQUNmLG9CQUEyQztRQUVsRSxLQUFLLEVBQUUsQ0FBQztRQU5TLFNBQUksR0FBSixJQUFJLENBQWlDO1FBUXRELElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztZQUN0QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw4QkFBOEIsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3ZMLElBQUksQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1lBQzVDLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM1QyxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxJQUFJLEtBQUssY0FBYyxDQUFDLENBQUM7Z0JBQy9DLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO2dCQUNsQixJQUFJLENBQUM7WUFDTixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztZQUMzQixNQUFNLFdBQVcsR0FBRyxDQUFDLFNBQVMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDO1lBQzlELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLElBQUksRUFBRSwyQkFBMkIsRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDbE0sSUFBSSxDQUFDLE9BQU8sR0FBRyxZQUFZLENBQUMsT0FBTyxDQUFDO1FBQ3JDLENBQUM7SUFDRixDQUFDO0lBRUQsY0FBYyxDQUFDLEtBQTZDO1FBQzNELElBQ0MsS0FBSyxDQUFDLElBQUksS0FBSyxjQUFjO1lBQzdCLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLGNBQWM7WUFDakMsS0FBSyxDQUFDLFNBQVMsRUFBRSxLQUFLLElBQUksQ0FBQyxTQUFTLEVBQ25DLENBQUM7WUFDRixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJO1lBQ25DLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztJQUN0RCxDQUFDO0lBRUQsYUFBYSxDQUFDLFVBQXVCO1FBQ3BDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDNUIsQ0FBQztDQUNELENBQUE7QUE5Q1ksbUJBQW1CO0lBVTdCLFdBQUEscUJBQXFCLENBQUE7R0FWWCxtQkFBbUIsQ0E4Qy9CIn0=