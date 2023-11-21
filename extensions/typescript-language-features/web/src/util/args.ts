/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as ts from 'typescript/lib/tsserverlibrary';

export function hasArgument(args: readonly string[], name: string): boolean {
	return args.indexOf(name) >= 0;
}

export function findArgument(args: readonly string[], name: string): string | undefined {
	const index = args.indexOf(name);
	return 0 <= index && index < args.length - 1
		? args[index + 1]
		: undefined;
}

export function findArgumentStringArray(args: readonly string[], name: string): readonly string[] {
	const arg = findArgument(args, name);
	return arg === undefined ? [] : arg.split(',').filter(name => name !== '');
}

export function parseServerMode(args: readonly string[]): ts.LanguageServiceMode | string | undefined {
	const mode = findArgument(args, '--serverMode');
	if (!mode) { return undefined; }

	switch (mode.toLowerCase()) {
		case 'semantic': return ts.LanguageServiceMode.Semantic;
		case 'partialsemantic': return ts.LanguageServiceMode.PartialSemantic;
		case 'syntactic': return ts.LanguageServiceMode.Syntactic;
		default: return mode;
	}
}
