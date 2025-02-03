/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICompletionResource } from '../types';
import { execHelper, getAliasesHelper } from './common';
import { type ExecOptionsWithStringEncoding } from 'node:child_process';

export async function getFishGlobals(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	return [
		...await getAliases(options),
		...await getBuiltins(options, existingCommands),
	];
}

async function getBuiltins(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<string[]> {
	const compgenOutput = await execHelper('functions -n', options);
	const filter = (cmd: string) => cmd && !existingCommands?.has(cmd);
	return compgenOutput.split(', ').filter(filter);
}

async function getAliases(options: ExecOptionsWithStringEncoding): Promise<ICompletionResource[]> {
	return getAliasesHelper('fish', ['-ic', 'alias'], /^alias (?<alias>[a-zA-Z0-9\.:-]+) (?<resolved>.+)$/, options);
}
