/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BaseLanguageClient, LanguageClientOptions, NotebookDocumentSyncRegistrationType } from 'vscode-languageclient';
import { disposeAll, IDisposable } from 'vscode-markdown-languageservice/out/util/dispose';
import { ResourceMap } from 'vscode-markdown-languageservice/out/util/resourceMap';
import * as nls from 'vscode-nls';
import { Utils } from 'vscode-uri';
import { IMdParser } from './markdownEngine';
import * as proto from './protocol';
import { looksLikeMarkdownPath, markdownFileExtensions } from './util/file';
import { Schemes } from './util/schemes';
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

	const watchers = new FileWatcherManager();

	client.onRequest(proto.fs_watcher_create, async (params): Promise<void> => {
		const id = params.id;
		const uri = vscode.Uri.parse(params.uri);

		const sendWatcherChange = (kind: 'create' | 'change' | 'delete') => {
			client.sendRequest(proto.fs_watcher_onChange, { id, uri: params.uri, kind });
		};

		watchers.create(id, uri, params.watchParentDirs, {
			create: params.options.ignoreCreate ? undefined : () => sendWatcherChange('create'),
			change: params.options.ignoreChange ? undefined : () => sendWatcherChange('change'),
			delete: params.options.ignoreDelete ? undefined : () => sendWatcherChange('delete'),
		});
	});

	client.onRequest(proto.fs_watcher_delete, async (params): Promise<void> => {
		watchers.delete(params.id);
	});

	vscode.commands.registerCommand('vscodeMarkdownLanguageservice.open', (uri, args) => {
		return vscode.commands.executeCommand('vscode.open', uri, args);
	});

	await client.start();

	return client;
}

type DirWatcherEntry = {
	readonly uri: vscode.Uri;
	readonly listeners: IDisposable[];
};

class FileWatcherManager {

	private readonly fileWatchers = new Map<number, {
		readonly watcher: vscode.FileSystemWatcher;
		readonly dirWatchers: DirWatcherEntry[];
	}>();

	private readonly dirWatchers = new ResourceMap<{
		readonly watcher: vscode.FileSystemWatcher;
		refCount: number;
	}>();

	create(id: number, uri: vscode.Uri, watchParentDirs: boolean, listeners: { create?: () => void; change?: () => void; delete?: () => void }): void {
		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(uri, '*'), !listeners.create, !listeners.change, !listeners.delete);
		const parentDirWatchers: DirWatcherEntry[] = [];
		this.fileWatchers.set(id, { watcher, dirWatchers: parentDirWatchers });

		if (listeners.create) { watcher.onDidCreate(listeners.create); }
		if (listeners.change) { watcher.onDidChange(listeners.change); }
		if (listeners.delete) { watcher.onDidDelete(listeners.delete); }

		if (watchParentDirs && uri.scheme !== Schemes.untitled) {
			// We need to watch the parent directories too for when these are deleted / created
			for (let dirUri = Utils.dirname(uri); dirUri.path.length > 1; dirUri = Utils.dirname(dirUri)) {
				const dirWatcher: DirWatcherEntry = { uri: dirUri, listeners: [] };

				let parentDirWatcher = this.dirWatchers.get(dirUri);
				if (!parentDirWatcher) {
					const glob = new vscode.RelativePattern(Utils.dirname(dirUri), Utils.basename(dirUri));
					const parentWatcher = vscode.workspace.createFileSystemWatcher(glob, !listeners.create, true, !listeners.delete);
					parentDirWatcher = { refCount: 0, watcher: parentWatcher };
					this.dirWatchers.set(dirUri, parentDirWatcher);
				}
				parentDirWatcher.refCount++;

				if (listeners.create) {
					dirWatcher.listeners.push(parentDirWatcher.watcher.onDidCreate(async () => {
						// Just because the parent dir was created doesn't mean our file was created
						try {
							const stat = await vscode.workspace.fs.stat(uri);
							if (stat.type === vscode.FileType.File) {
								listeners.create!();
							}
						} catch {
							// Noop
						}
					}));
				}

				if (listeners.delete) {
					// When the parent dir is deleted, consider our file deleted too

					// TODO: this fires if the file previously did not exist and then the parent is deleted
					dirWatcher.listeners.push(parentDirWatcher.watcher.onDidDelete(listeners.delete));
				}

				parentDirWatchers.push(dirWatcher);
			}
		}
	}

	delete(id: number): void {
		const entry = this.fileWatchers.get(id);
		if (entry) {
			for (const dirWatcher of entry.dirWatchers) {
				disposeAll(dirWatcher.listeners);

				const dirWatcherEntry = this.dirWatchers.get(dirWatcher.uri);
				if (dirWatcherEntry) {
					if (--dirWatcherEntry.refCount <= 0) {
						dirWatcherEntry.watcher.dispose();
						this.dirWatchers.delete(dirWatcher.uri);
					}
				}
			}

			entry.watcher.dispose();
		}

		this.fileWatchers.delete(id);
	}
}
