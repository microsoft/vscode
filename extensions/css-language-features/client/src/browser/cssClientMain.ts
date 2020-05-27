/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext } from 'vscode';
import { CommonLanguageClient, LanguageClientOptions, MessageTransports } from 'vscode-languageclient';
import { startClient, LanguageClientConstructor } from '../cssClient';
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-jsonrpc/lib/browser/main';

declare const Worker: {
	new(stringUrl: string): any;
};

class BrowserLanguageClient extends CommonLanguageClient {

	constructor(id: string, name: string, clientOptions: LanguageClientOptions, private worker: any) {
		super(id, name, clientOptions);
	}

	protected createMessageTransports(_encoding: string): Promise<MessageTransports> {
		const reader = new BrowserMessageReader(this.worker);
		const writer = new BrowserMessageWriter(this.worker);
		return Promise.resolve({ reader, writer });
	}

}

// this method is called when vs code is activated
export function activate(context: ExtensionContext) {
	const serverMain = context.asAbsolutePath('server/dist/browser/cssServerMain.js');
	try {
		const worker = new Worker(serverMain);
		const newLanguageClient: LanguageClientConstructor = (id: string, name: string, clientOptions: LanguageClientOptions) => {
			return new BrowserLanguageClient(id, name, clientOptions, worker);
		};

		startClient(context, newLanguageClient, {});

	} catch (e) {
		console.log(e);
	}
}
