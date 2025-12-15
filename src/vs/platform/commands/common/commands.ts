/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Iterable } from '../../../base/common/iterator.js';
import { IJSONSchema } from '../../../base/common/jsonSchema.js';
import { IDisposable, markAsSingleton, toDisposable } from '../../../base/common/lifecycle.js';
import { LinkedList } from '../../../base/common/linkedList.js';
import { TypeConstraint, validateConstraints } from '../../../base/common/types.js';
import { ILocalizedString } from '../../action/common/action.js';
import { createDecorator, ServicesAccessor } from '../../instantiation/common/instantiation.js';

export const ICommandService = createDecorator<ICommandService>('commandService');

export interface ICommandEvent {
	readonly commandId: string;
	readonly args: unknown[];
}

export interface ICommandService {
	readonly _serviceBrand: undefined;
	readonly onWillExecuteCommand: Event<ICommandEvent>;
	readonly onDidExecuteCommand: Event<ICommandEvent>;
	executeCommand<R = unknown>(commandId: string, ...args: unknown[]): Promise<R | undefined>;
}

export type ICommandsMap = Map<string, ICommand>;

export type ICommandHandler<Args extends unknown[] = unknown[], R = void> = (accessor: ServicesAccessor, ...args: Args) => R;

export interface ICommand<Args extends unknown[] = unknown[], R = void> {
	id: string;
	handler: ICommandHandler<Args, R>;
	metadata?: ICommandMetadata | null;
}

export interface ICommandMetadata {
	/**
	 * NOTE: Please use an ILocalizedString. string is in the type for backcompat for now.
	 * A short summary of what the command does. This will be used in:
	 * - API commands
	 * - when showing keybindings that have no other UX
	 * - when searching for commands in the Command Palette
	 */
	readonly description: ILocalizedString | string;
	readonly args?: ReadonlyArray<{
		readonly name: string;
		readonly isOptional?: boolean;
		readonly description?: string;
		readonly constraint?: TypeConstraint;
		readonly schema?: IJSONSchema;
	}>;
	readonly returns?: string;
}

export interface ICommandRegistry {
	readonly onDidRegisterCommand: Event<string>;
	registerCommand<Args extends unknown[]>(id: string, command: ICommandHandler<Args>): IDisposable;
	registerCommand<Args extends unknown[]>(command: ICommand<Args>): IDisposable;
	registerCommandAlias(oldId: string, newId: string): IDisposable;
	getCommand(id: string): ICommand | undefined;
	getCommands(): ICommandsMap;
}

export const CommandsRegistry: ICommandRegistry = new class implements ICommandRegistry {

	private readonly _commands = new Map<string, LinkedList<ICommand>>();

	private readonly _onDidRegisterCommand = new Emitter<string>();
	readonly onDidRegisterCommand: Event<string> = this._onDidRegisterCommand.event;

	registerCommand(idOrCommand: string | ICommand, handler?: ICommandHandler): IDisposable {

		if (!idOrCommand) {
			throw new Error(`invalid command`);
		}

		if (typeof idOrCommand === 'string') {
			if (!handler) {
				throw new Error(`invalid command`);
			}
			return this.registerCommand({ id: idOrCommand, handler });
		}

		// add argument validation if rich command metadata is provided
		if (idOrCommand.metadata && Array.isArray(idOrCommand.metadata.args)) {
			const constraints: Array<TypeConstraint | undefined> = [];
			for (const arg of idOrCommand.metadata.args) {
				constraints.push(arg.constraint);
			}
			const actualHandler = idOrCommand.handler;
			idOrCommand.handler = function (accessor, ...args: unknown[]) {
				validateConstraints(args, constraints);
				return actualHandler(accessor, ...args);
			};
		}

		// find a place to store the command
		const { id } = idOrCommand;

		let commands = this._commands.get(id);
		if (!commands) {
			commands = new LinkedList<ICommand>();
			this._commands.set(id, commands);
		}

		const removeFn = commands.unshift(idOrCommand);

		const ret = toDisposable(() => {
			removeFn();
			const command = this._commands.get(id);
			if (command?.isEmpty()) {
				this._commands.delete(id);
			}
		});

		// tell the world about this command
		this._onDidRegisterCommand.fire(id);

		return markAsSingleton(ret);
	}

	registerCommandAlias(oldId: string, newId: string): IDisposable {
		return CommandsRegistry.registerCommand(oldId, (accessor, ...args) => accessor.get(ICommandService).executeCommand(newId, ...args));
	}

	getCommand(id: string): ICommand | undefined {
		const list = this._commands.get(id);
		if (!list || list.isEmpty()) {
			return undefined;
		}
		return Iterable.first(list);
	}

	getCommands(): ICommandsMap {
		const result = new Map<string, ICommand>();
		for (const key of this._commands.keys()) {
			const command = this.getCommand(key);
			if (command) {
				result.set(key, command);
			}
		}
		return result;
	}
};

CommandsRegistry.registerCommand('noop', () => { });
