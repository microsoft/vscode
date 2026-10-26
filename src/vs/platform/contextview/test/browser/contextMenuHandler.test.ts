/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getActiveElement } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ContextMenuHandler } from '../../browser/contextMenuHandler.js';
import { IContextViewService } from '../../browser/contextView.js';
import { MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { TestNotificationService } from '../../../notification/test/common/testNotificationService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';

suite('ContextMenuHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const [selection, expected] of [
		[undefined, undefined],
		[false, undefined],
		[true, 'First'],
		[0, 'First'],
		[2, 'Second'],
		[-1, undefined],
		[NaN, undefined],
		[Infinity, undefined],
		[-Infinity, undefined],
		[0.5, undefined],
		[3, undefined],
	] as const) {
		test(`normalizes HTML menu selection ${selection} to ${expected}`, () => {
			const container = mainWindow.document.body.appendChild($('div'));
			store.add(toDisposable(() => container.remove()));
			const contextViewService = upcastPartial<IContextViewService>({
				showContextView: delegate => {
					store.add(delegate.render(container));
					delegate.focus?.();
					return { close: () => delegate.onHide?.() };
				},
			});
			const handler = new ContextMenuHandler(contextViewService, NullTelemetryService, new TestNotificationService(), new MockKeybindingService());
			const actions = [store.add(new Action('first', 'First')), new Separator(), store.add(new Action('second', 'Second'))];
			handler.showContextMenu({
				getAnchor: () => container,
				getActions: () => actions,
				autoSelectItem: selection,
			});

			assert.strictEqual(getActiveElement()?.closest('.action-item')?.textContent, expected);
		});
	}
});
