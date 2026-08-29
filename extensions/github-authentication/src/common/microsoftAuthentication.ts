/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * The Microsoft authentication provider contributed by VS Code. We deliberately go through the
 * built-in provider rather than talking to MSAL/WAM directly so that account selection, brokering
 * and consent all behave exactly like every other Microsoft sign in in the product.
 */
export const MICROSOFT_PROVIDER_ID = 'microsoft';

/**
 * The Entra audience GitHub accepts as the subject token of the exchange, requested with the
 * `.default` scope so the user consents to whatever the application is already configured for.
 */
const ENTRA_GITHUB_AUDIENCE_SCOPE = '12f6db80-0741-4a7e-b9c5-b85d737b3a31/.default';

/** A Microsoft Entra access token and the account it was issued to. */
export interface IMicrosoftToken {
	readonly token: string;
	readonly account: vscode.AuthenticationSessionAccountInformation;
}

/** How to acquire a token: with the user in front of it, or without involving them at all. */
export type IMicrosoftTokenRequest =
	/** May put an account picker, a consent prompt or a whole sign in in front of the user. */
	| {
		readonly silent?: false;
		/** Starts a brand new sign in, forgetting whichever account was remembered as preferred. */
		readonly forceNewSession: boolean;
		/** The identity to mint the token for, when the caller knows which one it needs. */
		readonly account?: vscode.AuthenticationSessionAccountInformation;
	}
	/**
	 * Shows nothing, and takes no for an answer. This is what a background renewal needs: the user
	 * is busy doing something else and did not ask to be interrupted, so a token that cannot be had
	 * on the provider's own is simply not had.
	 */
	| {
		readonly silent: true;
		/** Required: a silent acquisition has no picker to fall back on. */
		readonly account: vscode.AuthenticationSessionAccountInformation;
	};

/**
 * The Microsoft accounts this extension can reach. Everything that talks to the built-in provider
 * goes through here, so a test drives the whole flow without stubbing `vscode.authentication`.
 */
export interface IMicrosoftAuthentication {
	/**
	 * Acquires an Entra access token for the audience GitHub accepts. Resolves to `undefined` when
	 * the user dismisses the Microsoft sign in, or when a silent request cannot be answered.
	 */
	getToken(request: IMicrosoftTokenRequest): Promise<IMicrosoftToken | undefined>;
	/** The Microsoft accounts the user is currently signed in to. */
	getAccounts(): Promise<readonly vscode.AuthenticationSessionAccountInformation[]>;
}

export class MicrosoftAuthentication implements IMicrosoftAuthentication {

	async getToken(request: IMicrosoftTokenRequest): Promise<IMicrosoftToken | undefined> {
		const session = await vscode.authentication.getSession(
			MICROSOFT_PROVIDER_ID,
			[ENTRA_GITHUB_AUDIENCE_SCOPE],
			optionsFor(request));
		return session && { token: session.accessToken, account: session.account };
	}

	async getAccounts(): Promise<readonly vscode.AuthenticationSessionAccountInformation[]> {
		return await vscode.authentication.getAccounts(MICROSOFT_PROVIDER_ID);
	}
}

function optionsFor(request: IMicrosoftTokenRequest): vscode.AuthenticationGetSessionOptions {
	// `silent` cannot be combined with `createIfNone` or anything else that prompts, which is the
	// whole point of it: the request either resolves from what the provider already has or not at all.
	if (request.silent) {
		return { silent: true, account: request.account };
	}
	// When the user asks for a different account we must both forget the remembered account
	// preference and force a brand new session, otherwise the same identity comes back.
	return request.forceNewSession
		? { forceNewSession: true, clearSessionPreference: true }
		: { createIfNone: true, account: request.account };
}
