/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { INotificationService } from 'vs/platform/notification/common/notification';

export const SHOW_NOTFICATIONS_CENTER_COMMAND_ID = 'notificationsCenter.show';
export const HIDE_NOTFICATIONS_CENTER_COMMAND_ID = 'notificationsCenter.hide';
export const TOGGLE_NOTFICATIONS_CENTER_COMMAND_ID = 'notificationsCenter.toggle';

export interface INotificationsCenterController {
	isVisible: boolean;

	show(): void;
	hide(): void;
}

export function registerNotificationCommands(center: INotificationsCenterController): void {

	// Show Center
	CommandsRegistry.registerCommand(SHOW_NOTFICATIONS_CENTER_COMMAND_ID, () => center.show());

	// Hide Center
	CommandsRegistry.registerCommand(HIDE_NOTFICATIONS_CENTER_COMMAND_ID, () => center.hide());

	// Toggle Center
	CommandsRegistry.registerCommand(TOGGLE_NOTFICATIONS_CENTER_COMMAND_ID, () => center.isVisible ? center.hide() : center.show());

	// TODO@Notification remove me
	CommandsRegistry.registerCommand('notifications.showInfo', accessor => {
		accessor.get(INotificationService).info('This is an information message!');
	});

	CommandsRegistry.registerCommand('notifications.showWarning', accessor => {
		accessor.get(INotificationService).warn('This is a warning message!');
	});

	CommandsRegistry.registerCommand('notifications.showError', accessor => {
		accessor.get(INotificationService).error('This is an error message!');
	});
}