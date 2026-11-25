/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { NullCommandService } from '../../../../../platform/commands/test/common/nullCommandService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ICommandQuickPick } from '../../../../../platform/quickinput/browser/commandsQuickAccess.js';
import { IQuickInputService, IQuickPick } from '../../../../../platform/quickinput/common/quickInput.js';
import { IAiRelatedInformationService } from '../../../../services/aiRelatedInformation/common/aiRelatedInformation.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { CommandsQuickAccessProvider } from '../../browser/commandsQuickAccess.js';

type CommandPicker = IQuickPick<ICommandQuickPick, { useSeparators: true }>;

suite('CommandsQuickAccessProvider', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let contextKeyService: ContextKeyService;
	let getMenuActions: sinon.SinonSpy;
	let provider: CommandsQuickAccessProvider;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ICommandService, NullCommandService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ workbench: { commandPalette: { experimental: {} } } }));
		const menuService = store.add(instantiationService.createInstance(MenuService));
		getMenuActions = sinon.spy(menuService, 'getMenuActions');
		instantiationService.stub(IMenuService, menuService);
		contextKeyService = store.add(instantiationService.createInstance(ContextKeyService));
		instantiationService.stub(IEditorGroupsService, { activeGroup: new class extends mock<IEditorGroup>() { override readonly scopedContextKeyService = contextKeyService; } });
		instantiationService.stub(IPreferencesService, {});
		instantiationService.stub(IAiRelatedInformationService, {});
		instantiationService.stub(IChatAgentService, {});
		provider = store.add(instantiationService.createInstance(CommandsQuickAccessProvider));

		store.add(MenuRegistry.addCommand({ id: 'test.zyzzyva.alpha', title: 'Zyzzyva Alpha' }));
	});

	teardown(() => {
		sinon.restore();
	});

	function openPicker(): { picker: CommandPicker; session: IDisposable } {
		const picker = store.add(instantiationService.get(IQuickInputService).createQuickPick<ICommandQuickPick>({ useSeparators: true }));
		picker.value = CommandsQuickAccessProvider.PREFIX;
		return { picker, session: store.add(provider.provide(picker, CancellationToken.None)) };
	}

	async function type(picker: CommandPicker, value: string): Promise<{ labels: string[]; menuBuilds: number }> {
		picker.value = value;
		await timeout(0);
		return { labels: picker.items.map(item => item.type === 'separator' ? '---' : item.label), menuBuilds: getMenuActions.callCount };
	}

	test('reuses the picks of a session until the command palette menu or its context changes', async () => {
		const gammaVisible = contextKeyService.createKey<boolean>('test.zyzzyva.gammaVisible', false);

		const { picker } = openPicker();
		const results = [
			await type(picker, '>zyzzyva'),
			await type(picker, '>zyzzyv'),
		];

		// each change is followed by a query without waiting in between, Gamma brings a context key the menu didn't depend on before
		store.add(MenuRegistry.addCommand({ id: 'test.zyzzyva.beta', title: 'Zyzzyva Beta' }));
		store.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: 'test.zyzzyva.gamma', title: 'Zyzzyva Gamma' }, when: ContextKeyExpr.equals('test.zyzzyva.gammaVisible', true) }));
		results.push(await type(picker, '>zyzzy'));
		gammaVisible.set(true);
		results.push(await type(picker, '>zyzz'));

		assert.deepStrictEqual(results, [
			{ labels: ['Zyzzyva Alpha'], menuBuilds: 1 },
			{ labels: ['Zyzzyva Alpha'], menuBuilds: 1 },
			{ labels: ['Zyzzyva Alpha', 'Zyzzyva Beta'], menuBuilds: 2 },
			{ labels: ['Zyzzyva Alpha', 'Zyzzyva Beta', 'Zyzzyva Gamma'], menuBuilds: 3 },
		]);
	});

	test('a reopened command palette keeps its picks when the previous session ends', async () => {
		const first = openPicker();
		await type(first.picker, '>zyzzyva');

		const second = openPicker();
		first.session.dispose();
		const results = [
			await type(second.picker, '>zyzzyva'),
			await type(second.picker, '>zyzzyv'),
		];

		assert.deepStrictEqual(results, [
			{ labels: ['Zyzzyva Alpha'], menuBuilds: 2 },
			{ labels: ['Zyzzyva Alpha'], menuBuilds: 2 },
		]);
	});
});
