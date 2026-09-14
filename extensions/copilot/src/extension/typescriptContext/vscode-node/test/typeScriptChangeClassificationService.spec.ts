/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';

import { beforeEach, suite, test, vi } from 'vitest';

const executeCommand = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
	commands: { executeCommand },
	Uri: { file: (fsPath: string) => ({ fsPath }) },
}));

import { TS6TypeScriptChangeClassificationProvider } from '../ts6/typeScriptChangeClassificationService';

suite('TypeScript 6 change classification service', () => {
	beforeEach(() => {
		executeCommand.mockReset();
	});

	test('sends changed ranges and modified content to tsserver', async () => {
		const expectedResult = {
			buckets: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				range: { start: 2, end: 5 },
				changes: [{
					classifications: ['algorithmic'],
					changeType: 'changed',
					start: 3,
					end: 4,
				}],
			}],
		};
		executeCommand.mockResolvedValue({ type: 'response', body: expectedResult });
		const provider = new TS6TypeScriptChangeClassificationProvider();
		try {
			const actual = await provider.classifyChanges(
				'C:\\workspace\\calculator.ts',
				{
					added: [],
					changed: [{ start: 3, end: 4 }],
					deleted: [],
				},
				'class Calculator { calculate() { return 2; } }',
			);
			assert.deepStrictEqual({
				actual,
				command: executeCommand.mock.calls[0],
			}, {
				actual: expectedResult,
				command: [
					'typescript.tsserverRequest',
					'_.copilot.typeScriptChangeClassification',
					{
						file: { fsPath: 'C:\\workspace\\calculator.ts' },
						line: 1,
						offset: 1,
						changes: {
							added: [],
							changed: [{ start: 3, end: 4 }],
							deleted: [],
						},
						content: 'class Calculator { calculate() { return 2; } }',
					},
					{ executionTarget: 0 },
				],
			});
		} finally {
			provider.dispose();
		}
	});
});
