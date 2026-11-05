/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AgentPluginsBrowseCommand } from '../../browser/agentPluginsView.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';

suite('AgentPluginsView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('browse action searches for agent plugins', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const searches: string[] = [];
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override openSearch(searchValue: string): Promise<void> {
				searches.push(searchValue);
				return Promise.resolve();
			}
		}());

		await instantiationService.invokeFunction(accessor => new AgentPluginsBrowseCommand().run(accessor));

		assert.deepStrictEqual(searches, ['@agentPlugins ']);
	});
});
