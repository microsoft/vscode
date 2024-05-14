/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, ExtensionContext, LogOutputChannel, window, l10n, env, LogLevel } from 'vscode';
import { startClient, LanguageClientConstructor, SchemaRequestService, languageServerDescription, AsyncDisposable } from '../jsonClient';
import { ServerOptions, TransportKind, LanguageClientOptions, LanguageClient } from 'vscode-languageclient/node';

import { promises as fs } from 'fs';
import * as path from 'path';
import { xhr, XHRResponse, getErrorStatusDescription, Headers } from 'request-light';

import TelemetryReporter from '@vscode/extension-telemetry';
import { JSONSchemaCache } from './schemaCache';

let client: AsyncDisposable | undefined;

// this method is called when vs code is activated
export async function activate(context: ExtensionContext) {
	const clientPackageJSON = await getPackageInfo(context);
	const telemetry = new TelemetryReporter(clientPackageJSON.aiKey);
	context.subscriptions.push(telemetry);

	const logOutputChannel = window.createOutputChannel(languageServerDescription, { log: true });
	context.subscriptions.push(logOutputChannel);

	const serverMain = `./server/${clientPackageJSON.main.indexOf('/dist/') !== -1 ? 'dist' : 'out'}/node/jsonServerMain`;
	const serverModule = context.asAbsolutePath(serverMain);

	// The debug options for the server
	const debugOptions = { execArgv: ['--nolazy', '--inspect=' + (6000 + Math.round(Math.random() * 999))] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	const newLanguageClient: LanguageClientConstructor = (id: string, name: string, clientOptions: LanguageClientOptions) => {
		return new LanguageClient(id, name, serverOptions, clientOptions);
	};

	const timer = {
		setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): Disposable {
			const handle = setTimeout(callback, ms, ...args);
			return { dispose: () => clearTimeout(handle) };
		}
	};

	// pass the location of the localization bundle to the server
	process.env['VSCODE_L10N_BUNDLE_LOCATION'] = l10n.uri?.toString() ?? '';

	const schemaRequests = await getSchemaRequestService(context, logOutputChannel);

	client = await startClient(context, newLanguageClient, { schemaRequests, telemetry, timer, logOutputChannel });
}

export async function deactivate(): Promise<any> {
	if (client) {
		await client.dispose();
		client = undefined;
	}
}

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
	main: string;
}

async function getPackageInfo(context: ExtensionContext): Promise<IPackageInfo> {
	const location = context.asAbsolutePath('./package.json');
	try {
		return JSON.parse((await fs.readFile(location)).toString());
	} catch (e) {
		console.log(`Problems reading ${location}: ${e}`);
		return { name: '', version: '', aiKey: '', main: '' };
	}
}

const retryTimeoutInHours = 2 * 24; // 2 days

async function getSchemaRequestService(context: ExtensionContext, log: LogOutputChannel): Promise<SchemaRequestService> {
	let cache: JSONSchemaCache | undefined = undefined;
	const globalStorage = context.globalStorageUri;

	let clearCache: (() => Promise<string[]>) | undefined;
	if (globalStorage.scheme === 'file') {
		const schemaCacheLocation = path.join(globalStorage.fsPath, 'json-schema-cache');
		await fs.mkdir(schemaCacheLocation, { recursive: true });

		const schemaCache = new JSONSchemaCache(schemaCacheLocation, context.globalState);
		log.trace(`[json schema cache] initial state: ${JSON.stringify(schemaCache.getCacheInfo(), null, ' ')}`);
		cache = schemaCache;
		clearCache = async () => {
			const cachedSchemas = await schemaCache.clearCache();
			log.trace(`[json schema cache] cache cleared. Previously cached schemas: ${cachedSchemas.join(', ')}`);
			return cachedSchemas;
		};
	}


	const isXHRResponse = (error: any): error is XHRResponse => typeof error?.status === 'number';

	const request = async (uri: string, etag?: string): Promise<string> => {
		const headers: Headers = {
			'Accept-Encoding': 'gzip, deflate',
			'User-Agent': `${env.appName} (${env.appHost})`
		};
		if (etag) {
			headers['If-None-Match'] = etag;
		}
		try {
			log.trace(`[json schema cache] Requesting schema ${uri} etag ${etag}...`);

			const response = await xhr({ url: uri, followRedirects: 5, headers });
			if (cache) {
				const etag = response.headers['etag'];
				if (typeof etag === 'string') {
					log.trace(`[json schema cache] Storing schema ${uri} etag ${etag} in cache`);
					await cache.putSchema(uri, etag, response.responseText);
				} else {
					log.trace(`[json schema cache] Response: schema ${uri} no etag`);
				}
			}
			return response.responseText;
		} catch (error: unknown) {
			if (isXHRResponse(error)) {
				if (error.status === 304 && etag && cache) {

					log.trace(`[json schema cache] Response: schema ${uri} unchanged etag ${etag}`);

					const content = await cache.getSchema(uri, etag, true);
					if (content) {
						log.trace(`[json schema cache] Get schema ${uri} etag ${etag} from cache`);
						return content;
					}
					return request(uri);
				}

				let status = getErrorStatusDescription(error.status);
				if (status && error.responseText) {
					status = `${status}\n${error.responseText.substring(0, 200)}`;
				}
				if (!status) {
					status = error.toString();
				}
				log.trace(`[json schema cache] Respond schema ${uri} error ${status}`);

				throw status;
			}
			throw error;
		}
	};

	return {
		getContent: async (uri: string) => {
			if (cache && /^https?:\/\/json\.schemastore\.org\//.test(uri)) {
				const content = await cache.getSchemaIfUpdatedSince(uri, retryTimeoutInHours);
				if (content) {
					if (log.logLevel === LogLevel.Trace) {
						log.trace(`[json schema cache] Schema ${uri} from cache without request (last accessed ${cache.getLastUpdatedInHours(uri)} hours ago)`);
					}

					return content;
				}
			}
			return request(uri, cache?.getETag(uri));
		},
		clearCache
	};
}
