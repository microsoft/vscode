/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import Parser from 'web-tree-sitter';
import { CopilotPromptLoadFailure } from './error';
import { locateFile, readFile } from './fileLoader';

export enum WASMLanguage {
	Python = 'python',
	JavaScript = 'javascript',
	TypeScript = 'typescript',
	TSX = 'tsx',
	Go = 'go',
	Ruby = 'ruby',
	CSharp = 'c-sharp',
	Java = 'java',
	Php = 'php',
	Cpp = 'cpp',
}

const languageIdToWasmLanguageMapping: { [language: string]: WASMLanguage } = {
	python: WASMLanguage.Python,
	javascript: WASMLanguage.JavaScript,
	javascriptreact: WASMLanguage.JavaScript,
	jsx: WASMLanguage.JavaScript,
	typescript: WASMLanguage.TypeScript,
	typescriptreact: WASMLanguage.TSX,
	go: WASMLanguage.Go,
	ruby: WASMLanguage.Ruby,
	csharp: WASMLanguage.CSharp,
	java: WASMLanguage.Java,
	php: WASMLanguage.Php,
	c: WASMLanguage.Cpp,
	cpp: WASMLanguage.Cpp,
};

export function isSupportedLanguageId(languageId: string): boolean {
	// Temporarily disable C# support until the tree-sitter parser for it is
	// fully spec-ed.
	return (
		languageId in languageIdToWasmLanguageMapping &&
		languageId !== 'csharp' &&
		languageId !== 'java' &&
		languageId !== 'php' &&
		languageId !== 'c' &&
		languageId !== 'cpp'
	);
}

export function languageIdToWasmLanguage(languageId: string): WASMLanguage {
	if (!(languageId in languageIdToWasmLanguageMapping)) {
		throw new Error(`Unrecognized language: ${languageId}`);
	}
	return languageIdToWasmLanguageMapping[languageId];
}

const languageLoadPromises = new Map<WASMLanguage, Promise<Parser.Language>>();

async function loadWasmLanguage(language: WASMLanguage): Promise<Parser.Language> {
	// construct a path that works both for the TypeScript source, which lives under `/src`, and for
	// the transpiled JavaScript, which lives under `/dist`
	let wasmBytes;
	try {
		wasmBytes = await readFile(`tree-sitter-${language}.wasm`);
	} catch (e: unknown) {
		if (e instanceof Error && 'code' in e && typeof e.code === 'string' && e.name === 'Error') {
			throw new CopilotPromptLoadFailure(`Could not load tree-sitter-${language}.wasm`, e);
		}
		throw e;
	}
	return Parser.Language.load(wasmBytes);
}

export function getLanguage(language: string): Promise<Parser.Language> {
	const wasmLanguage = languageIdToWasmLanguage(language);

	if (!languageLoadPromises.has(wasmLanguage)) {
		// IMPORTANT: This function does not have an async signature to prevent interleaved execution
		// that can cause duplicate loading of the same language during yields/awaits prior to them
		// being added to the cache.
		const loadedLang = loadWasmLanguage(wasmLanguage);
		languageLoadPromises.set(wasmLanguage, loadedLang);
	}

	return languageLoadPromises.get(wasmLanguage)!;
}

class WrappedError extends Error {
	constructor(message: string, cause: unknown) {
		super(message, { cause });
	}
}

// This method returns a tree that the user needs to call `.delete()` before going out of scope.
export async function parseTreeSitter(language: string, source: string): Promise<Parser.Tree> {
	return (await parseTreeSitterIncludingVersion(language, source))[0];
}

// This method returns a tree that the user needs to call `.delete()` before going out of scope.
export async function parseTreeSitterIncludingVersion(language: string, source: string): Promise<[Parser.Tree, number]> {
	// `Parser.init` needs to be called before `new Parser()` below
	await Parser.init({
		locateFile: (filename: string) => locateFile(filename),
	});
	let parser;
	try {
		parser = new Parser();
	} catch (e: unknown) {
		if (
			e &&
			typeof e === 'object' &&
			'message' in e &&
			typeof e.message === 'string' &&
			e.message.includes('table index is out of bounds')
		) {
			throw new WrappedError(`Could not init Parse for language <${language}>`, e);
		}
		throw e;
	}
	const treeSitterLanguage = await getLanguage(language);
	parser.setLanguage(treeSitterLanguage);
	const parsedTree = parser.parse(source);

	// Need to delete parser objects directly
	parser.delete();
	return [parsedTree, treeSitterLanguage.version];
}

export function getBlockCloseToken(language: string): string | null {
	const wasmLanguage = languageIdToWasmLanguage(language);
	switch (wasmLanguage) {
		case WASMLanguage.Python:
			return null;
		case WASMLanguage.JavaScript:
		case WASMLanguage.TypeScript:
		case WASMLanguage.TSX:
		case WASMLanguage.Go:
		case WASMLanguage.CSharp:
		case WASMLanguage.Java:
		case WASMLanguage.Php:
		case WASMLanguage.Cpp:
			return '}';
		case WASMLanguage.Ruby:
			return 'end';
	}
}

function innerQuery(queries: [string, Parser.Query?][], root: Parser.SyntaxNode): Parser.QueryMatch[] {
	const matches = [];
	for (const query of queries) {
		// parse and cache query if this is the first time we've used it
		if (!query[1]) {
			const lang = root.tree.getLanguage();
			// cache parsed query object
			query[1] = lang.query(query[0]);
		}
		matches.push(...query[1].matches(root));
	}
	return matches;
}

const docstringQuery: [string, Parser.Query?] = [
	`[
	(class_definition (block (expression_statement (string))))
	(function_definition (block (expression_statement (string))))
]`,
];

export function queryPythonIsDocstring(blockNode: Parser.SyntaxNode): boolean {
	return innerQuery([docstringQuery], blockNode).length === 1;
}
