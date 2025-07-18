/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import type { IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';

export const enum TerminalChatAgentToolsSettingId {
	CoreToolsEnabled = 'chat.agent.terminal.coreToolsEnabled',
	AutoApprove = 'chat.agent.terminal.autoApprove',
}

export interface ITerminalChatAgentToolsConfiguration {
	coreToolsEnabled: boolean;
	autoApprove: { [key: string]: boolean };
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
	[TerminalChatAgentToolsSettingId.AutoApprove]: {
		markdownDescription: localize('autoApprove', "A list of commands or regular expressions that control whether the run in terminal tool commands require explicit approval. These will be matched against the start of a command. A regular expression can be provided by wrapping the string in `/` characters.\n\nSet to `true` to automatically approve commands, or `false` to require explicit approval.\n\nExamples:\n- `\"mkdir\": true` Will allow all command lines starting with `mkdir`\n- `\"npm run build\": true` Will allow all command lines starting with `npm run build`\n- `\"rm\": false` Will require explicit approval for all command lines starting with `rm`\n- `\"/^git (status|show\\b.*)$/\": true` will allow `git status` and all command lines starting with `git show`\n- `\"/.*/\": true` will allow all command lines\n\nCommands set to `false` will override those set to `true`."),
		type: 'object',
		additionalProperties: {
			type: 'boolean',
			enum: [
				true,
				false,
			],
			enumDescriptions: [
				localize('autoApprove.true', "Automatically approve the pattern."),
				localize('autoApprove.false', "Require explicit approval for the pattern."),
			],
			description: localize('autoApprove.key', "The start of a command to match against. A regular expression can be provided by wrapping the string in `/` characters."),
		},
		tags: [
			'experimental'
		],
		default: {
			rm: false,
			rmdir: false,
			del: false,
			kill: false,
			curl: false,
			wget: false,
			eval: false,
			chmod: false,
			chown: false,
			'Remove-Item': false,
		},
		policy: {
			name: 'TerminalChatAgentToolsAutoApprove',
			minimumVersion: '1.103',
		}
	}
};
