/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, Emitter, FileChangeType, NotebookDocuments, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as md from 'vscode-markdown-languageservice';
import { ContainingDocumentContext, FileWatcherOptions, IFileSystemWatcher } from 'vscode-markdown-languageservice/out/workspace';
import { URI } from 'vscode-uri';
import { LsConfiguration } from './config';
import * as protocol from './protocol';
import { isMarkdownFile, looksLikeMarkdownPath } from './util/file';
import { Limiter } from './util/limiter';
import { ResourceMap } from './util/resourceMap';
import { Schemes } from './util/schemes';

declare const TextDecoder: any;

export class VsCodeClientWorkspace implements md.IWorkspaceWithWatching {

	private readonly _onDidCreateMarkdownDocument = new Emitter<md.ITextDocument>();
	public readonly onDidCreateMarkdownDocument = this._onDidCreateMarkdownDocument.event;

	private readonly _onDidChangeMarkdownDocument = new Emitter<md.ITextDocument>();
	public readonly onDidChangeMarkdownDocument = this._onDidChangeMarkdownDocument.event;

	private readonly _onDidDeleteMarkdownDocument = new Emitter<URI>();
	public readonly onDidDeleteMarkdownDocument = this._onDidDeleteMarkdownDocument.event;

	private readonly _documentCache = new ResourceMap<md.ITextDocument>();

	private readonly _utf8Decoder = new TextDecoder('utf-8');

	private _watcherPool = 0;
	private readonly _watchers = new Map<number, {
		readonly resource: URI;
		readonly options: FileWatcherOptions;
		readonly onDidChange: Emitter<URI>;
		readonly onDidCreate: Emitter<URI>;
		readonly onDidDelete: Emitter<URI>;
	}>();

	constructor(
		private readonly connection: Connection,
		private readonly config: LsConfiguration,
		private readonly documents: TextDocuments<TextDocument>,
		private readonly notebooks: NotebookDocuments<TextDocument>,
		private readonly logger: md.ILogger,
	) {
		documents.onDidOpen(e => {
			this._documentCache.delete(URI.parse(e.document.uri));
			if (this.isRelevantMarkdownDocument(e.document)) {
				this._onDidCreateMarkdownDocument.fire(e.document);
			}
		});

		documents.onDidChangeContent(e => {
			if (this.isRelevantMarkdownDocument(e.document)) {
				this._onDidChangeMarkdownDocument.fire(e.document);
			}
		});

		documents.onDidClose(e => {
			const uri = URI.parse(e.document.uri);
			this._documentCache.delete(uri);

			if (this.isRelevantMarkdownDocument(e.document)) {
				this._onDidDeleteMarkdownDocument.fire(uri);
			}
		});

		connection.onDidChangeWatchedFiles(async ({ changes }) => {
			for (const change of changes) {
				const resource = URI.parse(change.uri);
				this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace: onDidChangeWatchedFiles', `${change.type}: ${resource}`);
				switch (change.type) {
					case FileChangeType.Changed: {
						this._documentCache.delete(resource);
						const document = await this.openMarkdownDocument(resource);
						if (document) {
							this._onDidChangeMarkdownDocument.fire(document);
						}
						break;
					}
					case FileChangeType.Created: {
						const document = await this.openMarkdownDocument(resource);
						if (document) {
							this._onDidCreateMarkdownDocument.fire(document);
						}
						break;
					}
					case FileChangeType.Deleted: {
						this._documentCache.delete(resource);
						this._onDidDeleteMarkdownDocument.fire(resource);
						break;
					}
				}
			}
		});

		connection.onRequest(protocol.fs_watcher_onChange, params => {
			this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace: fs_watcher_onChange', `${params.kind}: ${params.uri}`);

			const watcher = this._watchers.get(params.id);
			if (!watcher) {
				return;
			}

			switch (params.kind) {
				case 'create': watcher.onDidCreate.fire(URI.parse(params.uri)); return;
				case 'change': watcher.onDidChange.fire(URI.parse(params.uri)); return;
				case 'delete': watcher.onDidDelete.fire(URI.parse(params.uri)); return;
			}
		});
	}

	public listen() {
		this.connection.workspace.onDidChangeWorkspaceFolders(async () => {
			this.workspaceFolders = (await this.connection.workspace.getWorkspaceFolders() ?? []).map(x => URI.parse(x.uri));
		});
	}

	private _workspaceFolders: readonly URI[] = [];

	get workspaceFolders(): readonly URI[] {
		return this._workspaceFolders;
	}

	set workspaceFolders(value: readonly URI[]) {
		this._workspaceFolders = value;
	}

	async getAllMarkdownDocuments(): Promise<Iterable<md.ITextDocument>> {
		// Add opened files (such as untitled files)
		const openTextDocumentResults = this.documents.all()
			.filter(doc => this.isRelevantMarkdownDocument(doc));

		const allDocs = new ResourceMap<md.ITextDocument>();
		for (const doc of openTextDocumentResults) {
			allDocs.set(URI.parse(doc.uri), doc);
		}

		// And then add files on disk
		const maxConcurrent = 20;
		const limiter = new Limiter<md.ITextDocument | undefined>(maxConcurrent);
		const resources = await this.connection.sendRequest(protocol.findMarkdownFilesInWorkspace, {});
		await Promise.all(resources.map(strResource => {
			return limiter.queue(async () => {
				const resource = URI.parse(strResource);
				if (allDocs.has(resource)) {
					return;
				}

				const doc = await this.openMarkdownDocument(resource);
				if (doc) {
					allDocs.set(resource, doc);
				}
				return doc;
			});
		}));

		return allDocs.values();
	}

	hasMarkdownDocument(resource: URI): boolean {
		return !!this.documents.get(resource.toString());
	}

	async openMarkdownDocument(resource: URI): Promise<md.ITextDocument | undefined> {
		const existing = this._documentCache.get(resource);
		if (existing) {
			return existing;
		}

		const matchingDocument = this.documents.get(resource.toString());
		if (matchingDocument) {
			this._documentCache.set(resource, matchingDocument);
			return matchingDocument;
		}

		if (!looksLikeMarkdownPath(this.config, resource)) {
			return undefined;
		}

		try {
			const response = await this.connection.sendRequest(protocol.fs_readFile, { uri: resource.toString() });
			// TODO: LSP doesn't seem to handle Array buffers well
			const bytes = new Uint8Array(response);

			// We assume that markdown is in UTF-8
			const text = this._utf8Decoder.decode(bytes);
			const doc = TextDocument.create(resource.toString(), 'markdown', 0, text);
			this._documentCache.set(resource, doc);
			return doc;
		} catch (e) {
			return undefined;
		}
	}

	async stat(resource: URI): Promise<md.FileStat | undefined> {
		this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace: stat', `${resource}`);
		if (this._documentCache.has(resource) || this.documents.get(resource.toString())) {
			return { isDirectory: false };
		}
		return this.connection.sendRequest(protocol.fs_stat, { uri: resource.toString() });
	}

	async readDirectory(resource: URI): Promise<[string, md.FileStat][]> {
		this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace: readDir', `${resource}`);
		return this.connection.sendRequest(protocol.fs_readDirectory, { uri: resource.toString() });
	}

	getContainingDocument(resource: URI): ContainingDocumentContext | undefined {
		if (resource.scheme === Schemes.notebookCell) {
			const nb = this.notebooks.findNotebookDocumentForCell(resource.toString());
			if (nb) {
				return {
					uri: URI.parse(nb.uri),
					children: nb.cells.map(cell => ({ uri: URI.parse(cell.document) })),
				};
			}
		}
		return undefined;
	}

	watchFile(resource: URI, options: FileWatcherOptions): IFileSystemWatcher {
		const id = this._watcherPool++;
		this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace: watchFile', `(${id}) ${resource}`);

		const entry = {
			resource,
			options,
			onDidCreate: new Emitter<URI>(),
			onDidChange: new Emitter<URI>(),
			onDidDelete: new Emitter<URI>(),
		};
		this._watchers.set(id, entry);

		this.connection.sendRequest(protocol.fs_watcher_create, {
			id,
			uri: resource.toString(),
			options,
			watchParentDirs: true,
		});

		return {
			onDidCreate: entry.onDidCreate.event,
			onDidChange: entry.onDidChange.event,
			onDidDelete: entry.onDidDelete.event,
			dispose: () => {
				this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace: disposeWatcher', `(${id}) ${resource}`);
				this.connection.sendRequest(protocol.fs_watcher_delete, { id });
				this._watchers.delete(id);
			}
		};
	}

	private isRelevantMarkdownDocument(doc: TextDocument) {
		return isMarkdownFile(doc) && URI.parse(doc.uri).scheme !== 'vscode-bulkeditpreview';
	}
}
