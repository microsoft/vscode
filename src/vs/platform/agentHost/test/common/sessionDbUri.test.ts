/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeHex, VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildSessionDbUri, canonicalizeSessionDbUri, parseSessionDbUri } from '../../common/sessionDbUri.js';

const hex = (value: string) => encodeHex(VSBuffer.fromString(value)).toString();

function legacyUri(sessionUri: string, toolCallId: string, filePath: string, part: string, name: string): URI {
	return URI.from({
		scheme: 'session-db',
		authority: hex(sessionUri),
		path: `/${toolCallId}/${hex(filePath)}/${part}/${name}`,
	});
}

suite('buildSessionDbUri / parseSessionDbUri', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips a simple URI', () => {
		const uri = buildSessionDbUri('copilot:/abc-123', 'tc-1', '/workspace/file.ts', 'before');
		const parsed = parseSessionDbUri(uri);
		assert.ok(parsed);
		assert.deepStrictEqual(parsed, {
			sessionUri: 'copilot:/abc-123',
			toolCallId: 'tc-1',
			filePath: '/workspace/file.ts',
			part: 'before',
		});
	});

	test('round-trips with special characters in filePath', () => {
		const uri = buildSessionDbUri('copilot:/s1', 'tc-2', '/work space/file (1).ts', 'after');
		const parsed = parseSessionDbUri(uri);
		assert.ok(parsed);
		assert.strictEqual(parsed.filePath, '/work space/file (1).ts');
		assert.strictEqual(parsed.part, 'after');
	});

	test('round-trips with special characters in toolCallId', () => {
		const uri = buildSessionDbUri('copilot:/s1', 'call_abc=123&x', '/file.ts', 'before');
		const parsed = parseSessionDbUri(uri);
		assert.ok(parsed);
		assert.strictEqual(parsed.toolCallId, 'call_abc=123&x');
	});

	test('round-trips a backslashed Windows filePath, which the database lookup needs verbatim', () => {
		const filePath = 'C:\\Code\\vscode\\src\\vs\\file.ts';
		const parsed = parseSessionDbUri(buildSessionDbUri('copilot:/s1', 'tc-1', filePath, 'before'));
		assert.ok(parsed);
		assert.strictEqual(parsed.filePath, filePath);
	});

	test('parseSessionDbUri returns undefined for non-session-db URIs', () => {
		assert.strictEqual(parseSessionDbUri('file:///foo/bar'), undefined);
		assert.strictEqual(parseSessionDbUri('https://example.com'), undefined);
	});

	test('parseSessionDbUri returns undefined for malformed session-db URIs', () => {
		assert.strictEqual(parseSessionDbUri('session-db:copilot:/s1'), undefined);
		assert.strictEqual(parseSessionDbUri('session-db:copilot:/s1?toolCallId=tc-1'), undefined);
		assert.strictEqual(parseSessionDbUri('session-db:copilot:/s1?toolCallId=tc-1&filePath=/f&part=middle'), undefined);
	});

	test('parseSessionDbUri returns undefined for JSON queries that are not objects', () => {
		const queries = ['null', '123', '"a string"', 'true', '[]'];
		assert.deepStrictEqual(
			queries.map(query => parseSessionDbUri(`session-db:/f.ts?${encodeURIComponent(query)}`)),
			queries.map(() => undefined),
		);
	});

	test('parseSessionDbUri rejects empty lookup keys, which would hit the database', () => {
		const withField = (field: Partial<Record<'sessionUri' | 'toolCallId' | 'filePath', string>>) =>
			`session-db:/f.ts?${encodeURIComponent(JSON.stringify({ sessionUri: 's', toolCallId: 't', filePath: '/f.ts', part: 'before', ...field }))}`;

		assert.deepStrictEqual([
			parseSessionDbUri(withField({ sessionUri: '' })),
			parseSessionDbUri(withField({ toolCallId: '' })),
			parseSessionDbUri(withField({ filePath: '' })),
		], [undefined, undefined, undefined]);
	});

	test('URI path is the file path, so labels show a real path', () => {
		const uri = buildSessionDbUri('copilot:/s1', 'tc-1', '/workspace/src/index.ts', 'before');
		assert.strictEqual(URI.parse(uri).path, '/workspace/src/index.ts');
	});

	test('URI path is the file path for files with spaces and special chars', () => {
		const uri = buildSessionDbUri('copilot:/s1', 'tc-1', '/work space/file (1).ts', 'after');
		assert.strictEqual(URI.parse(uri).path, '/work space/file (1).ts');
	});

	test('parses the legacy hex-encoded layout', () => {
		const legacy = legacyUri('copilot:/abc-123', 'tc-1', '/workspace/file.ts', 'before', 'file.ts').toString();

		assert.deepStrictEqual(parseSessionDbUri(legacy), {
			sessionUri: 'copilot:/abc-123',
			toolCallId: 'tc-1',
			filePath: '/workspace/file.ts',
			part: 'before',
		});
	});
});

suite('canonicalizeSessionDbUri', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('rewrites a legacy URI into the current layout', () => {
		const legacy = legacyUri('copilot:/abc-123', 'call_1', '/workspace/file.ts', 'before', 'file.ts');
		const canonical = canonicalizeSessionDbUri(legacy, URI.file('/workspace/file.ts'));

		assert.deepStrictEqual(
			[canonical.path, parseSessionDbUri(canonical.toString())],
			['/workspace/file.ts', { sessionUri: 'copilot:/abc-123', toolCallId: 'call_1', filePath: '/workspace/file.ts', part: 'before' }],
		);
	});

	test('takes the path from the file URI, so a Windows session canonicalizes the same way on any client', () => {
		const legacy = legacyUri('copilot:/abc-123', 'call_1', 'C:\\Code\\repo\\file.ts', 'before', 'file.ts');
		const canonical = canonicalizeSessionDbUri(legacy, URI.parse('file:///c%3A/Code/repo/file.ts'));

		assert.deepStrictEqual(
			[canonical.path, parseSessionDbUri(canonical.toString())?.filePath],
			['/c:/Code/repo/file.ts', 'C:\\Code\\repo\\file.ts'],
		);
	});

	test('leaves canonical, unparseable and foreign URIs untouched', () => {
		const canonical = URI.parse(buildSessionDbUri('copilot:/s1', 'tc-1', '/workspace/file.ts', 'before'));
		const unparseable = URI.from({ scheme: 'session-db', path: '/nonsense' });
		const foreign = URI.file('/workspace/file.ts');
		const fileUri = URI.file('/workspace/file.ts');

		assert.deepStrictEqual(
			[canonical, unparseable, foreign].map(uri => canonicalizeSessionDbUri(uri, fileUri).toString()),
			[canonical.toString(), unparseable.toString(), foreign.toString()],
		);
	});
});
