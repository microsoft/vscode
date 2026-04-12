/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../nls.js';
export var TerminalOscNotificationsSettingId;
(function (TerminalOscNotificationsSettingId) {
    TerminalOscNotificationsSettingId["EnableNotifications"] = "terminal.integrated.enableNotifications";
})(TerminalOscNotificationsSettingId || (TerminalOscNotificationsSettingId = {}));
export const terminalOscNotificationsConfiguration = {
    ["terminal.integrated.enableNotifications" /* TerminalOscNotificationsSettingId.EnableNotifications */]: {
        description: localize('terminal.integrated.enableNotifications', "Controls whether notifications sent from the terminal via OSC 99 are shown. This uses notifications inside the product instead of desktop notifications. Sounds, icons and filtering are not supported."),
        type: 'boolean',
        default: true
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxOb3RpZmljYXRpb25Db25maWd1cmF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL25vdGlmaWNhdGlvbi9jb21tb24vdGVybWluYWxOb3RpZmljYXRpb25Db25maWd1cmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUdqRCxNQUFNLENBQU4sSUFBa0IsaUNBRWpCO0FBRkQsV0FBa0IsaUNBQWlDO0lBQ2xELG9HQUErRCxDQUFBO0FBQ2hFLENBQUMsRUFGaUIsaUNBQWlDLEtBQWpDLGlDQUFpQyxRQUVsRDtBQUVELE1BQU0sQ0FBQyxNQUFNLHFDQUFxQyxHQUFvRDtJQUNyRyx1R0FBdUQsRUFBRTtRQUN4RCxXQUFXLEVBQUUsUUFBUSxDQUFDLHlDQUF5QyxFQUFFLHlNQUF5TSxDQUFDO1FBQzNRLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLElBQUk7S0FDYjtDQUNELENBQUMifQ==