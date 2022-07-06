/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Token = require('markdown-it/lib/token');
import * as vscode from 'vscode';
import { BaseLanguageClient, LanguageClientOptions, RequestType } from 'vscode-languageclient';
import * as nls from 'vscode-nls';
import { IMdParser } from './markdownEngine';
import { IMdWorkspace } from './workspace';

const localize = nls.loadMessageBundle();

const parseRequestType: RequestType<{ uri: string }, Token[], any> = new RequestType('markdown/parse');

export type LanguageClientConstructor = (name: string, description: string, clientOptions: LanguageClientOptions) => BaseLanguageClient;


export async function startClient(factory: LanguageClientConstructor, workspace: IMdWorkspace, parser: IMdParser): Promise<BaseLanguageClient> {

	const documentSelector = ['markdown'];

	const clientOptions: LanguageClientOptions = {
		documentSelector,
		synchronize: {
			configurationSection: ['markdown']
		},
		initializationOptions: {}
	};

	const client = factory('markdown', localize('markdownServer.name', 'Markdown Language Server'), clientOptions);

	client.registerProposedFeatures();

	client.onRequest(parseRequestType, async (e) => {
		const uri = vscode.Uri.parse(e.uri);
		const doc = await workspace.getOrLoadMarkdownDocument(uri);
		if (doc) {
			return parser.tokenize(doc);
		} else {
			return [];
		}
	});

	await client.start();

	return client;
}
