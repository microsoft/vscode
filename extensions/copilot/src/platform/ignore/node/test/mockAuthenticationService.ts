/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AuthenticationGetSessionOptions, AuthenticationSession } from 'vscode';
import { Event } from '../../../../util/vs/base/common/event';
import { CopilotToken } from '../../../authentication/common/copilotToken';

/**
 * A minimal mock implementation of IAuthenticationService for testing.
 * Returns undefined for all session methods by default.
 * Note: Does not fully implement IAuthenticationService - only the methods needed for tests.
 */
export class MockAuthenticationService {
	declare readonly _serviceBrand: undefined;

	readonly isMinimalMode = false;
	readonly onDidAuthenticationChange: Event<void> = Event.None;
	readonly onDidAccessTokenChange: Event<void> = Event.None;
	readonly onDidAdoAuthenticationChange: Event<void> = Event.None;
	readonly anyGitHubSession: AuthenticationSession | undefined = undefined;
	readonly permissiveGitHubSession: AuthenticationSession | undefined = undefined;

	copilotToken: Omit<CopilotToken, 'token'> | undefined = undefined;
	speculativeDecodingEndpointToken: string | undefined = undefined;

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

	dispose(): void { }
}
