/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, Option } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { buildCliHost } from '../cliHost';
import { SOTA_EXIT_CODES } from '../headless';
import { HOOK_EVENTS, HookEvent, HooksFile, hooksFilePath } from '../persistence/HookRunner';

interface OutputOptions {
	output?: 'text' | 'json';
}

/**
 * Resolve the workspace root from the host the same way `HookRunner` does so
 * the management surface always writes to the location the runner reads.
 */
function workspaceRoot(): string {
	const host = buildCliHost();
	const folder = host.workspace.folders[0];
	return folder ? folder.fsPath : process.cwd();
}

function isHookEvent(value: string): value is HookEvent {
	return (HOOK_EVENTS as ReadonlyArray<string>).includes(value);
}

/**
 * Read the on-disk hooks file. Returns `{}` when the file is absent or
 * malformed — symmetric with `HookRunner`'s tolerant loader so a corrupt
 * file isn't fatal for the management commands either.
 */
function readHooks(root: string): HooksFile {
	const file = hooksFilePath(root);
	let raw: string;
	try {
		raw = fs.readFileSync(file, 'utf8');
	} catch {
		return {};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return {};
	}
	const out: HooksFile = {};
	for (const event of HOOK_EVENTS) {
		const value = (parsed as Record<string, unknown>)[event];
		if (Array.isArray(value)) {
			const scripts = value.filter((s): s is string => typeof s === 'string' && s.length > 0);
			if (scripts.length > 0) {
				out[event] = scripts;
			}
		}
	}
	return out;
}

/**
 * Write the hooks file with mode 0o600. The directory is created on demand
 * so `sota hooks add` works even before `sota init` has been run.
 */
function writeHooks(root: string, hooks: HooksFile): void {
	const file = hooksFilePath(root);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const ordered: HooksFile = {};
	for (const event of HOOK_EVENTS) {
		const scripts = hooks[event];
		if (scripts && scripts.length > 0) {
			ordered[event] = scripts;
		}
	}
	fs.writeFileSync(file, JSON.stringify(ordered, null, 2) + '\n', { mode: 0o600 });
}

function emit(opts: OutputOptions, textLine: string, jsonPayload: unknown): void {
	if (opts.output === 'json') {
		process.stdout.write(JSON.stringify(jsonPayload, null, 2) + '\n');
	} else {
		process.stdout.write(textLine);
	}
}

const outputOption = (): Option =>
	new Option('--output <mode>', 'Output mode: text or json')
		.choices(['text', 'json'])
		.default('text');

export function hooksCommand(): Command {
	const cmd = new Command('hooks');
	cmd.description('Manage workspace lifecycle hook scripts.');

	cmd.command('list')
		.description('List configured hooks for this workspace.')
		.addOption(outputOption())
		.action(async (opts: OutputOptions) => {
			const root = workspaceRoot();
			const hooks = readHooks(root);
			const entries: Array<{ event: HookEvent; scripts: ReadonlyArray<string> }> = [];
			for (const event of HOOK_EVENTS) {
				const scripts = hooks[event];
				if (scripts && scripts.length > 0) {
					entries.push({ event, scripts });
				}
			}

			if (opts.output === 'json') {
				process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
				return;
			}

			if (entries.length === 0) {
				process.stdout.write('No hooks configured.\n');
				return;
			}
			for (const { event, scripts } of entries) {
				process.stdout.write(`${event}:\n`);
				for (const s of scripts) {
					process.stdout.write(`  - ${s}\n`);
				}
			}
		});

	cmd.command('add <event> <script>')
		.description('Register a script to run for a lifecycle event.')
		.addOption(outputOption())
		.action(async (event: string, script: string, opts: OutputOptions) => {
			if (!isHookEvent(event)) {
				const supported = HOOK_EVENTS.join(', ');
				if (opts.output === 'json') {
					process.stdout.write(JSON.stringify({ ok: false, error: 'unknown-event', event, supported: HOOK_EVENTS }, null, 2) + '\n');
				} else {
					process.stderr.write(`error: unknown event '${event}'. Supported events: ${supported}\n`);
				}
				process.exit(SOTA_EXIT_CODES.HARD_FAIL);
			}

			const root = workspaceRoot();
			const hooks = { ...readHooks(root) };
			const existing = hooks[event] ?? [];
			// Keep declaration order but de-dupe — re-adding the same script
			// shouldn't make it fire twice.
			const next = existing.includes(script) ? existing.slice() : [...existing, script];
			hooks[event] = next;
			writeHooks(root, hooks);

			emit(opts, `Added '${script}' to ${event}.\n`, { ok: true, event, script, scripts: next });
		});

	cmd.command('remove <event> [script]')
		.description('Remove a script (or all scripts) from a lifecycle event.')
		.addOption(outputOption())
		.action(async (event: string, script: string | undefined, opts: OutputOptions) => {
			if (!isHookEvent(event)) {
				const supported = HOOK_EVENTS.join(', ');
				if (opts.output === 'json') {
					process.stdout.write(JSON.stringify({ ok: false, error: 'unknown-event', event, supported: HOOK_EVENTS }, null, 2) + '\n');
				} else {
					process.stderr.write(`error: unknown event '${event}'. Supported events: ${supported}\n`);
				}
				process.exit(SOTA_EXIT_CODES.HARD_FAIL);
			}

			const root = workspaceRoot();
			const hooks = { ...readHooks(root) };
			const existing = hooks[event] ?? [];

			let remaining: ReadonlyArray<string>;
			if (script === undefined) {
				remaining = [];
			} else {
				remaining = existing.filter((s) => s !== script);
			}

			if (remaining.length === 0) {
				delete hooks[event];
			} else {
				hooks[event] = remaining;
			}
			writeHooks(root, hooks);

			const summary = script === undefined
				? `Removed all scripts from ${event}.\n`
				: `Removed '${script}' from ${event}.\n`;
			emit(opts, summary, { ok: true, event, scripts: remaining });
		});

	return cmd;
}
