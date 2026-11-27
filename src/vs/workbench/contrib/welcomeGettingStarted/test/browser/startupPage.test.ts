/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IEditorIdentifier } from '../../../../common/editor.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestLifecycleService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { GettingStartedInput } from '../../browser/gettingStartedInput.js';
import { StartupPageRunnerContribution } from '../../browser/startupPage.js';

suite('StartupPageRunnerContribution in Agents mode', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function run(isAgentsMode: boolean) {
		const agentsModeService = { isSupported: true, isActive: isAgentsMode, onDidChange: Event.None };

		const welcome = store.add(new GettingStartedInput({}));
		let editors: IEditorIdentifier[] = [{ editor: welcome, groupId: 1 }];
		const editorService: Partial<IEditorService> = {
			onDidCloseEditor: Event.None,
			activeEditor: welcome,
			getEditors: () => editors,
			closeEditors: async toClose => { editors = editors.filter(e => !toClose.includes(e)); },
		};

		const lifecycleService = store.add(new TestLifecycleService());
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IAgentsModeService, agentsModeService);
		instantiationService.stub(IEditorService, editorService);
		instantiationService.stub(ILifecycleService, lifecycleService);
		instantiationService.stub(IWorkbenchEnvironmentService, { skipWelcome: true });
		instantiationService.stub(IProductService, {});
		instantiationService.stub(IStorageService, store.add(new TestStorageService()));
		instantiationService.stub(IContextKeyService, new MockContextKeyService());

		store.add(instantiationService.createInstance(StartupPageRunnerContribution));
		lifecycleService.phase = LifecyclePhase.Restored;
		await timeout(0);
		return editors.length;
	}

	test('closes the Welcome page when restored in the mode, and not outside it', async () => {
		assert.deepStrictEqual({ restoredInMode: await run(true), outsideMode: await run(false) }, { restoredInMode: 0, outsideMode: 1 });
	});
});
