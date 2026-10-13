/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { imageGenerationToolMetaKey, parseImageGenerationToolMetadata, parseImageGenerationToolUsage, readImageGenerationToolMetadata } from '../../common/meta/agentImageGenerationMeta.js';
import { getToolCallDurationMs, readToolCallMeta, readToolCallPresentation, toToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { ToolCallConfirmationReason, ToolCallStatus } from '../../common/state/protocol/state.js';
import { readAgentModelPricingMeta } from '../../common/meta/agentModelMeta.js';
import { readAgentImageModels, readCopilotImageModels, withAgentImageModels, type IImageToolModel } from '../../common/meta/agentImageModels.js';

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

	test('preserves reported usage, including zero billing, without retaining internal data', () => {
		const usage = {
			requestId: 'operation',
			inputTokens: 21, outputTokens: 196, totalTokens: 217,
			copilotUsage: { totalNanoAiu: 0 },
		};
		const image = { requestedModel: { id: 'another-host/image:model' }, usage };
		assert.deepStrictEqual(readImageGenerationToolMetadata({
			_meta: {
				[imageGenerationToolMetaKey]: {
					...image,
					usage: { ...usage, accounting: { sequence: 1 }, quotaSnapshots: {}, prompt: 'not display metadata' },
				},
			},
		}), image);
	});

	test('missing and invalid billing never becomes a zero-cost operation', () => {
		for (const totalNanoAiu of [undefined, null, -1, NaN, Infinity, '0']) {
			assert.deepStrictEqual(parseImageGenerationToolUsage({
				requestId: 'operation',
				inputTokens: -1, outputTokens: 1.5, totalTokens: Number.MAX_SAFE_INTEGER + 1,
				copilotUsage: { totalNanoAiu },
			}), { requestId: 'operation' });
		}
		assert.deepStrictEqual([undefined, null, [], {}, { requestId: ' ' }].map(parseImageGenerationToolUsage), Array(5).fill(undefined));
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

	test('the auxiliary image catalog round trips independently of chat pricing', () => {
		const model = { id: 'another-host/model', provider: 'remote', name: 'Remote model' };
		const images: readonly IImageToolModel[] = [
			{ id: 'opaque/image:first', name: 'First Image', supportedOperations: ['generate', 'edit'], isDefault: true, pricing: { batchSize: 100_000, textInputPrice: 50, textOutputPrice: 0 } },
			{ id: 'opaque/image:second', name: 'Second Image', supportedOperations: ['generate'], isDefault: false },
		];
		const meta = withAgentImageModels({ inputCost: 0 }, images);
		assert.deepStrictEqual({
			roundTrip: readAgentImageModels({ ...model, _meta: JSON.parse(JSON.stringify(meta)) }),
			runtime: readCopilotImageModels({ models: [model], imageModels: images }),
			chatPricing: readAgentModelPricingMeta({ ...model, _meta: meta }),
			absent: readAgentImageModels({ ...model, _meta: undefined }),
			olderRuntime: readCopilotImageModels({ models: [model] }),
			emptyCatalog: readAgentImageModels({ _meta: withAgentImageModels(undefined, []) }),
		}, {
			roundTrip: images, runtime: images, chatPricing: { inputCost: 0 },
			absent: undefined, olderRuntime: undefined, emptyCatalog: [],
		});
	});

	test('image catalogs validate entries and preserve opaque IDs without inventing models or prices', () => {
		const image = { id: 'external:opaque/image', name: 'External Image', supportedOperations: ['edit', 'edit', 'future-operation'], isDefault: false };
		const invalid = [null, 1, {}, { ...image, id: ' ' }, { ...image, name: 1 }, { ...image, supportedOperations: [] }, { ...image, isDefault: 'true' }];
		assert.deepStrictEqual({
			invalidCatalog: readAgentImageModels({ _meta: { 'vscode.imageModels': 'invalid' } }),
			models: readCopilotImageModels({ imageModels: [...invalid, image, image] }),
		}, {
			invalidCatalog: undefined,
			models: [{ id: image.id, name: image.name, supportedOperations: ['edit'], isDefault: false }],
		});

		test('unavailable defaults survive the metadata round trip without fabricated operations or pricing', () => {
			const image: IImageToolModel = {
				id: 'runtime:default', name: 'Runtime Default', isDefault: true, availability: 'unavailable', supportedOperations: [],
			};
			assert.deepStrictEqual(readAgentImageModels({ _meta: withAgentImageModels(undefined, [image]) }), [image]);
			assert.deepStrictEqual(readCopilotImageModels({
				imageModels: [
					{ ...image, availability: 'future-value' },
					{ ...image, availability: 'available' },
					image,
				]
			}), [image]);
		});
	});

	test('invalid or missing image pricing is never replaced with a free image quote', () => {
		const image = { id: 'image', name: 'Image', supportedOperations: ['generate'], isDefault: true };
		for (const pricing of [
			undefined, null, {}, [],
			{ batchSize: 0, textInputPrice: 1 },
			{ batchSize: -1, textInputPrice: 1 },
			{ batchSize: 1.5, textInputPrice: 1 },
			{ batchSize: Number.MAX_SAFE_INTEGER + 1, textInputPrice: 1 },
			{ batchSize: 1, textInputPrice: -1 },
			{ batchSize: 1, textInputPrice: Infinity },
			{ batchSize: 1, textInputPrice: Number.MAX_VALUE },
			{ batchSize: 1, textInputPrice: '0' },
		]) {
			assert.deepStrictEqual(readCopilotImageModels({ imageModels: [{ ...image, pricing }] }), [image]);
		}
		assert.deepStrictEqual(readCopilotImageModels({
			imageModels: [{ ...image, pricing: { batchSize: 1_000_000, textInputPrice: 0, textOutputPrice: -1 } }],
		}), [{ ...image, pricing: { batchSize: 1_000_000, textInputPrice: 0 } }]);
	});
});
