/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICompletionResource } from '../types';
import { getAliasesHelper, getZshBashBuiltins } from './common';
import { type ExecOptionsWithStringEncoding } from 'node:child_process';

export async function getZshGlobals(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	return [
		...await getAliases(options),
		...await getZshBashBuiltins(options, 'printf "%s\\n" ${(k)builtins}', existingCommands),
	];
}

async function getAliases(options: ExecOptionsWithStringEncoding): Promise<ICompletionResource[]> {
	return getAliasesHelper('zsh', ['-ic', 'alias'], /^(?<alias>[a-zA-Z0-9\._:-]+)=(?<quote>['"]?)(?<resolved>.+?)\k<quote>$/, options);
}
