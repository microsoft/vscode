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
	private readonly _toolSessionIdByTerminalInstance = new Map<ITerminalInstance, string>();
	private readonly _chatSessionIdByTerminalInstance = new Map<ITerminalInstance, string>();
	private readonly _terminalInstanceListenersByToolSessionId = this._register(new DisposableMap<string, IDisposable>());
	private readonly _chatSessionListenersByTerminalInstance = this._register(new DisposableMap<ITerminalInstance, IDisposable>());
	private readonly _onDidRegisterTerminalInstanceForToolSession = new Emitter<ITerminalInstance>();
	readonly onDidRegisterTerminalInstanceWithToolSession: Event<ITerminalInstance> = this._onDidRegisterTerminalInstanceForToolSession.event;

	/**
	 * Pending mappings restored from storage that have not yet been matched to a live terminal
	 * instance (we match by persistentProcessId when it becomes available after reconnection).
	 * toolSessionId -> persistentProcessId
	 */
	private readonly _pendingRestoredMappings = new Map<string, number>();

	private readonly _hasToolTerminalContext: IContextKey<boolean>;
	private readonly _hasHiddenToolTerminalContext: IContextKey<boolean>;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IStorageService private readonly _storageService: IStorageService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatService private readonly _chatService: IChatService,
	) {
		super();

		this._hasToolTerminalContext = TerminalChatContextKeys.hasChatTerminals.bindTo(this._contextKeyService);
		this._hasHiddenToolTerminalContext = TerminalChatContextKeys.hasHiddenChatTerminals.bindTo(this._contextKeyService);

		this._restoreFromStorage();
	}

	registerTerminalInstanceWithToolSession(terminalToolSessionId: string | undefined, instance: ITerminalInstance): void {
		if (!terminalToolSessionId) {
			this._logService.warn('Attempted to register a terminal instance with an undefined tool session ID');
			return;
		}
		this._terminalInstancesByToolSessionId.set(terminalToolSessionId, instance);
		this._toolSessionIdByTerminalInstance.set(instance, terminalToolSessionId);
		this._onDidRegisterTerminalInstanceForToolSession.fire(instance);
		this._terminalInstanceListenersByToolSessionId.set(terminalToolSessionId, instance.onDisposed(() => {
			this._terminalInstancesByToolSessionId.delete(terminalToolSessionId);
			this._toolSessionIdByTerminalInstance.delete(instance);
			this._terminalInstanceListenersByToolSessionId.deleteAndDispose(terminalToolSessionId);
			this._persistToStorage();
			this._updateHasToolTerminalContextKeys();
		}));

		this._register(this._chatService.onDidDisposeSession(e => {
			if (LocalChatSessionUri.parseLocalSessionId(e.sessionResource) === terminalToolSessionId) {
				this._terminalInstancesByToolSessionId.delete(terminalToolSessionId);
				this._toolSessionIdByTerminalInstance.delete(instance);
				this._terminalInstanceListenersByToolSessionId.deleteAndDispose(terminalToolSessionId);
				this._persistToStorage();
				this._updateHasToolTerminalContextKeys();
			}
		}));

		// Update context keys when terminal instances change (including when terminals are created, disposed, revealed, or hidden)
		this._register(this._terminalService.onDidChangeInstances(() => this._updateHasToolTerminalContextKeys()));

		if (typeof instance.shellLaunchConfig?.attachPersistentProcess?.id === 'number' || typeof instance.persistentProcessId === 'number') {
			this._persistToStorage();
		}

		this._updateHasToolTerminalContextKeys();
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

	getToolSessionTerminalInstances(hiddenOnly?: boolean): readonly ITerminalInstance[] {
		if (hiddenOnly) {
			const foregroundInstances = new Set(this._terminalService.foregroundInstances.map(i => i.instanceId));
			const uniqueInstances = new Set(this._terminalInstancesByToolSessionId.values());
			return Array.from(uniqueInstances).filter(i => !foregroundInstances.has(i.instanceId));
		}
		// Ensure unique instances in case multiple tool sessions map to the same terminal
		return Array.from(new Set(this._terminalInstancesByToolSessionId.values()));
	}

	getToolSessionIdForInstance(instance: ITerminalInstance): string | undefined {
		return this._toolSessionIdByTerminalInstance.get(instance);
	}

	registerTerminalInstanceWithChatSession(chatSessionId: string, instance: ITerminalInstance): void {
		// If already registered with the same session ID, skip to avoid duplicate listeners
		if (this._chatSessionIdByTerminalInstance.get(instance) === chatSessionId) {
			return;
		}

		// Clean up previous listener if the instance was registered with a different session
		this._chatSessionListenersByTerminalInstance.deleteAndDispose(instance);

		this._chatSessionIdByTerminalInstance.set(instance, chatSessionId);
		// Clean up when the instance is disposed
		const disposable = instance.onDisposed(() => {
			this._chatSessionIdByTerminalInstance.delete(instance);
			this._chatSessionListenersByTerminalInstance.deleteAndDispose(instance);
		});
		this._chatSessionListenersByTerminalInstance.set(instance, disposable);
	}

	getChatSessionIdForInstance(instance: ITerminalInstance): string | undefined {
		return this._chatSessionIdByTerminalInstance.get(instance);
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
		} catch (err) {
			this._logService.warn('Failed to restore terminal chat tool session mappings', err);
		}
	}

	private _tryAdoptRestoredMapping(instance: ITerminalInstance): void {
		if (this._pendingRestoredMappings.size === 0) {
			return;
		}

		for (const [toolSessionId, persistentProcessId] of this._pendingRestoredMappings) {
			if (persistentProcessId === instance.shellLaunchConfig.attachPersistentProcess?.id) {
				this._terminalInstancesByToolSessionId.set(toolSessionId, instance);
				this._toolSessionIdByTerminalInstance.set(instance, toolSessionId);
				this._onDidRegisterTerminalInstanceForToolSession.fire(instance);
				this._terminalInstanceListenersByToolSessionId.set(toolSessionId, instance.onDisposed(() => {
					this._terminalInstancesByToolSessionId.delete(toolSessionId);
					this._toolSessionIdByTerminalInstance.delete(instance);
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
		this._updateHasToolTerminalContextKeys();
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
		} catch (err) {
			this._logService.warn('Failed to persist terminal chat tool session mappings', err);
		}
	}

	private _updateHasToolTerminalContextKeys(): void {
		const toolCount = this._terminalInstancesByToolSessionId.size;
		this._hasToolTerminalContext.set(toolCount > 0);
		const hiddenTerminalCount = this.getToolSessionTerminalInstances(true).length;
		this._hasHiddenToolTerminalContext.set(hiddenTerminalCount > 0);
	}
}
