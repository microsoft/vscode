/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ILanguageModelToolsService } from '../../../chat/common/languageModelToolsService.js';

let previouslyRecommededInSession = false;

const terminalCommands: { commands: RegExp[]; tags: string[] }[] = [
	{
		commands: [
			new RegExp(/^python3? -m pip install(\b)/),
			new RegExp(/^pip3? install(\b)/),
		],
		tags: ['python environment'],
	},
	{
		commands: [
			new RegExp(/^python3? -m jupyter(\b)/),
			new RegExp(/^python3? -m pip install\b.*jupyter\b.*/),
			new RegExp(/^pip3? install\b.*jupyter\b.*/),
			new RegExp(/^jupyter(\b)/), // jupyter lab, jupyer notebook, jupyter nbconvert, etc.
		],
		tags: ['python environment', 'jupyter environment'],
	}
];

export function getRecommendedToolsOverRunInTerminal(commandLine: string, languageModelToolsService: ILanguageModelToolsService): string | undefined {
	const tools = languageModelToolsService.getTools();
	if (!tools || previouslyRecommededInSession) {
		return;
	}

	const recommendedTools = new Set<string>();
	const messages: string[] = [
		`The terminal command '${commandLine}' was not executed.`,
		`Try using some of the following tools instead of running a Terminal Command (if unable to use one of these tools as an alternative then run the same terminal command again):`,
	];
	for (const terminalCommand of terminalCommands) {
		if (!terminalCommand.commands.some((condition) => condition.test(commandLine))) {
			continue;
		}
		const tagsToSearchFor = terminalCommand.tags;
		Array.from(tools)
			.filter(t => tagsToSearchFor.some(tag => t.tags?.includes(tag)))
			.forEach(tool => {
				recommendedTools.add(tool.id);
			});

	}
	recommendedTools.forEach(toolName => {
		messages.push(`- ${toolName}`);
	});

	if (recommendedTools.size) {
		previouslyRecommededInSession = true;
		return messages.join('  \n');
	}

	return undefined;
}
