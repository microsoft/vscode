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
import { LanguageModelTextPart, Range } from '../../../../vscodeTypes';
import { getContributedToolName, ToolName } from '../../common/toolNames';
import { ToolRegistry } from '../../common/toolsRegistry';
import { ITypeScriptMetricsToolInput, TypeScriptMetricsTool } from '../typeScriptMetricsTool';

suite('TypeScript metrics tool', () => {
	test('is registered', () => {
		const contributedName = getContributedToolName(ToolName.TypeScriptMetrics);
		const definition = packageJson.contributes.languageModelTools.find(tool => tool.name === contributedName);
		const requiredDescriptionParts = [
			'cognitive complexity',
			'cyclomatic complexity',
			'Big-O runtime complexity',
			'absolute file path',
			'zero-based source ranges',
			'unnamed entities are aggregated',
		];
		assert.deepStrictEqual({
			registered: ToolRegistry.getTools().some(tool => tool.toolName === ToolName.TypeScriptMetrics),
			contributedName: definition?.name,
			missingDescriptionParts: requiredDescriptionParts.filter(part => !definition?.modelDescription.includes(part)),
		}, {
			registered: true,
			contributedName: 'copilot_typeScriptMetrics',
			missingDescriptionParts: [],
		});
	});

	test('returns serialized metrics and forwards supplied content', async () => {
		const metrics: TypeScriptMetricsResult = {
			entities: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				range: new Range(2, 1, 8, 2),
				metrics: { cognitiveComplexity: 3, cyclomaticComplexity: 4, runtimeComplexity: 'O(n)' },
			}],
		};
		const service = new TestCodeReviewService(metrics);
		const tool = new TypeScriptMetricsTool(service);
		const result = await tool.invoke(createOptions({
			filePath: 'C:\\workspace\\calculator.ts',
			content: 'class Calculator {}',
		}), CancellationToken.None);

		assert.deepStrictEqual({
			calls: service.calls,
			result: getText(result),
		}, {
			calls: [{
				filePath: 'C:\\workspace\\calculator.ts',
				content: 'class Calculator {}',
			}],
			result: JSON.stringify({
				entities: [{
					kind: 'method',
					path: ['Calculator', 'calculate'],
					range: {
						start: { line: 2, character: 1 },
						end: { line: 8, character: 2 },
					},
					metrics: { cognitiveComplexity: 3, cyclomaticComplexity: 4, runtimeComplexity: 'O(n)' },
				}],
			}),
		});
	});

	test('rejects relative file paths without invoking the service', async () => {
		const service = new TestCodeReviewService({ entities: [] });
		const tool = new TypeScriptMetricsTool(service);

		await assert.rejects(
			tool.invoke(createOptions({ filePath: 'src/calculator.ts' }), CancellationToken.None),
			/filePath must be a non-empty absolute file path/,
		);
		assert.deepStrictEqual(service.calls, []);
	});
});

class TestCodeReviewService implements ICodeReviewService {
	readonly _serviceBrand: undefined;
	readonly calls: Array<ITypeScriptMetricsToolInput> = [];

	constructor(private readonly result: TypeScriptMetricsResult | undefined) { }

	async computeMetrics(filePath: string, content?: string): Promise<TypeScriptMetricsResult | undefined> {
		this.calls.push({ filePath, content });
		return this.result;
	}

	async classifyChanges(_filePath: string, _changes: TypeScriptChangeClassificationInput, _content?: string): Promise<TypeScriptChangeClassificationResult | undefined> {
		return undefined;
	}

	dispose(): void { }
}

function createOptions(input: ITypeScriptMetricsToolInput): vscode.LanguageModelToolInvocationOptions<ITypeScriptMetricsToolInput> {
	return { input } as vscode.LanguageModelToolInvocationOptions<ITypeScriptMetricsToolInput>;
}

function getText(result: vscode.LanguageModelToolResult): string {
	return result.content
		.filter((part: unknown): part is LanguageModelTextPart => part instanceof LanguageModelTextPart)
		.map(part => part.value)
		.join('');
}
