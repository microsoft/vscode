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
	private readonly disposables = new DisposableStore();
	private readonly onDidReconnectEmitter = this.disposables.add(new vscode.EventEmitter<void>());

	public readonly onDidReconnect = this.onDidReconnectEmitter.event;

	private api: API<true> | undefined;
	private apiPromise: Promise<API<true> | undefined> | undefined;
	private extensionApi: TypeScript7ExtensionApi | undefined;

	constructor(private readonly logService: ILogService) { }

	public getApi(): Promise<API<true> | undefined> {
		if (this.api !== undefined) {
			return Promise.resolve(this.api);
		}
		if (this.apiPromise === undefined) {
			this.apiPromise = this.createApi();
		}
		return this.apiPromise;
	}

	public dispose(): void {
		this.resetApi();
		this.disposables.dispose();
	}

	private async createApi(): Promise<API<true> | undefined> {
		try {
			if (this.extensionApi === undefined) {
				const extension = vscode.extensions.getExtension<TypeScript7ExtensionApi>('typescriptteam.native-preview');
				if (extension === undefined) {
					return undefined;
				}
				this.extensionApi = await extension.activate();
				this.disposables.add(this.extensionApi.onLanguageServerInitialized(() => this.reconnect()));
			}
			const pipe = await this.extensionApi.initializeAPIConnection();
			const api = await API.fromLSPConnection({ pipe });
			this.api = api;
			return api;
		} catch (error) {
			this.logService.error(error, 'Error connecting to the TypeScript 7 API');
			return undefined;
		} finally {
			this.apiPromise = undefined;
		}
	}

	private reconnect(): void {
		this.resetApi();
		this.onDidReconnectEmitter.fire();
	}

	private resetApi(): void {
		const api = this.api;
		this.api = undefined;
		this.apiPromise = undefined;
		if (api !== undefined) {
			api.close().catch(error => this.logService.error(error, 'Error closing stale TypeScript 7 API connection'));
		}
	}
}
