/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { ILifecycleMainService, LifecycleMainPhase, ShutdownEvent, ShutdownReason } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { IStateMainService } from 'vs/platform/state/electron-main/state';
import { ICodeWindow, UnloadReason } from 'vs/platform/window/electron-main/window';

export class TestLifecycleMainService implements ILifecycleMainService {

	_serviceBrand: undefined;

	onBeforeShutdown = Event.None;

	private readonly _onWillShutdown = new Emitter<ShutdownEvent>();
	readonly onWillShutdown = this._onWillShutdown.event;

	async fireOnWillShutdown(): Promise<void> {
		const joiners: Promise<void>[] = [];

		this._onWillShutdown.fire({
			reason: ShutdownReason.QUIT,
			join(promise) {
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
	async reload(window: ICodeWindow, cli?: NativeParsedArgs): Promise<void> { }
	async unload(window: ICodeWindow, reason: UnloadReason): Promise<boolean> { return true; }
	async relaunch(options?: { addArgs?: string[] | undefined; removeArgs?: string[] | undefined }): Promise<void> { }
	async quit(willRestart?: boolean): Promise<boolean> { return true; }
	async kill(code?: number): Promise<void> { }
	async when(phase: LifecycleMainPhase): Promise<void> { }
}

export class InMemoryTestStateMainService implements IStateMainService {

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
