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
import { timeout } from '../../../../base/common/async.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IDebugService } from '../../debug/common/debug.js';
import { McpDevModeDebugging } from '../common/mcpDevMode.js';
let McpDevModeDebuggingNode = class McpDevModeDebuggingNode extends McpDevModeDebugging {
    constructor(debugService, commandService, _nativeHostService) {
        super(debugService, commandService);
        this._nativeHostService = _nativeHostService;
    }
    async ensureListeningOnPort(port) {
        const deadline = Date.now() + 30_000;
        while (await this._nativeHostService.isPortFree(port) && Date.now() < deadline) {
            await timeout(50);
        }
    }
    getDebugPort() {
        return this._nativeHostService.findFreePort(5000, 10 /* try 10 ports */, 5000 /* try up to 5 seconds */, 2048 /* skip 2048 ports between attempts */);
    }
};
McpDevModeDebuggingNode = __decorate([
    __param(0, IDebugService),
    __param(1, ICommandService),
    __param(2, INativeHostService)
], McpDevModeDebuggingNode);
export { McpDevModeDebuggingNode };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwRGV2TW9kZURlYnVnZ2luZ05vZGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvZWxlY3Ryb24tYnJvd3Nlci9tY3BEZXZNb2RlRGVidWdnaW5nTm9kZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUV2RCxJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF3QixTQUFRLG1CQUFtQjtJQUMvRCxZQUNnQixZQUEyQixFQUN6QixjQUErQixFQUNYLGtCQUFzQztRQUUzRSxLQUFLLENBQUMsWUFBWSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBRkMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtJQUc1RSxDQUFDO0lBRWtCLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFZO1FBQzFELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUM7UUFDckMsT0FBTyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLFFBQVEsRUFBRSxDQUFDO1lBQ2hGLE1BQU0sT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ25CLENBQUM7SUFDRixDQUFDO0lBRWtCLFlBQVk7UUFDOUIsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLHlCQUF5QixFQUFFLElBQUksQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO0lBQ3ZKLENBQUM7Q0FDRCxDQUFBO0FBbkJZLHVCQUF1QjtJQUVqQyxXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxrQkFBa0IsQ0FBQTtHQUpSLHVCQUF1QixDQW1CbkMifQ==