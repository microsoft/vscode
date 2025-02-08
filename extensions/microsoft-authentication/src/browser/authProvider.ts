/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthenticationProvider, AuthenticationProviderAuthenticationSessionsChangeEvent, AuthenticationSession, EventEmitter } from 'vscode';

export class MsalAuthProvider implements AuthenticationProvider {
	private _onDidChangeSessions = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
	onDidChangeSessions = this._onDidChangeSessions.event;

	initialize(): Thenable<void> {
		throw new Error('Method not implemented.');
	}

	getSessions(): Thenable<AuthenticationSession[]> {
		throw new Error('Method not implemented.');
	}
	createSession(): Thenable<AuthenticationSession> {
		throw new Error('Method not implemented.');
	}
	removeSession(): Thenable<void> {
		throw new Error('Method not implemented.');
	}

	dispose() {
		this._onDidChangeSessions.dispose();
	}
}
