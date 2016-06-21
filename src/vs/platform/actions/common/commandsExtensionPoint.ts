/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {localize} from 'vs/nls';
import {Action} from 'vs/base/common/actions';
import {join} from 'vs/base/common/paths';
import {values} from 'vs/base/common/collections';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import {IExtensionService, IExtensionDescription} from 'vs/platform/extensions/common/extensions';
import {IKeybindingService, KbExpr} from 'vs/platform/keybinding/common/keybindingService';
import {IExtensionPointUser, ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';

export type Locations = 'editor/primary' | 'editor/secondary' | 'explorer/context';

export interface ThemableIcon {
	dark: string;
	light: string;
}

export interface Command {
	command: string;
	title: string;
	category?: string;
	icon?: string | ThemableIcon;
	when?: string;
	where?: Locations;
}

function isThemableIcon(thing: any): thing is ThemableIcon {
	return typeof thing === 'object' && thing && typeof (<ThemableIcon>thing).dark === 'string' && typeof (<ThemableIcon>thing).light === 'string';
}

export class ParsedCommand {

	id: string;
	title: string;
	category: string;
	lightThemeIcon: string;
	darkThemeIcon: string;
	when: KbExpr;

	where: Locations;

	constructor(command: Command, extension: IExtensionDescription) {

		this.id = command.command;
		this.title = command.title;
		this.category = command.category;
		this.when = KbExpr.deserialize(command.when);
		this.where = command.where;

		const {icon} = command;
		if (!icon) {
			// nothing
		} else if (isThemableIcon(icon)) {
			this.lightThemeIcon = join(extension.extensionFolderPath, icon.light);
			this.darkThemeIcon = join(extension.extensionFolderPath, icon.dark);
		} else {
			this.lightThemeIcon = this.darkThemeIcon = join(extension.extensionFolderPath, icon);
		}
	}

}

namespace validation {

	function isValidWhere(where: Locations, user: IExtensionPointUser<any>): boolean {
		if (where && ['editor/primary', 'editor/secondary', 'explorer/context'].indexOf(where) < 0) {
			user.collector.error(localize('optwhere', "property `where` can be omitted or must be a valid enum value"));
			return false;
		}
		return true;
	}

	function isValidIcon(icon: string | ThemableIcon, user: IExtensionPointUser<any>): boolean {
		if (typeof icon === 'undefined') {
			return true;
		}
		if (typeof icon === 'string') {
			return true;
		}
		if (typeof icon === 'object' && typeof (<ThemableIcon>icon).dark === 'string' && typeof (<ThemableIcon>icon).light === 'string') {
			return true;
		}
		user.collector.error(localize('opticon', "property `icon` can be omitted or must be either a string or a literal like `{dark, light}`"));
		return false;
	}

	export function isValidCommand(candidate: Command, user: IExtensionPointUser<any>): boolean {
		if (!candidate) {
			user.collector.error(localize('nonempty', "expected non-empty value."));
			return false;
		}
		if (typeof candidate.command !== 'string') {
			user.collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
			return false;
		}
		if (typeof candidate.title !== 'string') {
			user.collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'title'));
			return false;
		}
		if (candidate.category && typeof candidate.category !== 'string') {
			user.collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'category'));
			return false;
		}
		if (candidate.when && typeof candidate.when !== 'string') {
			user.collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'when'));
			return false;
		}
		if (!isValidIcon(candidate.icon, user)) {
			return false;
		}
		if (!isValidWhere(candidate.where, user)) {
			return false;
		}
		return true;
	}
}


namespace schema {

	const commandType: IJSONSchema = {
		type: 'object',
		properties: {
			command: {
				description: localize('vscode.extension.contributes.commandType.command', 'Identifier of the command to execute'),
				type: 'string'
			},
			title: {
				description: localize('vscode.extension.contributes.commandType.title', 'Title by which the command is represented in the UI'),
				type: 'string'
			},
			category: {
				description: localize('vscode.extension.contributes.commandType.category', '(Optional) Category string by the command is grouped in the UI'),
				type: 'string'
			},
			icon: {
				description: localize('vscode.extension.contributes.commandType.icon', '(Optional) Icon which is used to represent the command in the UI. Either a file path or a themable configuration'),
				oneOf: [
					'string',
					{
						type: 'object',
						properties: {
							light: {
								description: localize('vscode.extension.contributes.commandType.icon.light', 'Icon path when a light theme is used'),
								type: 'string'
							},
							dark: {
								description: localize('vscode.extension.contributes.commandType.icon.dark', 'Icon path when a dark theme is used'),
								type: 'string'
							}
						}
					}
				]
			},
			when: {
				description: localize('vscode.extension.contributes.commandType.context.when', "Condition that must be met in order to show the command."),
				type: 'string'
			},
			where: {
				description: localize('vscode.extension.contributes.commandType.context.where', "Menus and tool bars to which commands can be added, e.g. `editor title actions` or `explorer context menu`"),
				enum: [
					'editor/primary',
					'editor/secondary'
				]
			}
		}
	};

	export const commandContribution: IJSONSchema = {
		description: localize('vscode.extension.contributes.commands', "Contributes commands to the command palette."),
		oneOf: [
			commandType,
			{
				type: 'array',
				items: commandType
			}
		]
	};
}

export const commands: ParsedCommand[] = [];

const _commandsById: { [id: string]: ParsedCommand } = Object.create(null);

function handleCommand(command: Command, user: IExtensionPointUser<any>): void {
	if (validation.isValidCommand(command, user)) {
		// store command globally
		const parsedCommand = new ParsedCommand(command, user.description);
		_commandsById[parsedCommand.id] = parsedCommand;
	}
}

ExtensionsRegistry.registerExtensionPoint<Command | Command[]>('commands', schema.commandContribution).setHandler(extensions => {
	for (let extension of extensions) {
		const {value} = extension;
		if (Array.isArray<Command>(value)) {
			for (let command of value) {
				handleCommand(command, extension);
			}
		} else {
			handleCommand(value, extension);
		}
	}

	commands.push(...values(_commandsById));
	Object.freeze(commands);
});

export class CommandAction extends Action {

	constructor(
		public command: ParsedCommand,
		@IExtensionService extensionService: IExtensionService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(command.id, command.title);
		this.order = Number.MAX_VALUE;

		const activationEvent = `onCommand:${command.id}`;
		this._actionCallback = (...args: any[]) => {
			return extensionService.activateByEvent(activationEvent).then(() => {
				return keybindingService.executeCommand(command.id, ...args);
			});
		};
	}
}