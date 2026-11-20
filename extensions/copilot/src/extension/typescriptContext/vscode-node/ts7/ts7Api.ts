/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { API } from '@typescript/native/async';
import type { TypeScriptSDK } from '@typescript/native/vscode';
import * as vscode from 'vscode';
import { ILogService } from '../../../../platform/log/common/logService';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { TypeScript } from '../tsService';

/**
 * The part of the TypeScript 7 extension API that we use. Extensions that predate the TypeScript 7.1 API fire the
 * event without an SDK.
 */
interface TypeScript7ExtensionApi {
	readonly onLanguageServerInitialized: vscode.Event<TypeScriptSDK | undefined>;
}

export class TypeScript7Api implements vscode.Disposable {
	private static connection: TypeScript7Connection | undefined;
	private static refCount: number = 0;

	private readonly connection: TypeScript7Connection;
	private disposed: boolean = false;

	/**
	 * Fires when the language server initializes after the first {@link getApi} call, for example when it restarts or
	 * starts late. Callers need to get the API again, also if they didn't get one before.
	 */
	public readonly onDidReconnect: vscode.Event<void>;

	constructor(logService: ILogService) {
		TypeScript7Api.connection ??= new TypeScript7Connection(logService);
		TypeScript7Api.refCount++;
		this.connection = TypeScript7Api.connection;
		this.onDidReconnect = this.connection.onDidReconnect;
	}

	public getApi(): Promise<API<true> | undefined> {
		return this.connection.getApi();
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		if (--TypeScript7Api.refCount === 0) {
			TypeScript7Api.connection = undefined;
			this.connection.dispose();
		}
	}
}

/**
 * The actual connection to the TypeScript 7 language server. Shared by all {@link TypeScript7Api} handles
 * so that we only ever open one pipe to the server. Copilot's client uses the TypeScript 7.1 API, so we only
 * connect to language servers that provide it.
 */
export class TypeScript7Connection implements vscode.Disposable {

	private static readonly maxConnectAttempts: number = 3;

	private readonly disposables = new DisposableStore();
	private readonly onDidReconnectEmitter = this.disposables.add(new vscode.EventEmitter<void>());

	public readonly onDidReconnect = this.onDidReconnectEmitter.event;

	private api: API<true> | undefined;
	private apiPromise: Promise<API<true> | undefined> | undefined;
	private subscribed: boolean = false;
	/**
	 * The SDK of the latest language server initialization. Undefined if no language server has initialized yet or the
	 * latest one doesn't provide the TypeScript 7.1 API.
	 */
	private sdk: TypeScriptSDK | undefined;
	private generation: number = 0;
	private disposed: boolean = false;

	constructor(
		private readonly logService: ILogService,
		private readonly getExtensions: () => readonly Pick<vscode.Extension<TypeScript7ExtensionApi | undefined>, 'activate'>[] = () => TypeScript.getVersion7Extensions<TypeScript7ExtensionApi | undefined>(),
		private readonly connect: (pipe: string) => Promise<API<true>> = pipe => API.fromLSPConnection({ pipe }),
	) { }

	public getApi(): Promise<API<true> | undefined> {
		if (this.api !== undefined) {
			return Promise.resolve(this.api);
		}
		if (this.disposed) {
			return Promise.resolve(undefined);
		}
		if (this.apiPromise === undefined) {
			const promise = this.createApi();
			this.apiPromise = promise;
			void promise.then(() => {
				if (this.apiPromise === promise) {
					this.apiPromise = undefined;
				}
			});
		}
		return this.apiPromise;
	}

	public dispose(): void {
		this.disposed = true;
		this.resetApi();
		this.disposables.dispose();
	}

	private async createApi(): Promise<API<true> | undefined> {
		try {
			if (!await this.subscribe()) {
				return undefined;
			}
			for (let attempt = 0; attempt < TypeScript7Connection.maxConnectAttempts; attempt++) {
				const generation = this.generation;
				const sdk = this.sdk;
				if (sdk === undefined) {
					return undefined;
				}
				let api: API<true>;
				try {
					api = await this.connect(await sdk.initializeAPIConnection());
				} catch (error) {
					if (this.disposed || this.generation === generation) {
						throw error;
					}
					// The language server (re)initialized while we were connecting, which can make the previous SDK fail.
					continue;
				}
				if (this.disposed) {
					this.close(api);
					return undefined;
				}
				if (this.generation === generation) {
					this.api = api;
					return api;
				}
				// The language server (re)initialized while we were connecting, so this pipe is already stale.
				this.close(api);
			}
			return undefined;
		} catch (error) {
			this.logService.error(error, 'Error connecting to the TypeScript 7 API');
			return undefined;
		}
	}

	private async subscribe(): Promise<boolean> {
		if (this.subscribed) {
			return true;
		}
		// Skips extensions without an API, like the nightly extension that only provides a TypeScript SDK.
		for (const extension of this.getExtensions()) {
			const extensionApi = await extension.activate();
			if (this.disposed) {
				return false;
			}
			if (typeof extensionApi?.onLanguageServerInitialized === 'function') {
				// Invokes the listener immediately if the language server is already initialized.
				this.disposables.add(extensionApi.onLanguageServerInitialized(sdk => this.onLanguageServerInitialized(sdk)));
				this.subscribed = true;
				return true;
			}
		}
		return false;
	}

	private onLanguageServerInitialized(sdk: TypeScriptSDK | undefined): void {
		this.sdk = this.getSupportedSdk(sdk);
		this.reconnect();
	}

	private getSupportedSdk(sdk: TypeScriptSDK | undefined): TypeScriptSDK | undefined {
		let reason: string;
		if (sdk === undefined) {
			reason = 'the TypeScript 7 extension is too old';
		} else if (providesTypeScript71Api(sdk.version)) {
			return sdk;
		} else if (sdk.version === 'local' || sdk.version === 'unknown') {
			// Builds from source report `local`, and their API package manifest only has a placeholder version.
			reason = 'the language server version is unknown';
		} else {
			reason = `the language server is version ${sdk.version}`;
		}
		this.logService.warn(`TypeScript 7 support requires a language server with the TypeScript 7.1 API, but ${reason}.`);
		return undefined;
	}

	private reconnect(): void {
		// Bump the generation so that a connect in progress picks up the new SDK. Callers that asked for the API need
		// to ask again, even if they didn't get one. That excludes the initialization that the TypeScript 7 extension
		// replays while we subscribe, which happens during the first getApi call.
		this.resetApi();
		if (this.subscribed) {
			this.onDidReconnectEmitter.fire();
		}
	}

	private resetApi(): void {
		this.generation++;
		const api = this.api;
		this.api = undefined;
		if (api !== undefined) {
			this.close(api);
		}
	}

	private close(api: API<true>): void {
		api.close().catch(error => this.logService.error(error, 'Error closing stale TypeScript 7 API connection'));
	}
}

/**
 * Whether a language server of the given version provides the TypeScript 7.1 API that Copilot's client uses, for
 * example `createSnapshot`. Prereleases like `7.1.0-dev.20261105.1` count as 7.1.
 */
function providesTypeScript71Api(version: string): boolean {
	const match = /^(?<major>\d+)\.(?<minor>\d+)/.exec(version);
	if (match?.groups === undefined) {
		return false;
	}
	const major = Number(match.groups.major);
	return major > 7 || (major === 7 && Number(match.groups.minor) >= 1);
}
