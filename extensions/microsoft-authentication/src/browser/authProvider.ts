/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
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
