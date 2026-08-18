/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
// eslint-disable-next-line local/code-import-patterns
import type * as playwright from 'playwright-core';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { AgentNetworkFilterService, IAgentNetworkFilterService } from '../../../networkFilter/common/networkFilterService.js';
import { AgentNetworkDomainSettingId } from '../../../networkFilter/common/settings.js';
import { IPlaywrightActionScope } from '../../node/playwrightService.js';
import { DialogInterruptedError, PlaywrightTab } from '../../node/playwrightTab.js';

class NetworkPolicyTestFrame {
	constructor(private readonly value: string) { }

	url(): string {
		return this.value;
	}

	async waitForLoadState(): Promise<void> { }
}

class NetworkPolicyTestPage extends EventEmitter {
	private currentFrames: NetworkPolicyTestFrame[];
	readonly ariaSnapshotCalls: boolean[] = [];
	onAriaSnapshot: (() => void) | undefined;

	constructor(
		mainUrl: string,
		childUrls: string[] = [],
		private readonly snapshot = 'ALLOWED_PAGE_CONTENT',
	) {
		super();
		this.currentFrames = [new NetworkPolicyTestFrame(mainUrl), ...childUrls.map(url => new NetworkPolicyTestFrame(url))];
	}

	setFrames(mainUrl: string, childUrls: string[] = []): void {
		this.currentFrames = [new NetworkPolicyTestFrame(mainUrl), ...childUrls.map(url => new NetworkPolicyTestFrame(url))];
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
		this.onAriaSnapshot?.();
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

	function createTab(page: NetworkPolicyTestPage): PlaywrightTab {
		const networkFilter: IAgentNetworkFilterService = {
			_serviceBrand: undefined,
			onDidChange: Event.None,
			isUriAllowed: uri => uri.authority !== 'denied.example',
			formatError: uri => `Access to ${uri.authority} is blocked by network domain policy.`,
		};
		return new PlaywrightTab(page.asPage(), { activeCalls: 0 }, networkFilter);
	}

	test('summary rejects a denied child frame without extracting page content', async () => {
		const page = new NetworkPolicyTestPage('https://allowed.example', ['https://denied.example/frame']);
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
		const page = new NetworkPolicyTestPage('https://allowed.example', ['chrome-error://chromewebdata/']);
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
		const page = new NetworkPolicyTestPage('https://allowed.example');
		const tab = createTab(page);

		await assert.rejects(
			tab.safeRunAgainstPage(async () => {
				page.setFrames('https://denied.example/private');
				return 'DENIED_ACTION_RESULT';
			}),
			/Access to denied\.example is blocked by network domain policy/
		);
	});

	test('reports when a dialog-interrupted action actually settles', async () => {
		const page = new NetworkPolicyTestPage('https://allowed.example');
		const tab = createTab(page);
		let resumeAction: (() => void) | undefined;
		const action = tab.safeRunAgainstPage(async () => {
			await new Promise<void>(resolve => resumeAction = resolve);
		});
		while (!resumeAction) {
			await Promise.resolve();
		}
		page.emit('dialog', {
			accept: async () => { },
			dismiss: async () => { },
		} satisfies Pick<playwright.Dialog, 'accept' | 'dismiss'>);

		const error = await action.catch(error => error);
		assert.ok(error instanceof DialogInterruptedError);
		let actionSettled = false;
		error.whenActionSettled.then(() => actionSettled = true);
		await Promise.resolve();
		const settledBeforeResume = actionSettled;
		resumeAction?.();
		await error.whenActionSettled;

		assert.deepStrictEqual({ settledBeforeResume, actionSettled }, { settledBeforeResume: false, actionSettled: true });
	});

	test('summary returns only the policy error when the page navigates during extraction', async () => {
		const page = new NetworkPolicyTestPage('https://allowed.example');
		const tab = createTab(page);
		page.onAriaSnapshot = () => page.setFrames('https://denied.example/private');

		const summary = await tab.getSummary(true);

		assert.strictEqual(summary, 'Access to denied.example is blocked by network domain policy.');
	});

	test('does not retain console logs collected while page content is denied', async () => {
		const page = new NetworkPolicyTestPage('https://denied.example/private');
		const tab = createTab(page);
		page.emit('console', {
			type: () => 'error',
			timestamp: () => Date.now(),
			text: () => 'DENIED_CONSOLE_CONTENT',
		} satisfies Pick<playwright.ConsoleMessage, 'type' | 'timestamp' | 'text'>);

		const blockedSummary = await tab.getSummary(true);
		page.setFrames('https://allowed.example');
		const allowedSummary = await tab.getSummary(true);

		assert.deepStrictEqual({
			blockedSummary,
			allowedSummaryContainsDeniedLog: allowedSummary.includes('DENIED_CONSOLE_CONTENT'),
		}, {
			blockedSummary: 'Access to denied.example is blocked by network domain policy.',
			allowedSummaryContainsDeniedLog: false,
		});
	});

	test('does not expose denied request URLs through recent-event logs', async () => {
		const page = new NetworkPolicyTestPage('https://allowed.example');
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
		const page = new NetworkPolicyTestPage('https://allowed.example', ['https://dynamic.example/frame']);
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

type PlaywrightPage = ConstructorParameters<typeof PlaywrightTab>[0];

class TestPage extends mock<PlaywrightPage>() {
	constructor(private readonly currentUrl: string) {
		super();
	}

	override on(): this {
		return this;
	}

	override off(): this {
		return this;
	}

	override url(): string {
		return this.currentUrl;
	}

	override frames(): ReturnType<PlaywrightPage['frames']> {
		return [{ url: () => this.currentUrl }] as ReturnType<PlaywrightPage['frames']>;
	}

	override async consoleMessages() {
		return [];
	}

	override async pageErrors() {
		return [];
	}

	override async title(): Promise<string> {
		return 'Private page';
	}

	override async ariaSnapshot(): Promise<string> {
		return 'Private page content';
	}
}

suite('PlaywrightTab', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('blocks agent access after Chromium normalizes an IPv4-mapped IPv6 URL', async () => {
		const url = 'http://[::ffff:7f00:1]:3000/private';
		const page = new TestPage(url);

		const configService = new TestConfigurationService();
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, []);
		const networkFilterService = disposables.add(new AgentNetworkFilterService(configService));
		const actionScope: IPlaywrightActionScope = { activeCalls: 0 };
		const tab = new PlaywrightTab(page, actionScope, networkFilterService);

		let actionRan = false;
		let actionBlocked = false;
		try {
			await tab.safeRunAgainstPage(async () => {
				actionRan = true;
			});
		} catch {
			actionBlocked = true;
		}
		const summary = await tab.getSummary();

		assert.deepStrictEqual({
			actionBlocked,
			actionRan,
			summary,
		}, {
			actionBlocked: true,
			actionRan: false,
			summary: networkFilterService.formatError(URI.parse(url)),
		});
	});
});
