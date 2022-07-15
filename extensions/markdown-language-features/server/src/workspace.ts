/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, Emitter, FileChangeType, NotebookDocuments, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as md from 'vscode-markdown-languageservice';
import { ContainingDocumentContext } from 'vscode-markdown-languageservice/out/workspace';
import { URI } from 'vscode-uri';
import { LsConfiguration } from './config';
import * as protocol from './protocol';
import { coalesce } from './util/arrays';
import { isMarkdownFile, looksLikeMarkdownPath } from './util/file';
import { Limiter } from './util/limiter';
import { ResourceMap } from './util/resourceMap';
import { Schemes } from './util/schemes';

declare const TextDecoder: any;

export class VsCodeClientWorkspace implements md.IWorkspace {

	private readonly _onDidCreateMarkdownDocument = new Emitter<md.ITextDocument>();
	public readonly onDidCreateMarkdownDocument = this._onDidCreateMarkdownDocument.event;

	private readonly _onDidChangeMarkdownDocument = new Emitter<md.ITextDocument>();
	public readonly onDidChangeMarkdownDocument = this._onDidChangeMarkdownDocument.event;

	private readonly _onDidDeleteMarkdownDocument = new Emitter<URI>();
	public readonly onDidDeleteMarkdownDocument = this._onDidDeleteMarkdownDocument.event;

	private readonly _documentCache = new ResourceMap<md.ITextDocument>();

	private readonly _utf8Decoder = new TextDecoder('utf-8');

	constructor(
		private readonly connection: Connection,
		private readonly config: LsConfiguration,
		private readonly documents: TextDocuments<TextDocument>,
		private readonly notebooks: NotebookDocuments<TextDocument>,
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
			this._documentCache.delete(URI.parse(e.document.uri));
		});

		connection.onDidChangeWatchedFiles(async ({ changes }) => {
			for (const change of changes) {
				const resource = URI.parse(change.uri);
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
		const maxConcurrent = 20;

		const foundFiles = new ResourceMap<void>();
		const limiter = new Limiter<md.ITextDocument | undefined>(maxConcurrent);

		// Add files on disk
		const resources = await this.connection.sendRequest(protocol.findFilesRequestTypes, {});
		const onDiskResults = await Promise.all(resources.map(strResource => {
			return limiter.queue(async () => {
				const resource = URI.parse(strResource);
				const doc = await this.openMarkdownDocument(resource);
				if (doc) {
					foundFiles.set(resource);
				}
				return doc;
			});
		}));

		// Add opened files (such as untitled files)
		const openTextDocumentResults = await Promise.all(this.documents.all()
			.filter(doc => !foundFiles.has(URI.parse(doc.uri)) && this.isRelevantMarkdownDocument(doc)));

		return coalesce([...onDiskResults, ...openTextDocumentResults]);
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
			const response = await this.connection.sendRequest(protocol.readFileRequestType, { uri: resource.toString() });
			// TODO: LSP doesn't seem to handle Array buffers well
			const bytes = new Uint8Array(response);

			// We assume that markdown is in UTF-8
			const text = this._utf8Decoder.decode(bytes);
			const doc = new md.InMemoryDocument(resource, text, 0);
			this._documentCache.set(resource, doc);
			return doc;
		} catch (e) {
			return undefined;
		}
	}

	async stat(resource: URI): Promise<md.FileStat | undefined> {
		if (this._documentCache.has(resource) || this.documents.get(resource.toString())) {
			return { isDirectory: false };
		}
		return this.connection.sendRequest(protocol.statFileRequestType, { uri: resource.toString() });
	}

	async readDirectory(resource: URI): Promise<[string, md.FileStat][]> {
		return this.connection.sendRequest(protocol.readDirectoryRequestType, { uri: resource.toString() });
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

	private isRelevantMarkdownDocument(doc: TextDocument) {
		return isMarkdownFile(doc) && URI.parse(doc.uri).scheme !== 'vscode-bulkeditpreview';
	}
}
