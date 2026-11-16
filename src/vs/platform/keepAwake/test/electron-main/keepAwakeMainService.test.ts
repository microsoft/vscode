/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import type { BrowserWindow, WebContents } from 'electron';
import { Emitter, Event } from '../../../../base/common/event.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { ILifecycleMainService } from '../../../lifecycle/electron-main/lifecycleMainService.js';
import { NullLogService } from '../../../log/common/log.js';
import { ICodeWindow, LoadReason } from '../../../window/electron-main/window.js';
import { IWindowsMainService } from '../../../windows/electron-main/windows.js';
import { PREVENT_SLEEP_ENABLED, PREVENT_SLEEP_GRACE_PERIOD } from '../../common/keepAwake.js';
import { KeepAwakeMainService } from '../../electron-main/keepAwakeMainService.js';

suite('KeepAwakeMainService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const reason of ['close', 'destroy', 'load', 'crash']) {
		test(`clears only the affected window on ${reason}`, () => {
			const close = store.add(new Emitter<void>());
			const destroy = store.add(new Emitter<ICodeWindow>());
			const load = store.add(new Emitter<EventType<ILifecycleMainService['onWillLoadWindow']>>());
			const open = store.add(new Emitter<ICodeWindow>());
			const webContents = Object.assign(new EventEmitter(), upcastPartial<WebContents>({}));
			const window = upcastPartial<ICodeWindow>({
				id: 1, onDidClose: close.event,
				win: upcastPartial<BrowserWindow>({ webContents }),
			});
			const calls: string[] = [];
			const service = store.add(new KeepAwakeMainService(
				{ start: () => { calls.push('start'); return 0; }, stop: () => { calls.push('stop'); } },
				new TestConfigurationService({ [PREVENT_SLEEP_ENABLED]: true, [PREVENT_SLEEP_GRACE_PERIOD]: 0 }),
				upcastPartial<IWindowsMainService>({ getWindows: () => [], onDidOpenWindow: open.event, onDidDestroyWindow: destroy.event }),
				upcastPartial<ILifecycleMainService>({ onWillLoadWindow: load.event, onWillShutdown: Event.None }),
				new NullLogService(),
			));
			open.fire(window);
			service.setClaim('window:1', true);
			service.setClaim('window:2', true);
			switch (reason) {
				case 'close': close.fire(); break;
				case 'destroy': destroy.fire(window); break;
				case 'load': load.fire({ window, workspace: undefined, reason: LoadReason.RELOAD }); break;
				case 'crash': webContents.emit('render-process-gone'); break;
			}
			assert.deepStrictEqual(service.state.busySources, ['window:2']);
			service.deleteClaim('window:2');
			assert.deepStrictEqual(calls, ['start', 'stop']);
		});

		type EventType<T> = T extends Event<infer E> ? E : never;
	}
});
