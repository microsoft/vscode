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
import { Disposable } from '../../../base/common/lifecycle.js';
import { IChatStatusItemService } from '../../contrib/chat/browser/chatStatus/chatStatusItemService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext } from '../common/extHost.protocol.js';
let MainThreadChatStatus = class MainThreadChatStatus extends Disposable {
    constructor(_extHostContext, _chatStatusItemService) {
        super();
        this._chatStatusItemService = _chatStatusItemService;
    }
    $setEntry(id, entry) {
        this._chatStatusItemService.setOrUpdateEntry({
            id,
            label: entry.title,
            description: entry.description,
            detail: entry.detail,
        });
    }
    $disposeEntry(id) {
        this._chatStatusItemService.deleteEntry(id);
    }
};
MainThreadChatStatus = __decorate([
    extHostNamedCustomer(MainContext.MainThreadChatStatus),
    __param(1, IChatStatusItemService)
], MainThreadChatStatus);
export { MainThreadChatStatus };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENoYXRTdGF0dXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZENoYXRTdGF0dXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ3hHLE9BQU8sRUFBbUIsb0JBQW9CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM3RyxPQUFPLEVBQXFCLFdBQVcsRUFBNkIsTUFBTSwrQkFBK0IsQ0FBQztBQUduRyxJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFxQixTQUFRLFVBQVU7SUFFbkQsWUFDQyxlQUFnQyxFQUNTLHNCQUE4QztRQUV2RixLQUFLLEVBQUUsQ0FBQztRQUZpQywyQkFBc0IsR0FBdEIsc0JBQXNCLENBQXdCO0lBR3hGLENBQUM7SUFFRCxTQUFTLENBQUMsRUFBVSxFQUFFLEtBQXdCO1FBQzdDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxnQkFBZ0IsQ0FBQztZQUM1QyxFQUFFO1lBQ0YsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLO1lBQ2xCLFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVztZQUM5QixNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU07U0FDcEIsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELGFBQWEsQ0FBQyxFQUFVO1FBQ3ZCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDN0MsQ0FBQztDQUNELENBQUE7QUFyQlksb0JBQW9CO0lBRGhDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQztJQUtwRCxXQUFBLHNCQUFzQixDQUFBO0dBSlosb0JBQW9CLENBcUJoQyJ9