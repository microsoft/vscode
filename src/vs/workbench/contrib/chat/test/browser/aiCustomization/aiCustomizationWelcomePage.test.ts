/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { shouldShowCustomizationDiscover } from '../../../browser/aiCustomization/aiCustomizationWelcomePage.js';

suite('AICustomizationWelcomePage', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('marketplace visibility and source enablement independently control Discover', () => {
		const sources = Object.values(CustomizationMarketplaceSources);
		const cases = [
			{ marketplace: false, plugin: false, publicFeed: false, discover: false },
			{ marketplace: false, plugin: true, publicFeed: false, discover: false },
			{ marketplace: false, plugin: false, publicFeed: true, discover: false },
			{ marketplace: false, plugin: true, publicFeed: true, discover: false },
			{ marketplace: true, plugin: false, publicFeed: false, discover: false },
			{ marketplace: true, plugin: true, publicFeed: false, discover: true },
			{ marketplace: true, plugin: false, publicFeed: true, discover: true },
			{ marketplace: true, plugin: true, publicFeed: true, discover: true },
		];
		assert.deepStrictEqual(cases.map(({ marketplace, plugin, publicFeed }) =>
			shouldShowCustomizationDiscover(new TestConfigurationService({
				[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: marketplace,
				[CustomizationMarketplaceConfiguration.PluginMarketplacesEnabled]: plugin,
				[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: publicFeed,
			}), sources)), cases.map(({ discover }) => discover));
	});
});
