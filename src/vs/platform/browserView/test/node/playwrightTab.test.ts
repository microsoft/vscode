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
});
