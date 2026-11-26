/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseGitmodules } from '../../common/gitmodules.js';

// The cases of the `parseGitmodules` tests of extensions/git/src/test/git.test.ts, which the parser mirrors.
suite('parseGitmodules', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty', () => {
		assert.deepStrictEqual(parseGitmodules(''), []);
	});

	test('sample', () => {
		const sample = `[submodule "deps/spdlog"]
	path = deps/spdlog
	url = https://github.com/gabime/spdlog.git
`;

		assert.deepStrictEqual(parseGitmodules(sample), [
			{ name: 'deps/spdlog', path: 'deps/spdlog', url: 'https://github.com/gabime/spdlog.git' }
		]);
	});

	test('big', () => {
		const sample = `[submodule "deps/spdlog"]
	path = deps/spdlog
	url = https://github.com/gabime/spdlog.git
[submodule "deps/spdlog2"]
	path = deps/spdlog2
	url = https://github.com/gabime/spdlog.git
[submodule "deps/spdlog3"]
	path = deps/spdlog3
	url = https://github.com/gabime/spdlog.git
[submodule "deps/spdlog4"]
	path = deps/spdlog4
	url = https://github.com/gabime/spdlog4.git
`;

		assert.deepStrictEqual(parseGitmodules(sample), [
			{ name: 'deps/spdlog', path: 'deps/spdlog', url: 'https://github.com/gabime/spdlog.git' },
			{ name: 'deps/spdlog2', path: 'deps/spdlog2', url: 'https://github.com/gabime/spdlog.git' },
			{ name: 'deps/spdlog3', path: 'deps/spdlog3', url: 'https://github.com/gabime/spdlog.git' },
			{ name: 'deps/spdlog4', path: 'deps/spdlog4', url: 'https://github.com/gabime/spdlog4.git' }
		]);
	});

	test('whitespace #74844', () => {
		const sample = `[submodule "deps/spdlog"]
	path = deps/spdlog
	url  = https://github.com/gabime/spdlog.git
`;

		assert.deepStrictEqual(parseGitmodules(sample), [
			{ name: 'deps/spdlog', path: 'deps/spdlog', url: 'https://github.com/gabime/spdlog.git' }
		]);
	});

	test('whitespace again #108371', () => {
		const sample = `[submodule "deps/spdlog"]
	path= deps/spdlog
	url=https://github.com/gabime/spdlog.git
`;

		assert.deepStrictEqual(parseGitmodules(sample), [
			{ name: 'deps/spdlog', path: 'deps/spdlog', url: 'https://github.com/gabime/spdlog.git' }
		]);
	});

	test('takes only submodule sections with a name, a path and a URL, and the first value of a key', () => {
		const sample = `path = outside
[core]
	path = core
	url = https://example.com/core.git
[submodule]
	path = unnamed
	url = https://example.com/unnamed.git
[submodule "no-url"]
	path = no-url
[submodule "quoted"]
	path = "deps/quoted"
	path = deps/second
	url = https://example.com/quoted.git
`;

		assert.deepStrictEqual(parseGitmodules(sample), [
			{ name: 'quoted', path: 'deps/quoted', url: 'https://example.com/quoted.git' }
		]);
	});
});
