/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LanguageToolsProvider } from '../../src/extension/onboardDebug/node/languageToolsProvider';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { ISimulationTestRuntime, ssuite, stest } from '../base/stest';

// Use to print the model's suggested tool list for all languages.
// Set to true and run with: npm run simulate -- --grep "print all languages" -n=1
const PRINT_LANGUAGE_TOOLS = false;

ssuite({ title: 'Debug tools list', location: 'context' }, () => {

	async function score(testingServiceCollection: TestingServiceCollection, languages: string[], expected: string[]) {
		const accessor = testingServiceCollection.createTestingAccessor();
		const tools = accessor.get(IInstantiationService).createInstance(LanguageToolsProvider);
		const result = await tools.getToolsForLanguages(languages, CancellationToken.None);
		if (!result.ok) {
			throw new Error('Expected tools to be found');
		}

		let found = 0;
		for (const tool of expected) {
			if (result.commands.includes(tool)) {
				found++;
			}
		}

		accessor.get(ISimulationTestRuntime).setExplicitScore(found / expected.length);
	}

	stest({ description: 'javascript' }, async (testingServiceCollection) => {
		await score(testingServiceCollection, ['javascript'], ['npm', 'node', 'npx', 'mocha']);
	});

	stest({ description: 'c' }, async (testingServiceCollection) => {
		await score(testingServiceCollection, ['c'], ['gcc', 'clang', 'make', 'cmake', 'gdb']);
	});

	stest({ description: 'python' }, async (testingServiceCollection) => {
		await score(testingServiceCollection, ['python'], ['python', 'pip', 'pytest', 'tox']);
	});

	stest({ description: 'typescript' }, async (testingServiceCollection) => {
		await score(testingServiceCollection, ['javascript'], ['npm', 'node', 'npx', 'mocha']);
	});

	stest({ description: 'ruby' }, async (testingServiceCollection) => {
		await score(testingServiceCollection, ['ruby'], ['ruby', 'cucumber', 'rake', 'irb']);
	});

	stest({ description: 'csharp' }, async (testingServiceCollection) => {
		await score(testingServiceCollection, ['csharp'], ['dotnet', 'msbuild', 'xunit', 'vstest']);
	});

	stest({ description: 'elixir' }, async (testingServiceCollection) => {
		await score(testingServiceCollection, ['elixir'], ['mix', 'iex']);
	});

	stest({ description: 'lua' }, async (testingServiceCollection) => {
		await score(testingServiceCollection, ['lua'], ['lua', 'busted']);
	});

	stest({ description: 'go' }, async (testingServiceCollection) => {
		// it's a short list, because everything in Go is invoked with `go`.
		// Amusingly the model sometimes just lists "go" 10 times.
		await score(testingServiceCollection, ['go'], ['go']);
	});

	if (PRINT_LANGUAGE_TOOLS) {
		stest({ description: 'print all languages' }, async (testingServiceCollection) => {
			const accessor = testingServiceCollection.createTestingAccessor();
			const tools = accessor.get(IInstantiationService).createInstance(LanguageToolsProvider);
			const allTools = new Set<string>();
			const allLanguageIds = new Set([
				...baseLanguageIds,
				...additionalLanguageIds,
				...omittedLanguages,
			]);

			for (const language of allLanguageIds) {
				if (omittedLanguages.includes(language)) {
					continue;
				}

				console.log('Getting tools for', language);
				const result = await tools.getToolsForLanguages([language], CancellationToken.None);
				if (!result.ok) {
					throw new Error('Expected tools to be found');
				}
				for (const tool of result.commands) {
					allTools.add(tool);
				}
			}

			console.log(`const KNOWN_DEBUGGABLE_LANGUAGES = ${JSON.stringify([...allLanguageIds].sort())};`);
			console.log(`const KNOWN_DEBUGGABLE_COMMANDS = ${JSON.stringify([...allTools].sort())};`);
		});
	}
});

// Some additional languages popular in the 2024 SO developer survey
const additionalLanguageIds = [
	'dart',
	'zig',
	'kotlin',
	'matlab',
];

// Languages we don't want to bother getting tools for. These are text
// languages, markup languages that aren't specific to any one set of tools,
// or duplicates (e.g. vue and vue-html).
const omittedLanguages = [
	'bat',
	'bibtex',
	'code-refactoring',
	'coffeescript',
	'css',
	'diff',
	'dockercompose',
	'dockerfile',
	'git-commit',
	'git-rebase',
	'github-issues',
	'graphql',
	'haml',
	'handlebars',
	'html',
	'ini',
	'jade',
	'json',
	'jsonc',
	'less',
	'log',
	'pip-requirements',
	'plaintext',
	'pug',
	'razor',
	'scss',
	'shellscript',
	'slim',
	'snippets',
	'stylus',
	'tex',
	'text',
	'toml',
	'vue-html',
	'xml',
	'xsl',
	'yaml',
];

// Base language list seeded from https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
const baseLanguageIds = [
	'abap',
	'bat',
	'bibtex',
	'clojure',
	'coffeescript',
	'c',
	'cpp',
	'csharp',
	'dockercompose',
	'css',
	'cuda-cpp',
	'd',
	'pascal',
	'diff',
	'dockerfile',
	'erlang',
	'fsharp',
	'git-commit',
	'git-rebase',
	'go',
	'groovy',
	'handlebars',
	'haml',
	'haskell',
	'html',
	'ini',
	'java',
	'javascript',
	'javascriptreact',
	'json',
	'jsonc',
	'julia',
	'latex',
	'less',
	'lua',
	'makefile',
	'markdown',
	'objective-c',
	'objective-cpp',
	'ocaml',
	'pascal',
	'perl',
	'perl6',
	'php',
	'plaintext',
	'powershell',
	'jade',
	'pug',
	'python',
	'r',
	'razor',
	'ruby',
	'rust',
	'scss',
	'sass',
	'shaderlab',
	'shellscript',
	'slim',
	'sql',
	'stylus',
	'svelte',
	'swift',
	'typescript',
	'typescriptreact',
	'tex',
	'vb',
	'vue',
	'vue-html',
	'xml',
	'xsl',
	'yaml'
];
