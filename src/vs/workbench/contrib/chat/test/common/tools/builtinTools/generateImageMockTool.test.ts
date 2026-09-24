/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../../base/common/errors.js';
import { FileAccess } from '../../../../../../../base/common/network.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/virtualScheduling/index.js';
import { IEnvironmentService } from '../../../../../../../platform/environment/common/environment.js';
import { TestFileService } from '../../../../../../test/common/workbenchTestServices.js';
import { GenerateImageMockTool, GenerateImageMockToolData, GenerateImageMockToolId } from '../../../../common/tools/builtinTools/generateImageMockTool.js';
import { IToolInvocation, ToolProgress } from '../../../../common/tools/languageModelToolsService.js';

class MockImageFileService extends TestFileService {
	readonly image = decodeBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a79cAAAAASUVORK5CYII=');
	readToken: CancellationToken | undefined;
	onRead?: () => void;

	override async readFile(resource: URI, options?: Parameters<TestFileService['readFile']>[1], token?: CancellationToken) {
		const file = await super.readFile(resource, options);
		this.readToken = token;
		this.onRead?.();
		return { ...file, value: this.image };
	}
}

suite('GenerateImageMockTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const invocation: IToolInvocation = {
		callId: 'mock-image-call',
		toolId: GenerateImageMockToolId,
		parameters: { prompt: 'Draw a happy puppy' },
		context: undefined,
	};
	const progress: ToolProgress = { report: () => assert.fail('Mock image generation must not report inline tool progress') };

	function createTool(isBuilt = false) {
		const fileService = store.add(new MockImageFileService());
		const environmentService = new class extends mock<IEnvironmentService>() {
			override isBuilt = isBuilt;
		}();
		return { tool: new GenerateImageMockTool(fileService, environmentService), fileService };
	}

	test('is explicitly referenceable and gated on Chat without restricting the model', () => {
		assert.deepStrictEqual({
			id: GenerateImageMockToolData.id,
			reference: GenerateImageMockToolData.toolReferenceName,
			canBeReferenced: GenerateImageMockToolData.canBeReferencedInPrompt,
			when: GenerateImageMockToolData.when?.serialize(),
			models: GenerateImageMockToolData.models,
			showsInputOutput: GenerateImageMockToolData.alwaysDisplayInputOutput,
			explicitMock: GenerateImageMockToolData.modelDescription.includes('only when explicitly asked to mock or test'),
			noImageService: GenerateImageMockToolData.modelDescription.includes('without contacting an image-generation service'),
		}, {
			id: 'generate_image_mock',
			reference: 'generate_image_mock',
			canBeReferenced: true,
			when: 'chatIsEnabled',
			models: undefined,
			showsInputOutput: true,
			explicitMock: true,
			noImageService: true,
		});
	});

	test('prepares the existing image-generation presentation without reading the image', async () => {
		const { tool, fileService } = createTool();
		const prepared = await tool.prepareToolInvocation({ parameters: invocation.parameters, toolCallId: invocation.callId, chatSessionResource: undefined }, CancellationToken.None);
		assert.deepStrictEqual({ prepared, reads: fileService.readOperations }, {
			prepared: { invocationMessage: 'Generating image', pastTenseMessage: 'Generated image' },
			reads: [],
		});
	});

	test('waits five seconds and returns the fixed PNG as a generated image', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { tool, fileService } = createTool();
		const started = Date.now();
		const resultPromise = tool.invoke(invocation, async () => 0, progress, CancellationToken.None);
		await timeout(4999);
		const readsBeforeDelay = fileService.readOperations.length;
		const result = await resultPromise;

		assert.deepStrictEqual({
			elapsed: Date.now() - started,
			readsBeforeDelay,
			reads: fileService.readOperations,
			readToken: fileService.readToken,
			result,
		}, {
			elapsed: 5000,
			readsBeforeDelay: 0,
			reads: [{ resource: FileAccess.asFileUri('vs/workbench/contrib/chat/common/tools/builtinTools/media/generatedImageMock.png') }],
			readToken: CancellationToken.None,
			result: {
				content: [
					{ kind: 'text', value: 'Development mock: returned the bundled sample image. No image was generated.' },
					{ kind: 'data', value: { data: fileService.image, mimeType: 'image/png' } },
				],
				toolSpecificData: { kind: 'generatedImage' },
			},
		});
	}));

	for (const prompt of [undefined, '', ' \n ', 42]) {
		test(`rejects an invalid prompt before the delay or file read (${JSON.stringify(prompt)})`, async () => {
			const { tool, fileService } = createTool();
			await assert.rejects(tool.invoke({ ...invocation, parameters: { prompt } }, async () => 0, progress, CancellationToken.None), /Provide a prompt/);
			assert.deepStrictEqual(fileService.readOperations, []);
		});
	}

	test('refuses preparation and direct invocation in packaged builds', async () => {
		const { tool, fileService } = createTool(true);
		await assert.rejects(tool.prepareToolInvocation({ parameters: invocation.parameters, toolCallId: invocation.callId, chatSessionResource: undefined }, CancellationToken.None), /only available in development builds/);
		await assert.rejects(tool.invoke(invocation, async () => 0, progress, CancellationToken.None), /only available in development builds/);
		assert.deepStrictEqual(fileService.readOperations, []);
	});

	test('refuses an already-cancelled invocation', async () => {
		const { tool, fileService } = createTool();
		await assert.rejects(tool.invoke(invocation, async () => 0, progress, CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual(fileService.readOperations, []);
	});

	test('cancels the simulated wait without reading or returning an image', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { tool, fileService } = createTool();
		const cancellation = store.add(new CancellationTokenSource());
		const result = tool.invoke(invocation, async () => 0, progress, cancellation.token);
		const rejected = assert.rejects(result, isCancellationError);
		await timeout(1000);
		cancellation.cancel();
		await rejected;
		assert.deepStrictEqual(fileService.readOperations, []);
	}));

	test('does not return an image when cancellation arrives during the read', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { tool, fileService } = createTool();
		const cancellation = store.add(new CancellationTokenSource());
		fileService.onRead = () => cancellation.cancel();
		await assert.rejects(tool.invoke(invocation, async () => 0, progress, cancellation.token), isCancellationError);
		assert.strictEqual(fileService.readToken, cancellation.token);
	}));

	test('surfaces a missing sample image instead of returning a successful fallback', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { tool, fileService } = createTool();
		const error = new Error('Sample image is missing');
		fileService.readShouldThrowError = error;
		await assert.rejects(tool.invoke(invocation, async () => 0, progress, CancellationToken.None), candidate => candidate === error);
	}));
});
