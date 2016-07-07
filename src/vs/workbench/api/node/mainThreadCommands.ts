/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {CommandsRegistry, ICommandHandlerDescription} from 'vs/platform/commands/common/commands';

import {TPromise} from 'vs/base/common/winjs.base';
import {ExtHostContext, ExtHostCommandsShape} from './extHostProtocol';

export class MainThreadCommands {

	private _threadService: IThreadService;
	private _keybindingService: IKeybindingService;
	private _proxy: ExtHostCommandsShape;

	constructor(
		@IThreadService threadService: IThreadService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		this._threadService = threadService;
		this._keybindingService = keybindingService;
		this._proxy = this._threadService.get(ExtHostContext.ExtHostCommands);
	}

	$registerCommand(id: string): TPromise<any> {

		KeybindingsRegistry.registerCommandDesc({
			id,
			handler: (serviceAccessor, ...args: any[]) => {
				return this._proxy.$executeContributedCommand(id, ...args);
			},
			weight: undefined,
			when: undefined,
			win: undefined,
			mac: undefined,
			linux: undefined,
			primary: undefined,
			secondary: undefined
		});

		return undefined;
	}

	$executeCommand<T>(id: string, args: any[]): Thenable<T> {
		return this._keybindingService.executeCommand(id, ...args);
	}

	$getCommands(): Thenable<string[]> {
		return TPromise.as(Object.keys(CommandsRegistry.getCommands()));
	}
}

// --- command doc

KeybindingsRegistry.registerCommandDesc({
	id: '_generateCommandsDocumentation',
	handler: function(accessor) {
		return accessor.get(IThreadService).get(ExtHostContext.ExtHostCommands).$getContributedCommandHandlerDescriptions().then(result => {

			// add local commands
			const commands = CommandsRegistry.getCommands();
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
	when: undefined,
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
