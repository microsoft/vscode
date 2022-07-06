/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, Emitter, Event, InitializeParams, InitializeResult, RequestType, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentSymbol, Position, Range } from 'vscode-languageserver-types';
import * as md from 'vscode-markdown-languageservice';
import { URI } from 'vscode-uri';
import { consoleLogger } from './logging';


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
		const pos = this._doc.positionAt(offset);
		return md.makePosition(pos.line, pos.character);
	}
}

export function startServer(connection: Connection) {
	const documents = new TextDocuments(TextDocument);
	documents.listen(connection);

	connection.onInitialize((_params: InitializeParams): InitializeResult => {
		return {
			capabilities: {
				documentSymbolProvider: true,
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

	const provider = md.createLanguageService(workspace, parser, consoleLogger);

	connection.onDocumentSymbol(async (documentSymbolParams, _token): Promise<DocumentSymbol[]> => {
		try {
			const document = documents.get(documentSymbolParams.textDocument.uri) as TextDocument | undefined;
			if (document) {
				const response = await provider.provideDocumentSymbols(new TextDocumentToITextDocumentAdapter(document));
				// TODO: only required because extra methods returned on positions/ranges
				return response.map(symbol => convertDocumentSymbol(symbol));
			}
		} catch (e) {
			console.error(e.stack);
		}
		return [];
	});

	connection.listen();
}


function convertDocumentSymbol(sym: DocumentSymbol): DocumentSymbol {
	return {
		kind: sym.kind,
		name: sym.name,
		range: convertRange(sym.range),
		selectionRange: convertRange(sym.selectionRange),
		children: sym.children?.map(convertDocumentSymbol),
		detail: sym.detail,
		tags: sym.tags,
	};
}

function convertRange(range: Range): Range {
	return {
		start: convertPosition(range.start),
		end: convertPosition(range.end),
	};
}

function convertPosition(start: Position): Position {
	return {
		character: start.character,
		line: start.line,
	};
}
