/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ExtHostQuickDiffShape, IMainContext, MainContext, MainThreadQuickDiffShape } from 'vs/workbench/api/common/extHost.protocol';
import { asPromise } from 'vs/base/common/async';

export class ExtHostQuickDiff implements ExtHostQuickDiffShape {
	private static handlePool: number = 0;

	private proxy: MainThreadQuickDiffShape;
	private providers: Map<number, vscode.QuickDiffProvider> = new Map();

	constructor(
		mainContext: IMainContext
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

	async registerQuickDiffProvider(quickDiffProvider: vscode.QuickDiffProvider, label: string, rootUri?: vscode.Uri): Promise<vscode.Disposable> {
		const handle = ExtHostQuickDiff.handlePool++;
		this.providers.set(handle, quickDiffProvider);
		await this.proxy.$registerQuickDiffProvider(handle, label, rootUri);
		return {
			dispose: () => this.providers.delete(handle)
		};
	}
}
