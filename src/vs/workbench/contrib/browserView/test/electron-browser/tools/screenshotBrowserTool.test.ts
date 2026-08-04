/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IPlaywrightService } from '../../../../../../platform/browserView/common/playwrightService.js';
import { NullTelemetryService, NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { BrowserEditorInput } from '../../../common/browserEditorInput.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { ScreenshotBrowserTool } from '../../../electron-browser/tools/screenshotBrowserTool.js';

suite('ScreenshotBrowserTool', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const screenshot = VSBuffer.wrap(Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
		'base64'
	));

	teardown(() => {
		sinon.restore();
	});

	function createTool(policyErrors: Array<string | undefined>, rawResults: unknown[] = []): {
		tool: ScreenshotBrowserTool;
		captureScreenshot: sinon.SinonStub;
		getNetworkPolicyError: sinon.SinonStub;
		invokeFunctionRaw: sinon.SinonStub;
		telemetryEvents: string[];
	} {
		const pageId = 'page';
		const captureScreenshot = sinon.stub().resolves(screenshot);
		const getNetworkPolicyError = sinon.stub();
		for (let i = 0; i < policyErrors.length; i++) {
			getNetworkPolicyError.onCall(i).resolves(policyErrors[i]);
		}
		const model = new class extends mock<IBrowserViewModel>() {
			override readonly zoomFactor = 1;
			override readonly visible = true;
			override captureScreenshot = captureScreenshot;
			override getNetworkPolicyError = getNetworkPolicyError;
		}();
		const input = new class extends mock<BrowserEditorInput>() {
			override async resolve(): Promise<IBrowserViewModel> {
				return model;
			}
		}();
		const browserViewWorkbenchService = new class extends mock<IBrowserViewWorkbenchService>() {
			override getKnownBrowserViews(): Map<string, BrowserEditorInput> {
				return new Map([[pageId, input]]);
			}
		}();
		const invokeFunctionRaw = sinon.stub();
		for (let i = 0; i < rawResults.length; i++) {
			invokeFunctionRaw.onCall(i).resolves(rawResults[i]);
		}
		const playwrightService = new class extends mock<IPlaywrightService>() {
			override invokeFunctionRaw = invokeFunctionRaw;
		}();
		const telemetryEvents: string[] = [];
		const telemetryService = new class extends NullTelemetryServiceShape {
			override publicLog2(): void {
				telemetryEvents.push(arguments[0]);
			}
		}();
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override getGroups() {
				return [];
			}
		}();
		return {
			tool: new ScreenshotBrowserTool(browserViewWorkbenchService, playwrightService, telemetryService, editorGroupsService),
			captureScreenshot,
			getNetworkPolicyError,
			invokeFunctionRaw,
			telemetryEvents,
		};
	}

	async function invoke(tool: ScreenshotBrowserTool, parameters: Record<string, unknown>) {
		return tool.invoke(
			{ callId: 'call-id', toolId: 'screenshot_page', parameters: { pageId: 'page', ...parameters }, context: undefined },
			() => Promise.resolve(0),
			{ report: () => { } },
			CancellationToken.None,
		);
	}

	test('network policy rejection happens before screenshot capture', async () => {
		const pageId = 'blocked-page';
		const blockedError = 'Access to denied.example is blocked by network domain policy.';
		const captureScreenshot = sinon.stub().resolves(VSBuffer.wrap(Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
			'base64'
		)));
		const model = new class extends mock<IBrowserViewModel>() {
			override readonly zoomFactor = 1;
			override readonly visible = true;
			override captureScreenshot = captureScreenshot;
		}();
		const input = new class extends mock<BrowserEditorInput>() {
			override async resolve(): Promise<IBrowserViewModel> {
				return model;
			}
		}();
		const browserViewWorkbenchService = new class extends mock<IBrowserViewWorkbenchService>() {
			override getKnownBrowserViews(): Map<string, BrowserEditorInput> {
				return new Map([[pageId, input]]);
			}
		}();
		let validatePageAccessCallCount = 0;
		const playwrightService = new class extends mock<IPlaywrightService>() {
			override async invokeFunctionRaw<T>(): Promise<T> {
				validatePageAccessCallCount++;
				throw new Error(blockedError);
			}
		}();
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override getGroups() {
				return [];
			}
		}();
		const tool = new ScreenshotBrowserTool(
			browserViewWorkbenchService,
			playwrightService,
			NullTelemetryService,
			editorGroupsService,
		);

		const result = await tool.invoke(
			{ callId: 'call-id', toolId: 'screenshot_page', parameters: { pageId }, context: undefined },
			() => Promise.resolve(0),
			{ report: () => { } },
			CancellationToken.None,
		);

		assert.deepStrictEqual({
			validatePageAccessCallCount,
			captureScreenshotCallCount: captureScreenshot.callCount,
			content: result.content,
		}, {
			validatePageAccessCallCount: 1,
			captureScreenshotCallCount: 0,
			content: [{
				kind: 'text',
				value: blockedError,
			}],
		});
	});

	test('network policy rejection happens before selector lookup', async () => {
		const blockedError = 'Access to denied.example is blocked by network domain policy.';
		const { tool, captureScreenshot, getNetworkPolicyError, invokeFunctionRaw, telemetryEvents } = createTool([blockedError]);

		const result = await invoke(tool, { selector: '#target' });

		assert.deepStrictEqual({
			invokeFunctionRawCallCount: invokeFunctionRaw.callCount,
			getNetworkPolicyErrorCallCount: getNetworkPolicyError.callCount,
			captureScreenshotCallCount: captureScreenshot.callCount,
			telemetryEvents,
			content: result.content,
		}, {
			invokeFunctionRawCallCount: 1,
			getNetworkPolicyErrorCallCount: 1,
			captureScreenshotCallCount: 0,
			telemetryEvents: [],
			content: [{ kind: 'text', value: blockedError }],
		});
	});

	test('network policy rejection after selector lookup prevents capture', async () => {
		const blockedError = 'Access to denied.example is blocked by network domain policy.';
		const { tool, captureScreenshot, getNetworkPolicyError, invokeFunctionRaw, telemetryEvents } = createTool(
			[undefined, blockedError],
			[undefined, { x: 1, y: 2, width: 3, height: 4 }, undefined],
		);

		const result = await invoke(tool, { selector: '#target', scrollIntoViewIfNeeded: true });

		assert.deepStrictEqual({
			invokeFunctionRawCallCount: invokeFunctionRaw.callCount,
			getNetworkPolicyErrorCallCount: getNetworkPolicyError.callCount,
			captureScreenshotCallCount: captureScreenshot.callCount,
			telemetryEvents,
			content: result.content,
		}, {
			invokeFunctionRawCallCount: 3,
			getNetworkPolicyErrorCallCount: 2,
			captureScreenshotCallCount: 0,
			telemetryEvents: [],
			content: [{ kind: 'text', value: blockedError }],
		});
	});

	test('network policy rejection after capture discards image data and success telemetry', async () => {
		const blockedError = 'Access to denied.example is blocked by network domain policy.';
		const { tool, captureScreenshot, getNetworkPolicyError, invokeFunctionRaw, telemetryEvents } = createTool(
			[undefined, undefined, blockedError],
			[undefined, undefined, undefined],
		);

		const result = await invoke(tool, {});

		assert.deepStrictEqual({
			invokeFunctionRawCallCount: invokeFunctionRaw.callCount,
			getNetworkPolicyErrorCallCount: getNetworkPolicyError.callCount,
			captureScreenshotCallCount: captureScreenshot.callCount,
			telemetryEvents,
			content: result.content,
		}, {
			invokeFunctionRawCallCount: 3,
			getNetworkPolicyErrorCallCount: 3,
			captureScreenshotCallCount: 1,
			telemetryEvents: [],
			content: [{ kind: 'text', value: blockedError }],
		});
	});

	test('successful screenshot validates around capture and emits success telemetry once', async () => {
		const { tool, captureScreenshot, getNetworkPolicyError, invokeFunctionRaw, telemetryEvents } = createTool(
			[undefined, undefined, undefined],
			[undefined, undefined, undefined],
		);

		const result = await invoke(tool, {});

		assert.deepStrictEqual({
			invokeFunctionRawCallCount: invokeFunctionRaw.callCount,
			getNetworkPolicyErrorCallCount: getNetworkPolicyError.callCount,
			captureScreenshotCallCount: captureScreenshot.callCount,
			telemetryEvents,
			contentKinds: result.content.map(part => part.kind),
		}, {
			invokeFunctionRawCallCount: 3,
			getNetworkPolicyErrorCallCount: 3,
			captureScreenshotCallCount: 1,
			telemetryEvents: ['integratedBrowser.tools.screenshot.captured'],
			contentKinds: ['data'],
		});
	});
});
