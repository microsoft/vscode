/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { getUNCHost, isPathAllowedByUNCHostAllowlist } from '../../node/unc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('UNC', () => {

	test('getUNCHost', () => {

		strictEqual(getUNCHost(undefined), undefined);
		strictEqual(getUNCHost(null), undefined);

		strictEqual(getUNCHost('/'), undefined);
		strictEqual(getUNCHost('/foo'), undefined);

		strictEqual(getUNCHost('c:'), undefined);
		strictEqual(getUNCHost('c:\\'), undefined);
		strictEqual(getUNCHost('c:\\foo'), undefined);
		strictEqual(getUNCHost('c:\\foo\\\\server\\path'), undefined);

		strictEqual(getUNCHost('\\'), undefined);
		strictEqual(getUNCHost('\\\\'), undefined);
		strictEqual(getUNCHost('\\\\localhost'), undefined);

		strictEqual(getUNCHost('\\\\localhost\\'), 'localhost');
		strictEqual(getUNCHost('\\\\localhost\\a'), 'localhost');

		strictEqual(getUNCHost('\\\\.'), undefined);
		strictEqual(getUNCHost('\\\\?'), undefined);

		strictEqual(getUNCHost('\\\\.\\localhost'), '.');
		strictEqual(getUNCHost('\\\\?\\localhost'), '?');

		strictEqual(getUNCHost('\\\\.\\UNC\\localhost'), '.');
		strictEqual(getUNCHost('\\\\?\\UNC\\localhost'), '?');

		strictEqual(getUNCHost('\\\\.\\UNC\\localhost\\'), 'localhost');
		strictEqual(getUNCHost('\\\\?\\UNC\\localhost\\'), 'localhost');

		strictEqual(getUNCHost('\\\\.\\UNC\\localhost\\a'), 'localhost');
		strictEqual(getUNCHost('\\\\?\\UNC\\localhost\\a'), 'localhost');
	});

	test('isPathAllowedByUNCHostAllowlist', () => {
		const allowedHosts = ['allowed-host'];
		deepStrictEqual([
			'\\\\allowed-host\\share\\a.png',
			'\\\\ALLOWED-HOST\\share\\a.png',
			'\\\\?\\UNC\\allowed-host\\share\\a.png',
			'\\\\other-host\\share\\a.png',
			'\\\\?\\UNC\\other-host\\share\\a.png',
			'\\\\.\\UNC\\other-host\\share\\a.png',
			'\\\\other-host.png',
			'//other-host/share/a.png',
			'\\\\?\\c:\\foo\\a.png',
			'c:\\foo\\a.png',
			'c:\\foo\\\\other-host\\a.png',
			'\\foo\\a.png',
			'/foo/a.png',
		].map(path => [path, isPathAllowedByUNCHostAllowlist(path, allowedHosts)]), [
			['\\\\allowed-host\\share\\a.png', true],
			['\\\\ALLOWED-HOST\\share\\a.png', true],
			['\\\\?\\UNC\\allowed-host\\share\\a.png', true],
			['\\\\other-host\\share\\a.png', false],
			['\\\\?\\UNC\\other-host\\share\\a.png', false],
			['\\\\.\\UNC\\other-host\\share\\a.png', false],
			['\\\\other-host.png', false],
			['//other-host/share/a.png', false],
			['\\\\?\\c:\\foo\\a.png', false],
			['c:\\foo\\a.png', true],
			['c:\\foo\\\\other-host\\a.png', true],
			['\\foo\\a.png', true],
			['/foo/a.png', true],
		]);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
