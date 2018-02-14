/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CommandsRegistry } from 'vs/platform/commands/common/commands';

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
}