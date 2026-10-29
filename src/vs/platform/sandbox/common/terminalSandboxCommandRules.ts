/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { OperatingSystem } from '../../../base/common/platform.js';
import type { ITerminalSandboxCommand } from './terminalSandboxService.js';

export interface ITerminalSandboxCommandRuleContext {
	readonly os: OperatingSystem;
}

export interface ITerminalSandboxCommandRule<T> {
	readonly keywords: readonly string[];
	readonly value: T;
	readonly subcommands?: readonly string[];
	readonly optionsWithValue?: ReadonlySet<string>;
	/** Context-wide guard for rules, such as OS-specific sandbox capabilities. */
	readonly condition?: (context: ITerminalSandboxCommandRuleContext) => boolean;
	/** Command-specific guard for argument-sensitive rules. */
	readonly when?: (command: ITerminalSandboxCommand) => boolean;
}

export function matchesTerminalSandboxCommandRule<T>(command: ITerminalSandboxCommand, rule: ITerminalSandboxCommandRule<T>, context?: ITerminalSandboxCommandRuleContext): boolean {
	if (!rule.keywords.includes(command.keyword.toLowerCase())) {
		return false;
	}
	if (rule.condition && (!context || !rule.condition(context))) {
		return false;
	}
	if (rule.subcommands) {
		const subcommand = getCommandSubcommand(command.args, rule.optionsWithValue);
		if (subcommand === undefined || !rule.subcommands.includes(subcommand)) {
			return false;
		}
	}
	return rule.when?.(command) ?? true;
}

/**
 * Returns rule values shared by every command so a compound invocation cannot transfer command-specific capabilities between executables.
 */
export function getTerminalSandboxCommandRuleValuesForAllCommands<T>(commands: readonly ITerminalSandboxCommand[], rules: readonly ITerminalSandboxCommandRule<T>[], context?: ITerminalSandboxCommandRuleContext): readonly T[] {
	if (commands.length === 0) {
		return [];
	}

	const values = new Set<T>();
	for (const rule of rules) {
		if (values.has(rule.value)) {
			continue;
		}
		if (commands.every(command => rules.some(candidate => candidate.value === rule.value && matchesTerminalSandboxCommandRule(command, candidate, context)))) {
			values.add(rule.value);
		}
	}
	return [...values];
}

/**
 * Returns the first non-option argument, treating it as the command's subcommand.
 * Options are skipped, and options listed in `optionsWithValue` also skip the
 * following argument so global option values are not mistaken for subcommands.
 *
 * For example, with `-C` in `optionsWithValue`, `git -C repo commit` returns
 * `commit` instead of `repo`.
 */
export function getCommandSubcommand(args: readonly string[], optionsWithValue?: ReadonlySet<string>): string | undefined {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--') {
			return undefined;
		}

		if (arg.startsWith('-')) {
			const option = arg.includes('=') ? arg.substring(0, arg.indexOf('=')) : arg;
			if (!arg.includes('=') && optionsWithValue?.has(option)) {
				i++;
			}
			continue;
		}

		return arg.toLowerCase();
	}

	return undefined;
}
