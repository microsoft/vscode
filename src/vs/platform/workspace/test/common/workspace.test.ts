/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Workspace } from 'vs/platform/workspace/common/workspace';
import URI from 'vs/base/common/uri';
import { join, dirname } from 'vs/base/common/paths';

suite('Workspace', () => {

	test('Workspace ensures absolute and unique roots', () => {

		// Unique
		let roots = [URI.file('/some/path'), URI.file('/some/path')];
		let ws = new Workspace('id', 'name', roots, URI.file('/config'));

		assert.equal(ws.roots.length, 1);

		// Absolute
		let config = URI.file('/someFolder/workspace.code-workspace');
		roots = [URI.parse('./some/path'), URI.parse('some/other/path')];
		ws = new Workspace('id', 'name', roots, config);

		assert.equal(ws.roots.length, 2);
		assert.equal(ws.roots[0].fsPath, URI.file(join(dirname(config.fsPath), roots[0].fsPath)).fsPath);
		assert.equal(ws.roots[1].fsPath, URI.file(join(dirname(config.fsPath), roots[1].fsPath)).fsPath);

		// Absolute (from root)
		config = URI.file('/workspace.code-workspace');
		roots = [URI.parse('./some/path'), URI.parse('some/other/path')];
		ws = new Workspace('id', 'name', roots, config);

		assert.equal(ws.roots.length, 2);
		assert.equal(ws.roots[0].fsPath, URI.file(join(dirname(config.fsPath), roots[0].fsPath)).fsPath);
		assert.equal(ws.roots[1].fsPath, URI.file(join(dirname(config.fsPath), roots[1].fsPath)).fsPath);
	});
});