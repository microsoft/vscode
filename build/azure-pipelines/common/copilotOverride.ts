/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

/**
 * Shared parsing/resolution for the `copilotOverride` mechanism.
 *
 * `copilotOverride` is a top-level object in the root `package.json` (alongside
 * `distro`) that overrides the `@github/copilot` (runtime) and
 * `@github/copilot-sdk` packages VS Code depends on. It is keyed by npm package
 * name — matching the `dependencies` entry it overrides — and each value is one
 * of:
 *
 *   - empty        -> no override (use the version pinned in `dependencies`)
 *   - <npm-spec>   -> a published version/range/dist-tag, e.g. `1.2.3`
 *   - <40-hex sha> -> build from source at that commit (never drifts)
 *
 * A bare full 40-character lowercase commit SHA selects a source build — no npm
 * version/range/dist-tag is 40 hex chars, so the two never collide — while
 * branches and tags are not accepted, so a committed override can never move
 * under us. Queue-time pipeline parameters surface as the environment variables
 * `VSCODE_COPILOT_SDK` / `VSCODE_COPILOT_RUNTIME` and take precedence over the
 * committed field so one-off builds don't need a commit.
 */

/** The two overridable packages, by short id (used for env vars and logging). */
export type CopilotPackageId = 'sdk' | 'runtime';

interface CopilotPackage {
	readonly pkg: CopilotPackageId;
	/** npm package name — the `copilotOverride` key and the manifest dependency. */
	readonly npmName: string;
	/**
	 * `owner/name` GitHub repository a commit override is built from.
	 * `@github/copilot` is published from the internal copilot-agent-runtime repo,
	 * so source builds of it require credentials (a GitHub App installation token).
	 */
	readonly repo: string;
}

const COPILOT_PACKAGES: readonly CopilotPackage[] = [
	{ pkg: 'sdk', npmName: '@github/copilot-sdk', repo: 'github/copilot-sdk' },
	{ pkg: 'runtime', npmName: '@github/copilot', repo: 'github/copilot-agent-runtime' },
];

/**
 * A published-version override: pin the manifest to a concrete feed version,
 * range or dist-tag and let `npm ci` resolve it.
 */
export interface FeedOverride {
	readonly pkg: CopilotPackageId;
	readonly npmName: string;
	readonly kind: 'feed';
	/** npm version / range / dist-tag, e.g. `1.2.3`, `^1.2.0`, `latest`. */
	readonly spec: string;
}

/**
 * A source override: build the package from `repo` at `ref` (a commit SHA),
 * then consume the result locally.
 */
export interface GitOverride {
	readonly pkg: CopilotPackageId;
	readonly npmName: string;
	readonly kind: 'git';
	/** `owner/name` GitHub repository the package is built from. */
	readonly repo: string;
	/** Full 40-character commit SHA to build. */
	readonly ref: string;
}

export type CopilotOverride = FeedOverride | GitOverride;

/**
 * Allowlist for values interpolated into `npm view`/`git` argument strings and
 * (on Windows) run with `shell: true`. Restricts to characters that appear in
 * valid semver versions/ranges/dist-tags and git refs, rejecting anything a
 * shell could otherwise interpret. Mirrors the canary override's `SAFE_SPEC`.
 */
const SAFE_SPEC = /^[\w./+~^><=|* @#-]+$/;

function assertSafeSpec(label: string, value: string): void {
	if (!SAFE_SPEC.test(value)) {
		throw new Error(`[copilot-override] Refusing unsafe ${label} "${value}": only semver specs and commit SHAs are allowed.`);
	}
}

/** A bare full commit SHA selects a source build (no npm spec is 40 hex chars). */
const COMMIT_SHA = /^[0-9a-f]{40}$/;
/** Hex-ish values that are probably a mistyped commit (short or upper-case). */
const COMMIT_SHA_LIKE = /^[0-9a-fA-F]{7,40}$/;

/**
 * Reads the root `package.json` `copilotOverride` field merged with the
 * `VSCODE_COPILOT_*` environment overrides and returns one resolved override per
 * package that requests one. Returns an empty array for a normal build (all
 * values empty).
 *
 * @param root repository root containing `package.json`.
 * @param env  environment to read queue-time overrides from (defaults to process.env).
 */
export function resolveCopilotOverrides(root: string, env: NodeJS.ProcessEnv = process.env): CopilotOverride[] {
	const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
	const field: Record<string, unknown> = packageJson.copilotOverride ?? {};

	// A misspelled package name would otherwise be silently ignored.
	for (const key of Object.keys(field)) {
		if (!COPILOT_PACKAGES.some(p => p.npmName === key)) {
			throw new Error(`[copilot-override] Unknown package "${key}" in package.json copilotOverride. Expected one of: ${COPILOT_PACKAGES.map(p => p.npmName).join(', ')}.`);
		}
	}

	const overrides: CopilotOverride[] = [];
	for (const { pkg, npmName, repo } of COPILOT_PACKAGES) {
		// Env (queue-time pipeline parameter) wins over the committed field, but an
		// empty/whitespace env value means "unset" and falls back to package.json —
		// the pipeline normalizes its 'default' sentinel to an empty string.
		const envValue = (env[`VSCODE_COPILOT_${pkg.toUpperCase()}`] ?? '').trim();
		const committed = typeof field[npmName] === 'string' ? field[npmName] as string : '';
		const value = (envValue || committed).trim();
		if (!value) {
			continue;
		}

		if (COMMIT_SHA.test(value)) {
			// A full 40-char lowercase SHA builds the package from source at that commit.
			overrides.push({ pkg, npmName, kind: 'git', repo, ref: value });
		} else if (COMMIT_SHA_LIKE.test(value)) {
			// A short or upper-case hash would otherwise fall through to the feed and
			// fail later with a confusing "version not found"; reject it up front.
			throw new Error(`[copilot-override] "${npmName}" override "${value}" looks like a commit but is not a full 40-character lowercase SHA. Use the full commit hash (source build) or a published version (feed).`);
		} else {
			assertSafeSpec(`${npmName} version`, value);
			overrides.push({ pkg, npmName, kind: 'feed', spec: value });
		}
	}
	return overrides;
}
