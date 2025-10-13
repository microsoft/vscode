/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
// eslint-disable-next-line local/code-import-patterns
import { ITerminalExecuteStrategy } from '../../terminalContrib/chatAgentTools/browser/executeStrategy/executeStrategy.js';
import { ITerminalChatExecutionRegistration, ITerminalChatProgressPartHandle, ITerminalChatProgressPartRegistration, ITerminalChatService, ITerminalInstance } from './terminal.js';
import { XtermTerminal } from './xterm/xtermTerminal.js';
import { TerminalInstance, TerminalInstanceColorProvider } from './terminalInstance.js';
import { TerminalCapabilityStore } from '../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';

interface ITerminalChatAttachment {
	readonly id: string;
	readonly registration: ITerminalChatProgressPartRegistration;
	readonly store: DisposableStore;
	readonly createdAt: number;
	xterm: XtermTerminal | undefined;
	disposed: boolean;
}

interface ITerminalChatSessionState {
	readonly id: string;
	readonly chatSessionId: string;
	readonly toolCallId: string;
	instance: ITerminalInstance | undefined;
	executeStrategy: ITerminalExecuteStrategy | undefined;
	readonly attachments: Map<string, ITerminalChatAttachment>;
	readonly store: DisposableStore;
	persistentStartMarker?: IXtermMarker;
	persistentEndMarker?: IXtermMarker;
	lastData?: string;
	preferredRows: number;
}

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 10;
const COLLAPSED_ROWS = 1;

export class TerminalChatService extends Disposable implements ITerminalChatService {
	_serviceBrand: undefined;

	private readonly _sessions = new Map<string, ITerminalChatSessionState>();
	private readonly _latestSessionByInstance = new Map<string, string>();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
	}

	override dispose(): void {
		for (const session of this._sessions.values()) {
			session.store.dispose();
			for (const attachment of session.attachments.values()) {
				attachment.disposed = true;
				attachment.xterm = undefined;
				attachment.store.dispose();
			}
			session.attachments.clear();
		}
		this._sessions.clear();
		this._latestSessionByInstance.clear();
		super.dispose();
	}

	serialize(): string {
		throw new Error('Method not implemented.');
	}

	deserialize(_serialized: string): void {
		throw new Error('Method not implemented.');
	}

	registerExecution(registration: ITerminalChatExecutionRegistration): void {
		const session = this._ensureSession(registration.terminalSessionId, registration.chatSessionId, registration.toolCallId);
		session.instance = registration.instance;
		session.executeStrategy = registration.executeStrategy;

		if (!session.store.isDisposed) {
			session.store.clear();
		}
		this._setSessionPreferredRows(session, DEFAULT_ROWS);

		const refreshScheduler = new RunOnceScheduler(() => {
			void this._refreshSession(session);
		}, 100);
		session.store.add(refreshScheduler);
		session.store.add(registration.instance.onData(() => {
			refreshScheduler.schedule();
		}));

		session.store.add(registration.executeStrategy.onDidCreateStartMarker(marker => {
			if (marker) {
				session.persistentStartMarker = marker;
			}
			refreshScheduler.schedule();
		}));
		session.store.add(registration.executeStrategy.onDidFinishCommand(exitCode => {
			const targetRows = exitCode === 0 ? COLLAPSED_ROWS : DEFAULT_ROWS;
			this._setSessionPreferredRows(session, targetRows);
		}));

		this._latestSessionByInstance.set(registration.instance.sessionId, registration.terminalSessionId);
		if (session.persistentStartMarker || registration.executeStrategy.startMarker) {
			refreshScheduler.schedule(0);
		}
	}

	registerProgressPart(registration: ITerminalChatProgressPartRegistration): ITerminalChatProgressPartHandle {
		const session = this._ensureSession(registration.terminalSessionId, registration.chatSessionId, registration.toolCallId);
		const attachmentId = generateUuid();
		const attachment: ITerminalChatAttachment = {
			id: attachmentId,
			registration,
			store: new DisposableStore(),
			createdAt: Date.now(),
			xterm: undefined,
			disposed: false
		};
		session.attachments.set(attachmentId, attachment);

		const attachToElement = async (element: HTMLElement): Promise<void> => {
			if (attachment.disposed) {
				return;
			}
			const xterm = await this._getOrCreateXterm(session, attachment);
			if (!xterm) {
				return;
			}
			if (attachment.disposed || attachment.store.isDisposed) {
				return;
			}
			xterm.attachToElement(element);
			registration.onDidChangeHeight();
			queueMicrotask(() => {
				if (!attachment.disposed) {
					registration.onDidChangeHeight();
				}
			});
		};

		const handle: ITerminalChatProgressPartHandle = {
			attachToElement,
			dispose: () => {
				if (attachment.disposed) {
					return;
				}
				attachment.disposed = true;
				session.attachments.delete(attachmentId);
				attachment.store.dispose();
				attachment.xterm = undefined;
			}
		};

		attachment.store.add(toDisposable(() => session.attachments.delete(attachmentId)));
		attachment.store.add(handle);

		return handle;
	}

	private _ensureSession(id: string, chatSessionId: string, toolCallId: string): ITerminalChatSessionState {
		let session = this._sessions.get(id);
		if (!session) {
			const newSession: ITerminalChatSessionState = {
				id,
				chatSessionId,
				toolCallId,
				instance: undefined,
				executeStrategy: undefined,
				attachments: new Map(),
				store: new DisposableStore(),
				persistentStartMarker: undefined,
				persistentEndMarker: undefined,
				lastData: undefined,
				preferredRows: DEFAULT_ROWS
			};
			this._sessions.set(id, newSession);
			session = newSession;
		}
		return session;
	}

	private async _getOrCreateXterm(session: ITerminalChatSessionState, attachment: ITerminalChatAttachment): Promise<XtermTerminal | undefined> {
		if (attachment.disposed || attachment.store.isDisposed) {
			return undefined;
		}
		if (attachment.xterm) {
			return attachment.xterm;
		}
		const xtermCtor = await TerminalInstance.getXtermConstructor(this._keybindingService, this._contextKeyService);
		if (attachment.disposed || attachment.store.isDisposed) {
			return undefined;
		}
		const capabilities = new TerminalCapabilityStore();
		if (attachment.store.isDisposed) {
			capabilities.dispose();
			return undefined;
		}
		attachment.store.add(capabilities);
		const cols = session.instance?.cols ?? DEFAULT_COLS;
		const xterm = this._instantiationService.createInstance(XtermTerminal, xtermCtor, {
			rows: session.preferredRows,
			cols,
			capabilities,
			xtermColorProvider: this._instantiationService.createInstance(TerminalInstanceColorProvider, TerminalLocation.Panel)
		}, undefined);
		if (attachment.store.isDisposed) {
			xterm.dispose();
			return undefined;
		}
		attachment.store.add(xterm);
		attachment.xterm = xterm;
		await this._applyLastDataToAttachment(session, attachment);
		return xterm;
	}

	private async _refreshSession(session: ITerminalChatSessionState, startMarker?: IXtermMarker): Promise<void> {
		const instance = session.instance;
		const strategy = session.executeStrategy;
		if (!instance || !strategy) {
			return;
		}

		const marker = startMarker ?? session.persistentStartMarker ?? strategy.startMarker;
		if (!marker) {
			return;
		}
		session.persistentStartMarker = marker;

		const latestSessionId = this._latestSessionByInstance.get(instance.sessionId);
		if (latestSessionId && latestSessionId !== session.id) {
			return;
		}

		const endMarker = strategy.endMarker ?? session.persistentEndMarker;
		if (strategy.endMarker && !session.persistentEndMarker) {
			session.persistentEndMarker = strategy.endMarker;
		}

		try {
			const data = await instance.xterm?.getRangeAsVT(marker, endMarker);
			if (!data || data === session.lastData) {
				return;
			}
			session.lastData = data;
			for (const attachment of session.attachments.values()) {
				if (attachment.disposed || attachment.store.isDisposed || !attachment.xterm) {
					continue;
				}
				attachment.registration.onDidChangeHeight();
				attachment.xterm.raw.clear();
				attachment.xterm.write('\x1b[H\x1b[K');
				attachment.xterm.write(data, () => {
					if (attachment.disposed || attachment.store.isDisposed) {
						return;
					}
					const xtermInstance = attachment.xterm;
					if (!xtermInstance) {
						return;
					}
					xtermInstance.scrollToTop();
					attachment.registration.onDidChangeHeight();
				});
			}
		} catch (error) {
			this._logService.error('[terminalChat] Failed to refresh terminal preview content', error);
		}
	}

	private async _applyLastDataToAttachment(session: ITerminalChatSessionState, attachment: ITerminalChatAttachment): Promise<void> {
		if (!session.lastData || !attachment.xterm || attachment.disposed || attachment.store.isDisposed) {
			return;
		}
		try {
			attachment.registration.onDidChangeHeight();
			attachment.xterm.raw.clear();
			attachment.xterm.write('\x1b[H\x1b[K');
			attachment.xterm.write(session.lastData, () => {
				if (attachment.disposed || attachment.store.isDisposed) {
					return;
				}
				const xtermInstance = attachment.xterm;
				if (!xtermInstance) {
					return;
				}
				xtermInstance.scrollToTop();
				attachment.registration.onDidChangeHeight();
			});
		} catch (error) {
			this._logService.error('[terminalChat] Failed to render cached terminal preview content', error);
		}
	}

	private _setSessionPreferredRows(session: ITerminalChatSessionState, rows: number): void {
		if (session.preferredRows === rows) {
			return;
		}
		session.preferredRows = rows;
		for (const attachment of session.attachments.values()) {
			if (attachment.disposed || attachment.store.isDisposed || !attachment.xterm) {
				continue;
			}
			try {
				const cols = attachment.xterm.raw.cols ?? session.instance?.cols ?? DEFAULT_COLS;
				attachment.xterm.resize(cols, rows);
				attachment.registration.onDidChangeHeight();
			} catch (error) {
				this._logService.error('[terminalChat] Failed to resize terminal preview', error);
			}
		}
	}
}
