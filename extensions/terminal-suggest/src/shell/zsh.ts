/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICompletionResource } from '../types';
import { execHelper, getAliasesHelper } from './common';
import { type ExecOptionsWithStringEncoding } from 'node:child_process';

export async function getZshGlobals(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	return [
		...await getAliases(options),
		...await getBuiltins(options, existingCommands),
	];
}

async function getBuiltins(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<string[]> {
	const compgenOutput = await execHelper('printf "%s\\n" ${(k)builtins}', options);
	const filter = (cmd: string) => cmd && !existingCommands?.has(cmd);
	return compgenOutput.split('\n').filter(filter);
}

async function getAliases(options: ExecOptionsWithStringEncoding): Promise<ICompletionResource[]> {
	return getAliasesHelper('zsh', ['-ic', 'alias'], /^(?<alias>[a-zA-Z0-9\.:-]+)=(?:'(?<resolved>.+)'|(?<resolved>.+))$/, options);
}
