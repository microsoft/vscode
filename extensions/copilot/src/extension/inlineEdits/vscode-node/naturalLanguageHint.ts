/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';


export namespace LineCheck {

	const _keywordsByLanguage = new Map<string, Set<string>>();
	_keywordsByLanguage.set('typescript', new Set(['abstract', 'any', 'as', 'asserts', 'async', 'await', 'bigint', 'boolean', 'break', 'case', 'catch', 'class', 'const', 'continue', 'constructor', 'debugger', 'declare', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get', 'if', 'implements', 'import', 'in', 'infer', 'instanceof', 'interface', 'is', 'keyof', 'let', 'module', 'namespace', 'never', 'new', 'null', 'number', 'object', 'of', 'package', 'private', 'protected', 'public', 'readonly', 'require', 'return', 'set', 'static', 'string', 'super', 'switch', 'symbol', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'unique', 'unknown', 'var', 'void', 'while', 'with', 'yield']));
	_keywordsByLanguage.set('typescriptreact', new Set(['abstract', 'any', 'as', 'asserts', 'async', 'await', 'bigint', 'boolean', 'break', 'case', 'catch', 'class', 'const', 'continue', 'constructor', 'debugger', 'declare', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get', 'if', 'implements', 'import', 'in', 'infer', 'instanceof', 'interface', 'is', 'keyof', 'let', 'module', 'namespace', 'never', 'new', 'null', 'number', 'object', 'of', 'package', 'private', 'protected', 'public', 'readonly', 'require', 'return', 'set', 'static', 'string', 'super', 'switch', 'symbol', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'unique', 'unknown', 'var', 'void', 'while', 'with', 'yield']));
	_keywordsByLanguage.set('javascript', new Set(['async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'constructor', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get', 'if', 'import', 'in', 'instanceof', 'interface', 'is', 'let', 'new', 'null', 'require', 'return', 'set', 'static', 'string', 'super', 'switch', 'symbol', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield']));
	_keywordsByLanguage.set('javascriptreact', new Set(['async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'constructor', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get', 'if', 'import', 'in', 'instanceof', 'interface', 'is', 'let', 'new', 'null', 'require', 'return', 'set', 'static', 'string', 'super', 'switch', 'symbol', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield']));
	_keywordsByLanguage.set('python', new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']));
	_keywordsByLanguage.set('java', new Set(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while']));
	_keywordsByLanguage.set('go', new Set(['break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var']));
	_keywordsByLanguage.set('csharp', new Set(['abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private', 'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using', 'virtual', 'void', 'volatile', 'while']));
	_keywordsByLanguage.set('cpp', new Set(['alignas', 'alignof', 'and', 'and_eq', 'asm', 'atomic_cancel', 'atomic_commit', 'atomic_noexcept', 'auto', 'bitand', 'bitor', 'bool', 'break', 'case', 'catch', 'char', 'char8_t', 'char16_t', 'char32_t', 'class', 'compl', 'concept', 'const', 'consteval', 'constexpr', 'constinit', 'const_cast', 'continue', 'co_await', 'co_return', 'co_yield', 'decltype', 'default', 'delete', 'do', 'double', 'dynamic_cast', 'else', 'enum', 'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'goto', 'if', 'import', 'inline', 'int', 'long', 'module', 'mutable', 'namespace', 'new', 'noexcept', 'not', 'not_eq', 'nullptr', 'operator', 'or', 'or_eq', 'private', 'protected', 'public', 'reflexpr', 'register', 'reinterpret_cast', 'requires', 'return', 'short', 'signed', 'sizeof', 'static', 'static_assert', 'static_cast', 'struct', 'switch', 'synchronized', 'template', 'this', 'thread_local', 'throw', 'true', 'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile', 'wchar_t', 'while', 'xor', 'xor_eq']));
	_keywordsByLanguage.set('rust', new Set(['as', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while', 'async', 'await', 'dyn']));
	_keywordsByLanguage.set('ruby', new Set(['BEGIN', 'END', 'alias', 'and', 'begin', 'break', 'case', 'class', 'def', 'defined?', 'do', 'else', 'elsif', 'end', 'ensure', 'false', 'for', 'if', 'in', 'module', 'next', 'nil', 'not', 'or', 'redo', 'rescue', 'retry', 'return', 'self', 'super', 'then', 'true', 'undef', 'unless', 'until', 'when', 'while', 'yield']));

	// typical keywords of various programming languages
	_keywordsByLanguage.set('*', new Set(['abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get', 'if', 'import', 'in', 'instanceof', 'interface', 'is', 'let', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'var', 'void', 'while', 'with', 'yield']));

	export const languages = Array.from(_keywordsByLanguage.keys());

	interface IToken {
		type: 'word' | 'keyword' | 'keyword_start' | 'space' | 'other';
		value: string;
	}

	function _classifyLine(document: vscode.TextDocument, position: vscode.Position): IToken[] {

		const keywords = _keywordsByLanguage.get(document.languageId);

		const result: IToken[] = [];
		const line = document.lineAt(position);

		let column = line.firstNonWhitespaceCharacterIndex;
		let lastEnd = column;

		while (column < line.range.end.character) {
			const pos = new vscode.Position(position.line, column);
			const wordRange = document.getWordRangeAtPosition(pos);

			if (!wordRange) {
				column += 1;
				continue;
			}

			const start = wordRange.start.character;
			const end = wordRange.end.character;

			if (start !== lastEnd) {
				const value = line.text.substring(lastEnd, start);
				result.push({
					type: value.match(/^\s+$/) ? 'space' : 'other',
					value
				});
			}

			const value = line.text.substring(start, end);
			result.push({
				type: keywords?.has(value) ? 'keyword' : 'word',
				value
			});

			column = end + 1;
			lastEnd = end;
		}
		if (lastEnd < line.range.end.character) {
			const value = line.text.substring(lastEnd);
			result.push({
				type: value.match(/^\s+$/) ? 'space' : 'other',
				value
			});

		}

		const last = result.at(-1);
		if (last?.type === 'word') {
			// check if this is a keyword prefix
			for (const keyword of keywords ?? []) {
				if (keyword.startsWith(last.value)) {
					last.type = 'keyword_start';
					break;
				}
			}
		}

		return result;
	}

	export function isNaturalLanguageDominated(document: vscode.TextDocument, position: vscode.Position): boolean {

		// LOGIC: tokenize the line into words (as defined by the language), whitespace, and other
		// characters (which can be a mix of whitespace and non-word characters).

		const tokens = _classifyLine(document, position);

		let wordCount = 0;
		let keywordCount = 0;
		let keywordStartCount = 0;
		let spaceCount = 0;
		let otherCount = 0;

		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			switch (token.type) {
				case 'keyword':
					keywordCount += 1;
					break;
				case 'keyword_start':
					keywordStartCount += 1;
					break;
				case 'word':
					wordCount += 1;
					break;
				case 'space':
					spaceCount += 1;
					break;
				case 'other':
					otherCount += 1;
					break;
			}
		}

		if (tokens.length < 4 || spaceCount < 2) {
			// too little content
			return false;
		}

		if (keywordCount === 0 && otherCount === 0) {
			return false;
		}

		if ((keywordCount + keywordStartCount) >= wordCount) {
			return false; // too many keywords
		}

		if (otherCount >= spaceCount) {
			return false; // too much punctuation
		}

		return true;
	}
}
