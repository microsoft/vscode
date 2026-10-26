/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../base/browser/dom.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ICommandService } from '../../../commands/common/commands.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { IContextMenuDelegate } from '../../../../base/browser/contextmenu.js';
import { IContextMenuMenuDelegate, IContextMenuService } from '../../../contextview/browser/contextView.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { IMenuItemHide, IMenuService, MenuId, MenuItemAction } from '../../common/actions.js';
import { IWorkbenchToolBarOptions, WorkbenchToolBar } from '../../browser/toolbar.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

class TestWorkbenchToolBar extends WorkbenchToolBar {
	async runAction(action: IAction): Promise<void> {
		await this.actionBar.actionRunner.run(action);
	}
}

suite('WorkbenchToolBar', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createToolBar(telemetryService: ITelemetryService, options: IWorkbenchToolBarOptions): TestWorkbenchToolBar {
		const toolBar = new TestWorkbenchToolBar(
			$('div'),
			options,
			new class extends mock<IMenuService>() { }(),
			new class extends mock<IContextKeyService>() { }(),
			new class extends mock<IContextMenuService>() {
				override showContextMenu(): void { }
			}(),
			new class extends mock<IKeybindingService>() {
				override lookupKeybinding() { return undefined; }
			}(),
			new class extends mock<ICommandService>() { }(),
			telemetryService
		);
		return disposables.add(toolBar);
	}

	test('logs telemetry before an action disposes the toolbar', async () => {
		const telemetryService = new TestTelemetryService();
		const toolBar = createToolBar(telemetryService, { telemetrySource: 'testToolBar' });
		let eventsDuringRun: readonly { readonly name: string; readonly data: unknown }[] = [];
		const selfDisposingAction = toAction({
			id: 'selfDisposing',
			label: 'selfDisposing',
			run: () => {
				eventsDuringRun = telemetryService.events.slice();
				toolBar.dispose();
			}
		});
		toolBar.setActions([selfDisposingAction]);

		await toolBar.runAction(selfDisposingAction);

		const expectedEvents = [{
			name: 'workbenchActionExecuted',
			data: { id: 'selfDisposing', from: 'testToolBar' }
		}];
		assert.deepStrictEqual({
			eventsDuringRun,
			eventsAfterRun: telemetryService.events
		}, {
			eventsDuringRun: expectedEvents,
			eventsAfterRun: expectedEvents
		});
	});

	suite('Reset Menu', () => {

		const resetMenuId = new MenuId('WorkbenchToolBarResetMenuTest');

		function createHide(state: { isHidden: boolean; isModifiedFromDefault: boolean }): IMenuItemHide {
			return {
				hide: toAction({ id: 'hide', label: 'Hide', run() { } }),
				toggle: toAction({ id: 'toggle', label: 'Toggle', checked: !state.isHidden, run() { } }),
				isHidden: state.isHidden,
				isModifiedFromDefault: state.isModifiedFromDefault
			};
		}

		function getContextMenuActionIds(items: readonly IMenuItemHide[]): { actionIds: string[]; resetCalls: (readonly MenuId[])[] } {
			let shownActions: readonly IAction[] = [];
			const resetCalls: (readonly MenuId[])[] = [];
			const contextKeyService = new class extends mock<IContextKeyService>() {
				override contextMatchesRules() { return true; }
			}();
			const toolBar = disposables.add(new TestWorkbenchToolBar(
				$('div'),
				{ resetMenu: resetMenuId },
				new class extends mock<IMenuService>() {
					override resetHiddenStates(ids?: readonly MenuId[]): void { resetCalls.push(ids!); }
				}(),
				contextKeyService,
				new class extends mock<IContextMenuService>() {
					override showContextMenu(delegate: IContextMenuDelegate | IContextMenuMenuDelegate): void { shownActions = delegate.getActions?.() ?? []; }
				}(),
				new class extends mock<IKeybindingService>() {
					override lookupKeybinding() { return undefined; }
				}(),
				new class extends mock<ICommandService>() { }(),
				new TestTelemetryService()
			));
			const actions = items.map((hide, i) => new MenuItemAction({ id: `cmd${i}`, title: `Command ${i}` }, undefined, undefined, hide, undefined, contextKeyService, new class extends mock<ICommandService>() { }()));
			toolBar.setActions(actions);
			const target = toolBar.getElement().querySelector('.action-item');
			assert.ok(target);
			target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			const resetAction = shownActions.find(a => a.id === 'resetThisMenu');
			resetAction?.run();
			return { actionIds: shownActions.map(a => a.id), resetCalls };
		}

		test('shows Reset Menu when a hidden-by-default item is made visible', () => {
			const result = getContextMenuActionIds([createHide({ isHidden: false, isModifiedFromDefault: true })]);
			assert.deepStrictEqual({ hasReset: result.actionIds.includes('resetThisMenu'), resetCalls: result.resetCalls }, { hasReset: true, resetCalls: [[resetMenuId]] });
		});

		test('shows Reset Menu when a visible-by-default item is hidden', () => {
			const result = getContextMenuActionIds([
				createHide({ isHidden: true, isModifiedFromDefault: true }),
				createHide({ isHidden: false, isModifiedFromDefault: false })
			]);
			assert.strictEqual(result.actionIds.includes('resetThisMenu'), true);
		});

		test('does not show Reset Menu when hidden items are hidden by default', () => {
			const result = getContextMenuActionIds([
				createHide({ isHidden: true, isModifiedFromDefault: false }),
				createHide({ isHidden: false, isModifiedFromDefault: false })
			]);
			assert.strictEqual(result.actionIds.includes('resetThisMenu'), false);
		});
	});
});
