/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EventEmitter } from 'events';
// eslint-disable-next-line local/code-import-patterns
import type * as playwright from 'playwright-core';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentNetworkFilterService } from '../../../networkFilter/common/networkFilterService.js';
import { PlaywrightTab } from '../../node/playwrightTab.js';

class TestFrame {
	constructor(private readonly value: string) { }

	url(): string {
		return this.value;
	}

	async waitForLoadState(): Promise<void> { }
}

class TestPage extends EventEmitter {
	private currentFrames: TestFrame[];
	readonly ariaSnapshotCalls: boolean[] = [];

	constructor(
		mainUrl: string,
		childUrls: string[] = [],
		private readonly snapshot = 'ALLOWED_PAGE_CONTENT',
	) {
		super();
		this.currentFrames = [new TestFrame(mainUrl), ...childUrls.map(url => new TestFrame(url))];
	}

	setFrames(mainUrl: string, childUrls: string[] = []): void {
		this.currentFrames = [new TestFrame(mainUrl), ...childUrls.map(url => new TestFrame(url))];
	}

	url(): string {
		return this.currentFrames[0].url();
	}

	frames(): playwright.Frame[] {
		return this.currentFrames as unknown as playwright.Frame[];
	}

	mainFrame(): playwright.Frame {
		return this.currentFrames[0] as unknown as playwright.Frame;
	}

	async consoleMessages(): Promise<playwright.ConsoleMessage[]> {
		return [];
	}

	async pageErrors(): Promise<Error[]> {
		return [];
	}

	async ariaSnapshot(options?: { _track?: string }): Promise<string> {
		this.ariaSnapshotCalls.push(options?._track === 'response');
		return this.snapshot;
	}

	async title(): Promise<string> {
		return 'Allowed Page';
	}

	async waitForFunction(): Promise<true> {
		return true;
	}

	asPage(): playwright.Page {
		return this as unknown as playwright.Page;
	}
}

suite('PlaywrightTab network policy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createTab(page: TestPage): PlaywrightTab {
		const networkFilter: IAgentNetworkFilterService = {
			_serviceBrand: undefined,
			onDidChange: Event.None,
			isUriAllowed: uri => uri.authority !== 'denied.example',
			formatError: uri => `Access to ${uri.authority} is blocked by network domain policy.`,
		};
		return new PlaywrightTab(page.asPage(), { activeCalls: 0 }, networkFilter);
	}

	test('summary rejects a denied child frame without extracting page content', async () => {
		const page = new TestPage('https://allowed.example', ['https://denied.example/frame']);
		const tab = createTab(page);

		const summary = await tab.getSummary(true);

		assert.deepStrictEqual({
			summary,
			ariaSnapshotCallCount: page.ariaSnapshotCalls.length,
		}, {
			summary: 'Access to denied.example is blocked by network domain policy.',
			ariaSnapshotCallCount: 0,
		});
	});

	test('summary ignores Chromium error replacement frames', async () => {
		const page = new TestPage('https://allowed.example', ['chrome-error://chromewebdata/']);
		const tab = createTab(page);

		const summary = await tab.getSummary(true);

		assert.deepStrictEqual({
			includesAllowedContent: summary.includes('ALLOWED_PAGE_CONTENT'),
			includesChromeError: summary.includes('chromewebdata'),
			ariaSnapshotCallCount: page.ariaSnapshotCalls.length,
		}, {
			includesAllowedContent: true,
			includesChromeError: false,
			ariaSnapshotCallCount: 1,
		});
	});

	test('rejects an action result when the page navigates to a denied URL during execution', async () => {
		const page = new TestPage('https://allowed.example');
		const tab = createTab(page);

		await assert.rejects(
			tab.safeRunAgainstPage(async () => {
				page.setFrames('https://denied.example/private');
				return 'DENIED_ACTION_RESULT';
			}),
			/Access to denied\.example is blocked by network domain policy/
		);
	});

	test('does not expose denied request URLs through recent-event logs', async () => {
		const page = new TestPage('https://allowed.example');
		const tab = createTab(page);
		const request = {
			url: () => 'https://denied.example/private',
		} as playwright.Request;

		page.emit('requestfailed', request);
		const summary = await tab.getSummary(true);

		assert.deepStrictEqual({
			includesAllowedContent: summary.includes('ALLOWED_PAGE_CONTENT'),
			includesDeniedUrl: summary.includes('denied.example'),
			includesRequestFailure: summary.includes('requestFailed'),
		}, {
			includesAllowedContent: true,
			includesDeniedUrl: false,
			includesRequestFailure: false,
		});
	});

	test('uses current network policy after configuration changes', async () => {
		let denied = true;
		const page = new TestPage('https://allowed.example', ['https://dynamic.example/frame']);
		const networkFilter: IAgentNetworkFilterService = {
			_serviceBrand: undefined,
			onDidChange: Event.None,
			isUriAllowed: uri => uri.authority !== 'dynamic.example' || !denied,
			formatError: uri => `Access to ${uri.authority} is blocked by network domain policy.`,
		};
		const tab = new PlaywrightTab(page.asPage(), { activeCalls: 0 }, networkFilter);

		const blockedSummary = await tab.getSummary(true);
		denied = false;
		const allowedSummary = await tab.getSummary(true);

		assert.deepStrictEqual({
			blockedSummary,
			allowedSummaryContainsContent: allowedSummary.includes('ALLOWED_PAGE_CONTENT'),
		}, {
			blockedSummary: 'Access to dynamic.example is blocked by network domain policy.',
			allowedSummaryContainsContent: true,
		});
	});
});
