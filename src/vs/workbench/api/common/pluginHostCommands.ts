/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {TypeConstraint, validateConstraint} from 'vs/base/common/types';
import {IEventService} from 'vs/platform/event/common/event';
import {PluginsRegistry} from 'vs/platform/plugins/common/pluginsRegistry';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {KeybindingsUtils} from 'vs/platform/keybinding/common/keybindingsUtils';
import {IKeybindingService, ICommandHandlerDescription} from 'vs/platform/keybinding/common/keybindingService';
import {TPromise} from 'vs/base/common/winjs.base';
import {PluginHostEditors} from 'vs/workbench/api/common/pluginHostEditors';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {canSerialize} from 'vs/base/common/marshalling';
import {toErrorMessage} from 'vs/base/common/errors';
import * as vscode from 'vscode';

interface CommandHandler {
	callback: Function;
	thisArg: any;
	description: ICommandHandlerDescription;
}

@Remotable.PluginHostContext('PluginHostCommands')
export class PluginHostCommands {

	private _commands: { [n: string]: CommandHandler } = Object.create(null);
	private _proxy: MainThreadCommands;
	private _pluginHostEditors: PluginHostEditors;

	constructor(@IThreadService threadService: IThreadService) {
		this._pluginHostEditors = threadService.getRemotable(PluginHostEditors);
		this._proxy = threadService.getRemotable(MainThreadCommands);
	}

	registerCommand(id: string, callback: <T>(...args: any[]) => T | Thenable<T>, thisArg?: any, description?: ICommandHandlerDescription): vscode.Disposable {

		if (!id.trim().length) {
			throw new Error('invalid id');
		}

		if (this._commands[id]) {
			throw new Error('command with id already exists');
		}

		this._commands[id] = { callback, thisArg, description };
		this._proxy.$registerCommand(id);

		return {
			dispose: () => {
				delete this._commands[id];
			}
		}
	}

	registerTextEditorCommand(id: string, callback: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) => void, thisArg?: any): vscode.Disposable {
		let actualCallback: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) => void = thisArg ? callback.bind(thisArg) : callback;
		return this.registerCommand(id, () => {
			let activeTextEditor = this._pluginHostEditors.getActiveTextEditor();
			if (!activeTextEditor) {
				console.warn('Cannot execute ' + id + ' because there is no active text editor.');
				return;
			}

			activeTextEditor.edit((edit: vscode.TextEditorEdit) => {
				actualCallback(activeTextEditor, edit);
			}).then((result) => {
				if (!result) {
					console.warn('Edits from command ' + id + ' were not applied.')
				}
			}, (err) => {
				console.warn('An error occured while running command ' + id, err);
			});
		})
	}

	executeCommand<T>(id: string, ...args: any[]): Thenable<T> {

		if (this._commands[id]) {
			// we stay inside the extension host and support
			// to pass any kind of parameters around
			return this.$executeContributedCommand(id, ...args);

		} else {
			// // check that we can get all parameters over to
			// // the other side
			// for (let i = 0; i < args.length; i++) {
			// 	if (args[i] !== null && typeof args[i] === 'object' && !canSerialize(args[i])) {
			// 		throw new Error('illegal argument - can not serialize argument number: ' + i)
			// 	}
			// }

			return this._proxy.$executeCommand(id, args);
		}

	}

	$executeContributedCommand<T>(id: string, ...args: any[]): Thenable<T> {
		let command = this._commands[id];
		if (!command) {
			return Promise.reject<T>(id);
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
			// try {
			// 	console.log(toErrorMessage(err));
			// 	console.log(err);
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
	private _proxy: PluginHostCommands;

	constructor( @IThreadService threadService: IThreadService, @IKeybindingService keybindingService: IKeybindingService) {
		this._threadService = threadService;
		this._keybindingService = keybindingService;
		this._proxy = this._threadService.getRemotable(PluginHostCommands);
	}

	$registerCommand(id: string): TPromise<any> {

		KeybindingsRegistry.registerCommandDesc({
			id,
			handler: (serviceAccessor, ...args: any[]) => {
				return this._proxy.$executeContributedCommand(id, ...args); //TODO@Joh - we cannot serialize the args
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

	$getCommandHandlerDescriptions(): TPromise<{ [id: string]: string | ICommandHandlerDescription }> {
		return this._proxy.$getContributedCommandHandlerDescriptions().then(result => {
			const commands = KeybindingsRegistry.getCommands();
			for (let id in commands) {
				let {description} = commands[id];
				if (description) {
					result[id] = description;
				}
			}
			return result;
		});
	}
}


// --- command doc

KeybindingsRegistry.registerCommandDesc({
	id: '_generateCommandsDocumentation',
	handler: function(accessor) {
		return accessor.get(IThreadService).getRemotable(MainThreadCommands).$getCommandHandlerDescriptions().then(result => {
			const all: string[] = [];
			for (let id in result) {
				all.push('`' + id + '` - ' + _generateMarkdown(result[id]))
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