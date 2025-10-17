/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITerminalChatService, ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { PromptInputState } from '../../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js';

/**
 * Used to manage chat tool invocations and the underlying terminal instances they create/use.
 */
export class TerminalChatService extends Disposable implements ITerminalChatService {
	declare _serviceBrand: undefined;

	private static readonly _storageKey = 'terminalChat.toolSessionMappings';

	private readonly _terminalInstancesByToolSessionId = new Map<string, ITerminalInstance>();
	private readonly _terminalInstanceListenersByToolSessionId = this._register(new DisposableMap<string, IDisposable>());
	private readonly _onDidRegisterTerminalInstanceForToolSession = new Emitter<ITerminalInstance>();
	readonly onDidRegisterTerminalInstanceWithToolSession: Event<ITerminalInstance> = this._onDidRegisterTerminalInstanceForToolSession.event;

	/**
	 * Pending mappings restored from storage that have not yet been matched to a live terminal
	 * instance (we match by persistentProcessId when it becomes available after reconnection).
	 * toolSessionId -> persistentProcessId
	 */
	private readonly _pendingRestoredMappings = new Map<string, number>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService
	) {
		super();

		this._restoreFromStorage();
		this._register(this._lifecycleService.onBeforeShutdown(async e => {
			// Show all hidden terminals before shutdown so they are restored
			for (const [toolSessionId, instance] of this._terminalInstancesByToolSessionId) {
				if (this.isBackgroundTerminal(toolSessionId) && (instance.capabilities.get(TerminalCapability.CommandDetection)?.promptInputModel.state === PromptInputState.Execute || instance.hasChildProcesses)) {
					await this._terminalService.showBackgroundTerminal(instance, true, true);
				}
			}
		}));
	}

	registerTerminalInstanceWithToolSession(terminalToolSessionId: string | undefined, instance: ITerminalInstance): void {
		if (!terminalToolSessionId) {
			this._logService.warn('Attempted to register a terminal instance with an undefined tool session ID');
			return;
		}
		this._terminalInstancesByToolSessionId.set(terminalToolSessionId, instance);
		this._onDidRegisterTerminalInstanceForToolSession.fire(instance);
		this._terminalInstanceListenersByToolSessionId.set(terminalToolSessionId, instance.onDisposed(() => {
			this._terminalInstancesByToolSessionId.delete(terminalToolSessionId);
			this._terminalInstanceListenersByToolSessionId.deleteAndDispose(terminalToolSessionId);
			this._persistToStorage();
		}));

		if (typeof instance.persistentProcessId === 'number') {
			this._persistToStorage();
		}
	}

	getTerminalInstanceByToolSessionId(terminalToolSessionId: string | undefined): ITerminalInstance | undefined {
		if (!terminalToolSessionId) {
			return undefined;
		}
		if (this._pendingRestoredMappings.has(terminalToolSessionId)) {
			const instance = this._terminalService.instances.find(i => i.persistentProcessId === this._pendingRestoredMappings.get(terminalToolSessionId));
			if (instance) {
				this._tryAdoptRestoredMapping(instance);
				return instance;
			}
		}
		return this._terminalInstancesByToolSessionId.get(terminalToolSessionId);
	}

	isBackgroundTerminal(terminalToolSessionId: string | undefined): boolean {
		if (!terminalToolSessionId) {
			return false;
		}
		const instance = this._terminalInstancesByToolSessionId.get(terminalToolSessionId);
		if (!instance) {
			return false;
		}
		return this._terminalService.instances.includes(instance) && !this._terminalService.foregroundInstances.includes(instance);
	}

	private _restoreFromStorage(): void {
		try {
			const raw = this._storageService.get(TerminalChatService._storageKey, StorageScope.WORKSPACE);
			if (!raw) {
				return;
			}
			const parsed: [string, number][] = JSON.parse(raw);
			for (const [toolSessionId, persistentProcessId] of parsed) {
				if (typeof toolSessionId === 'string' && typeof persistentProcessId === 'number') {
					this._pendingRestoredMappings.set(toolSessionId, persistentProcessId);
				}
			}
		} catch (err) {
			this._logService.warn('Failed to restore terminal chat tool session mappings', err);
		}
	}

	private _tryAdoptRestoredMapping(instance: ITerminalInstance): void {
		if (this._pendingRestoredMappings.size === 0) {
			return;
		}
		if (typeof instance.persistentProcessId !== 'number') {
			return;
		}
		for (const [toolSessionId, persistentProcessId] of this._pendingRestoredMappings) {
			if (persistentProcessId === instance.persistentProcessId) {
				this._terminalInstancesByToolSessionId.set(toolSessionId, instance);
				this._onDidRegisterTerminalInstanceForToolSession.fire(instance);
				this._terminalInstanceListenersByToolSessionId.set(toolSessionId, instance.onDisposed(() => {
					this._terminalInstancesByToolSessionId.delete(toolSessionId);
					this._terminalInstanceListenersByToolSessionId.deleteAndDispose(toolSessionId);
					this._persistToStorage();
				}));
				this._pendingRestoredMappings.delete(toolSessionId);
				this._persistToStorage();
				break;
			}
		}
	}

	private _persistToStorage(): void {
		try {
			const entries: [string, number][] = [];
			for (const [toolSessionId, instance] of this._terminalInstancesByToolSessionId.entries()) {
				if (typeof instance.persistentProcessId === 'number' && instance.shouldPersist) {
					entries.push([toolSessionId, instance.persistentProcessId]);
				}
			}
			if (entries.length > 0) {
				this._storageService.store(TerminalChatService._storageKey, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			} else {
				this._storageService.remove(TerminalChatService._storageKey, StorageScope.WORKSPACE);
			}
		} catch (err) {
			this._logService.warn('Failed to persist terminal chat tool session mappings', err);
		}
	}
}
