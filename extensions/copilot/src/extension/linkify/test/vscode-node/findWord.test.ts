/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { findSymbolLocationInFile, SymbolFileCache } from '../../vscode-node/findWord';
import { asParserService, createTestFile, declaration, symbol, TestParserService } from './util';

suite('Find symbol location in file', () => {

	test('Should return the exact symbol location', async () => {
		const contents = [
			'const value = 1;',
			'',
			'class Foo {',
			'}',
		].join('\n');
		const { uri } = await createTestFile('src/file.ts', contents);

		const location = await findSymbolLocationInFile(
			asParserService(new TestParserService([symbol(contents, 'Foo')])),
			uri,
			'Foo',
			CancellationToken.None,
		);

		assert(location);
		assert.strictEqual(location.uri.toString(), uri.toString());
		assert.strictEqual(location.range.start.line, 2);
		assert.strictEqual(location.range.start.character, 6);
	});

	test('Should prefer declaration matches over earlier generic symbol references', async () => {
		const declarationText = 'class Foo(Base):';
		const contents = [
			'if isinstance(module, Foo):',
			'',
			declarationText,
			'\tpass',
		].join('\n');
		const { uri } = await createTestFile('src/file.py', contents);

		const parserService = new TestParserService(
			[symbol(contents, 'Foo')],
			[declaration(contents, 'Foo', declarationText)],
		);
		const location = await findSymbolLocationInFile(
			asParserService(parserService),
			uri,
			'Foo',
			CancellationToken.None,
		);

		assert(location);
		assert.strictEqual(location.range.start.line, 2);
		assert.strictEqual(location.range.start.character, 0);
		assert.strictEqual(parserService.genericSymbolQueryCount, 0);
	});

	test('Should prefer declaration fallback over generic symbol references for qualified names', async () => {
		const declarationText = 'class Foo:';
		const contents = [
			'if value.bar:',
			'\tpass',
			'',
			declarationText,
			'\tpass',
		].join('\n');
		const { uri } = await createTestFile('src/file.py', contents);

		const parserService = new TestParserService(
			[symbol(contents, 'bar')],
			[declaration(contents, 'Foo', declarationText)],
		);
		const location = await findSymbolLocationInFile(
			asParserService(parserService),
			uri,
			'Foo.bar',
			CancellationToken.None,
		);

		assert(location);
		assert.strictEqual(location.range.start.line, 3);
		assert.strictEqual(location.range.start.character, 0);
		assert.strictEqual(parserService.genericSymbolQueryCount, 0);
	});

	test('Should use the highest-index qualified name part when there is no exact match', async () => {
		const contents = [
			'class Foo {',
			'\tmethod() {',
			'\t}',
			'}',
		].join('\n');
		const { uri } = await createTestFile('src/file.ts', contents);

		const location = await findSymbolLocationInFile(
			asParserService(new TestParserService([
				symbol(contents, 'Foo'),
				symbol(contents, 'method'),
			])),
			uri,
			'Foo.method',
			CancellationToken.None,
		);

		assert(location);
		assert.strictEqual(location.range.start.line, 1);
		assert.strictEqual(location.range.start.character, 1);
	});

	test('Should return undefined for unsupported, missing, or unmatched files', async () => {
		const contents = 'class Foo {}';
		const { workspace, uri: tsUri } = await createTestFile('src/file.ts', contents);
		const txtUri = URI.joinPath(workspace, 'src/file.txt');

		const parserService = asParserService(new TestParserService([symbol(contents, 'Foo')]));

		assert.strictEqual(await findSymbolLocationInFile(parserService, txtUri, 'Foo', CancellationToken.None), undefined);
		assert.strictEqual(await findSymbolLocationInFile(parserService, URI.file('/workspace/src/missing.ts'), 'Foo', CancellationToken.None), undefined);
		assert.strictEqual(await findSymbolLocationInFile(parserService, tsUri, 'Missing', CancellationToken.None), undefined);
	});

	test('Should reuse cached file symbols for repeated URI lookups', async () => {
		const contents = [
			'class Foo {',
			'\tmethod() {',
			'\t}',
			'}',
		].join('\n');
		const { uri } = await createTestFile('src/file.ts', contents);

		const parserService = new TestParserService([
			symbol(contents, 'Foo'),
			symbol(contents, 'method'),
		]);
		const cache: SymbolFileCache = new Map();

		const classLocation = await findSymbolLocationInFile(asParserService(parserService), uri, 'Foo', CancellationToken.None, cache);
		const methodLocation = await findSymbolLocationInFile(asParserService(parserService), uri, 'Foo.method', CancellationToken.None, cache);

		assert(classLocation);
		assert(methodLocation);
		assert.strictEqual(parserService.parseCount, 1);
		assert.strictEqual(parserService.genericSymbolQueryCount, 1);
		assert.deepStrictEqual(parserService.genericSymbolRanges, [{ startIndex: 0, endIndex: contents.length }]);
	});
});
