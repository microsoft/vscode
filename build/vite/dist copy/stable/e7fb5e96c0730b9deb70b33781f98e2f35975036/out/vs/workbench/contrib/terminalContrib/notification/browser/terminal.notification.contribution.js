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
import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalNotificationHandler } from './terminalNotificationHandler.js';
let TerminalOscNotificationsContribution = class TerminalOscNotificationsContribution extends Disposable {
    static { this.ID = 'terminal.oscNotifications'; }
    constructor(_ctx, _configurationService, _notificationService, _logService) {
        super();
        this._ctx = _ctx;
        this._configurationService = _configurationService;
        this._notificationService = _notificationService;
        this._logService = _logService;
        this._handler = this._register(new TerminalNotificationHandler({
            isEnabled: () => this._configurationService.getValue("terminal.integrated.enableNotifications" /* TerminalOscNotificationsSettingId.EnableNotifications */) === true,
            isWindowFocused: () => dom.getActiveWindow().document.hasFocus(),
            isTerminalVisible: () => this._ctx.instance.isVisible,
            focusTerminal: () => this._ctx.instance.focus(true),
            notify: notification => this._notificationService.notify(notification),
            updateEnableNotifications: value => this._configurationService.updateValue("terminal.integrated.enableNotifications" /* TerminalOscNotificationsSettingId.EnableNotifications */, value),
            logWarn: message => this._logService.warn(message),
            writeToProcess: data => { void this._ctx.instance.sendText(data, false); }
        }));
    }
    xtermReady(xterm) {
        this._register(xterm.raw.parser.registerOscHandler(99, data => this._handler.handleSequence(data)));
    }
};
TerminalOscNotificationsContribution = __decorate([
    __param(1, IConfigurationService),
    __param(2, INotificationService),
    __param(3, ITerminalLogService)
], TerminalOscNotificationsContribution);
registerTerminalContribution(TerminalOscNotificationsContribution.ID, TerminalOscNotificationsContribution);
export function getTerminalOscNotifications(instance) {
    return instance.getContribution(TerminalOscNotificationsContribution.ID);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwubm90aWZpY2F0aW9uLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9ub3RpZmljYXRpb24vYnJvd3Nlci90ZXJtaW5hbC5ub3RpZmljYXRpb24uY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSw0QkFBNEIsRUFBcUMsTUFBTSxpREFBaUQsQ0FBQztBQUVsSSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUcvRSxJQUFNLG9DQUFvQyxHQUExQyxNQUFNLG9DQUFxQyxTQUFRLFVBQVU7YUFDNUMsT0FBRSxHQUFHLDJCQUEyQixBQUE5QixDQUErQjtJQUlqRCxZQUNrQixJQUFrQyxFQUNYLHFCQUE0QyxFQUM3QyxvQkFBMEMsRUFDM0MsV0FBZ0M7UUFFdEUsS0FBSyxFQUFFLENBQUM7UUFMUyxTQUFJLEdBQUosSUFBSSxDQUE4QjtRQUNYLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFDN0MseUJBQW9CLEdBQXBCLG9CQUFvQixDQUFzQjtRQUMzQyxnQkFBVyxHQUFYLFdBQVcsQ0FBcUI7UUFHdEUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksMkJBQTJCLENBQUM7WUFDOUQsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLHVHQUFnRSxLQUFLLElBQUk7WUFDN0gsZUFBZSxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFO1lBQ2hFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVM7WUFDckQsYUFBYSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUM7WUFDbkQsTUFBTSxFQUFFLFlBQVksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUM7WUFDdEUseUJBQXlCLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsV0FBVyx3R0FBd0QsS0FBSyxDQUFDO1lBQ3hJLE9BQU8sRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQztZQUNsRCxjQUFjLEVBQUUsSUFBSSxDQUFDLEVBQUUsR0FBRyxLQUFLLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQzFFLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELFVBQVUsQ0FBQyxLQUFpRDtRQUMzRCxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyRyxDQUFDOztBQTFCSSxvQ0FBb0M7SUFPdkMsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLG9CQUFvQixDQUFBO0lBQ3BCLFdBQUEsbUJBQW1CLENBQUE7R0FUaEIsb0NBQW9DLENBMkJ6QztBQUVELDRCQUE0QixDQUFDLG9DQUFvQyxDQUFDLEVBQUUsRUFBRSxvQ0FBb0MsQ0FBQyxDQUFDO0FBRTVHLE1BQU0sVUFBVSwyQkFBMkIsQ0FBQyxRQUEyQjtJQUN0RSxPQUFPLFFBQVEsQ0FBQyxlQUFlLENBQXVDLG9DQUFvQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ2hILENBQUMifQ==