/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, UNKNOWN_EMPTY_WINDOW_WORKSPACE } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestLifecycleService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IOnboardingService } from '../../../welcomeOnboarding/common/onboardingService.js';
import { restoreWalkthroughsConfigurationKey, StartupPageRunnerContribution } from '../../browser/startupPage.js';

suite('StartupPageRunnerContribution in Agents mode', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function opened(isAgentsMode: boolean): Promise<number> {
		let opens = 0;
		const storageService = store.add(new TestStorageService());
		// A walkthrough to restore in this window, which opens whatever the startup editor setting is
		storageService.store(restoreWalkthroughsConfigurationKey, JSON.stringify({ folder: UNKNOWN_EMPTY_WINDOW_WORKSPACE.id, category: 'c', step: 's' }), StorageScope.PROFILE, StorageTarget.MACHINE);
		const lifecycleService = store.add(new TestLifecycleService());
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IEditorService, { onDidCloseEditor: Event.None, openEditor: async () => { opens++; return undefined; } });
		instantiationService.stub(IFileService, {});
		instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => testWorkspace() });
		instantiationService.stub(ILifecycleService, lifecycleService);
		instantiationService.stub(IWorkbenchLayoutService, {});
		instantiationService.stub(IProductService, {});
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(IWorkbenchEnvironmentService, { skipWelcome: true });
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(INotificationService, {});
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IOnboardingService, {});
		instantiationService.stub(IChatEntitlementService, {});
		instantiationService.stub(IAgentsModeService, { isSupported: true, isActive: isAgentsMode });

		store.add(instantiationService.createInstance(StartupPageRunnerContribution));
		lifecycleService.phase = LifecyclePhase.Restored;
		await timeout(0);
		return opens;
	}

	test('opens no startup editor in the mode, where it would outside it', async () => {
		assert.deepStrictEqual({ inMode: await opened(true), outsideMode: await opened(false) }, { inMode: 0, outsideMode: 1 });
	});
});
