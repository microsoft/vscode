/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Cache } from './cache';
import type { Annotation } from '../../autocomplete-parser/parseArguments';
import type { Suggestion } from '../../shared/internal';
import { getCWDForFilesAndFolders } from '../../shared/utils';

export type GeneratorContext = Fig.ShellContext & {
	annotations: Annotation[];
	tokenArray: string[];
	isDangerous?: boolean;
	searchTerm: string;
};

export type GeneratorState = {
	generator: Fig.Generator;
	context: GeneratorContext;
	loading: boolean;
	result: Suggestion[];
	request?: Promise<Fig.Suggestion[] | undefined>;
};

export const haveContextForGenerator = (context: GeneratorContext): boolean =>
	Boolean(context.currentWorkingDirectory);

export const generatorCache = new Cache();

export async function runCachedGenerator<T>(
	generator: Fig.Generator,
	context: GeneratorContext,
	initialRun: () => Promise<T>,
	cacheKey?: string /* This is generator.script or generator.script(...) */,
): Promise<T> {
	const cacheDefault = false; // getSetting<boolean>(SETTINGS.CACHE_ALL_GENERATORS) ?? false;
	let { cache } = generator;
	if (!cache && cacheDefault) {
		cache = { strategy: 'stale-while-revalidate', ttl: 1_000 };
	}
	if (!cache) {
		return initialRun();
	}
	const { tokenArray, currentWorkingDirectory, searchTerm } = context;

	const directory = generator.template
		? getCWDForFilesAndFolders(currentWorkingDirectory, searchTerm)
		: currentWorkingDirectory;

	// we cache generator results by script, if no script was provided we use the tokens instead
	const key = [
		cache.cacheByDirectory ? directory : undefined,
		cacheKey || tokenArray.join(' '),
	].toString();

	return generatorCache.entry(key, initialRun, cache);
}
