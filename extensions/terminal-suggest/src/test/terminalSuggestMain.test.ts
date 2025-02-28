/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import 'mocha';
import { basename } from 'path';
import { asArray, getCompletionItemsFromSpecs } from '../terminalSuggestMain';
import { getTokenType } from '../tokens';
import { cdTestSuiteSpec as cdTestSuite } from './completions/cd.test';
import { codeSpecOptions, codeTestSuite } from './completions/code.test';
import { testPaths, type ISuiteSpec } from './helpers';
import { codeInsidersTestSuite } from './completions/code-insiders.test';
import { lsTestSuiteSpec } from './completions/upstream/ls.test';
import { echoTestSuiteSpec } from './completions/upstream/echo.test';
import { mkdirTestSuiteSpec } from './completions/upstream/mkdir.test';
import { rmTestSuiteSpec } from './completions/upstream/rm.test';
import { rmdirTestSuiteSpec } from './completions/upstream/rmdir.test';
import { touchTestSuiteSpec } from './completions/upstream/touch.test';
import { gitTestSuiteSpec } from './completions/upstream/git.test';
import { osIsWindows } from '../helpers/os';
import codeCompletionSpec from '../completions/code';
import { figGenericTestSuites } from './fig.test';
import { IFigExecuteExternals } from '../fig/execute';

const testSpecs2: ISuiteSpec[] = [
	{
		name: 'Fallback to default completions',
		completionSpecs: [],
		availableCommands: [],
		testSpecs: [
			{ input: '|', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
			{ input: '|.', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
			{ input: '|./', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
			{ input: 'fakecommand |', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		]
	},

	...figGenericTestSuites,

	// completions/
	cdTestSuite,
	codeTestSuite,
	codeInsidersTestSuite,

	// completions/upstream/
	echoTestSuiteSpec,
	lsTestSuiteSpec,
	mkdirTestSuiteSpec,
	rmTestSuiteSpec,
	rmdirTestSuiteSpec,
	touchTestSuiteSpec,
	gitTestSuiteSpec,
];

if (osIsWindows()) {
	testSpecs2.push({
		name: 'Handle options extensions on Windows',
		completionSpecs: [codeCompletionSpec],
		availableCommands: [
			'code.bat',
			'code.cmd',
			'code.exe',
			'code.anything',
		],
		testSpecs: [
			{ input: 'code |', expectedCompletions: codeSpecOptions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
			{ input: 'code.bat |', expectedCompletions: codeSpecOptions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
			{ input: 'code.cmd |', expectedCompletions: codeSpecOptions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
			{ input: 'code.exe |', expectedCompletions: codeSpecOptions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
			{ input: 'code.anything |', expectedCompletions: codeSpecOptions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		]
	});
}

suite('Terminal Suggest', () => {
	for (const suiteSpec of testSpecs2) {
		suite(suiteSpec.name, () => {
			const completionSpecs = asArray(suiteSpec.completionSpecs);
			const availableCommands = asArray(suiteSpec.availableCommands);
			for (const testSpec of suiteSpec.testSpecs) {
				let expectedString = testSpec.expectedCompletions ? `[${testSpec.expectedCompletions.map(e => `'${e}'`).join(', ')}]` : '[]';
				if (testSpec.expectedResourceRequests) {
					expectedString += ` + ${testSpec.expectedResourceRequests.type}`;
					if (testSpec.expectedResourceRequests.cwd.fsPath !== testPaths.cwd.fsPath) {
						expectedString += ` @ ${basename(testSpec.expectedResourceRequests.cwd.fsPath)}/`;
					}
				}
				test(`'${testSpec.input}' -> ${expectedString}`, async () => {
					const commandLine = testSpec.input.split('|')[0];
					const cursorPosition = testSpec.input.indexOf('|');
					const prefix = commandLine.slice(0, cursorPosition).split(' ').at(-1) || '';
					const filesRequested = testSpec.expectedResourceRequests?.type === 'files' || testSpec.expectedResourceRequests?.type === 'both';
					const foldersRequested = testSpec.expectedResourceRequests?.type === 'folders' || testSpec.expectedResourceRequests?.type === 'both';
					const terminalContext = { commandLine, cursorPosition, allowFallbackCompletions: true };
					const result = await getCompletionItemsFromSpecs(
						completionSpecs,
						terminalContext,
						availableCommands.map(c => { return { label: c }; }),
						prefix,
						getTokenType(terminalContext, undefined),
						testPaths.cwd,
						{},
						'testName',
						undefined,
						new MockFigExecuteExternals()
					);
					deepStrictEqual(result.items.map(i => i.label).sort(), (testSpec.expectedCompletions ?? []).sort());
					strictEqual(result.filesRequested, filesRequested, 'Files requested different than expected, got: ' + result.filesRequested);
					strictEqual(result.foldersRequested, foldersRequested, 'Folders requested different than expected, got: ' + result.foldersRequested);
					if (testSpec.expectedResourceRequests?.cwd) {
						strictEqual(result.cwd?.fsPath, testSpec.expectedResourceRequests.cwd.fsPath, 'Non matching cwd');
					}
				});
			}
		});
	}
});


class MockFigExecuteExternals implements IFigExecuteExternals {
	public async executeCommand(input: Fig.ExecuteCommandInput): Promise<Fig.ExecuteCommandOutput> {
		return this.executeCommandTimeout(input);
	}
	async executeCommandTimeout(input: Fig.ExecuteCommandInput): Promise<Fig.ExecuteCommandOutput> {
		const command = [input.command, ...input.args].join(' ');
		try {
			return {
				status: 0,
				stdout: input.command,
				stderr: '',
			};
		} catch (err) {
			console.error(`Error running shell command '${command}'`, { err });
			throw err;
		}
	}
}

