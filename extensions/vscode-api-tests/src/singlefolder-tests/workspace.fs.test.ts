/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { posix } from 'path';
import * as vscode from 'vscode';
import { assertNoRpc, createRandomFile } from '../utils';

suite('vscode API - workspace-fs', () => {

	let root: vscode.Uri;

	suiteSetup(function () {
		root = vscode.workspace.workspaceFolders![0]!.uri;
	});

	teardown(assertNoRpc);

	test('fs.stat', async function () {
		const stat = await vscode.workspace.fs.stat(root);
		assert.strictEqual(stat.type, vscode.FileType.Directory);

		assert.strictEqual(typeof stat.size, 'number');
		assert.strictEqual(typeof stat.mtime, 'number');
		assert.strictEqual(typeof stat.ctime, 'number');

		assert.ok(stat.mtime > 0);
		assert.ok(stat.ctime > 0);

		const entries = await vscode.workspace.fs.readDirectory(root);
		assert.ok(entries.length > 0);

		// find far.js
		const tuple = entries.find(tuple => tuple[0] === 'far.js')!;
		assert.ok(tuple);
		assert.strictEqual(tuple[0], 'far.js');
		assert.strictEqual(tuple[1], vscode.FileType.File);
	});

	test('fs.stat - bad scheme', async function () {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.parse('foo:/bar/baz/test.txt'));
			assert.ok(false);
		} catch {
			assert.ok(true);
		}
	});

	test('fs.stat - missing file', async function () {
		try {
			await vscode.workspace.fs.stat(root.with({ path: root.path + '.bad' }));
			assert.ok(false);
		} catch (e) {
			assert.ok(true);
		}
	});

	test('fs.write/stat/read/delete', async function () {

		const uri = root.with({ path: posix.join(root.path, 'new.file') });
		await vscode.workspace.fs.writeFile(uri, Buffer.from('HELLO'));

		const stat = await vscode.workspace.fs.stat(uri);
		assert.strictEqual(stat.type, vscode.FileType.File);

		const contents = await vscode.workspace.fs.readFile(uri);
		assert.strictEqual(Buffer.from(contents).toString(), 'HELLO');

		await vscode.workspace.fs.delete(uri);

		try {
			await vscode.workspace.fs.stat(uri);
			assert.ok(false);
		} catch {
			assert.ok(true);
		}
	});

	test('fs.delete folder', async function () {

		const folder = root.with({ path: posix.join(root.path, 'folder') });
		const file = root.with({ path: posix.join(root.path, 'folder/file') });

		await vscode.workspace.fs.createDirectory(folder);
		await vscode.workspace.fs.writeFile(file, Buffer.from('FOO'));

		await vscode.workspace.fs.stat(folder);
		await vscode.workspace.fs.stat(file);

		// ensure non empty folder cannot be deleted
		try {
			await vscode.workspace.fs.delete(folder, { recursive: false, useTrash: false });
			assert.ok(false);
		} catch {
			await vscode.workspace.fs.stat(folder);
			await vscode.workspace.fs.stat(file);
		}

		// ensure non empty folder cannot be deleted is DEFAULT
		try {
			await vscode.workspace.fs.delete(folder); // recursive: false as default
			assert.ok(false);
		} catch {
			await vscode.workspace.fs.stat(folder);
			await vscode.workspace.fs.stat(file);
		}

		// delete non empty folder with recursive-flag
		await vscode.workspace.fs.delete(folder, { recursive: true, useTrash: false });

		// esnure folder/file are gone
		try {
			await vscode.workspace.fs.stat(folder);
			assert.ok(false);
		} catch {
			assert.ok(true);
		}
		try {
			await vscode.workspace.fs.stat(file);
			assert.ok(false);
		} catch {
			assert.ok(true);
		}
	});

	test('throws FileSystemError (1)', async function () {

		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(`/c468bf16-acfd-4591-825e-2bcebba508a3/71b1f274-91cb-4c19-af00-8495eaab4b73/4b60cb48-a6f2-40ea-9085-0936f4a8f59a.tx6`));
			assert.ok(false);
		} catch (e) {
			assert.ok(e instanceof vscode.FileSystemError);
			assert.strictEqual(e.name, vscode.FileSystemError.FileNotFound().name);
		}
	});

	test('throws FileSystemError (2)', async function () {

		try {
			await vscode.workspace.fs.stat(vscode.Uri.parse('foo:/bar'));
			assert.ok(false);
		} catch (e) {
			assert.ok(e instanceof vscode.FileSystemError);
			assert.strictEqual(e.name, vscode.FileSystemError.Unavailable().name);
		}
	});

	test('vscode.workspace.fs.remove() (and copy()) succeed unexpectedly. #84177 (1)', async function () {
		const entries = await vscode.workspace.fs.readDirectory(root);
		assert.ok(entries.length > 0);

		const someFolder = root.with({ path: posix.join(root.path, '6b1f9d664a92') });

		try {
			await vscode.workspace.fs.delete(someFolder, { recursive: true });
			assert.ok(false);
		} catch (err) {
			assert.ok(true);
		}
	});

	test('vscode.workspace.fs.remove() (and copy()) succeed unexpectedly. #84177 (2)', async function () {
		const entries = await vscode.workspace.fs.readDirectory(root);
		assert.ok(entries.length > 0);

		const folder = root.with({ path: posix.join(root.path, 'folder') });
		const file = root.with({ path: posix.join(root.path, 'folder/file') });

		await vscode.workspace.fs.createDirectory(folder);
		await vscode.workspace.fs.writeFile(file, Buffer.from('FOO'));

		const someFolder = root.with({ path: posix.join(root.path, '6b1f9d664a92/a564c52da70a') });

		try {
			await vscode.workspace.fs.copy(folder, someFolder, { overwrite: true });
			assert.ok(true);
		} catch (err) {
			assert.ok(false, err);

		} finally {
			await vscode.workspace.fs.delete(folder, { recursive: true, useTrash: false });
			await vscode.workspace.fs.delete(someFolder, { recursive: true, useTrash: false });
		}
	});

	test('vscode.workspace.fs error reporting is weird #132981', async function () {

		const uri = await createRandomFile();

		const source = vscode.Uri.joinPath(uri, `./${Math.random().toString(16).slice(2, 8)}`);
		const target = vscode.Uri.joinPath(uri, `../${Math.random().toString(16).slice(2, 8)}`);

		// make sure that target and source don't accidentially exists
		try {
			await vscode.workspace.fs.stat(target);
			this.skip();
		} catch (err) {
			assert.strictEqual(err.code, vscode.FileSystemError.FileNotFound().code);
		}

		try {
			await vscode.workspace.fs.stat(source);
			this.skip();
		} catch (err) {
			assert.strictEqual(err.code, vscode.FileSystemError.FileNotFound().code);
		}

		try {
			await vscode.workspace.fs.rename(source, target);
			assert.fail('error expected');
		} catch (err) {
			assert.ok(err instanceof vscode.FileSystemError);
			assert.strictEqual(err.code, vscode.FileSystemError.FileNotFound().code);
			assert.strictEqual(err.code, 'FileNotFound');
		}
	});

	test('fs.createFolder creates recursively', async function () {

		const folder = root.with({ path: posix.join(root.path, 'deeply', 'nested', 'folder') });
		await vscode.workspace.fs.createDirectory(folder);

		let stat = await vscode.workspace.fs.stat(folder);
		assert.strictEqual(stat.type, vscode.FileType.Directory);

		await vscode.workspace.fs.delete(folder, { recursive: true, useTrash: false });

		await vscode.workspace.fs.createDirectory(folder); // calling on existing folder is also ok!

		const file = root.with({ path: posix.join(folder.path, 'file.txt') });
		await vscode.workspace.fs.writeFile(file, Buffer.from('Hello World'));
		const folder2 = root.with({ path: posix.join(file.path, 'invalid') });
		let e;
		try {
			await vscode.workspace.fs.createDirectory(folder2); // cannot create folder on file path
		} catch (error) {
			e = error;
		}
		assert.ok(e);

		const folder3 = root.with({ path: posix.join(root.path, 'DEEPLY', 'NESTED', 'FOLDER') });
		await vscode.workspace.fs.createDirectory(folder3); // calling on different cased folder is ok!
		stat = await vscode.workspace.fs.stat(folder3);
		assert.strictEqual(stat.type, vscode.FileType.Directory);

		await vscode.workspace.fs.delete(folder, { recursive: true, useTrash: false });
	});

	test('fs.writeFile creates parents recursively', async function () {

		const folder = root.with({ path: posix.join(root.path, 'other-deeply', 'nested', 'folder') });
		const file = root.with({ path: posix.join(folder.path, 'file.txt') });

		await vscode.workspace.fs.writeFile(file, Buffer.from('Hello World'));

		const stat = await vscode.workspace.fs.stat(file);
		assert.strictEqual(stat.type, vscode.FileType.File);

		await vscode.workspace.fs.delete(folder, { recursive: true, useTrash: false });
	});

	test('fs.decode', async function () {
		const uri = root.with({ path: posix.join(root.path, 'file.txt') });

		// without setting
		assert.strictEqual(await vscode.workspace.fs.decode(uri, Buffer.from('Hello World')), 'Hello World');
		assert.strictEqual(await vscode.workspace.fs.decode(uri, Buffer.from('Hellö Wörld')), 'Hellö Wörld');
		assert.strictEqual(await vscode.workspace.fs.decode(uri, new Uint8Array([0xEF, 0xBB, 0xBF, 72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100])), 'Hello World'); // UTF-8 with BOM
		assert.strictEqual(await vscode.workspace.fs.decode(uri, new Uint8Array([0xFE, 0xFF, 0, 72, 0, 101, 0, 108, 0, 108, 0, 111, 0, 32, 0, 87, 0, 111, 0, 114, 0, 108, 0, 100])), 'Hello World'); // UTF-16 BE with BOM
		assert.strictEqual(await vscode.workspace.fs.decode(uri, new Uint8Array([0xFF, 0xFE, 72, 0, 101, 0, 108, 0, 108, 0, 111, 0, 32, 0, 87, 0, 111, 0, 114, 0, 108, 0, 100, 0])), 'Hello World'); // UTF-16 LE with BOM
		assert.strictEqual(await vscode.workspace.fs.decode(uri, new Uint8Array([0, 72, 0, 101, 0, 108, 0, 108, 0, 111, 0, 32, 0, 87, 0, 111, 0, 114, 0, 108, 0, 100])), 'Hello World');
		assert.strictEqual(await vscode.workspace.fs.decode(uri, new Uint8Array([72, 0, 101, 0, 108, 0, 108, 0, 111, 0, 32, 0, 87, 0, 111, 0, 114, 0, 108, 0, 100, 0])), 'Hello World');

		// with auto-guess encoding
		try {
			await vscode.workspace.getConfiguration('files', uri).update('autoGuessEncoding', true, vscode.ConfigurationTarget.Global);
			assert.strictEqual(await vscode.workspace.fs.decode(uri, new Uint8Array([72, 101, 108, 108, 0xF6, 32, 87, 0xF6, 114, 108, 100])), 'Hellö Wörld');
		} finally {
			await vscode.workspace.getConfiguration('files', uri).update('autoGuessEncoding', false, vscode.ConfigurationTarget.Global);
		}

		// with encoding setting
		try {
			await vscode.workspace.getConfiguration('files', uri).update('encoding', 'windows1252', vscode.ConfigurationTarget.Global);
			assert.strictEqual(await vscode.workspace.fs.decode(uri, new Uint8Array([72, 101, 108, 108, 0xF6, 32, 87, 0xF6, 114, 108, 100])), 'Hellö Wörld');
		} finally {
			await vscode.workspace.getConfiguration('files', uri).update('encoding', 'utf8', vscode.ConfigurationTarget.Global);
		}
	});

	test('fs.encode', async function () {
		const uri = root.with({ path: posix.join(root.path, 'file.txt') });

		// without setting
		assert.strictEqual((await vscode.workspace.fs.encode(uri, 'Hello World')).toString(), 'Hello World');

		// with encoding setting
		try {
			await vscode.workspace.getConfiguration('files', uri).update('encoding', 'utf8bom', vscode.ConfigurationTarget.Global);
			assert.ok(equalsUint8Array(await vscode.workspace.fs.encode(uri, 'Hello World'), new Uint8Array([0xEF, 0xBB, 0xBF, 72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100])));

			await vscode.workspace.getConfiguration('files', uri).update('encoding', 'utf16le', vscode.ConfigurationTarget.Global);
			assert.ok(equalsUint8Array(await vscode.workspace.fs.encode(uri, 'Hello World'), new Uint8Array([0xFF, 0xFE, 72, 0, 101, 0, 108, 0, 108, 0, 111, 0, 32, 0, 87, 0, 111, 0, 114, 0, 108, 0, 100, 0])));

			await vscode.workspace.getConfiguration('files', uri).update('encoding', 'utf16be', vscode.ConfigurationTarget.Global);
			assert.ok(equalsUint8Array(await vscode.workspace.fs.encode(uri, 'Hello World'), new Uint8Array([0xFE, 0xFF, 0, 72, 0, 101, 0, 108, 0, 108, 0, 111, 0, 32, 0, 87, 0, 111, 0, 114, 0, 108, 0, 100])));

			await vscode.workspace.getConfiguration('files', uri).update('encoding', 'cp1252', vscode.ConfigurationTarget.Global);
			assert.ok(equalsUint8Array(await vscode.workspace.fs.encode(uri, 'Hellö Wörld'), new Uint8Array([72, 101, 108, 108, 0xF6, 32, 87, 0xF6, 114, 108, 100])));
		} finally {
			await vscode.workspace.getConfiguration('files', uri).update('encoding', 'utf8', vscode.ConfigurationTarget.Global);
		}
	});

	function equalsUint8Array(a: Uint8Array, b: Uint8Array): boolean {
		if (a === b) {
			return true;
		}
		if (a.byteLength !== b.byteLength) {
			return false;
		}
		for (let i = 0; i < a.byteLength; i++) {
			if (a[i] !== b[i]) {
				return false;
			}
		}
		return true;
	}
});
