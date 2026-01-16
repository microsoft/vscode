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

	/**
	 * Extracts file targets from `sed` commands that use in-place editing (`-i`, `-I`, or `--in-place`).
	 * Returns an array of file paths that would be modified.
	 */
	async getSedInPlaceFiles(languageId: TreeSitterCommandParserLanguage, commandLine: string): Promise<string[]> {
		// This is only relevant for bash-like shells
		if (languageId !== TreeSitterCommandParserLanguage.Bash) {
			return [];
		}

		// Query for all commands
		const query = '(command) @command';
		const captures = await this._queryTree(languageId, commandLine, query);

		const result: string[] = [];
		for (const capture of captures) {
			const commandText = capture.node.text;
			const sedFiles = this._parseSedInPlaceFiles(commandText);
			result.push(...sedFiles);
		}
		return result;
	}

	/**
	 * Parses a sed command to extract files being edited in-place.
	 * Handles:
	 * - `sed -i 's/foo/bar/' file.txt` (GNU)
	 * - `sed -i.bak 's/foo/bar/' file.txt` (GNU with backup suffix)
	 * - `sed -i '' 's/foo/bar/' file.txt` (macOS/BSD with empty backup suffix)
	 * - `sed --in-place 's/foo/bar/' file.txt` (GNU long form)
	 * - `sed --in-place=.bak 's/foo/bar/' file.txt` (GNU long form with backup)
	 * - `sed -I 's/foo/bar/' file.txt` (BSD case-insensitive variant)
	 */
	private _parseSedInPlaceFiles(commandText: string): string[] {
		// Check if this is a sed command with in-place flag
		const sedMatch = commandText.match(/^sed\s+/);
		if (!sedMatch) {
			return [];
		}

		// Check for -i, -I, or --in-place flag
		const inPlaceRegex = /(?:^|\s)(-[a-zA-Z]*[iI][a-zA-Z]*\S*|--in-place(?:=\S*)?|(-i|-I)\s*'[^']*'|(-i|-I)\s*"[^"]*")(?:\s|$)/;
		if (!inPlaceRegex.test(commandText)) {
			return [];
		}

		// Parse the command to extract file arguments
		// We need to skip: the 'sed' command, flags, and sed scripts/expressions
		const tokens = this._tokenizeSedCommand(commandText);
		return this._extractSedFileTargets(tokens);
	}

	/**
	 * Tokenizes a sed command into individual arguments, handling quotes and escapes.
	 */
	private _tokenizeSedCommand(commandText: string): string[] {
		const tokens: string[] = [];
		let current = '';
		let inSingleQuote = false;
		let inDoubleQuote = false;
		let escaped = false;

		for (let i = 0; i < commandText.length; i++) {
			const char = commandText[i];

			if (escaped) {
				current += char;
				escaped = false;
				continue;
			}

			if (char === '\\' && !inSingleQuote) {
				escaped = true;
				current += char;
				continue;
			}

			if (char === '\'' && !inDoubleQuote) {
				inSingleQuote = !inSingleQuote;
				current += char;
				continue;
			}

			if (char === '"' && !inSingleQuote) {
				inDoubleQuote = !inDoubleQuote;
				current += char;
				continue;
			}

			if (/\s/.test(char) && !inSingleQuote && !inDoubleQuote) {
				if (current) {
					tokens.push(current);
					current = '';
				}
				continue;
			}

			current += char;
		}

		if (current) {
			tokens.push(current);
		}

		return tokens;
	}

	/**
	 * Extracts file targets from tokenized sed command arguments.
	 * Files are generally the last non-option, non-script arguments.
	 */
	private _extractSedFileTargets(tokens: string[]): string[] {
		if (tokens.length === 0 || tokens[0] !== 'sed') {
			return [];
		}

		const files: string[] = [];
		let i = 1; // Skip 'sed'
		let foundScript = false;

		while (i < tokens.length) {
			const token = tokens[i];

			// Long options
			if (token.startsWith('--')) {
				if (token === '--in-place' || token.startsWith('--in-place=')) {
					// In-place flag (already verified we have one)
					i++;
					continue;
				}
				if (token === '--expression' || token === '--file') {
					// Skip the option and its argument
					i += 2;
					foundScript = true;
					continue;
				}
				if (token.startsWith('--expression=') || token.startsWith('--file=')) {
					i++;
					foundScript = true;
					continue;
				}
				// Other long options like --sandbox, --debug, etc.
				i++;
				continue;
			}

			// Short options
			if (token.startsWith('-') && token.length > 1 && token[1] !== '-') {
				// Could be combined flags like -ni or -i.bak
				const flags = token.slice(1);

				// Check if this is -i with backup suffix attached (e.g., -i.bak)
				const iIndex = flags.indexOf('i');
				const IIndex = flags.indexOf('I');
				const inPlaceIndex = iIndex >= 0 ? iIndex : IIndex;

				if (inPlaceIndex >= 0 && inPlaceIndex < flags.length - 1) {
					// -i.bak style - backup suffix is attached
					i++;
					continue;
				}

				// Check if -i or -I is the last flag and next token could be backup suffix
				if ((flags.endsWith('i') || flags.endsWith('I')) && i + 1 < tokens.length) {
					const nextToken = tokens[i + 1];
					// macOS/BSD style: -i '' or -i "" (empty string backup suffix)
					if (nextToken === '\'\'' || nextToken === '""' || (nextToken.startsWith('\'') && nextToken.endsWith('\'')) || (nextToken.startsWith('"') && nextToken.endsWith('"'))) {
						i += 2;
						continue;
					}
				}

				// Check for -e or -f which take arguments
				if (flags.includes('e') || flags.includes('f')) {
					const eIndex = flags.indexOf('e');
					const fIndex = flags.indexOf('f');
					const optIndex = eIndex >= 0 ? eIndex : fIndex;

					// If -e or -f is not the last character, the rest of the token is the argument
					if (optIndex < flags.length - 1) {
						foundScript = true;
						i++;
						continue;
					}

					// Otherwise, the next token is the argument
					foundScript = true;
					i += 2;
					continue;
				}

				i++;
				continue;
			}

			// Non-option argument
			if (!foundScript) {
				// First non-option is the script (unless -e/-f was used)
				foundScript = true;
				i++;
				continue;
			}

			// Subsequent non-option arguments are files
			// Strip surrounding quotes from file path
			let file = token;
			if ((file.startsWith('\'') && file.endsWith('\'')) || (file.startsWith('"') && file.endsWith('"'))) {
				file = file.slice(1, -1);
			}
			files.push(file);
			i++;
		}

		return files;
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
