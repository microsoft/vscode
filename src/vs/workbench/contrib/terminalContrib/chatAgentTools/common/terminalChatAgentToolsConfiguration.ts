/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from '../../../../../base/common/collections.js';
import type { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { localize } from '../../../../../nls.js';
import { type IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';

export const enum TerminalChatAgentToolsSettingId {
	AutoApprove = 'chat.tools.terminal.autoApprove',

	DeprecatedAutoApproveCompatible = 'chat.agent.terminal.autoApprove',
	DeprecatedAutoApprove1 = 'chat.agent.terminal.allowList',
	DeprecatedAutoApprove2 = 'chat.agent.terminal.denyList',
	DeprecatedAutoApprove3 = 'github.copilot.chat.agent.terminal.allowList',
	DeprecatedAutoApprove4 = 'github.copilot.chat.agent.terminal.denyList',
}

export interface ITerminalChatAgentToolsConfiguration {
	autoApprove: { [key: string]: boolean };
}

const autoApproveBoolean: IJSONSchema = {
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
};

export const terminalChatAgentToolsConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalChatAgentToolsSettingId.AutoApprove]: {
		markdownDescription: [
			localize('autoApprove.description.intro', "A list of commands or regular expressions that control whether the run in terminal tool commands require explicit approval. These will be matched against the start of a command. A regular expression can be provided by wrapping the string in {0} characters followed by optional flags such as {1} for case-insensitivity.", '`/`', '`i`'),
			localize('autoApprove.description.values', "Set to {0} to automatically approve commands, {1} to always require explicit approval or {2} to unset the value.", '`true`', '`false`', '`null`'),
			localize('autoApprove.description.subCommands', "Note that these commands and regular expressions are evaluated for every _sub-command_ within the full _command line_, so {0} for example will need both {1} and {2} to match a {3} entry and must not match a {4} entry in order to auto approve. Inline commands are also detected so {5} will need both {5} and {6} to pass.", '`foo && bar`', '`foo`', '`bar`', '`true`', '`false`', '`echo $(rm file)`', '`rm file`'),
			localize('autoApprove.description.commandLine', "An object can be used to match against the full command line instead of matching sub-commands and inline commands, for example {0}. In order to be auto approved _both_ the sub-command and command line must not be explicitly denied, then _either_ all sub-commands or command line needs to be approved.", '`{ approve: false, matchCommandLine: true }`'),
			[
				localize('autoApprove.description.examples.title', 'Examples:'),
				`|${localize('autoApprove.description.examples.value', "Value")}|${localize('autoApprove.description.examples.description', "Description")}|`,
				'|---|---|',
				'| `\"mkdir\": true` | ' + localize('autoApprove.description.examples.mkdir', "Allow all commands starting with {0}", '`mkdir`'),
				'| `\"npm run build\": true` | ' + localize('autoApprove.description.examples.npmRunBuild', "Allow all commands starting with {0}", '`npm run build`'),
				'| `\"/^git (status\\|show\\b.*)$/\": true` | ' + localize('autoApprove.description.examples.regexGit', "Allow {0} and all commands starting with {1}", '`git status`', '`git show`'),
				'| `\"/^Get-ChildItem\\b/i\": true` | ' + localize('autoApprove.description.examples.regexCase', "will allow {0} commands regardless of casing", '`Get-ChildItem`'),
				'| `\"/.*/\": true` | ' + localize('autoApprove.description.examples.regexAll', "Allow all commands (denied commands still require approval)"),
				'| `\"rm\": false` | ' + localize('autoApprove.description.examples.rm', "Require explicit approval for all commands starting with {0}", '`rm`'),
				'| `\"/\.ps1/i\": { approve: false, matchCommandLine: true }` | ' + localize('autoApprove.description.examples.ps1', "Require explicit approval for any _command line_ that contains {0} regardless of casing", '`".ps1"`'),
				'| `\"rm\": null` | ' + localize('autoApprove.description.examples.rmUnset', "Unset the default {0} value for {1}", '`false`', '`rm`'),
			].join('\n')
		].join('\n\n'),
		type: 'object',
		additionalProperties: {
			anyOf: [
				autoApproveBoolean,
				{
					type: 'object',
					properties: {
						approve: autoApproveBoolean,
						matchCommandLine: {
							type: 'boolean',
							enum: [
								true,
								false,
							],
							enumDescriptions: [
								localize('autoApprove.matchCommandLine.true', "Match against the full command line, eg. `foo && bar`."),
								localize('autoApprove.matchCommandLine.false', "Match against sub-commands and inline commands, eg. `foo && bar` will need both `foo` and `bar` to match."),
							],
							description: localize('autoApprove.matchCommandLine', "Whether to match against the full command line, as opposed to splitting by sub-commands and inline commands."),
						}
					}
				},
				{
					type: 'null',
					description: localize('autoApprove.null', "Ignore the pattern, this is useful for unsetting the same pattern set at a higher scope."),
				},
			]
		},
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
			'/^Remove-Item\\b/i': false,
		},
	}
};

for (const id of [
	TerminalChatAgentToolsSettingId.DeprecatedAutoApprove1,
	TerminalChatAgentToolsSettingId.DeprecatedAutoApprove2,
	TerminalChatAgentToolsSettingId.DeprecatedAutoApprove3,
	TerminalChatAgentToolsSettingId.DeprecatedAutoApprove4,
	TerminalChatAgentToolsSettingId.DeprecatedAutoApproveCompatible,
]) {
	terminalChatAgentToolsConfiguration[id] = {
		deprecated: true,
		markdownDeprecationMessage: localize('autoApprove.deprecated', 'Use {0} instead', `\`#${TerminalChatAgentToolsSettingId.AutoApprove}#\``)
	};
}
