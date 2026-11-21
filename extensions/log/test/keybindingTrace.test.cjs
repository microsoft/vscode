/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { before, after, test } = require('node:test');
const { Registry, parseRawGrammar, INITIAL } = require('vscode-textmate');
const { loadWASM, OnigScanner, OnigString } = require('vscode-oniguruma');

let registry;
let grammar;
before(async () => {
	await loadWASM(await fs.readFile(require.resolve('vscode-oniguruma/release/onig.wasm')));
	const manifest = JSON.parse(await fs.readFile(path.join(__dirname, '../package.json'), 'utf8'));
	const contributions = manifest.contributes.grammars;
	registry = new Registry({
		onigLib: Promise.resolve({ createOnigScanner: patterns => new OnigScanner(patterns), createOnigString: text => new OnigString(text) }),
		loadGrammar: async scope => {
			const contribution = contributions.find(entry => entry.scopeName === scope);
			if (!contribution) {
				return null;
			}
			const filename = path.join(__dirname, '..', contribution.path);
			return parseRawGrammar(await fs.readFile(filename, 'utf8'), filename);
		},
		getInjections: scope => contributions.filter(entry => entry.injectTo?.includes(scope)).map(entry => entry.scopeName)
	});
	grammar = await registry.loadGrammar('text.log');
});
after(() => registry?.dispose());

test('colors true, false, and error results in a shortcut trace', () => {
	const line = '2026-01-01 12:00:00.000 [info] [Window] [KeybindingService]: | Candidate command, source: user, when: [true: definition] && [false: focus] || [true: !busy] && [error: items > 0]';
	const tokens = grammar.tokenizeLine(line, INITIAL).tokens;
	assert.deepStrictEqual(tokens.filter(token => token.scopes.some(scope => scope.endsWith('.keybinding.when'))).map(token => ({
		text: line.slice(token.startIndex, token.endIndex),
		scope: token.scopes.at(-1)
	})), [
		{ text: '[true: definition]', scope: 'markup.inserted.keybinding.when' },
		{ text: '[false: focus]', scope: 'markup.deleted.keybinding.when' },
		{ text: '[true: !busy]', scope: 'markup.inserted.keybinding.when' },
		{ text: '[error: items > 0]', scope: 'markup.deleted.keybinding.when' }
	]);
});

test('keeps escaped delimiters and quoted comparisons inside their condition', () => {
	const line = String.raw`[KeybindingService]: | Candidate command, source: user, when: [true: value == 'a\]\\b\nc'] && [false: name =~ /[a-z\]/]`;
	const tokens = grammar.tokenizeLine(line, INITIAL).tokens;
	assert.deepStrictEqual(tokens.filter(token => token.scopes.some(scope => scope.endsWith('.keybinding.when'))).map(token => line.slice(token.startIndex, token.endIndex)), [
		String.raw`[true: value == 'a\]\\b\nc']`,
		String.raw`[false: name =~ /[a-z\]/]`
	]);
});

test('does not color unrelated logs or continue onto the next line', () => {
	const first = grammar.tokenizeLine('[KeybindingService]: | Candidate command, source: user, when: [true: enabled]', INITIAL);
	const next = grammar.tokenizeLine('[OtherService]: [true: enabled] && [false: focus]', first.ruleStack);
	assert.deepStrictEqual(next.tokens.flatMap(token => token.scopes.filter(scope => scope.endsWith('.keybinding.when'))), []);
});
