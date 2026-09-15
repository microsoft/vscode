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
import { LanguageModelTextPart, Uri } from '../../../../vscodeTypes';
import { getContributedToolName, ToolName } from '../../common/toolNames';
import { ToolRegistry } from '../../common/toolsRegistry';
import { ITypeScriptChangeClassificationToolInput, TypeScriptChangeClassificationTool } from '../typeScriptChangeClassificationTool';

suite('TypeScript change classification tool', () => {
	test('is registered with the required model guidance', () => {
		const contributedName = getContributedToolName(ToolName.TypeScriptChangeClassification);
		const definition = packageJson.contributes.languageModelTools.find(tool => tool.name === contributedName);
		const requiredDescriptionParts = [
			'added, changed, and deleted line ranges',
			'start-inclusive, end-exclusive',
			'original content',
			'mapped to the modified AST',
			'direct modified and original arrays',
			'always render the joined entity path as a Markdown link',
			'Code addition, Code change, or Code deletion',
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
		const modifiedLink = Uri.parse('vscode-insiders://GitHub.copilot-chat/openCodeReviewDiff?id=modified');
		const originalLink = Uri.parse('vscode-insiders://GitHub.copilot-chat/openCodeReviewDiff?id=original');
		const classification: TypeScriptChangeClassificationResult = {
			modified: [
				{
					kind: 'method',
					path: ['Calculator', 'calculate'],
					range: { start: 1, end: 5 },
					entityLink: modifiedLink,
					changes: [
						{
							classifications: ['structural'],
							changeType: 'changed',
							range: { start: 1, end: 2 },
						},
						{
							classifications: ['code'],
							changeType: 'changed',
							range: { start: 2, end: 4 },
						},
					],
				},
			],
			original: [
				{
					kind: 'class',
					path: ['Calculator'],
					range: { start: 0, end: 10 },
					entityLink: originalLink,
					changes: [{
						classifications: ['structural'],
						changeType: 'deleted',
						range: { start: 8, end: 10 },
					}],
				},
			],
		};
		const service = new TestCodeReviewService(classification);
		const tool = new TypeScriptChangeClassificationTool(service);
		const input: ITypeScriptChangeClassificationToolInput = {
			filePath: 'C:\\workspace\\calculator.ts',
			modified: {
				content: 'class Calculator {}',
				added: [{ start: 0, end: 1 }],
				changed: [{ start: 2, end: 4 }],
			},
			original: {
				content: 'class Calculator { calculate() {} }',
				deleted: [{ start: 8, end: 10 }],
			},
		};
		const result = await tool.invoke(createOptions(input), CancellationToken.None);

		assert.deepStrictEqual({
			calls: service.calls,
			result: getText(result),
		}, {
			calls: [input],
			result: JSON.stringify({
				modified: [{
					...classification.modified[0],
					entityLink: modifiedLink.toString(true),
				}],
				original: [{
					...classification.original[0],
					entityLink: originalLink.toString(true),
				}],
			}),
		});
	});

	test('rejects invalid buckets without invoking the service', async () => {
		const service = new TestCodeReviewService({ modified: [], original: [] });
		const tool = new TypeScriptChangeClassificationTool(service);

		await assert.rejects(
			tool.invoke(createOptions({
				filePath: 'C:\\workspace\\calculator.ts',
				modified: {
					added: [],
					changed: [{ start: 4, end: 2 }],
				},
				original: {
					content: '',
					deleted: [],
				},
			}), CancellationToken.None),
			/TypeScript change buckets contain invalid line information/,
		);
		assert.deepStrictEqual(service.calls, []);
	});
});

class TestCodeReviewService implements ICodeReviewService {
	readonly _serviceBrand: undefined;
	readonly calls: TypeScriptChangeClassificationInput[] = [];

	constructor(private readonly result: TypeScriptChangeClassificationResult | undefined) { }

	async classifyChanges(input: TypeScriptChangeClassificationInput): Promise<TypeScriptChangeClassificationResult | undefined> {
		this.calls.push(input);
		return this.result;
	}

	async computeMetrics(): Promise<TypeScriptMetricsResult | undefined> {
		return undefined;
	}

	async openDiff(): Promise<void> { }

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
