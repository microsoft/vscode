/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { AGENTS_MODE_ENABLED_SETTING } from '../../../../services/configuration/browser/agents/agentsModeWorkspaceService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { AgentsModeActive, CanEnterAgentsMode } from '../../browser/agentSessions/agentsModeActions.js';
import { AgentsModeContribution } from '../../electron-browser/agentSessions/agentsModeContribution.js';

suite('Agents mode contribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** Records whether the window can enter the mode as the setting is turned off and on again, in a window that supports the mode. */
	async function canEnterAsSettingChanges(isActive: boolean): Promise<{ canEnter: boolean[]; active: boolean }> {
		const configuration = new TestConfigurationService({ [AGENTS_MODE_ENABLED_SETTING]: true });
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const context = disposables.add(new ContextKeyService(configuration));
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IContextKeyService, context);
		instantiation.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiation.stub(IAgentsModeService, { isSupported: true, isActive, onWillChange: Event.None, onDidChange: Event.None });
		instantiation.stub(IActionViewItemService, { register: () => Disposable.None });
		instantiation.stub(IWorkbenchLayoutService, { onDidChangePartVisibility: Event.None });
		instantiation.stub(IEditorService, { onDidVisibleEditorsChange: Event.None });
		instantiation.stub(IEditorGroupsService, {});
		// A window restored in the mode lays itself out once restored, which this test does not need
		instantiation.stub(ILifecycleService, { when: () => new Promise<void>(() => { }) });
		instantiation.stub(IViewsService, {});
		instantiation.stub(IViewDescriptorService, {});

		disposables.add(instantiation.createInstance(AgentsModeContribution));
		const canEnter = [context.getContextKeyValue<boolean>(CanEnterAgentsMode.key) ?? false];
		for (const value of [false, true]) {
			await configuration.setUserConfiguration(AGENTS_MODE_ENABLED_SETTING, value);
			configuration.onDidChangeConfigurationEmitter.fire({ affectedKeys: new Set([AGENTS_MODE_ENABLED_SETTING]), affectsConfiguration: (key: string): boolean => key === AGENTS_MODE_ENABLED_SETTING } as Partial<IConfigurationChangeEvent> as IConfigurationChangeEvent);
			canEnter.push(context.getContextKeyValue<boolean>(CanEnterAgentsMode.key) ?? false);
		}
		return { canEnter, active: context.getContextKeyValue<boolean>(AgentsModeActive.key) ?? false };
	}

	test('a window that supports the mode can enter it while the setting is on, and follows the setting as it is turned off and on', async () => {
		assert.deepStrictEqual(await canEnterAsSettingChanges(false), { canEnter: [true, false, true], active: false });
	});

	test('a window in the mode cannot enter it again, whatever the setting', async () => {
		assert.deepStrictEqual(await canEnterAsSettingChanges(true), { canEnter: [false, false, false], active: true });
	});
});
