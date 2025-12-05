/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Parser, Query, QueryCapture, Tree } from '@vscode/tree-sitter-wasm';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { BugIndicatingError, ErrorNoTelemetry } from '../../../../../base/common/errors.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ITreeSitterLibraryService } from '../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';

export const enum TreeSitterCommandParserLanguage {
	Bash = 'bash',
	PowerShell = 'powershell',
}

export class TreeSitterCommandParser extends Disposable {
	private readonly _parser: Lazy<Promise<Parser>>;
	private readonly _treeCache = this._register(new TreeCache());

	constructor(
		@ITreeSitterLibraryService private readonly _treeSitterLibraryService: ITreeSitterLibraryService,
	) {
		super();
		this._parser = new Lazy(() => this._treeSitterLibraryService.getParserClass().then(ParserCtor => new ParserCtor()));
	}

	async extractSubCommands(languageId: TreeSitterCommandParserLanguage, commandLine: string): Promise<string[]> {
		const captures = await this._queryTree(languageId, commandLine, '(command) @command');
		return captures.map(e => e.node.text);
	}

	async extractPwshDoubleAmpersandChainOperators(commandLine: string): Promise<QueryCapture[]> {
		const captures = await this._queryTree(TreeSitterCommandParserLanguage.PowerShell, commandLine, [
			'(',
			'  (pipeline',
			'    (pipeline_chain_tail) @double.ampersand)',
			')',
		].join('\n'));
		return captures;
	}

	async getFileWrites(languageId: TreeSitterCommandParserLanguage, commandLine: string): Promise<string[]> {
		let query: string;
		switch (languageId) {
			case TreeSitterCommandParserLanguage.Bash:
				query = [
					'(file_redirect',
					'  destination: [(word) (string (string_content)) (raw_string) (concatenation)] @file)',
				].join('\n');
				break;
			case TreeSitterCommandParserLanguage.PowerShell:
				query = [
					'(redirection',
					'  (redirected_file_name) @file)',
				].join('\n');
				break;
		}
		const captures = await this._queryTree(languageId, commandLine, query);
		return captures.map(e => e.node.text.trim());
	}

	private async _queryTree(languageId: TreeSitterCommandParserLanguage, commandLine: string, querySource: string): Promise<QueryCapture[]> {
		const { tree, query } = await this._doQuery(languageId, commandLine, querySource);
		return query.captures(tree.rootNode);
	}

	private async _doQuery(languageId: TreeSitterCommandParserLanguage, commandLine: string, querySource: string): Promise<{ tree: Tree; query: Query }> {
		const language = await this._treeSitterLibraryService.getLanguagePromise(languageId);
		if (!language) {
			throw new BugIndicatingError('Failed to fetch language grammar');
		}

		let tree = this._treeCache.get(languageId, commandLine);
		if (!tree) {
			const parser = await this._parser.value;
			parser.setLanguage(language);
			const parsedTree = parser.parse(commandLine);
			if (!parsedTree) {
				throw new ErrorNoTelemetry('Failed to parse tree');
			}

			tree = parsedTree;
			this._treeCache.set(languageId, commandLine, tree);
		}

		const query = await this._treeSitterLibraryService.createQuery(language, querySource);
		if (!query) {
			throw new BugIndicatingError('Failed to create tree sitter query');
		}

		return { tree, query };
	}
}

/**
 * Caches trees temporarily to avoid reparsing the same command line multiple
 * times in quick succession.
 */
class TreeCache extends Disposable {
	private readonly _cache = new Map<string, Tree>();
	private readonly _clearScheduler = this._register(new MutableDisposable<RunOnceScheduler>());

	constructor() {
		super();
		this._register(toDisposable(() => this._cache.clear()));
	}

	get(languageId: TreeSitterCommandParserLanguage, commandLine: string): Tree | undefined {
		this._resetClearTimer();
		return this._cache.get(this._getCacheKey(languageId, commandLine));
	}

	set(languageId: TreeSitterCommandParserLanguage, commandLine: string, tree: Tree): void {
		this._resetClearTimer();
		this._cache.set(this._getCacheKey(languageId, commandLine), tree);
	}

	private _getCacheKey(languageId: TreeSitterCommandParserLanguage, commandLine: string): string {
		return `${languageId}:${commandLine}`;
	}

	private _resetClearTimer(): void {
		this._clearScheduler.value = new RunOnceScheduler(() => {
			this._cache.clear();
		}, 10000);
		this._clearScheduler.value.schedule();
	}
}
