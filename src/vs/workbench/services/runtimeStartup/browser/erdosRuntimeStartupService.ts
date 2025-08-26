/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILanguageRuntimeMetadata, IRuntimeManager } from '../../languageRuntime/common/languageRuntimeService.js';
import { IRuntimeStartupService, ISessionRestoreFailedEvent, SerializedSessionMetadata, IRuntimeAutoStartEvent } from '../common/runtimeStartupService.js';

/**
 * Simple stub implementation of IRuntimeStartupService for Erdos development.
 * This provides minimal functionality to satisfy the ErdosConsoleService dependencies.
 */
export class ErdosRuntimeStartupService extends Disposable implements IRuntimeStartupService {
	declare readonly _serviceBrand: undefined;
	
	private readonly _onSessionRestoreFailure = this._register(new Emitter<ISessionRestoreFailedEvent>());
	readonly onSessionRestoreFailure: Event<ISessionRestoreFailedEvent> = this._onSessionRestoreFailure.event;

	private readonly _onWillAutoStartRuntime = this._register(new Emitter<IRuntimeAutoStartEvent>());
	readonly onWillAutoStartRuntime: Event<IRuntimeAutoStartEvent> = this._onWillAutoStartRuntime.event;

	/**
	 * Returns an empty array of restored sessions for now.
	 */
	async getRestoredSessions(): Promise<SerializedSessionMetadata[]> {
		return [];
	}

	/**
	 * Returns undefined (no preferred runtime) for now.
	 */
	getPreferredRuntime(languageId: string): ILanguageRuntimeMetadata | undefined {
		return undefined;
	}

	/**
	 * Returns an empty array of available runtimes for now.
	 */
	getAvailableRuntimes(): Promise<ILanguageRuntimeMetadata[]> {
		return Promise.resolve([]);
	}

	/**
	 * No-op implementation for session restoration.
	 */
	async restoreSession(session: SerializedSessionMetadata): Promise<void> {
		// No-op for stub implementation
	}

	/**
	 * No-op implementation for session serialization.
	 */
	async serializeSession(sessionId: string): Promise<SerializedSessionMetadata | undefined> {
		return undefined;
	}

	/**
	 * Returns false (no affiliated runtime) for now.
	 */
	hasAffiliatedRuntime(): boolean {
		return false;
	}

	/**
	 * Returns undefined (no affiliated runtime metadata) for now.
	 */
	getAffiliatedRuntimeMetadata(languageId: string): ILanguageRuntimeMetadata | undefined {
		return undefined;
	}

	/**
	 * Returns an empty array of affiliated runtimes for now.
	 */
	getAffiliatedRuntimes(): Array<ILanguageRuntimeMetadata> {
		return [];
	}

	/**
	 * No-op implementation for clearing affiliated runtime.
	 */
	clearAffiliatedRuntime(languageId: string): void {
		// No-op for stub implementation
	}

	/**
	 * No-op implementation for completing discovery.
	 */
	completeDiscovery(id: number): void {
		// No-op for stub implementation
	}

	/**
	 * No-op implementation for rediscovering all runtimes.
	 */
	async rediscoverAllRuntimes(): Promise<void> {
		// No-op for stub implementation
	}

	/**
	 * No-op implementation for registering runtime manager.
	 */
	registerRuntimeManager(manager: IRuntimeManager): IDisposable {
		return Disposable.None;
	}
}

// Register the service as a singleton
registerSingleton(IRuntimeStartupService, ErdosRuntimeStartupService, InstantiationType.Delayed);
