/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../../base/common/platform.js';
import { CommandString } from '../../../../workbench/contrib/tasks/common/taskConfiguration.js';
import { ITaskEntry } from './sessionsTasksService.js';

/**
 * Operating system identifier used to pick the right OS-specific overrides on
 * an `ITaskEntry`. Mirrors the keys used in `tasks.json` (`windows`, `osx`,
 * `linux`).
 */
export type TaskTargetOS = 'windows' | 'osx' | 'linux';

/**
 * Maps an {@link OperatingSystem} to the matching {@link TaskTargetOS} key used
 * to select OS-specific `command`/`args` overrides on an `ITaskEntry`.
 */
export function osToTaskTargetOS(os: OperatingSystem): TaskTargetOS {
	switch (os) {
		case OperatingSystem.Windows: return 'windows';
		case OperatingSystem.Macintosh: return 'osx';
		case OperatingSystem.Linux:
		default:
			return 'linux';
	}
}

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
	/**
	 * Optional hook that expands variables (e.g. `${workspaceFolder}`) before
	 * shell-quoting. When omitted, variables are left as-is.
	 */
	readonly resolveVariables?: (value: string) => Promise<string>;
}

/**
 * Applies the caller-supplied variable resolver to a raw string, if any.
 */
function expandVariables(value: string, ctx: ITaskResolutionContext): Promise<string> | string {
	return ctx.resolveVariables ? ctx.resolveVariables(value) : value;
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

async function renderArg(arg: CommandString, ctx: ITaskResolutionContext): Promise<string> {
	if (typeof arg === 'string') {
		const value = await expandVariables(arg, ctx);
		return POSIX_NEEDS_QUOTING.test(value) ? posixStrong(value) : value;
	}
	if (Array.isArray(arg)) {
		return (await Promise.all(arg.map(a => renderArg(a, ctx)))).join(' ');
	}
	const value = await expandVariables(CommandString.value(arg), ctx);
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
async function resolveOwnCommand(task: ITaskEntry, ctx: ITaskResolutionContext): Promise<string | undefined> {
	const override = ctx.targetOS ? task[ctx.targetOS] as { command?: string; args?: CommandString[] } | undefined : undefined;
	const command = override?.command ?? task.command;
	const args = override?.args ?? task.args;

	if (command) {
		const parts: string[] = [await expandVariables(command, ctx)];
		if (args) {
			for (const arg of args) {
				parts.push(await renderArg(arg, ctx));
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
 * Resolves a task's `dependsOn` chain into a single shell snippet. Returns
 * `undefined` if nothing resolves; cyclic chains are broken via `stack`.
 */
async function resolveDependencies(task: ITaskEntry, ctx: ITaskResolutionContext, stack: Set<string>): Promise<string | undefined> {
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
		const cmd = await resolveInternal(dep, ctx, stack);
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
	// parallel: backgrounded subshells + `wait`. sequence/default: `&&` chain.
	return task.dependsOrder === 'parallel'
		? `${resolved.map(c => `( ${c} )`).join(' & ')} & wait`
		: resolved.join(' && ');
}

async function resolveInternal(task: ITaskEntry, ctx: ITaskResolutionContext, stack: Set<string>): Promise<string | undefined> {
	if (stack.has(task.label)) {
		// Cycle — break here. Other branches of the chain still resolve.
		return undefined;
	}
	stack.add(task.label);
	try {
		const own = await resolveOwnCommand(task, ctx);
		const deps = await resolveDependencies(task, ctx, stack);
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
 * to a terminal verbatim. Handles `command`+`args` (with OS overrides),
 * `type: 'npm'`+`script`, `dependsOn` chains, POSIX quoting, and variable
 * expansion via {@link ITaskResolutionContext.resolveVariables}. Does not apply
 * problem matchers or `presentation` options.
 *
 * @returns the resolved command line, or `undefined` if neither the task nor
 *          its dependencies yield a command.
 */
export function resolveTaskCommand(task: ITaskEntry, ctx?: ITaskResolutionContext): Promise<string | undefined> {
	return resolveInternal(task, ctx ?? {}, new Set<string>());
}
