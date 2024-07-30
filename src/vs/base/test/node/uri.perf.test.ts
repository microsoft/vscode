/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { FileAccess } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('URI - perf', function () {

	// COMMENT THIS OUT TO RUN TEST
	if (1) {
		return;
	}

	ensureNoDisposablesAreLeakedInTestSuite();

	let manyFileUris: URI[];
	setup(function () {
		manyFileUris = [];
		const data = readFileSync(FileAccess.asFileUri('vs/base/test/node/uri.perf.data.txt').fsPath).toString();
		const lines = data.split('\n');
		for (const line of lines) {
			manyFileUris.push(URI.file(line));
		}
	});

	function perfTest(name: string, callback: Function) {
		test(name, _done => {
			const t1 = Date.now();
			callback();
			const d = Date.now() - t1;
			console.log(`${name} took ${d}ms (${(d / manyFileUris.length).toPrecision(3)} ms/uri) (${manyFileUris.length} uris)`);
			_done();
		});
	}

	perfTest('toString', function () {
		for (const uri of manyFileUris) {
			const data = uri.toString();
			assert.ok(data);
		}
	});

	perfTest('toString(skipEncoding)', function () {
		for (const uri of manyFileUris) {
			const data = uri.toString(true);
			assert.ok(data);
		}
	});

	perfTest('fsPath', function () {
		for (const uri of manyFileUris) {
			const data = uri.fsPath;
			assert.ok(data);
		}
	});

	perfTest('toJSON', function () {
		for (const uri of manyFileUris) {
			const data = uri.toJSON();
			assert.ok(data);
		}
	});

});
