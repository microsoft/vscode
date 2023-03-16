/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';

type RunnableCommand = string | { id: string; args: any[] };

/** Runs several commands passed to it as an argument */
class RunCommands extends Action2 {

	constructor() {
		super({
			id: 'runCommands',
			title: { value: nls.localize('runCommands', "Run Commands"), original: 'Run Commands' },
			f1: false,
			description: {
				description: nls.localize('runCommands.description', "Run several commands"),
				args: [
					{
						name: 'args',
						schema: {
							type: 'object',
							required: ['commands'],
							properties: {
								commands: {
									type: 'array',
									description: nls.localize('runCommands.commands', "Commands to run"),
									items: {
										type: ['string', 'object'],
										required: ['command'],
										properties: {
											command: {
												type: 'string'
											},
											args: { // type: any
											}
										}
									}
								}
							}

						}
					}
				]
			}
		});
	}

	// dev decisions:
	// - this command takes a single argument-object because
	//	- keybinding definitions don't allow running commands with several arguments
	//  - and we want to be able to take on different other arguments in future, e.g., `runMode : 'serial' | 'concurrent'`
	async run(accessor: ServicesAccessor, args: { commands: RunnableCommand[] }) {
		const commandService = accessor.get(ICommandService);
		try {
			for (const cmd of args.commands) {
				await this._runCommand(commandService, cmd);
			}
		} catch (err) {
			accessor.get(INotificationService).warn(err);
		}
	}

	private _runCommand(commandService: ICommandService, cmd: RunnableCommand) {
		let commandID: string, commandArgs;

		if (typeof cmd === 'string') {
			commandID = cmd;
		} else {
			commandID = cmd.id;
			commandArgs = cmd.args;
		}

		if (commandArgs === undefined) {
			return commandService.executeCommand(commandID);
		} else {
			return commandService.executeCommand(commandID, ...commandArgs);
		}
	}
}

registerAction2(RunCommands);
