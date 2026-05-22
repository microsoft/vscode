/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// test-workbench_change - new file

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import {
	IAuthenticationProvider,
	IAuthenticationProviderSessionOptions,
	AuthenticationSession,
	AuthenticationSessionsChangeEvent,
} from '../../../services/authentication/common/authentication.js';
import { ITsCodeAuthService, ITsCodeTokenStore } from '../common/tsCodeAuth.js';

export class TsCodeOAuthProvider extends Disposable implements IAuthenticationProvider {
	readonly id = 'tscode-oauth';
	readonly label = 'TestAgent';
	readonly supportsMultipleAccounts = false;

	private readonly _onDidChangeSessions = this._register(new Emitter<AuthenticationSessionsChangeEvent>());
	readonly onDidChangeSessions: Event<AuthenticationSessionsChangeEvent> = this._onDidChangeSessions.event;

	constructor(
		@ITsCodeAuthService private readonly authService: ITsCodeAuthService,
		@ITsCodeTokenStore private readonly tokenStore: ITsCodeTokenStore,
	) {
		super();

		// Subscribe to login event → fire onDidChangeSessions with added session
		this._register(authService.onDidLogin(async () => {
			const sessions = await this.getSessions(undefined, {});
			if (sessions.length > 0) {
				this._onDidChangeSessions.fire({ added: [sessions[0]], removed: [], changed: [] });
			}
		}));

		// Subscribe to logout event → fire onDidChangeSessions with removed session
		this._register(authService.onDidLogout(async () => {
			const sessions = await this.getSessions(undefined, {});
			// sessions may already be empty at this point; fire with whatever was there
			this._onDidChangeSessions.fire({ added: [], removed: sessions.length > 0 ? [sessions[0]] : [], changed: [] });
		}));
	}

	async getSessions(scopes: string[] | undefined, _options: IAuthenticationProviderSessionOptions): Promise<readonly AuthenticationSession[]> {
		// test-workbench_change start
		const token = await this.tokenStore.getToken();

		if (token) {
			const session: AuthenticationSession = {
				id: token.employeeId ?? token.userName ?? 'tscode-user',
				accessToken: token.token,
				account: {
					id: token.employeeId ?? token.userName ?? 'tscode-user',
					label: token.userName ?? token.employeeId ?? 'TSCode User',
				},
				scopes: scopes ?? [],
				idToken: token.idToken,
			};
			return [session];
		}
		// test-workbench_change end

		return [];
	}

	async createSession(scopes: string[], _options: IAuthenticationProviderSessionOptions): Promise<AuthenticationSession> {
		await this.authService.startOAuthFlow();
		await Event.toPromise(this.authService.onDidLogin);

		const sessions = await this.getSessions(scopes, {});
		if (sessions.length === 0) {
			throw new Error('Login completed but no session was found.');
		}
		return sessions[0];
	}

	async removeSession(sessionId: string): Promise<void> {
		const sessions = await this.getSessions(undefined, {});
		const session = sessions.find(s => s.id === sessionId);

		await this.authService.signOut(); // test-workbench_change: clear token and show welcome page

		this._onDidChangeSessions.fire({
			removed: session ? [session] : [],
			added: [],
			changed: [],
		});
	}
}
