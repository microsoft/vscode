/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createErrorInstance } from './errors.js';

// Use bitwise representation of suggestion flags.
// See here: https://stackoverflow.com/questions/39359740/what-are-enum-flags-in-typescript/
//
// Given a number `flags` we can test `if (flags & Subcommands)` to see if we
// should be suggesting subcommands.
//
// This is more maintainable in the future if we add more options (e.g. if we
// distinguish between subcommand args and option args) as we can just add a
// number here instead of passing 3+ boolean flags everywhere.
export enum SuggestionFlag {
	None = 0,
	Subcommands = 1 << 0,
	Options = 1 << 1,
	Args = 1 << 2,
	Any = (1 << 2) | (1 << 1) | (1 << 0),
}

// Combination of suggestion flags.
export type SuggestionFlags = number;

export enum SpecLocationSource {
	GLOBAL = 'global',
	LOCAL = 'local',
}

export function makeArray<T>(object: T | T[]): T[] {
	return Array.isArray(object) ? object : [object];
}

export function firstMatchingToken(
	str: string,
	chars: Set<string>,
): string | undefined {
	for (const char of str) {
		if (chars.has(char)) {
			return char;
		}
	}
	return undefined;
}

export const TimeoutError = createErrorInstance('TimeoutError');

export async function withTimeout<T>(
	time: number,
	promise: Promise<T>,
): Promise<T> {
	let timeout: NodeJS.Timeout;
	return Promise.race<Promise<T>>([
		promise,
		new Promise<T>((_, reject) => {
			timeout = setTimeout(() => {
				reject(new TimeoutError('Function timed out'));
			}, time);
		}),
	]).finally(() => {
		clearTimeout(timeout);
	});
}

export const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

export const splitPath = (path: string): [string, string] => {
	const idx = path.lastIndexOf('/') + 1;
	return [path.slice(0, idx), path.slice(idx)];
};

export const ensureTrailingSlash = (str: string) =>
	str.endsWith('/') ? str : `${str}/`;

// Outputs CWD with trailing `/`
export const getCWDForFilesAndFolders = (
	cwd: string | null,
	searchTerm: string,
): string => {
	if (cwd === null) {
		return '/';
	}
	const [dirname] = splitPath(searchTerm);

	if (dirname === '') {
		return ensureTrailingSlash(cwd);
	}

	return dirname.startsWith('~/') || dirname.startsWith('/')
		? dirname
		: `${cwd}/${dirname}`;
};
