/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ISetupTestExtension {
	id: string;
	name: string;
}

interface ILanguageExtensionData {
	/** Languages where the extension used to test the language is well-known */
	forLanguage?: {
		extension: ISetupTestExtension;
		/**
		 * Frameworks where, if the user asks to setup tests in that framework,
		 * we recommend this extension.
		 */
		associatedFrameworks?: string[];
	};

	/**
	 * Frameworks where the extension used to test the framework is well-known.
	 * Should include popular extensions from src/platform/testing/node/testDepsResolver.ts
	 * in cases where the extension is mainstream enough that it's unambiguously
	 * the one to recommend.
	 */
	perFramework?: Map<string, ISetupTestExtension>;
}

const jsTsExtensionData: ILanguageExtensionData = {
	perFramework: new Map([
		['mocha', { name: 'Mocha Test Explorer', id: 'hbenl.vscode-mocha-test-adapter' }],
		['jest', { name: 'Jest', id: 'Orta.vscode-jest' }],
		['vitest', { name: 'Vitest', id: 'vitest.explorer' }],
		['playwright', { name: 'Playwright Test for VSCode', id: 'ms-playwright.playwright' }],
		['jasmine', { name: 'Jasmine Test Explorer', id: 'hbenl.vscode-jasmine-test-adapter' }],
	]),
};

/** Languages where the extension used to test the language is well-known */
export const testExtensionsForLanguage: Readonly<Map<string, ILanguageExtensionData>> = new Map([
	['python', {
		forLanguage: {
			extension: { id: 'ms-python.python', name: 'Python' },
			associatedFrameworks: ['pytest', 'unittest']
		}
	}],
	['rust', {
		forLanguage: { extension: { id: 'rust-lang.rust-analyzer', name: 'rust-analyzer' } }
	}],
	['java', {
		forLanguage: {
			extension: { id: 'vscjava.vscode-java-test', name: 'Test Runner for Java' }, associatedFrameworks: ['junit', 'testng']
		}
	}],
	['csharp', {
		forLanguage: {
			extension: { id: 'ms-dotnettools.csharp', name: 'C#' }
		}
	}],
	['go', {
		forLanguage: {
			extension: { id: 'golang.Go', name: 'Go' }
		},
	}],

	['typescript', jsTsExtensionData],
	['javascript', jsTsExtensionData],
	['javascriptreact', jsTsExtensionData],
	['typescriptreact', jsTsExtensionData],
]);
