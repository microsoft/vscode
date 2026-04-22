/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert, suite, test } from 'vitest';
import { isImportStatement } from '../../prompt/common/importStatement';

suite('isImportStatement', () => {
	test('typescript', () => {
		assert.strictEqual(isImportStatement('import foo from "bar";', 'typescript'), true);
		assert.strictEqual(isImportStatement('  \timport foo from "bar";', 'typescript'), true);
		assert.strictEqual(isImportStatement('import * as foo from "bar";', 'typescript'), true);
		assert.strictEqual(isImportStatement('import { foo } from "bar";', 'typescript'), true);
		assert.strictEqual(isImportStatement('import { foo as bar } from "bar";', 'typescript'), true);
		assert.strictEqual(isImportStatement('import "bar";', 'typescript'), true);
		assert.strictEqual(isImportStatement(`const fs = require('fs');`, 'typescript'), true);
		assert.strictEqual(isImportStatement(`var fs = require("fs");`, 'typescript'), true);
		assert.strictEqual(isImportStatement(`import assert = require('assert');`, 'typescript'), true);
		assert.strictEqual(isImportStatement(`import*as fs from 'fs'`, 'typescript'), true);
		assert.strictEqual(isImportStatement(`import{arch} from 'os'`, 'typescript'), true);
		assert.strictEqual(isImportStatement('export { foo } from "bar";', 'typescript'), false);
		assert.strictEqual(isImportStatement(`const location = require.resolve('assert');`, 'typescript'), false);
	});

	test('javascript', () => {
		assert.strictEqual(isImportStatement('import foo from "bar";', 'javascript'), true);
		assert.strictEqual(isImportStatement('\t\t\timport foo from "bar";', 'javascript'), true);
		assert.strictEqual(isImportStatement('import * as foo from "bar";', 'javascript'), true);
		assert.strictEqual(isImportStatement('import { foo } from "bar";', 'javascript'), true);
		assert.strictEqual(isImportStatement('import { foo as bar } from "bar";', 'javascript'), true);
		assert.strictEqual(isImportStatement('import "bar";', 'javascript'), true);
		assert.strictEqual(isImportStatement(`const fs = require('fs');`, 'javascript'), true);
		assert.strictEqual(isImportStatement(`let fs = require("fs");`, 'javascript'), true);
		assert.strictEqual(isImportStatement(`var fs=require("fs");`, 'javascript'), true);
		assert.strictEqual(isImportStatement('export { foo } from "bar";', 'javascript'), false);
	});

	test('java', () => {
		assert.strictEqual(isImportStatement('import java.util.ArrayList;', 'java'), true);
		assert.strictEqual(isImportStatement('   import java.util.ArrayList;', 'java'), true);
		assert.strictEqual(isImportStatement('import static java.lang.Math.*;', 'java'), true);
		assert.strictEqual(isImportStatement('import java.util.*;', 'java'), true);
	});

	test('php', () => {
		assert.strictEqual(isImportStatement('use foo\\bar;', 'php'), true);
		assert.strictEqual(isImportStatement('  use foo\\bar;', 'php'), true);
		assert.strictEqual(isImportStatement('use foo\\bar as baz;', 'php'), true);
		assert.strictEqual(isImportStatement('use function foo\\bar;', 'php'), true);
		assert.strictEqual(isImportStatement('use const foo\\bar;', 'php'), true);
		assert.strictEqual(isImportStatement('use foo\\bar { baz };', 'php'), true);
		assert.strictEqual(isImportStatement('require_once "bar.php";', 'php'), false);
	});

	test('rust', () => {
		assert.strictEqual(isImportStatement('use foo;', 'rust'), true);
		assert.strictEqual(isImportStatement('\t\tuse foo;', 'rust'), true);
		assert.strictEqual(isImportStatement('use foo::bar;', 'rust'), true);
		assert.strictEqual(isImportStatement('use foo::{bar, baz};', 'rust'), true);
		assert.strictEqual(isImportStatement('use foo as bar;', 'rust'), true);
		assert.strictEqual(isImportStatement('extern crate foo;', 'rust'), false);
	});

	test('python', () => {
		assert.strictEqual(isImportStatement('  import foo', 'python'), true);
		assert.strictEqual(isImportStatement('import foo as bar', 'python'), true);
		assert.strictEqual(isImportStatement('from foo import bar', 'python'), true);
		assert.strictEqual(isImportStatement('from foo import bar, baz', 'python'), true);
		assert.strictEqual(isImportStatement('from foo import *', 'python'), true);
		assert.strictEqual(isImportStatement('import "bar"', 'python'), false);
		assert.strictEqual(isImportStatement('export { foo } from "bar";', 'python'), false);
		assert.strictEqual(isImportStatement('const foo = require("bar");', 'python'), false);
	});
});
