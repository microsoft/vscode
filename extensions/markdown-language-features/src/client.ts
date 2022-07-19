/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Token = require('markdown-it/lib/token');
import * as vscode from 'vscode';
import { BaseLanguageClient, LanguageClientOptions, NotebookDocumentSyncRegistrationType, RequestType } from 'vscode-languageclient';
import * as nls from 'vscode-nls';
import { IMdParser } from './markdownEngine';
import { markdownFileExtensions } from './util/file';
import { IMdWorkspace } from './workspace';

const localize = nls.loadMessageBundle();

const parseRequestType: RequestType<{ uri: string }, Token[], any> = new RequestType('markdown/parse');
const readFileRequestType: RequestType<{ uri: string }, number[], any> = new RequestType('markdown/readFile');
const statFileRequestType: RequestType<{ uri: string }, { isDirectory: boolean } | undefined, any> = new RequestType('markdown/statFile');
const readDirectoryRequestType: RequestType<{ uri: string }, [string, { isDirectory: boolean }][], any> = new RequestType('markdown/readDirectory');
const findFilesRequestTypes: RequestType<{}, string[], any> = new RequestType('markdown/findFiles');

export type LanguageClientConstructor = (name: string, description: string, clientOptions: LanguageClientOptions) => BaseLanguageClient;


export async function startClient(factory: LanguageClientConstructor, workspace: IMdWorkspace, parser: IMdParser): Promise<BaseLanguageClient> {

	const mdFileGlob = `**/*.{${markdownFileExtensions.join(',')}}`;

	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ language: 'markdown' }],
		synchronize: {
			configurationSection: ['markdown'],
			fileEvents: vscode.workspace.createFileSystemWatcher(mdFileGlob),
		},
		initializationOptions: {
			markdownFileExtensions,
		}
	};

	const client = factory('markdown', localize('markdownServer.name', 'Markdown Language Server'), clientOptions);

	client.registerProposedFeatures();

	const notebookFeature = client.getFeature(NotebookDocumentSyncRegistrationType.method);
	if (notebookFeature !== undefined) {
		notebookFeature.register({
			id: String(Date.now()),
			registerOptions: {
				notebookSelector: [{
					notebook: '*',
					cells: [{ language: 'markdown' }]
				}]
			}
		});
	}

	client.onRequest(parseRequestType, async (e) => {
		const uri = vscode.Uri.parse(e.uri);
		const doc = await workspace.getOrLoadMarkdownDocument(uri);
		if (doc) {
			return parser.tokenize(doc);
		} else {
			return [];
		}
	});

	client.onRequest(readFileRequestType, async (e): Promise<number[]> => {
		const uri = vscode.Uri.parse(e.uri);
		return Array.from(await vscode.workspace.fs.readFile(uri));
	});

	client.onRequest(statFileRequestType, async (e): Promise<{ isDirectory: boolean } | undefined> => {
		const uri = vscode.Uri.parse(e.uri);
		try {
			const stat = await vscode.workspace.fs.stat(uri);
			return { isDirectory: stat.type === vscode.FileType.Directory };
		} catch {
			return undefined;
		}
	});

	client.onRequest(readDirectoryRequestType, async (e): Promise<[string, { isDirectory: boolean }][]> => {
		const uri = vscode.Uri.parse(e.uri);
		const result = await vscode.workspace.fs.readDirectory(uri);
		return result.map(([name, type]) => [name, { isDirectory: type === vscode.FileType.Directory }]);
	});

	client.onRequest(findFilesRequestTypes, async (): Promise<string[]> => {
		return (await vscode.workspace.findFiles(mdFileGlob, '**/node_modules/**')).map(x => x.toString());
	});

	await client.start();

	return client;
}
