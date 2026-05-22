/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { escapeCmdArg } from '../../node/extHostMcpNode.js';

suite('extHostMcpNode - escapeCmdArg', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('wraps simple values in double quotes', () => {
		assert.strictEqual(escapeCmdArg('list'), '"list"');
		assert.strictEqual(escapeCmdArg('--prefix'), '"--prefix"');
		assert.strictEqual(escapeCmdArg(''), '""');
	});

	test('preserves paths with spaces', () => {
		assert.strictEqual(
			escapeCmdArg('C:\\Program Files\\nodejs\\npm.cmd'),
			'"C:\\Program Files\\nodejs\\npm.cmd"',
		);
	});

	test('preserves paths with parentheses without injecting ^', () => {
		// Regression: a previous fix prepended ^ to ( and ), which broke
		// resolution of paths like `C:\\Program Files (x86)\\nodejs\\npm.cmd`
		// because ^ is literal inside cmd.exe double quotes.
		assert.strictEqual(
			escapeCmdArg('C:\\Program Files (x86)\\nodejs\\npm.cmd'),
			'"C:\\Program Files (x86)\\nodejs\\npm.cmd"',
		);
	});

	test('neutralizes cmd.exe metacharacters inside quotes (CVE-2024-27980)', () => {
		// Vector 1: arg containing & must not break out of quotes.
		assert.strictEqual(escapeCmdArg('&calc.exe'), '"&calc.exe"');
		// Vector 2: workspace path expanded into an arg with & in directory name.
		assert.strictEqual(
			escapeCmdArg('C:\\work\\legitimate-repo&calc.exe'),
			'"C:\\work\\legitimate-repo&calc.exe"',
		);
		// Other metacharacters that are literal inside cmd double quotes.
		assert.strictEqual(escapeCmdArg('a|b'), '"a|b"');
		assert.strictEqual(escapeCmdArg('a<b>c'), '"a<b>c"');
		assert.strictEqual(escapeCmdArg('(group)'), '"(group)"');
		assert.strictEqual(escapeCmdArg('^carat'), '"^carat"');
	});

	test('does not add stray ^ to argument values', () => {
		// Regression: a previous fix wrote `"^&calc.exe"`, leaving a literal ^
		// in the value the spawned program received.
		assert.ok(
			!escapeCmdArg('&calc.exe').includes('^'),
			'cmd metachars must not be prefixed with ^ inside quotes',
		);
	});

	test('doubles embedded double quotes (cmd.exe convention)', () => {
		// Embedded `"` must become `""` so cmd.exe stays in quoted state and
		// any metacharacter that follows cannot be interpreted as an operator.
		assert.strictEqual(escapeCmdArg('a"b'), '"a""b"');
		assert.strictEqual(escapeCmdArg('"&calc"'), '"""&calc"""');
		// After replacement, the number of `"` in the wrapped output must be
		// even so cmd.exe's quote-state toggling never leaves a metacharacter
		// outside a quoted region.
		for (const input of ['"', '""', 'a"b', '"&calc"', 'a"&calc']) {
			const out = escapeCmdArg(input);
			const quoteCount = (out.match(/"/g) || []).length;
			assert.strictEqual(quoteCount % 2, 0, `quote count must be even for ${JSON.stringify(input)} -> ${out}`);
		}
	});
});
