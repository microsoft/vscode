/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITerminalInstance } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { INativeCliProxyModel } from '../../../../platform/agentHost/common/nativeCliProxy.js';

export interface ISessionTerminalAuthentication {
	readonly nativeLabel: string;
	/** Which account pays for the session; cannot be changed once the CLI has started. */
	readonly source: IObservable<'native' | 'copilot'>;
	readonly model: IObservable<INativeCliProxyModel | undefined>;
	setSource(source: 'native' | 'copilot'): void;
	getCopilotModels(): Promise<readonly INativeCliProxyModel[]>;
	setModel(model: INativeCliProxyModel): void;
}

/** Provider-owned terminal state, independent of the lifetime of its visible surface. */
export interface ISessionTerminal {
	readonly authentication?: ISessionTerminalAuthentication;
	/**
	 * Returns the account configuration, materializing provider state on first use.
	 * Has side effects, so call it from an autorun rather than a `derived` compute.
	 */
	ensureAuthentication?(): ISessionTerminalAuthentication | undefined;
	readonly instance: IObservable<ITerminalInstance | undefined>;
	/**
	 * Whether the underlying process is still running. Terminals that wait on exit outlive
	 * their process, so this cannot be derived from {@link instance} alone.
	 */
	readonly isRunning: IObservable<boolean>;
	/** Set while the process is being launched, before its first screen is available. */
	readonly isStarting: IObservable<boolean>;
	/** Set while the terminal is attached but has not yet produced any output. */
	readonly isInitializing?: IObservable<boolean>;
	readonly error: IObservable<string | undefined>;
	readonly warning?: IObservable<string | undefined>;
	/**
	 * Title of the conversation the shared CLI process is showing instead of this one, and
	 * whether the CLI has been asked to switch. The terminal is still this session's process,
	 * so it is shown rather than a restart.
	 */
	readonly displaysOtherSession?: IObservable<{ readonly title: string; readonly switching: boolean } | undefined>;
	start(): Promise<void>;
}

export const ISessionTerminalService = createDecorator<ISessionTerminalService>('sessionTerminalService');

/** Lets browser-layer views observe terminals owned by a target-specific session provider. */
export interface ISessionTerminalService {
	readonly _serviceBrand: undefined;
	getSessionTerminal(sessionId: string): ISessionTerminal | undefined;
	registerSessionTerminal(sessionId: string, terminal: ISessionTerminal): IDisposable;
}

/** Registry of provider-owned session terminals, keyed by session id. */
export class SessionTerminalService implements ISessionTerminalService {
	declare readonly _serviceBrand: undefined;

	private readonly _terminals = new Map<string, ISessionTerminal>();

	getSessionTerminal(sessionId: string): ISessionTerminal | undefined {
		return this._terminals.get(sessionId);
	}

	registerSessionTerminal(sessionId: string, terminal: ISessionTerminal): IDisposable {
		if (this._terminals.has(sessionId)) {
			throw new Error(`A terminal is already registered for session '${sessionId}'`);
		}
		this._terminals.set(sessionId, terminal);
		return toDisposable(() => this._terminals.delete(sessionId));
	}
}

registerSingleton(ISessionTerminalService, SessionTerminalService, InstantiationType.Delayed);
