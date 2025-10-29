/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITerminalChatService, ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';

/**
 * Used to manage chat tool invocations and the underlying terminal instances they create/use.
 */
export class TerminalChatService extends Disposable implements ITerminalChatService {
	declare _serviceBrand: undefined;


	private static readonly _toolSessionInstancesKey = 'terminalChat.toolSessionMappings';
	private static readonly _commandIdByToolSessionIdKey = 'terminalChat.commandIdMappings';

	private readonly _terminalInstancesByToolSessionId = new Map<string, ITerminalInstance>();
	private readonly _commandIdByToolSessionId = new Map<string, string>();
	private readonly _terminalInstanceListenersByToolSessionId = this._register(new DisposableMap<string, IDisposable>());
	private readonly _onDidRegisterTerminalInstanceForToolSession = new Emitter<ITerminalInstance>();
	readonly onDidRegisterTerminalInstanceWithToolSession: Event<ITerminalInstance> = this._onDidRegisterTerminalInstanceForToolSession.event;

	/**
	 * Pending mappings restored from storage that have not yet been matched to a live terminal
	 * instance (we match by persistentProcessId when it becomes available after reconnection).
	 * toolSessionId -> persistentProcessId
	 */
	private readonly _pendingRestoredMappings = new Map<string, number>();

	private readonly _hasToolTerminalContext: IContextKey<boolean>;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IStorageService private readonly _storageService: IStorageService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();

		this._hasToolTerminalContext = TerminalContextKeys.hasToolTerminal.bindTo(this._contextKeyService);

		this._restoreFromStorage();
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
			this._updateHasToolTerminalContextKey();
		}));
		const listener = this._register(instance.capabilities.get(TerminalCapability.CommandDetection)!.onCommandFinished(e => {
			console.log('command finished, setting id for tool session:', e.id);
			this._commandIdByToolSessionId.set(terminalToolSessionId, e.id);
			this._persistToStorage();
			listener.dispose();
		}));
		// To do, on chat tool session dispose, clear commandIdByToolSessionId map entry



		if (typeof instance.persistentProcessId === 'number') {
			this._persistToStorage();
		}

		this._updateHasToolTerminalContextKey();
	}

	getTerminalCommandIdByToolSessionId(terminalToolSessionId: string | undefined): string | undefined {
		if (!terminalToolSessionId) {
			return undefined;
		}
		if (this._commandIdByToolSessionId.size === 0) {
			this._restoreFromStorage();
		}
		return this._commandIdByToolSessionId.get(terminalToolSessionId);
	}

	async getTerminalInstanceByToolSessionId(terminalToolSessionId: string | undefined): Promise<ITerminalInstance | undefined> {
		await this._terminalService.whenConnected;
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

	getToolSessionTerminalInstances(): readonly ITerminalInstance[] {
		return Array.from(this._terminalInstancesByToolSessionId.values());
	}

	isBackgroundTerminal(terminalToolSessionId?: string): boolean {
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
			const raw = this._storageService.get(TerminalChatService._toolSessionInstancesKey, StorageScope.WORKSPACE);
			if (!raw) {
				return;
			}
			const parsed: [string, number][] = JSON.parse(raw);
			for (const [toolSessionId, persistentProcessId] of parsed) {
				if (typeof toolSessionId === 'string' && typeof persistentProcessId === 'number') {
					this._pendingRestoredMappings.set(toolSessionId, persistentProcessId);
				}
			}
			const rawCommandIds = this._storageService.get(TerminalChatService._commandIdByToolSessionIdKey, StorageScope.WORKSPACE);
			if (rawCommandIds) {
				const parsedCommandIds: [string, string][] = JSON.parse(rawCommandIds);
				for (const [toolSessionId, commandId] of parsedCommandIds) {
					if (typeof toolSessionId === 'string' && typeof commandId === 'string') {
						this._commandIdByToolSessionId.set(toolSessionId, commandId);
					}
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
		this._updateHasToolTerminalContextKey();
		try {
			const entries: [string, number][] = [];
			for (const [toolSessionId, instance] of this._terminalInstancesByToolSessionId.entries()) {
				if (typeof instance.persistentProcessId === 'number' && instance.shouldPersist) {
					entries.push([toolSessionId, instance.persistentProcessId]);
				}
			}
			if (entries.length > 0) {
				this._storageService.store(TerminalChatService._toolSessionInstancesKey, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			} else {
				this._storageService.remove(TerminalChatService._toolSessionInstancesKey, StorageScope.WORKSPACE);
			}
			const commandEntries: [string, string][] = [];
			for (const [toolSessionId, commandId] of this._commandIdByToolSessionId.entries()) {
				commandEntries.push([toolSessionId, commandId]);
			}
			if (commandEntries.length > 0) {
				this._storageService.store(TerminalChatService._commandIdByToolSessionIdKey, JSON.stringify(commandEntries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			} else {
				this._storageService.remove(TerminalChatService._commandIdByToolSessionIdKey, StorageScope.WORKSPACE);
			}
		} catch (err) {
			this._logService.warn('Failed to persist terminal chat tool session mappings', err);
		}
	}

	private _updateHasToolTerminalContextKey(): void {
		const toolCount = this._terminalInstancesByToolSessionId.size;
		this._hasToolTerminalContext.set(toolCount > 0);
	}
}
