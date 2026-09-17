/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Parser = require('web-tree-sitter');
import { DisposablesLRUCache } from '../../../util/common/cache';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';
import { LanguageLoader } from './languageLoader';
import { WASMLanguage } from './treeSitterLanguages';

export class ParserWithCaching implements IDisposable {

	public static INSTANCE = new ParserWithCaching();

	static CACHE_SIZE_PER_LANGUAGE = 5;

	private readonly caches: Map<WASMLanguage, DisposablesLRUCache<CacheableParseTree>>;
	private readonly languageLoader: LanguageLoader;
	private _parser: Parser | null;

	constructor() {
		this.caches = new Map<WASMLanguage, DisposablesLRUCache<CacheableParseTree>>();
		this.languageLoader = new LanguageLoader();
		this._parser = null;
	}

	/** @remarks must not be called before `Parser.init()` */
	private get parser() {
		if (!this._parser) {
			this._parser = new Parser();
		}
		return this._parser;
	}

	/**
	 * @remarks Do not `delete()` the returned parse tree manually.
	 */
	async parse(lang: WASMLanguage, source: string): Promise<ParseTreeReference> {

		await Parser.init();

		const cache = this.getParseTreeCache(lang);

		let cacheEntry = cache.get(source);
		if (cacheEntry) {
			return cacheEntry.createReference();
		}

		const parserLang = await this.languageLoader.loadLanguage(lang);
		this.parser.setLanguage(parserLang);

		// check again the cache, maybe someone else has already parsed the source during the await
		cacheEntry = cache.get(source);
		if (cacheEntry) {
			return cacheEntry.createReference();
		}

		const parseTree = this.parser.parse(source);
		cacheEntry = new CacheableParseTree(parseTree);
		cache.put(source, cacheEntry);

		return cacheEntry.createReference();
	}

	dispose() {
		if (this._parser) {
			this.parser.delete();
			this._parser = null;
		}
		for (const cache of this.caches.values()) {
			cache.dispose();
		}
	}

	private getParseTreeCache(lang: WASMLanguage) {
		let cache = this.caches.get(lang);
		if (!cache) {
			cache = new DisposablesLRUCache<CacheableParseTree>(ParserWithCaching.CACHE_SIZE_PER_LANGUAGE);
			this.caches.set(lang, cache);
		}
		return cache;
	}
}

/**
 * A parse tree that can be cached (i.e. it can be referenced multiple
 * times and will be disppsed when it is evicted from cache and all
 * references to it are also disposed.
 */
class CacheableParseTree implements IDisposable {

	private readonly _tree: RefCountedParseTree;

	constructor(tree: Parser.Tree) {
		this._tree = new RefCountedParseTree(tree);
	}

	dispose(): void {
		this._tree.deref();
	}

	createReference(): ParseTreeReference {
		return new ParseTreeReference(this._tree);
	}
}

/**
 * A reference to a parse tree.
 * You must call `dispose()` when you're done with it.
 */
export class ParseTreeReference implements IDisposable {

	public get tree() {
		return this._parseTree.tree;
	}

	constructor(
		private readonly _parseTree: RefCountedParseTree
	) {
		this._parseTree.ref();
	}

	dispose(): void {
		this._parseTree.deref();
	}
}

/**
 * Will dispose the referenced parse tree when the ref count reaches 0.
 * The ref count is initialized to 1.
 */
class RefCountedParseTree {

	private _refCount = 1;

	public get tree(): Parser.Tree {
		if (this._refCount === 0) {
			throw new Error(`Cannot access disposed RefCountedParseTree`);
		}
		return this._tree;
	}

	constructor(
		private readonly _tree: Parser.Tree
	) { }

	ref(): void {
		if (this._refCount === 0) {
			throw new Error(`Cannot ref disposed RefCountedParseTree`);
		}
		this._refCount++;
	}

	deref(): void {
		if (this._refCount === 0) {
			throw new Error(`Cannot deref disposed RefCountedParseTree`);
		}
		this._refCount--;
		if (this._refCount === 0) {
			this._tree.delete();
		}
	}
}

export function _dispose() {
	ParserWithCaching.INSTANCE.dispose();
}

/**
 * Parses the given source code and returns the root node of the resulting syntax tree.
 */
export function _parse(language: WASMLanguage, source: string): Promise<ParseTreeReference> {
	return ParserWithCaching.INSTANCE.parse(language, source);
}
