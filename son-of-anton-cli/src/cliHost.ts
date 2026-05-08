/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
	ConfigChangeEvent,
	ConfigStore,
	CoreHost,
	Disposable,
	FileStore,
	MementoStore,
	Notifier,
	ProjectContextProvider,
	SecretStore,
} from 'son-of-anton-core/dist/host';

const SOTA_DIR = path.join(os.homedir(), '.son-of-anton');
const DATA_DIR = path.join(SOTA_DIR, 'data');
const CONFIG_PATH = path.join(SOTA_DIR, 'config.json');
const SECRETS_PATH = path.join(DATA_DIR, 'secrets.json');
const STATE_PATH = path.join(DATA_DIR, 'state.json');

function ensureDirs(): void {
	if (!fs.existsSync(SOTA_DIR)) {
		fs.mkdirSync(SOTA_DIR, { recursive: true, mode: 0o700 });
	}
	if (!fs.existsSync(DATA_DIR)) {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	}
}

function readJson<T>(file: string, fallback: T): T {
	try {
		const raw = fs.readFileSync(file, 'utf-8');
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function writeJson(file: string, value: unknown, mode = 0o600): void {
	ensureDirs();
	fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode });
}

class FileSecretStore implements SecretStore {
	async get(key: string): Promise<string | undefined> {
		const data = readJson<Record<string, string>>(SECRETS_PATH, {});
		return data[key];
	}
	async store(key: string, value: string): Promise<void> {
		const data = readJson<Record<string, string>>(SECRETS_PATH, {});
		data[key] = value;
		writeJson(SECRETS_PATH, data);
	}
	async delete(key: string): Promise<void> {
		const data = readJson<Record<string, string>>(SECRETS_PATH, {});
		delete data[key];
		writeJson(SECRETS_PATH, data);
	}
}

class FileConfigStore implements ConfigStore {
	private listeners: Array<(event: ConfigChangeEvent) => void> = [];

	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get<T>(key: string, defaultValue?: T): T | undefined {
		const data = readJson<Record<string, unknown>>(CONFIG_PATH, {});
		if (Object.prototype.hasOwnProperty.call(data, key)) {
			return data[key] as T;
		}
		// Allow simple dotted-key lookup so callers can read e.g. `sota.foo.bar`
		// even when stored as a nested object on the parent key.
		const dotted = lookupDotted<T>(data, key);
		if (dotted !== undefined) {
			return dotted;
		}
		return defaultValue;
	}

	async update(key: string, value: unknown): Promise<void> {
		const data = readJson<Record<string, unknown>>(CONFIG_PATH, {});
		if (value === undefined) {
			delete data[key];
		} else {
			data[key] = value;
		}
		writeJson(CONFIG_PATH, data);
		const event: ConfigChangeEvent = { affectsConfiguration: (section: string) => section === key || key.startsWith(section + '.') };
		for (const l of this.listeners) {
			try { l(event); } catch { /* swallow listener errors in CLI */ }
		}
	}

	onDidChange(listener: (event: ConfigChangeEvent) => void): Disposable {
		this.listeners.push(listener);
		return {
			dispose: () => {
				this.listeners = this.listeners.filter(l => l !== listener);
			},
		};
	}
}

function lookupDotted<T>(data: Record<string, unknown>, key: string): T | undefined {
	const parts = key.split('.');
	let current: unknown = data;
	for (const part of parts) {
		if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
			current = (current as Record<string, unknown>)[part];
		} else {
			return undefined;
		}
	}
	return current as T;
}

class FileMementoStore implements MementoStore {
	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get<T>(key: string, defaultValue?: T): T | undefined {
		const data = readJson<Record<string, unknown>>(STATE_PATH, {});
		const value = data[key];
		return value === undefined ? defaultValue : (value as T);
	}
	async update(key: string, value: unknown): Promise<void> {
		const data = readJson<Record<string, unknown>>(STATE_PATH, {});
		if (value === undefined) {
			delete data[key];
		} else {
			data[key] = value;
		}
		writeJson(STATE_PATH, data);
	}
}

class CliNotifier implements Notifier {
	info(message: string): void { process.stdout.write(message + '\n'); }
	warn(message: string): void { process.stderr.write('warn: ' + message + '\n'); }
	error(message: string): void { process.stderr.write('error: ' + message + '\n'); }
}

/**
 * Search order for project-context files, mirroring the extension's
 * `AgentsMdLoader.CANDIDATES`. The first match wins per root; the CLI v1
 * deliberately does not watch the filesystem because each `sota` invocation
 * is short-lived.
 */
const PROJECT_CONTEXT_CANDIDATES: ReadonlyArray<string> = [
	path.join('.son-of-anton', 'AGENTS.md'),
	'AGENTS.md',
	'CLAUDE.md',
];

const PROJECT_CONTEXT_BYTE_CAP = 8 * 1024;

/**
 * CLI-side `ProjectContextProvider`. Reads the highest-priority context file
 * from the supplied working directory once at host construction time, caps
 * it to {@link PROJECT_CONTEXT_BYTE_CAP} bytes, and never refreshes — there
 * is no watcher in the CLI v1 because the process exits after a single
 * agent invocation.
 *
 * Returns `undefined` from {@link get} when no candidate file is present, so
 * the agents' system prompt naturally omits the "Project Context" section.
 */
class CwdProjectContextProvider implements ProjectContextProvider {
	private readonly cached: string | undefined;

	constructor(cwd: string) {
		this.cached = readFirstProjectContext(cwd);
	}

	get(): string | undefined {
		return this.cached;
	}

	onDidChange(_listener: () => void): Disposable {
		// Static for the lifetime of a CLI invocation; no events ever fire.
		return { dispose: () => { /* no-op */ } };
	}
}

/**
 * Try each candidate path under `cwd` in priority order; return the first one
 * that reads successfully, byte-capped and tagged with a truncation marker
 * when applicable.
 *
 * @internal exported for unit tests; treat as private to this module.
 */
export function readFirstProjectContext(cwd: string): string | undefined {
	for (const rel of PROJECT_CONTEXT_CANDIDATES) {
		const abs = path.join(cwd, rel);
		try {
			const raw = fs.readFileSync(abs);
			if (raw.length <= PROJECT_CONTEXT_BYTE_CAP) {
				return raw.toString('utf-8');
			}
			const head = raw.subarray(0, PROJECT_CONTEXT_BYTE_CAP).toString('utf-8');
			return `${head}\n\n[truncated — file longer than 8KB]`;
		} catch {
			// File missing or unreadable; try the next candidate.
		}
	}
	return undefined;
}

class FsFileStore implements FileStore {
	async read(p: string): Promise<Uint8Array> {
		return fs.promises.readFile(p);
	}
	async write(p: string, content: Uint8Array): Promise<void> {
		await fs.promises.writeFile(p, content);
	}
	async exists(p: string): Promise<boolean> {
		try {
			await fs.promises.access(p);
			return true;
		} catch {
			return false;
		}
	}
	async list(p: string): Promise<ReadonlyArray<{ name: string; isDirectory: boolean }>> {
		const entries = await fs.promises.readdir(p, { withFileTypes: true });
		return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
	}
}

export function buildCliHost(): CoreHost {
	const cwd = process.cwd();
	return {
		secrets: new FileSecretStore(),
		config: new FileConfigStore(),
		files: new FsFileStore(),
		notifier: new CliNotifier(),
		workspace: {
			folders: [{ fsPath: cwd, name: path.basename(cwd) }],
			isTrusted: true,
		},
		globalState: new FileMementoStore(),
		projectContext: new CwdProjectContextProvider(cwd),
	};
}

export const SOTA_PATHS = {
	root: SOTA_DIR,
	data: DATA_DIR,
	config: CONFIG_PATH,
	secrets: SECRETS_PATH,
	state: STATE_PATH,
};
