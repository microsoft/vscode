/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../../../base/common/platform.js';
import type { ITerminalSandboxCommand } from '../../../../../platform/sandbox/common/terminalSandboxService.js';
import { gitGlobalOptionsWithValue, type ITerminalSandboxCommandRule, matchesTerminalSandboxCommandRule } from './terminalSandboxCommandRules.js';

export const enum TerminalSandboxRuntimeConfigurationOperation {
	GnuPG = 'gnupg',
	Node = 'node',
}

const terminalSandboxRuntimeConfigurationCommandRules: readonly ITerminalSandboxCommandRule<TerminalSandboxRuntimeConfigurationOperation>[] = [
	{
		keywords: ['node', 'npm', 'npx', 'pnpm', 'yarn', 'corepack', 'bun', 'deno', 'nvm', 'volta', 'fnm', 'asdf', 'mise'],
		value: TerminalSandboxRuntimeConfigurationOperation.Node,
	},
	{
		keywords: ['git'],
		value: TerminalSandboxRuntimeConfigurationOperation.GnuPG,
		subcommands: ['commit'],
		optionsWithValue: gitGlobalOptionsWithValue,
		condition: ({ os }) => os !== OperatingSystem.Windows,
		when: isGpgSignedGitCommit,
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
			if (matchesTerminalSandboxCommandRule(command, rule, { os })) {
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

function isGpgSignedGitCommit(command: ITerminalSandboxCommand): boolean {
	return command.args.some(arg => arg === '-S' || arg.startsWith('-S') || arg === '--gpg-sign' || arg.startsWith('--gpg-sign='));
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
