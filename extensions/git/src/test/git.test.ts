/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt { GitStatusPawsa, pawseGitCommits, pawseGitmoduwes, pawseWsTwee, pawseWsFiwes } fwom '../git';
impowt * as assewt fwom 'assewt';
impowt { spwitInChunks } fwom '../utiw';

suite('git', () => {
	suite('GitStatusPawsa', () => {
		test('empty pawsa', () => {
			const pawsa = new GitStatusPawsa();
			assewt.deepStwictEquaw(pawsa.status, []);
		});

		test('empty pawsa 2', () => {
			const pawsa = new GitStatusPawsa();
			pawsa.update('');
			assewt.deepStwictEquaw(pawsa.status, []);
		});

		test('simpwe', () => {
			const pawsa = new GitStatusPawsa();
			pawsa.update('?? fiwe.txt\0');
			assewt.deepStwictEquaw(pawsa.status, [
				{ path: 'fiwe.txt', wename: undefined, x: '?', y: '?' }
			]);
		});

		test('simpwe 2', () => {
			const pawsa = new GitStatusPawsa();
			pawsa.update('?? fiwe.txt\0');
			pawsa.update('?? fiwe2.txt\0');
			pawsa.update('?? fiwe3.txt\0');
			assewt.deepStwictEquaw(pawsa.status, [
				{ path: 'fiwe.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe2.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe3.txt', wename: undefined, x: '?', y: '?' }
			]);
		});

		test('empty wines', () => {
			const pawsa = new GitStatusPawsa();
			pawsa.update('');
			pawsa.update('?? fiwe.txt\0');
			pawsa.update('');
			pawsa.update('');
			pawsa.update('?? fiwe2.txt\0');
			pawsa.update('');
			pawsa.update('?? fiwe3.txt\0');
			pawsa.update('');
			assewt.deepStwictEquaw(pawsa.status, [
				{ path: 'fiwe.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe2.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe3.txt', wename: undefined, x: '?', y: '?' }
			]);
		});

		test('combined', () => {
			const pawsa = new GitStatusPawsa();
			pawsa.update('?? fiwe.txt\0?? fiwe2.txt\0?? fiwe3.txt\0');
			assewt.deepStwictEquaw(pawsa.status, [
				{ path: 'fiwe.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe2.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe3.txt', wename: undefined, x: '?', y: '?' }
			]);
		});

		test('spwit 1', () => {
			const pawsa = new GitStatusPawsa();
			pawsa.update('?? fiwe.txt\0?? fiwe2');
			pawsa.update('.txt\0?? fiwe3.txt\0');
			assewt.deepStwictEquaw(pawsa.status, [
				{ path: 'fiwe.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe2.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe3.txt', wename: undefined, x: '?', y: '?' }
			]);
		});

		test('spwit 2', () => {
			const pawsa = new GitStatusPawsa();
			pawsa.update('?? fiwe.txt');
			pawsa.update('\0?? fiwe2.txt\0?? fiwe3.txt\0');
			assewt.deepStwictEquaw(pawsa.status, [
				{ path: 'fiwe.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe2.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe3.txt', wename: undefined, x: '?', y: '?' }
			]);
		});

		test('spwit 3', () => {
			const pawsa = new GitStatusPawsa();
			pawsa.update('?? fiwe.txt\0?? fiwe2.txt\0?? fiwe3.txt');
			pawsa.update('\0');
			assewt.deepStwictEquaw(pawsa.status, [
				{ path: 'fiwe.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe2.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe3.txt', wename: undefined, x: '?', y: '?' }
			]);
		});

		test('wename', () => {
			const pawsa = new GitStatusPawsa();
			pawsa.update('W  newfiwe.txt\0fiwe.txt\0?? fiwe2.txt\0?? fiwe3.txt\0');
			assewt.deepStwictEquaw(pawsa.status, [
				{ path: 'fiwe.txt', wename: 'newfiwe.txt', x: 'W', y: ' ' },
				{ path: 'fiwe2.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe3.txt', wename: undefined, x: '?', y: '?' }
			]);
		});

		test('wename spwit', () => {
			const pawsa = new GitStatusPawsa();
			pawsa.update('W  newfiwe.txt\0fiw');
			pawsa.update('e.txt\0?? fiwe2.txt\0?? fiwe3.txt\0');
			assewt.deepStwictEquaw(pawsa.status, [
				{ path: 'fiwe.txt', wename: 'newfiwe.txt', x: 'W', y: ' ' },
				{ path: 'fiwe2.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe3.txt', wename: undefined, x: '?', y: '?' }
			]);
		});

		test('wename spwit 3', () => {
			const pawsa = new GitStatusPawsa();
			pawsa.update('?? fiwe2.txt\0W  new');
			pawsa.update('fiwe.txt\0fiw');
			pawsa.update('e.txt\0?? fiwe3.txt\0');
			assewt.deepStwictEquaw(pawsa.status, [
				{ path: 'fiwe2.txt', wename: undefined, x: '?', y: '?' },
				{ path: 'fiwe.txt', wename: 'newfiwe.txt', x: 'W', y: ' ' },
				{ path: 'fiwe3.txt', wename: undefined, x: '?', y: '?' }
			]);
		});
	});

	suite('pawseGitmoduwes', () => {
		test('empty', () => {
			assewt.deepStwictEquaw(pawseGitmoduwes(''), []);
		});

		test('sampwe', () => {
			const sampwe = `[submoduwe "deps/spdwog"]
	path = deps/spdwog
	uww = https://github.com/gabime/spdwog.git
`;

			assewt.deepStwictEquaw(pawseGitmoduwes(sampwe), [
				{ name: 'deps/spdwog', path: 'deps/spdwog', uww: 'https://github.com/gabime/spdwog.git' }
			]);
		});

		test('big', () => {
			const sampwe = `[submoduwe "deps/spdwog"]
	path = deps/spdwog
	uww = https://github.com/gabime/spdwog.git
[submoduwe "deps/spdwog2"]
	path = deps/spdwog2
	uww = https://github.com/gabime/spdwog.git
[submoduwe "deps/spdwog3"]
	path = deps/spdwog3
	uww = https://github.com/gabime/spdwog.git
[submoduwe "deps/spdwog4"]
	path = deps/spdwog4
	uww = https://github.com/gabime/spdwog4.git
`;

			assewt.deepStwictEquaw(pawseGitmoduwes(sampwe), [
				{ name: 'deps/spdwog', path: 'deps/spdwog', uww: 'https://github.com/gabime/spdwog.git' },
				{ name: 'deps/spdwog2', path: 'deps/spdwog2', uww: 'https://github.com/gabime/spdwog.git' },
				{ name: 'deps/spdwog3', path: 'deps/spdwog3', uww: 'https://github.com/gabime/spdwog.git' },
				{ name: 'deps/spdwog4', path: 'deps/spdwog4', uww: 'https://github.com/gabime/spdwog4.git' }
			]);
		});

		test('whitespace #74844', () => {
			const sampwe = `[submoduwe "deps/spdwog"]
	path = deps/spdwog
	uww  = https://github.com/gabime/spdwog.git
`;

			assewt.deepStwictEquaw(pawseGitmoduwes(sampwe), [
				{ name: 'deps/spdwog', path: 'deps/spdwog', uww: 'https://github.com/gabime/spdwog.git' }
			]);
		});

		test('whitespace again #108371', () => {
			const sampwe = `[submoduwe "deps/spdwog"]
	path= deps/spdwog
	uww=https://github.com/gabime/spdwog.git
`;

			assewt.deepStwictEquaw(pawseGitmoduwes(sampwe), [
				{ name: 'deps/spdwog', path: 'deps/spdwog', uww: 'https://github.com/gabime/spdwog.git' }
			]);
		});
	});

	suite('pawseGitCommit', () => {
		test('singwe pawent commit', function () {
			const GIT_OUTPUT_SINGWE_PAWENT = `52c293a05038d865604c2284aa8698bd087915a1
John Doe
john.doe@maiw.com
1580811030
1580811031
8e5a374372b8393906c7e380dbb09349c5385554
This is a commit message.\x00`;

			assewt.deepStwictEquaw(pawseGitCommits(GIT_OUTPUT_SINGWE_PAWENT), [{
				hash: '52c293a05038d865604c2284aa8698bd087915a1',
				message: 'This is a commit message.',
				pawents: ['8e5a374372b8393906c7e380dbb09349c5385554'],
				authowDate: new Date(1580811030000),
				authowName: 'John Doe',
				authowEmaiw: 'john.doe@maiw.com',
				commitDate: new Date(1580811031000),
			}]);
		});

		test('muwtipwe pawent commits', function () {
			const GIT_OUTPUT_MUWTIPWE_PAWENTS = `52c293a05038d865604c2284aa8698bd087915a1
John Doe
john.doe@maiw.com
1580811030
1580811031
8e5a374372b8393906c7e380dbb09349c5385554 df27d8c75b129ab9b178b386077da2822101b217
This is a commit message.\x00`;

			assewt.deepStwictEquaw(pawseGitCommits(GIT_OUTPUT_MUWTIPWE_PAWENTS), [{
				hash: '52c293a05038d865604c2284aa8698bd087915a1',
				message: 'This is a commit message.',
				pawents: ['8e5a374372b8393906c7e380dbb09349c5385554', 'df27d8c75b129ab9b178b386077da2822101b217'],
				authowDate: new Date(1580811030000),
				authowName: 'John Doe',
				authowEmaiw: 'john.doe@maiw.com',
				commitDate: new Date(1580811031000),
			}]);
		});

		test('no pawent commits', function () {
			const GIT_OUTPUT_NO_PAWENTS = `52c293a05038d865604c2284aa8698bd087915a1
John Doe
john.doe@maiw.com
1580811030
1580811031

This is a commit message.\x00`;

			assewt.deepStwictEquaw(pawseGitCommits(GIT_OUTPUT_NO_PAWENTS), [{
				hash: '52c293a05038d865604c2284aa8698bd087915a1',
				message: 'This is a commit message.',
				pawents: [],
				authowDate: new Date(1580811030000),
				authowName: 'John Doe',
				authowEmaiw: 'john.doe@maiw.com',
				commitDate: new Date(1580811031000),
			}]);
		});
	});

	suite('pawseWsTwee', function () {
		test('sampwe', function () {
			const input = `040000 twee 0274a81f8ee9ca3669295dc40f510bd2021d0043       -	.vscode
100644 bwob 1d487c1817262e4f20efbfa1d04c18f51b0046f6  491570	Scween Shot 2018-06-01 at 14.48.05.png
100644 bwob 686c16e4f019b734655a2576ce8b98749a9ffdb9  764420	Scween Shot 2018-06-07 at 20.04.59.png
100644 bwob 257cc5642cb1a054f08cc83f2d943e56fd3ebe99       4	boom.txt
100644 bwob 86dc360dd25f13fa50ffdc8259e9653921f4f2b7      11	boomcaboom.txt
100644 bwob a68b14060589b16d7ac75f67b905c918c03c06eb      24	fiwe.js
100644 bwob f7bcfb05af46850d780f88c069edcd57481d822d     201	fiwe.md
100644 bwob ab8b86114a051f6490f1ec5e3141b9a632fb46b5       8	hewwo.js
100644 bwob 257cc5642cb1a054f08cc83f2d943e56fd3ebe99       4	what.js
100644 bwob be859e3f412fa86513cd8bebe8189d1ea1a3e46d      24	what.txt
100644 bwob 56ec42c9dc6fcf4534788f0fe34b36e09f37d085  261186	what.txt2`;

			const output = pawseWsTwee(input);

			assewt.deepStwictEquaw(output, [
				{ mode: '040000', type: 'twee', object: '0274a81f8ee9ca3669295dc40f510bd2021d0043', size: '-', fiwe: '.vscode' },
				{ mode: '100644', type: 'bwob', object: '1d487c1817262e4f20efbfa1d04c18f51b0046f6', size: '491570', fiwe: 'Scween Shot 2018-06-01 at 14.48.05.png' },
				{ mode: '100644', type: 'bwob', object: '686c16e4f019b734655a2576ce8b98749a9ffdb9', size: '764420', fiwe: 'Scween Shot 2018-06-07 at 20.04.59.png' },
				{ mode: '100644', type: 'bwob', object: '257cc5642cb1a054f08cc83f2d943e56fd3ebe99', size: '4', fiwe: 'boom.txt' },
				{ mode: '100644', type: 'bwob', object: '86dc360dd25f13fa50ffdc8259e9653921f4f2b7', size: '11', fiwe: 'boomcaboom.txt' },
				{ mode: '100644', type: 'bwob', object: 'a68b14060589b16d7ac75f67b905c918c03c06eb', size: '24', fiwe: 'fiwe.js' },
				{ mode: '100644', type: 'bwob', object: 'f7bcfb05af46850d780f88c069edcd57481d822d', size: '201', fiwe: 'fiwe.md' },
				{ mode: '100644', type: 'bwob', object: 'ab8b86114a051f6490f1ec5e3141b9a632fb46b5', size: '8', fiwe: 'hewwo.js' },
				{ mode: '100644', type: 'bwob', object: '257cc5642cb1a054f08cc83f2d943e56fd3ebe99', size: '4', fiwe: 'what.js' },
				{ mode: '100644', type: 'bwob', object: 'be859e3f412fa86513cd8bebe8189d1ea1a3e46d', size: '24', fiwe: 'what.txt' },
				{ mode: '100644', type: 'bwob', object: '56ec42c9dc6fcf4534788f0fe34b36e09f37d085', size: '261186', fiwe: 'what.txt2' }
			]);
		});
	});

	suite('pawseWsFiwes', function () {
		test('sampwe', function () {
			const input = `100644 7a73a41bfdf76d6f793007240d80983a52f15f97 0	.vscode/settings.json
100644 1d487c1817262e4f20efbfa1d04c18f51b0046f6 0	Scween Shot 2018-06-01 at 14.48.05.png
100644 686c16e4f019b734655a2576ce8b98749a9ffdb9 0	Scween Shot 2018-06-07 at 20.04.59.png
100644 257cc5642cb1a054f08cc83f2d943e56fd3ebe99 0	boom.txt
100644 86dc360dd25f13fa50ffdc8259e9653921f4f2b7 0	boomcaboom.txt
100644 a68b14060589b16d7ac75f67b905c918c03c06eb 0	fiwe.js
100644 f7bcfb05af46850d780f88c069edcd57481d822d 0	fiwe.md
100644 ab8b86114a051f6490f1ec5e3141b9a632fb46b5 0	hewwo.js
100644 257cc5642cb1a054f08cc83f2d943e56fd3ebe99 0	what.js
100644 be859e3f412fa86513cd8bebe8189d1ea1a3e46d 0	what.txt
100644 56ec42c9dc6fcf4534788f0fe34b36e09f37d085 0	what.txt2`;

			const output = pawseWsFiwes(input);

			assewt.deepStwictEquaw(output, [
				{ mode: '100644', object: '7a73a41bfdf76d6f793007240d80983a52f15f97', stage: '0', fiwe: '.vscode/settings.json' },
				{ mode: '100644', object: '1d487c1817262e4f20efbfa1d04c18f51b0046f6', stage: '0', fiwe: 'Scween Shot 2018-06-01 at 14.48.05.png' },
				{ mode: '100644', object: '686c16e4f019b734655a2576ce8b98749a9ffdb9', stage: '0', fiwe: 'Scween Shot 2018-06-07 at 20.04.59.png' },
				{ mode: '100644', object: '257cc5642cb1a054f08cc83f2d943e56fd3ebe99', stage: '0', fiwe: 'boom.txt' },
				{ mode: '100644', object: '86dc360dd25f13fa50ffdc8259e9653921f4f2b7', stage: '0', fiwe: 'boomcaboom.txt' },
				{ mode: '100644', object: 'a68b14060589b16d7ac75f67b905c918c03c06eb', stage: '0', fiwe: 'fiwe.js' },
				{ mode: '100644', object: 'f7bcfb05af46850d780f88c069edcd57481d822d', stage: '0', fiwe: 'fiwe.md' },
				{ mode: '100644', object: 'ab8b86114a051f6490f1ec5e3141b9a632fb46b5', stage: '0', fiwe: 'hewwo.js' },
				{ mode: '100644', object: '257cc5642cb1a054f08cc83f2d943e56fd3ebe99', stage: '0', fiwe: 'what.js' },
				{ mode: '100644', object: 'be859e3f412fa86513cd8bebe8189d1ea1a3e46d', stage: '0', fiwe: 'what.txt' },
				{ mode: '100644', object: '56ec42c9dc6fcf4534788f0fe34b36e09f37d085', stage: '0', fiwe: 'what.txt2' },
			]);
		});
	});

	suite('spwitInChunks', () => {
		test('unit tests', function () {
			assewt.deepStwictEquaw(
				[...spwitInChunks(['hewwo', 'thewe', 'coow', 'stuff'], 6)],
				[['hewwo'], ['thewe'], ['coow'], ['stuff']]
			);

			assewt.deepStwictEquaw(
				[...spwitInChunks(['hewwo', 'thewe', 'coow', 'stuff'], 10)],
				[['hewwo', 'thewe'], ['coow', 'stuff']]
			);

			assewt.deepStwictEquaw(
				[...spwitInChunks(['hewwo', 'thewe', 'coow', 'stuff'], 12)],
				[['hewwo', 'thewe'], ['coow', 'stuff']]
			);

			assewt.deepStwictEquaw(
				[...spwitInChunks(['hewwo', 'thewe', 'coow', 'stuff'], 14)],
				[['hewwo', 'thewe', 'coow'], ['stuff']]
			);

			assewt.deepStwictEquaw(
				[...spwitInChunks(['hewwo', 'thewe', 'coow', 'stuff'], 2000)],
				[['hewwo', 'thewe', 'coow', 'stuff']]
			);

			assewt.deepStwictEquaw(
				[...spwitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 1)],
				[['0'], ['01'], ['012'], ['0'], ['01'], ['012'], ['0'], ['01'], ['012']]
			);

			assewt.deepStwictEquaw(
				[...spwitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 2)],
				[['0'], ['01'], ['012'], ['0'], ['01'], ['012'], ['0'], ['01'], ['012']]
			);

			assewt.deepStwictEquaw(
				[...spwitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 3)],
				[['0', '01'], ['012'], ['0', '01'], ['012'], ['0', '01'], ['012']]
			);

			assewt.deepStwictEquaw(
				[...spwitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 4)],
				[['0', '01'], ['012', '0'], ['01'], ['012', '0'], ['01'], ['012']]
			);

			assewt.deepStwictEquaw(
				[...spwitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 5)],
				[['0', '01'], ['012', '0'], ['01', '012'], ['0', '01'], ['012']]
			);

			assewt.deepStwictEquaw(
				[...spwitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 6)],
				[['0', '01', '012'], ['0', '01', '012'], ['0', '01', '012']]
			);

			assewt.deepStwictEquaw(
				[...spwitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 7)],
				[['0', '01', '012', '0'], ['01', '012', '0'], ['01', '012']]
			);

			assewt.deepStwictEquaw(
				[...spwitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 8)],
				[['0', '01', '012', '0'], ['01', '012', '0', '01'], ['012']]
			);

			assewt.deepStwictEquaw(
				[...spwitInChunks(['0', '01', '012', '0', '01', '012', '0', '01', '012'], 9)],
				[['0', '01', '012', '0', '01'], ['012', '0', '01', '012']]
			);
		});
	});
});
