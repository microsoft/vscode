/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ToolInvocation } from '@github/copilot-sdk';
import assert from 'assert';
import { readFile } from 'fs/promises';
import { timeout } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { dirname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { createImageGenerationMockTool } from '../../node/copilot/copilotImageGenerationMockTool.js';

suite('Copilot image generation mock tool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const imageUri = FileAccess.asFileUri('vs/platform/agentHost/node/copilot/media/imageGenerationMock.png');
	const storedImageUri = imageUri.with({ scheme: Schemas.inMemory });
	let fileService: FileService;
	let reads: URI[];
	let errors: (string | Error)[];
	let logService: NullLogService;
	let image: VSBuffer;

	setup(async () => {
		reads = [];
		errors = [];
		logService = new class extends NullLogService {
			override error(message: string | Error): void { errors.push(message); }
		}();
		fileService = store.add(new class extends FileService {
			override readFile(resource: URI) {
				reads.push(resource);
				return super.readFile(resource.with({ scheme: Schemas.inMemory }));
			}
		}(logService));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		image = VSBuffer.wrap(await readFile(imageUri.fsPath));
		await fileService.createFolder(dirname(storedImageUri));
		await fileService.writeFile(storedImageUri, image);
	});

	function invoke(args: Record<string, unknown>, token = CancellationToken.None, signal?: AbortSignal) {
		const tool = createImageGenerationMockTool(() => token, fileService, logService);
		const invocation: ToolInvocation = {
			sessionId: 'image-mock-session',
			toolCallId: 'image-mock-call',
			toolName: tool.name,
			arguments: args,
			signal,
		};
		assert.ok(tool.handler);
		return Promise.resolve(tool.handler(args, invocation));
	}

	test('returns the bundled PNG after exactly five seconds without sending image input to the model', () => runWithFakedTimers({}, async () => {
		let settled = false;
		const result = invoke({ prompt: 'Draw a puppy' }).then(value => {
			settled = true;
			return value;
		});
		await timeout(4999);
		assert.deepStrictEqual({ settled, reads: reads.length }, { settled: false, reads: 0 });
		await timeout(1);
		const message = 'Returned a fixed development sample image. The prompt did not generate or modify this image.';
		assert.deepStrictEqual(await result, {
			resultType: 'success',
			textResultForLlm: message,
			contents: [
				{ type: 'text', text: message },
				{ type: 'image', data: encodeBase64(image), mimeType: 'image/png' },
			],
		});
		assert.deepStrictEqual({
			dimensions: [image.readUInt32BE(16), image.readUInt32BE(20)],
			reads: reads.map(resource => resource.toString()),
			errors,
		}, { dimensions: [1254, 1254], reads: [imageUri.toString()], errors: [] });
	}));

	for (const source of ['turn', 'sdk'] as const) {
		for (const cancelBeforeInvocation of [false, true]) {
			test(`cancels from ${source} without reading the image (before invocation=${cancelBeforeInvocation})`, () => runWithFakedTimers({}, async () => {
				const cancellation = store.add(new CancellationTokenSource());
				const abort = new AbortController();
				const cancel = () => source === 'turn' ? cancellation.cancel() : abort.abort();
				if (cancelBeforeInvocation) {
					cancel();
				}
				const result = invoke({ prompt: 'Test cancellation' }, cancellation.token, abort.signal);
				if (!cancelBeforeInvocation) {
					await timeout(100);
					cancel();
				}
				const message = 'Mock image generation was cancelled.';
				assert.deepStrictEqual({ result: await result, reads, errors }, {
					result: { resultType: 'failure', textResultForLlm: message, error: message },
					reads: [],
					errors: [],
				});
			}));
		}
	}

	test('rejects invalid arguments without waiting or reading the image', async () => {
		for (const args of [{}, { prompt: '' }, { prompt: '   ' }, { prompt: 42 }, { prompt: 'Draw', url: 'https://example.com/image.png' }]) {
			const message = 'Provide a nonempty prompt to preview image generation.';
			assert.deepStrictEqual(await invoke(args), { resultType: 'failure', textResultForLlm: message, error: message });
		}
		assert.deepStrictEqual({ reads: reads.length, errors: errors.length }, { reads: 0, errors: 5 });
	});

	test('surfaces a missing bundled image as a failed tool result', () => runWithFakedTimers({}, async () => {
		await fileService.del(storedImageUri);
		const result = await invoke({ prompt: 'Draw a puppy' });
		const message = errors[0] instanceof Error ? errors[0].message : errors[0];
		assert.deepStrictEqual({ result, hasError: typeof message === 'string' && message.length > 0, errors: errors.length }, {
			result: { resultType: 'failure', textResultForLlm: message, error: message },
			hasError: true,
			errors: 1,
		});
	}));
});
