/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Workspace } from 'vs/platform/workspace/common/workspace';
import URI from 'vs/base/common/uri';

suite('Workspace', () => {

	test('Workspace ensures unique roots', () => {

		// Unique
		let roots = [URI.file('/some/path'), URI.file('/some/path')];
		let ws = new Workspace('id', 'name', roots, URI.file('/config'));

		assert.equal(ws.roots.length, 1);
	});
});