/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICommandResult } from './devContainerSamples.js';

/** A Docker CLI command converted for another container engine's CLI. */
export interface IDevContainerEngineCommand {
	readonly args: readonly string[];
	/** Converts the result of {@link args} to the Docker CLI's result for the original arguments. */
	readonly transformResult: (result: ICommandResult) => ICommandResult;
}

/** The Go templates of the Dev Container commands: `{{.Path}}`, `{{json .Path}}` and `{{index .Path "key"}}`. */
const templatePattern = /^\{\{\s*(?:(?<fn>json|index)\s+)?(?<path>\.(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)?)(?:\s+"(?<key>[^"]*)")?\s*\}\}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether the command lists or inspects objects, so its `--format` is the CLI's and not a container command's. */
function isFormattedCommand(args: readonly string[]): boolean {
	return args[0] === 'inspect' || args[0] === 'ps'
		|| (args[0] === 'container' && (args[1] === 'inspect' || args[1] === 'ps' || args[1] === 'ls'))
		|| (args[0] === 'volume' && (args[1] === 'inspect' || args[1] === 'ls'));
}

/** Formats a value like Go's text/template, which prints `<no value>` for a missing field. */
function formatValue(value: unknown): string {
	if (value === undefined || value === null) {
		return '<no value>';
	}
	return typeof value === 'string' ? value : JSON.stringify(value);
}

function evaluateTemplate(template: RegExpExecArray, value: unknown): string {
	const { fn, path, key } = template.groups!;
	const target = path === '.' ? value : path.slice(1).split('.').reduce<unknown>((object, name) => isRecord(object) ? object[name] : undefined, value);
	if (fn === 'json') {
		return JSON.stringify(target ?? null);
	}
	if (fn === 'index') {
		return formatValue(isRecord(target) && key !== undefined ? target[key] : undefined);
	}
	return formatValue(target);
}

/** Parses an inspect command's JSON array, or a list command's JSON object per line. */
function parseJsonOutput(stdout: string): readonly unknown[] {
	const trimmed = stdout.trim();
	if (!trimmed) {
		return [];
	}
	try {
		const value: unknown = JSON.parse(trimmed);
		return Array.isArray(value) ? value : [value];
	} catch {
		return trimmed.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
	}
}

/**
 * Converts Docker CLI arguments to WSLc's (`wslc.exe`), which has Docker's commands but whose `--format` only accepts
 * `json` and `table`. A Go template of a list or inspect command is evaluated on WSLc's JSON output instead.
 */
export function toWslcCommand(args: readonly string[]): IDevContainerEngineCommand {
	const formatIndex = isFormattedCommand(args) ? args.indexOf('--format') : -1;
	const template = formatIndex !== -1 ? templatePattern.exec(args[formatIndex + 1] ?? '') : null;
	if (!template) {
		return { args, transformResult: result => result };
	}
	return {
		args: [...args.slice(0, formatIndex + 1), 'json', ...args.slice(formatIndex + 2)],
		transformResult: result => {
			if (result.code !== 0) {
				return result;
			}
			try {
				return { ...result, stdout: parseJsonOutput(result.stdout).map(value => `${evaluateTemplate(template, value)}\n`).join('') };
			} catch (error) {
				return { stdout: '', stderr: `Cannot read the JSON output of wslc ${args[0]}: ${error instanceof Error ? error.message : String(error)}\n${result.stderr}`, code: 1 };
			}
		},
	};
}
