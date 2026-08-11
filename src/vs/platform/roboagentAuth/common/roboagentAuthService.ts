/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export interface IRoboAgentAuthSession {
	readonly isSignedIn: boolean;
	readonly userId?: string;
	readonly email?: string;
	readonly displayName?: string;
}

export const IRoboAgentAuthMainService = createDecorator<IRoboAgentAuthMainService>('roboagentAuthMainService');

export interface IRoboAgentAuthMainService {
	readonly _serviceBrand: undefined;

	/**
	 * Fired when the session state changes (e.g. sign in, sign out, token expiration).
	 */
	readonly onDidChangeSession: Event<IRoboAgentAuthSession>;

	/**
	 * Initiate the OAuth 2.0 PKCE sign-in flow.
	 */
	signIn(): Promise<IRoboAgentAuthSession>;

	/**
	 * Sign out, clearing both local credentials and remote Supabase session.
	 */
	signOut(): Promise<void>;

	/**
	 * Get the current derived session state. Does not include access/refresh tokens.
	 */
	getSession(): Promise<IRoboAgentAuthSession>;

	/**
	 * Get the current Supabase access token for calling RoboAgent backend APIs
	 * (e.g. the LLM gateway). Refreshes automatically when missing or near
	 * expiry. Returns undefined when signed out or refresh fails.
	 */
	getAccessToken(): Promise<string | undefined>;
}
