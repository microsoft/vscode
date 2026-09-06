/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { LineCheck } from '../../vscode-node/naturalLanguageHint';

suite('LineCheck.isMostlyNaturalLanguage', () => {

	async function createMockDocument(lines: string[], languageId: string = 'typescript'): Promise<vscode.TextDocument> {
		return await vscode.workspace.openTextDocument({ language: languageId, content: lines.join('\n') });
	}

	test('should return false for lines with too little content', async () => {
		const document = await createMockDocument(['']);
		const position = new vscode.Position(0, 0);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});

	test('should return true for lines with mostly natural language including interface', async () => {
		const document = await createMockDocument(['interface Car with make, age and mileage']);
		const position = new vscode.Position(0, 39);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, true);
	});

	test('should return false for lines with function declaration', async () => {
		const document = await createMockDocument(['function foo(a:number, b:string) {', ' console.log the args here}']);
		const position = new vscode.Position(1, 25);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, true);
	});
	test('should return false for lines with too many keywords', async () => {
		const document = await createMockDocument(['const let var function']);
		const position = new vscode.Position(0, 21);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});

	test('should return false for lines with too much punctuation', async () => {
		const document = await createMockDocument(['word1, word2; word3.']);
		const position = new vscode.Position(0, 19);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});

	test('should return true for lines with mostly natural language', async () => {
		const document = await createMockDocument(['This is a test sentence with words.']);
		const position = new vscode.Position(0, 34);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, true);
	});

	test('should return false for lines with less than 4 tokens', async () => {
		const document = await createMockDocument(['word1 word2']);
		const position = new vscode.Position(0, 10);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});

	test('should return false for lines with less than 2 spaces', async () => {
		const document = await createMockDocument(['word1,word2,word3']);
		const position = new vscode.Position(0, 16);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});

	test('should return false for lines with class declaration', async () => {
		const document = await createMockDocument(['class AbstractPaneCompositeBar extends Disposable']);
		const position = new vscode.Position(0, 49);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});

	test('Example of inline <tab> heuristic being too eager #8151', async () => {
		const document = await createMockDocument(['	const usedCacheEntries = await coll']);
		const position = new vscode.Position(0, 36);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});

	test('Eager inline chat hints #8240m, part 1', async () => {
		const document = await createMockDocument(['return new SD']);
		const position = new vscode.Position(0, 13);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});

	test('Eager inline chat hints #8240, part 2', async () => {
		const document = await createMockDocument([
			'export class SummarizedDocumentInput {',
			'',
			'	static async create(): SummarizedDocumentInput',
			'		',
			'	}',
			'}'
		]);
		const position = new vscode.Position(2, 47);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});


	test('Eager inline chat hints #8240m, part 3', async () => {
		const document = await createMockDocument(['(token as Token).']);
		const position = new vscode.Position(0, 17);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});

	test('Inline hint trigger and keyword prefixes #10198', async () => {
		const document = await createMockDocument(['class FooBarBazzFactory implemen']);
		const position = new vscode.Position(0, 32);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});

	test('Haskell', async () => {
		const document = await createMockDocument(['reverse xs'], 'haskell');
		const position = new vscode.Position(0, 10);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});

	test('Haskell (trailing space)', async () => {
		const document = await createMockDocument(['reverse xs '], 'haskell');
		const position = new vscode.Position(0, 11);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});

	test('Haskell 2', async () => {
		const document = await createMockDocument(['sumfn a b'], 'haskell');
		const position = new vscode.Position(0, 10);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});

	test('https://github.com/microsoft/vscode-copilot/issues/11370', async () => {
		const document = await createMockDocument([
			'<h2 class="subtitle"›',
			'Thanks for visiting our fun and colorful project! We hope you enjoyed your stay.',
			'i am a new line',
			'</h2>'], 'html');
		const position = new vscode.Position(2, 15);
		const result = LineCheck.isNaturalLanguageDominated(document, position);
		assert.strictEqual(result, false);
	});
});
