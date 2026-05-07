/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { IPCServer, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentNetworkFilterService } from '../../networkFilter/common/networkFilterService.js';
import { BrowserViewGroupRemoteService } from './browserViewGroupRemoteService.js';
import { PlaywrightService } from './playwrightService.js';

/**
 * IPC channel for the Playwright service.
 *
 * Each connected window gets its own {@link PlaywrightService},
 * keyed by the opaque IPC connection context. The client sends an
 * `__initialize` call with its numeric window ID before any other
 * method calls, which eagerly creates the instance. When a window
 * disconnects the instance is automatically disposed.
 */
export class PlaywrightChannel extends Disposable implements IServerChannel<string> {

	private readonly _instances = this._register(new DisposableMap<string, PlaywrightService>());
	private readonly browserViewGroupRemoteService: BrowserViewGroupRemoteService;

	constructor(
		ipcServer: IPCServer<string>,
		mainProcessService: IMainProcessService,
		private readonly logService: ILogService,
		private readonly agentNetworkFilterService: IAgentNetworkFilterService,
	) {
		super();
		this.browserViewGroupRemoteService = new BrowserViewGroupRemoteService(mainProcessService);
		this._register(ipcServer.onDidRemoveConnection(c => {
			this._instances.deleteAndDispose(c.ctx);
		}));
	}

	listen<T>(ctx: string, event: string): Event<T> {
		const instance = this._instances.get(ctx);
		if (!instance) {
			throw new Error(`Window not initialized for context: ${ctx}`);
		}
		const source = (instance as unknown as Record<string, Event<unknown>>)[event];
		if (typeof source !== 'function') {
			throw new Error(`Event not found: ${event}`);
		}
		return source as Event<T>;
	}

	call<T>(ctx: string, command: string, arg?: unknown): Promise<T> {
		// Handle the one-time initialization call that creates the instance
		if (command === '__initialize') {
			if (typeof arg !== 'number') {
				throw new Error(`Invalid argument for __initialize: expected window ID as number, got ${typeof arg}`);
			}
			if (!this._instances.has(ctx)) {
				const windowId = arg as number;
				this._instances.set(ctx, new PlaywrightService(windowId, this.browserViewGroupRemoteService, this.logService, this.agentNetworkFilterService));
			}
			return Promise.resolve(undefined as T);
		}

		const instance = this._instances.get(ctx);
		if (!instance) {
			throw new Error(`Window not initialized for context: ${ctx}`);
		}

		const target = (instance as unknown as Record<string, unknown>)[command];
		if (typeof target !== 'function') {
			throw new Error(`Method not found: ${command}`);
		}

		const methodArgs = Array.isArray(arg) ? arg : [];
		let res = target.apply(instance, methodArgs);
		if (!(res instanceof Promise)) {
			res = Promise.resolve(res);
		}
		return res;
	}
}
