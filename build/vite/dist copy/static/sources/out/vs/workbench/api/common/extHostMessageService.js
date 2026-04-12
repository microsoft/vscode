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
import { MainContext } from './extHost.protocol.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';
function isMessageItem(item) {
    return item && item.title;
}
let ExtHostMessageService = class ExtHostMessageService {
    constructor(mainContext, _logService) {
        this._logService = _logService;
        this._proxy = mainContext.getProxy(MainContext.MainThreadMessageService);
    }
    showMessage(extension, severity, message, optionsOrFirstItem, rest) {
        const options = {
            source: { identifier: extension.identifier, label: extension.displayName || extension.name }
        };
        let items;
        if (typeof optionsOrFirstItem === 'string' || isMessageItem(optionsOrFirstItem)) {
            items = [optionsOrFirstItem, ...rest];
        }
        else {
            options.modal = optionsOrFirstItem?.modal;
            options.useCustom = optionsOrFirstItem?.useCustom;
            options.detail = optionsOrFirstItem?.detail;
            items = rest;
        }
        if (options.useCustom) {
            checkProposedApiEnabled(extension, 'resolvers');
        }
        const commands = [];
        let hasCloseAffordance = false;
        for (let handle = 0; handle < items.length; handle++) {
            const command = items[handle];
            if (typeof command === 'string') {
                commands.push({ title: command, handle, isCloseAffordance: false });
            }
            else if (typeof command === 'object') {
                const { title, isCloseAffordance } = command;
                commands.push({ title, isCloseAffordance: !!isCloseAffordance, handle });
                if (isCloseAffordance) {
                    if (hasCloseAffordance) {
                        this._logService.warn(`[${extension.identifier}] Only one message item can have 'isCloseAffordance':`, command);
                    }
                    else {
                        hasCloseAffordance = true;
                    }
                }
            }
            else {
                this._logService.warn(`[${extension.identifier}] Invalid message item:`, command);
            }
        }
        return this._proxy.$showMessage(severity, message, options, commands).then(handle => {
            if (typeof handle === 'number') {
                return items[handle];
            }
            return undefined;
        });
    }
};
ExtHostMessageService = __decorate([
    __param(1, ILogService)
], ExtHostMessageService);
export { ExtHostMessageService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE1lc3NhZ2VTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdE1lc3NhZ2VTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBSWhHLE9BQU8sRUFBRSxXQUFXLEVBQXlFLE1BQU0sdUJBQXVCLENBQUM7QUFFM0gsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRXpGLFNBQVMsYUFBYSxDQUFDLElBQVM7SUFDL0IsT0FBTyxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQztBQUMzQixDQUFDO0FBRU0sSUFBTSxxQkFBcUIsR0FBM0IsTUFBTSxxQkFBcUI7SUFJakMsWUFDQyxXQUF5QixFQUNLLFdBQXdCO1FBQXhCLGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBRXRELElBQUksQ0FBQyxNQUFNLEdBQUcsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsd0JBQXdCLENBQUMsQ0FBQztJQUMxRSxDQUFDO0lBTUQsV0FBVyxDQUFDLFNBQWdDLEVBQUUsUUFBa0IsRUFBRSxPQUFlLEVBQUUsa0JBQW1GLEVBQUUsSUFBd0M7UUFFL00sTUFBTSxPQUFPLEdBQTZCO1lBQ3pDLE1BQU0sRUFBRSxFQUFFLFVBQVUsRUFBRSxTQUFTLENBQUMsVUFBVSxFQUFFLEtBQUssRUFBRSxTQUFTLENBQUMsV0FBVyxJQUFJLFNBQVMsQ0FBQyxJQUFJLEVBQUU7U0FDNUYsQ0FBQztRQUNGLElBQUksS0FBc0MsQ0FBQztRQUUzQyxJQUFJLE9BQU8sa0JBQWtCLEtBQUssUUFBUSxJQUFJLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUM7WUFDakYsS0FBSyxHQUFH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