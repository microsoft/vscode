/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITerminalChatService, ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { TerminalChatContextKeys } from './terminalChat.js';
import { LocalChatSessionUri } from '../../../chat/common/chatUri.js';

const enum StorageKeys {
	ToolSessionMappings = 'terminalChat.toolSessionMappings',
	CommandIdMappings = 'terminalChat.commandIdMappings'
}


/**
 * Used to manage chat tool invocations and the underlying terminal instances they create/use.
 */
export class TerminalChatService extends Disposable implements ITerminalChatService {
	declare _serviceBrand: undefined;

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
		@IChatService private readonly _chatService: IChatService,
	) {
		super();

		this._hasToolTerminalContext = TerminalChatContextKeys.hasChatTerminals.bindTo(this._contextKeyService);

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
			this._commandIdByToolSessionId.set(terminalToolSessionId, e.id);
			this._persistToStorage();
			listener.dispose();
		}));
		this._register(this._chatService.onDidDisposeSession(e => {
			if (LocalChatSessionUri.parseLocalSessionId(e.sessionResource) === terminalToolSessionId) {
				this._terminalInstancesByToolSessionId.delete(terminalToolSessionId);
				this._terminalInstanceListenersByToolSessionId.deleteAndDispose(terminalToolSessionId);
				this._commandIdByToolSessionId.delete(terminalToolSessionId);
				this._persistToStorage();
				this._updateHasToolTerminalContextKey();
			}
		}));

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
			const instance = this._terminalService.instances.find(i => i.shellLaunchConfig.attachPersistentProcess?.id === this._pendingRestoredMappings.get(terminalToolSessionId));
			if (instance) {
				this._tryAdoptRestoredMapping(instance);
				return instance;
			}
		}
		return this._terminalInstancesByToolSessionId.get(terminalToolSessionId);
	}

	getToolSessionTerminalInstances(): readonly ITerminalInstance[] {
		// Ensure unique instances in case multiple tool sessions map to the same terminal
		return Array.from(new Set(this._terminalInstancesByToolSessionId.values()));
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
			const raw = this._storageService.get(StorageKeys.ToolSessionMappings, StorageScope.WORKSPACE);
			if (!raw) {
				return;
			}
			const parsed: [string, number][] = JSON.parse(raw);
			for (const [toolSessionId, persistentProcessId] of parsed) {
				if (typeof toolSessionId === 'string' && typeof persistentProcessId === 'number') {
					this._pendingRestoredMappings.set(toolSessionId, persistentProcessId);
				}
			}
			const rawCommandIds = this._storageService.get(StorageKeys.CommandIdMappings, StorageScope.WORKSPACE);
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
			if (persistentProcessId === instance.shellLaunchConfig.attachPersistentProcess?.id) {
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
				this._storageService.store(StorageKeys.ToolSessionMappings, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			} else {
				this._storageService.remove(StorageKeys.ToolSessionMappings, StorageScope.WORKSPACE);
			}
			const commandEntries: [string, string][] = [];
			for (const [toolSessionId, commandId] of this._commandIdByToolSessionId.entries()) {
				commandEntries.push([toolSessionId, commandId]);
			}
			if (commandEntries.length > 0) {
				this._storageService.store(StorageKeys.CommandIdMappings, JSON.stringify(commandEntries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			} else {
				this._storageService.remove(StorageKeys.CommandIdMappings, StorageScope.WORKSPACE);
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
