/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, Emitter, FileChangeType, NotebookDocuments, Position, Range, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as md from 'vscode-markdown-languageservice';
import { URI } from 'vscode-uri';
import { LsConfiguration } from './config';
import * as protocol from './protocol';
import { isMarkdownFile, looksLikeMarkdownPath } from './util/file';
import { Limiter } from './util/limiter';
import { ResourceMap } from './util/resourceMap';
import { Schemes } from './util/schemes';

declare const TextDecoder: any;

class VsCodeDocument implements md.ITextDocument {

	private inMemoryDoc?: TextDocument;
	private onDiskDoc?: TextDocument;

	readonly uri: string;

	constructor(uri: string, init: { inMemoryDoc: TextDocument });
	constructor(uri: string, init: { onDiskDoc: TextDocument });
	constructor(uri: string, init: { inMemoryDoc?: TextDocument; onDiskDoc?: TextDocument }) {
		this.uri = uri;
		this.inMemoryDoc = init?.inMemoryDoc;
		this.onDiskDoc = init?.onDiskDoc;
	}

	get version(): number {
		return this.inMemoryDoc?.version ?? this.onDiskDoc?.version ?? 0;
	}

	get lineCount(): number {
		return this.inMemoryDoc?.lineCount ?? this.onDiskDoc?.lineCount ?? 0;
	}

	getText(range?: Range): string {
		if (this.inMemoryDoc) {
			return this.inMemoryDoc.getText(range);
		}

		if (this.onDiskDoc) {
			return this.onDiskDoc.getText(range);
		}

		throw new Error('Document has been closed');
	}

	positionAt(offset: number): Position {
		if (this.inMemoryDoc) {
			return this.inMemoryDoc.positionAt(offset);
		}

		if (this.onDiskDoc) {
			return this.onDiskDoc.positionAt(offset);
		}

		throw new Error('Document has been closed');
	}

	offsetAt(position: Position): number {
		if (this.inMemoryDoc) {
			return this.inMemoryDoc.offsetAt(position);
		}

		if (this.onDiskDoc) {
			return this.onDiskDoc.offsetAt(position);
		}

		throw new Error('Document has been closed');
	}

	hasInMemoryDoc(): boolean {
		return !!this.inMemoryDoc;
	}

	isDetached(): boolean {
		return !this.onDiskDoc && !this.inMemoryDoc;
	}

	setInMemoryDoc(doc: TextDocument | undefined) {
		this.inMemoryDoc = doc;
	}

	setOnDiskDoc(doc: TextDocument | undefined) {
		this.onDiskDoc = doc;
	}
}

export class VsCodeClientWorkspace implements md.IWorkspaceWithWatching {

	private readonly _onDidCreateMarkdownDocument = new Emitter<md.ITextDocument>();
	public readonly onDidCreateMarkdownDocument = this._onDidCreateMarkdownDocument.event;

	private readonly _onDidChangeMarkdownDocument = new Emitter<md.ITextDocument>();
	public readonly onDidChangeMarkdownDocument = this._onDidChangeMarkdownDocument.event;

	private readonly _onDidDeleteMarkdownDocument = new Emitter<URI>();
	public readonly onDidDeleteMarkdownDocument = this._onDidDeleteMarkdownDocument.event;

	private readonly _documentCache = new ResourceMap<VsCodeDocument>();

	private readonly _utf8Decoder = new TextDecoder('utf-8');

	private _watcherPool = 0;
	private readonly _watchers = new Map<number, {
		readonly resource: URI;
		readonly options: md.FileWatcherOptions;
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
			if (!this.isRelevantMarkdownDocument(e.document)) {
				return;
			}

			this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace.TextDocument.onDidOpen', { document: e.document.uri });

			const uri = URI.parse(e.document.uri);
			const doc = this._documentCache.get(uri);

			if (doc) {
				// File already existed on disk
				doc.setInMemoryDoc(e.document);

				// The content visible to the language service may have changed since the in-memory doc
				// may differ from the one on-disk. To be safe we always fire a change event.
				this._onDidChangeMarkdownDocument.fire(doc);
			} else {
				// We're creating the file for the first time
				const doc = new VsCodeDocument(e.document.uri, { inMemoryDoc: e.document });
				this._documentCache.set(uri, doc);
				this._onDidCreateMarkdownDocument.fire(doc);
			}
		});

		documents.onDidChangeContent(e => {
			if (!this.isRelevantMarkdownDocument(e.document)) {
				return;
			}

			this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace.TextDocument.onDidChanceContent', { document: e.document.uri });

			const uri = URI.parse(e.document.uri);
			const entry = this._documentCache.get(uri);
			if (entry) {
				entry.setInMemoryDoc(e.document);
				this._onDidChangeMarkdownDocument.fire(entry);
			}
		});

		documents.onDidClose(async e => {
			if (!this.isRelevantMarkdownDocument(e.document)) {
				return;
			}

			this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace.TextDocument.onDidClose', { document: e.document.uri });

			const uri = URI.parse(e.document.uri);
			const doc = this._documentCache.get(uri);
			if (!doc) {
				// Document was never opened
				return;
			}

			doc.setInMemoryDoc(undefined);
			if (doc.isDetached()) {
				// The document has been fully closed
				this.doDeleteDocument(uri);
				return;
			}

			// Check that if file has been deleted on disk.
			// This can happen when directories are renamed / moved. VS Code's file system watcher does not
			// notify us when this happens.
			if (!(await this.statBypassingCache(uri))) {
				if (this._documentCache.get(uri) === doc && !doc.hasInMemoryDoc()) {
					this.doDeleteDocument(uri);
					return;
				}
			}

			// The document still exists on disk
			// To be safe, tell the service that the document has changed because the
			// in-memory doc contents may be different than the disk doc contents.
			this._onDidChangeMarkdownDocument.fire(doc);
		});

		connection.onDidChangeWatchedFiles(async ({ changes }) => {
			for (const change of changes) {
				const resource = URI.parse(change.uri);
				this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace.onDidChangeWatchedFiles', { type: change.type, resource: resource.toString() });
				switch (change.type) {
					case FileChangeType.Changed: {
						const entry = this._documentCache.get(resource);
						if (entry) {
							// Refresh the on-disk state
							const document = await this.openMarkdownDocumentFromFs(resource);
							if (document) {
								this._onDidChangeMarkdownDocument.fire(document);
							}
						}
						break;
					}
					case FileChangeType.Created: {
						const entry = this._documentCache.get(resource);
						if (entry) {
							// Create or update the on-disk state
							const document = await this.openMarkdownDocumentFromFs(resource);
							if (document) {
								this._onDidCreateMarkdownDocument.fire(document);
							}
						}
						break;
					}
					case FileChangeType.Deleted: {
						const entry = this._documentCache.get(resource);
						if (entry) {
							entry.setOnDiskDoc(undefined);
							if (entry.isDetached()) {
								this.doDeleteDocument(resource);
							}
						}
						break;
					}
				}
			}
		});

		connection.onRequest(protocol.fs_watcher_onChange, params => {
			this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace.fs_watcher_onChange', { kind: params.kind, uri: params.uri });

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
			let entry = this._documentCache.get(resource);
			if (entry) {
				entry.setInMemoryDoc(matchingDocument);
			} else {
				entry = new VsCodeDocument(resource.toString(), { inMemoryDoc: matchingDocument });
				this._documentCache.set(resource, entry);
			}

			return entry;
		}

		return this.openMarkdownDocumentFromFs(resource);
	}

	private async openMarkdownDocumentFromFs(resource: URI): Promise<md.ITextDocument | undefined> {
		if (!looksLikeMarkdownPath(this.config, resource)) {
			return undefined;
		}

		try {
			const response = await this.connection.sendRequest(protocol.fs_readFile, { uri: resource.toString() });
			// TODO: LSP doesn't seem to handle Array buffers well
			const bytes = new Uint8Array(response);

			// We assume that markdown is in UTF-8
			const text = this._utf8Decoder.decode(bytes);
			const doc = new VsCodeDocument(resource.toString(), {
				onDiskDoc: TextDocument.create(resource.toString(), 'markdown', 0, text)
			});
			this._documentCache.set(resource, doc);
			return doc;
		} catch (e) {
			return undefined;
		}
	}

	async stat(resource: URI): Promise<md.FileStat | undefined> {
		this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace.stat', { resource: resource.toString() });
		if (this._documentCache.has(resource)) {
			return { isDirectory: false };
		}
		return this.statBypassingCache(resource);
	}

	private async statBypassingCache(resource: URI): Promise<md.FileStat | undefined> {
		const uri = resource.toString();
		if (this.documents.get(uri)) {
			return { isDirectory: false };
		}
		const fsResult = await this.connection.sendRequest(protocol.fs_stat, { uri });
		return fsResult ?? undefined; // Force convert null to undefined
	}

	async readDirectory(resource: URI): Promise<[string, md.FileStat][]> {
		this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace.readDir', { resource: resource.toString() });
		return this.connection.sendRequest(protocol.fs_readDirectory, { uri: resource.toString() });
	}

	getContainingDocument(resource: URI): md.ContainingDocumentContext | undefined {
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

	watchFile(resource: URI, options: md.FileWatcherOptions): md.IFileSystemWatcher {
		const id = this._watcherPool++;
		this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace.watchFile', { id, resource: resource.toString() });

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
				this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace.disposeWatcher', { id, resource: resource.toString() });
				this.connection.sendRequest(protocol.fs_watcher_delete, { id });
				this._watchers.delete(id);
			}
		};
	}

	private isRelevantMarkdownDocument(doc: TextDocument) {
		return isMarkdownFile(doc) && URI.parse(doc.uri).scheme !== 'vscode-bulkeditpreview';
	}

	private doDeleteDocument(uri: URI) {
		this.logger.log(md.LogLevel.Trace, 'VsCodeClientWorkspace.deleteDocument', { document: uri.toString() });

		this._documentCache.delete(uri);
		this._onDidDeleteMarkdownDocument.fire(uri);
	}
}
