/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Languages we can parse using tree-sitter. Each enum member corresponds to a tree-sitter parser.
 */
export enum WASMLanguage {
	Python = 'python',
	JavaScript = 'javascript', // Also includes jsx support
	TypeScript = 'typescript',
	TypeScriptTsx = 'tsx',
	Go = 'go',
	Ruby = 'ruby',
	Csharp = 'csharp',
	Cpp = 'cpp',
	Java = 'java',
	Rust = 'rust',
}

export class TreeSitterUnknownLanguageError extends Error {
	constructor(language: string) {
		super(`Unrecognized language: ${language}`);
	}
}

const languageIdToWasmLanguageMapping: { [language: string]: WASMLanguage } = {
	python: WASMLanguage.Python,
	javascript: WASMLanguage.JavaScript,
	javascriptreact: WASMLanguage.JavaScript,
	jsx: WASMLanguage.JavaScript,
	typescript: WASMLanguage.TypeScript,
	typescriptreact: WASMLanguage.TypeScriptTsx,
	tsx: WASMLanguage.TypeScriptTsx,
	go: WASMLanguage.Go,
	ruby: WASMLanguage.Ruby,
	csharp: WASMLanguage.Csharp,
	cpp: WASMLanguage.Cpp,
	java: WASMLanguage.Java,
	rust: WASMLanguage.Rust,
};

/**
 * @returns a {@link WASMLanguage} if can convert the language ID (from VS Code); otherwise, returns `undefined`.
 */
export function getWasmLanguage(languageId: string): WASMLanguage | undefined {
	if (languageId in languageIdToWasmLanguageMapping) {
		return languageIdToWasmLanguageMapping[languageId];
	}
}
