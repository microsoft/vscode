/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ILanguageRuntimeMetadata, IRuntimeManager } from '../../../languageRuntime/common/languageRuntimeService.js';
import { IRuntimeAutoStartEvent, IRuntimeStartupService, ISessionRestoreFailedEvent, SerializedSessionMetadata } from '../../common/runtimeStartupService.js';

export class TestRuntimeStartupService implements IRuntimeStartupService {
	declare readonly _serviceBrand: undefined;

	private readonly _onWillAutoStartRuntimeEmitter = new Emitter<IRuntimeAutoStartEvent>();
	private readonly _onSessionRestoreFailureEmitter = new Emitter<ISessionRestoreFailedEvent>();

	private _preferredRuntimes = new Map<string, ILanguageRuntimeMetadata>();
	private _affiliatedRuntimes = new Map<string, ILanguageRuntimeMetadata>();
	private _restoredSessions: SerializedSessionMetadata[] = [];
	private _runtimeManagers: IRuntimeManager[] = [];

	constructor() { }

	public get onWillAutoStartRuntime(): Event<IRuntimeAutoStartEvent> {
		return this._onWillAutoStartRuntimeEmitter.event;
	}

	public get onSessionRestoreFailure(): Event<ISessionRestoreFailedEvent> {
		return this._onSessionRestoreFailureEmitter.event;
	}

	public getPreferredRuntime(languageId: string): ILanguageRuntimeMetadata | undefined {
		return this._preferredRuntimes.get(languageId);
	}

	public setPreferredRuntime(languageId: string, runtime: ILanguageRuntimeMetadata): void {
		this._preferredRuntimes.set(languageId, runtime);
	}

	public hasAffiliatedRuntime(): boolean {
		return this._affiliatedRuntimes.size > 0;
	}

	public getAffiliatedRuntimeMetadata(languageId: string): ILanguageRuntimeMetadata | undefined {
		return this._affiliatedRuntimes.get(languageId);
	}

	public getAffiliatedRuntimes(): Array<ILanguageRuntimeMetadata> {
		return Array.from(this._affiliatedRuntimes.values());
	}

	public setAffiliatedRuntime(languageId: string, runtime: ILanguageRuntimeMetadata): void {
		this._affiliatedRuntimes.set(languageId, runtime);
	}

	public clearAffiliatedRuntime(languageId: string): void {
		this._affiliatedRuntimes.delete(languageId);
	}

	public fireWillAutoStartRuntime(runtime: ILanguageRuntimeMetadata, newSession: boolean): void {
		this._onWillAutoStartRuntimeEmitter.fire({ runtime, newSession });
	}

	public completeDiscovery(id: number): void {
	}

	public async rediscoverAllRuntimes() {
	}

	public async getRestoredSessions(): Promise<SerializedSessionMetadata[]> {
		return this._restoredSessions;
	}

	public setRestoredSessions(sessions: SerializedSessionMetadata[]): void {
		this._restoredSessions = sessions;
	}

	public fireSessionRestoreFailure(sessionId: string, error: Error): void {
		this._onSessionRestoreFailureEmitter.fire({ sessionId, error });
	}

	public registerRuntimeManager(manager: IRuntimeManager): IDisposable {
		this._runtimeManagers.push(manager);
		return {
			dispose: () => {
				const index = this._runtimeManagers.indexOf(manager);
				if (index !== -1) {
					this._runtimeManagers.splice(index, 1);
				}
			}
		};
	}

	public getRegisteredRuntimeManagers(): IRuntimeManager[] {
		return [...this._runtimeManagers];
	}
}
