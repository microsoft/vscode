/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { imageGenerationToolMetaKey, parseImageGenerationToolMetadata, readImageGenerationToolMetadata } from '../../common/meta/agentImageGenerationMeta.js';
import { getToolCallDurationMs, readToolCallMeta, readToolCallPresentation, toToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { ToolCallConfirmationReason, ToolCallStatus } from '../../common/state/protocol/state.js';

suite('Image generation tool metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('validates provider execution durations and timestamp order', () => {
		const start = '2026-10-08T12:00:00.000Z';
		const values = [0, 43_500, -1, Infinity, NaN, '43500', null, undefined];
		assert.deepStrictEqual({
			durations: values.map(value => readToolCallMeta({ _meta: { 'vscode.toolCallDurationMs': value } })['vscode.toolCallDurationMs']),
			timestamps: [
				getToolCallDurationMs(start, '2026-10-08T12:00:43.500Z'),
				getToolCallDurationMs(start, start),
				getToolCallDurationMs(start, '2026-10-08T11:59:59.000Z'),
				getToolCallDurationMs(undefined, start),
				getToolCallDurationMs(start, 'invalid'),
			],
		}, {
			durations: [0, 43_500, undefined, undefined, undefined, undefined, undefined, undefined],
			timestamps: [43_500, 0, undefined, undefined, undefined],
		});
	});

	test('round trips namespaced image identity without interpreting model identifiers', () => {
		const imageGeneration = { requestedModel: { id: 'remote-provider/image:preview', name: 'Image Preview' } };
		const source = { _meta: toToolCallMeta({ toolKind: 'read', [imageGenerationToolMetaKey]: imageGeneration }) };
		assert.deepStrictEqual({
			image: readImageGenerationToolMetadata(source),
			all: readToolCallMeta(source),
			conversationModelOnly: readImageGenerationToolMetadata({ _meta: { model: 'gpt-5.5' } }),
		}, {
			image: imageGeneration,
			all: { toolKind: 'read', [imageGenerationToolMetaKey]: imageGeneration },
			conversationModelOnly: undefined,
		});
	});

	test('rejects missing and malformed identity and tolerates absent display names', () => {
		const values = [
			undefined, null, [], 'image', {},
			{ requestedModel: null },
			{ requestedModel: { name: 'Not an identity' } },
			{ requestedModel: { id: 42 } },
			{ requestedModel: { id: ' ' } },
		];
		assert.deepStrictEqual(values.map(parseImageGenerationToolMetadata), values.map(() => undefined));
		assert.deepStrictEqual([undefined, '', ' ', 42].map(name => parseImageGenerationToolMetadata({
			requestedModel: { id: 'image-preview', name },
		})), Array.from({ length: 4 }, () => ({ requestedModel: { id: 'image-preview' } })));
	});

	test('image metadata selects the VS Code convention before tool-name fallbacks', () => {
		const values = [{ requestedModel: { id: 'remote-provider/image:preview' } }, { requestedModel: { id: '' } }];
		const presentations = values.map(value => readToolCallPresentation({
			status: ToolCallStatus.Completed,
			toolCallId: 'image-call',
			toolName: 'grep',
			displayName: 'grep',
			invocationMessage: 'Running grep',
			pastTenseMessage: 'Tool finished',
			confirmed: ToolCallConfirmationReason.NotNeeded,
			success: true,
			_meta: { [imageGenerationToolMetaKey]: value },
		}));
		assert.deepStrictEqual(presentations, values.map(() => ({
			toolKind: undefined,
			invocationMessage: 'Running grep',
			pastTenseMessage: 'Tool finished',
		})));
	});
});
