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
 * GitHub". That answer is `getProtectedResources()`, which marks the Copilot
 * resource `required: false` on the same `hasExistingSetup` fact used here — so
 * the two agree by construction: a user with their own Anthropic credential is
 * not forced to sign in, and one without (case 4) is. `resolveAgentAuthRequirement`
 * then separates `None` from `Unusable` on the *model count*, since a
 * `required: false` agent that cannot enumerate a single model must not hold the
 * window open. The proxy fallback of case 4 only bites at use time, when a
 * model-less/bare session actually materializes with no proxy handle and
 * `_ensureAuthenticated` raises `AHP_AUTH_REQUIRED`.
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
 * Validator for the slice of `~/.claude/settings.json` we care about: the
 * top-level `apiKeyHelper`, plus an optional `env` block that may carry any
 * recognized Anthropic credential or endpoint override. Reuses the shared
 * combinators in `base/common/validation.ts` so parsing the untrusted file is
 * type-safe without hand-rolled shape checks. Unknown properties (`model`,
 * `permissions`, …) are ignored rather than rejected, so a real settings file
 * still validates. This validator is the single source of truth for the key
 * set — {@link ClaudeNativeEnv} is derived from it rather than hand-authored.
 */
const claudeSettingsValidator = vObj({
	// A command the CLI runs to mint an API key. File-only: it has no
	// environment-variable counterpart, hence its place outside `env`.
	apiKeyHelper: vOptionalProp(vString()),
	env: vOptionalProp(vObj({
		ANTHROPIC_API_KEY: vOptionalProp(vString()),
		ANTHROPIC_AUTH_TOKEN: vOptionalProp(vString()),
		ANTHROPIC_BASE_URL: vOptionalProp(vString()),
		CLAUDE_CODE_OAUTH_TOKEN: vOptionalProp(vString()),
	})),
});

type ClaudeSettings = ValidatorType<typeof claudeSettingsValidator>;

/**
 * The `env` block shape both `process.env` and `~/.claude/settings.json` are
 * probed for, derived from {@link claudeSettingsValidator} so the two never
 * drift. A non-empty value under any key means Claude can reach Anthropic
 * without Copilot: a credential of its own, or a base-URL override pointing at
 * a gateway that supplies one.
 */
type ClaudeNativeEnv = NonNullable<ClaudeSettings['env']>;

/**
 * Detects whether a local Claude configuration exists that lets Claude run
 * natively (without GitHub). Returns `true` when any of the following is set to
 * a non-empty value:
 *
 *  - `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, or
 *    `CLAUDE_CODE_OAUTH_TOKEN` in the environment,
 *  - any of those keys in the `env` block of `<homeDir>/.claude/settings.json`,
 *  - the top-level `apiKeyHelper` in that same file — a command the CLI runs to
 *    mint a key, so a setup can be complete with no credential stored anywhere.
 *
 * The first two are the credential sources the SDK subprocess env is built from
 * (`buildSubprocessEnv` spreads the real `process.env` in native mode); the
 * third is honored by the CLI itself, which reads the same user settings file
 * (`settingSources` includes `'user'`). A base URL counts on its own because it
 * points Claude at a gateway that supplies the credential. The proxy transport
 * also injects `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`, but into the
 * subprocess *settings* env rather than this process's, so its own plumbing
 * can't read back as a native setup.
 *
 * Detecting what the SDK will actually go on to use means "asking for what we
 * really need": when a native setup is present the provider advertises the
 * GitHub Copilot resource as `required: false`, so no sign-in is forced — while
 * still letting the host silently forward a token to a user who is signed in
 * anyway.
 *
 * Only presence is tested, never the value: nothing here reads a credential
 * beyond asking whether it is a non-empty string. Detection is deliberately
 * conservative — an empty-string value does not count — so it neither misses a
 * real login nor misfires on a leftover blank entry.
 *
 * `env` and the settings-file path are the only external inputs, so both are
 * injectable: `env` defaults to `process.env` and the file is located under
 * `homeDir`, letting tests exercise real detection without stubbing globals.
 */
export function detectExistingClaudeSetup(homeDir: string, env: NodeJS.ProcessEnv = process.env): boolean {
	if (hasNativeClaudeEnv(env)) {
		return true;
	}
	const settings = readClaudeSettings(join(homeDir, '.claude', 'settings.json'));
	return hasNativeClaudeEnv(settings?.env) || !!settings?.apiKeyHelper;
}

/** True when any recognized native-Claude key is present and non-empty. */
function hasNativeClaudeEnv(env: ClaudeNativeEnv | undefined): boolean {
	return !!(env?.ANTHROPIC_API_KEY
		|| env?.ANTHROPIC_AUTH_TOKEN
		|| env?.ANTHROPIC_BASE_URL
		|| env?.CLAUDE_CODE_OAUTH_TOKEN);
}

/**
 * Reads and validates `~/.claude/settings.json`. Returns `undefined` when the
 * file is missing, unreadable, not valid JSON, or does not match the expected
 * shape — unknown properties are ignored, so only a wrong *type* on a
 * recognized key fails validation.
 */
function readClaudeSettings(path: string): ClaudeSettings | undefined {
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
	return claudeSettingsValidator.validate(parsed).content;
}
