/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { toDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import type * as vscode from 'vscode';
import { Cache } from './cache';
import { ChainedCacheId, ExtHostUriOpenersShape, IMainContext, MainContext, MainThreadUriOpenersShape } from './extHost.protocol';

export class ExtHostUriOpeners implements ExtHostUriOpenersShape {

	private static HandlePool = 0;

	private readonly _proxy: MainThreadUriOpenersShape;
	private readonly _commands: ExtHostCommands;

	private readonly _cache = new Cache<vscode.Command>('CodeAction');
	private readonly _openers = new Map<number, { schemes: ReadonlySet<string>, opener: vscode.ExternalUriOpener }>();

	constructor(
		mainContext: IMainContext,
		commands: ExtHostCommands,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadUriOpeners);
		this._commands = commands;
	}

	registerUriOpener(
		extensionId: ExtensionIdentifier,
		schemes: readonly string[],
		opener: vscode.ExternalUriOpener,
	): vscode.Disposable {
		const handle = ExtHostUriOpeners.HandlePool++;

		this._openers.set(handle, { opener, schemes: new Set(schemes) });
		this._proxy.$registerUriOpener(handle, schemes);

		return toDisposable(() => {
			this._openers.delete(handle);
			this._proxy.$unregisterUriOpener(handle);
		});
	}

	async $getOpenersForUri(uriComponents: UriComponents, token: CancellationToken): Promise<{ cacheId: number, openers: Array<{ id: number, title: string }> }> {
		const uri = URI.revive(uriComponents);

		const promises = Array.from(this._openers.values()).map(async ({ schemes, opener }): Promise<vscode.Command | undefined> => {
			if (!schemes.has(uri.scheme)) {
				return undefined;
			}

			try {
				const result = await opener.openExternalUri(uri, {}, token);

				if (result) {
					return result;
				}
			} catch (e) {
				// noop
			}
			return undefined;
		});

		const commands = coalesce(await Promise.all(promises));
		const cacheId = this._cache.add(commands);
		return {
			cacheId,
			openers: commands.map((command, i) => ({ title: command.title, id: i })),
		};
	}

	async $openUri(id: ChainedCacheId, uri: UriComponents): Promise<void> {
		const command = this._cache.get(id[0], id[1]);
		if (!command) {
			return;
		}

		return this._commands.executeCommand(command.command, URI.revive(uri), ...(command.arguments || []));
	}

	$releaseOpener(cacheId: number): void {
		this._cache.delete(cacheId);
	}
}
