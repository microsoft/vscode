/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { distinctParents, dirname } from 'vs/base/common/resources';
import { normalize } from 'vs/base/common/paths';

suite('Resources', () => {

	test('distinctParents', () => {

		// Basic
		let resources = [
			URI.file('/some/folderA/file.txt'),
			URI.file('/some/folderB/file.txt'),
			URI.file('/some/folderC/file.txt')
		];

		let distinct = distinctParents(resources, r => r);
		assert.equal(distinct.length, 3);
		assert.equal(distinct[0].toString(), resources[0].toString());
		assert.equal(distinct[1].toString(), resources[1].toString());
		assert.equal(distinct[2].toString(), resources[2].toString());

		// Parent / Child
		resources = [
			URI.file('/some/folderA'),
			URI.file('/some/folderA/file.txt'),
			URI.file('/some/folderA/child/file.txt'),
			URI.file('/some/folderA2/file.txt'),
			URI.file('/some/file.txt')
		];

		distinct = distinctParents(resources, r => r);
		assert.equal(distinct.length, 3);
		assert.equal(distinct[0].toString(), resources[0].toString());
		assert.equal(distinct[1].toString(), resources[3].toString());
		assert.equal(distinct[2].toString(), resources[4].toString());
	});

	test('dirname', () => {
		const f = URI.file('/some/file/test.txt');
		const d = dirname(f);
		assert.equal(d.fsPath, normalize('/some/file', true));

		// does not explode (https://github.com/Microsoft/vscode/issues/41987)
		dirname(URI.from({ scheme: 'file', authority: '/users/someone/portal.h' }));
	});
});