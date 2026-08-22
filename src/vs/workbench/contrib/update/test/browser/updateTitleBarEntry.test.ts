/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isMacintosh, isWeb } from '../../../../../base/common/platform.js';
import { IHoverOptions, IHoverWidget } from '../../../../../base/browser/ui/hover/hover.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandEvent, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUpdateService, State, StateType } from '../../../../../platform/update/common/update.js';
import { InEditorZenModeContext } from '../../../../common/contextkeys.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { MockChatService } from '../../../chat/test/common/chatService/mockChatService.js';
import { UpdateTitleBarEntry } from '../../browser/updateTitleBarEntry.js';
import { UpdateTooltip } from '../../browser/updateTooltip.js';
import { UpdateGlobalActivityBadgeVisibleContext, UpdateTitleBarChatInProgressContext, UpdateTitleBarContext } from '../../common/update.js';

class TestCommandService extends mock<ICommandService>() {
	private readonly _onDidExecuteCommand = new Emitter<ICommandEvent>();
	override readonly onDidExecuteCommand = this._onDidExecuteCommand.event;

	fireDidExecuteCommand(commandId: string): void {
		this._onDidExecuteCommand.fire({ commandId, args: [] });
	}

	dispose(): void {
		this._onDidExecuteCommand.dispose();
	}
}

class TestHoverWidget implements IHoverWidget {
	isDisposed = false;

	dispose(): void {
		this.isDisposed = true;
	}
}

class TestHoverService extends mock<IHoverService>() {
	readonly showRequests: { readonly focus: boolean; readonly trapFocus: boolean }[] = [];

	override showInstantHover(options: IHoverOptions, focus?: boolean): IHoverWidget {
		this.showRequests.push({ focus: !!focus, trapFocus: !!options.trapFocus });
		return new TestHoverWidget();
	}
}

class TestContextKeyService extends MockContextKeyService {
	override contextMatchesRules(rules: ContextKeyExpression): boolean {
		return rules.evaluate({ getValue: key => this.getContextKeyValue(key) });
	}
}

suite('UpdateTitleBarEntry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Show or Focus Hover focuses the tooltip while Tab remains unhandled', () => {
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		const commandService = store.add(new TestCommandService());
		const hoverService = new TestHoverService();
		const action = store.add(new Action('workbench.actions.updateIndicator', 'Update'));
		const entry = store.add(new UpdateTitleBarEntry(
			action,
			{},
			new class extends mock<UpdateTooltip>() {
				override readonly domNode = mainWindow.document.createElement('div');
			},
			() => { },
			() => { },
			commandService,
			hoverService,
			new class extends mock<ITelemetryService>() { },
			new class extends mock<IUpdateService>() {
				override readonly onStateChange = Event.None;
				override readonly state = State.Uninitialized;
			},
			new MockChatService(),
		));
		entry.render(container);
		entry.focus();

		const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true });
		container.dispatchEvent(tabEvent);
		commandService.fireDidExecuteCommand('workbench.action.showHover');

		assert.deepStrictEqual({
			tabDefaultPrevented: tabEvent.defaultPrevented,
			hoverShowRequests: hoverService.showRequests,
		}, {
			tabDefaultPrevented: false,
			hoverShowRequests: [{ focus: true, trapFocus: true }],
		});
	});

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
		const items = MenuRegistry.getMenuItems(MenuId.TitleBarUpdate);
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
			executeCommand: async (id: string) => { executedCommand = id; },
			onDidExecuteCommand: Event.None,
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
		};

		const entry = store.add(instantiationService.createInstance(
			UpdateTitleBarEntry,
			action,
			{},
			fakeTooltip,
			() => { },
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
			executeCommand: async (id: string) => { executedCommand = id; },
			onDidExecuteCommand: Event.None,
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
		};

		store.add(instantiationService.createInstance(
			UpdateTitleBarEntry,
			action,
			{},
			fakeTooltip,
			() => { },
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

suite('UpdateGlobalActivityBadgeVisibleContext', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('hides the badge when the Update and Manage actions are adjacent', () => {
		const customMenuBarCanBeHidden = !isMacintosh || isWeb;
		const scenarios = [
			{ name: 'no update', updateVisible: false, menuBarVisibility: 'visible', activityBarLocation: 'top', expected: true },
			{ name: 'adjacent', updateVisible: true, menuBarVisibility: 'visible', activityBarLocation: 'top', expected: false },
			{ name: 'classic menu', updateVisible: true, menuBarVisibility: 'classic', activityBarLocation: 'top', expected: false },
			{ name: 'hidden menu', updateVisible: true, menuBarVisibility: 'hidden', activityBarLocation: 'top', expected: customMenuBarCanBeHidden },
			{ name: 'toggle menu', updateVisible: true, menuBarVisibility: 'toggle', activityBarLocation: 'top', expected: customMenuBarCanBeHidden },
			{ name: 'compact menu', updateVisible: true, menuBarVisibility: 'compact', activityBarLocation: 'top', expected: customMenuBarCanBeHidden },
			{ name: 'bottom activity bar', updateVisible: true, menuBarVisibility: 'visible', activityBarLocation: 'bottom', expected: true },
			{ name: 'chat in progress', updateVisible: true, menuBarVisibility: 'visible', activityBarLocation: 'top', chatInProgress: true, expected: true },
		];

		const actual = scenarios.map(scenario => {
			const contextKeyService = new TestContextKeyService();
			UpdateTitleBarContext.bindTo(contextKeyService).set(scenario.updateVisible);
			UpdateTitleBarChatInProgressContext.bindTo(contextKeyService).set(scenario.chatInProgress ?? false);
			InEditorZenModeContext.bindTo(contextKeyService);
			contextKeyService.createKey('config.window.menuBarVisibility', scenario.menuBarVisibility);
			contextKeyService.createKey('config.workbench.activityBar.location', scenario.activityBarLocation);

			return {
				name: scenario.name,
				visible: contextKeyService.contextMatchesRules(UpdateGlobalActivityBadgeVisibleContext),
			};
		});

		assert.deepStrictEqual(actual, scenarios.map(({ name, expected }) => ({ name, visible: expected })));
	});
});

suite('UpdateTooltip', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTooltip(): UpdateTooltip {
		const configurationService = new TestConfigurationService({ 'update.mode': 'default' });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		return store.add(new UpdateTooltip(
			new class extends mock<IClipboardService>() { },
			store.add(new TestCommandService()),
			configurationService,
			new TestHoverService(),
			new class extends mock<IProductService>() {
				override readonly nameLong = 'Code - OSS Dev';
				override readonly version = '1.134.0';
				override readonly commit = 'current';
			},
			new MockChatService(),
		));
	}

	test('removes hidden actions from the tab order', () => {
		const tooltip = createTooltip();

		tooltip.renderState(State.Ready({ version: 'next', productVersion: '1.135.0' }, false, false));

		assert.deepStrictEqual(
			Array.from(tooltip.domNode.querySelectorAll<HTMLElement>('button, [tabindex]')).map(element => ({
				className: element.className,
				display: element.style.display,
				tabIndex: element.tabIndex,
			})),
			[
				{ className: 'copy-version-button', display: '', tabIndex: 0 },
				{ className: 'copy-version-button', display: '', tabIndex: 0 },
				{ className: 'release-notes-button', display: '', tabIndex: 0 },
				{ className: 'action-button', display: 'none', tabIndex: -1 },
			],
		);
	});
});
