/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';

import { beforeEach, suite, test, vi } from 'vitest';

const executeCommand = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
	commands: { executeCommand },
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

import { TS6TypeScriptMetricsProvider } from '../ts6/typeScriptMetricsService';

suite('TypeScript 6 metrics service', () => {
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
		executeCommand.mockResolvedValue({ type: 'response', body: expectedResult });
		const provider = new TS6TypeScriptMetricsProvider();
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
				command: executeCommand.mock.calls[0],
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
});
