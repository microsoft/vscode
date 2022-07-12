/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, Emitter, FileChangeType, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as md from 'vscode-markdown-languageservice';
import { URI } from 'vscode-uri';
import * as protocol from './protocol';
import { coalesce } from './util/arrays';
import { isMarkdownDocument, looksLikeMarkdownPath } from './util/file';
import { Limiter } from './util/limiter';
import { ResourceMap } from './util/resourceMap';

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
		private readonly documents: TextDocuments<TextDocument>,
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
						const document = await this.getOrLoadMarkdownDocument(resource);
						if (document) {
							this._onDidChangeMarkdownDocument.fire(document);
						}
						break;
					}
					case FileChangeType.Created: {
						const document = await this.getOrLoadMarkdownDocument(resource);
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

	async getAllMarkdownDocuments(): Promise<Iterable<md.ITextDocument>> {
		const maxConcurrent = 20;

		const foundFiles = new ResourceMap<void>();
		const limiter = new Limiter<md.ITextDocument | undefined>(maxConcurrent);

		// Add files on disk
		const resources = await this.connection.sendRequest(protocol.findFilesRequestTypes, {});
		const onDiskResults = await Promise.all(resources.map(strResource => {
			return limiter.queue(async () => {
				const resource = URI.parse(strResource);
				const doc = await this.getOrLoadMarkdownDocument(resource);
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

	async getOrLoadMarkdownDocument(resource: URI): Promise<md.ITextDocument | undefined> {
		const existing = this._documentCache.get(resource);
		if (existing) {
			return existing;
		}

		const matchingDocument = this.documents.get(resource.toString());
		if (matchingDocument) {
			this._documentCache.set(resource, matchingDocument);
			return matchingDocument;
		}

		if (!looksLikeMarkdownPath(resource)) {
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

	async pathExists(_resource: URI): Promise<boolean> {
		return false;
	}

	async readDirectory(_resource: URI): Promise<[string, { isDir: boolean }][]> {
		return [];
	}

	private isRelevantMarkdownDocument(doc: TextDocument) {
		return isMarkdownDocument(doc) && URI.parse(doc.uri).scheme !== 'vscode-bulkeditpreview';
	}
}
