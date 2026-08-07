/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'fs';
import { join } from '../../../../base/common/path.js';
import { vObj, vOptionalProp, vString, type ValidatorType } from '../../../../base/common/validation.js';

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
	/** Whether an existing local Claude setup was detected (see {@link detectExistingClaudeSetup}). */
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
 * resolving to `proxy` does not by itself make the session type "require
 * GitHub". Claude advertises the Copilot protected resource as `required: false`
 * unconditionally, so `resolveAgentAuthRequirement` separates "usable" from
 * "unusable" on the *model count* instead: in case 4 neither half of the merged
 * catalog can be enumerated, the published catalog is empty, and the type
 * resolves to `Unusable` — surfacing as "no models". The proxy fallback only
 * bites at use time, when a model-less/bare session actually materializes with no
 * proxy handle and `_ensureAuthenticated` raises `AHP_AUTH_REQUIRED`.
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
 * Validator for the slice of `~/.claude/settings.json` we care about: an
 * optional `env` block that may carry either recognized Anthropic credential.
 * Reuses the shared combinators in `base/common/validation.ts` so parsing the
 * untrusted file is type-safe without hand-rolled shape checks. This validator
 * is the single source of truth for the credential-key set — {@link
 * ClaudeCredentialEnv} is derived from it rather than hand-authored.
 */
const claudeSettingsValidator = vObj({
	env: vOptionalProp(vObj({
		ANTHROPIC_API_KEY: vOptionalProp(vString()),
		CLAUDE_CODE_OAUTH_TOKEN: vOptionalProp(vString()),
	})),
});

/**
 * The `env` block shape both `process.env` and `~/.claude/settings.json` are
 * probed for, derived from {@link claudeSettingsValidator} so the two never
 * drift. A non-empty value under either key is a usable native credential.
 */
type ClaudeCredentialEnv = NonNullable<ValidatorType<typeof claudeSettingsValidator>['env']>;

/**
 * Detects whether a local Claude configuration exists that lets Claude run
 * natively (without GitHub). Returns `true` when either:
 *
 *  - an `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` is set in the
 *    environment, or
 *  - either of those keys appears in the `env` block of
 *    `<homeDir>/.claude/settings.json`.
 *
 * These are the same credential sources the SDK subprocess env is built from
 * (see `buildSubprocessEnv`), so detecting them here means "asking for what we
 * actually need": when a native credential is present the provider never
 * advertises the GitHub Copilot resource, so the server never asks the client
 * for a GitHub token and no sign-in is triggered.
 *
 * Detection is deliberately conservative — an empty-string value does not count
 * — so it neither misses a real login nor misfires on a leftover blank entry.
 *
 * `env` and the settings-file path are the only external inputs, so both are
 * injectable: `env` defaults to `process.env` and the file is located under
 * `homeDir`, letting tests exercise real detection without stubbing globals.
 */
export function detectExistingClaudeSetup(homeDir: string, env: NodeJS.ProcessEnv = process.env): boolean {
	return hasClaudeCredential(env)
		|| hasClaudeCredential(readClaudeSettingsEnv(join(homeDir, '.claude', 'settings.json')));
}

/** True when either recognized Anthropic credential is present and non-empty. */
function hasClaudeCredential(env: ClaudeCredentialEnv | undefined): boolean {
	return !!(env?.ANTHROPIC_API_KEY || env?.CLAUDE_CODE_OAUTH_TOKEN);
}

/**
 * Reads and validates the `env` block of `~/.claude/settings.json`. Returns
 * `undefined` when the file is missing, unreadable, not valid JSON, or does not
 * match the expected shape.
 */
function readClaudeSettingsEnv(path: string): ClaudeCredentialEnv | undefined {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return undefined;
	}
	return claudeSettingsValidator.validate(parsed).content?.env;
}
