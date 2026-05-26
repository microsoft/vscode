/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, IDisposable } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { CommandsRegistry, ICommandMetadata, ICommandService } from '../../../platform/commands/common/commands.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { Dto, SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostCommandsShape, ExtHostContext, MainContext, MainThreadCommandsShape } from '../common/extHost.protocol.js';
import { isString } from '../../../base/common/types.js';


@extHostNamedCustomer(MainContext.MainThreadCommands)
export class MainThreadCommands implements MainThreadCommandsShape {

	private readonly _commandRegistrations = new DisposableMap<string>();
	private readonly _generateCommandsDocumentationRegistration: IDisposable;
	private readonly _proxy: ExtHostCommandsShape;

	constructor(
		extHostContext: IExtHostContext,
		@ICommandService private readonly _commandService: ICommandService,
		@IExtensionService private readonly _extensionService: IExtensionService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostCommands);

		this._generateCommandsDocumentationRegistration = CommandsRegistry.registerCommand('_generateCommandsDocumentation', () => this._generateCommandsDocumentation());
	}

	dispose() {
		this._commandRegistrations.dispose();
		this._generateCommandsDocumentationRegistration.dispose();
	}

	private async _generateCommandsDocumentation(): Promise<void> {
		const result = await this._proxy.$getContributedCommandMetadata();

		// add local commands
		const commands = CommandsRegistry.getCommands();
		for (const [id, command] of commands) {
			if (command.metadata) {
				result[id] = command.metadata;
			}
		}

		// print all as markdown
		const all: string[] = [];
		for (const id in result) {
			all.push('`' + id + '` - ' + _generateMarkdown(result[id]));
		}
		console.log(all.join('\n'));
	}

	$registerCommand(id: string): void {
		this._commandRegistrations.set(
			id,
			CommandsRegistry.registerCommand(id, (accessor, ...args) => {
				return this._proxy.$executeContributedCommand(id, ...args).then(result => {
					return revive(result);
				});
			})
		);
	}

	$unregisterCommand(id: string): void {
		this._commandRegistrations.deleteAndDispose(id);
	}

	$fireCommandActivationEvent(id: string): void {
		const activationEvent = `onCommand:${id}`;
		if (!this._extensionService.activationEventIsDone(activationEvent)) {
			// this is NOT awaited because we only use it as drive-by-activation
			// for commands that are already known inside the extension host
			this._extensionService.activateByEvent(activationEvent);
		}
	}

	async $executeCommand<T>(id: string, args: unknown[] | SerializableObjectWithBuffers<unknown[]>, retry: boolean): Promise<T | undefined> {
		if (args instanceof SerializableObjectWithBuffers) {
			args = args.value;
		}
		for (let i = 0; i < args.length; i++) {
			args[i] = revive(args[i]);
		}
		if (retry && args.length > 0 && !CommandsRegistry.getCommand(id)) {
			await this._extensionService.activateByEvent(`onCommand:${id}`);
			throw new Error('$executeCommand:retry');
		}
		return this._commandService.executeCommand<T>(id, ...args);
	}

	$getCommands(): Promise<string[]> {
		return Promise.resolve([...CommandsRegistry.getCommands().keys()]);
	}
}

// --- command doc

function _generateMarkdown(description: string | Dto<ICommandMetadata> | ICommandMetadata): string {
	if (typeof description === 'string') {
		return description;
	} else {
		const descriptionString = isString(description.description)
			? description.description
			// Our docs website is in English, so keep the original here.
			: description.description.original;
		const parts = [descriptionString];
		parts.push('\n\n');
		if (description.args) {
			for (const arg of description.args) {
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
