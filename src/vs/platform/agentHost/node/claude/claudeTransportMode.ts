/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'fs';
import { parse as parseJSONC, type ParseError } from '../../../../base/common/json.js';
import { join } from '../../../../base/common/path.js';
import { isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { isString } from '../../../../base/common/types.js';
import { vObj, vOptionalProp, vUnknown, type ValidatorType } from '../../../../base/common/validation.js';

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
 * Validators for the `~/.claude/settings.json` sources that indicate a usable
 * native setup, kept separate — and holding `unknown` rather than `vString()` —
 * so one malformed entry reads as absent instead of voiding its siblings.
 * {@link hasValue} is what decides usability.
 */
const claudeApiKeyHelperValidator = vObj({
	apiKeyHelper: vOptionalProp(vUnknown()),
});

const claudeSettingsEnvValidator = vObj({
	env: vOptionalProp(vObj({
		ANTHROPIC_API_KEY: vOptionalProp(vUnknown()),
		ANTHROPIC_AUTH_TOKEN: vOptionalProp(vUnknown()),
		ANTHROPIC_BASE_URL: vOptionalProp(vUnknown()),
		CLAUDE_CODE_OAUTH_TOKEN: vOptionalProp(vUnknown()),
	})),
});

/**
 * The `env` shape both `process.env` and `~/.claude/settings.json` are probed
 * for, derived from {@link claudeSettingsEnvValidator} so the two never drift.
 */
type ClaudeNativeEnv = NonNullable<ValidatorType<typeof claudeSettingsEnvValidator>['env']>;

/**
 * Whether a local Claude setup exists that can run without GitHub: a recognized
 * credential or endpoint key in `env` or `<homeDir>/.claude/settings.json`, or
 * that file's `apiKeyHelper`. Each source is read independently, so a malformed
 * value never masks a usable one.
 */
export function detectExistingClaudeSetup(homeDir: string, env: NodeJS.ProcessEnv = process.env): boolean {
	if (hasNativeClaudeEnv(env)) {
		return true;
	}
	const settings = readJsonFile(join(homeDir, '.claude', 'settings.json'));
	return hasNativeClaudeEnv(claudeSettingsEnvValidator.validate(settings).content?.env)
		|| hasValue(claudeApiKeyHelperValidator.validate(settings).content?.apiKeyHelper);
}

/** True when any recognized native-Claude key carries a usable value. */
function hasNativeClaudeEnv(env: ClaudeNativeEnv | undefined): boolean {
	return hasValue(env?.ANTHROPIC_API_KEY)
		|| hasValue(env?.ANTHROPIC_AUTH_TOKEN)
		|| hasValue(env?.ANTHROPIC_BASE_URL)
		|| hasValue(env?.CLAUDE_CODE_OAUTH_TOKEN);
}

/** A setting counts only when it actually carries a value, never a blank leftover. */
function hasValue(value: unknown): value is string {
	return isString(value) && !isFalsyOrWhitespace(value);
}

/** Parsed JSON, or `undefined` when the file is missing, unreadable or malformed. */
function readJsonFile(path: string): unknown {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch {
		return undefined;
	}
	// The tolerant parser reports on `errors` rather than throwing, and salvages a
	// partial result from broken input — so a truncated file has to be rejected
	// here, or half a credential reads as a setup the CLI could not load either.
	const errors: ParseError[] = [];
	const parsed: unknown = parseJSONC(text, errors, { allowTrailingComma: true, allowEmptyContent: true });
	return errors.length === 0 ? parsed : undefined;
}
