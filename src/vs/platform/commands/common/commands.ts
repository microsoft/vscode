/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { TypeConstraint, validateConstraints } from 'vs/base/common/types';
import { ServicesAccessor, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';

export const ICommandService = createDecorator<ICommandService>('commandService');

export interface ICommandEvent {
	commandId: string;
}

export interface ICommandService {
	_serviceBrand: any;
	onWillExecuteCommand: Event<ICommandEvent>;
	executeCommand<T>(commandId: string, ...args: any[]): TPromise<T>;
	executeCommand(commandId: string, ...args: any[]): TPromise<any>;
}

export interface ICommandsMap {
	[id: string]: ICommand;
}

export interface ICommandHandler {
	(accessor: ServicesAccessor, ...args: any[]): void;
}

export interface ICommand {
	handler: ICommandHandler;
	description?: ICommandHandlerDescription;
}

export interface ICommandHandlerDescription {
	description: string;
	args: { name: string; description?: string; constraint?: TypeConstraint; }[];
	returns?: string;
}

export interface ICommandRegistry {
	registerCommand(id: string, command: ICommandHandler): IDisposable;
	registerCommand(id: string, command: ICommand): IDisposable;
	getCommand(id: string): ICommand;
	getCommands(): ICommandsMap;
}

function isCommand(thing: any): thing is ICommand {
	return typeof thing === 'object'
		&& typeof (<ICommand>thing).handler === 'function'
		&& (!(<ICommand>thing).description || typeof (<ICommand>thing).description === 'object');
}

export const CommandsRegistry: ICommandRegistry = new class implements ICommandRegistry {

	private _commands = new Map<string, ICommand | ICommand[]>();

	registerCommand(id: string, commandOrDesc: ICommandHandler | ICommand): IDisposable {

		if (!commandOrDesc) {
			throw new Error(`invalid command`);
		}

		let command: ICommand;
		if (!isCommand(commandOrDesc)) {
			// simple handler
			command = { handler: commandOrDesc };

		} else {
			const {handler, description} = commandOrDesc;
			if (description) {
				// add argument validation if rich command metadata is provided
				const constraints: TypeConstraint[] = [];
				for (let arg of description.args) {
					constraints.push(arg.constraint);
				}
				command = {
					description,
					handler(accessor, ...args: any[]) {
						validateConstraints(args, constraints);
						return handler(accessor, ...args);
					}
				};
			} else {
				// add as simple handler
				command = { handler };
			}
		}

		// find a place to store the command
		const commandOrArray = this._commands.get(id);
		if (commandOrArray === void 0) {
			this._commands.set(id, command);
		} else if (Array.isArray(commandOrArray)) {
			commandOrArray.unshift(command);
		} else {
			this._commands.set(id, [command, commandOrArray]);
		}

		return {
			dispose: () => {
				const commandOrArray = this._commands.get(id);
				if (Array.isArray(commandOrArray)) {
					// remove from array, remove array
					// if last element removed
					const idx = commandOrArray.indexOf(command);
					if (idx >= 0) {
						commandOrArray.splice(idx, 1);
						if (commandOrArray.length === 0) {
							this._commands.delete(id);
						}
					}
				} else if (isCommand(commandOrArray)) {
					// remove from map
					this._commands.delete(id);
				}
			}
		};
	}

	getCommand(id: string): ICommand {
		const commandOrArray = this._commands.get(id);
		if (Array.isArray(commandOrArray)) {
			return commandOrArray[0];
		} else {
			return commandOrArray;
		}
	}

	getCommands(): ICommandsMap {
		const result: ICommandsMap = Object.create(null);
		this._commands.forEach((value, key) => {
			result[key] = this.getCommand(key);
		});
		return result;
	}
};

export const NullCommandService: ICommandService = {
	_serviceBrand: undefined,
	onWillExecuteCommand: () => ({ dispose: () => { } }),
	executeCommand() {
		return TPromise.as(undefined);
	}
};
