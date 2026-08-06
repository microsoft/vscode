/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { IAction } from '../../../../../base/common/actions.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUpdateService, State, StateType } from '../../../../../platform/update/common/update.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { MockChatService } from '../../../chat/test/common/chatService/mockChatService.js';
import type { UpdateTitleBarEntry as UpdateTitleBarEntryType } from '../../browser/updateTitleBarEntry.js';
import type { UpdateTooltip } from '../../browser/updateTooltip.js';

suite('UpdateTitleBarEntry', () => {
	// Import after suite start so module singletons aren't tracked as leaks.
	let UpdateTitleBarEntry: typeof UpdateTitleBarEntryType;

	suiteSetup(async () => {
		const titleBar = await import('../../browser/updateTitleBarEntry.js');
		UpdateTitleBarEntry = titleBar.UpdateTitleBarEntry;
	});

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createReadyState(): State {
		return { type: StateType.Ready, update: { version: 'abc1234', productVersion: '1.99.0' }, explicit: true, overwrite: false };
	}

	function createUpdateService(state: State): IUpdateService {
		const onStateChange = new Emitter<State>();
		store.add(onStateChange);
		return {
			_serviceBrand: undefined,
			onStateChange: onStateChange.event,
			state,
			checkForUpdates: async () => { },
			downloadUpdate: async () => { },
			applyUpdate: async () => { },
			quitAndInstall: async () => { },
			isLatestVersion: async () => true,
			_applySpecificUpdate: async () => { },
			setInternalOrg: async () => { },
		};
	}

	test('editor Update when-clause includes chat-in-progress gate', () => {
		const items = MenuRegistry.getMenuItems(MenuId.TitleBarAdjacentCenter);
		const updateItem = items.find(item => !('submenu' in item) && item.command.id === 'workbench.actions.updateIndicator');
		assert.ok(updateItem && !('submenu' in updateItem));
		assert.ok(updateItem.when?.serialize().includes('updateTitleBarChatRequestInProgress'));
	});

	test('Ready click shows tooltip instead of restarting while chat is in progress', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const chatService = new MockChatService();
		chatService.requestInProgressObs = observableValue('requestInProgress', true);

		let executedCommand: string | undefined;
		let tooltipShown = false;
		const fakeTooltip = {
			domNode: document.createElement('div'),
			renderState: () => { },
		} as unknown as UpdateTooltip;

		instantiationService.stub(ICommandService, {
			executeCommand: async (id: string) => { executedCommand = id; }
		} as Partial<ICommandService>);
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IUpdateService, createUpdateService(createReadyState()));
		instantiationService.stub(IChatService, chatService);

		const action: IAction = {
			id: 'workbench.actions.updateIndicator',
			label: 'Update',
			tooltip: '',
			class: undefined,
			enabled: true,
			checked: false,
			run: async () => { },
			dispose: () => { },
		};

		const entry = store.add(instantiationService.createInstance(
			UpdateTitleBarEntry,
			action,
			{},
			fakeTooltip,
			() => { },
		));

		const originalShowTooltip = entry.showTooltip.bind(entry);
		entry.showTooltip = (focus?: boolean) => {
			tooltipShown = true;
			originalShowTooltip(focus);
		};

		await action.run();

		assert.strictEqual(executedCommand, undefined);
		assert.strictEqual(tooltipShown, true);
	});

	test('Ready click restarts when chat is idle', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const chatService = new MockChatService();
		chatService.requestInProgressObs = observableValue('requestInProgress', false);

		let executedCommand: string | undefined;
		const fakeTooltip = {
			domNode: document.createElement('div'),
			renderState: () => { },
		} as unknown as UpdateTooltip;

		instantiationService.stub(ICommandService, {
			executeCommand: async (id: string) => { executedCommand = id; }
		} as Partial<ICommandService>);
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IUpdateService, createUpdateService(createReadyState()));
		instantiationService.stub(IChatService, chatService);

		const action: IAction = {
			id: 'workbench.actions.updateIndicator',
			label: 'Update',
			tooltip: '',
			class: undefined,
			enabled: true,
			checked: false,
			run: async () => { },
			dispose: () => { },
		};

		store.add(instantiationService.createInstance(
			UpdateTitleBarEntry,
			action,
			{},
			fakeTooltip,
			() => { },
		));

		await action.run();
		assert.strictEqual(executedCommand, 'update.restart');
	});

	test('restart menu items stay unavailable while chat is in progress', () => {
		const key = 'updateTitleBarChatRequestInProgress';
		const ready = 'updateState == ready';
		const restartCommandIds = ['update.restart', 'update.restartToUpdate'];

		for (const menuId of [MenuId.GlobalActivity, MenuId.CommandPalette]) {
			for (const item of MenuRegistry.getMenuItems(menuId)) {
				if ('submenu' in item || !restartCommandIds.includes(item.command.id)) {
					continue;
				}
				assert.ok(item.when);
				assert.ok(item.when.serialize().includes(ready));
				assert.ok(item.when.serialize().includes(key), `${item.command.id} must be hidden during chat`);
			}
		}
	});
});
