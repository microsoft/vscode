/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { API } from '@typescript/native/unstable/async';
import * as vscode from 'vscode';
import { ILogService } from '../../../../platform/log/common/logService';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';

interface TypeScript7ExtensionApi {
	onLanguageServerInitialized: vscode.Event<void>;
	initializeAPIConnection(pipePath?: string): Promise<string>;
}

export class TypeScript7Api implements vscode.Disposable {
	private static connection: TypeScript7Connection | undefined;
	private static refCount: number = 0;

	private readonly connection: TypeScript7Connection;
	private disposed: boolean = false;

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
 * so that we only ever open one pipe to the server.
 */
class TypeScript7Connection implements vscode.Disposable {
	private readonly disposables = new DisposableStore();
	private readonly onDidReconnectEmitter = this.disposables.add(new vscode.EventEmitter<void>());

	public readonly onDidReconnect = this.onDidReconnectEmitter.event;

	private api: API<true> | undefined;
	private apiPromise: Promise<API<true> | undefined> | undefined;
	private extensionApi: TypeScript7ExtensionApi | undefined;
	private generation: number = 0;
	private disposed: boolean = false;

	constructor(private readonly logService: ILogService) { }

	public getApi(): Promise<API<true> | undefined> {
		if (this.api !== undefined) {
			return Promise.resolve(this.api);
		}
		if (this.disposed) {
			return Promise.resolve(undefined);
		}
		if (this.apiPromise === undefined) {
			this.apiPromise = this.createApi(this.generation);
		}
		return this.apiPromise;
	}

	public dispose(): void {
		this.disposed = true;
		this.resetApi();
		this.disposables.dispose();
	}

	private async createApi(generation: number): Promise<API<true> | undefined> {
		try {
			if (this.extensionApi === undefined) {
				const extension = vscode.extensions.getExtension<TypeScript7ExtensionApi>('typescriptteam.native-preview');
				if (extension === undefined) {
					return undefined;
				}
				const extensionApi = await extension.activate();
				if (this.generation !== generation) {
					return undefined;
				}
				this.extensionApi = extensionApi;
				this.disposables.add(extensionApi.onLanguageServerInitialized(() => this.reconnect()));
			}
			const pipe = await this.extensionApi.initializeAPIConnection();
			const api = await API.fromLSPConnection({ pipe });
			if (this.generation !== generation) {
				// A reconnect or a dispose happened while we were connecting, so this connection is already stale.
				this.close(api);
				return undefined;
			}
			this.api = api;
			return api;
		} catch (error) {
			this.logService.error(error, 'Error connecting to the TypeScript 7 API');
			return undefined;
		} finally {
			if (this.generation === generation) {
				this.apiPromise = undefined;
			}
		}
	}

	private reconnect(): void {
		this.resetApi();
		this.onDidReconnectEmitter.fire();
	}

	private resetApi(): void {
		this.generation++;
		const api = this.api;
		this.api = undefined;
		this.apiPromise = undefined;
		if (api !== undefined) {
			this.close(api);
		}
	}

	private close(api: API<true>): void {
		api.close().catch(error => this.logService.error(error, 'Error closing stale TypeScript 7 API connection'));
	}
}
