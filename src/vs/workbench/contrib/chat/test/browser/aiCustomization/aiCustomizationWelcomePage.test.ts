/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { shouldShowCustomizationDiscover } from '../../../browser/aiCustomization/aiCustomizationWelcomePage.js';

suite('AICustomizationWelcomePage', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Marketplace visibility is independent of public feed and connector enablement', () => {
		const cases = [
			{ marketplace: false, publicFeed: false, connectors: false, discover: false },
			{ marketplace: false, publicFeed: true, connectors: false, discover: false },
			{ marketplace: false, publicFeed: false, connectors: true, discover: false },
			{ marketplace: true, publicFeed: false, connectors: false, discover: false },
			{ marketplace: true, publicFeed: true, connectors: false, discover: true },
			{ marketplace: true, publicFeed: false, connectors: true, discover: true },
		];
		assert.deepStrictEqual(cases.map(({ marketplace, publicFeed, connectors }) =>
			shouldShowCustomizationDiscover(new TestConfigurationService({
				[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: marketplace,
				[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: publicFeed,
				[CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: connectors,
			}), Object.values(CustomizationMarketplaceSources))), cases.map(({ discover }) => discover));
	});
});
