/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'mocha';
import { Git, GitStatusParser, Repository, parseGitmodules } from '../git';
import * as assert from 'assert';
import * as sinon from 'sinon';

suite('git', () => {
	suite('GitStatusParser', () => {
		test('empty parser', () => {
			const parser = new GitStatusParser();
			assert.deepEqual(parser.status, []);
		});

		test('empty parser 2', () => {
			const parser = new GitStatusParser();
			parser.update('');
			assert.deepEqual(parser.status, []);
		});

		test('simple', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('simple 2', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0');
			parser.update('?? file2.txt\0');
			parser.update('?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('empty lines', () => {
			const parser = new GitStatusParser();
			parser.update('');
			parser.update('?? file.txt\0');
			parser.update('');
			parser.update('');
			parser.update('?? file2.txt\0');
			parser.update('');
			parser.update('?? file3.txt\0');
			parser.update('');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('combined', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0?? file2.txt\0?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('split 1', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0?? file2');
			parser.update('.txt\0?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('split 2', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt');
			parser.update('\0?? file2.txt\0?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('split 3', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0?? file2.txt\0?? file3.txt');
			parser.update('\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('rename', () => {
			const parser = new GitStatusParser();
			parser.update('R  newfile.txt\0file.txt\0?? file2.txt\0?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: 'newfile.txt', x: 'R', y: ' ' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('rename split', () => {
			const parser = new GitStatusParser();
			parser.update('R  newfile.txt\0fil');
			parser.update('e.txt\0?? file2.txt\0?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: 'newfile.txt', x: 'R', y: ' ' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('rename split 3', () => {
			const parser = new GitStatusParser();
			parser.update('?? file2.txt\0R  new');
			parser.update('file.txt\0fil');
			parser.update('e.txt\0?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file.txt', rename: 'newfile.txt', x: 'R', y: ' ' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});
	});

	suite('parseGitmodules', () => {
		test('empty', () => {
			assert.deepEqual(parseGitmodules(''), []);
		});

		test('sample', () => {
			const sample = `[submodule "deps/spdlog"]
	path = deps/spdlog
	url = https://github.com/gabime/spdlog.git
`;

			assert.deepEqual(parseGitmodules(sample), [
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

			assert.deepEqual(parseGitmodules(sample), [
				{ name: 'deps/spdlog', path: 'deps/spdlog', url: 'https://github.com/gabime/spdlog.git' },
				{ name: 'deps/spdlog2', path: 'deps/spdlog2', url: 'https://github.com/gabime/spdlog.git' },
				{ name: 'deps/spdlog3', path: 'deps/spdlog3', url: 'https://github.com/gabime/spdlog.git' },
				{ name: 'deps/spdlog4', path: 'deps/spdlog4', url: 'https://github.com/gabime/spdlog4.git' }
			]);
		});
	});

	suite('Repository', () => {
		test('get commit', async () => {
			const spawnOption = {};
			const gitOutput = `52c293a05038d865604c2284aa8698bd087915a1
This is a commit message.`;
			const git = sinon.createStubInstance(Git);
			git.exec = sinon.stub()
				.withArgs('REPOSITORY_ROOT', ['show', '-s', '--format=%H\n%B', 'REF'], spawnOption)
				.returns(Promise.resolve({stdout: gitOutput}));
			const repository = new Repository(git, 'REPOSITORY_ROOT');

			assert.deepEqual(await repository.getCommit('REF'), {
				hash: '52c293a05038d865604c2284aa8698bd087915a1',
				message: 'This is a commit message.'
			});
		});
	});
});