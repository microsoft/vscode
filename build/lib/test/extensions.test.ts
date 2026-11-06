/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { isPackagedTypeScriptFile } from '../extensions.ts';

suite('isPackagedTypeScriptFile', () => {
	test('keeps package.json and lib, without the compiler, typescriptServices and most declarations', () => {
		const files = [
			'',
			'package.json',
			'README.md',
			'bin/tsc',
			'lib',
			'lib/typescript.js',
			'lib/tsserver.js',
			'lib/_tsserver.js',
			'lib/typesMap.json',
			'lib/tsc.js',
			'lib/_tsc.js',
			'lib/tsc6.js',
			'lib/typescriptServices.js',
			'lib/lib.d.ts',
			'lib/lib.es2015.d.ts',
			'lib/typescript.d.ts',
			'lib/protocol.d.ts',
			'lib/tsserverlibrary.d.ts',
			'lib/cs',
			'lib/cs/diagnosticMessages.generated.json',
		];

		assert.deepStrictEqual(files.filter(isPackagedTypeScriptFile), [
			'',
			'package.json',
			'lib',
			'lib/typescript.js',
			'lib/tsserver.js',
			'lib/_tsserver.js',
			'lib/typesMap.json',
			'lib/lib.d.ts',
			'lib/lib.es2015.d.ts',
			'lib/typescript.d.ts',
			'lib/protocol.d.ts',
			'lib/cs',
			'lib/cs/diagnosticMessages.generated.json',
		]);
	});
});
