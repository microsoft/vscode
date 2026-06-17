/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TreeSitterExpressionInfo } from '../../../platform/parser/node/nodes';
import { IParserService } from '../../../platform/parser/node/parserService';
import { getWasmLanguage } from '../../../platform/parser/node/treeSitterLanguages';
import { getLanguageForResource } from '../../../util/common/languages';
import { Limiter } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { escapeRegExpCharacters } from '../../../util/vs/base/common/strings';
import { isUriComponents, URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { PromptReference } from '../../prompt/common/conversation';
import { extractSymbolNamesInCode } from './findSymbol';

/**
 * How the word was resolved.
 */
enum ResolvedWordLocationType {
	// Ordered by priority. Higher properties are preferred.

	/** Resolve using string matching */
	TextualMatch = 1,

	/** Resolve by matching a symbol name in code */
	SymbolMatch = 2,

	/** Resolve by matching a definition in code */
	// TODO: not implemented yet
	Definition = 3,
}

interface ResolvedWordLocation {
	readonly type: ResolvedWordLocationType;
	readonly location: vscode.Location;
}

interface FindWordOptions {
	readonly symbolMatchesOnly?: boolean;
	readonly maxResultCount?: number;
}

export interface FileSymbol {
	readonly identifier: string;
	readonly location: vscode.Location;
}

export interface FileSymbols {
	readonly declarations: readonly FileSymbol[];
	readonly getGenericSymbols: () => Promise<readonly FileSymbol[]>;
}

export type SymbolFileCache = Map<string, Promise<FileSymbols>>;

export async function findSymbolLocationInFile(
	parserService: IParserService,
	uri: vscode.Uri,
	symbolText: string,
	token: CancellationToken,
	cache?: SymbolFileCache
): Promise<vscode.Location | undefined> {
	if (token.isCancellationRequested) {
		return;
	}

	const symbols = await getCachedFileSymbols(parserService, uri, token, cache);
	if (token.isCancellationRequested) {
		return;
	}

	const exactMatch = findExactSymbol(symbols.declarations, symbolText);
	if (exactMatch) {
		return exactMatch.location;
	}

	const symbolParts = extractSymbolNamesInCode(symbolText);
	if (symbolParts.length) {
		const declarationMatch = findBestSymbolPart(symbols.declarations, symbolParts);
		if (declarationMatch) {
			return declarationMatch.location;
		}
	}

	const genericSymbols = await symbols.getGenericSymbols();
	if (token.isCancellationRequested) {
		return;
	}

	return findExactSymbol(genericSymbols, symbolText)?.location
		?? (symbolParts.length ? findBestSymbolPart(genericSymbols, symbolParts)?.location : undefined);
}

function findExactSymbol(symbols: readonly FileSymbol[], symbolText: string): FileSymbol | undefined {
	return symbols.find(symbol => symbol.identifier === symbolText);
}

function findBestSymbolPart(symbols: readonly FileSymbol[], symbolParts: readonly string[]): FileSymbol | undefined {
	let bestMatch: { symbol: FileSymbol; matchIndex: number } | undefined;
	for (const symbol of symbols) {
		const matchIndex = symbolParts.indexOf(symbol.identifier);
		if (matchIndex !== -1 && (!bestMatch || matchIndex > bestMatch.matchIndex)) {
			bestMatch = { symbol, matchIndex };
		}
	}

	return bestMatch?.symbol;
}

async function getCachedFileSymbols(
	parserService: IParserService,
	uri: vscode.Uri,
	token: CancellationToken,
	cache: SymbolFileCache | undefined
): Promise<FileSymbols> {
	const key = uri.toString();
	const existing = cache?.get(key);
	if (existing) {
		return existing;
	}

	const pending = doGetFileSymbols(parserService, uri, token);
	cache?.set(key, pending);
	return pending;
}

async function doGetFileSymbols(parserService: IParserService, uri: vscode.Uri, token: CancellationToken): Promise<FileSymbols> {
	const languageId = getLanguageForResource(uri).languageId;
	const wasmLanguage = getWasmLanguage(languageId);
	if (!wasmLanguage) {
		return emptyFileSymbols();
	}

	const doc = await openDocument(uri);
	if (!doc || token.isCancellationRequested) {
		return emptyFileSymbols();
	}

	try {
		const text = doc.getText();
		const ast = parserService.getTreeSitterASTForWASMLanguage(wasmLanguage, text);
		const [classDeclarations, functionDefinitions, typeDeclarations] = await Promise.all([
			ast.getClassDeclarations(),
			ast.getFunctionDefinitions(),
			ast.getTypeDeclarations(),
		]);
		let genericSymbols: Promise<readonly FileSymbol[]> | undefined;
		return {
			declarations: toFileSymbols(uri, doc, [
				...classDeclarations,
				...functionDefinitions,
				...typeDeclarations,
			]),
			getGenericSymbols: () => {
				if (token.isCancellationRequested) {
					return Promise.resolve([]);
				}
				genericSymbols ??= (async () => {
					const symbols = await ast.getSymbols({
						startIndex: 0,
						endIndex: text.length,
					});
					return toFileSymbols(uri, doc, symbols);
				})().catch(() => []);
				return genericSymbols;
			},
		};
	} catch {
		return emptyFileSymbols();
	}
}

function toFileSymbols(uri: vscode.Uri, doc: SimpleTextDocument, symbols: readonly TreeSitterExpressionInfo[]): readonly FileSymbol[] {
	return symbols.map(symbol => ({
		identifier: symbol.identifier,
		location: new vscode.Location(uri, doc.positionAt(symbol.startIndex))
	}));
}

function emptyFileSymbols(): FileSymbols {
	return {
		declarations: [],
		getGenericSymbols: async () => []
	};
}

export async function findWordInReferences(
	accessor: ServicesAccessor,
	references: readonly PromptReference[],
	word: string,
	options: FindWordOptions,
	token: CancellationToken,
	documentCache?: Map<string, Promise<SimpleTextDocument | undefined>>,
): Promise<vscode.Location[]> {
	const parserService = accessor.get(IParserService);

	const out: ResolvedWordLocation[] = [];
	const maxResultCount = options.maxResultCount ?? Infinity;
	const limiter = new Limiter<void>(10);
	try {
		await Promise.all(references.map(ref =>
			limiter.queue(async () => {
				if (out.length >= maxResultCount || token.isCancellationRequested) {
					return;
				}

				let loc: ResolvedWordLocation | undefined;
				if (isUriComponents(ref.anchor)) {
					loc = await findWordInDoc(parserService, word, ref.anchor, new vscode.Range(0, 0, Number.MAX_SAFE_INTEGER, 0), options, token, documentCache);
				} else if ('range' in ref.anchor) {
					loc = await findWordInDoc(parserService, word, ref.anchor.uri, ref.anchor.range, options, token, documentCache);
				} else if ('value' in ref.anchor && URI.isUri(ref.anchor.value)) {
					loc = await findWordInDoc(parserService, word, ref.anchor.value, new vscode.Range(0, 0, Number.MAX_SAFE_INTEGER, 0), options, token, documentCache);
				}

				if (loc) {
					out.push(loc);
				}
			})));
	} finally {
		limiter.dispose();
	}

	return out
		.sort((a, b) => b.type - a.type)
		.map(x => x.location)
		.slice(0, options.maxResultCount);
}

async function findWordInDoc(parserService: IParserService, word: string, uri: vscode.Uri, range: vscode.Range, options: FindWordOptions, token: vscode.CancellationToken, documentCache?: Map<string, Promise<SimpleTextDocument | undefined>>): Promise<ResolvedWordLocation | undefined> {
	if (options.symbolMatchesOnly) {
		const languageId = getLanguageForResource(uri).languageId;
		if (!getWasmLanguage(languageId)) {
			return;
		}
	}

	const doc = await openDocument(uri, documentCache);
	if (!doc || token.isCancellationRequested) {
		return;
	}

	const symbols = await getSymbolsInRange(parserService, doc, range, token);
	if (token.isCancellationRequested) {
		return;
	}

	for (const symbol of symbols) {
		if (symbol.identifier === word) {
			const pos = doc.positionAt(symbol.startIndex);
			return { type: ResolvedWordLocationType.SymbolMatch, location: new vscode.Location(uri, pos) };
		}
	}

	if (options.symbolMatchesOnly) {
		return;
	}

	// Fall back to word based
	const text = doc.getText(range);
	const startOffset = doc.offsetAt(range.start);
	for (const match of text.matchAll(new RegExp(escapeRegExpCharacters(word), 'g'))) {
		if (match.index) {
			const wordPos = doc.positionAt(startOffset + match.index);
			if ('getWordRangeAtPosition' in doc) {
				const wordInDoc = doc.getText((doc as vscode.TextDocument).getWordRangeAtPosition(wordPos));
				if (word === wordInDoc) {
					return { type: ResolvedWordLocationType.TextualMatch, location: new vscode.Location(uri, wordPos) };
				}
			} else {
				const wordInDoc = doc.getText(new vscode.Range(wordPos, doc.positionAt(doc.offsetAt(wordPos) + word.length)));
				if (word === wordInDoc) {
					return { type: ResolvedWordLocationType.TextualMatch, location: new vscode.Location(uri, wordPos) };
				}
			}
		}
	}

	return undefined;
}


interface SimpleTextDocument {
	readonly languageId: string;

	getText(range?: vscode.Range): string;

	offsetAt(position: vscode.Position): number;

	positionAt(offset: number): vscode.Position;
}


async function openDocument(uri: vscode.Uri, documentCache?: Map<string, Promise<SimpleTextDocument | undefined>>): Promise<SimpleTextDocument | undefined> {
	const vsCodeDoc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
	if (vsCodeDoc) {
		return vsCodeDoc;
	}

	if (documentCache) {
		const key = uri.toString();
		const existing = documentCache.get(key);
		if (existing) {
			return existing;
		}

		const pending = doOpenDocument(uri);
		documentCache.set(key, pending);
		return pending;
	}

	return doOpenDocument(uri);
}

async function doOpenDocument(uri: vscode.Uri): Promise<SimpleTextDocument | undefined> {
	try {
		const contents = await vscode.workspace.fs.readFile(uri);
		const languageId = getLanguageForResource(uri).languageId;
		const doc = TextDocument.create(uri.toString(), languageId, 0, new TextDecoder().decode(contents));
		return new class implements SimpleTextDocument {
			readonly languageId = languageId;
			getText(range?: vscode.Range): string {
				return doc.getText(range);
			}
			offsetAt(position: vscode.Position): number {
				return doc.offsetAt(position);
			}
			positionAt(offset: number): vscode.Position {
				const pos = doc.positionAt(offset);
				return new vscode.Position(pos.line, pos.character);
			}
		};
	} catch {
		return undefined;
	}
}

async function getSymbolsInRange(parserService: IParserService, doc: SimpleTextDocument, range: vscode.Range, token: vscode.CancellationToken): Promise<TreeSitterExpressionInfo[]> {
	const wasmLanguage = getWasmLanguage(doc.languageId);
	if (!wasmLanguage) {
		return [];
	}

	const ast = parserService.getTreeSitterASTForWASMLanguage(wasmLanguage, doc.getText());
	if (!ast) {
		return [];
	}

	return ast.getSymbols({
		startIndex: doc.offsetAt(range.start),
		endIndex: doc.offsetAt(range.end),
	});
}

export class ReferencesSymbolResolver {
	/** Symbols which we have already tried to resolve */
	private readonly cache = new Map<string, Promise<vscode.Location[] | undefined>>();
	private readonly documentCache = new Map<string, Promise<SimpleTextDocument | undefined>>();

	constructor(
		private readonly findWordOptions: FindWordOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	async resolve(codeText: string, references: readonly PromptReference[], token: CancellationToken): Promise<vscode.Location[] | undefined> {
		if (!references.length) {
			return;
		}

		const existing = this.cache.get(codeText);
		if (existing) {
			return existing;
		} else {
			const p = this.doResolve(codeText, references, token);
			this.cache.set(codeText, p);
			return p;
		}
	}

	private async doResolve(codeText: string, references: readonly PromptReference[], token: CancellationToken): Promise<vscode.Location[] | undefined> {
		// Prefer exact match
		let wordMatches = await this.instantiationService.invokeFunction(accessor => findWordInReferences(accessor, references, codeText, this.findWordOptions, token, this.documentCache));
		if (token.isCancellationRequested) {
			return;
		}

		// But then try breaking up inline code into symbol parts
		if (!wordMatches.length) {
			// Extract all symbol parts from the code text
			// For example: `TextModel.undo()` -> ['TextModel', 'undo']
			const symbolParts = extractSymbolNamesInCode(codeText);

			if (symbolParts.length >= 2) {
				// For qualified names like `Class.method()`, search for both parts together
				// This helps disambiguate when there are multiple methods with the same name
				const firstPart = symbolParts[0];
				const lastPart = symbolParts[symbolParts.length - 1];

				// First, try to find the class
				const classMatches = await this.instantiationService.invokeFunction(accessor => findWordInReferences(accessor, references, firstPart, {
					symbolMatchesOnly: true,
					maxResultCount: this.findWordOptions.maxResultCount,
				}, token, this.documentCache));

				// If we found the class, we'll rely on the click-time resolution to find the method
				if (classMatches.length) {
					wordMatches = classMatches;
				} else {
					// If no class found, try just the method name as fallback
					wordMatches = await this.instantiationService.invokeFunction(accessor => findWordInReferences(accessor, references, lastPart, {
						symbolMatchesOnly: true,
						maxResultCount: this.findWordOptions.maxResultCount,
					}, token));
				}
			} else if (symbolParts.length > 0) {
				// For single names like `undo`, try to find the method directly
				const lastPart = symbolParts[symbolParts.length - 1];

				if (lastPart && lastPart !== codeText) {
					wordMatches = await this.instantiationService.invokeFunction(accessor => findWordInReferences(accessor, references, lastPart, {
						symbolMatchesOnly: true,
						maxResultCount: this.findWordOptions.maxResultCount,
					}, token, this.documentCache));
				}
			}
		}

		return wordMatches.slice(0, this.findWordOptions.maxResultCount);
	}
}
