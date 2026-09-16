/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';

import { beforeEach, suite, test, vi } from 'vitest';

const executeCommand = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
	commands: { executeCommand },
	extensions: {
		getExtension: () => ({ activate: async () => { } }),
	},
	Range: class {
		readonly start: { line: number; character: number };
		readonly end: { line: number; character: number };

		constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
			this.start = { line: startLine, character: startCharacter };
			this.end = { line: endLine, character: endCharacter };
		}
	},
	Uri: { file: (fsPath: string) => ({ fsPath }) },
}));

import { TypeScriptChangeClassification } from '../../common/serverProtocol';
import { TS6CodeReviewProvider } from '../ts6/codeReviewService';

suite('TypeScript 6 code review service', () => {
	beforeEach(() => {
		executeCommand.mockReset();
	});

	test('sends file content to the tsserver metrics handler', async () => {
		const expectedResult = {
			entities: [{
				kind: 'sourceFile',
				path: [],
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 12 } },
				metrics: { cognitiveComplexity: 0, cyclomaticComplexity: 1, runtimeComplexity: 'O(1)' },
			}],
		};
		executeCommand.mockImplementation(async (_command, request) => request === '_.copilot.ping'
			? { type: 'response', body: { kind: 'ok' } }
			: { type: 'response', body: expectedResult });
		const provider = new TS6CodeReviewProvider();
		try {
			const actual = await provider.computeMetrics('C:\\workspace\\metrics.ts', 'const value = 1;');
			assert.deepStrictEqual({
				actual: actual === undefined ? undefined : {
					entities: actual.entities.map(entity => ({
						...entity,
						range: {
							start: { line: entity.range.start.line, character: entity.range.start.character },
							end: { line: entity.range.end.line, character: entity.range.end.character },
						},
					})),
				},
				command: executeCommand.mock.calls[1],
			}, {
				actual: expectedResult,
				command: [
					'typescript.tsserverRequest',
					'_.copilot.typeScriptMetrics',
					{
						file: { fsPath: 'C:\\workspace\\metrics.ts' },
						line: 1,
						offset: 1,
						content: 'const value = 1;',
					},
					{ executionTarget: 0 },
				],
			});
		} finally {
			provider.dispose();
		}
	});

	test('sends changed ranges and modified content to tsserver', async () => {
		const expectedResult = {
			modified: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				pathKinds: ['class', 'method'],
				range: { start: 2, end: 5 },
				changes: [{
					classifications: [{
						classification: TypeScriptChangeClassification.Statement,
						ranges: [{ start: 3, end: 4 }],
						tags: [],
					}],
					changeType: 'changed',
					range: { start: 3, end: 4 },
				}],
			}],
			original: [],
		};
		executeCommand.mockImplementation(async (_command, request) => request === '_.copilot.ping'
			? { type: 'response', body: { kind: 'ok' } }
			: { type: 'response', body: expectedResult });
		const provider = new TS6CodeReviewProvider();
		try {
			const actual = await provider.classifyChanges({
				filePath: 'C:\\workspace\\calculator.ts',
				modified: {
					content: 'class Calculator { calculate() { return 2; } }',
					added: [],
					changed: [{ start: 3, end: 4 }],
				},
				original: {
					content: 'class Calculator { calculate() { return 1; } }',
					deleted: [],
				},
			});
			assert.deepStrictEqual({
				actual,
				command: executeCommand.mock.calls[1],
			}, {
				actual: expectedResult,
				command: [
					'typescript.tsserverRequest',
					'_.copilot.typeScriptChangeClassification',
					{
						file: { fsPath: 'C:\\workspace\\calculator.ts' },
						line: 1,
						offset: 1,
						modified: {
							content: 'class Calculator { calculate() { return 2; } }',
							added: [],
							changed: [{ start: 3, end: 4 }],
						},
						original: {
							content: 'class Calculator { calculate() { return 1; } }',
							deleted: [],
						},
					},
					{ executionTarget: 0 },
				],
			});
		} finally {
			provider.dispose();
		}
	});
});
