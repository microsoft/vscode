/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtHostQuickDiffShape, IMainContext, MainContext, MainThreadQuickDiffShape } from './extHost.protocol.js';
import { asPromise } from '../../../base/common/async.js';
import { DocumentSelector } from './extHostTypeConverters.js';
import { IURITransformer } from '../../../base/common/uriIpc.js';

export class ExtHostQuickDiff implements ExtHostQuickDiffShape {
	private static handlePool: number = 0;

	private proxy: MainThreadQuickDiffShape;
	private providers: Map<number, vscode.QuickDiffProvider> = new Map();

	constructor(
		mainContext: IMainContext,
		private readonly uriTransformer: IURITransformer | undefined
	) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadQuickDiff);
	}

	$provideOriginalResource(handle: number, uriComponents: UriComponents, token: CancellationToken): Promise<UriComponents | null> {
		const uri = URI.revive(uriComponents);
		const provider = this.providers.get(handle);

		if (!provider) {
			return Promise.resolve(null);
		}

		return asPromise(() => provider.provideOriginalResource!(uri, token))
			.then<UriComponents | null>(r => r || null);
	}

	registerQuickDiffProvider(selector: vscode.DocumentSelector, quickDiffProvider: vscode.QuickDiffProvider, label: string, rootUri?: vscode.Uri): vscode.Disposable {
		const handle = ExtHostQuickDiff.handlePool++;
		this.providers.set(handle, quickDiffProvider);
		this.proxy.$registerQuickDiffProvider(handle, DocumentSelector.from(selector, this.uriTransformer), label, rootUri);
		return {
			dispose: () => {
				this.proxy.$unregisterQuickDiffProvider(handle);
				this.providers.delete(handle);
			}
		};
	}
}
