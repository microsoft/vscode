/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { AgentNetworkFilterService } from '../../../networkFilter/common/networkFilterService.js';
import { AgentNetworkDomainSettingId } from '../../../networkFilter/common/settings.js';
import { IPlaywrightActionScope } from '../../node/playwrightService.js';
import { PlaywrightTab } from '../../node/playwrightTab.js';

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

	test('blocks agent access to reported parser-differential authorities', async () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, []);
		const networkFilterService = disposables.add(new AgentNetworkFilterService(configService));
		const actionScope: IPlaywrightActionScope = { activeCalls: 0 };
		const urls = [
			'http://a%40b@127.0.0.1:3000/private',
			'http://[::1]:3000/private',
			'http://[::ffff:7f00:1]:3000/private',
			'https://evil.com%2fx/',
			'https://evil.com%5c/',
		];
		const results = await Promise.all(urls.map(async url => {
			const tab = new PlaywrightTab(new TestPage(url), actionScope, networkFilterService);
			let actionRan = false;
			let actionBlocked = false;
			try {
				await tab.safeRunAgainstPage(async () => {
					actionRan = true;
				});
			} catch {
				actionBlocked = true;
			}
			return {
				actionBlocked,
				actionRan,
				summary: await tab.getSummary(),
			};
		}));

		assert.deepStrictEqual(results, urls.map(url => ({
			actionBlocked: true,
			actionRan: false,
			summary: networkFilterService.formatError(URI.parse(url)),
		})));
	});

	function createDialogTab() {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, false);
		const networkFilterService = disposables.add(new AgentNetworkFilterService(configService));
		const page = new DialogPage('http://127.0.0.1:3000/');
		return { page, tab: new PlaywrightTab(page, { activeCalls: 0 }, networkFilterService) };
	}

	test('reports a dialog that an action opens after the action itself resolved', async () => {
		// Like a click whose `onclick` calls `alert()` only once the page processes the input: the dialog opens
		// when the frame is next asked to evaluate, after the action has resolved.
		const { page, tab } = createDialogTab();
		page.dialogsOnEvaluation.push('alert');

		const result = await tab.safeRunAgainstPage(async () => 'clicked').catch(error => error.name);

		assert.deepStrictEqual({ result, summary: (await tab.getSummary()).includes('Active alert dialog: "alert"') }, {
			result: 'DialogInterruptedError',
			summary: true,
		});
	});

	test('reports the next dialog that replying to a dialog lets the page open', async () => {
		// Like `confirm()` followed by `alert()`: the alert opens once the page continues after the reply.
		const { page, tab } = createDialogTab();
		page.openDialog('confirm');
		page.dialogsOnEvaluation.push('alert');

		await tab.replyToDialog(true);

		assert.deepStrictEqual({ accepted: page.accepted, summary: (await tab.getSummary()).includes('Active alert dialog: "alert"') }, {
			accepted: ['confirm'],
			summary: true,
		});
	});

	test('an action that opens no dialog waits for one evaluation per frame', async () => {
		const { page, tab } = createDialogTab();

		const result = await tab.safeRunAgainstPage(async () => 'clicked');

		assert.deepStrictEqual({ result, evaluations: page.evaluations }, {
			result: 'clicked',
			evaluations: 2,
		});
	});
});

/** A page with two frames. Each evaluation opens the next of `dialogsOnEvaluation`, like input the page handles late. */
class DialogPage extends TestPage {
	private dialogListener: ((dialog: never) => void) | undefined;
	readonly dialogsOnEvaluation: string[] = [];
	readonly accepted: string[] = [];
	evaluations = 0;

	override on(event?: string, listener?: (dialog: never) => void): this {
		if (event === 'dialog') {
			this.dialogListener = listener;
		}
		return this;
	}

	override waitForFunction() {
		return new Promise<never>(() => { });
	}

	openDialog(type: string): void {
		this.dialogListener?.({
			type: () => type,
			message: () => type,
			accept: async () => { this.accepted.push(type); },
			dismiss: async () => { },
		} as never);
	}

	override frames() {
		const frame = {
			evaluate: async () => {
				this.evaluations++;
				const type = this.dialogsOnEvaluation.shift();
				if (type) {
					this.openDialog(type);
					return new Promise<never>(() => { });
				}
				return undefined;
			},
		};
		return [frame, frame] as unknown as ReturnType<PlaywrightPage['frames']>;
	}
}