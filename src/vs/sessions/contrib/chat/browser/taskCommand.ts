/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandString } from '../../../../workbench/contrib/tasks/common/taskConfiguration.js';
import { ITaskEntry } from './sessionsTasksService.js';

/**
 * Operating system identifier used to pick the right OS-specific overrides on
 * an `ITaskEntry`. Mirrors the keys used in `tasks.json` (`windows`, `osx`,
 * `linux`).
 */
export type TaskTargetOS = 'windows' | 'osx' | 'linux';

/**
 * Context passed to {@link resolveTaskCommand}.
 */
export interface ITaskResolutionContext {
	/**
	 * Target OS for picking OS-specific `command`/`args` overrides.
	 */
	readonly targetOS?: TaskTargetOS;
	/**
	 * Lookup used to resolve `dependsOn` references. Should return the
	 * referenced `ITaskEntry` by `label`, or `undefined` if the task is not
	 * declared in any reachable `tasks.json`.
	 */
	readonly lookup?: (label: string) => ITaskEntry | undefined;
}

/**
 * Characters that require POSIX-shell quoting when present in a plain string
 * argument. Conservative — wraps anything that could cause re-tokenization or
 * variable / glob / metachar interpretation.
 */
const POSIX_NEEDS_QUOTING = /[^A-Za-z0-9_\-.,:/=@%+]/;

function posixStrong(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function posixWeak(value: string): string {
	return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function posixEscape(value: string): string {
	return value.replace(/([\\\s"'`$&|;<>(){}[\]*?#~!])/g, '\\$1');
}

function renderArg(arg: CommandString): string {
	if (typeof arg === 'string') {
		return POSIX_NEEDS_QUOTING.test(arg) ? posixStrong(arg) : arg;
	}
	if (Array.isArray(arg)) {
		return arg.map(renderArg).join(' ');
	}
	const value = CommandString.value(arg);
	switch (arg.quoting) {
		case 'strong': return posixStrong(value);
		case 'weak': return posixWeak(value);
		case 'escape': return posixEscape(value);
		default: return POSIX_NEEDS_QUOTING.test(value) ? posixStrong(value) : value;
	}
}

/**
 * Resolves a task entry's own `command`/`script` (ignoring `dependsOn`).
 */
function resolveOwnCommand(task: ITaskEntry, targetOS?: TaskTargetOS): string | undefined {
	const override = targetOS ? task[targetOS] as { command?: string; args?: CommandString[] } | undefined : undefined;
	const command = override?.command ?? task.command;
	const args = override?.args ?? task.args;

	if (command) {
		const parts: string[] = [command];
		if (args) {
			for (const arg of args) {
				parts.push(renderArg(arg));
			}
		}
		return parts.join(' ');
	}

	if (task.script && (!task.type || task.type === 'npm')) {
		return `npm run ${task.script}`;
	}

	return undefined;
}

/**
 * Resolves a task's `dependsOn` chain into a single shell snippet, recursing
 * through each dependency.
 *
 * Returns `undefined` if no dependency could be resolved. Self-referencing or
 * cyclic chains are broken by tracking the active resolution stack — the
 * cycling task contributes `undefined` and the rest of the chain proceeds.
 */
function resolveDependencies(task: ITaskEntry, ctx: ITaskResolutionContext, stack: Set<string>): string | undefined {
	if (!task.dependsOn || !ctx.lookup) {
		return undefined;
	}
	const depLabels = typeof task.dependsOn === 'string' ? [task.dependsOn] : task.dependsOn;
	const resolved: string[] = [];
	for (const label of depLabels) {
		const dep = ctx.lookup(label);
		if (!dep) {
			continue;
		}
		const cmd = resolveInternal(dep, ctx, stack);
		if (cmd) {
			resolved.push(cmd);
		}
	}
	if (resolved.length === 0) {
		return undefined;
	}
	if (resolved.length === 1) {
		return resolved[0];
	}
	// `parallel` is rendered as backgrounded subshells joined by `&`, with a
	// trailing `wait` so the overall command only completes when every
	// dependency does. Output interleaving is unavoidable but matches the
	// semantics of the Tasks extension. `sequence` (and the unspecified
	// default) chain with `&&` so a failing dependency short-circuits.
	return task.dependsOrder === 'parallel'
		? `${resolved.map(c => `( ${c} )`).join(' & ')} & wait`
		: resolved.join(' && ');
}

function resolveInternal(task: ITaskEntry, ctx: ITaskResolutionContext, stack: Set<string>): string | undefined {
	if (stack.has(task.label)) {
		// Cycle — break here. Other branches of the chain still resolve.
		return undefined;
	}
	stack.add(task.label);
	try {
		const own = resolveOwnCommand(task, ctx.targetOS);
		const deps = resolveDependencies(task, ctx, stack);
		if (own && deps) {
			return `${deps} && ${own}`;
		}
		return own ?? deps;
	} finally {
		stack.delete(task.label);
	}
}

/**
 * Resolves an `ITaskEntry` into a single shell command line that can be sent
 * to a terminal verbatim.
 *
 * This is intentionally a much smaller surface than the full Tasks extension
 * task resolution: it handles
 * - explicit `command` + `args` (including OS-specific `windows`/`osx`/`linux` overrides),
 * - `type: 'npm'` + `script` → `npm run <script>`,
 * - `dependsOn` chains (resolved recursively via `ctx.lookup`); `dependsOrder`
 *   of `sequence` (default) joins dependencies with `&&`, `parallel` joins
 *   them as backgrounded subshells with a trailing `wait`,
 *
 * and applies POSIX-shell quoting to `args` based on each arg's explicit
 * `CommandString` `quoting` metadata. Plain string args that contain shell
 * metacharacters are also strong-quoted so they are not re-tokenized by the
 * shell.
 *
 * It does NOT expand variables (e.g. `${workspaceFolder}`), apply problem
 * matchers, or honour `presentation` options.
 *
 * @returns the resolved command line, or `undefined` if neither the task nor
 *          any of its dependencies contain enough information to produce one.
 */
export function resolveTaskCommand(task: ITaskEntry, ctx?: ITaskResolutionContext): string | undefined {
	return resolveInternal(task, ctx ?? {}, new Set<string>());
}
