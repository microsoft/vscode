/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SOTA_EXIT_CODES } from '../headless';

interface UpdateOptions {
	check?: boolean;
	output?: 'text' | 'json';
}

const REGISTRY_URL = 'https://registry.npmjs.org/son-of-anton-cli';
const CACHE_FILE = path.join(os.homedir(), '.son-of-anton', 'data', 'update-check.json');
const QUIET_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface UpdateCheckResult {
	current: string;
	latest: string;
	upToDate: boolean;
	upgradeCommand: string;
}

interface RegistryResponse {
	'dist-tags'?: { latest?: string };
}

/**
 * Lazy-load the package version from the bundled package.json. Reading at
 * call-time (rather than top-level) keeps the import side-effect-free and
 * makes the function easy to test.
 */
function readCurrentVersion(): string {
	const pkgPath = path.join(__dirname, '..', '..', 'package.json');
	try {
		const raw = fs.readFileSync(pkgPath, 'utf8');
		const parsed = JSON.parse(raw) as { version?: string };
		return parsed.version ?? '0.0.0';
	} catch {
		return '0.0.0';
	}
}

/**
 * Compare two semver-ish version strings. Treats missing parts as 0; ignores
 * pre-release suffixes (anything after `-`). Sufficient for "is the new one
 * strictly greater" — full semver comparison would pull in another dep.
 */
function isStrictlyGreater(candidate: string, base: string): boolean {
	const parse = (v: string): number[] => v.split('-')[0].split('.').map((p) => parseInt(p, 10) || 0);
	const a = parse(candidate);
	const b = parse(base);
	for (let i = 0; i < 3; i++) {
		const av = a[i] ?? 0;
		const bv = b[i] ?? 0;
		if (av > bv) {
			return true;
		}
		if (av < bv) {
			return false;
		}
	}
	return false;
}

async function fetchLatestVersion(): Promise<string | null> {
	try {
		const res = await fetch(REGISTRY_URL, {
			headers: { Accept: 'application/vnd.npm.install-v1+json' },
		});
		if (!res.ok) {
			return null;
		}
		const body = (await res.json()) as RegistryResponse;
		return body['dist-tags']?.latest ?? null;
	} catch {
		return null;
	}
}

/**
 * Public helper consumed by `sota chat` startup: at most once per
 * `QUIET_CHECK_INTERVAL_MS`, fetch the latest version and write a banner to
 * stderr if a newer one exists. Failures (offline, registry blip) are
 * intentionally silent — an update nag must never block the REPL.
 */
export async function maybeNagAboutUpdate(): Promise<void> {
	try {
		const cached = readCache();
		if (cached && Date.now() - cached.checkedAt < QUIET_CHECK_INTERVAL_MS) {
			return;
		}
		const latest = await fetchLatestVersion();
		if (!latest) {
			return;
		}
		const current = readCurrentVersion();
		writeCache({ checkedAt: Date.now(), latest });
		if (isStrictlyGreater(latest, current)) {
			process.stderr.write(
				`(sota ${latest} is available — current ${current}. Upgrade with: npm i -g son-of-anton-cli@latest)\n`,
			);
		}
	} catch {
		// Quiet by design.
	}
}

interface UpdateCache {
	checkedAt: number;
	latest: string;
}

function readCache(): UpdateCache | null {
	try {
		const raw = fs.readFileSync(CACHE_FILE, 'utf8');
		const parsed = JSON.parse(raw) as UpdateCache;
		if (typeof parsed.checkedAt === 'number' && typeof parsed.latest === 'string') {
			return parsed;
		}
		return null;
	} catch {
		return null;
	}
}

function writeCache(cache: UpdateCache): void {
	try {
		fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true, mode: 0o700 });
		fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), { mode: 0o600 });
	} catch {
		// Cache failures are not fatal.
	}
}

/**
 * Top-level `sota update` command. Currently performs a check and prints the
 * upgrade command rather than rewriting the binary in-place; in-place
 * replacement is deferred until we ship a single-file build (see
 * docs/cli-upgrade-plan.md Phase CLI13). Most users install via
 * `npm i -g son-of-anton-cli`, where `npm` is the right tool to drive the
 * upgrade anyway.
 */
export async function runUpdate(opts: UpdateOptions): Promise<void> {
	const current = readCurrentVersion();
	const latest = await fetchLatestVersion();

	if (!latest) {
		const message = 'Could not reach the npm registry to check for updates.';
		if (opts.output === 'json') {
			process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n');
		} else {
			process.stderr.write(`error: ${message}\n`);
		}
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}

	const upToDate = !isStrictlyGreater(latest, current);
	const result: UpdateCheckResult = {
		current,
		latest,
		upToDate,
		upgradeCommand: 'npm i -g son-of-anton-cli@latest',
	};

	writeCache({ checkedAt: Date.now(), latest });

	if (opts.output === 'json') {
		process.stdout.write(JSON.stringify(result, null, 2) + '\n');
		return;
	}

	if (upToDate) {
		process.stdout.write(`sota ${current} is the latest release.\n`);
		return;
	}

	process.stdout.write(`A newer release is available: ${latest} (you have ${current}).\n`);
	process.stdout.write(`Upgrade with:\n  ${result.upgradeCommand}\n`);
	if (opts.check) {
		// `--check` exits 0 even when an upgrade is available — the result is in stdout.
		return;
	}
}
