/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {localize} from 'vs/nls';
import {join} from 'vs/base/common/paths';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import {forEach} from 'vs/base/common/collections';
import {IExtensionPointUser, IExtensionMessageCollector, ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';
import {IUserFriendlyCommand, IUserFriendlyMenuItem, IUserFriendlyMenuLocation, MenuRegistry} from './menusService';

namespace schema {

	// --- menus contribution point

	export function isValidMenuItems(menu: IUserFriendlyMenuItem[], collector: IExtensionMessageCollector): boolean {
		if (!Array.isArray(menu)) {
			collector.error(localize('requirearry', "menu items must be an arry"));
			return false;
		}

		for (let item of menu) {
			if (typeof item.command !== 'string') {
				collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
				return false;
			}
			if (item.alt && typeof item.alt !== 'string') {
				collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'alt'));
				return false;
			}
			if (item.when && typeof item.when !== 'string') {
				collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'when'));
				return false;
			}
		}

		return true;
	}

	const menuItem: IJSONSchema = {
		type: 'object',
		properties: {
			command: {
				description: localize('vscode.extension.contributes.menuItem.command', 'Identifier of the command to execute'),
				type: 'string'
			},
			alt: {
				description: localize('vscode.extension.contributes.menuItem.alt', 'Identifier of an alternative command to execute'),
				type: 'string'
			},
			when: {
				description: localize('vscode.extension.contributes.menuItem.when', 'Condition which must be true to show this item'),
				type: 'string'
			}
		}
	};

	export const menusContribtion: IJSONSchema = {
		description: localize('vscode.extension.contributes.menus', "Contributes menu items to predefined locations"),
		type: 'object',
		properties: {
			'editor/title': {
				type: 'array',
				items: menuItem
			}
		}
	};

	// --- commands contribution point

	export function isValidCommand(command: IUserFriendlyCommand, collector: IExtensionMessageCollector): boolean {
		if (!command) {
			collector.error(localize('nonempty', "expected non-empty value."));
			return false;
		}
		if (typeof command.command !== 'string') {
			collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
			return false;
		}
		if (typeof command.title !== 'string') {
			collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'title'));
			return false;
		}
		if (command.category && typeof command.category !== 'string') {
			collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'category'));
			return false;
		}
		if (!isValidIcon(command.icon, collector)) {
			return false;
		}
		return true;
	}

	function isValidIcon(icon: string | { light: string; dark: string;}, collector: IExtensionMessageCollector): boolean {
		if (typeof icon === 'undefined') {
			return true;
		}
		if (typeof icon === 'string') {
			return true;
		} else if (typeof icon.dark === 'string' && typeof icon.light === 'string') {
			return true;
		}
		collector.error(localize('opticon', "property `icon` can be omitted or must be either a string or a literal like `{dark, light}`"));
		return false;
	}

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
				anyOf: [
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
			}
		}
	};

	export const commandsContribution: IJSONSchema = {
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

ExtensionsRegistry.registerExtensionPoint<{ [loc: string]: IUserFriendlyMenuItem[] }>('menus', schema.menusContribtion).setHandler(extensions => {
	for (let extension of extensions) {
		const {value, collector} = extension;

		forEach(value, entry => {
			if (!schema.isValidMenuItems(entry.value, collector)) {
				return;
			}

			if (!MenuRegistry.registerMenuItems(<IUserFriendlyMenuLocation>entry.key, entry.value)) {
				// ignored
			}
		});
	}
});

ExtensionsRegistry.registerExtensionPoint<IUserFriendlyCommand | IUserFriendlyCommand[]>('commands', schema.commandsContribution).setHandler(extensions => {

	function handleCommand(command: IUserFriendlyCommand, extension: IExtensionPointUser<any>) {

		if (!schema.isValidCommand(command, extension.collector)) {
			return;
		}

		let {icon} = command;
		if (!icon) {
			// ignore
		} else if (typeof icon === 'string') {
			command.icon = join(extension.description.extensionFolderPath, icon);
		} else {
			const light = join(extension.description.extensionFolderPath, icon.light);
			const dark = join(extension.description.extensionFolderPath, icon.dark);
			command.icon = { light, dark };
		}

		if (MenuRegistry.registerCommand(command)) {
			extension.collector.info(localize('dup', "Command `{0}` appears multiple times in the `commands` section.", command.command));
		}
	}

	for (let extension of extensions) {
		const {value} = extension;
		if (Array.isArray<IUserFriendlyCommand>(value)) {
			for (let command of value) {
				handleCommand(command, extension);
			}
		} else {
			handleCommand(value, extension);
		}
	}
});

