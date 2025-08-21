/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, ExtensionContext, Uri, l10n } from 'vscode';
import { LanguageClientOptions } from 'vscode-languageclient';
import { startClient, LanguageClientConstructor, AsyncDisposable } from '../htmlClient';
import { LanguageClient } from 'vscode-languageclient/browser';

let client: AsyncDisposable | undefined;

// this method is called when vs code is activated
export async function activate(context: ExtensionContext) {
	const serverMain = Uri.joinPath(context.extensionUri, 'server/dist/browser/htmlServerMain.js');
	try {
		const worker = new Worker(serverMain.toString());
		worker.postMessage({ i10lLocation: l10n.uri?.toString(false) ?? '' });

		const newLanguageClient: LanguageClientConstructor = (id: string, name: string, clientOptions: LanguageClientOptions) => {
			return new LanguageClient(id, name, worker, clientOptions);
		};

		const timer = {
			setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): Disposable {
				const handle = setTimeout(callback, ms, ...args);
				return { dispose: () => clearTimeout(handle) };
			}
		};

		client = await startClient(context, newLanguageClient, { TextDecoder, timer });

	} catch (e) {
		console.log(e);
	}
}

export async function deactivate(): Promise<void> {
	if (client) {
		await client.dispose();
		client = undefined;
	}
}

