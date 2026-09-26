/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../base/common/platform.js';
import type { ITerminalSandboxCommand } from './terminalSandboxService.js';
import { getCommandSubcommand, type ITerminalSandboxCommandRule, matchesTerminalSandboxCommandRule } from './terminalSandboxCommandRules.js';

export const enum TerminalSandboxRuntimeConfigurationOperation {
	GnuPG = 'gnupg',
	Node = 'node',
}

/**
 * `-c name=value` overrides that cannot make Git run a program.
 *
 * This is an allow list rather than a deny list on purpose. Git has many
 * configuration keys that name a program to execute -- `alias.*`, `core.pager`,
 * `core.editor`, `sequence.editor`, `core.sshCommand`, `core.hooksPath`,
 * `credential.helper`, `diff.external`, `*.textconv`, `filter.*.clean`,
 * `gpg.program`, `uploadpack.packObjectsHook` -- and more arrive with new Git
 * versions. Enumerating those would leave the grant one new key away from being
 * escapable, so only keys known to be inert are accepted.
 */
const gitConfigOverridesThatCannotRunAProgram = new Set([
	'user.name',
	'user.email',
	'user.signingkey',
	'commit.gpgsign',
	'tag.gpgsign',
	'push.gpgsign',
	'gpg.format',
	'core.autocrlf',
	'core.safecrlf',
	'core.filemode',
	'core.longpaths',
	'init.defaultbranch',
	'advice.detachedhead',
	'safe.directory',
]);

/**
 * Git options that name a program outright. These belong to the subcommand
 * rather than to Git, so they appear after it.
 */
const gitOptionsThatNameAProgram = new Set([
	'--exec',
	'--upload-pack',
	'--receive-pack',
]);

/** Git subcommands whose purpose is to run a command the caller supplies. */
const gitSubcommandsThatRunSuppliedCommands = new Set([
	'bisect',        // `git bisect run <command>`
	'submodule',     // `git submodule foreach <command>`
	'filter-branch', // `--tree-filter`, `--index-filter`, ...
]);

/**
 * Git's own options that take a separate value, so a value is never mistaken
 * for the subcommand.
 */
const gitOptionsWithValue = new Set([
	'-c',
	'-C',
	'--config-env',
	'--git-dir',
	'--work-tree',
	'--namespace',
	'--exec-path',
	'--super-prefix',
]);

/**
 * Environment variables that change what a Git invocation executes, either by
 * pointing Git at configuration the caller supplies or by naming a program
 * directly. The last group redirects any child process, not just Git's.
 */
const environmentVariablesThatCanRunAProgram = new Set([
	'GIT_CONFIG',
	'GIT_CONFIG_GLOBAL',
	'GIT_CONFIG_SYSTEM',
	'GIT_CONFIG_COUNT',
	'GIT_DIR',
	'GIT_WORK_TREE',
	'GIT_SSH',
	'GIT_SSH_COMMAND',
	'GIT_ASKPASS',
	'GIT_EDITOR',
	'GIT_SEQUENCE_EDITOR',
	'GIT_PAGER',
	'GIT_EXTERNAL_DIFF',
	'GIT_PROXY_COMMAND',
	'EDITOR',
	'VISUAL',
	'PAGER',
	'SSH_ASKPASS',
	'PATH',
	'LD_PRELOAD',
	'LD_LIBRARY_PATH',
	'DYLD_INSERT_LIBRARIES',
	'DYLD_LIBRARY_PATH',
]);

const environmentVariablePrefixesThatCanRunAProgram = [
	'GIT_CONFIG_KEY_',
	'GIT_CONFIG_VALUE_',
];

/**
 * Whether this Git invocation can make Git run a program the command line
 * chooses.
 *
 * The GnuPG grant below exists so that a signing operation can reach the
 * gpg-agent socket and the keyring. Git reaches those through a child process,
 * and the grant is applied to the whole sandboxed process tree, so any child
 * Git spawns inherits it. Matching on the `git` keyword alone therefore hands
 * the keyring and every Unix socket to whatever the command line can persuade
 * Git to execute -- `git -c alias.audit='!cat ~/.gnupg/...' audit` reads as an
 * ordinary Git command to the rule and as an arbitrary shell command to Git.
 *
 * None of these forms is a signing operation, so refusing the grant for them
 * costs nothing a signing flow needs.
 */
function gitInvocationCanRunASuppliedProgram(command: ITerminalSandboxCommand): boolean {
	for (const assignment of command.environmentAssignments ?? []) {
		const name = assignment.substring(0, assignment.indexOf('=')).toUpperCase();
		if (environmentVariablesThatCanRunAProgram.has(name)) {
			return true;
		}
		if (environmentVariablePrefixesThatCanRunAProgram.some(prefix => name.startsWith(prefix))) {
			return true;
		}
	}

	const subcommand = getCommandSubcommand(command.args, gitOptionsWithValue);
	if (subcommand !== undefined && gitSubcommandsThatRunSuppliedCommands.has(subcommand)) {
		return true;
	}

	// These belong to the subcommand, so the whole argument list is scanned.
	for (const arg of command.args) {
		const option = arg.includes('=') ? arg.substring(0, arg.indexOf('=')) : arg;
		if (gitOptionsThatNameAProgram.has(option)) {
			return true;
		}
	}

	// `-c` and `--config-env` are Git's own options, so only the tokens before
	// the subcommand count as configuration overrides. After the subcommand `-c`
	// belongs to it: `git commit -c <commit>` reuses a commit message, and
	// reading that as a configuration key would refuse the grant to an ordinary
	// signing command.
	for (let i = 0; i < command.args.length; i++) {
		const arg = command.args[i];
		if (arg === '--' || !arg.startsWith('-')) {
			break;
		}

		const hasInlineValue = arg.includes('=');
		const option = hasInlineValue ? arg.substring(0, arg.indexOf('=')) : arg;
		if (option !== '-c' && option !== '--config-env') {
			if (!hasInlineValue && gitOptionsWithValue.has(option)) {
				i++;
			}
			continue;
		}

		const override = hasInlineValue ? arg.substring(arg.indexOf('=') + 1) : command.args[++i];
		if (override === undefined) {
			return true;
		}
		const separatorIndex = override.indexOf('=');
		const key = (separatorIndex === -1 ? override : override.substring(0, separatorIndex)).toLowerCase();
		if (!gitConfigOverridesThatCannotRunAProgram.has(key)) {
			return true;
		}
	}

	return false;
}

const terminalSandboxRuntimeConfigurationCommandRules: readonly ITerminalSandboxCommandRule<TerminalSandboxRuntimeConfigurationOperation>[] = [
	{
		keywords: ['node', 'npm', 'npx', 'pnpm', 'yarn', 'corepack', 'bun', 'deno', 'nvm', 'volta', 'fnm', 'asdf', 'mise'],
		value: TerminalSandboxRuntimeConfigurationOperation.Node,
	},
	{
		keywords: ['git'],
		value: TerminalSandboxRuntimeConfigurationOperation.GnuPG,
		condition: ({ os }) => os !== OperatingSystem.Windows,
	},
];

function getTerminalSandboxRuntimeConfigurationForOperation(operation: TerminalSandboxRuntimeConfigurationOperation, os: OperatingSystem): Record<string, unknown> {
	switch (operation) {
		case TerminalSandboxRuntimeConfigurationOperation.GnuPG:
			switch (os) {
				case OperatingSystem.Windows:
					return {};
				case OperatingSystem.Macintosh:
				case OperatingSystem.Linux:
				default:
					return {
						network: {
							allowAllUnixSockets: true
						},
						filesystem: {
							allowRead: [
								'~/.gnupg'
							],
							allowWrite: [
								'~/.gnupg'
							]
						}
					};
			}

		case TerminalSandboxRuntimeConfigurationOperation.Node:
			switch (os) {
				case OperatingSystem.Windows:
					return {};
				case OperatingSystem.Macintosh:
				case OperatingSystem.Linux:
				default:
					return {
						filesystem: {
							allowWrite: [
								'~/.volta/'
							]
						}
					};
			}
	}
}

export function getTerminalSandboxRuntimeConfigurationForCommands(os: OperatingSystem, commandDetails: readonly ITerminalSandboxCommand[]): Record<string, unknown> {
	const operations = new Set<TerminalSandboxRuntimeConfigurationOperation>();
	for (const command of commandDetails) {
		for (const rule of terminalSandboxRuntimeConfigurationCommandRules) {
			if (matchesTerminalSandboxCommandRule(command, rule, { os }) && shouldApplyRuntimeConfigurationOperation(rule.value, commandDetails)) {
				operations.add(rule.value);
			}
		}
	}

	const configuration: Record<string, unknown> = {};
	for (const operation of operations) {
		mergeAdditionalSandboxConfigProperties(configuration, getTerminalSandboxRuntimeConfigurationForOperation(operation, os));
	}
	return configuration;
}

function shouldApplyRuntimeConfigurationOperation(operation: TerminalSandboxRuntimeConfigurationOperation, commandDetails: readonly ITerminalSandboxCommand[]): boolean {
	switch (operation) {
		case TerminalSandboxRuntimeConfigurationOperation.GnuPG:
			// Docker socket access can grant host-level privileges, so do not allow all Unix
			// sockets when a Docker-related command is part of the sandbox invocation.
			//
			// The same reasoning covers a Git command that can run a supplied program: the
			// grant applies to the whole sandboxed process tree, so one such command
			// anywhere in the invocation is enough to pass the keyring and the sockets on
			// to an arbitrary child.
			return commandDetails.every(command => {
				const keyword = command.keyword.toLowerCase();
				if (keyword.startsWith('docker')) {
					return false;
				}
				return keyword !== 'git' || !gitInvocationCanRunASuppliedProgram(command);
			});
		case TerminalSandboxRuntimeConfigurationOperation.Node:
			return true;
	}
}

function mergeAdditionalSandboxConfigProperties(target: Record<string, unknown>, additional: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(additional)) {
		if (!Object.prototype.hasOwnProperty.call(target, key)) {
			target[key] = value;
			continue;
		}

		const existingValue = target[key];
		if (Array.isArray(existingValue) && Array.isArray(value)) {
			target[key] = [...new Set([...existingValue, ...value])];
			continue;
		}
		if (isObjectForSandboxConfigMerge(existingValue) && isObjectForSandboxConfigMerge(value)) {
			mergeAdditionalSandboxConfigProperties(existingValue, value);
		}
	}
}

function isObjectForSandboxConfigMerge(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
