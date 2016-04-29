/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {localize} from 'vs/nls';
import {Action, IAction} from 'vs/base/common/actions';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import {IExtensionService, IExtensionDescription} from 'vs/platform/extensions/common/extensions';
import {IExtensionMessageCollector, IExtensionPointUser, ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IActionsService} from './actions';

interface Commands {
	commands: Command | Command[];
}

interface Command {
	command: string;
	title: string;
	category?: string;
}

function isCommands(thing: Command | Command[]): thing is Command[] {
	return Array.isArray(thing);
}

function isValidCommand(candidate: Command, rejects: string[]): boolean {
	if (!candidate) {
		rejects.push(localize('nonempty', "expected non-empty value."));
		return false;
	}
	if (typeof candidate.command !== 'string') {
		rejects.push(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
		return false;
	}
	if (typeof candidate.title !== 'string') {
		rejects.push(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'title'));
		return false;
	}
	if (candidate.category && typeof candidate.category !== 'string') {
		rejects.push(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'category'));
		return false;
	}
	return true;
}

let commandType: IJSONSchema = {
	type: 'object',
	properties: {
		command: {
			description: localize('vscode.extension.contributes.commandType.command', 'Identifier of the command to execute'),
			type: 'string'
		},
		title: {
			description: localize('vscode.extension.contributes.commandType.title', 'Title by which the command is represented in the UI.'),
			type: 'string'
		},
		category: {
			description: localize('vscode.extension.contributes.commandType.category', '(Optional) category string by the command is grouped in the UI'),
			type: 'string'
		}
	}
};
let commandsExtPoint = ExtensionsRegistry.registerExtensionPoint<Command | Command[]>('commands', {
	description: localize('vscode.extension.contributes.commands', "Contributes commands to the command palette."),
	oneOf: [
		commandType,
		{
			type: 'array',
			items: commandType
		}
	]
});

export default class ActionsService implements IActionsService {

	private _extensionService: IExtensionService;
	private _keybindingsService: IKeybindingService;
	private _extensionsActions: IAction[];
	private _extensionsActionsMap: { [id: string]: IAction[] };

	serviceId: any;

	constructor( @IExtensionService extensionService: IExtensionService, @IKeybindingService keybindingsService: IKeybindingService) {
		this._extensionService = extensionService;
		this._keybindingsService = keybindingsService;

		this._extensionsActions = [];
		this._extensionsActionsMap = Object.create(null);

		commandsExtPoint.setHandler((extensions) => {
			for (let d of extensions) {
				this._onDescription(d);
			}
		});
	}

	private _onDescription(d: IExtensionPointUser<Command | Command[]>): void {
		let commands = d.value;
		if (isCommands(commands)) {
			for (let command of commands) {
				this._handleCommand(command, d.description, d.collector);
			}
		} else {
			this._handleCommand(commands, d.description, d.collector);
		}
	}

	private _handleCommand(command: Command, description: IExtensionDescription, collector: IExtensionMessageCollector): void {

		let rejects: string[] = [];

		if (isValidCommand(command, rejects)) {
			// make sure this extension is activated by this command
			let activationEvent = `onCommand:${command.command}`;

			// action that (1) activates the extension and dispatches the command
			let label = command.category ? localize('category.label', "{0}: {1}", command.category, command.title) : command.title;
			let action = new Action(command.command, label, undefined, true, () => {
				return this._extensionService.activateByEvent(activationEvent).then(() => {
					return this._keybindingsService.executeCommand(command.command);
				});
			});
			this._extensionsActions.push(action);

			let actions = this._extensionsActionsMap[description.id];
			if (!actions) {
				this._extensionsActionsMap[description.id] = actions = [];
			}
			actions.push(action);
		}

		if (rejects.length > 0) {
			collector.error(localize(
				'error',
				"Invalid `contributes.{0}`: {1}",
				commandsExtPoint.name,
				rejects.join('\n')
			));
		}

	}

	getActions(extensionId?: string): IAction[] {
		if (!extensionId) {
			return this._extensionsActions.slice(0);
		} else {
			let actions = this._extensionsActionsMap[extensionId];
			if (actions) {
				return actions.slice(0);
			} else {
				return [];
			}
		}
	}
}
