/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ExtHostShareShape, IMainContext, IShareableItemDto, MainContext, MainThreadShareShape } from 'vs/workbench/api/common/extHost.protocol';
import { DocumentSelector, Range } from 'vs/workbench/api/common/extHostTypeConverters';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI, UriComponents } from 'vs/base/common/uri';

export class ExtHostShare implements ExtHostShareShape {
	private static handlePool: number = 0;

	private proxy: MainThreadShareShape;
	private providers: Map<number, vscode.ShareProvider> = new Map();

	constructor(
		mainContext: IMainContext,
		private readonly uriTransformer: IURITransformer | undefined
	) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadShare);
	}

	async $provideShare(handle: number, shareableItem: IShareableItemDto, token: CancellationToken): Promise<UriComponents | string | undefined> {
		const provider = this.providers.get(handle);
		const result = await provider?.provideShare({ selection: Range.to(shareableItem.selection), resourceUri: URI.revive(shareableItem.resourceUri) }, token);
		return result ?? undefined;
	}

	registerShareProvider(selector: vscode.DocumentSelector, provider: vscode.ShareProvider): vscode.Disposable {
		const handle = ExtHostShare.handlePool++;
		this.providers.set(handle, provider);
		this.proxy.$registerShareProvider(handle, DocumentSelector.from(selector, this.uriTransformer), provider.id, provider.label, provider.priority);
		return {
			dispose: () => {
				this.proxy.$unregisterShareProvider(handle);
				this.providers.delete(handle);
			}
		};
	}
}
