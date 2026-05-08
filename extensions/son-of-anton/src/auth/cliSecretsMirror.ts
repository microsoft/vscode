/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { SECRET_KEYS } from 'son-of-anton-core/credentials/credentialDetection';

/**
 * One-direction sync: copy values from the IDE's `vscode.SecretStorage` into
 * the file-backed secret store the `son-of-anton-cli` reads from
 * (`~/.son-of-anton/secrets.json`). When users configure providers in the IDE,
 * the CLI inherits the same credentials without having to re-export env vars.
 *
 * The CLI's secret store has a fixed location; we don't try to discover it.
 * If the user moves it (rare), the sync is a no-op rather than a corruption
 * risk.
 *
 * Mirrored at activation (one-shot sweep) and on every credential save (live
 * via `context.secrets.onDidChange`). The IDE's `SecretStorage` remains the
 * canonical store; the file is a downstream view.
 *
 * SECURITY: writes the JSON file with `mode: 0o600` (owner read/write only).
 * If multiple users share the machine, each gets their own copy under their
 * own home directory, matching the IDE's per-user `SecretStorage` scope.
 */

const SOTA_DIR = path.join(os.homedir(), '.son-of-anton');
const DATA_DIR = path.join(SOTA_DIR, 'data');
const SECRETS_PATH = path.join(DATA_DIR, 'secrets.json');

// Match the CLI's `FileSecretStore` shape: a JSON object whose top-level keys
// are the SECRET_KEYS values (same strings the IDE uses). Any field the IDE
// doesn't have is left untouched (don't trample CLI-only values like
// env-var-mirrored entries from a prior run).
type SecretsFile = Record<string, string>;

function ensureDataDir(): void {
	if (!fs.existsSync(SOTA_DIR)) {
		fs.mkdirSync(SOTA_DIR, { recursive: true, mode: 0o700 });
	}
	if (!fs.existsSync(DATA_DIR)) {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	}
}

function readExisting(): SecretsFile {
	try {
		const raw = fs.readFileSync(SECRETS_PATH, 'utf-8');
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as SecretsFile;
		}
	} catch {
		// File missing or malformed — start fresh.
	}
	return {};
}

function writeMerged(merged: SecretsFile): void {
	ensureDataDir();
	fs.writeFileSync(SECRETS_PATH, JSON.stringify(merged, null, 2), { mode: 0o600 });
}

/**
 * Sweep every known secret key in the IDE's SecretStorage and write the
 * present ones to the CLI's file store. Returns the number of keys mirrored
 * for diagnostics; callers can log this once at activation.
 */
export async function mirrorSecretsToCliStore(secrets: vscode.SecretStorage): Promise<number> {
	const existing = readExisting();
	let written = 0;
	for (const key of Object.values(SECRET_KEYS)) {
		try {
			const value = await secrets.get(key);
			if (value && value.trim()) {
				existing[key] = value;
				written++;
			}
		} catch {
			// SecretStorage failures are silent (corrupt keychain entries
			// shouldn't take down activation); the absent key just won't be
			// mirrored this cycle.
		}
	}
	if (written > 0) {
		writeMerged(existing);
	}
	return written;
}

/**
 * Subscribe to `context.secrets.onDidChange` and re-mirror the changed key
 * to the CLI store on every save. Returns the disposable so the caller can
 * register it with `context.subscriptions`.
 */
export function watchSecretsForCliMirror(secrets: vscode.SecretStorage): vscode.Disposable {
	return secrets.onDidChange(async event => {
		// Only mirror keys we know about — avoids churning the file on
		// unrelated SecretStorage activity from other features.
		if (!Object.values(SECRET_KEYS).includes(event.key as typeof SECRET_KEYS[keyof typeof SECRET_KEYS])) {
			return;
		}
		const existing = readExisting();
		try {
			const value = await secrets.get(event.key);
			if (value && value.trim()) {
				existing[event.key] = value;
			} else {
				// Key was cleared in the IDE — propagate the deletion so the
				// CLI doesn't keep reading a stale credential.
				delete existing[event.key];
			}
			writeMerged(existing);
		} catch {
			// Same defensive policy as the bulk sweep.
		}
	});
}
