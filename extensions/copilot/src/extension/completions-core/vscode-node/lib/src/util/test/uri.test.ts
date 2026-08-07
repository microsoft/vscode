/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { platform } from 'os';
import * as path from 'path';
import { basename, dirname, fsPath, getFsPath, makeFsUri, normalizeUri } from '../uri';

suite('normalizeUri tests', function () {
	test('returns the canonical form of a URI as a string', function () {
		const result = normalizeUri('file:///C:/path/to/file');

		assert.strictEqual(result, 'file:///c%3A/path/to/file');
	});

	test('does not alter canonical URI strings', function () {
		const result = normalizeUri('file:///c%3A/path/to/file');

		assert.strictEqual(result, 'file:///c%3A/path/to/file');
	});

	test('returns the original string for unparsable URIs', function () {
		const result = normalizeUri('not a:// uri');

		assert.strictEqual(result, 'not a:// uri');
	});

	test('returns the original string for unparsable URIs in strict mode', function () {
		const result = normalizeUri('c:\\path');

		assert.strictEqual(result, 'c:\\path');
	});
});

suite('URI file system tests', function () {
	test('getFsPath returns the file path for file system URIs', function () {
		// Drive letter will get normalized to lowercase by makeFsUri
		assert.strictEqual(getFsPath(makeFsUri(__filename))?.toLowerCase(), __filename.toLowerCase());
	});

	test('getFsPath uses the platform-specific file separator', function () {
		assert.strictEqual(getFsPath('file:///some/path'), path.join(path.sep, 'some', 'path'));
	});

	test('getFsPath recognizes platform-specific absolute paths', function () {
		if (platform() === 'win32') {
			assert.strictEqual(getFsPath('file:///C:/Some/Path'), 'C:\\Some\\Path');
		} else {
			assert.strictEqual(getFsPath('file:///C:/Some/Path'), '/C:/Some/Path');
		}
	});

	test('getFsPath supports UNC paths on Windows', function () {
		if (platform() === 'win32') {
			assert.strictEqual(getFsPath('file://Server/Share/Some/Path'), '\\\\Server\\Share\\Some\\Path');
		} else {
			// on other platforms, this is the equivalent to smb://Server/Share/Some/Path,
			// which is not a file system path
			assert.strictEqual(getFsPath('file://Server/Share/Some/Path'), undefined);
		}
	});

	test('getFsPath supports device paths on Windows', function () {
		if (platform() !== 'win32') { this.skip(); }

		const devicePath = '\\\\.\\c:\\Some\\Path';

		assert.strictEqual(getFsPath(makeFsUri(devicePath)), devicePath);
	});

	test('fsPath throws when the scheme does not represent a local file', function () {
		assert.throws(() => fsPath('https://host.example/path'), /Copilot currently does not support URI with scheme/);
		assert.throws(() => fsPath('untitled:Untitled-1'), /Copilot currently does not support URI with scheme/);
		assert.ok(fsPath('vscode-notebook-cell:///path/to/file'));
		assert.ok(fsPath('vscode-notebook:///path/to/file'));
		assert.ok(fsPath('notebook:///path/to/file'));
	});

	test('fsPath uses the platform-specific definition of a local file', function () {
		const uri = 'file://Server/Share/path';

		if (platform() === 'win32') {
			assert.strictEqual(fsPath(uri), '\\\\Server\\Share\\path');
		} else {
			assert.throws(() => fsPath(uri), /Unsupported remote file path/);
		}
	});
});

suite('dirname tests', function () {
	test('dirname works for file URI', function () {
		const dir = dirname('file:///path/to/file');
		assert.strictEqual(dir, 'file:///path/to');
	});
	test('dirname converts notebook URI to file dir', function () {
		const notebookUri = 'vscode-notebook-cell:///path/to/file#cell-id';
		const dir = dirname(notebookUri);
		assert.strictEqual(dir, 'file:///path/to');
	});

	test('returns {uri: string} for {uri: string}', function () {
		assert.deepStrictEqual(dirname({ uri: 'file:///path/to/file' }), { uri: 'file:///path/to' });
	});
});

suite('basename tests', function () {
	function verifyBasename(fsPath: string) {
		const absolute = `file://${fsPath}`;
		const pathExpected = path.basename(getFsPath(absolute) || '');
		const actual = basename(absolute);
		assert.equal(
			actual,
			pathExpected,
			`basename() returned '${actual}' but path.basename() returned '${pathExpected}'`
		);
		const utilsExpected = basename(absolute);
		assert.equal(
			actual,
			utilsExpected,
			`basename() returned '${actual}' but Utils.basename() returned '${utilsExpected}'`
		);
	}

	[
		'/path/to/file',
		'/path/to/file?query',
		'/path/to/file#anchor',
		'/path/to/file?query#anchor',
		'/path/with%20valid%20%25%20encoding',
		'/path/with no % encoding',
		'/path/with invalid %80 encoding',
		'/path/to/directory/',
		'/path/to/directory/?query',
		'/path/to/directory/#anchor',
		'/path/to/directory/?query#anchor',
		'/',
		'/?query',
		'/#anchor',
		'/?query#anchor',
	].forEach(fsPath => {
		test(fsPath, function () {
			verifyBasename(fsPath);
		});
	});
});
