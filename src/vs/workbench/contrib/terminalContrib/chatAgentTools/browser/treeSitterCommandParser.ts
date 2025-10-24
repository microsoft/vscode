/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { derived, waitForState } from '../../../../../base/common/observable.js';
import { ITreeSitterLibraryService } from '../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import type { Language, Parser, Query, QueryCapture } from '@vscode/tree-sitter-wasm';

export const enum TreeSitterCommandParserLanguage {
	Bash = 'bash',
	PowerShell = 'powershell',
}

export class TreeSitterCommandParser {
	private readonly _parser: Promise<Parser>;
	private readonly _queries: Map<Language, Query> = new Map();

	constructor(
		@ITreeSitterLibraryService private readonly _treeSitterLibraryService: ITreeSitterLibraryService
	) {
		this._parser = this._treeSitterLibraryService.getParserClass().then(ParserCtor => new ParserCtor());
	}

	async extractSubCommands(languageId: TreeSitterCommandParserLanguage, commandLine: string): Promise<string[]> {
		const disableSubCommandExtraction = true; // see https://github.com/microsoft/vscode/issues/273177

		if (disableSubCommandExtraction) {
			throw new Error('not supported');
		} else {
			const parser = await this._parser;
			const language = await waitForState(derived(reader => {
				return this._treeSitterLibraryService.getLanguage(languageId, true, reader);
			}));
			parser.setLanguage(language);

			const tree = parser.parse(commandLine);
			if (!tree) {
				throw new BugIndicatingError('Failed to parse tree');
			}

			const query = await this._getQuery(language);
			if (!query) {
				throw new BugIndicatingError('Failed to create tree sitter query');
			}

			const captures = query.captures(tree.rootNode);
			const subCommands = captures.map(e => e.node.text);

			return subCommands;
		}
	}

	async queryTree(languageId: TreeSitterCommandParserLanguage, commandLine: string, querySource: string): Promise<QueryCapture[]> {
		const parser = await this._parser;
		const language = await waitForState(derived(reader => {
			return this._treeSitterLibraryService.getLanguage(languageId, true, reader);
		}));
		parser.setLanguage(language);

		const tree = parser.parse(commandLine);
		if (!tree) {
			throw new BugIndicatingError('Failed to parse tree');
		}

		const query = await this._treeSitterLibraryService.createQuery(language, querySource);
		if (!query) {
			throw new BugIndicatingError('Failed to create tree sitter query');
		}

		const captures = query.captures(tree.rootNode);

		return captures;
	}

	private async _getQuery(language: Language): Promise<Query> {
		let query = this._queries.get(language);
		if (!query) {
			query = await this._treeSitterLibraryService.createQuery(language, '(command) @command');
			this._queries.set(language, query);
		}
		return query;
	}
}
