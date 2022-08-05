/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BaseLanguageClient, LanguageClientOptions, NotebookDocumentSyncRegistrationType } from 'vscode-languageclient';
import * as nls from 'vscode-nls';
import { IMdParser } from './markdownEngine';
import * as proto from './protocol';
import { looksLikeMarkdownPath, markdownFileExtensions } from './util/file';
import { IMdWorkspace } from './workspace';

const localize = nls.loadMessageBundle();

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
		},
		diagnosticPullOptions: {
			onChange: true,
			onSave: true,
			onTabs: true,
			match(_documentSelector, resource) {
				return looksLikeMarkdownPath(resource);
			},
		},

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

	client.onRequest(proto.parse, async (e) => {
		const uri = vscode.Uri.parse(e.uri);
		const doc = await workspace.getOrLoadMarkdownDocument(uri);
		if (doc) {
			return parser.tokenize(doc);
		} else {
			return [];
		}
	});

	client.onRequest(proto.fs_readFile, async (e): Promise<number[]> => {
		const uri = vscode.Uri.parse(e.uri);
		return Array.from(await vscode.workspace.fs.readFile(uri));
	});

	client.onRequest(proto.fs_stat, async (e): Promise<{ isDirectory: boolean } | undefined> => {
		const uri = vscode.Uri.parse(e.uri);
		try {
			const stat = await vscode.workspace.fs.stat(uri);
			return { isDirectory: stat.type === vscode.FileType.Directory };
		} catch {
			return undefined;
		}
	});

	client.onRequest(proto.fs_readDirectory, async (e): Promise<[string, { isDirectory: boolean }][]> => {
		const uri = vscode.Uri.parse(e.uri);
		const result = await vscode.workspace.fs.readDirectory(uri);
		return result.map(([name, type]) => [name, { isDirectory: type === vscode.FileType.Directory }]);
	});

	client.onRequest(proto.findMarkdownFilesInWorkspace, async (): Promise<string[]> => {
		return (await vscode.workspace.findFiles(mdFileGlob, '**/node_modules/**')).map(x => x.toString());
	});

	const watchers = new Map<number, vscode.FileSystemWatcher>();

	client.onRequest(proto.fs_watcher_create, async (params): Promise<void> => {
		const id = params.id;
		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.parse(params.uri), '*'), params.options.ignoreCreate, params.options.ignoreChange, params.options.ignoreDelete);
		watchers.set(id, watcher);
		watcher.onDidCreate(() => { client.sendRequest(proto.fs_watcher_onChange, { id, uri: params.uri, kind: 'create' }); });
		watcher.onDidChange(() => { client.sendRequest(proto.fs_watcher_onChange, { id, uri: params.uri, kind: 'change' }); });
		watcher.onDidDelete(() => { client.sendRequest(proto.fs_watcher_onChange, { id, uri: params.uri, kind: 'delete' }); });
	});

	client.onRequest(proto.fs_watcher_delete, async (params): Promise<void> => {
		watchers.get(params.id)?.dispose();
		watchers.delete(params.id);
	});

	await client.start();

	return client;
}
