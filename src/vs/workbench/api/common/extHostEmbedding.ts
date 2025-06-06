/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ExtHostEmbeddingsShape, IMainContext, MainContext, MainThreadEmbeddingsShape } from './extHost.protocol.js';
import type * as vscode from 'vscode';


export class ExtHostEmbeddings implements ExtHostEmbeddingsShape {

	private readonly _proxy: MainThreadEmbeddingsShape;
	private readonly _provider = new Map<number, { id: string; provider: vscode.EmbeddingsProvider }>();

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _allKnownModels = new Set<string>();
	private _handlePool: number = 0;

	constructor(
		mainContext: IMainContext
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadEmbeddings);
	}

	registerEmbeddingsProvider(_extension: IExtensionDescription, embeddingsModel: string, provider: vscode.EmbeddingsProvider): IDisposable {
		if (this._allKnownModels.has(embeddingsModel)) {
			throw new Error('An embeddings provider for this model is already registered');
		}

		const handle = this._handlePool++;

		this._proxy.$registerEmbeddingProvider(handle, embeddingsModel);
		this._provider.set(handle, { id: embeddingsModel, provider });

		return toDisposable(() => {
			this._allKnownModels.delete(embeddingsModel);
			this._proxy.$unregisterEmbeddingProvider(handle);
			this._provider.delete(handle);
		});
	}

	async computeEmbeddings(embeddingsModel: string, input: string, token?: vscode.CancellationToken): Promise<vscode.Embedding>;
	async computeEmbeddings(embeddingsModel: string, input: string[], token?: vscode.CancellationToken): Promise<vscode.Embedding[]>;
	async computeEmbeddings(embeddingsModel: string, input: string | string[], token?: vscode.CancellationToken): Promise<vscode.Embedding[] | vscode.Embedding> {

		token ??= CancellationToken.None;

		let returnSingle = false;
		if (typeof input === 'string') {
			input = [input];
			returnSingle = true;
		}
		const result = await this._proxy.$computeEmbeddings(embeddingsModel, input, token);
		if (result.length !== input.length) {
			throw new Error();
		}
		if (returnSingle) {
			if (result.length !== 1) {
				throw new Error();
			}
			return result[0];
		}
		return result;

	}

	async $provideEmbeddings(handle: number, input: string[], token: CancellationToken): Promise<{ values: number[] }[]> {
		const data = this._provider.get(handle);
		if (!data) {
			return [];
		}
		const result = await data.provider.provideEmbeddings(input, token);
		if (!result) {
			return [];
		}
		return result;
	}

	get embeddingsModels(): string[] {
		return Array.from(this._allKnownModels);
	}

	$acceptEmbeddingModels(models: string[]): void {
		this._allKnownModels = new Set(models);
		this._onDidChange.fire();
	}
}
