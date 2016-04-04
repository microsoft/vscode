/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {validateConstraint} from 'vs/base/common/types';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IKeybindingService, ICommandHandlerDescription} from 'vs/platform/keybinding/common/keybindingService';
import {TPromise} from 'vs/base/common/winjs.base';
import {ExtHostEditors} from 'vs/workbench/api/node/extHostEditors';
import * as extHostTypes from 'vs/workbench/api/node/extHostTypes';
import * as extHostTypeConverter from 'vs/workbench/api/node/extHostTypeConverters';
import {cloneAndChange} from 'vs/base/common/objects';

interface CommandHandler {
	callback: Function;
	thisArg: any;
	description: ICommandHandlerDescription;
}

@Remotable.ExtHostContext('ExtHostCommands')
export class ExtHostCommands {

	private _commands: { [n: string]: CommandHandler } = Object.create(null);
	private _proxy: MainThreadCommands;
	private _extHostEditors: ExtHostEditors;

	constructor(@IThreadService threadService: IThreadService) {
		this._extHostEditors = threadService.getRemotable(ExtHostEditors);
		this._proxy = threadService.getRemotable(MainThreadCommands);
	}

	registerCommand(id: string, callback: <T>(...args: any[]) => T | Thenable<T>, thisArg?: any, description?: ICommandHandlerDescription): extHostTypes.Disposable {

		if (!id.trim().length) {
			throw new Error('invalid id');
		}

		if (this._commands[id]) {
			throw new Error('command with id already exists');
		}

		this._commands[id] = { callback, thisArg, description };
		this._proxy.$registerCommand(id);

		return new extHostTypes.Disposable(() => delete this._commands[id]);
	}

	executeCommand<T>(id: string, ...args: any[]): Thenable<T> {

		if (this._commands[id]) {
			// we stay inside the extension host and support
			// to pass any kind of parameters around
			return this.$executeContributedCommand(id, ...args);

		} else {
			// automagically convert some argument types

			args = cloneAndChange(args, function(value) {
				if (value instanceof extHostTypes.Position) {
					return extHostTypeConverter.fromPosition(value);
				}
				if (value instanceof extHostTypes.Range) {
					return extHostTypeConverter.fromRange(value);
				}
				if (value instanceof extHostTypes.Location) {
					return extHostTypeConverter.location.from(value);
				}
				if (!Array.isArray(value)) {
					return value;
				}
			});

			return this._proxy.$executeCommand(id, args);
		}

	}

	$executeContributedCommand<T>(id: string, ...args: any[]): Thenable<T> {
		let command = this._commands[id];
		if (!command) {
			return Promise.reject<T>(`Contributed command '${id}' does not exist.`);
		}
		try {
			let {callback, thisArg, description} = command;
			if (description) {
				for (let i = 0; i < description.args.length; i++) {
					validateConstraint(args[i], description.args[i].constraint);
				}
			}
			let result = callback.apply(thisArg, args);
			return Promise.resolve(result);
		} catch (err) {
			// console.log(err);
			// try {
			// 	console.log(toErrorMessage(err));
			// } catch (err) {
			// 	//
			// }
			return Promise.reject<T>(`Running the contributed command:'${id}' failed.`);
		}
	}

	getCommands(filterUnderscoreCommands: boolean = false): Thenable<string[]> {
		return this._proxy.$getCommands().then(result => {
			if (filterUnderscoreCommands) {
				result = result.filter(command => command[0] !== '_');
			}
			return result;
		});
	}

	$getContributedCommandHandlerDescriptions(): TPromise<{ [id: string]: string | ICommandHandlerDescription }> {
		const result: { [id: string]: string | ICommandHandlerDescription } = Object.create(null);
		for (let id in this._commands) {
			let {description} = this._commands[id];
			if (description) {
				result[id] = description;
			}
		}
		return TPromise.as(result);
	}
}

@Remotable.MainContext('MainThreadCommands')
export class MainThreadCommands {

	private _threadService: IThreadService;
	private _keybindingService: IKeybindingService;
	private _proxy: ExtHostCommands;

	constructor( @IThreadService threadService: IThreadService, @IKeybindingService keybindingService: IKeybindingService) {
		this._threadService = threadService;
		this._keybindingService = keybindingService;
		this._proxy = this._threadService.getRemotable(ExtHostCommands);
	}

	$registerCommand(id: string): TPromise<any> {

		KeybindingsRegistry.registerCommandDesc({
			id,
			handler: (serviceAccessor, ...args: any[]) => {
				return this._proxy.$executeContributedCommand(id, ...args);
			},
			weight: undefined,
			context: undefined,
			win: undefined,
			mac: undefined,
			linux: undefined,
			primary: undefined,
			secondary: undefined
		});

		return undefined;
	}

	$executeCommand<T>(id: string, args: any[]): Thenable<T> {
		return this._keybindingService.executeCommand(id, args);
	}

	$getCommands(): Thenable<string[]> {
		return TPromise.as(Object.keys(KeybindingsRegistry.getCommands()));
	}
}


// --- command doc

KeybindingsRegistry.registerCommandDesc({
	id: '_generateCommandsDocumentation',
	handler: function(accessor) {
		return accessor.get(IThreadService).getRemotable(ExtHostCommands).$getContributedCommandHandlerDescriptions().then(result => {

			// add local commands
			const commands = KeybindingsRegistry.getCommands();
			for (let id in commands) {
				let {description} = commands[id];
				if (description) {
					result[id] = description;
				}
			}

			// print all as markdown
			const all: string[] = [];
			for (let id in result) {
				all.push('`' + id + '` - ' + _generateMarkdown(result[id]));
			}
			console.log(all.join('\n'));
		});
	},
	context: undefined,
	weight: KeybindingsRegistry.WEIGHT.builtinExtension(0),
	primary: undefined
});

function _generateMarkdown(description: string | ICommandHandlerDescription): string {
	if (typeof description === 'string') {
		return description;
	} else {
		let parts = [description.description];
		parts.push('\n\n');
		if (description.args) {
			for (let arg of description.args) {
				parts.push(`* _${arg.name}_ ${arg.description || ''}\n`);
			}
		}
		if (description.returns) {
			parts.push(`* _(returns)_ ${description.returns}`);
		}
		parts.push('\n\n');
		return parts.join('');
	}
}
