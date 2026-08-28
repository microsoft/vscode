/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import type { Command } from 'vscode';
import { Turn } from '../../src/extension/prompt/common/conversation';
import { ITestingServicesAccessor } from '../../src/platform/test/node/services';
import { ssuite, stest } from '../base/stest';
import { generateScenarioTestRunner } from './scenarioTest';

const NUM_SCENARIOS = 26;

/**
 * Configuration object for a search test.
 */
interface ISearchTestConfig {

	/**
	 * The question to ask the AI.
	 * ie: question: "find all links"
	 */
	question: string;
	/**
	 * Whether the search query is a regular expression.
	 */
	isRegex: boolean;
	/**
	 * Whether to search only in open editors.
	 */
	onlyOpenEditors?: boolean;
	/**
	 * An array of expected include/exclude globs to use to target search files. This will be used to look for files to search, which will be compared to the list from the actual glob's include/exclude.
	 * ie:
	 * ```
	 * exampleIncludeGlobs: ["*.md", "*.html"]
	 * exampleExcludeGlobs: ["*.ts"]
	 * ```
	 */
	exampleIncludeGlobs?: string[];
	exampleExcludeGlobs?: string[];
	/**
	 * A map of search queries to the expected text results. If multiple are specified (2D string array), the test can match any of the possibilities.
	 * Might not include all files that gets searched.
	 * The actual results will be tested such that they CONTAIN the expected result. Therefore, the expected result should be the minimum-length possible result from the query.
	 * ie:
	 * queryShouldFind: "foo.md" -> ["http://google.ca", "http://github.com"]
	 * where the file "foo.md" matches the text "http://google.ca" and "http://github.com"
	 *
	 * or
	 *
	 * queryShouldFind: "foo.md" -> [["http://google.ca", "http://github.com"],["http://google.ca"]]
	 * where the file "foo.md" matches the text "http://google.ca" and "http://github.com" OR only "http://google.ca"
	 */
	queryShouldFind: Map<string, string[] | string[][]>;
	/**
	 * A map of original file names to the file name of the file containing the expected replace result4
	 * ie:
	 * replaceResult: "foo.md" -> "foo.replaced.md"
	 */
	replaceResult?: Map<string, string>; // fileName original -> filename expected

	/**
	 * Whether or not the answer should fail to give a query. Will be false by default.
	 * Would be true for an answer that says something like "I don't know what you're talking about, please clarify".
	 */
	shouldFail?: boolean;
}


interface ISearchArg {
	filesToInclude?: string;
	filesToExclude?: string;
	query: string;
	replace?: string;
	isCaseSensitive?: boolean;
	isRegex?: boolean;
	matchWholeWord?: boolean;
	onlyOpenEditors?: boolean;
	preserveCase?: boolean;
}

interface ISimplifiedSearchArg {
	filesToInclude: string;
	filesToExclude: string;
	query: string;
	replace: string;
	isRegex: boolean;
	preserveCase: boolean;
	onlyOpenEditors: boolean;
}

const scenarioFolder = path.join(__dirname, '..', 'test/scenarios/test-scenario-search/');
const exampleFolder = path.join(scenarioFolder, 'example-files');
const replaceSamples = path.join(scenarioFolder, 'replace-samples');

(function () {
	ssuite({ title: 'search', location: 'panel' }, () => {
		// Dynamically create a test case per each entry
		for (let i = 0; i < NUM_SCENARIOS; i++) {
			const testCase = getTestInfoFromFile(`search${i}.testArgs.json`);
			const testName = testCase.question;
			stest({ description: testName }, generateScenarioTestRunner(
				[{ question: '@vscode /search ' + testCase.question, name: testName, scenarioFolderPath: scenarioFolder }],
				generateEvaluate(testCase)
			));
		}
	});
})();

function getTestInfoFromFile(fileName: string): ISearchTestConfig {
	const file = path.join(scenarioFolder, fileName);
	const fileContents = fs.readFileSync(file, 'utf8');
	const json = JSON.parse(fileContents);
	if (!json.queryShouldFind && !json.shouldFail) {
		throw Error('Missing queryShouldFind field');
	}

	json.queryShouldFind = new Map(json.queryShouldFind);

	if (json.replaceResult) {
		json.replaceResult = new Map(json.replaceResult);
	}

	return json;
}

function generateEvaluate(testInfo: ISearchTestConfig) {
	return async function evaluate(accessor: ITestingServicesAccessor, question: string, answer: string, _rawResponse: string, turn: Turn | undefined, _scenarioIndex: number, commands: Command[]): Promise<{ success: boolean; errorMessage?: string }> {
		try {
			let args: ISimplifiedSearchArg | undefined;
			try {
				args = createSimplifiedSearchArgs(await testArgs(commands));
			} catch (e) {
				if (testInfo.shouldFail) {
					return Promise.resolve({ success: true, errorMessage: '' });
				} else {
					return Promise.resolve({ success: false, errorMessage: 'Parsing the search query failed.' });
				}
			}

			if (testInfo.shouldFail) {
				return Promise.resolve({ success: false, errorMessage: 'Parsing the search query should have failed.' });
			}

			assert(testInfo.isRegex === undefined || args.isRegex === testInfo.isRegex);
			if (testInfo.onlyOpenEditors !== undefined) {
				assert(args.onlyOpenEditors === testInfo.onlyOpenEditors);
			}

			if (!testInfo.replaceResult || testInfo.replaceResult.size === 0) {
				assert(!args.replace);
			}

			const actualTargets = getTargetFiles(args.filesToInclude, args.filesToExclude);
			const expectedTargets = getTargetFiles(testInfo.exampleIncludeGlobs ?? ['*'], testInfo.exampleExcludeGlobs ?? []);

			assert.deepEqual(actualTargets, expectedTargets);

			if (!args?.query) {
				return Promise.resolve({ success: false, errorMessage: 'No query field on args' });
			}

			const query = args.query;
			const preserveCase = args.preserveCase;
			const replace = args.replace;

			testInfo.queryShouldFind.forEach((expected, fileName) => {
				const file = path.join(exampleFolder, fileName);
				const results = testOnlyQueryOnFiles(file, query, preserveCase);
				assert(resultMatchesQuery(results, expected));
			});

			testInfo.replaceResult?.forEach((fileNameExpected, fileName) => {
				const file = path.join(exampleFolder, fileName);
				const result = getStringFromReplace(file, query, replace, preserveCase);
				const expected = fs.readFileSync(path.join(replaceSamples, fileNameExpected), 'utf8');
				assert(result === expected);
			});
		} catch (e) {
			const msg = (<any>e).message ?? 'Error: ' + e;
			return Promise.resolve({ success: false, errorMessage: msg });
		}

		return Promise.resolve({ success: true, errorMessage: '' });
	};
}


function getTargetFiles(fileGlobs: string | string[], ignoreGlobs: string | string[]): string[] {
	if (!Array.isArray(fileGlobs)) {
		fileGlobs = (fileGlobs.length === 0) ? ['*'] : fileGlobs.split(',');
	}

	if (!Array.isArray(ignoreGlobs)) {
		ignoreGlobs = (ignoreGlobs.length === 0) ? [] : ignoreGlobs.split(',');
	}

	const included: string[] = [];
	fileGlobs.forEach((fileGlob) => {
		const matches = glob.sync(fileGlob, { cwd: exampleFolder, ignore: ignoreGlobs }).filter((file) =>
			(!included.includes(file))
		);
		included.push(...matches);
	});
	return included;

}

function createSimplifiedSearchArgs(args: ISearchArg): ISimplifiedSearchArg {
	return {
		filesToInclude: args.filesToInclude ?? '',
		filesToExclude: args.filesToExclude ?? '',
		query: args.query,
		replace: args.replace ?? '',
		isRegex: args.isRegex ?? false,
		preserveCase: args.preserveCase ?? false,
		onlyOpenEditors: args.onlyOpenEditors ?? false
	};
}

async function testArgs(commands: Command[]): Promise<ISearchArg> {
	for (const c of commands) {
		if (c.command === 'github.copilot.executeSearch') {
			assert(c.title === 'Search');
			return c.arguments?.[0];
		}
	}
	throw Error('No search command found');
}

function getFunctionFromQuery(query: string, isCaseSensitive: boolean): RegExp {
	const flags = isCaseSensitive ? 'gm' : 'gmi';
	return new RegExp(query, flags);
}

function testOnlyQueryOnFiles(fileName: string, query: string, isCaseSensitive: boolean): string[] {
	const file = fs.readFileSync(fileName, 'utf8');
	const re = getFunctionFromQuery(query, isCaseSensitive);
	const results = file.match(re)?.values();
	return results ? Array.from(results) : [];
}

function getStringFromReplace(fileName: string, query: string, replace: string, isCaseSensitive: boolean): string {
	const file = fs.readFileSync(fileName, 'utf8');
	const re = getFunctionFromQuery(query, isCaseSensitive);
	const str = file.replace(re, replace);
	return str;
}

function resultMatchesQuery(actual: string[], expected: string[] | string[][]): boolean {
	if (expected.length === 0) {
		return (actual.length === 0);
	}

	const possibilitiesOfExpected: string[][] = (Array.isArray(expected[0]) ? expected : [expected]) as string[][];

	const resultMatchesQuerySingle = (possibleExpected: string[]) => {
		if (actual.length !== possibleExpected.length) {
			return false;
		}
		for (let i = 0; i < actual.length; i++) {
			if (!actual[i].includes(possibleExpected[i])) {
				return false;
			}
		}
		return true;
	};

	for (const expected of possibilitiesOfExpected) {
		if (resultMatchesQuerySingle(expected)) {
			return true;
		}
	}
	return false;
}
