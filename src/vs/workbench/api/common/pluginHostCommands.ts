/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {IEventService} from 'vs/platform/event/common/event';
import {PluginsRegistry} from 'vs/platform/plugins/common/pluginsRegistry';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {TPromise} from 'vs/base/common/winjs.base';
import {PluginHostEditors} from 'vs/workbench/api/common/pluginHostEditors';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {canSerialize} from 'vs/base/common/marshalling';
import {toErrorMessage} from 'vs/base/common/errors';
import * as vscode from 'vscode';

@Remotable.PluginHostContext('PluginHostCommands')
export class PluginHostCommands {

	private _commands: { [n: string]: Function } = Object.create(null);
	private _proxy: MainThreadCommands;
	private _pluginHostEditors: PluginHostEditors;

	constructor(@IThreadService threadService: IThreadService) {
		this._pluginHostEditors = threadService.getRemotable(PluginHostEditors);
		this._proxy = threadService.getRemotable(MainThreadCommands);
	}

	registerCommand(id: string, command: <T>(...args: any[]) => T | Thenable<T>, thisArgs?: any): vscode.Disposable {

		if (!id.trim().length) {
			throw new Error('invalid id');
		}

		if (this._commands[id]) {
			throw new Error('command with id already exists');
		}

		this._commands[id] = thisArgs ? command.bind(thisArgs) : command;
		this._proxy._registerCommand(id);

		return {
			dispose: () => {
				delete this._commands[id];
			}
		}
	}

	registerTextEditorCommand(commandId: string, callback: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) => void, thisArg?: any): vscode.Disposable {
		let actualCallback: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) => void = thisArg ? callback.bind(thisArg) : callback;
		return this.registerCommand(commandId, () => {
			let activeTextEditor = this._pluginHostEditors.getActiveTextEditor();
			if (!activeTextEditor) {
				console.warn('Cannot execute ' + commandId + ' because there is no active text editor.');
				return;
			}

			activeTextEditor.edit((edit: vscode.TextEditorEdit) => {
				actualCallback(activeTextEditor, edit);
			}).then((result) => {
				if (!result) {
					console.warn('Edits from command ' + commandId + ' were not applied.')
				}
			}, (err) => {
				console.warn('An error occured while running command ' + commandId, err);
			});
		})
	}

	executeCommand<T>(id: string, ...args: any[]): Thenable<T> {

		if (this._commands[id]) {
			// we stay inside the extension host and support
			// to pass any kind of parameters around
			return this._executeContributedCommand(id, ...args);

		} else {
			// check that we can get all parameters over to
			// the other side
			for (let i = 0; i < args.length; i++) {
				if (typeof args[i] === 'object' && !canSerialize(args[i])) {
					throw new Error('illegal argument - can not serialize argument number: ' + i)
				}
			}

			return this._proxy._executeCommand(id, args);
		}

	}

	_executeContributedCommand<T>(id: string, ...args: any[]): Thenable<T> {
		let command = this._commands[id];
		if (!command) {
			return Promise.reject<T>(id);
		}
		try {
			let result = command.apply(undefined, args);
			return Promise.resolve(result);
		} catch (err) {
			try {
				console.log(toErrorMessage(err));
				console.log(err);
			} catch (err) {
				//
			}
			return Promise.reject<T>(`Running the contributed command:'${id}' failed.`);
		}
	}

	getCommands(): Thenable<string[]> {
		return this._proxy._getCommands();
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

	_registerCommand(id: string): TPromise<any> {

		KeybindingsRegistry.registerCommandDesc({
			id,
			handler: (serviceAccessor, ...args: any[]) => {
				return this._proxy._executeContributedCommand(id, ...args); //TODO@Joh - we cannot serialize the args
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

	_executeCommand<T>(id: string, args: any[]): Thenable<T> {
		return TPromise.as(this._keybindingService.executeCommand(id, args));
	}

	_getCommands(): Thenable<string[]> {
		return TPromise.as(Object.keys(KeybindingsRegistry.getCommands()));
	}
}