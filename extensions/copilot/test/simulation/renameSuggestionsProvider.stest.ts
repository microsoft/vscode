/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { outdent } from 'outdent';
import type * as vscode from 'vscode';
import { guessNamingConvention, NamingConvention } from '../../src/extension/renameSuggestions/common/namingConvention';
import { RenameSuggestionsProvider } from '../../src/extension/renameSuggestions/node/renameSuggestionsProvider';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { IRelativeFile } from '../../src/platform/test/node/simulationWorkspace';
import { deannotateSrc } from '../../src/util/common/test/annotatedSrc';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { NewSymbolNameTriggerKind, Range } from '../../src/vscodeTypes';
import { ISimulationTestRuntime, ssuite, stest } from '../base/stest';
import { setupSimulationWorkspace, teardownSimulationWorkspace } from './inlineChatSimulator';
import { INLINE_INITIAL_DOC_TAG } from './shared/sharedTypes';

type OffsetRange = {
	startIndex: number;
	endIndex: number;
};

function offsetRangeToPositionRange(offsetRange: OffsetRange, document: vscode.TextDocument): vscode.Range {
	const startPos = document.positionAt(offsetRange.startIndex);
	const endPos = document.positionAt(offsetRange.endIndex);
	const range = new Range(startPos, endPos);
	return range;
}

ssuite({ title: 'Rename suggestions', location: 'external' }, () => {

	class AlwaysEnabledNewSymbolNamesProvider extends RenameSuggestionsProvider {
		override isEnabled() {
			return true;
		}
	}

	/**
	 * Asserts that each newSymbolName includes at least one of the searchStrings.
	 *
	 * @remark lower-cases symbol names for string search but not search-strings
	 */
	function assertIncludesLowercased(newSymbolNames: vscode.NewSymbolName[], searchStrings: string | string[]) {
		searchStrings = Array.isArray(searchStrings) ? searchStrings : [searchStrings];
		searchStrings = searchStrings.map(s => s.toLowerCase());
		for (const symbol of newSymbolNames) {
			const newSymbolNameLowercase = symbol.newSymbolName.toLowerCase();
			assert.ok(
				searchStrings.some(searchString => newSymbolNameLowercase.includes(searchString)),
				`expected to include ${searchStrings.map(s => `'${s}'`).join(' or ')} but received '${newSymbolNameLowercase}'`
			);
		}
	}

	function assertLength(newSymbolNames: vscode.NewSymbolName[]) {
		assert.ok(newSymbolNames.length > 1,
			`expected at least ${1} newSymbolNames but received ${newSymbolNames.length}\n${JSON.stringify(newSymbolNames.map(v => v.newSymbolName), null, '\t')}`);
	}

	function countMatches(newSymbolNames: vscode.NewSymbolName[], searchStrings: string) {
		const searchStringsLowercased = searchStrings.toLowerCase();
		return newSymbolNames.filter(symbol => symbol.newSymbolName.toLowerCase().includes(searchStringsLowercased)).length;
	}

	type IRenameScenarioFile = (IRelativeFile & {
		isCurrent?: boolean;
	});

	async function provideNewSymbolNames(testingServiceCollection: TestingServiceCollection, files: IRenameScenarioFile[]) {

		// find current file from files, deannoate it and put it at the end

		const currentFileIx = files.length === 1 ? 0 : files.findIndex(f => f.isCurrent);
		if (currentFileIx < 0) { throw new Error(`No current file found from files:\n ${JSON.stringify(files, null, '\t')}`); }
		let currentFile = files[currentFileIx];
		files.splice(currentFileIx, 1);
		const { deannotatedSrc, annotatedRange } = deannotateSrc(currentFile.fileContents);
		currentFile = {
			...currentFile,
			fileContents: deannotatedSrc,
		};
		files.push(currentFile);

		// set up workspace
		const workspace = setupSimulationWorkspace(testingServiceCollection, { files });
		const accessor = testingServiceCollection.createTestingAccessor();
		try {
			const document = workspace.getDocument(currentFile.fileName).document;
			const renameRange = offsetRangeToPositionRange(annotatedRange, document);

			// write initial file contents to disk to be able to view it from swb

			const testRuntime = accessor.get(ISimulationTestRuntime);
			const workspacePath = workspace.getFilePath(document.uri);
			await testRuntime.writeFile(workspacePath + '.txt', document.getText(), INLINE_INITIAL_DOC_TAG); // using .txt instead of real file extension to avoid breaking automation scripts

			// get rename suggestions

			const provider = accessor.get(IInstantiationService).createInstance(AlwaysEnabledNewSymbolNamesProvider);

			const symbols = await provider.provideNewSymbolNames(document, renameRange, NewSymbolNameTriggerKind.Invoke, CancellationToken.None);

			return symbols;

		} finally {
			await teardownSimulationWorkspace(accessor, workspace);
		}

	}

	stest('rename a function at its definition', async (testingServiceCollection) => {
		const fileContents = outdent`
			export function <<fibonacci>>(n: number): number {
				if (n <= 1) {
					return 1;
				}
				return fibonacci(n - 1) + fibonacci(n - 2);
			}
		`;

		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'fibonacci.ts',
			languageId: 'typescript',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols, `Expected symbols to be non-null`);
		assertLength(symbols);
		assert.ok(countMatches(symbols, 'fib') >= Math.floor(symbols.length * 0.8), 'Expected 80% of symbols to include fib: ' + JSON.stringify(symbols.map(s => s.newSymbolName)));
	});

	stest('rename follows naming convention _ - rename a function (with underscore) at its definition', async (testingServiceCollection) => {
		const fileContents = outdent`
			export function <<_fib>>(n: number): number {
				if (n <= 1) {
					return 1;
				}
				return _fib(n - 1) + _fib(n - 2);
			}
		`;

		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'fibonacci.ts',
			languageId: 'typescript',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols, `Expected symbols to be non-null`);
		assertLength(symbols);
		assert.ok(symbols.some(s => s.newSymbolName.startsWith('_')), 'Expected to include symbols with underscore');
		assertIncludesLowercased(symbols, ['fib', 'sequence']);
	});

	stest('rename a variable reference within a function', async (testingServiceCollection) => {
		const fileContents = (outdent`
			function fromQueryMatches(matches: Parser.QueryMatch[]): InSourceTreeSitterQuery[] {
				const captures = matches.flatMap(({ captures }) => captures)
					.sort((a, b) => a.node.startIndex - b.node.startIndex || b.node.endIndex - a.node.endIndex);

				const qs: InSourceTreeSitterQuery[] = [];
				for (let i = 0; i < captures.length;) {
					const capture = captures[i];
					if (capture.name === 'call_expression' && captures[i + 2].name === 'target_language' && captures[i + 3].name === 'query_src_with_quotes') {
						<<qs>>.push(new InSourceTreeSitterQuery(captures[i + 2].node, captures[i + 3].node));
						i += 4;
					} else {
						i++;
					}
				}

				return qs;
			}
		`);

		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'queryDiagnosticsProvider.ts',
			languageId: 'typescript',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols, `Expected symbols to be non-null`);
		assertLength(symbols);
		assertIncludesLowercased(symbols, ['quer']);
	});

	stest('rename a SCREAMING_SNAKE_CASE enum member', async (testingServiceCollection) => {
		const fileContents = (outdent`
			enum LoadStatus {
				NOT_LOADED,
				LOADING_FROM_CACHE,
				<<LOADING_FROM_SRVER>>,
				LOADED,
			}
		`);

		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'queryDiagnosticsProvider.ts',
			languageId: 'typescript',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols, `Expected symbols to be non-null`);
		assertLength(symbols);
		assert.ok(symbols.every(symbol => guessNamingConvention(symbol.newSymbolName) === NamingConvention.ScreamingSnakeCase), 'Expected all symbols to be SCREAMING_SNAKE_CASE');
	});

	stest('respect context: infer name based on existing code - enum member', async (testingServiceCollection) => {
		const fileContents = (outdent`
			enum Direction {
				UP,
				DOWN,
				RIGHT,
				<<TODO>>,
			}
		`);

		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'direction.ts',
			languageId: 'typescript',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols, `Expected symbols to be non-null`);
		assertLength(symbols);
		assert.ok(symbols.every(symbol => [NamingConvention.Uppercase, NamingConvention.ScreamingSnakeCase].includes(guessNamingConvention(symbol.newSymbolName))), 'Expected all symbols to be SCREAMING_SNAKE_CASE or UPPERCASE');
	});

	stest('rename a function call - definition in same file', async (testingServiceCollection) => {
		const fileContents = (outdent`
			export function f(n: number): number {
				if (n <= 1) {
					return 1;
				}
				return f(n - 1) + f(n - 2);
			}

			const result = <<f>>(10);
		`);
		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'script.ts',
			languageId: 'typescript',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols && symbols.length > 1, 'Expected to provide > 1 symbols');
		assertIncludesLowercased(symbols, ['fib', 'sequence']);
	});

	stest('rename a function call - definition in different file', async (testingServiceCollection) => {
		const currentFile: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'script.ts',
			languageId: 'typescript',
			fileContents: outdent`
				import { f } from './impl';

				const result = <<f>>(10);
			`,
			isCurrent: true,
		};

		const fileWithFnDef: IRelativeFile = {
			kind: 'relativeFile',
			fileName: 'impl.ts',
			languageId: 'typescript',
			fileContents: outdent`
				export function f(n: number): number {
					if (n <= 1) {
						return 1;
					}
					return f(n - 1) + f(n - 2);
				}
			`,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [currentFile, fileWithFnDef]);

		assert.ok(symbols && symbols.length > 1, 'Expected to provide > 1 symbols');
		assertIncludesLowercased(symbols, ['fib', 'sequence']);
	});

	stest('rename type definition', async (testingServiceCollection) => {
		const fileContents = (outdent`
			type <<t>> = {
				firstName: string;
				lastName: string;
			}
		`);
		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'script.ts',
			languageId: 'typescript',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols && symbols.length > 1, 'Expected to provide > 1 symbols');
		assert.ok(symbols.some(s => s.newSymbolName.toLowerCase().includes('person')), 'Inludes person');
	});

	stest('rename type definition when it is used in the same file', async (testingServiceCollection) => {
		const fileContents = (outdent`
			type <<t>> = {
				firstName: string;
				lastName: string;
			}

			function greet(p: t): string {
				return 'Hello ' + p.firstName + ' ' + p.lastName;
			}
		`);
		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'script.ts',
			languageId: 'typescript',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols && symbols.length > 1, 'Expected to provide > 1 symbols');
		assert.ok(symbols.some(s => s.newSymbolName.toLowerCase().includes('person')), 'Inludes person');
	});

	stest('rename type reference - same file', async (testingServiceCollection) => {
		const fileContents = (outdent`
			type t = {
				firstName: string;
				lastName: string;
			}

			function greet(p: <<t>>): string {
				return 'Hello ' + p.firstName + ' ' + p.lastName;
			}
		`);
		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'script.ts',
			languageId: 'typescript',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols && symbols.length > 1, 'Expected to provide > 1 symbols');
		assert.ok(symbols.some(s => s.newSymbolName.toLowerCase().includes('person')), 'Includes person');
	});

	stest('rename type reference - same file with 2 possible defs', async (testingServiceCollection) => {
		const fileContents = (outdent`
			type t = {
				firstName: string;
				lastName: string;
			}

			const t = {
				bar: 1
			}

			function greet(p: <<t>>): string {
				return 'Hello ' + p.firstName + ' ' + p.lastName;
			}
		`);
		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'script.ts',
			languageId: 'typescript',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols && symbols.length > 1, 'Expected to provide > 1 symbols');
		assert.ok(symbols.some(s => s.newSymbolName.toLowerCase().includes('person')), 'Includes person');
	});

	stest('rename class - same file', async (testingServiceCollection) => {
		const fileContents = outdent`
			class <<P>> {
				firstName: string;
				lastName: string;
			}
		`;
		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'script.ts',
			languageId: 'typescript',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols && symbols.length > 1, 'Expected to provide > 1 symbols');
		assert.ok(symbols.some(s => s.newSymbolName.toLowerCase().includes('person')), 'Inludes person');
	});

	stest('rename class reference - same file', async (testingServiceCollection) => {
		const fileContents = outdent`
			class P {
				firstName: string;
				lastName: string;
			}

			function greet(p: <<P>>): string {
				return 'Hello ' + p.firstName + ' ' + p.lastName;
			}
		`;
		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'script.ts',
			languageId: 'typescript',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols && symbols.length > 1, 'Expected to provide > 1 symbols');
		assert.ok(symbols.some(s => s.newSymbolName.toLowerCase().includes('person')), 'Inludes person');
	});

	stest('rename method with field-awareness', async (testingServiceCollection) => {
		const fileContents = outdent`
			class Processor {
				private stdoutBuffer: string = '';

				<<clearBuffer>>() {
					// TODO: implement
				}
			}
		`;
		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'script.ts',
			languageId: 'typescript',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols && symbols.length > 1, 'Expected to provide > 1 symbols');
		assert.ok(symbols.some(s => s.newSymbolName.toLowerCase().includes('stdout')), 'Knows about `stdoutBuffer`');
	});

	stest('non-tree-sitter language', async (testingServiceCollection) => {
		const fileContents = outdent`
			let rec <<f>> n = if n <= 1 then 1 else f (n - 1) + f (n - 2)
		`;
		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'impl.ml',
			languageId: 'ocaml',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols && symbols.length > 1, 'Expected to provide > 1 symbols');
		assert.ok(symbols.some(s => s.newSymbolName.toLowerCase().includes('fib')), 'Includes fib');
	});

	stest('rename class name - CSS', async (testingServiceCollection) => {
		const fileContents = outdent`
			.box {
				background-color: #fff;
			}

			<<.button>> {
				color: #fff;
				background-color: #000;
			}
		`;
		const file: IRenameScenarioFile = {
			kind: 'relativeFile',
			fileName: 'style.css',
			languageId: 'css',
			fileContents,
			isCurrent: true,
		};

		const symbols = await provideNewSymbolNames(testingServiceCollection, [file]);

		assert.ok(symbols && symbols.length > 1, 'Expected to provide > 1 symbols');
		assert.ok(symbols.every(s => s.newSymbolName.match(/^\.([a-zA-Z]+)/)), 'All symbols are class names');
	});

});
