/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMicrosoftCopilotAccountContext, type CopilotAccountContext } from '../../common/copilotAccountContext.js';
import type { AuthRequiredParams } from '../../common/state/sessionActions.js';
import { isRevokedEntraSignIn } from './copilotEntraAuthentication.js';

type AuthenticationRequirement = Omit<AuthRequiredParams, 'channel'>;

/** The sign-in that the user's last choice of Copilot account replaced. */
export type CopilotReplacedSignIn = 'github' | 'microsoft';

/**
 * Selects the credential the Copilot agent asks its clients for.
 *
 * GitHub and Microsoft are offered side by side with no way to choose one, so a credential that arrives is taken as
 * the choice of its account. Clients still hold the sign-in that choice replaced and answer any request for it, so
 * asking for it back would undo the choice:
 * - The GitHub request is not made while the account is, or is becoming, Microsoft.
 * - The request for a revoked Microsoft sign-in is not made once another sign-in replaced it. It is also not made
 *   while the account is still Microsoft, because a revocation is announced just before the account leaves
 *   Microsoft, where a GitHub request comes first.
 *
 * What the runtime itself asks for is always requested.
 */
export function selectCopilotAuthenticationRequirement(state: {
	readonly account: CopilotAccountContext;
	readonly replacedSignIn: CopilotReplacedSignIn | undefined;
	readonly github: AuthenticationRequirement | undefined;
	readonly microsoft: AuthenticationRequirement | undefined;
}): AuthenticationRequirement | undefined {
	const microsoftAccount = isMicrosoftCopilotAccountContext(state.account);
	const held = isRevokedEntraSignIn(state.microsoft) && (microsoftAccount || state.replacedSignIn !== undefined);
	const microsoft = held ? undefined : state.microsoft;
	if (microsoftAccount || state.replacedSignIn === 'github') {
		return microsoft;
	}
	return state.github ?? microsoft;
}
