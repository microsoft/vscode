/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { toDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import type * as vscode from 'vscode';
import { ExtHostUriOpenersShape, IMainContext, MainContext, MainThreadUriOpenersShape } from './extHost.protocol';

interface OpenerEntry {
	readonly extension: ExtensionIdentifier;
	readonly schemes: ReadonlySet<string>;
	readonly opener: vscode.ExternalUriOpener;
	readonly metadata: vscode.ExternalUriOpenerMetadata;
}

export class ExtHostUriOpeners implements ExtHostUriOpenersShape {

	private static HandlePool = 0;

	private readonly _proxy: MainThreadUriOpenersShape;

	private readonly _openers = new Map<number, OpenerEntry>();

	constructor(
		mainContext: IMainContext,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadUriOpeners);
	}

	registerUriOpener(
		extensionId: ExtensionIdentifier,
		schemes: readonly string[],
		opener: vscode.ExternalUriOpener,
		metadata: vscode.ExternalUriOpenerMetadata,
	): vscode.Disposable {
		const handle = ExtHostUriOpeners.HandlePool++;

		this._openers.set(handle, {
			opener,
			extension: extensionId,
			schemes: new Set(schemes),
			metadata
		});
		this._proxy.$registerUriOpener(handle, schemes, extensionId, metadata.label);

		return toDisposable(() => {
			this._openers.delete(handle);
			this._proxy.$unregisterUriOpener(handle);
		});
	}

	async $getOpenersForUri(uriComponents: UriComponents, token: CancellationToken): Promise<readonly number[]> {
		const uri = URI.revive(uriComponents);

		const promises = Array.from(this._openers.entries()).map(async ([handle, { schemes, opener, }]): Promise<number | undefined> => {
			if (!schemes.has(uri.scheme)) {
				return undefined;
			}

			try {
				if (await opener.canOpenExternalUri(uri, token)) {
					return handle;
				}
			} catch (e) {
				console.log(e);
				// noop
			}
			return undefined;
		});

		return (await Promise.all(promises)).filter(handle => typeof handle === 'number') as number[];
	}

	async $openUri(handle: number, context: { resolveUri: UriComponents, sourceUri: UriComponents }, token: CancellationToken): Promise<void> {
		const entry = this._openers.get(handle);
		if (!entry) {
			throw new Error(`Unknown opener handle: '${handle}'`);
		}
		return entry.opener.openExternalUri(URI.revive(context.resolveUri), {
			sourceUri: URI.revive(context.sourceUri)
		}, token);
	}
}
