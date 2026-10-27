/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IPlaywrightService } from '../../../../../../platform/browserView/common/playwrightService.js';
import { IAgentNetworkFilterService } from '../../../../../../platform/networkFilter/common/networkFilterService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { BrowserEditorInput } from '../../../common/browserEditorInput.js';
import { BrowserViewSharingState, IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { ScreenshotBrowserTool } from '../../../electron-browser/tools/screenshotBrowserTool.js';

suite('ScreenshotBrowserTool', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sandboxed Copilot screenshots reject shared user pages and policy-blocked isolated pages before capture', async () => {
		const restrictions = { sandboxEnabled: true, allowNetwork: true, allowedDomains: [], deniedDomains: ['blocked.example'] };
		const models = [
			upcastPartial<IBrowserViewModel>({ owner: { type: 'user' }, url: 'https://allowed.example' }),
			upcastPartial<IBrowserViewModel>({ owner: { type: 'agent', sessionId: 'chat:session' }, sandboxSessionId: 'chat:session', url: 'https://blocked.example' }),
		];
		const errors: (string | boolean | undefined)[] = [];
		for (const model of models) {
			const sharedModel = upcastPartial<IBrowserViewModel>({
				...model,
				sharingState: BrowserViewSharingState.Shared,
				captureScreenshot: async () => { throw new Error('Must not capture a disallowed page'); },
			});
			const input = upcastPartial<BrowserEditorInput>({ resolve: async () => sharedModel });
			const tool = new ScreenshotBrowserTool(
				upcastPartial<IBrowserViewWorkbenchService>({ getKnownBrowserViews: () => new Map([['page', input]]) }),
				upcastPartial<IPlaywrightService>({}),
				upcastPartial<ITelemetryService>({}),
				upcastPartial<IEditorGroupsService>({}),
				upcastPartial<IAgentNetworkFilterService>({ isUriAllowed: () => false, formatError: () => 'Blocked by session network policy' }),
			);
			const result = await tool.invoke({
				callId: 'test', toolId: 'screenshot_page', parameters: { pageId: 'page' },
				context: { sessionResource: URI.parse('chat:session'), sandboxNetworkRestrictions: restrictions },
			}, async () => 0, { report: () => { } }, CancellationToken.None);
			errors.push(result.toolResultError);
		}
		assert.deepStrictEqual(errors, [
			'No browser page found with ID page in this sandboxed session.',
			'Blocked by session network policy',
		]);
	});
});
