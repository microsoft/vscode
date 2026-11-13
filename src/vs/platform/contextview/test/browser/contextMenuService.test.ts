/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
import { Action } from '../../../../base/common/actions.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IMenuService } from '../../../actions/common/actions.js';
import { MockContextKeyService, MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { TestNotificationService } from '../../../notification/test/common/testNotificationService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { ContextMenuService } from '../../browser/contextMenuService.js';
import { IContextViewDelegate, IContextViewService } from '../../browser/contextView.js';

suite('ContextMenuService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('emits visibility events only when a context menu is rendered', () => {
		const views: IContextViewDelegate[] = [];
		const contextViewService = upcastPartial<IContextViewService>({
			showContextView: delegate => {
				views.push(delegate);
				return { close: () => delegate.onHide?.() };
			},
		});
		const service = store.add(new ContextMenuService(
			NullTelemetryService,
			new TestNotificationService(),
			contextViewService,
			new MockKeybindingService(),
			new class extends mock<IMenuService>() { },
			new MockContextKeyService(),
		));
		let showCount = 0;
		let hideCount = 0;
		store.add(service.onDidShowContextMenu(() => showCount++));
		store.add(service.onDidHideContextMenu(() => hideCount++));

		service.showContextMenu({
			getAnchor: () => mainWindow.document.body,
			getActions: () => [],
		});
		const afterEmptyMenu = { showCount, hideCount, viewCount: views.length };
		const action = store.add(new Action('test', 'Test'));
		service.showContextMenu({
			getAnchor: () => mainWindow.document.body,
			getActions: () => [action],
		});
		const afterRenderedMenu = { showCount, hideCount, viewCount: views.length };
		views[0].onHide?.();

		assert.deepStrictEqual({
			afterEmptyMenu,
			afterRenderedMenu,
			afterHide: { showCount, hideCount },
		}, {
			afterEmptyMenu: { showCount: 0, hideCount: 0, viewCount: 0 },
			afterRenderedMenu: { showCount: 1, hideCount: 0, viewCount: 1 },
			afterHide: { showCount: 1, hideCount: 1 },
		});
	});
});
