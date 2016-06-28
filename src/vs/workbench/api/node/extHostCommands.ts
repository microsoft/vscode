/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {validateConstraint} from 'vs/base/common/types';
import {ICommandHandlerDescription} from 'vs/platform/keybinding/common/keybindingService';
import {TPromise} from 'vs/base/common/winjs.base';
import {ExtHostEditors} from 'vs/workbench/api/node/extHostEditors';
import * as extHostTypes from 'vs/workbench/api/node/extHostTypes';
import * as extHostTypeConverter from 'vs/workbench/api/node/extHostTypeConverters';
import {cloneAndChange} from 'vs/base/common/objects';
import {MainContext, MainThreadCommandsShape} from './extHostProtocol';

interface CommandHandler {
	callback: Function;
	thisArg: any;
	description: ICommandHandlerDescription;
}

export class ExtHostCommands {

	private _commands: { [n: string]: CommandHandler } = Object.create(null);
	private _proxy: MainThreadCommandsShape;
	private _extHostEditors: ExtHostEditors;

	constructor(
		threadService: IThreadService,
		extHostEditors:ExtHostEditors
	) {
		this._extHostEditors = extHostEditors;
		this._proxy = threadService.get(MainContext.MainThreadCommands);
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

		let {callback, thisArg, description} = command;

		if (description) {
			for (let i = 0; i < description.args.length; i++) {
				try {
					validateConstraint(args[i], description.args[i].constraint);
				} catch (err) {
					return Promise.reject<T>(`Running the contributed command:'${id}' failed. Illegal argument '${description.args[i].name}' - ${description.args[i].description}`);
				}
			}
		}

		try {
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
