/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AuthenticationGetSessionOptions, AuthenticationSession } from 'vscode';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { CopilotToken } from '../../../authentication/common/copilotToken';

/**
 * A minimal mock implementation of IAuthenticationService for testing.
 * Returns undefined for all session methods by default.
 */
export class MockAuthenticationService implements IAuthenticationService {
	declare readonly _serviceBrand: undefined;

	readonly isMinimalMode = false;
	readonly onDidAuthenticationChange: Event<void> = Event.None;
	readonly onDidAccessTokenChange: Event<void> = Event.None;
	private readonly _onDidCopilotTokenChange = new Emitter<void>();
	readonly onDidCopilotTokenChange: Event<void> = this._onDidCopilotTokenChange.event;
	readonly onDidAdoAuthenticationChange: Event<void> = Event.None;
	readonly anyGitHubSession: AuthenticationSession | undefined = undefined;
	readonly permissiveGitHubSession: AuthenticationSession | undefined = undefined;
	readonly hasCopilotTokenSource: boolean = false;

	copilotToken: Omit<CopilotToken, 'token'> | undefined = undefined;
	speculativeDecodingEndpointToken: string | undefined = undefined;

	/** Replaces the current token and notifies listeners, as a real token refresh would. */
	setCopilotToken(token: Omit<CopilotToken, 'token'> | undefined): void {
		this.copilotToken = token;
		this._onDidCopilotTokenChange.fire();
	}

	getGitHubSession(_kind: 'permissive' | 'any', _options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined>;
	getGitHubSession(_kind: 'permissive' | 'any', _options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession>;
	getGitHubSession(_kind: 'permissive' | 'any', _options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		return Promise.resolve(undefined);
	}

	getCopilotToken(_force?: boolean): Promise<CopilotToken> {
		return Promise.reject(new Error('No copilot token available in mock'));
	}

	resetCopilotToken(_httpError?: number): void { }

	getAdoAccessTokenBase64(_options?: AuthenticationGetSessionOptions): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}

	dispose(): void {
		this._onDidCopilotTokenChange.dispose();
	}
}
