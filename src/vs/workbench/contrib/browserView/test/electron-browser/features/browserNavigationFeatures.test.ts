/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createStubInstance, restore, stub } from 'sinon';
import { Event } from '../../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { BrowserViewCommandId } from '../../../../../../platform/browserView/common/browserView.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../services/preferences/common/preferences.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { BrowserEditor } from '../../../electron-browser/browserEditor.js';
import { BrowserNavigationFeatures } from '../../../electron-browser/features/browserNavigationFeatures.js';
import '../../../electron-browser/features/browserTabManagementFeatures.js';

suite('Browser Navigation Focus', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => restore());

	test('new-tab commands open the URL picker only when no URL was supplied', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IPreferencesService, upcastPartial<IPreferencesService>({}));
		const editor = upcastPartial<BrowserEditor>({
			onDidChangeModel: Event.None,
		});
		const feature = store.add(instantiationService.createInstance(BrowserNavigationFeatures, editor));
		const openUrlPicker = stub(feature, 'openUrlPicker');
		const pane = createStubInstance(BrowserEditor);
		pane.getContribution.returns(feature);
		instantiationService.stub(IEditorService, 'openEditor', async () => pane);
		instantiationService.stub(IBrowserViewWorkbenchService, upcastPartial<IBrowserViewWorkbenchService>({
			getPreferredGroup: async () => undefined,
		}));

		const results = [];
		for (const [command, url] of [
			[BrowserViewCommandId.NewTab, undefined],
			[BrowserViewCommandId.Open, undefined],
			[BrowserViewCommandId.Open, 'https://example.com'],
			[BrowserViewCommandId.Open, 'about:blank'],
		] as const) {
			openUrlPicker.resetHistory();
			await instantiationService.invokeFunction(CommandsRegistry.getCommand(command)!.handler, url);
			results.push(openUrlPicker.callCount);
		}
		assert.deepStrictEqual(results, [1, 1, 0, 0]);
	});
});
