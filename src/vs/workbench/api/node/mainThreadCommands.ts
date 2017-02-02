/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ICommandService, CommandsRegistry, ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ExtHostContext, MainThreadCommandsShape, ExtHostCommandsShape } from './extHost.protocol';

export class MainThreadCommands extends MainThreadCommandsShape {

	private _disposables: { [id: string]: IDisposable } = Object.create(null);
	private _proxy: ExtHostCommandsShape;

	constructor(
		@IThreadService private _threadService: IThreadService,
		@ICommandService private _commandService: ICommandService
	) {
		super();
		this._proxy = this._threadService.get(ExtHostContext.ExtHostCommands);
	}

	dispose() {
		for (let id in this._disposables) {
			this._disposables[id].dispose();
		}
	}

	$registerCommand(id: string): TPromise<any> {
		this._disposables[id] = CommandsRegistry.registerCommand(id, (accessor, ...args) => this._proxy.$executeContributedCommand(id, ...args));
		return undefined;
	}

	$unregisterCommand(id: string): TPromise<any> {
		if (this._disposables[id]) {
			this._disposables[id].dispose();
			delete this._disposables[id];
		}
		return undefined;
	}

	$executeCommand<T>(id: string, args: any[]): Thenable<T> {
		return this._commandService.executeCommand(id, ...args);
	}

	$getCommands(): Thenable<string[]> {
		return TPromise.as(Object.keys(CommandsRegistry.getCommands()));
	}
}

// --- command doc

CommandsRegistry.registerCommand('_generateCommandsDocumentation', function (accessor) {
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
