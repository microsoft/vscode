/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from '../../../base/common/async.js';
import { Event, Emitter } from '../../../base/common/event.js';
import { IAuxiliaryWindow } from '../../auxiliaryWindow/electron-main/auxiliaryWindow.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { ILifecycleMainService, IRelaunchHandler, LifecycleMainPhase, ShutdownEvent, ShutdownReason } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { IStateService } from '../../state/node/state.js';
import { ICodeWindow, UnloadReason } from '../../window/electron-main/window.js';

export class TestLifecycleMainService implements ILifecycleMainService {

	_serviceBrand: undefined;

	onBeforeShutdown = Event.None;

	private readonly _onWillShutdown = new Emitter<ShutdownEvent>();
	readonly onWillShutdown = this._onWillShutdown.event;

	async fireOnWillShutdown(): Promise<void> {
		const joiners: Promise<void>[] = [];

		this._onWillShutdown.fire({
			reason: ShutdownReason.QUIT,
			join(id, promise) {
				joiners.push(promise);
			}
		});

		await Promises.settled(joiners);
	}

	onWillLoadWindow = Event.None;
	onBeforeCloseWindow = Event.None;

	wasRestarted = false;
	quitRequested = false;

	phase = LifecycleMainPhase.Ready;

	registerWindow(window: ICodeWindow): void { }
	registerAuxWindow(auxWindow: IAuxiliaryWindow): void { }
	async reload(window: ICodeWindow, cli?: NativeParsedArgs): Promise<void> { }
	async unload(window: ICodeWindow, reason: UnloadReason): Promise<boolean> { return true; }
	setRelaunchHandler(handler: IRelaunchHandler): void { }
	async relaunch(options?: { addArgs?: string[] | undefined; removeArgs?: string[] | undefined }): Promise<void> { }
	async quit(willRestart?: boolean): Promise<boolean> { return true; }
	async kill(code?: number): Promise<void> { }
	async when(phase: LifecycleMainPhase): Promise<void> { }
}

export class InMemoryTestStateMainService implements IStateService {

	_serviceBrand: undefined;

	private readonly data = new Map<string, object | string | number | boolean | undefined | null>();

	setItem(key: string, data?: object | string | number | boolean | undefined | null): void {
		this.data.set(key, data);
	}

	setItems(items: readonly { key: string; data?: object | string | number | boolean | undefined | null }[]): void {
		for (const { key, data } of items) {
			this.data.set(key, data);
		}
	}

	getItem<T>(key: string): T | undefined {
		return this.data.get(key) as T | undefined;
	}

	removeItem(key: string): void {
		this.data.delete(key);
	}

	async close(): Promise<void> { }
}
