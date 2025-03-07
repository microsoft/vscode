/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// register event listener for onDidCommandExecute
// when event is fired, check if the command was triggered by a mouse click
// if so, pop up a toast with the command name and current keybinding

// import { ICommandService } from 'vs/platform/commands/common/commands';
// import { INotificationService } from 'vs/platform/notification/common/notification';
// import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

// export class KeybindTutor implements IWorkbenchContribution {
// 	constructor(
// 		@ICommandService private readonly _commandService: ICommandService,
// 		@INotificationService private readonly _notificationService: INotificationService,
// 	) {

// 		this._commandService.onDidExecuteCommand((e) => {
// 			this._notificationService.info(`Command ${e.commandId} executed`);

// 		});
// 	}
// }
