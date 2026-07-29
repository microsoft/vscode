/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { addConfiguredMarketplace } from '../../../common/plugins/marketplaceReference.js';

/**
 * {@link TestConfigurationService.updateValue} is a no-op, so record writes and
 * persist them back so subsequent reads observe the update.
 */
class RecordingConfigurationService extends TestConfigurationService {
	readonly updates: { readonly key: string; readonly value: unknown }[] = [];

	override updateValue(key: string, value: unknown): Promise<void> {
		this.updates.push({ key, value });
		return this.setUserConfiguration(key, value);
	}
}

suite('addConfiguredMarketplace', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('appends a new marketplace to the user setting', async () => {
		const configurationService = new RecordingConfigurationService({ [ChatConfiguration.PluginMarketplaces]: ['owner/repo'] });

		const added = await addConfiguredMarketplace(configurationService, 'other/marketplace');

		assert.strictEqual(added, true);
		assert.deepStrictEqual(configurationService.updates, [
			{ key: ChatConfiguration.PluginMarketplaces, value: ['owner/repo', 'other/marketplace'] },
		]);
	});

	test('trims the reference before storing it', async () => {
		const configurationService = new RecordingConfigurationService({ [ChatConfiguration.PluginMarketplaces]: [] });

		const added = await addConfiguredMarketplace(configurationService, '  owner/repo  ');

		assert.strictEqual(added, true);
		assert.deepStrictEqual(configurationService.updates, [
			{ key: ChatConfiguration.PluginMarketplaces, value: ['owner/repo'] },
		]);
	});

	test('does not write when the same reference is already configured', async () => {
		const configurationService = new RecordingConfigurationService({ [ChatConfiguration.PluginMarketplaces]: ['owner/repo'] });

		const added = await addConfiguredMarketplace(configurationService, 'owner/repo');

		assert.strictEqual(added, false);
		assert.strictEqual(configurationService.updates.length, 0);
	});

	test('deduplicates against an equivalent git URL form', async () => {
		const configurationService = new RecordingConfigurationService({ [ChatConfiguration.PluginMarketplaces]: ['owner/repo'] });

		const added = await addConfiguredMarketplace(configurationService, 'https://github.com/owner/repo.git');

		assert.strictEqual(added, false);
		assert.strictEqual(configurationService.updates.length, 0);
	});

	test('does not write for an invalid reference', async () => {
		const configurationService = new RecordingConfigurationService({ [ChatConfiguration.PluginMarketplaces]: [] });

		const added = await addConfiguredMarketplace(configurationService, 'not a marketplace');

		assert.strictEqual(added, false);
		assert.strictEqual(configurationService.updates.length, 0);
	});
});
