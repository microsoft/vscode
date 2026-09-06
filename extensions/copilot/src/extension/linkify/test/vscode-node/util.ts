/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { TreeSitterExpressionInfo } from '../../../../platform/parser/node/nodes';
import { IParserService, TreeSitterAST } from '../../../../platform/parser/node/parserService';
import { WASMLanguage } from '../../../../platform/parser/node/treeSitterLanguages';
import { URI } from '../../../../util/vs/base/common/uri';

export class TestParserService implements Partial<IParserService> {
	public parseCount = 0;
	public genericSymbolQueryCount = 0;
	public readonly genericSymbolRanges: { readonly startIndex: number; readonly endIndex: number }[] = [];

	constructor(
		private readonly symbols: readonly TreeSitterExpressionInfo[] = [],
		private readonly classDeclarations: readonly TreeSitterExpressionInfo[] = [],
		private readonly functionDefinitions: readonly TreeSitterExpressionInfo[] = [],
		private readonly typeDeclarations: readonly TreeSitterExpressionInfo[] = [],
	) { }

	getTreeSitterASTForWASMLanguage(_language: WASMLanguage, _source: string): TreeSitterAST {
		this.parseCount++;
		const symbols = this.symbols;
		const classDeclarations = this.classDeclarations;
		const functionDefinitions = this.functionDefinitions;
		const typeDeclarations = this.typeDeclarations;
		return {
			getClassDeclarations: async () => classDeclarations,
			getFunctionDefinitions: async () => functionDefinitions,
			getTypeDeclarations: async () => typeDeclarations,
			getSymbols: async (range: { readonly startIndex: number; readonly endIndex: number }) => {
				this.genericSymbolQueryCount++;
				this.genericSymbolRanges.push(range);
				return symbols;
			},
		} as unknown as TreeSitterAST;
	}
}

const testDirs: string[] = [];

teardown(() => {
	const dirs = testDirs.splice(0);
	return Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true })));
});

export async function createTestFile(relativePath: string, contents: string): Promise<{ readonly workspace: URI; readonly uri: URI }> {
	const workspace = await mkdtemp(join(tmpdir(), 'copilot-linkify-test-'));
	const file = join(workspace, relativePath);
	testDirs.push(workspace);
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, contents);
	return {
		workspace: URI.file(workspace),
		uri: URI.file(file),
	};
}

export function asParserService(parserService: TestParserService): IParserService {
	return parserService as unknown as IParserService;
}

export function symbol(contents: string, identifier: string): TreeSitterExpressionInfo {
	const startIndex = contents.indexOf(identifier);
	assert.notStrictEqual(startIndex, -1, `Test symbol "${identifier}" was not found in contents.`);
	return {
		identifier,
		text: identifier,
		startIndex,
		endIndex: startIndex + identifier.length,
	};
}

export function declaration(contents: string, identifier: string, text: string): TreeSitterExpressionInfo {
	const startIndex = contents.indexOf(text);
	assert.notStrictEqual(startIndex, -1, `Test declaration text "${text}" was not found in contents.`);
	return {
		identifier,
		text,
		startIndex,
		endIndex: startIndex + text.length,
	};
}
