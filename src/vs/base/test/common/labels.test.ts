/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as labels from 'vs/base/common/labels';
import { isMacintosh, isWindows, OperatingSystem } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Labels', () => {
	(!isWindows ? test.skip : test)('shorten - windows', () => {

		// nothing to shorten
		assert.deepStrictEqual(labels.shorten(['a']), ['a']);
		assert.deepStrictEqual(labels.shorten(['a', 'b']), ['a', 'b']);
		assert.deepStrictEqual(labels.shorten(['a', 'b', 'c']), ['a', 'b', 'c']);
		assert.deepStrictEqual(labels.shorten(['\\\\x\\a', '\\\\x\\a']), ['\\\\x\\a', '\\\\x\\a']);
		assert.deepStrictEqual(labels.shorten(['C:\\a', 'C:\\b']), ['C:\\a', 'C:\\b']);

		// completely different paths
		assert.deepStrictEqual(labels.shorten(['a\\b', 'c\\d', 'e\\f']), ['…\\b', '…\\d', '…\\f']);

		// same beginning
		assert.deepStrictEqual(labels.shorten(['a', 'a\\b']), ['a', '…\\b']);
		assert.deepStrictEqual(labels.shorten(['a\\b', 'a\\b\\c']), ['…\\b', '…\\c']);
		assert.deepStrictEqual(labels.shorten(['a', 'a\\b', 'a\\b\\c']), ['a', '…\\b', '…\\c']);
		assert.deepStrictEqual(labels.shorten(['x:\\a\\b', 'x:\\a\\c']), ['x:\\…\\b', 'x:\\…\\c']);
		assert.deepStrictEqual(labels.shorten(['\\\\a\\b', '\\\\a\\c']), ['\\\\a\\b', '\\\\a\\c']);

		// same ending
		assert.deepStrictEqual(labels.shorten(['a', 'b\\a']), ['a', 'b\\…']);
		assert.deepStrictEqual(labels.shorten(['a\\b\\c', 'd\\b\\c']), ['a\\…', 'd\\…']);
		assert.deepStrictEqual(labels.shorten(['a\\b\\c\\d', 'f\\b\\c\\d']), ['a\\…', 'f\\…']);
		assert.deepStrictEqual(labels.shorten(['d\\e\\a\\b\\c', 'd\\b\\c']), ['…\\a\\…', 'd\\b\\…']);
		assert.deepStrictEqual(labels.shorten(['a\\b\\c\\d', 'a\\f\\b\\c\\d']), ['a\\b\\…', '…\\f\\…']);
		assert.deepStrictEqual(labels.shorten(['a\\b\\a', 'b\\b\\a']), ['a\\b\\…', 'b\\b\\…']);
		assert.deepStrictEqual(labels.shorten(['d\\f\\a\\b\\c', 'h\\d\\b\\c']), ['…\\a\\…', 'h\\…']);
		assert.deepStrictEqual(labels.shorten(['a\\b\\c', 'x:\\0\\a\\b\\c']), ['a\\b\\c', 'x:\\0\\…']);
		assert.deepStrictEqual(labels.shorten(['x:\\a\\b\\c', 'x:\\0\\a\\b\\c']), ['x:\\a\\…', 'x:\\0\\…']);
		assert.deepStrictEqual(labels.shorten(['x:\\a\\b', 'y:\\a\\b']), ['x:\\…', 'y:\\…']);
		assert.deepStrictEqual(labels.shorten(['x:\\a', 'x:\\c']), ['x:\\a', 'x:\\c']);
		assert.deepStrictEqual(labels.shorten(['x:\\a\\b', 'y:\\x\\a\\b']), ['x:\\…', 'y:\\…']);
		assert.deepStrictEqual(labels.shorten(['\\\\x\\b', '\\\\y\\b']), ['\\\\x\\…', '\\\\y\\…']);
		assert.deepStrictEqual(labels.shorten(['\\\\x\\a', '\\\\x\\b']), ['\\\\x\\a', '\\\\x\\b']);

		// same name ending
		assert.deepStrictEqual(labels.shorten(['a\\b', 'a\\c', 'a\\e-b']), ['…\\b', '…\\c', '…\\e-b']);

		// same in the middle
		assert.deepStrictEqual(labels.shorten(['a\\b\\c', 'd\\b\\e']), ['…\\c', '…\\e']);

		// case-sensetive
		assert.deepStrictEqual(labels.shorten(['a\\b\\c', 'd\\b\\C']), ['…\\c', '…\\C']);

		// empty or null
		assert.deepStrictEqual(labels.shorten(['', null!]), ['.\\', null]);

		assert.deepStrictEqual(labels.shorten(['a', 'a\\b', 'a\\b\\c', 'd\\b\\c', 'd\\b']), ['a', 'a\\b', 'a\\b\\c', 'd\\b\\c', 'd\\b']);
		assert.deepStrictEqual(labels.shorten(['a', 'a\\b', 'b']), ['a', 'a\\b', 'b']);
		assert.deepStrictEqual(labels.shorten(['', 'a', 'b', 'b\\c', 'a\\c']), ['.\\', 'a', 'b', 'b\\c', 'a\\c']);
		assert.deepStrictEqual(labels.shorten(['src\\vs\\workbench\\parts\\execution\\electron-sandbox', 'src\\vs\\workbench\\parts\\execution\\electron-sandbox\\something', 'src\\vs\\workbench\\parts\\terminal\\electron-sandbox']), ['…\\execution\\electron-sandbox', '…\\something', '…\\terminal\\…']);
	});

	(isWindows ? test.skip : test)('shorten - not windows', () => {

		// nothing to shorten
		assert.deepStrictEqual(labels.shorten(['a']), ['a']);
		assert.deepStrictEqual(labels.shorten(['a', 'b']), ['a', 'b']);
		assert.deepStrictEqual(labels.shorten(['/a', '/b']), ['/a', '/b']);
		assert.deepStrictEqual(labels.shorten(['~/a/b/c', '~/a/b/c']), ['~/a/b/c', '~/a/b/c']);
		assert.deepStrictEqual(labels.shorten(['a', 'b', 'c']), ['a', 'b', 'c']);

		// completely different paths
		assert.deepStrictEqual(labels.shorten(['a/b', 'c/d', 'e/f']), ['…/b', '…/d', '…/f']);

		// same beginning
		assert.deepStrictEqual(labels.shorten(['a', 'a/b']), ['a', '…/b']);
		assert.deepStrictEqual(labels.shorten(['a/b', 'a/b/c']), ['…/b', '…/c']);
		assert.deepStrictEqual(labels.shorten(['a', 'a/b', 'a/b/c']), ['a', '…/b', '…/c']);
		assert.deepStrictEqual(labels.shorten(['/a/b', '/a/c']), ['/a/b', '/a/c']);

		// same ending
		assert.deepStrictEqual(labels.shorten(['a', 'b/a']), ['a', 'b/…']);
		assert.deepStrictEqual(labels.shorten(['a/b/c', 'd/b/c']), ['a/…', 'd/…']);
		assert.deepStrictEqual(labels.shorten(['a/b/c/d', 'f/b/c/d']), ['a/…', 'f/…']);
		assert.deepStrictEqual(labels.shorten(['d/e/a/b/c', 'd/b/c']), ['…/a/…', 'd/b/…']);
		assert.deepStrictEqual(labels.shorten(['a/b/c/d', 'a/f/b/c/d']), ['a/b/…', '…/f/…']);
		assert.deepStrictEqual(labels.shorten(['a/b/a', 'b/b/a']), ['a/b/…', 'b/b/…']);
		assert.deepStrictEqual(labels.shorten(['d/f/a/b/c', 'h/d/b/c']), ['…/a/…', 'h/…']);
		assert.deepStrictEqual(labels.shorten(['/x/b', '/y/b']), ['/x/…', '/y/…']);

		// same name ending
		assert.deepStrictEqual(labels.shorten(['a/b', 'a/c', 'a/e-b']), ['…/b', '…/c', '…/e-b']);

		// same in the middle
		assert.deepStrictEqual(labels.shorten(['a/b/c', 'd/b/e']), ['…/c', '…/e']);

		// case-sensitive
		assert.deepStrictEqual(labels.shorten(['a/b/c', 'd/b/C']), ['…/c', '…/C']);

		// empty or null
		assert.deepStrictEqual(labels.shorten(['', null!]), ['./', null]);

		assert.deepStrictEqual(labels.shorten(['a', 'a/b', 'a/b/c', 'd/b/c', 'd/b']), ['a', 'a/b', 'a/b/c', 'd/b/c', 'd/b']);
		assert.deepStrictEqual(labels.shorten(['a', 'a/b', 'b']), ['a', 'a/b', 'b']);
		assert.deepStrictEqual(labels.shorten(['', 'a', 'b', 'b/c', 'a/c']), ['./', 'a', 'b', 'b/c', 'a/c']);
	});

	test('template', () => {

		// simple
		assert.strictEqual(labels.template('Foo Bar'), 'Foo Bar');
		assert.strictEqual(labels.template('Foo${}Bar'), 'FooBar');
		assert.strictEqual(labels.template('$FooBar'), '');
		assert.strictEqual(labels.template('}FooBar'), '}FooBar');
		assert.strictEqual(labels.template('Foo ${one} Bar', { one: 'value' }), 'Foo value Bar');
		assert.strictEqual(labels.template('Foo ${one} Bar ${two}', { one: 'value', two: 'other value' }), 'Foo value Bar other value');

		// conditional separator
		assert.strictEqual(labels.template('Foo${separator}Bar'), 'FooBar');
		assert.strictEqual(labels.template('Foo${separator}Bar', { separator: { label: ' - ' } }), 'Foo - Bar');
		assert.strictEqual(labels.template('${separator}Foo${separator}Bar', { value: 'something', separator: { label: ' - ' } }), 'Foo - Bar');
		assert.strictEqual(labels.template('${value} Foo${separator}Bar', { value: 'something', separator: { label: ' - ' } }), 'something Foo - Bar');

		// real world example (macOS)
		let t = '${activeEditorShort}${separator}${rootName}';
		assert.strictEqual(labels.template(t, { activeEditorShort: '', rootName: '', separator: { label: ' - ' } }), '');
		assert.strictEqual(labels.template(t, { activeEditorShort: '', rootName: 'root', separator: { label: ' - ' } }), 'root');
		assert.strictEqual(labels.template(t, { activeEditorShort: 'markdown.txt', rootName: 'root', separator: { label: ' - ' } }), 'markdown.txt - root');

		// real world example (other)
		t = '${dirty}${activeEditorShort}${separator}${rootName}${separator}${appName}';
		assert.strictEqual(labels.template(t, { dirty: '', activeEditorShort: '', rootName: '', appName: '', separator: { label: ' - ' } }), '');
		assert.strictEqual(labels.template(t, { dirty: '', activeEditorShort: '', rootName: '', appName: 'Visual Studio Code', separator: { label: ' - ' } }), 'Visual Studio Code');
		assert.strictEqual(labels.template(t, { dirty: '', activeEditorShort: 'Untitled-1', rootName: '', appName: 'Visual Studio Code', separator: { label: ' - ' } }), 'Untitled-1 - Visual Studio Code');
		assert.strictEqual(labels.template(t, { dirty: '', activeEditorShort: '', rootName: 'monaco', appName: 'Visual Studio Code', separator: { label: ' - ' } }), 'monaco - Visual Studio Code');
		assert.strictEqual(labels.template(t, { dirty: '', activeEditorShort: 'somefile.txt', rootName: 'monaco', appName: 'Visual Studio Code', separator: { label: ' - ' } }), 'somefile.txt - monaco - Visual Studio Code');
		assert.strictEqual(labels.template(t, { dirty: '* ', activeEditorShort: 'somefile.txt', rootName: 'monaco', appName: 'Visual Studio Code', separator: { label: ' - ' } }), '* somefile.txt - monaco - Visual Studio Code');

		// real world example (other)
		t = '${dirty}${activeEditorShort}${separator}${rootNameShort}${separator}${appName}';
		assert.strictEqual(labels.template(t, { dirty: '', activeEditorShort: '', rootName: 'monaco (Workspace)', rootNameShort: 'monaco', appName: 'Visual Studio Code', separator: { label: ' - ' } }), 'monaco - Visual Studio Code');
	});

	test('mnemonicButtonLabel', () => {
		assert.strictEqual(labels.mnemonicButtonLabel('Hello World'), 'Hello World');
		assert.strictEqual(labels.mnemonicButtonLabel(''), '');
		if (isWindows) {
			assert.strictEqual(labels.mnemonicButtonLabel('Hello & World'), 'Hello && World');
			assert.strictEqual(labels.mnemonicButtonLabel('Do &&not Save & Continue'), 'Do &not Save && Continue');
		} else if (isMacintosh) {
			assert.strictEqual(labels.mnemonicButtonLabel('Hello & World'), 'Hello & World');
			assert.strictEqual(labels.mnemonicButtonLabel('Do &&not Save & Continue'), 'Do not Save & Continue');
		} else {
			assert.strictEqual(labels.mnemonicButtonLabel('Hello & World'), 'Hello & World');
			assert.strictEqual(labels.mnemonicButtonLabel('Do &&not Save & Continue'), 'Do _not Save & Continue');
		}
	});

	test('getPathLabel', () => {
		const winFileUri = URI.file('c:/some/folder/file.txt');
		const nixFileUri = URI.file('/some/folder/file.txt');
		const nixBadFileUri = URI.revive({ scheme: 'vscode', authority: 'file', path: '//some/folder/file.txt' });
		const uncFileUri = URI.file('c:/some/folder/file.txt').with({ authority: 'auth' });
		const remoteFileUri = URI.file('/some/folder/file.txt').with({ scheme: 'vscode-test', authority: 'auth' });

		// Basics

		assert.strictEqual(labels.getPathLabel(winFileUri, { os: OperatingSystem.Windows }), 'C:\\some\\folder\\file.txt');
		assert.strictEqual(labels.getPathLabel(winFileUri, { os: OperatingSystem.Macintosh }), 'c:/some/folder/file.txt');
		assert.strictEqual(labels.getPathLabel(winFileUri, { os: OperatingSystem.Linux }), 'c:/some/folder/file.txt');

		assert.strictEqual(labels.getPathLabel(nixFileUri, { os: OperatingSystem.Windows }), '\\some\\folder\\file.txt');
		assert.strictEqual(labels.getPathLabel(nixFileUri, { os: OperatingSystem.Macintosh }), '/some/folder/file.txt');
		assert.strictEqual(labels.getPathLabel(nixFileUri, { os: OperatingSystem.Linux }), '/some/folder/file.txt');

		assert.strictEqual(labels.getPathLabel(uncFileUri, { os: OperatingSystem.Windows }), '\\\\auth\\c:\\some\\folder\\file.txt');
		assert.strictEqual(labels.getPathLabel(uncFileUri, { os: OperatingSystem.Macintosh }), '/auth/c:/some/folder/file.txt');
		assert.strictEqual(labels.getPathLabel(uncFileUri, { os: OperatingSystem.Linux }), '/auth/c:/some/folder/file.txt');

		assert.strictEqual(labels.getPathLabel(remoteFileUri, { os: OperatingSystem.Windows }), '\\some\\folder\\file.txt');
		assert.strictEqual(labels.getPathLabel(remoteFileUri, { os: OperatingSystem.Macintosh }), '/some/folder/file.txt');
		assert.strictEqual(labels.getPathLabel(remoteFileUri, { os: OperatingSystem.Linux }), '/some/folder/file.txt');

		// Tildify

		const nixUserHome = URI.file('/some');
		const remoteUserHome = URI.file('/some').with({ scheme: 'vscode-test', authority: 'auth' });

		assert.strictEqual(labels.getPathLabel(nixFileUri, { os: OperatingSystem.Windows, tildify: { userHome: nixUserHome } }), '\\some\\folder\\file.txt');
		assert.strictEqual(labels.getPathLabel(nixFileUri, { os: OperatingSystem.Macintosh, tildify: { userHome: nixUserHome } }), '~/folder/file.txt');
		assert.strictEqual(labels.getPathLabel(nixBadFileUri, { os: OperatingSystem.Macintosh, tildify: { userHome: nixUserHome } }), '/some/folder/file.txt');
		assert.strictEqual(labels.getPathLabel(nixFileUri, { os: OperatingSystem.Linux, tildify: { userHome: nixUserHome } }), '~/folder/file.txt');

		assert.strictEqual(labels.getPathLabel(nixFileUri, { os: OperatingSystem.Windows, tildify: { userHome: remoteUserHome } }), '\\some\\folder\\file.txt');
		assert.strictEqual(labels.getPathLabel(nixFileUri, { os: OperatingSystem.Macintosh, tildify: { userHome: remoteUserHome } }), '~/folder/file.txt');
		assert.strictEqual(labels.getPathLabel(nixFileUri, { os: OperatingSystem.Linux, tildify: { userHome: remoteUserHome } }), '~/folder/file.txt');

		const nixUntitledUri = URI.file('/some/folder/file.txt').with({ scheme: 'untitled' });

		assert.strictEqual(labels.getPathLabel(nixUntitledUri, { os: OperatingSystem.Windows, tildify: { userHome: nixUserHome } }), '\\some\\folder\\file.txt');
		assert.strictEqual(labels.getPathLabel(nixUntitledUri, { os: OperatingSystem.Macintosh, tildify: { userHome: nixUserHome } }), '~/folder/file.txt');
		assert.strictEqual(labels.getPathLabel(nixUntitledUri, { os: OperatingSystem.Linux, tildify: { userHome: nixUserHome } }), '~/folder/file.txt');

		assert.strictEqual(labels.getPathLabel(nixUntitledUri, { os: OperatingSystem.Windows, tildify: { userHome: remoteUserHome } }), '\\some\\folder\\file.txt');
		assert.strictEqual(labels.getPathLabel(nixUntitledUri, { os: OperatingSystem.Macintosh, tildify: { userHome: remoteUserHome } }), '~/folder/file.txt');
		assert.strictEqual(labels.getPathLabel(nixUntitledUri, { os: OperatingSystem.Linux, tildify: { userHome: remoteUserHome } }), '~/folder/file.txt');

		// Relative

		const winFolder = URI.file('c:/some');
		const winRelativePathProvider: labels.IRelativePathProvider = {
			getWorkspace() { return { folders: [{ uri: winFolder }] }; },
			getWorkspaceFolder(resource) { return { uri: winFolder }; }
		};

		assert.strictEqual(labels.getPathLabel(winFileUri, { os: OperatingSystem.Windows, relative: winRelativePathProvider }), 'folder\\file.txt');
		assert.strictEqual(labels.getPathLabel(winFileUri, { os: OperatingSystem.Macintosh, relative: winRelativePathProvider }), 'folder/file.txt');
		assert.strictEqual(labels.getPathLabel(winFileUri, { os: OperatingSystem.Linux, relative: winRelativePathProvider }), 'folder/file.txt');

		const nixFolder = URI.file('/some');
		const nixRelativePathProvider: labels.IRelativePathProvider = {
			getWorkspace() { return { folders: [{ uri: nixFolder }] }; },
			getWorkspaceFolder(resource) { return { uri: nixFolder }; }
		};

		assert.strictEqual(labels.getPathLabel(nixFileUri, { os: OperatingSystem.Windows, relative: nixRelativePathProvider }), 'folder\\file.txt');
		assert.strictEqual(labels.getPathLabel(nixFileUri, { os: OperatingSystem.Macintosh, relative: nixRelativePathProvider }), 'folder/file.txt');
		assert.strictEqual(labels.getPathLabel(nixFileUri, { os: OperatingSystem.Linux, relative: nixRelativePathProvider }), 'folder/file.txt');

		assert.strictEqual(labels.getPathLabel(nixUntitledUri, { os: OperatingSystem.Windows, relative: nixRelativePathProvider }), 'folder\\file.txt');
		assert.strictEqual(labels.getPathLabel(nixUntitledUri, { os: OperatingSystem.Macintosh, relative: nixRelativePathProvider }), 'folder/file.txt');
		assert.strictEqual(labels.getPathLabel(nixUntitledUri, { os: OperatingSystem.Linux, relative: nixRelativePathProvider }), 'folder/file.txt');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
