/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IPlaywrightService } from '../../../../../../platform/browserView/common/playwrightService.js';
import { createBrowserPageLink } from '../../../electron-browser/tools/browserToolHelpers.js';
import { ClickBrowserTool } from '../../../electron-browser/tools/clickBrowserTool.js';

suite('browserToolHelpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('createBrowserPageLink', () => {
		test('links a page id', () => {
			const link = createBrowserPageLink('page-1');
			assert.ok(link.includes(']('), 'expected a markdown link');
			assert.ok(link.includes('vscodeLinkType=browser'));
		});

		// A client that disconnects mid-turn causes the agent host to synthesise a
		// ChatToolCallReady with no toolInput, which the workbench resolves to `{}`.
		// Every browser tool then reaches prepareToolInvocation with pageId
		// undefined; throwing there strands the tool call.
		test('does not throw when the page id is missing', () => {
			assert.doesNotThrow(() => createBrowserPageLink(undefined));
			assert.doesNotThrow(() => createBrowserPageLink(''));
		});

		test('falls back to the plain label when the page id is missing', () => {
			const link = createBrowserPageLink(undefined);
			assert.ok(!link.includes(']('), 'expected no markdown link target');
			assert.ok(link.length > 0, 'expected a non-empty label');
		});
	});

	suite('ClickBrowserTool', () => {
		const playwrightService = upcastPartial<IPlaywrightService>({});

		test('prepareToolInvocation survives empty parameters', async () => {
			const tool = new ClickBrowserTool(playwrightService);

			// Must not throw: this is the path taken after the owning client
			// disconnects and the tool is invoked with `{}`.
			const prepared = await tool.prepareToolInvocation(
				upcastPartial<Parameters<ClickBrowserTool['prepareToolInvocation']>[0]>({ parameters: {} }),
				CancellationToken.None,
			);

			assert.ok(prepared, 'expected a prepared invocation');
			assert.ok(prepared.invocationMessage, 'expected an invocation message');
		});

		test('invoke reports the missing page id as a normal tool error', async () => {
			const tool = new ClickBrowserTool(playwrightService);

			const result = await tool.invoke(
				upcastPartial<Parameters<ClickBrowserTool['invoke']>[0]>({ parameters: {}, context: undefined }),
				async () => 0,
				upcastPartial<Parameters<ClickBrowserTool['invoke']>[2]>({}),
				CancellationToken.None,
			);

			assert.ok(result, 'expected a tool result rather than a throw');
		});
	});
});
