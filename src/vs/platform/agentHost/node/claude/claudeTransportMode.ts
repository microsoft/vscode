/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AccountInfo } from '@anthropic-ai/claude-agent-sdk';

/**
 * Resolved Claude host transport. `proxy` routes Anthropic traffic through the
 * local Copilot-CAPI proxy (requires GitHub auth); `native` talks to Anthropic
 * directly on the user's own credentials (no GitHub).
 */
export type ClaudeTransportMode = 'proxy' | 'native';

/**
 * The three precedence inputs {@link resolveClaudeTransportMode} decides over.
 */
export interface IClaudeTransportModeInputs {
	/** Whether the experimentation flag enabling signed-out-when-usable is on. */
	readonly allowSignedOutWhenUsable: boolean;
	/** Whether a GitHub Copilot token has been captured (i.e. signed in). */
	readonly hasGitHubToken: boolean;
	/** Whether the SDK reported a Claude setup usable on the user's own credentials (see {@link isClaudeAccountSetUp}). */
	readonly hasExistingSetup: boolean;
}

/**
 * Which transport should the Claude provider fall back to right now? Pure
 * decision; precedence, highest first:
 *
 *  1. Feature flag off means today's default behavior (always proxy).
 *  2. Signed in to GitHub prefers Copilot (proxy).
 *  3. Signed out but with the user's own Claude credentials uses native (no GitHub).
 *  4. Nothing usable still falls back to proxy — the safe end, since attempting
 *     native with no credential would fail inside the SDK rather than at a
 *     surface that can explain itself.
 *
 * This is only the *fallback* for a session whose model names no provider. A
 * provider-qualified model routes on its own provider
 * (`resolveClaudeSessionTransport`), so getting this decision right is what lets
 * a signed-out user with their own credentials start working without being
 * forced to sign in.
 *
 * The result is **not** an input to the Agents window's sign-in gate, and
 * resolving to `proxy` does not by itself make the session type "require GitHub".
 * `getProtectedResources()` marks the Copilot resource `required: false`
 * unconditionally, so nothing decided here can raise a sign-in wall. What
 * separates `None` from `Unusable` downstream is the *model count*, published
 * from the same `accountInfo()` answer that feeds `hasExistingSetup` here — so
 * the two cannot disagree about one user. The proxy fallback of case 4 only
 * bites at use time, when a model-less session materializes with no proxy handle
 * and `_ensureAuthenticated` raises `AHP_AUTH_REQUIRED`.
 *
 * There is deliberately no host-global setting to *prefer* a transport. Since
 * the picker offers both providers' models side by side, transport is downstream
 * of the model the user picked; a flag would keep disagreeing with what the
 * picker shows (it could not stop a Copilot-routed model from being offered or
 * chosen, because neither model enumeration nor the advertised protected
 * resources would consult it). Expressing a preference is a *model*-selection
 * concern — a default/sticky model — not a transport one.
 */
export function resolveClaudeTransportMode(inputs: IClaudeTransportModeInputs): ClaudeTransportMode {
	const { allowSignedOutWhenUsable, hasGitHubToken, hasExistingSetup } = inputs;
	if (!allowSignedOutWhenUsable) {
		return 'proxy';
	}
	if (hasGitHubToken) {
		return 'proxy';
	}
	if (hasExistingSetup) {
		return 'native';
	}
	return 'proxy';
}

/**
 * Whether the SDK's own account report describes a Claude setup that can serve
 * requests on the user's own credentials — the single rule behind both the
 * advertised requirement and the native model catalog. Only the SDK can answer
 * honestly: a `claude login` credential lives in the macOS keychain, invisible
 * to `process.env` and `~/.claude/settings.json` alike.
 *
 * The two branches must NOT be collapsed. `apiProvider` reports `'firstParty'`
 * even for an empty home directory, so it is a presence signal for nobody — it
 * is consulted only to spot a *third-party* backend (Bedrock, Vertex, a
 * gateway), whose credential fields the SDK documents as absent because auth is
 * external. Requiring a credential field there would lock every one of them out.
 *
 * Says *configured*, not *working*: verifying would cost a billable request per
 * check, and the failure being fixed here is genuinely set-up users locked out.
 */
export function isClaudeAccountSetUp(account: AccountInfo | undefined): boolean {
	if (!account) {
		return false;
	}
	if (account.apiProvider !== undefined && account.apiProvider !== 'firstParty') {
		return true;
	}
	// `tokenSource` spells "no credential" as `'none'` rather than absence;
	// `apiKeySource` has only ever been observed absent in that case.
	return (account.tokenSource !== undefined && account.tokenSource !== 'none')
		|| account.apiKeySource !== undefined;
}
