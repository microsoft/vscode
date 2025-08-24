/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
import * as vscode from 'vscode';
import { RSession } from './session';

export class RSessionManager implements vscode.Disposable {
	private static _instance: RSessionManager;

	private readonly _disposables: vscode.Disposable[] = [];

	private _sessions: Map<string, RSession> = new Map();

	private _lastForegroundSessionId: string | null = null;

	private _lastBinpath = '';

	private constructor() {
		this._disposables.push(
			erdos.runtime.onDidChangeForegroundSession(async sessionId => {
				await this.didChangeForegroundSession(sessionId);
			})
		);
	}

	static get instance(): RSessionManager {
		if (!RSessionManager._instance) {
			RSessionManager._instance = new RSessionManager();
		}
		return RSessionManager._instance;
	}

	setSession(sessionId: string, session: RSession): void {
		if (this._sessions.has(sessionId)) {
			throw new Error(`Session ${sessionId} already registered.`);
		}
		this._sessions.set(sessionId, session);
		this._disposables.push(
			session.onDidChangeRuntimeState(async (state) => {
				await this.didChangeSessionRuntimeState(session, state);
			})
		);
	}

	private async didChangeSessionRuntimeState(session: RSession, state: erdos.RuntimeState): Promise<void> {
		if (state === erdos.RuntimeState.Ready) {
			if (session.metadata.sessionMode === erdos.LanguageRuntimeSessionMode.Console) {
				if (this._lastForegroundSessionId === session.metadata.sessionId) {
					await this.activateConsoleSession(session, 'foreground session is ready');
				}
			} else if (session.metadata.sessionMode === erdos.LanguageRuntimeSessionMode.Notebook) {
				await this.activateSession(session, 'notebook session is ready');
			}
		}
	}

	private async didChangeForegroundSession(sessionId: string | undefined): Promise<void> {
		if (!sessionId) {
			return;
		}

		if (this._lastForegroundSessionId === sessionId) {
			return;
		}

		const session = this._sessions.get(sessionId);
		if (!session) {
			return;
		}

		if (session.metadata.sessionMode !== erdos.LanguageRuntimeSessionMode.Console) {
			throw Error(`Foreground session with ID ${sessionId} must be a console session.`);
		}

		this._lastForegroundSessionId = session.metadata.sessionId;
		await this.activateConsoleSession(session, 'foreground session changed');
	}

	private async activateConsoleSession(session: RSession, reason: string): Promise<void> {
		await Promise.all(Array.from(this._sessions.values())
			.filter(s => {
				return s.metadata.sessionId !== session.metadata.sessionId &&
					s.metadata.sessionMode === erdos.LanguageRuntimeSessionMode.Console;
			})
			.map(s => {
				return this.deactivateSession(s, reason);
			})
		);
		await this.activateSession(session, reason);
	}

	private async activateSession(session: RSession, reason: string): Promise<void> {
		await session.activateLsp(reason);
	}

	private async deactivateSession(session: RSession, reason: string): Promise<void> {
		await session.deactivateLsp(reason);
	}

	getConsoleSession(): RSession | undefined {
		const sessions = Array.from(this._sessions.values());
		sessions.sort((a, b) => b.created - a.created);

		const consoleSessions = sessions.filter(s =>
			s.metadata.sessionMode === erdos.LanguageRuntimeSessionMode.Console &&
			s.state !== erdos.RuntimeState.Uninitialized &&
			s.state !== erdos.RuntimeState.Exited);

		if (consoleSessions.length === 0) {
			return undefined;
		}

		if (consoleSessions.length > 1) {
			console.warn(`${consoleSessions.length} R console sessions found; ` +
				`returning the most recently started one.`);
		}

		return consoleSessions[0];
	}

	getSessionById(sessionId: string): RSession | undefined {
		return this._sessions.get(sessionId);
	}

	setLastBinpath(path: string) {
		this._lastBinpath = path;
	}

	hasLastBinpath(): boolean {
		return this._lastBinpath !== '';
	}

	getLastBinpath(): string {
		return this._lastBinpath;
	}

	public dispose(): void {
		this._disposables.forEach((disposable) => disposable.dispose());
	}
}
