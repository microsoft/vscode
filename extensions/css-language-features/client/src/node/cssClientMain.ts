/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getNodeFSRequestService } from './nodeFs';
import { Disposable, DocumentSelector, ExtensionContext, extensions, l10n } from 'vscode';
import { startClient, LanguageClientConstructor } from '../cssClient';
import { ServerOptions, TransportKind, LanguageClientOptions, LanguageClient, BaseLanguageClient } from 'vscode-languageclient/node';
import { TextDecoder } from 'util';
import { registerDropIntoEditorSupport } from './dropIntoEditor';
import { registerPasteIntoEditorSupport } from './pasteIntoEditor';
import { registerPasteLinkIntoEditorSupport } from './pasteUrlIntoEditor';
let client: BaseLanguageClient | undefined;

// this method is called when vs code is activated
export async function activate(context: ExtensionContext) {
	const clientMain = extensions.getExtension('vscode.css-language-features')?.packageJSON?.main || '';

	const serverMain = `./server/${clientMain.indexOf('/dist/') !== -1 ? 'dist' : 'out'}/node/cssServerMain`;
	const serverModule = context.asAbsolutePath(serverMain);

	// The debug options for the server
	const debugOptions = { execArgv: ['--nolazy', '--inspect=' + (7000 + Math.round(Math.random() * 999))] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	const newLanguageClient: LanguageClientConstructor = (id: string, name: string, clientOptions: LanguageClientOptions) => {
		return new LanguageClient(id, name, serverOptions, clientOptions);
	};

	// pass the location of the localization bundle to the server
	process.env['VSCODE_L10N_BUNDLE_LOCATION'] = l10n.uri?.toString() ?? '';

	client = await startClient(context, newLanguageClient, { fs: getNodeFSRequestService(), TextDecoder });
	context.subscriptions.push(registerCssLanguageFeatures());
}

export async function deactivate(): Promise<void> {
	if (client) {
		await client.stop();
		client = undefined;
	}
}

function registerCssLanguageFeatures(): Disposable {
	const selector: DocumentSelector = { language: 'css', scheme: '*' };
	return Disposable.from(
		// Language features
		registerDropIntoEditorSupport(selector),
		registerPasteIntoEditorSupport(selector),
		registerPasteLinkIntoEditorSupport(selector)
	);
}
