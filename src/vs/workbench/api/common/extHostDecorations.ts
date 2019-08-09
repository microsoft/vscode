/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { URI } from 'vs/base/common/uri';
import { MainContext, ExtHostDecorationsShape, MainThreadDecorationsShape, DecorationData, DecorationRequest, DecorationReply } from 'vs/workbench/api/common/extHost.protocol';
import { Disposable } from 'vs/workbench/api/common/extHostTypes';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { asArray } from 'vs/base/common/arrays';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';

interface ProviderData {
	provider: vscode.DecorationProvider;
	extensionId: ExtensionIdentifier;
}

export class ExtHostDecorations implements IExtHostDecorations {

	private static _handlePool = 0;

	readonly _serviceBrand: undefined;
	private readonly _provider = new Map<number, ProviderData>();
	private readonly _proxy: MainThreadDecorationsShape;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadDecorations);
	}

	registerDecorationProvider(provider: vscode.DecorationProvider, extensionId: ExtensionIdentifier): vscode.Disposable {
		const handle = ExtHostDecorations._handlePool++;
		this._provider.set(handle, { provider, extensionId });
		this._proxy.$registerDecorationProvider(handle, extensionId.value);

		const listener = provider.onDidChangeDecorations(e => {
			this._proxy.$onDidChange(handle, !e ? null : asArray(e));
		});

		return new Disposable(() => {
			listener.dispose();
			this._proxy.$unregisterDecorationProvider(handle);
			this._provider.delete(handle);
		});
	}

	$provideDecorations(requests: DecorationRequest[], token: CancellationToken): Promise<DecorationReply> {
		const result: DecorationReply = Object.create(null);
		return Promise.all(requests.map(request => {
			const { handle, uri, id } = request;
			const entry = this._provider.get(handle);
			if (!entry) {
				// might have been unregistered in the meantime
				return undefined;
			}
			const { provider, extensionId } = entry;
			return Promise.resolve(provider.provideDecoration(URI.revive(uri), token)).then(data => {
				if (data && data.letter && data.letter.length !== 1) {
					console.warn(`INVALID decoration from extension '${extensionId.value}'. The 'letter' must be set and be one character, not '${data.letter}'.`);
				}
				if (data) {
					result[id] = <DecorationData>[data.priority, data.bubble, data.title, data.letter, data.color, data.source];

				}
			}, err => {
				console.error(err);
			});

		})).then(() => {
			return result;
		});
	}
}

export const IExtHostDecorations = createDecorator<IExtHostDecorations>('IExtHostDecorations');
export interface IExtHostDecorations extends ExtHostDecorations, ExtHostDecorationsShape { }
