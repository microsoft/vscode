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
import { ExtHostQuickOpen } from 'vs/workbench/api/common/extHostQuickOpen';
import type * as vscode from 'vscode';
import { ExtHostUriOpenersShape, IMainContext, MainContext, MainThreadUriOpenersShape } from './extHost.protocol';

export class ExtHostUriOpeners implements ExtHostUriOpenersShape {

	private static HandlePool = 0;

	private readonly _proxy: MainThreadUriOpenersShape;
	private readonly _commands: ExtHostCommands;
	private readonly _quickOpen: ExtHostQuickOpen;

	private readonly _openers = new Map<number, { schemes: ReadonlySet<string>, opener: vscode.ExternalUriOpener }>();

	constructor(
		mainContext: IMainContext,
		commands: ExtHostCommands,
		quickOpen: ExtHostQuickOpen,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadUriOpeners);
		this._commands = commands;
		this._quickOpen = quickOpen;
	}

	registerUriOpener(
		extensionId: ExtensionIdentifier,
		schemes: readonly string[],
		opener: vscode.ExternalUriOpener,
	): vscode.Disposable {

		const handle = ExtHostUriOpeners.HandlePool++;

		this._openers.set(handle, { opener, schemes: new Set(schemes) });
		this._proxy.$registerUriOpener(handle);

		return toDisposable(() => {
			this._openers.delete(handle);
			this._proxy.$unregisterUriOpener(handle);
		});
	}

	async $openUri(uriComponents: UriComponents, token: CancellationToken): Promise<boolean> {
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

		const results = coalesce(await Promise.all(promises));

		if (results.length === 0) {
			return false;
		} else if (results.length === 1) {
			const [command] = results;
			await this._commands.executeCommand(command.command, ...(command.arguments ?? []));
			return true;
		} else {
			type PickItem = vscode.QuickPickItem & { index: number };
			const items = results.map((command, i): PickItem => {
				return {
					label: command.title,
					index: i
				};
			});
			const picked = await this._quickOpen.showQuickPick(items, false, {});
			if (picked) {
				const command = results[(picked as PickItem).index];
				await this._commands.executeCommand(command.command, ...(command.arguments ?? []));
				return true;
			}

			return false;
		}
	}
}
