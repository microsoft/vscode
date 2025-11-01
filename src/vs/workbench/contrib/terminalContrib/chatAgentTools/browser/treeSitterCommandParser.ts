/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Parser, Query, QueryCapture, Tree } from '@vscode/tree-sitter-wasm';
import { BugIndicatingError, ErrorNoTelemetry } from '../../../../../base/common/errors.js';
import { arch } from '../../../../../base/common/process.js';
import { ITreeSitterLibraryService } from '../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { Lazy } from '../../../../../base/common/lazy.js';

export const enum TreeSitterCommandParserLanguage {
	Bash = 'bash',
	PowerShell = 'powershell',
}

export class TreeSitterCommandParser {
	private readonly _parser: Lazy<Promise<Parser>>;

	constructor(
		@ITreeSitterLibraryService private readonly _treeSitterLibraryService: ITreeSitterLibraryService,
	) {
		this._parser = new Lazy(() => this._treeSitterLibraryService.getParserClass().then(ParserCtor => new ParserCtor()));
	}

	async extractSubCommands(languageId: TreeSitterCommandParserLanguage, commandLine: string): Promise<string[]> {
		const captures = await this._queryTree(languageId, commandLine, '(command) @command');
		return captures.map(e => e.node.text);
	}

	async extractPwshDoubleAmpersandChainOperators(commandLine: string): Promise<QueryCapture[]> {
		const captures = await this._queryTree(TreeSitterCommandParserLanguage.PowerShell, commandLine, [
			'(',
			'  (command',
			'    (command_elements',
			'      (generic_token) @double.ampersand',
			'        (#eq? @double.ampersand "&&")))',
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
		this._throwIfCanCrash(languageId);

		const parser = await this._parser.value;
		const language = await this._treeSitterLibraryService.getLanguagePromise(languageId);
		if (!language) {
			throw new BugIndicatingError('Failed to fetch language grammar');
		}

		parser.setLanguage(language);

		const tree = parser.parse(commandLine);
		if (!tree) {
			throw new ErrorNoTelemetry('Failed to parse tree');
		}

		const query = await this._treeSitterLibraryService.createQuery(language, querySource);
		if (!query) {
			throw new BugIndicatingError('Failed to create tree sitter query');
		}

		return { tree, query };
	}

	private _throwIfCanCrash(languageId: TreeSitterCommandParserLanguage) {
		// TODO: The powershell grammar can cause an OOM crash on arm https://github.com/microsoft/vscode/issues/273177
		if (
			(arch === 'arm' || arch === 'arm64') &&
			languageId === TreeSitterCommandParserLanguage.PowerShell
		) {
			throw new ErrorNoTelemetry('powershell grammar is not supported on arm or arm64');
		}
	}
}
