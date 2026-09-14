/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';

import type * as vscode from 'vscode';
import { suite, test } from 'vitest';

import { packageJson } from '../../../../platform/env/common/packagejson';
import type { ICodeReviewService, TypeScriptChangeClassificationInput, TypeScriptChangeClassificationResult, TypeScriptMetricsResult } from '../../../../platform/languageContextProvider/common/codeReviewService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart } from '../../../../vscodeTypes';
import { getContributedToolName, ToolName } from '../../common/toolNames';
import { ToolRegistry } from '../../common/toolsRegistry';
import { ITypeScriptChangeClassificationToolInput, TypeScriptChangeClassificationTool } from '../typeScriptChangeClassificationTool';

suite('TypeScript change classification tool', () => {
	test('is registered with the required model guidance', () => {
		const contributedName = getContributedToolName(ToolName.TypeScriptChangeClassification);
		const definition = packageJson.contributes.languageModelTools.find(tool => tool.name === contributedName);
		const requiredDescriptionParts = [
			'added, changed, and deleted line buckets',
			'start-inclusive, end-exclusive',
			'current-snapshot anchor line',
			'one bucket per enclosing named entity path',
			'Each bucket includes the structural entity',
		];
		assert.deepStrictEqual({
			registered: ToolRegistry.getTools().some(tool => tool.toolName === ToolName.TypeScriptChangeClassification),
			contributedName: definition?.name,
			missingDescriptionParts: requiredDescriptionParts.filter(part => !definition?.modelDescription.includes(part)),
		}, {
			registered: true,
			contributedName: 'copilot_classifyTypeScriptChanges',
			missingDescriptionParts: [],
		});
	});

	test('returns serialized classifications and forwards all bucket types', async () => {
		const classification: TypeScriptChangeClassificationResult = {
			buckets: [
				{
					kind: 'method',
					path: ['Calculator', 'calculate'],
					range: { start: 1, end: 5 },
					changes: [
						{
							classifications: ['structural'],
							changeType: 'changed',
							start: 1,
							end: 2,
						},
						{
							classifications: ['algorithmic'],
							changeType: 'changed',
							start: 2,
							end: 4,
						},
					],
				},
				{
					kind: 'class',
					path: ['Calculator'],
					range: { start: 0, end: 10 },
					changes: [{
						classifications: ['structural'],
						changeType: 'deleted',
						line: 8,
						deletedLineCount: 2,
					}],
				},
			],
		};
		const service = new TestCodeReviewService(classification);
		const tool = new TypeScriptChangeClassificationTool(service);
		const input: ITypeScriptChangeClassificationToolInput = {
			filePath: 'C:\\workspace\\calculator.ts',
			addedLineRanges: [{ start: 0, end: 1 }],
			changedLineRanges: [{ start: 2, end: 4 }],
			deletedLines: [{ line: 8, deletedLineCount: 2 }],
			content: 'class Calculator {}',
		};
		const result = await tool.invoke(createOptions(input), CancellationToken.None);

		assert.deepStrictEqual({
			calls: service.calls,
			result: getText(result),
		}, {
			calls: [{
				filePath: 'C:\\workspace\\calculator.ts',
				changes: {
					added: [{ start: 0, end: 1 }],
					changed: [{ start: 2, end: 4 }],
					deleted: [{ line: 8, deletedLineCount: 2 }],
				},
				content: 'class Calculator {}',
			}],
			result: JSON.stringify(classification),
		});
	});

	test('rejects invalid buckets without invoking the service', async () => {
		const service = new TestCodeReviewService({ buckets: [] });
		const tool = new TypeScriptChangeClassificationTool(service);

		await assert.rejects(
			tool.invoke(createOptions({
				filePath: 'C:\\workspace\\calculator.ts',
				addedLineRanges: [],
				changedLineRanges: [{ start: 4, end: 2 }],
				deletedLines: [],
			}), CancellationToken.None),
			/TypeScript change buckets contain invalid line information/,
		);
		assert.deepStrictEqual(service.calls, []);
	});
});

interface ServiceCall {
	readonly filePath: string;
	readonly changes: TypeScriptChangeClassificationInput;
	readonly content?: string;
}

class TestCodeReviewService implements ICodeReviewService {
	readonly _serviceBrand: undefined;
	readonly calls: ServiceCall[] = [];

	constructor(private readonly result: TypeScriptChangeClassificationResult | undefined) { }

	async classifyChanges(filePath: string, changes: TypeScriptChangeClassificationInput, content?: string): Promise<TypeScriptChangeClassificationResult | undefined> {
		this.calls.push({ filePath, changes, content });
		return this.result;
	}

	async computeMetrics(): Promise<TypeScriptMetricsResult | undefined> {
		return undefined;
	}

	dispose(): void { }
}

function createOptions(input: ITypeScriptChangeClassificationToolInput): vscode.LanguageModelToolInvocationOptions<ITypeScriptChangeClassificationToolInput> {
	return { input } as vscode.LanguageModelToolInvocationOptions<ITypeScriptChangeClassificationToolInput>;
}

function getText(result: vscode.LanguageModelToolResult): string {
	return result.content
		.filter((part: unknown): part is LanguageModelTextPart => part instanceof LanguageModelTextPart)
		.map(part => part.value)
		.join('');
}
