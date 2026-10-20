/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IResourceEditorInput, ViewColumn } from '../../../../../../platform/editor/common/editor.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IEditorService, PreferredGroup, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { LocalhostLinkOpenerContribution } from '../../../electron-browser/features/browserTabManagementFeatures.js';

suite('Localhost Link Opener', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const viewColumn of [undefined, ViewColumn.Beside]) {
		test(`preserves browser default placement or explicit side placement: ${viewColumn}`, async () => {
			const instantiationService = workbenchInstantiationService(undefined, store);
			const placements: (PreferredGroup | undefined)[] = [];
			const opened: (PreferredGroup | undefined)[] = [];
			instantiationService.stub(IOpenerService, { registerExternalOpener: () => Disposable.None });
			instantiationService.stub(IConfigurationService, new TestConfigurationService({
				'workbench.browser.openLocalhostLinks': true
			}));
			instantiationService.stub(IBrowserViewWorkbenchService, {
				resolveNetwork: () => undefined,
				getPreferredGroup: async group => {
					placements.push(group);
					return group;
				}
			});
			instantiationService.stub(IEditorService, 'openEditor', async (_input: IResourceEditorInput, group?: PreferredGroup) => {
				opened.push(group);
				return undefined;
			});
			const opener = store.add(instantiationService.createInstance(LocalhostLinkOpenerContribution));
			const url = 'https://localhost:9448/review?pr=342081#changes';
			const handled = await opener.openExternal(url, { sourceUri: URI.parse(url), viewColumn }, CancellationToken.None);
			const expectedPlacement = viewColumn === ViewColumn.Beside ? SIDE_GROUP : undefined;
			assert.deepStrictEqual({ handled, placements, opened }, {
				handled: true,
				placements: [expectedPlacement],
				opened: [expectedPlacement]
			});
		});
	}
});
