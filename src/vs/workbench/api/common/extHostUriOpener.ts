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
import { ChainedCacheId, ExtHostUriOpener, ExtHostUriOpenersShape, IMainContext, MainContext, MainThreadUriOpenersShape } from './extHost.protocol';

interface OpenerEntry {
	readonly extension: ExtensionIdentifier;
	readonly schemes: ReadonlySet<string>;
	readonly opener: vscode.ExternalUriOpener;
}

export class ExtHostUriOpeners implements ExtHostUriOpenersShape {

	private static HandlePool = 0;

	private readonly _proxy: MainThreadUriOpenersShape;
	private readonly _commands: ExtHostCommands;

	private readonly _cache = new Cache<{ command: vscode.Command }>('CodeAction');
	private readonly _openers = new Map<number, OpenerEntry>();

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

		this._openers.set(handle, {
			opener,
			extension: extensionId,
			schemes: new Set(schemes),
		});
		this._proxy.$registerUriOpener(handle, schemes, extensionId);

		return toDisposable(() => {
			this._openers.delete(handle);
			this._proxy.$unregisterUriOpener(handle);
		});
	}

	async $getOpenersForUri(uriComponents: UriComponents, token: CancellationToken): Promise<{ cacheId: number, openers: Array<ExtHostUriOpener> }> {
		const uri = URI.revive(uriComponents);

		const promises = Array.from(this._openers.values()).map(async ({ schemes, opener, extension }): Promise<{ command: vscode.Command, extension: ExtensionIdentifier } | undefined> => {
			if (!schemes.has(uri.scheme)) {
				return undefined;
			}

			try {
				const result = await opener.openExternalUri(uri, {}, token);

				if (result) {
					return {
						command: result,
						extension
					};
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
			openers: commands.map((entry, i) => ({ title: entry.command.title, commandId: i, extensionId: entry.extension })),
		};
	}

	async $openUri(id: ChainedCacheId, uri: UriComponents): Promise<void> {
		const entry = this._cache.get(id[0], id[1]);
		if (!entry) {
			return;
		}

		return this._commands.executeCommand(entry.command.command, URI.revive(uri), ...(entry.command.arguments || []));
	}

	$releaseOpener(cacheId: number): void {
		this._cache.delete(cacheId);
	}
}
