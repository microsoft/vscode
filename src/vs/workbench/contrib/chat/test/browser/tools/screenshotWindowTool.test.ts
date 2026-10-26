/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { readImageDimensions } from '../../../../../../base/common/image.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { ScreenshotWindowTool } from '../../../browser/tools/screenshotWindowTool.js';
import { IToolInvocation, IToolResult } from '../../../common/tools/languageModelToolsService.js';

suite('ScreenshotWindowTool', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const captureError = 'The window could not be captured. It may be minimized or hidden.';

	async function createJpeg(width: number, height: number): Promise<VSBuffer> {
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext('2d');
		assert.ok(context);
		context.fillStyle = '#336699';
		context.fillRect(0, 0, width, height);
		const blob = await canvas.convertToBlob({ type: 'image/jpeg' });
		return VSBuffer.wrap(new Uint8Array(await blob.arrayBuffer()));
	}

	function invoke(getScreenshot: () => Promise<VSBuffer | undefined>, token = CancellationToken.None): Promise<IToolResult> {
		const tool = new ScreenshotWindowTool(upcastPartial<IHostService>({ getScreenshot }), new NullLogService());
		return tool.invoke(upcastPartial<IToolInvocation>({ parameters: {} }), async () => 0, { report: () => { } }, token);
	}

	function describe(result: IToolResult) {
		return {
			content: result.content.map(part => part.kind === 'data'
				? { kind: part.kind, mimeType: part.value.mimeType, image: readImageDimensions(part.value.data) ?? part.value.data.toString() }
				: part),
			toolResultError: result.toolResultError,
		};
	}

	test('returns the capture as a JPEG downscaled like image attachments, with the window size', async () => {
		const windowSize = `The window is ${mainWindow.innerWidth}x${mainWindow.innerHeight} CSS pixels.`;
		const results = [
			describe(await invoke(() => createJpeg(1600, 1000))),
			describe(await invoke(() => createJpeg(400, 300))),
			describe(await invoke(async () => VSBuffer.fromString('undecodable capture'))),
		];

		assert.deepStrictEqual(results, [{
			content: [
				{ kind: 'text', value: `Screenshot of the whole window at 1229x768 pixels. ${windowSize}` },
				{ kind: 'data', mimeType: 'image/jpeg', image: { width: 1229, height: 768 } },
			],
			toolResultError: undefined,
		}, {
			content: [
				{ kind: 'text', value: `Screenshot of the whole window at 400x300 pixels. ${windowSize}` },
				{ kind: 'data', mimeType: 'image/jpeg', image: { width: 400, height: 300 } },
			],
			toolResultError: undefined,
		}, {
			content: [
				{ kind: 'text', value: `Screenshot of the whole window. ${windowSize}` },
				{ kind: 'data', mimeType: 'image/jpeg', image: 'undecodable capture' },
			],
			toolResultError: undefined,
		}]);
	});

	test('reports an error when the window cannot be captured', async () => {
		const results = [
			describe(await invoke(async () => undefined)),
			describe(await invoke(async () => VSBuffer.alloc(0))),
			describe(await invoke(async () => { throw new Error('Capture failed'); })),
		];

		assert.deepStrictEqual(results, Array.from({ length: 3 }, () => ({
			content: [{ kind: 'text', value: `Error: ${captureError}` }],
			toolResultError: captureError,
		})));
	});

	test('stops when cancelled during the capture', async () => {
		const source = new CancellationTokenSource();
		try {
			await assert.rejects(invoke(async () => {
				source.cancel();
				return createJpeg(400, 300);
			}, source.token), isCancellationError);
		} finally {
			source.dispose();
		}
	});
});
