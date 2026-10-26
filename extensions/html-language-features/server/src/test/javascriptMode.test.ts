/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { ClientCapabilities, Diagnostic, getLanguageModes, TextDocument } from '../modes/languageModes.js';
import { getNodeFileFS } from '../node/nodeFs.js';

const testUri = 'test://test/test.html';

async function getJavaScriptDiagnostics(value: string): Promise<Diagnostic[]> {
	const workspace = {
		settings: {},
		folders: [{ name: 'x', uri: testUri.substr(0, testUri.lastIndexOf('/')) }]
	};
	const document = TextDocument.create(testUri, 'html', 0, value);
	const languageModes = getLanguageModes({ css: true, javascript: true }, workspace, ClientCapabilities.LATEST, getNodeFileFS());

	try {
		return await languageModes.getMode('javascript')!.doValidation!(document);
	} finally {
		languageModes.dispose();
	}
}

suite('HTML JavaScript Validation', () => {
	test('isolates classic and module script declarations', async () => {
		const diagnostics = await getJavaScriptDiagnostics('<script>let value = 1;</script><script type="module">let value = 2;</script>');
		assert.deepStrictEqual(diagnostics, []);
	});

	test('isolates module var declarations from classic scripts', async () => {
		const diagnostics = await getJavaScriptDiagnostics('<script>let value = 1;</script><script type="module">var value = 2;</script>');
		assert.deepStrictEqual(diagnostics, []);
	});

	test('isolates declarations in separate module scripts', async () => {
		const diagnostics = await getJavaScriptDiagnostics('<script type="module">var value = 1;</script><script type="module">let value = 2;</script>');
		assert.deepStrictEqual(diagnostics, []);
	});

	test('reports redeclarations in classic scripts', async () => {
		const diagnostics = await getJavaScriptDiagnostics('<script>let value = 1;</script><script>let value = 2;</script>');
		assert.deepStrictEqual(diagnostics.map(diagnostic => diagnostic.message), [
			'Cannot redeclare block-scoped variable \'value\'.',
			'Cannot redeclare block-scoped variable \'value\'.'
		]);
	});

	test('accepts module syntax and top-level await', async () => {
		const diagnostics = await getJavaScriptDiagnostics('<script type="module">import.meta.url; export const value = await Promise.resolve(1);</script>');
		assert.deepStrictEqual(diagnostics, []);
	});

	test('maps module diagnostics to the HTML document', async () => {
		const diagnostics = await getJavaScriptDiagnostics('<script type="module">\nlet value;\nlet value;\n</script>');
		assert.deepStrictEqual(diagnostics.map(diagnostic => ({ range: diagnostic.range, message: diagnostic.message })), [{
			range: { start: { line: 1, character: 4 }, end: { line: 1, character: 9 } },
			message: 'Cannot redeclare block-scoped variable \'value\'.'
		}, {
			range: { start: { line: 2, character: 4 }, end: { line: 2, character: 9 } },
			message: 'Cannot redeclare block-scoped variable \'value\'.'
		}]);
	});
});
