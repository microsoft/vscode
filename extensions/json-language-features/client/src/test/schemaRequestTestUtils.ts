/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { promises as fs, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import * as path from 'path';
import { parse } from 'url';
import { compileFunction, createContext } from 'vm';
import type { ExtensionContext, Uri } from 'vscode';

type UrlMatcher = typeof import('../utils/urlMatch');
type ClientMain = typeof import('../node/jsonClientMain');

export interface RequestOptions {
	trustedDomains: Record<string, boolean>;
	downloadEnabled?: boolean;
	workspaceTrusted?: boolean;
	schemas?: { url: string }[];
	extensionSchemas?: string[];
	cache?: boolean;
	schemaResponse?: () => { content: string; etag?: string };
	onCacheUpdate?: () => Promise<void>;
}

export interface RequestRecord {
	url: string;
	host: string | null;
	path: string | null;
}

class Disposable {
	constructor(private readonly callback: () => void = () => { }) { }
	dispose() { this.callback(); }
	static from(...disposables: Disposable[]) {
		return new Disposable(() => disposables.forEach(disposable => disposable.dispose()));
	}
}

class MessageType {
	constructor(readonly method: string) { }
}

class ResponseError extends Error {
	constructor(readonly code: number, message: string, readonly data?: object) {
		super(message);
	}
}

async function getUri(): Promise<typeof Uri> {
	const outDir = process.argv.includes('--build') ? 'out-build' : 'out';
	const uriModule = path.join(__dirname, '..', '..', '..', '..', '..', outDir, 'vs', 'base', 'common', 'uri.js');
	return createRequire(__filename)(uriModule).URI;
}

function createLoader(mocks: Record<string, object>, globals: Record<string, object> = {}) {
	const context = createContext({ URL, TextDecoder, console, ...globals });
	const cache = new Map<string, { exports: object }>();
	return function load<T extends object>(filename: string): T {
		filename = path.resolve(filename);
		const cached = cache.get(filename);
		if (cached) {
			return cached.exports as T;
		}
		const module = { exports: {} };
		cache.set(filename, module);
		const requireMock = (id: string): object => {
			if (Object.hasOwn(mocks, id)) {
				return mocks[id];
			}
			assert.ok(id.startsWith('.'), `Unexpected dependency: ${id}`);
			return load(path.resolve(path.dirname(filename), id + '.js'));
		};
		const run = compileFunction(readFileSync(filename, 'utf8'), ['require', 'module', 'exports'], { filename, parsingContext: context });
		run(requireMock, module, module.exports);
		return module.exports as T;
	};
}

export async function createMatcher() {
	const Uri = await getUri();
	const load = createLoader({ vscode: { Uri } });
	const { matchesUrlPattern } = load<UrlMatcher>(path.join(__dirname, '..', 'utils', 'urlMatch.js'));
	return (value: string, domains: Record<string, boolean>) => matchesUrlPattern(Uri.parse(value), domains);
}

export async function createSchemaClient(transport: 'browser' | 'node', options: RequestOptions) {
	const Uri = await getUri();
	const requests: RequestRecord[] = [];
	const checked: { url: string; allowed: boolean }[] = [];
	const documents: string[] = [];
	const files: string[] = [];
	const handlers = new Map<string, (url: string) => Promise<string>>();
	const commands = new Map<string, () => Promise<void>>();
	const schemaNotifications: string[][] = [];
	const cacheDirectory = options.cache ? await fs.mkdtemp(path.join(tmpdir(), 'json-schema-cache-test-')) : undefined;
	const state = new Map<string, object>();
	const subscriptions: Disposable[] = [];
	const disposable = () => new Disposable();
	const statusItem = () => ({ dispose() { }, update() { } });
	const log = { info() { }, trace() { }, error() { }, dispose() { } };
	const schema = '{"type":"object"}';

	class LanguageClient {
		registerProposedFeatures() { }
		onRequest(type: MessageType, handler: (url: string) => Promise<string>) {
			handlers.set(type.method, handler);
			return disposable();
		}
		async start() { }
		async stop() { }
		async sendNotification(type: MessageType, value: string | string[]) {
			if (type.method === 'json/schemaContent') {
				schemaNotifications.push(typeof value === 'string' ? [value] : [...value]);
			}
		}
	}

	const protocol = {
		LanguageClient,
		RequestType: MessageType,
		NotificationType: MessageType,
		ResponseError,
		TransportKind: { ipc: 1 },
	};
	const extensionSchemas = (options.extensionSchemas ?? []).map(url => ({ fileMatch: '*.json', url }));
	const extension = { packageJSON: { contributes: { jsonValidation: extensionSchemas } } };
	const mocks = {
		vscode: {
			Uri,
			Disposable,
			RelativePattern: class { },
			StatusBarAlignment: { Right: 2 },
			CodeActionKind: { QuickFix: 'quickfix' },
			LogLevel: { Trace: 1 },
			env: { appName: 'Schema Tests', appHost: transport },
			l10n: { t: (message: string) => message },
			commands: {
				registerCommand: (id: string, handler: () => Promise<void>) => {
					commands.set(id, handler);
					return new Disposable(() => commands.delete(id));
				}
			},
			languages: { registerCodeActionsProvider: disposable },
			extensions: { allAcrossExtensionHosts: [extension], onDidChange: disposable },
			window: { createStatusBarItem: statusItem, createOutputChannel: () => log, showInformationMessage: async () => undefined },
			workspace: {
				isTrusted: options.workspaceTrusted ?? true,
				getConfiguration: (section?: string) => ({
					get: (key: string) => {
						switch (key) {
							case 'json.schemaDownload.enable': return options.downloadEnabled ?? true;
							case 'json.schemaDownload.trustedDomains': return options.trustedDomains;
							default: return undefined;
						}
					},
					inspect: (key: string) => section === 'json' && key === 'schemas' ? { globalValue: options.schemas } : undefined
				}),
				createFileSystemWatcher: () => ({
					dispose() { }, onDidCreate: disposable, onDidChange: disposable, onDidDelete: disposable
				}),
				onDidChangeTextDocument: disposable,
				onDidCloseTextDocument: disposable,
				onDidChangeConfiguration: disposable,
				onDidGrantWorkspaceTrust: disposable,
				openTextDocument: async (uri: Uri) => {
					documents.push(uri.toString());
					return { getText: () => schema };
				},
				fs: {
					readFile: async (uri: Uri) => {
						files.push(uri.toString());
						return new TextEncoder().encode(schema);
					}
				}
			}
		},
		'vscode-languageclient': protocol,
		'vscode-languageclient/node': protocol,
		'vscode-languageclient/browser': protocol,
		'./languageParticipants': {
			getLanguageParticipants: () => ({ documentSelector: ['json'], onDidChange: disposable, dispose() { } })
		},
		'./languageStatus': {
			createLimitStatusItem: statusItem,
			createSchemaLoadStatusItem: statusItem,
			createLanguageStatusItem: statusItem
		},
		'@vscode/extension-telemetry': class { dispose() { } },
		fs: {
			promises: {
				...fs,
				readFile: async (filename: string) => path.basename(filename) === 'package.json'
					? Buffer.from(JSON.stringify({ main: './client/out/node/jsonClientMain', aiKey: '' }))
					: fs.readFile(filename),
			}
		},
		path,
		crypto: { createHash },
		'request-light': {
			xhr: async ({ url }: { url: string }) => {
				const destination = parse(url);
				requests.push({ url, host: destination.host, path: destination.pathname });
				const response = options.schemaResponse?.() ?? { content: schema };
				return { status: 200, headers: { etag: response.etag }, responseText: response.content };
			}
		}
	};
	const globals = {
		process: { env: {} },
		setTimeout: () => { throw new Error('Unexpected timer'); },
		clearTimeout: () => { },
		Worker: class { postMessage() { } },
		fetch: async (url: string) => {
			const destination = new URL(url);
			requests.push({ url, host: destination.host, path: destination.pathname });
			return { text: async () => schema };
		}
	};
	const load = createLoader(mocks, globals);
	const matcher = load<UrlMatcher>(path.join(__dirname, '..', 'utils', 'urlMatch.js'));
	const matchesUrlPattern: UrlMatcher['matchesUrlPattern'] = (url, domains) => {
		const allowed = matcher.matchesUrlPattern(url, domains);
		checked.push({ url: url instanceof URL ? url.href : url.toString(), allowed });
		return allowed;
	};
	Object.assign(mocks, { './utils/urlMatch': { ...matcher, matchesUrlPattern } });

	const main = load<ClientMain>(path.join(__dirname, '..', transport, 'jsonClientMain.js'));
	const context: Partial<ExtensionContext> = {
		subscriptions,
		extensionUri: Uri.parse('vscode-test://extension/json'),
		globalStorageUri: cacheDirectory ? Uri.file(cacheDirectory) : Uri.parse('vscode-test://storage/json'),
		globalState: {
			keys: () => [...state.keys()],
			get: <T>(key: string, fallback?: T): T | undefined => state.has(key) ? state.get(key) as T : fallback,
			update: async (key: string, value: object) => {
				state.set(key, value);
				await options.onCacheUpdate?.();
			},
			setKeysForSync: () => { }
		},
		asAbsolutePath: (value: string) => path.resolve(__dirname, value)
	};
	await main.activate(context as ExtensionContext);
	const request = handlers.get('vscode/content');
	assert.ok(request, 'The production client must register its schema request handler');
	return {
		request,
		requests,
		checked,
		documents,
		files,
		schemaNotifications,
		async clearCache() {
			const command = commands.get('json.clearCache');
			assert.ok(command, 'The production client must register the cache-clear command');
			await command();
		},
		async dispose() {
			try {
				await main.deactivate();
				subscriptions.forEach(subscription => subscription.dispose());
			} finally {
				if (cacheDirectory) {
					await fs.rm(cacheDirectory, { recursive: true, force: true });
				}
			}
		}
	};
}
