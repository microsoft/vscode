/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, Emitter, Event, InitializeParams, InitializeResult, RequestType, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as lsp from 'vscode-languageserver-types';
import * as md from 'vscode-markdown-languageservice';
import { URI } from 'vscode-uri';
import { LogFunctionLogger } from './logging';


const parseRequestType: RequestType<{ uri: string }, md.Token[], any> = new RequestType('markdown/parse');

class TextDocumentToITextDocumentAdapter implements md.ITextDocument {
	public readonly uri: md.IUri;

	public get version(): number { return this._doc.version; }

	public get lineCount(): number { return this._doc.lineCount; }

	constructor(
		private readonly _doc: TextDocument,
	) {
		this.uri = URI.parse(this._doc.uri);
	}

	getText(range?: md.IRange | undefined): string {
		return this._doc.getText(range);
	}

	positionAt(offset: number): md.IPosition {
		return this._doc.positionAt(offset);
	}
}

export function startServer(connection: Connection) {
	const documents = new TextDocuments(TextDocument);
	documents.listen(connection);

	connection.onInitialize((_params: InitializeParams): InitializeResult => {
		return {
			capabilities: {
				documentSymbolProvider: true,
				foldingRangeProvider: true,
				selectionRangeProvider: true,
			}
		};
	});


	const parser = new class implements md.IMdParser {
		slugifier = md.githubSlugifier;

		async tokenize(document: md.ITextDocument): Promise<md.Token[]> {
			return await connection.sendRequest(parseRequestType, { uri: document.uri.toString() });
		}
	};

	const workspace = new class implements md.IMdWorkspace {

		private readonly _onDidChangeMarkdownDocument = new Emitter<md.ITextDocument>();
		onDidChangeMarkdownDocument: Event<md.ITextDocument> = this._onDidChangeMarkdownDocument.event;

		private readonly _onDidCreateMarkdownDocument = new Emitter<md.ITextDocument>();
		onDidCreateMarkdownDocument: Event<md.ITextDocument> = this._onDidCreateMarkdownDocument.event;

		private readonly _onDidDeleteMarkdownDocument = new Emitter<md.IUri>();
		onDidDeleteMarkdownDocument: Event<md.IUri> = this._onDidDeleteMarkdownDocument.event;

		async getAllMarkdownDocuments(): Promise<Iterable<md.ITextDocument>> {
			return documents.all().map(doc => new TextDocumentToITextDocumentAdapter(doc));
		}
		hasMarkdownDocument(resource: md.IUri): boolean {
			return !!documents.get(resource.toString());
		}
		async getOrLoadMarkdownDocument(_resource: md.IUri): Promise<md.ITextDocument | undefined> {
			return undefined;
		}
		async pathExists(_resource: md.IUri): Promise<boolean> {
			return false;
		}
		async readDirectory(_resource: md.IUri): Promise<[string, { isDir: boolean }][]> {
			return [];
		}
	};

	const logger = new LogFunctionLogger(connection.console.log.bind(connection.console));
	const provider = md.createLanguageService(workspace, parser, logger);

	connection.onDocumentSymbol(async (params, token): Promise<lsp.DocumentSymbol[]> => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider.provideDocumentSymbols(new TextDocumentToITextDocumentAdapter(document), token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.onFoldingRanges(async (params, token): Promise<lsp.FoldingRange[]> => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider.provideFoldingRanges(new TextDocumentToITextDocumentAdapter(document), token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.onSelectionRanges(async (params, token): Promise<lsp.SelectionRange[] | undefined> => {
		try {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return await provider.provideSelectionRanges(new TextDocumentToITextDocumentAdapter(document), params.positions, token);
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.listen();
}
