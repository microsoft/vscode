/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../base/common/platform.js';
import type { ITerminalSandboxCommand } from './terminalSandboxService.js';
import { type ITerminalSandboxCommandRule, matchesTerminalSandboxCommandRule } from './terminalSandboxCommandRules.js';

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
		condition: ({ os }) => os !== OperatingSystem.Windows,
	},
];

const terminalSandboxGnuPGCompatibleCommandKeywords = new Set(['git', 'gh', 'gpg', 'gpg2']);

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
			// allowAllUnixSockets applies to the whole sandbox invocation, so only allow chains
			// containing Git, GitHub CLI, and GnuPG commands.
			return commandDetails.every(command => terminalSandboxGnuPGCompatibleCommandKeywords.has(command.keyword.toLowerCase()));
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
