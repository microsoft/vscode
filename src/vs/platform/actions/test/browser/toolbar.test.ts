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
import { IContextMenuService } from '../../../contextview/browser/contextView.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { IMenuService } from '../../common/actions.js';
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
});
