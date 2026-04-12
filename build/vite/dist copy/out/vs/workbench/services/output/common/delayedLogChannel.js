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
import { ILoggerService, log } from '../../../../platform/log/common/log.js';
let DelayedLogChannel = class DelayedLogChannel {
    constructor(id, name, file, loggerService) {
        this.file = file;
        this.loggerService = loggerService;
        this.logger = loggerService.createLogger(file, { name, id, hidden: true });
    }
    log(level, message) {
        this.loggerService.setVisibility(this.file, true);
        log(this.logger, level, message);
    }
};
DelayedLogChannel = __decorate([
    __param(3, ILoggerService)
], DelayedLogChannel);
export { DelayedLogChannel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVsYXllZExvZ0NoYW5uZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvb3V0cHV0L2NvbW1vbi9kZWxheWVkTG9nQ2hhbm5lbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQVcsY0FBYyxFQUFFLEdBQUcsRUFBWSxNQUFNLHdDQUF3QyxDQUFDO0FBR3pGLElBQU0saUJBQWlCLEdBQXZCLE1BQU0saUJBQWlCO0lBSTdCLFlBQ0MsRUFBVSxFQUFFLElBQVksRUFBbUIsSUFBUyxFQUNuQixhQUE2QjtRQURuQixTQUFJLEdBQUosSUFBSSxDQUFLO1FBQ25CLGtCQUFhLEdBQWIsYUFBYSxDQUFnQjtRQUU5RCxJQUFJLENBQUMsTUFBTSxHQUFHLGFBQWEsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUM1RSxDQUFDO0lBRUQsR0FBRyxDQUFDLEtBQWUsRUFBRSxPQUFlO1FBQ25DLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbEQsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2xDLENBQUM7Q0FFRCxDQUFBO0FBaEJZLGlCQUFpQjtJQU0zQixXQUFBLGNBQWMsQ0FBQTtHQU5KLGlCQUFpQixDQWdCN0IifQ==