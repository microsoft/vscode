/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommandService, CommandsRegistry, ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ExtHostContext, MainThreadCommandsShape, ExtHostCommandsShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { revive } from 'vs/base/common/marshalling';

@extHostNamedCustomer(MainContext.MainThreadCommands)
export class MainThreadCommands implements MainThreadCommandsShape {

	private readonly _disposables = new Map<string, IDisposable>();
	private readonly _generateCommandsDocumentationRegistration: IDisposable;
	private readonly _proxy: ExtHostCommandsShape;

	constructor(
		extHostContext: IExtHostContext,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostCommands);

		this._generateCommandsDocumentationRegistration = CommandsRegistry.registerCommand('_generateCommandsDocumentation', () => this._generateCommandsDocumentation());
	}

	dispose() {
		this._disposables.forEach(value => value.dispose());
		this._disposables.clear();

		this._generateCommandsDocumentationRegistration.dispose();
	}

	private _generateCommandsDocumentation(): Promise<void> {
		return this._proxy.$getContributedCommandHandlerDescriptions().then(result => {
			// add local commands
			const commands = CommandsRegistry.getCommands();
			for (let id in commands) {
				let { description } = commands[id];
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
	}

	$registerCommand(id: string): void {
		this._disposables.set(
			id,
			CommandsRegistry.registerCommand(id, (accessor, ...args) => {
				return this._proxy.$executeContributedCommand(id, ...args).then(result => {
					return revive(result, 0);
				});
			})
		);
	}

	$unregisterCommand(id: string): void {
		if (this._disposables.has(id)) {
			this._disposables.get(id).dispose();
			this._disposables.delete(id);
		}
	}

	$executeCommand<T>(id: string, args: any[]): Promise<T> {
		for (let i = 0; i < args.length; i++) {
			args[i] = revive(args[i], 0);
		}
		return this._commandService.executeCommand<T>(id, ...args);
	}

	$getCommands(): Promise<string[]> {
		return Promise.resolve(Object.keys(CommandsRegistry.getCommands()));
	}
}

// --- command doc

function _generateMarkdown(description: string | ICommandHandlerDescription): string {
	if (typeof description === 'string') {
		return description;
	} else {
		let parts = [description.description];
		parts.push('\n\n');
		if (description.args) {
			for (let arg of description.args) {
				parts.push(`* _${arg.name}_ - ${arg.description || ''}\n`);
			}
		}
		if (description.returns) {
			parts.push(`* _(returns)_ - ${description.returns}`);
		}
		parts.push('\n\n');
		return parts.join('');
	}
}
