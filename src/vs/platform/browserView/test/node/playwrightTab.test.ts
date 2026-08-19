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
