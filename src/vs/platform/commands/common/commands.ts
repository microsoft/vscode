/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {TypeConstraint, validateConstraints} from 'vs/base/common/types';
import {IInstantiationService, ServicesAccessor, createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {registerSingleton} from 'vs/platform/instantiation/common/extensions';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';

export const ICommandService = createDecorator('commandService');

export interface ICommandService {
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
	registerCommand(id: string, command: ICommandHandler): void;
	registerCommand(id: string, command: ICommand): void;
	getCommand(id: string): ICommand;
	getCommands(): ICommandsMap;
}

function isCommand(thing: any): thing is ICommand {
	return typeof thing === 'object'
		&& typeof (<ICommand>thing).handler === 'function'
		&& (!(<ICommand>thing).description || typeof (<ICommand>thing).description === 'object');
}

export const CommandsRegistry: ICommandRegistry = new class implements ICommandRegistry {

	private _commands: { [id: string]: ICommand } = Object.create(null);

	registerCommand(id: string, commandOrDesc: ICommandHandler | ICommand): void {
		// if (this._commands[id] !== void 0) {
		// 	throw new Error(`command already exists: '${id}'`);
		// }
		if (!commandOrDesc) {
			throw new Error(`invalid command`);
		}

		if (!isCommand(commandOrDesc)) {
			// simple handler
			this._commands[id] = { handler: commandOrDesc };

		} else {
			const {handler, description} = commandOrDesc;
			if (description) {
				// add argument validation if rich command metadata is provided
				const constraints: TypeConstraint[] = [];
				for (let arg of description.args) {
					constraints.push(arg.constraint);
				}
				this._commands[id] = {
					description,
					handler(accessor, ...args: any[]) {
						validateConstraints(args, constraints);
						return handler(accessor, ...args);
					}
				};
			} else {
				// add as simple handler
				this._commands[id] = { handler };
			}
		}
	}

	getCommand(id: string): ICommand {
		return this._commands[id];
	}

	getCommands(): ICommandsMap {
		return this._commands;
	}
};

class DefaultCommandService implements ICommandService {

	serviceId: any;

	constructor(
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IExtensionService private _extensionService: IExtensionService
	) {
		//
	}

	executeCommand<T>(id: string, ...args: any[]): TPromise<T> {

		const command = CommandsRegistry.getCommand(id);
		if (!command) {
			return TPromise.wrapError(new Error(`command '${id}' not found`));
		}

		this._extensionService.activateByEvent(`onCommand:${id}`).then(_ => {
			try {
				const result = this._instantiationService.invokeFunction.apply(this._instantiationService, [command].concat(args));
				return TPromise.as(result);
			} catch (err) {
				return TPromise.wrapError(err);
			}
		});
	}
}

registerSingleton(ICommandService, DefaultCommandService);
