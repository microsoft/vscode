/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../base/browser/dom.js';
import { IAction, Separator, toAction } from '../../../../base/common/actions.js';
import { IContextMenuDelegate } from '../../../../base/browser/contextmenu.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ICommandService } from '../../../commands/common/commands.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../contextview/browser/contextView.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { IMenuItemHide, IMenuService, MenuItemAction } from '../../common/actions.js';
import { HiddenItemStrategy, IWorkbenchToolBarOptions, WorkbenchToolBar } from '../../browser/toolbar.js';

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

	function createToolBar(telemetryService: ITelemetryService, options: IWorkbenchToolBarOptions, onContextMenu?: (delegate: IContextMenuDelegate) => void): TestWorkbenchToolBar {
		const toolBar = new TestWorkbenchToolBar(
			$('div'),
			options,
			new class extends mock<IMenuService>() { }(),
			new class extends mock<IContextKeyService>() { }(),
			new class extends mock<IContextMenuService>() {
				override showContextMenu(delegate: IContextMenuDelegate): void { onContextMenu?.(delegate); }
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

	test('items that always show cannot be hidden, and list the items that can be', () => {
		const hidden = new Set(['optional2']);
		const createAction = (id: string) => {
			const hideActions: IMenuItemHide = {
				get isHidden() { return hidden.has(id); },
				hide: toAction({ id: `hide/${id}`, label: `Hide ${id}`, run: () => { hidden.add(id); } }),
				toggle: toAction({ id: `toggle/${id}`, label: id, checked: !hidden.has(id), run: () => { } }),
			};
			return new MenuItemAction({ id, title: id }, undefined, undefined, hideActions, undefined, new class extends mock<IContextKeyService>() { }(), new class extends mock<ICommandService>() { }());
		};
		let contextMenuActions: readonly string[] = [];
		const toolBar = createToolBar(new TestTelemetryService(), { hiddenItemStrategy: HiddenItemStrategy.Ignore, alwaysShownItems: ['fixed'] }, delegate => {
			contextMenuActions = delegate.getActions().map(action => action instanceof Separator ? '---' : `${action.label}${action.checked ? ' (checked)' : ''}`);
		});
		toolBar.setActions([createAction('fixed'), createAction('optional1'), createAction('optional2')]);
		const shown = [0, 1].map(index => toolBar.getItemAction(index)?.id);

		const rightClick = (index: number) => {
			toolBar.getItemElement(index)?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
			return contextMenuActions;
		};

		assert.deepStrictEqual({ shown, onFixed: rightClick(0), onOptional: rightClick(1) }, {
			shown: ['fixed', 'optional1'],
			onFixed: ['Configure Keybinding', '---', 'optional1 (checked)', 'optional2'],
			// The last optional item can be hidden, as the item that always shows remains.
			onOptional: ['Configure Keybinding', 'Hide optional1', '---', 'optional1 (checked)', 'optional2'],
		});
	});
});
