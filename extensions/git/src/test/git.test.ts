/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import { GitStatusParser, parseGitCommits, parseGitmodules, parseLsTree, parseLsFiles, parseGitRemotes, parseCoAuthors, parseGitBlame, parseRefs, parseLsRemote, parseGitStashes, objectIdRegex } from '../git';
import * as assert from 'assert';
import { splitInChunks } from '../util';
import { RefType } from '../api/git.constants';

suite('git', () => {
	suite('GitStatusParser', () => {
		test('empty parser', () => {
			const parser = new GitStatusParser();
			assert.deepStrictEqual(parser.status, []);
		});

		test('empty parser 2', () => {
			const parser = new GitStatusParser();
			parser.update('');
			assert.deepStrictEqual(parser.status, []);
		});

		test('simple', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0');
			assert.deepStrictEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('simple 2', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0');
			parser.update('?? file2.txt\0');
			parser.update('?? file3.txt\0');
			assert.deepStrictEqual(parser.status, [
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
			assert.deepStrictEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('combined', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0?? file2.txt\0?? file3.txt\0');
			assert.deepStrictEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('split 1', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0?? file2');
			parser.update('.txt\0?? file3.txt\0');
			assert.deepStrictEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('split 2', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt');
			parser.update('\0?? file2.txt\0?? file3.txt\0');
			assert.deepStrictEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('split 3', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0?? file2.txt\0?? file3.txt');
			parser.update('\0');
			assert.deepStrictEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('rename', () => {
			const parser = new GitStatusParser();
			parser.update('R  newfile.txt\0file.txt\0?? file2.txt\0?? file3.txt\0');
			assert.deepStrictEqual(parser.status, [
				{ path: 'file.txt', rename: 'newfile.txt', x: 'R', y: ' ' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('rename split', () => {
			const parser = new GitStatusParser();
			parser.update('R  newfile.txt\0fil');
			parser.update('e.txt\0?? file2.txt\0?? file3.txt\0');
			assert.deepStrictEqual(parser.status, [
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
			assert.deepStrictEqual(parser.status, [
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file.txt', rename: 'newfile.txt', x: 'R', y: ' ' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});
	});

	suite('parseGitmodules', () => {
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
	});

	suite('parseGitRemotes', () => {
		test('empty', () => {
			assert.deepStrictEqual(parseGitRemotes(''), []);
		});

		test('single remote', () => {
			const sample = `[remote "origin"]
	url = https://github.com/microsoft/vscode.git
	fetch = +refs/heads/*:refs/remotes/origin/*
`;

			assert.deepStrictEqual(parseGitRemotes(sample), [
				{ name: 'origin', fetchUrl: 'https://github.com/microsoft/vscode.git', pushUrl: 'https://github.com/microsoft/vscode.git', isReadOnly: false }
			]);
		});

		test('single remote (multiple urls)', () => {
			const sample = `[remote "origin"]
	url = https://github.com/microsoft/vscode.git
	url = https://github.com/microsoft/vscode2.git
	fetch = +refs/heads/*:refs/remotes/origin/*
`;

			assert.deepStrictEqual(parseGitRemotes(sample), [
				{ name: 'origin', fetchUrl: 'https://github.com/microsoft/vscode.git', pushUrl: 'https://github.com/microsoft/vscode.git', isReadOnly: false }
			]);
		});

		test('multiple remotes', () => {
			const sample = `[remote "origin"]
	url = https://github.com/microsoft/vscode.git
	pushurl = https://github.com/microsoft/vscode1.git
	fetch = +refs/heads/*:refs/remotes/origin/*
[remote "remote2"]
	url = https://github.com/microsoft/vscode2.git
	fetch = +refs/heads/*:refs/remotes/origin/*
`;

			assert.deepStrictEqual(parseGitRemotes(sample), [
				{ name: 'origin', fetchUrl: 'https://github.com/microsoft/vscode.git', pushUrl: 'https://github.com/microsoft/vscode1.git', isReadOnly: false },
				{ name: 'remote2', fetchUrl: 'https://github.com/microsoft/vscode2.git', pushUrl: 'https://github.com/microsoft/vscode2.git', isReadOnly: false }
			]);
		});

		test('remotes (white space)', () => {
			const sample = ` [remote "origin"]
	url  =  https://github.com/microsoft/vscode.git
	pushurl=https://github.com/microsoft/vscode1.git
	fetch = +refs/heads/*:refs/remotes/origin/*
[ remote"remote2"]
	url = https://github.com/microsoft/vscode2.git
	fetch = +refs/heads/*:refs/remotes/origin/*
`;

			assert.deepStrictEqual(parseGitRemotes(sample), [
				{ name: 'origin', fetchUrl: 'https://github.com/microsoft/vscode.git', pushUrl: 'https://github.com/microsoft/vscode1.git', isReadOnly: false },
				{ name: 'remote2', fetchUrl: 'https://github.com/microsoft/vscode2.git', pushUrl: 'https://github.com/microsoft/vscode2.git', isReadOnly: false }
			]);
		});

		test('remotes (invalid section)', () => {
			const sample = `[remote "origin"
	url = https://github.com/microsoft/vscode.git
	pushurl = https://github.com/microsoft/vscode1.git
	fetch = +refs/heads/*:refs/remotes/origin/*
`;

			assert.deepStrictEqual(parseGitRemotes(sample), []);
		});
	});

	suite('parseGitCommit', () => {
		test('single parent commit', function () {
			const GIT_OUTPUT_SINGLE_PARENT =
				'52c293a05038d865604c2284aa8698bd087915a1\n' +
				'John Doe\n' +
				'john.doe@mail.com\n' +
				'1580811030\n' +
				'1580811031\n' +
				'8e5a374372b8393906c7e380dbb09349c5385554\n' +
				'main,branch\n' +
				'This is a commit message.\x00';

			assert.deepStrictEqual(parseGitCommits(GIT_OUTPUT_SINGLE_PARENT), [{
				hash: '52c293a05038d865604c2284aa8698bd087915a1',
				message: 'This is a commit message.',
				parents: ['8e5a374372b8393906c7e380dbb09349c5385554'],
				authorDate: new Date(1580811030000),
				authorName: 'John Doe',
				authorEmail: 'john.doe@mail.com',
				commitDate: new Date(1580811031000),
				refNames: ['main', 'branch'],
				shortStat: undefined,
				coAuthors: []
			}]);
		});

		test('multiple parent commits', function () {
			const GIT_OUTPUT_MULTIPLE_PARENTS =
				'52c293a05038d865604c2284aa8698bd087915a1\n' +
				'John Doe\n' +
				'john.doe@mail.com\n' +
				'1580811030\n' +
				'1580811031\n' +
				'8e5a374372b8393906c7e380dbb09349c5385554 df27d8c75b129ab9b178b386077da2822101b217\n' +
				'main\n' +
				'This is a commit message.\x00';

			assert.deepStrictEqual(parseGitCommits(GIT_OUTPUT_MULTIPLE_PARENTS), [{
				hash: '52c293a05038d865604c2284aa8698bd087915a1',
				message: 'This is a commit message.',
				parents: ['8e5a374372b8393906c7e380dbb09349c5385554', 'df27d8c75b129ab9b178b386077da2822101b217'],
				authorDate: new Date(1580811030000),
				authorName: 'John Doe',
				authorEmail: 'john.doe@mail.com',
				commitDate: new Date(1580811031000),
				refNames: ['main'],
				shortStat: undefined,
				coAuthors: []
			}]);
		});

		test('no parent commits', function () {
			const GIT_OUTPUT_NO_PARENTS =
				'52c293a05038d865604c2284aa8698bd087915a1\n' +
				'John Doe\n' +
				'john.doe@mail.com\n' +
				'1580811030\n' +
				'1580811031\n' +
				'\n' +
				'main\n' +
				'This is a commit message.\x00';

			assert.deepStrictEqual(parseGitCommits(GIT_OUTPUT_NO_PARENTS), [{
				hash: '52c293a05038d865604c2284aa8698bd087915a1',
				message: 'This is a commit message.',
				parents: [],
				authorDate: new Date(1580811030000),
				authorName: 'John Doe',
				authorEmail: 'john.doe@mail.com',
				commitDate: new Date(1580811031000),
				refNames: ['main'],
				shortStat: undefined,
				coAuthors: []
			}]);
		});

		test('commit with shortstat', function () {
			const GIT_OUTPUT_SINGLE_PARENT =
				'52c293a05038d865604c2284aa8698bd087915a1\n' +
				'John Doe\n' +
				'john.doe@mail.com\n' +
				'1580811030\n' +
				'1580811031\n' +
				'8e5a374372b8393906c7e380dbb09349c5385554\n' +
				'main,branch\n' +
				'This is a commit message.\x00\n' +
				' 1 file changed, 2 insertions(+), 3 deletion(-)';

			assert.deepStrictEqual(parseGitCommits(GIT_OUTPUT_SINGLE_PARENT), [{
				hash: '52c293a05038d865604c2284aa8698bd087915a1',
				message: 'This is a commit message.',
				parents: ['8e5a374372b8393906c7e380dbb09349c5385554'],
				authorDate: new Date(1580811030000),
				authorName: 'John Doe',
				authorEmail: 'john.doe@mail.com',
				commitDate: new Date(1580811031000),
				refNames: ['main', 'branch'],
				shortStat: {
					deletions: 3,
					files: 1,
					insertions: 2
				},
				coAuthors: []
			}]);
		});

		test('commit with shortstat (no insertions)', function () {
			const GIT_OUTPUT_SINGLE_PARENT =
				'52c293a05038d865604c2284aa8698bd087915a1\n' +
				'John Doe\n' +
				'john.doe@mail.com\n' +
				'1580811030\n' +
				'1580811031\n' +
				'8e5a374372b8393906c7e380dbb09349c5385554\n' +
				'main,branch\n' +
				'This is a commit message.\x00\n' +
				' 1 file changed, 3 deletion(-)';

			assert.deepStrictEqual(parseGitCommits(GIT_OUTPUT_SINGLE_PARENT), [{
				hash: '52c293a05038d865604c2284aa8698bd087915a1',
				message: 'This is a commit message.',
				parents: ['8e5a374372b8393906c7e380dbb09349c5385554'],
				authorDate: new Date(1580811030000),
				authorName: 'John Doe',
				authorEmail: 'john.doe@mail.com',
				commitDate: new Date(1580811031000),
				refNames: ['main', 'branch'],
				shortStat: {
					deletions: 3,
					files: 1,
					insertions: 0
				},
				coAuthors: []
			}]);
		});

		test('commit with shortstat (no deletions)', function () {
			const GIT_OUTPUT_SINGLE_PARENT =
				'52c293a05038d865604c2284aa8698bd087915a1\n' +
				'John Doe\n' +
				'john.doe@mail.com\n' +
				'1580811030\n' +
				'1580811031\n' +
				'8e5a374372b8393906c7e380dbb09349c5385554\n' +
				'main,branch\n' +
				'This is a commit message.\x00\n' +
				' 1 file changed, 2 insertions(+)';

			assert.deepStrictEqual(parseGitCommits(GIT_OUTPUT_SINGLE_PARENT), [{
				hash: '52c293a05038d865604c2284aa8698bd087915a1',
				message: 'This is a commit message.',
				parents: ['8e5a374372b8393906c7e380dbb09349c5385554'],
				authorDate: new Date(1580811030000),
				authorName: 'John Doe',
				authorEmail: 'john.doe@mail.com',
				commitDate: new Date(1580811031000),
				refNames: ['main', 'branch'],
				shortStat: {
					deletions: 0,
					files: 1,
					insertions: 2
				},
				coAuthors: []
			}]);
		});

		test('commit list', function () {
			const GIT_OUTPUT_SINGLE_PARENT =
				'52c293a05038d865604c2284aa8698bd087915a1\n' +
				'John Doe\n' +
				'john.doe@mail.com\n' +
				'1580811030\n' +
				'1580811031\n' +
				'8e5a374372b8393906c7e380dbb09349c5385554\n' +
				'main,branch\n' +
				'This is a commit message.\x00\n' +
				'52c293a05038d865604c2284aa8698bd087915a2\n' +
				'Jane Doe\n' +
				'jane.doe@mail.com\n' +
				'1580811032\n' +
				'1580811033\n' +
				'8e5a374372b8393906c7e380dbb09349c5385555\n' +
				'main,branch\n' +
				'This is another commit message.\x00';

			assert.deepStrictEqual(parseGitCommits(GIT_OUTPUT_SINGLE_PARENT), [
				{
					hash: '52c293a05038d865604c2284aa8698bd087915a1',
					message: 'This is a commit message.',
					parents: ['8e5a374372b8393906c7e380dbb09349c5385554'],
					authorDate: new Date(1580811030000),
					authorName: 'John Doe',
					authorEmail: 'john.doe@mail.com',
					commitDate: new Date(1580811031000),
					refNames: ['main', 'branch'],
					shortStat: undefined,
					coAuthors: []
				},
				{
					hash: '52c293a05038d865604c2284aa8698bd087915a2',
					message: 'This is another commit message.',
					parents: ['8e5a374372b8393906c7e380dbb09349c5385555'],
					authorDate: new Date(1580811032000),
					authorName: 'Jane Doe',
					authorEmail: 'jane.doe@mail.com',
					commitDate: new Date(1580811033000),
					refNames: ['main', 'branch'],
					shortStat: undefined,
					coAuthors: []
				},
			]);
		});

		test('commit list with shortstat', function () {
			const GIT_OUTPUT_SINGLE_PARENT = '52c293a05038d865604c2284aa8698bd087915a1\n' +
				'John Doe\n' +
				'john.doe@mail.com\n' +
				'1580811030\n' +
				'1580811031\n' +
				'8e5a374372b8393906c7e380dbb09349c5385554\n' +
				'main,branch\n' +
				'This is a commit message.\x00\n' +
				' 5 file changed, 12 insertions(+), 13 deletion(-)\n' +
				'52c293a05038d865604c2284aa8698bd087915a2\n' +
				'Jane Doe\n' +
				'jane.doe@mail.com\n' +
				'1580811032\n' +
				'1580811033\n' +
				'8e5a374372b8393906c7e380dbb09349c5385555\n' +
				'main,branch\n' +
				'This is another commit message.\x00\n' +
				' 6 file changed, 22 insertions(+), 23 deletion(-)';

			assert.deepStrictEqual(parseGitCommits(GIT_OUTPUT_SINGLE_PARENT), [{
				hash: '52c293a05038d865604c2284aa8698bd087915a1',
				message: 'This is a commit message.',
				parents: ['8e5a374372b8393906c7e380dbb09349c5385554'],
				authorDate: new Date(1580811030000),
				authorName: 'John Doe',
				authorEmail: 'john.doe@mail.com',
				commitDate: new Date(1580811031000),
				refNames: ['main', 'branch'],
				shortStat: {
					deletions: 13,
					files: 5,
					insertions: 12
				},
				coAuthors: []
			},
			{
				hash: '52c293a05038d865604c2284aa8698bd087915a2',
				message: 'This is another commit message.',
				parents: ['8e5a374372b8393906c7e380dbb09349c5385555'],
				authorDate: new Date(1580811032000),
				authorName: 'Jane Doe',
				authorEmail: 'jane.doe@mail.com',
				commitDate: new Date(1580811033000),
				refNames: ['main', 'branch'],
				shortStat: {
					deletions: 23,
					files: 6,
					insertions: 22
				},
				coAuthors: []
			}]);
		});

		test('SHA-256 hash commit', function () {
			const GIT_OUTPUT_SINGLE_PARENT =
				'9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098\n' +
				'John Doe\n' +
				'john.doe@mail.com\n' +
				'1580811030\n' +
				'1580811031\n' +
				'b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22\n' +
				'main,branch\n' +
				'This is a commit message.\x00';

			assert.deepStrictEqual(parseGitCommits(GIT_OUTPUT_SINGLE_PARENT), [{
				hash: '9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098',
				message: 'This is a commit message.',
				parents: ['b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22'],
				authorDate: new Date(1580811030000),
				authorName: 'John Doe',
				authorEmail: 'john.doe@mail.com',
				commitDate: new Date(1580811031000),
				refNames: ['main', 'branch'],
				shortStat: undefined,
				coAuthors: []
			}]);
		});
	});

	suite('parseLsTree', function () {
		test('sample', function () {
			const input = `040000 tree 0274a81f8ee9ca3669295dc40f510bd2021d0043       -	.vscode
100644 blob 1d487c1817262e4f20efbfa1d04c18f51b0046f6  491570	Screen Shot 2018-06-01 at 14.48.05.png
100644 blob 686c16e4f019b734655a2576ce8b98749a9ffdb9  764420	Screen Shot 2018-06-07 at 20.04.59.png
100644 blob 257cc5642cb1a054f08cc83f2d943e56fd3ebe99       4	boom.txt
100644 blob 86dc360dd25f13fa50ffdc8259e9653921f4f2b7      11	boomcaboom.txt
100644 blob a68b14060589b16d7ac75f67b905c918c03c06eb      24	file.js
100644 blob f7bcfb05af46850d780f88c069edcd57481d822d     201	file.md
100644 blob ab8b86114a051f6490f1ec5e3141b9a632fb46b5       8	hello.js
100644 blob 257cc5642cb1a054f08cc83f2d943e56fd3ebe99       4	what.js
100644 blob be859e3f412fa86513cd8bebe8189d1ea1a3e46d      24	what.txt
100644 blob 56ec42c9dc6fcf4534788f0fe34b36e09f37d085  261186	what.txt2`;

			const output = parseLsTree(input);

			assert.deepStrictEqual(output, [
				{ mode: '040000', type: 'tree', object: '0274a81f8ee9ca3669295dc40f510bd2021d0043', size: '-', file: '.vscode' },
				{ mode: '100644', type: 'blob', object: '1d487c1817262e4f20efbfa1d04c18f51b0046f6', size: '491570', file: 'Screen Shot 2018-06-01 at 14.48.05.png' },
				{ mode: '100644', type: 'blob', object: '686c16e4f019b734655a2576ce8b98749a9ffdb9', size: '764420', file: 'Screen Shot 2018-06-07 at 20.04.59.png' },
				{ mode: '100644', type: 'blob', object: '257cc5642cb1a054f08cc83f2d943e56fd3ebe99', size: '4', file: 'boom.txt' },
				{ mode: '100644', type: 'blob', object: '86dc360dd25f13fa50ffdc8259e9653921f4f2b7', size: '11', file: 'boomcaboom.txt' },
				{ mode: '100644', type: 'blob', object: 'a68b14060589b16d7ac75f67b905c918c03c06eb', size: '24', file: 'file.js' },
				{ mode: '100644', type: 'blob', object: 'f7bcfb05af46850d780f88c069edcd57481d822d', size: '201', file: 'file.md' },
				{ mode: '100644', type: 'blob', object: 'ab8b86114a051f6490f1ec5e3141b9a632fb46b5', size: '8', file: 'hello.js' },
				{ mode: '100644', type: 'blob', object: '257cc5642cb1a054f08cc83f2d943e56fd3ebe99', size: '4', file: 'what.js' },
				{ mode: '100644', type: 'blob', object: 'be859e3f412fa86513cd8bebe8189d1ea1a3e46d', size: '24', file: 'what.txt' },
				{ mode: '100644', type: 'blob', object: '56ec42c9dc6fcf4534788f0fe34b36e09f37d085', size: '261186', file: 'what.txt2' }
			]);
		});

		test('SHA-256 hashes', function () {
			const input = `040000 tree b97f4f0b6769e62fe152d5093cdb6a1026325d2d569e9985f639b4bb69081810       -	.vscode
100644 blob a9ae1893d6ccafabb2718269c180be0dc3924a7480f5040f6fc28ba7a002f3b7  491570	Screen Shot 2018-06-01 at 14.48.05.png
100644 blob 0667e7cdcbf2caa1d3a5dd708cd90fe08c778b20d01a10e28c5eb72b0b54026e  764420	Screen Shot 2018-06-07 at 20.04.59.png
100644 blob 78ba54c83767be0aa91a2dd8cda6c5d92a3830971099967eaf5931a7532534e1       4	boom.txt
100644 blob c048ab7ba31f244f98500c3bf7feb7305a460b1bdba0c7e26a993807a152f77a      11	boomcaboom.txt
100644 blob 3559a563123a2bebf459117d2e66aa9c319f8df8bffa548a7ddc5caf1d9896c1      24	file.js
100644 blob 59e884c6dbd018ea43e694e821f96a5b08226b5ef345e65e81e665cc44c59d95     201	file.md
100644 blob f868215c351673fcd5d26414b144a100f986c63e3a0f2822eee1566e766f95ba       8	hello.js
100644 blob 78ba54c83767be0aa91a2dd8cda6c5d92a3830971099967eaf5931a7532534e1       4	what.js
100644 blob 20bf819186af6d79b888c89fd94a010f532544a7d3cd6797fc4344c062e0a303      24	what.txt
100644 blob dcc9c94a5810b1ac3f3ae52937f7dab8087e205b23b1cdc745308e1227b6713c  261186	what.txt2`;

			const output = parseLsTree(input);

			assert.deepStrictEqual(output, [
				{ mode: '040000', type: 'tree', object: 'b97f4f0b6769e62fe152d5093cdb6a1026325d2d569e9985f639b4bb69081810', size: '-', file: '.vscode' },
				{ mode: '100644', type: 'blob', object: 'a9ae1893d6ccafabb2718269c180be0dc3924a7480f5040f6fc28ba7a002f3b7', size: '491570', file: 'Screen Shot 2018-06-01 at 14.48.05.png' },
				{ mode: '100644', type: 'blob', object: '0667e7cdcbf2caa1d3a5dd708cd90fe08c778b20d01a10e28c5eb72b0b54026e', size: '764420', file: 'Screen Shot 2018-06-07 at 20.04.59.png' },
				{ mode: '100644', type: 'blob', object: '78ba54c83767be0aa91a2dd8cda6c5d92a3830971099967eaf5931a7532534e1', size: '4', file: 'boom.txt' },
				{ mode: '100644', type: 'blob', object: 'c048ab7ba31f244f98500c3bf7feb7305a460b1bdba0c7e26a993807a152f77a', size: '11', file: 'boomcaboom.txt' },
				{ mode: '100644', type: 'blob', object: '3559a563123a2bebf459117d2e66aa9c319f8df8bffa548a7ddc5caf1d9896c1', size: '24', file: 'file.js' },
				{ mode: '100644', type: 'blob', object: '59e884c6dbd018ea43e694e821f96a5b08226b5ef345e65e81e665cc44c59d95', size: '201', file: 'file.md' },
				{ mode: '100644', type: 'blob', object: 'f868215c351673fcd5d26414b144a100f986c63e3a0f2822eee1566e766f95ba', size: '8', file: 'hello.js' },
				{ mode: '100644', type: 'blob', object: '78ba54c83767be0aa91a2dd8cda6c5d92a3830971099967eaf5931a7532534e1', size: '4', file: 'what.js' },
				{ mode: '100644', type: 'blob', object: '20bf819186af6d79b888c89fd94a010f532544a7d3cd6797fc4344c062e0a303', size: '24', file: 'what.txt' },
				{ mode: '100644', type: 'blob', object: 'dcc9c94a5810b1ac3f3ae52937f7dab8087e205b23b1cdc745308e1227b6713c', size: '261186', file: 'what.txt2' }
			]);
		});
	});

	suite('parseLsFiles', function () {
		test('sample', function () {
			const input = `100644 7a73a41bfdf76d6f793007240d80983a52f15f97 0	.vscode/settings.json
100644 1d487c1817262e4f20efbfa1d04c18f51b0046f6 0	Screen Shot 2018-06-01 at 14.48.05.png
100644 686c16e4f019b734655a2576ce8b98749a9ffdb9 0	Screen Shot 2018-06-07 at 20.04.59.png
100644 257cc5642cb1a054f08cc83f2d943e56fd3ebe99 0	boom.txt
100644 86dc360dd25f13fa50ffdc8259e9653921f4f2b7 0	boomcaboom.txt
100644 a68b14060589b16d7ac75f67b905c918c03c06eb 0	file.js
100644 f7bcfb05af46850d780f88c069edcd57481d822d 0	file.md
100644 ab8b86114a051f6490f1ec5e3141b9a632fb46b5 0	hello.js
100644 257cc5642cb1a054f08cc83f2d943e56fd3ebe99 0	what.js
100644 be859e3f412fa86513cd8bebe8189d1ea1a3e46d 0	what.txt
100644 56ec42c9dc6fcf4534788f0fe34b36e09f37d085 0	what.txt2`;

			const output = parseLsFiles(input);

			assert.deepStrictEqual(output, [
				{ mode: '100644', object: '7a73a41bfdf76d6f793007240d80983a52f15f97', stage: '0', file: '.vscode/settings.json' },
				{ mode: '100644', object: '1d487c1817262e4f20efbfa1d04c18f51b0046f6', stage: '0', file: 'Screen Shot 2018-06-01 at 14.48.05.png' },
				{ mode: '100644', object: '686c16e4f019b734655a2576ce8b98749a9ffdb9', stage: '0', file: 'Screen Shot 2018-06-07 at 20.04.59.png' },
				{ mode: '100644', object: '257cc5642cb1a054f08cc83f2d943e56fd3ebe99', stage: '0', file: 'boom.txt' },
				{ mode: '100644', object: '86dc360dd25f13fa50ffdc8259e9653921f4f2b7', stage: '0', file: 'boomcaboom.txt' },
				{ mode: '100644', object: 'a68b14060589b16d7ac75f67b905c918c03c06eb', stage: '0', file: 'file.js' },
				{ mode: '100644', object: 'f7bcfb05af46850d780f88c069edcd57481d822d', stage: '0', file: 'file.md' },
				{ mode: '100644', object: 'ab8b86114a051f6490f1ec5e3141b9a632fb46b5', stage: '0', file: 'hello.js' },
				{ mode: '100644', object: '257cc5642cb1a054f08cc83f2d943e56fd3ebe99', stage: '0', file: 'what.js' },
				{ mode: '100644', object: 'be859e3f412fa86513cd8bebe8189d1ea1a3e46d', stage: '0', file: 'what.txt' },
				{ mode: '100644', object: '56ec42c9dc6fcf4534788f0fe34b36e09f37d085', stage: '0', file: 'what.txt2' },
			]);
		});
	});

	suite('objectIdRegex', () => {
		test('matches full object ids', function () {
			assert.ok(objectIdRegex.test('9505cacb7c710ed17125fcc6cb3669e8ddca6c8c'));
			assert.ok(objectIdRegex.test('9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098'));
			assert.ok(objectIdRegex.test('9505CACB7C710ED17125FCC6CB3669E8DDCA6C8CD8AF6A31F6B3CD64604C3098'));
		});

		test('rejects anything that is not a full object id', function () {
			assert.ok(!objectIdRegex.test(''));
			assert.ok(!objectIdRegex.test('HEAD'));
			assert.ok(!objectIdRegex.test('9505cac'));
			// The alternation must not escape the anchors
			assert.ok(!objectIdRegex.test('9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098-junk'));
			assert.ok(!objectIdRegex.test('junk-9505cacb7c710ed17125fcc6cb3669e8ddca6c8c'));
			// A length between the two valid ones is not a valid object id
			assert.ok(!objectIdRegex.test('9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c30'));
			assert.ok(!objectIdRegex.test('9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098a'));
		});
	});

	suite('parseGitBlame', () => {
		const blameOutput = (hash1: string, hash2: string) => [
			`${hash1} 1 1 2`,
			'author John Doe',
			'author-mail <john.doe@mail.com>',
			'author-time 1580811030',
			'author-tz +0100',
			'committer John Doe',
			'committer-mail <john.doe@mail.com>',
			'committer-time 1580811031',
			'committer-tz +0100',
			'summary This is a commit message.',
			'boundary',
			'filename file.txt',
			`${hash2} 3 3 1`,
			'author Jane Roe',
			'author-mail <jane.roe@mail.com>',
			'author-time 1580811040',
			'author-tz +0100',
			'committer Jane Roe',
			'committer-mail <jane.roe@mail.com>',
			'committer-time 1580811041',
			'committer-tz +0100',
			'summary Another commit message.',
			`previous ${hash1} file.txt`,
			'filename file.txt',
		].join('\n');

		test('SHA-1 hashes', function () {
			assert.deepStrictEqual(parseGitBlame(blameOutput(
				'9505cacb7c710ed17125fcc6cb3669e8ddca6c8c',
				'5b3f2c9de1e1a5f57c1f5b4c7d9c4f9f0a1b2c3d'
			)), [{
				hash: '9505cacb7c710ed17125fcc6cb3669e8ddca6c8c',
				authorName: 'John Doe',
				authorEmail: 'john.doe@mail.com',
				authorDate: 1580811030000,
				subject: 'This is a commit message.',
				ranges: [{ startLineNumber: 1, endLineNumber: 2 }]
			}, {
				hash: '5b3f2c9de1e1a5f57c1f5b4c7d9c4f9f0a1b2c3d',
				authorName: 'Jane Roe',
				authorEmail: 'jane.roe@mail.com',
				authorDate: 1580811040000,
				subject: 'Another commit message.',
				ranges: [{ startLineNumber: 3, endLineNumber: 3 }]
			}]);
		});

		// The object id is not followed by a delimiter in the pattern that matches
		// it, so a SHA-256 hash is easily matched as only its first 40 characters.
		test('SHA-256 hashes are not truncated', function () {
			assert.deepStrictEqual(parseGitBlame(blameOutput(
				'9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098',
				'b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22'
			)), [{
				hash: '9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098',
				authorName: 'John Doe',
				authorEmail: 'john.doe@mail.com',
				authorDate: 1580811030000,
				subject: 'This is a commit message.',
				ranges: [{ startLineNumber: 1, endLineNumber: 2 }]
			}, {
				hash: 'b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22',
				authorName: 'Jane Roe',
				authorEmail: 'jane.roe@mail.com',
				authorDate: 1580811040000,
				subject: 'Another commit message.',
				ranges: [{ startLineNumber: 3, endLineNumber: 3 }]
			}]);
		});

		// A commit that covers more than one range is emitted again as a bare
		// header line followed by `filename`, and the ranges are merged by hash.
		test('SHA-256 hashes across multiple ranges', function () {
			const output = [
				'd483d3fdacc369559e9ae8a04a752590a350f137ada78ad31fb88c14442f1e05 2 2 1',
				'author Jane Roe',
				'author-mail <jane.roe@mail.com>',
				'author-time 1580811040',
				'author-tz +0100',
				'summary Middle change',
				'filename file.txt',
				'3bb440793cf7b136c503d864a0473d3eb6ace7f2e9a7a5c9de98ca46a8b799f8 1 1 1',
				'author John Doe',
				'author-mail <john.doe@mail.com>',
				'author-time 1580811030',
				'author-tz +0100',
				'summary Base commit',
				'filename file.txt',
				'3bb440793cf7b136c503d864a0473d3eb6ace7f2e9a7a5c9de98ca46a8b799f8 3 3 3',
				'filename file.txt',
			].join('\n');

			assert.deepStrictEqual(parseGitBlame(output), [{
				hash: 'd483d3fdacc369559e9ae8a04a752590a350f137ada78ad31fb88c14442f1e05',
				authorName: 'Jane Roe',
				authorEmail: 'jane.roe@mail.com',
				authorDate: 1580811040000,
				subject: 'Middle change',
				ranges: [{ startLineNumber: 2, endLineNumber: 2 }]
			}, {
				hash: '3bb440793cf7b136c503d864a0473d3eb6ace7f2e9a7a5c9de98ca46a8b799f8',
				authorName: 'John Doe',
				authorEmail: 'john.doe@mail.com',
				authorDate: 1580811030000,
				subject: 'Base commit',
				ranges: [
					{ startLineNumber: 1, endLineNumber: 1 },
					{ startLineNumber: 3, endLineNumber: 5 }
				]
			}]);
		});
	});

	suite('parseRefs', () => {
		test('SHA-1 hashes', function () {
			const input = [
				'refs/heads/main\x009505cacb7c710ed17125fcc6cb3669e8ddca6c8c\x00',
				'refs/tags/v1.0\x005b3f2c9de1e1a5f57c1f5b4c7d9c4f9f0a1b2c3d\x001c6b1a1a1e5ab3d05e5ee2e7d1e0b8fd8d8f3a0d',
			].join('\n');

			assert.deepStrictEqual(parseRefs(input), [{
				name: 'main',
				commit: '9505cacb7c710ed17125fcc6cb3669e8ddca6c8c',
				commitDetails: undefined,
				ahead: undefined,
				behind: undefined,
				type: RefType.Head
			}, {
				name: 'v1.0',
				commit: '1c6b1a1a1e5ab3d05e5ee2e7d1e0b8fd8d8f3a0d',
				commitDetails: undefined,
				type: RefType.Tag
			}]);
		});

		test('SHA-256 hashes', function () {
			const input = [
				'refs/heads/main\x009505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098\x00',
				'refs/remotes/origin/main\x009505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098\x00',
				// Annotated tag - the peeled object id is the commit the tag points at
				'refs/tags/v1.0\x001c6b1a1a1e5ab3d05e5ee2e7d1e0b8fd8d8f3a0d3b1a4c5e6f70819293a4b5c6\x00b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22',
				// Lightweight tag - no peeled object id
				'refs/tags/v0.9\x00b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22\x00',
			].join('\n');

			assert.deepStrictEqual(parseRefs(input), [{
				name: 'main',
				commit: '9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098',
				commitDetails: undefined,
				ahead: undefined,
				behind: undefined,
				type: RefType.Head
			}, {
				name: 'origin/main',
				remote: 'origin',
				commit: '9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098',
				commitDetails: undefined,
				type: RefType.RemoteHead
			}, {
				name: 'v1.0',
				commit: 'b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22',
				commitDetails: undefined,
				type: RefType.Tag
			}, {
				name: 'v0.9',
				commit: 'b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22',
				commitDetails: undefined,
				type: RefType.Tag
			}]);
		});

		test('SHA-256 hashes with commit details', function () {
			const input = 'refs/heads/main\x009505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098\x00\x00' +
				'b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22\x00\x00' +
				'John Doe\x00\x001580811030\x00\x00This is a commit message.\x00\x00[ahead 1, behind 2]';

			assert.deepStrictEqual(parseRefs(input), [{
				name: 'main',
				commit: '9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098',
				commitDetails: {
					hash: '9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098',
					message: 'This is a commit message.',
					parents: ['b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22'],
					authorName: 'John Doe',
					commitDate: new Date(1580811030000)
				},
				ahead: 1,
				behind: 2,
				type: RefType.Head
			}]);
		});
	});

	suite('parseLsRemote', () => {
		test('branches and tags', function () {
			const input = [
				'9505cacb7c710ed17125fcc6cb3669e8ddca6c8c\trefs/heads/main',
				'5b3f2c9de1e1a5f57c1f5b4c7d9c4f9f0a1b2c3d\trefs/tags/v1.0',
				// `ls-remote` also lists the peeled tag; the caller deduplicates these
				'1c6b1a1a1e5ab3d05e5ee2e7d1e0b8fd8d8f3a0d\trefs/tags/v1.0^{}',
				'',
			].join('\n');

			assert.deepStrictEqual(parseLsRemote(input), [{
				name: 'main',
				commit: '9505cacb7c710ed17125fcc6cb3669e8ddca6c8c',
				type: RefType.Head
			}, {
				name: 'v1.0',
				commit: '5b3f2c9de1e1a5f57c1f5b4c7d9c4f9f0a1b2c3d',
				type: RefType.Tag
			}, {
				name: 'v1.0^{}',
				commit: '1c6b1a1a1e5ab3d05e5ee2e7d1e0b8fd8d8f3a0d',
				type: RefType.Tag
			}]);
		});

		test('SHA-256 hashes', function () {
			const input = [
				'9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098\trefs/heads/main',
				'b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22\trefs/tags/v1.0',
				'1c6b1a1a1e5ab3d05e5ee2e7d1e0b8fd8d8f3a0d3b1a4c5e6f70819293a4b5c6\trefs/tags/v1.0^{}',
				'',
			].join('\n');

			assert.deepStrictEqual(parseLsRemote(input), [{
				name: 'main',
				commit: '9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098',
				type: RefType.Head
			}, {
				name: 'v1.0',
				commit: 'b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22',
				type: RefType.Tag
			}, {
				name: 'v1.0^{}',
				commit: '1c6b1a1a1e5ab3d05e5ee2e7d1e0b8fd8d8f3a0d3b1a4c5e6f70819293a4b5c6',
				type: RefType.Tag
			}]);
		});

		test('ignores lines that are not branches or tags', function () {
			const input = [
				'9505cacb7c710ed17125fcc6cb3669e8ddca6c8c\tHEAD',
				'5b3f2c9de1e1a5f57c1f5b4c7d9c4f9f0a1b2c3d\trefs/pull/1/head',
				'',
			].join('\n');

			assert.deepStrictEqual(parseLsRemote(input), []);
		});
	});

	suite('parseGitStashes', () => {
		// A stash created with an explicit message has no `WIP ` prefix
		test('SHA-1 hashes, explicit stash message', function () {
			const input = [
				'9505cacb7c710ed17125fcc6cb3669e8ddca6c8c',
				'5b3f2c9de1e1a5f57c1f5b4c7d9c4f9f0a1b2c3d',
				'stash@{1}',
				'On main: my saved work',
				'1580811030',
				'1580811031\x00',
			].join('\n');

			assert.deepStrictEqual(parseGitStashes(input), [{
				hash: '9505cacb7c710ed17125fcc6cb3669e8ddca6c8c',
				parents: ['5b3f2c9de1e1a5f57c1f5b4c7d9c4f9f0a1b2c3d'],
				index: 1,
				branchName: 'main',
				description: 'my saved work',
				authorDate: new Date(1580811030000),
				commitDate: new Date(1580811031000)
			}]);
		});

		test('SHA-256 hashes', function () {
			const input = [
				'9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098',
				'b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22',
				'stash@{0}',
				'WIP on main: 9505cac This is a commit message.',
				'1580811030',
				'1580811031\0',
			].join('\n');

			assert.deepStrictEqual(parseGitStashes(input), [{
				hash: '9505cacb7c710ed17125fcc6cb3669e8ddca6c8cd8af6a31f6b3cd64604c3098',
				parents: ['b9469a95e64ad83017429739bd95b527100cdfec700ac1fb15d3d7d1dfd6aa22'],
				index: 0,
				branchName: 'main',
				description: 'WIP (9505cac This is a commit message.)',
				authorDate: new Date(1580811030000),
				commitDate: new Date(1580811031000)
			}]);
		});
	});

	suite('parseCoAuthors', () => {
		test('no co-authors', function () {
			assert.deepStrictEqual(parseCoAuthors('This is a commit message.'), []);
		});

		test('single co-author', function () {
			assert.deepStrictEqual(
				parseCoAuthors('Fix bug\n\nCo-authored-by: Jane Doe <jane@example.com>'),
				[{ name: 'Jane Doe', email: 'jane@example.com' }]
			);
		});

		test('multiple co-authors', function () {
			assert.deepStrictEqual(
				parseCoAuthors('Fix bug\n\nCo-authored-by: Jane Doe <jane@example.com>\nCo-authored-by: Bob Smith <bob@example.com>'),
				[
					{ name: 'Jane Doe', email: 'jane@example.com' },
					{ name: 'Bob Smith', email: 'bob@example.com' }
				]
			);
		});

		test('case insensitive', function () {
			assert.deepStrictEqual(
				parseCoAuthors('Fix bug\n\nco-authored-by: Jane Doe <jane@example.com>'),
				[{ name: 'Jane Doe', email: 'jane@example.com' }]
			);
		});

		test('AI co-author (Copilot)', function () {
			assert.deepStrictEqual(
				parseCoAuthors('Fix bug\n\nCo-authored-by: Copilot <copilot@github.com>'),
				[{ name: 'Copilot', email: 'copilot@github.com' }]
			);
		});

		test('mixed with other trailers', function () {
			assert.deepStrictEqual(
				parseCoAuthors('Fix bug\n\nSigned-off-by: Admin <admin@corp.com>\nCo-authored-by: Jane Doe <jane@example.com>'),
				[{ name: 'Jane Doe', email: 'jane@example.com' }]
			);
		});
	});

	suite('splitInChunks', () => {
		test('unit tests', function () {
			assert.deepStrictEqual(
				[...splitInChunks(['hello', 'there', 'cool', 'stuff'], 6)],
				[['hello'], ['there'], ['cool'], ['stuff']]
			);

			assert.deepStrictEqual(
				[...splitInChunks(['hello', 'there', 'cool', 'stuff'], 10)],
				[['hello', 'there'], ['cool', 'stuff']]
			);

			assert.deepStrictEqual(
				[...splitInChunks(['hello', 'there', 'cool', 'stuff'], 12)],
				[['hello', 'there'], ['cool', 'stuff']]
			);

			assert.deepStrictEqual(
				[...splitInChunks(['hello', 'there', 'cool', 'stuff'], 14)],
				[['hello', 'there', 'cool'], ['stuff']]
			);

			assert.deepStrictEqual(
				[...splitInChunks(['hello', 'there', 'cool', 'stuff'], 2000)],
				[['hello', 'there', 'cool', 'stuff']]
			);

			assert.deepStrictEqual(
				[...splitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 1)],
				[['0'], ['01'], ['012'], ['0'], ['01'], ['012'], ['0'], ['01'], ['012']]
			);

			assert.deepStrictEqual(
				[...splitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 2)],
				[['0'], ['01'], ['012'], ['0'], ['01'], ['012'], ['0'], ['01'], ['012']]
			);

			assert.deepStrictEqual(
				[...splitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 3)],
				[['0', '01'], ['012'], ['0', '01'], ['012'], ['0', '01'], ['012']]
			);

			assert.deepStrictEqual(
				[...splitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 4)],
				[['0', '01'], ['012', '0'], ['01'], ['012', '0'], ['01'], ['012']]
			);

			assert.deepStrictEqual(
				[...splitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 5)],
				[['0', '01'], ['012', '0'], ['01', '012'], ['0', '01'], ['012']]
			);

			assert.deepStrictEqual(
				[...splitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 6)],
				[['0', '01', '012'], ['0', '01', '012'], ['0', '01', '012']]
			);

			assert.deepStrictEqual(
				[...splitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 7)],
				[['0', '01', '012', '0'], ['01', '012', '0'], ['01', '012']]
			);

			assert.deepStrictEqual(
				[...splitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 8)],
				[['0', '01', '012', '0'], ['01', '012', '0', '01'], ['012']]
			);

			assert.deepStrictEqual(
				[...splitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 9)],
				[['0', '01', '012', '0', '01'], ['012', '0', '01', '012']]
			);
		});
	});
});
