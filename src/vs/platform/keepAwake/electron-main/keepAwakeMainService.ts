/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IKeepAwakeBlocker, IKeepAwakeState, KeepAwake, PREVENT_SLEEP_ENABLED, PREVENT_SLEEP_GRACE_PERIOD } from '../common/keepAwake.js';

export const IKeepAwakeMainService = createDecorator<IKeepAwakeMainService>('keepAwakeMainService');

export interface IKeepAwakeMainService {
	readonly _serviceBrand: undefined;
	readonly state: IKeepAwakeState;
	readonly onDidChangeState: Event<IKeepAwakeState>;
	setClaim(source: string, busy: boolean): void;
	deleteClaim(source: string): void;
}

export class KeepAwakeMainService extends Disposable implements IKeepAwakeMainService {
	declare readonly _serviceBrand: undefined;
	private readonly policy: KeepAwake;
	private readonly windows = this._register(new DisposableMap<number, DisposableStore>());
	readonly onDidChangeState: Event<IKeepAwakeState>;
	get state(): IKeepAwakeState { return this.policy.state; }

	constructor(
		blocker: IKeepAwakeBlocker,
		@IConfigurationService configurationService: IConfigurationService,
		@IWindowsMainService windowsMainService: IWindowsMainService,
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@ILogService logService: ILogService,
	) {
		super();
		this.policy = this._register(new KeepAwake(blocker, error => logService.error('[KeepAwake] Failed to prevent sleep', error)));
		this.onDidChangeState = this.policy.onDidChangeState;
		let active = false;
		this._register(this.onDidChangeState(state => {
			if (active !== state.active) {
				logService.info(`[KeepAwake] ${state.active ? 'Acquired' : 'Released'} sleep prevention`, state.busySources, state.inGrace ? 'grace period' : '');
				active = state.active;
			}
		}));
		const configure = () => {
			const grace = configurationService.getValue<number>(PREVENT_SLEEP_GRACE_PERIOD);
			this.policy.configure(configurationService.getValue(PREVENT_SLEEP_ENABLED) === true, ([0, 5, 10, 15, 30].includes(grace) ? grace : 10) * 60_000);
		};
		configure();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(PREVENT_SLEEP_ENABLED) || e.affectsConfiguration(PREVENT_SLEEP_GRACE_PERIOD)) {
				configure();
			}
		}));
		const watchWindow = (window: ICodeWindow) => {
			const store = new DisposableStore();
			this.windows.set(window.id, store);
			store.add(window.onDidClose(() => {
				this.deleteClaim(`window:${window.id}`);
				this.windows.deleteAndDispose(window.id);
			}));
			if (window.win) {
				store.add(Event.fromNodeEventEmitter(window.win.webContents, 'render-process-gone')(() => this.deleteClaim(`window:${window.id}`)));
			}
		};
		for (const window of windowsMainService.getWindows()) {
			watchWindow(window);
		}
		this._register(windowsMainService.onDidOpenWindow(watchWindow));
		this._register(windowsMainService.onDidDestroyWindow(window => {
			this.deleteClaim(`window:${window.id}`);
			this.windows.deleteAndDispose(window.id);
		}));
		this._register(lifecycleMainService.onWillLoadWindow(e => this.deleteClaim(`window:${e.window.id}`)));
		this._register(lifecycleMainService.onWillShutdown(() => this.dispose()));
	}

	setClaim(source: string, busy: boolean): void { this.policy.setClaim(source, busy); }
	deleteClaim(source: string): void { this.policy.deleteClaim(source); }
}
