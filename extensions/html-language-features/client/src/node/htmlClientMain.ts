/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getNodeFileFS } from './nodeFs';
import { Disposable, ExtensionContext, l10n } from 'vscode';
import { startClient, LanguageClientConstructor, AsyncDisposable } from '../htmlClient';
import { ServerOptions, TransportKind, LanguageClientOptions, LanguageClient } from 'vscode-languageclient/node';
import { TextDecoder } from 'util';
import * as fs from 'fs';
import TelemetryReporter from '@vscode/extension-telemetry';


let telemetry: TelemetryReporter | undefined;
let client: AsyncDisposable | undefined;

// this method is called when vs code is activated
export async function activate(context: ExtensionContext) {

	const clientPackageJSON = getPackageInfo(context);
	telemetry = new TelemetryReporter(clientPackageJSON.aiKey);

	const serverMain = `./server/${clientPackageJSON.main.indexOf('/dist/') !== -1 ? 'dist' : 'out'}/node/htmlServerMain`;
	const serverModule = context.asAbsolutePath(serverMain);

	// The debug options for the server
	const debugOptions = { execArgv: ['--nolazy', '--inspect=' + (8000 + Math.round(Math.random() * 999))] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	const newLanguageClient: LanguageClientConstructor = (id: string, name: string, clientOptions: LanguageClientOptions) => {
		return new LanguageClient(id, name, serverOptions, clientOptions);
	};

	const timer = {
		setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): Disposable {
			const handle = setTimeout(callback, ms, ...args);
			return { dispose: () => clearTimeout(handle) };
		}
	};


	// pass the location of the localization bundle to the server
	process.env['VSCODE_L10N_BUNDLE_LOCATION'] = l10n.uri?.toString() ?? '';

	client = await startClient(context, newLanguageClient, { fileFs: getNodeFileFS(), TextDecoder, telemetry, timer });
}

export async function deactivate(): Promise<void> {
	if (client) {
		await client.dispose();
		client = undefined;
	}
}

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
	main: string;
}

function getPackageInfo(context: ExtensionContext): IPackageInfo {
	const location = context.asAbsolutePath('./package.json');
	try {
		return JSON.parse(fs.readFileSync(location).toString());
	} catch (e) {
		console.log(`Problems reading ${location}: ${e}`);
		return { name: '', version: '', aiKey: '', main: '' };
	}
}
