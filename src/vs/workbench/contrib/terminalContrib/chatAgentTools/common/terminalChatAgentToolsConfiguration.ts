/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from '../../../../../base/common/collections.js';
import type { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { localize } from '../../../../../nls.js';
import { type IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';

export const enum TerminalChatAgentToolsSettingId {
	EnableAutoApprove = 'chat.tools.terminal.enableAutoApprove',
	AutoApprove = 'chat.tools.terminal.autoApprove',
	ShellIntegrationTimeout = 'chat.tools.terminal.shellIntegrationTimeout',
	AutoReplyToPrompts = 'chat.tools.terminal.experimental.autoReplyToPrompts',

	DeprecatedAutoApproveCompatible = 'chat.agent.terminal.autoApprove',
	DeprecatedAutoApprove1 = 'chat.agent.terminal.allowList',
	DeprecatedAutoApprove2 = 'chat.agent.terminal.denyList',
	DeprecatedAutoApprove3 = 'github.copilot.chat.agent.terminal.allowList',
	DeprecatedAutoApprove4 = 'github.copilot.chat.agent.terminal.denyList',
}

export interface ITerminalChatAgentToolsConfiguration {
	autoApprove: { [key: string]: boolean };
	commandReportingAllowList: { [key: string]: boolean };
	shellIntegrationTimeout: number;
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
			localize('autoApprove.description.subCommands', "Note that these commands and regular expressions are evaluated for every _sub-command_ within the full _command line_, so {0} for example will need both {1} and {2} to match a {3} entry and must not match a {4} entry in order to auto approve. Inline commands such as {5} (command sustitution) or {6} (process substitution) are currently blocked by default via broad rules that detect these patterns.", '`foo && bar`', '`foo`', '`bar`', '`true`', '`false`', '`$(foo)`', '`<(foo)`'),
			localize('autoApprove.description.commandLine', "An object can be used to match against the full command line instead of matching sub-commands and inline commands, for example {0}. In order to be auto approved _both_ the sub-command and command line must not be explicitly denied, then _either_ all sub-commands or command line needs to be approved.", '`{ approve: false, matchCommandLine: true }`'),
			[
				localize('autoApprove.description.examples.title', 'Examples:'),
				`|${localize('autoApprove.description.examples.value', "Value")}|${localize('autoApprove.description.examples.description', "Description")}|`,
				'|---|---|',
				'| `\"mkdir\": true` | ' + localize('autoApprove.description.examples.mkdir', "Allow all commands starting with {0}", '`mkdir`'),
				'| `\"npm run build\": true` | ' + localize('autoApprove.description.examples.npmRunBuild', "Allow all commands starting with {0}", '`npm run build`'),
				'| `\"bin/test.sh\": true` | ' + localize('autoApprove.description.examples.binTest', "Allow all commands that match the path {0} ({1}, {2}, etc.)", '`bin/test.sh`', '`bin\\test.sh`', '`./bin/test.sh`'),
				'| `\"/^git (status\\|show\\\\b.*)$/\": true` | ' + localize('autoApprove.description.examples.regexGit', "Allow {0} and all commands starting with {1}", '`git status`', '`git show`'),
				'| `\"/^Get-ChildItem\\\\b/i\": true` | ' + localize('autoApprove.description.examples.regexCase', "will allow {0} commands regardless of casing", '`Get-ChildItem`'),
				'| `\"/.*/\": true` | ' + localize('autoApprove.description.examples.regexAll', "Allow all commands (denied commands still require approval)"),
				'| `\"rm\": false` | ' + localize('autoApprove.description.examples.rm', "Require explicit approval for all commands starting with {0}", '`rm`'),
				'| `\"/\\\\.ps1/i\": { approve: false, matchCommandLine: true }` | ' + localize('autoApprove.description.examples.ps1', "Require explicit approval for any _command line_ that contains {0} regardless of casing", '`".ps1"`'),
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
					},
					required: ['approve']
				},
				{
					type: 'null',
					description: localize('autoApprove.null', "Ignore the pattern, this is useful for unsetting the same pattern set at a higher scope."),
				},
			]
		},
		default: {
			// This is the default set of terminal auto approve commands. Note that these are best
			// effort and do not aim to provide exhaustive coverage to prevent dangerous commands
			// from executing as that is simply not feasible. Workspace trust and warnings of
			// possible prompt injection are _the_ thing protecting the user in agent mode, once
			// that trust boundary has been breached all bets are off as trusting a workspace that
			// contains anything malicious has already compromised the machine.
			//
			// Instead, the focus here is to unblock the user from approving clearly safe commands
			// frequently and cover common edge cases that could arise from the user auto-approving
			// commands.
			//
			// Take for example `find` which looks innocuous and most users are likely to auto
			// approve future calls when offered. However, the `-exec` argument can run anything. So
			// instead of leaving this decision up to the user we provide relatively safe defaults
			// and block common edge cases. So offering these default rules, despite their flaws, is
			// likely to protect the user more in general than leaving everything up to them (plus
			// make agent mode more convenient).

			// #region Safe commands
			//
			// Generally safe and common readonly commands

			cd: true,
			echo: true,
			ls: true,
			pwd: true,
			cat: true,
			head: true,
			tail: true,
			findstr: true,
			wc: true,
			tr: true,
			cut: true,
			cmp: true,
			which: true,
			basename: true,
			dirname: true,
			realpath: true,
			readlink: true,
			stat: true,
			file: true,
			du: true,
			df: true,
			sleep: true,

			// #endregion

			// #region Safe sub-commands
			//
			// Safe and common sub-commands

			'git status': true,
			'git log': true,
			'git show': true,
			'git diff': true,

			// #endregion

			// #region PowerShell

			'Get-ChildItem': true,
			'Get-Content': true,
			'Get-Date': true,
			'Get-Random': true,
			'Get-Location': true,
			'Write-Host': true,
			'Write-Output': true,
			'Split-Path': true,
			'Join-Path': true,
			'Start-Sleep': true,
			'Where-Object': true,

			// Blanket approval of safe verbs
			'/^Select-[a-z0-9]/i': true,
			'/^Measure-[a-z0-9]/i': true,
			'/^Compare-[a-z0-9]/i': true,
			'/^Format-[a-z0-9]/i': true,
			'/^Sort-[a-z0-9]/i': true,

			// #region Safe + disabled args
			//
			// Commands that are generally allowed with special cases we block. Note that shell
			// expansion is handled by the inline command detection when parsing sub-commands.

			// column
			// - `-c`: We block excessive columns that could lead to memory exhaustion.
			column: true,
			'/^column\\b.*-c\\s+[0-9]{4,}/': false,

			// date
			// -s|--set: Sets the system clock
			date: true,
			'/^date\\b.*(-s|--set)\\b/': false,

			// find
			// - `-delete`: Deletes files or directories.
			// - `-exec`/`-execdir`: Execute on results.
			// - `-fprint`/`fprintf`/`fls`: Writes files.
			// - `-ok`/`-okdir`: Like exec but with a confirmation.
			find: true,
			'/^find\\b.*-(delete|exec|execdir|fprint|fprintf|fls|ok|okdir)\\b/': false,

			// grep
			// - `-f`: Read patterns from file
			// - `-P`: PCRE risks include denial of service (memory exhaustion, catastrophic
			//   backtracking) which could lock up the terminal. More importantly, older PCRE allows
			//   code execution via this flag.
			// - Variable injection is possible, but requires setting a variable which would need
			//   manual approval.
			grep: true,
			'/^grep\\b.*-(f|P)\\b/': false,

			// sort
			// - `-o`: Output redirection can write files (`sort -o /etc/something file`) which are
			//   blocked currently
			// - `-S`: Memory exhaustion is possible (`sort -S 100G file`), we allow possible denial
			//   of service.
			sort: true,
			'/^sort\\b.*-(o|S)\\b/': false,

			// tree
			// - `-o`: Output redirection can write files (`tree -o /etc/something file`) which are
			//   blocked currently
			tree: true,
			'/^tree\\b.*-o\\b/': false,

			// #endregion

			// #region Dangerous patterns
			//
			// Patterns that are considered dangerous as they may lead to inline command execution.
			// These will just get blocked outright to be on the safe side, at least until there's a
			// real parser https://github.com/microsoft/vscode/issues/261794

			// `(command)` many shells execute commands inside parentheses
			'/\\(.+\\)/': { approve: false, matchCommandLine: true },

			// `{command}` many shells support execution inside curly braces, additionally this
			// typically means the sub-command detection system falls over currently
			'/\\{.+\\}/': { approve: false, matchCommandLine: true },

			// `\`command\`` many shells support execution inside backticks
			'/`.+`/': { approve: false, matchCommandLine: true },

			// endregion

			// #region Dangerous commands
			//
			// There are countless dangerous commands available on the command line, the defaults
			// here include common ones that the user is likely to want to explicitly approve first.
			// This is not intended to be a catch all as the user needs to opt-in to auto-approve
			// commands, it provides some additional safety when the commands get approved by overly
			// broad user/workspace rules.

			// Deleting files
			rm: false,
			rmdir: false,
			del: false,
			'Remove-Item': false,
			ri: false,
			rd: false,
			erase: false,
			dd: false,

			// Managing/killing processes, dangerous thing to do generally
			kill: false,
			ps: false,
			top: false,
			'Stop-Process': false,
			spps: false,
			taskkill: false,
			'taskkill.exe': false,

			// Web requests, prompt injection concerns
			curl: false,
			wget: false,
			'Invoke-RestMethod': false,
			'Invoke-WebRequest': false,
			'irm': false,
			'iwr': false,

			// File permissions and ownership, messing with these can cause hard to diagnose issues
			chmod: false,
			chown: false,
			'Set-ItemProperty': false,
			'sp': false,
			'Set-Acl': false,

			// General eval/command execution, can lead to anything else running
			jq: false,
			xargs: false,
			eval: false,
			'Invoke-Expression': false,
			iex: false,
			// #endregion
		} satisfies Record<string, boolean | { approve: boolean; matchCommandLine?: boolean }>,
	},
	[TerminalChatAgentToolsSettingId.ShellIntegrationTimeout]: {
		markdownDescription: localize('shellIntegrationTimeout.description', "Configures the duration in milliseconds to wait for shell integration to be detected when the run in terminal tool launches a new terminal. Set to `0` to wait the minimum time, the default value `-1` means the wait time is variable based on the value of {0} and whether it's a remote window. A large value can be useful if your shell starts very slowly and a low value if you're intentionally not using shell integration.", `\`#${TerminalSettingId.ShellIntegrationEnabled}#\``),
		type: 'integer',
		minimum: -1,
		maximum: 60000,
		default: -1
	},
	[TerminalChatAgentToolsSettingId.AutoReplyToPrompts]: {
		type: 'boolean',
		default: false,
		tags: ['experimental'],
		markdownDescription: localize('autoReplyToPrompts.key', "Whether to automatically respond to prompts in the terminal such as `Confirm? y/n`. This is an experimental feature and may not work in all scenarios."),
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
