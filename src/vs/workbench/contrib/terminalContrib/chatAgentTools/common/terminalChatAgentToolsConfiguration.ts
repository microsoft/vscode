/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import type { IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';

export const enum TerminalChatAgentToolsSettingId {
	CoreToolsEnabled = 'chat.agent.terminal.coreToolsEnabled',
	AllowList = 'chat.agent.terminal.allowList',
	DenyList = 'chat.agent.terminal.denyList',
}

export interface ITerminalChatAgentToolsConfiguration {
	coreToolsEnabled: boolean;
	allowList: { [key: string]: string };
	denyList: { [key: string]: string };
}

export const terminalChatAgentToolsConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalChatAgentToolsSettingId.CoreToolsEnabled]: {
		description: localize('coreToolsEnabled', "Whether the experimental core tools are enabled. This required VS Code to be restarted."),
		type: 'boolean',
		tags: [
			'experimental'
		],
		default: true,
	},
	[TerminalChatAgentToolsSettingId.AllowList]: {
		markdownDescription: localize('allowList', "A list of commands or regular expressions that allow the run in terminal tool commands to run without explicit approval. These will be matched against the start of a command. A regular expression can be provided by wrapping the string in `/` characters.\n\nExamples:\n- `\"mkdir\"` Will allow all command lines starting with `mkdir`\n- `\"npm run build\"` Will allow all command lines starting with `npm run build`\n- `\"/^git (status|show\\b.*)$/\"` will allow `git status` and all command lines starting with `git show`\n- `\"/.*/\"` will allow all command lines\n\nThis will be overridden by anything that matches an entry in `#chat.agent.terminal.denyList#`."),
		type: 'object',
		additionalProperties: {
			type: 'boolean',
			enum: [
				true,
				false,
			],
			enumDescriptions: [
				localize('allowList.true', "Allow the pattern."),
				localize('allowList.false', "Do not allow the pattern."),
			],
			description: localize('allowList.key', "The start of a command to match against. A regular expression can be provided by wrapping the string in `/` characters."),
		},
		tags: [
			'experimental'
		],
		default: {},
	},
	[TerminalChatAgentToolsSettingId.DenyList]: {
		markdownDescription: localize('denyList', "A list of commands or regular expressions that override matches in `#chat.agent.terminal.allowList#` and force a command line to require explicit approval. This will be matched against the start of a command. A regular expression can be provided by wrapping the string in `/` characters.\n\nExamples:\n- `\"rm\"` will require explicit approval for any command starting with `rm`\n- `\"/^git (push|pull)/\"` will require explicit approval for any command starting with `git push` or `git pull` \n\nThis provides basic protection by preventing certain commands from running automatically, especially those a user would likely want to approve first. It is not intended as a comprehensive security measure or a defense against prompt injection."),
		type: 'object',
		additionalProperties: {
			type: 'boolean',
			enum: [
				true,
				false
			],
			enumDescriptions: [
				localize('denyList.value.true', "Deny the pattern."),
				localize('denyList.value.false', "Do not deny the pattern."),
			],
			description: localize('denyList.key', "The start of a command to match against. A regular expression can be provided by wrapping the string in `/` characters.")
		},
		tags: [
			'experimental'
		],
		default: {
			rm: true,
			rmdir: true,
			del: true,
			kill: true,
			curl: true,
			wget: true,
			eval: true,
			chmod: true,
			chown: true,
			'Remove-Item': true,
		},
	}
};
