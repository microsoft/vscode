/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {localize} from 'vs/nls';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import {IExtensionMessageCollector, ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';

export interface ResourceFilter {
	language?: string;
	scheme?: string;
	pattern?: string;
}

export interface Context {
	path: 'editor/primary' | 'editor/secondary';
	when: string | string[] | ResourceFilter | ResourceFilter[];
}

export interface Command {
	command: string;
	title: string;
	category?: string;
	context?: Context | Context[];
}

function isCommands(thing: Command | Command[]): thing is Command[] {
	return Array.isArray(thing);
}

function isContexts(thing: Context | Context[]): thing is Context[] {
	return Array.isArray(thing);
}

function isValidContext(context: Context, rejects: string[]): boolean {
	if (!context) {
		return true;
	}
	if (context.path !== 'editor/primary' && context.path !== 'editor/secondary') {
		rejects.push(localize('requireenumtype', "property `path` is mandatory and must be one of `editor/primary`, `editor/secondary`"));
		return false;
	}
	if (typeof context.when !== 'object' && typeof context.when !== 'string' && !Array.isArray(context.when)) {
		rejects.push(localize('requirefilter', "property `when` is mandatory and must be like `{language, scheme, pattern}`"));
		return false;
	}
	return true;
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
	if (candidate.context) {
		let {context} = candidate;
		if (isContexts(context)) {
			if (!context.every(context => isValidContext(context, rejects))) {
				return false;
			}
		} else if (!isValidContext(context, rejects)) {
			return false;
		}
	}
	return true;
}

const filterType: IJSONSchema = {
	type: 'object',
	properties: {
		language: {
			description: localize('vscode.extension.contributes.filterType.language', ""),
			type: 'string'
		},
		scheme: {
			description: localize('vscode.extension.contributes.filterType.scheme', ""),
			type: 'string'
		},
		pattern: {
			description: localize('vscode.extension.contributes.filterType.pattern', ""),
			type: 'string'
		}
	}
};

const contextType: IJSONSchema = {
	type: 'object',
	properties: {
		path: {
			description: localize('vscode.extension.contributes.commandType.context.path', ""),
			enum: [
				'editor/primary',
				'editor/secondary'
			]
		},
		when: {
			anyOf: [
				'string',
				filterType,
				{ type: 'array', items: 'string' },
				{ type: 'array', items: filterType },
			]
		}
	}
};

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
			description: localize('vscode.extension.contributes.commandType.category', '(Optional) category string by the command is grouped in the UI'),
			type: 'string'
		},
		context: {
			description: localize('vscode.extension.contributes.commandType.context', '(Optional) '),
			oneOf: [
				contextType,
				{ type: 'array', items: contextType }
			]
		}
	}
};

function handleCommand(command: Command, collector: IExtensionMessageCollector): void {

	let rejects: string[] = [];

	if (isValidCommand(command, rejects)) {
		// keep command
		commands.push(command);

	} else if (rejects.length > 0) {
		collector.error(localize(
			'error',
			"Invalid `contributes.commands`: {0}",
			rejects.join('\n')
		));
	}
}

export const commands: Command[] = [];

ExtensionsRegistry.registerExtensionPoint<Command | Command[]>('commands', {
	description: localize('vscode.extension.contributes.commands', "Contributes commands to the command palette."),
	oneOf: [
		commandType,
		{
			type: 'array',
			items: commandType
		}
	]
}).setHandler(extensions => {
	for (let extension of extensions) {
		const {value, collector} = extension;
		if (isCommands(value)) {
			for (let command of value) {
				handleCommand(command, collector);
			}
		} else {
			handleCommand(value, collector);
		}
	}

	Object.freeze(commands);
});
