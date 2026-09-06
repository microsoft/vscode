/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { parseCommand, parseCommandHead, segmentHasFlag, segmentHead, tokenize } from '../../browser/tools/terminalCommandParser.js';

suite('terminalCommandParser', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('tokenize', () => {
		test('splits on whitespace', () => {
			deepStrictEqual(tokenize('git diff HEAD~1 src/foo.ts'), ['git', 'diff', 'HEAD~1', 'src/foo.ts']);
		});
		test('respects single quotes', () => {
			deepStrictEqual(tokenize(`grep 'a b c' file`), ['grep', 'a b c', 'file']);
		});
		test('respects double quotes with escapes', () => {
			deepStrictEqual(tokenize(`echo "a \\"b\\" c"`), ['echo', 'a "b" c']);
		});
		test('respects backslash escapes outside quotes', () => {
			deepStrictEqual(tokenize('cat foo\\ bar.txt'), ['cat', 'foo bar.txt']);
		});
		test('handles unterminated quotes gracefully', () => {
			deepStrictEqual(tokenize(`echo "unterminated`), ['echo', 'unterminated']);
		});
		test('preserves empty quoted strings', () => {
			deepStrictEqual(tokenize(`grep "" file`), ['grep', '', 'file']);
		});
	});

	suite('parseCommand composition', () => {
		test('returns undefined for empty input', () => {
			strictEqual(parseCommand(undefined), undefined);
			strictEqual(parseCommand(''), undefined);
			strictEqual(parseCommand('   '), undefined);
		});

		test('splits pipelines', () => {
			const parsed = parseCommand('git diff | cat');
			strictEqual(parsed?.segments.length, 2);
			strictEqual(parsed?.segments[0].trailingSeparator, '|');
			deepStrictEqual(parsed?.segments[0].tokens, ['git', 'diff']);
			deepStrictEqual(parsed?.segments[1].tokens, ['cat']);
		});

		test('splits on && and ||', () => {
			const parsed = parseCommand('npm install && npm test || echo fail');
			strictEqual(parsed?.segments.length, 3);
			strictEqual(parsed?.segments[0].trailingSeparator, '&&');
			strictEqual(parsed?.segments[1].trailingSeparator, '||');
		});

		test('does not split on separators inside quotes', () => {
			const parsed = parseCommand(`echo "a;b" | wc -l`);
			strictEqual(parsed?.segments.length, 2);
			deepStrictEqual(parsed?.segments[0].tokens, ['echo', 'a;b']);
		});

		test('strips leading env assignments', () => {
			const parsed = parseCommand('CI=1 NODE_ENV=test npm install');
			strictEqual(parsed?.segments.length, 1);
			deepStrictEqual(parsed?.segments[0].envPrefixes, ['CI=1', 'NODE_ENV=test']);
			deepStrictEqual(parsed?.segments[0].tokens, ['npm', 'install']);
		});

		test('strips sudo wrapper', () => {
			const parsed = parseCommand('sudo apt-get install -y vim');
			deepStrictEqual(parsed?.segments[0].wrappers, ['sudo']);
			deepStrictEqual(parsed?.segments[0].tokens, ['apt-get', 'install', '-y', 'vim']);
		});

		test('strips time wrapper', () => {
			const parsed = parseCommand('time cargo build');
			deepStrictEqual(parsed?.segments[0].wrappers, ['time']);
			deepStrictEqual(parsed?.segments[0].tokens, ['cargo', 'build']);
		});

		test('strips timeout wrapper with numeric arg', () => {
			const parsed = parseCommand('timeout 30 npm test');
			deepStrictEqual(parsed?.segments[0].wrappers, ['timeout']);
			deepStrictEqual(parsed?.segments[0].tokens, ['npm', 'test']);
		});

		test('strips env wrapper with inner env vars', () => {
			const parsed = parseCommand('env -i PATH=/usr/bin make all');
			deepStrictEqual(parsed?.segments[0].wrappers, ['env']);
			deepStrictEqual(parsed?.segments[0].envPrefixes, ['PATH=/usr/bin']);
			deepStrictEqual(parsed?.segments[0].tokens, ['make', 'all']);
		});

		test('strips combined env + wrapper', () => {
			const parsed = parseCommand('FOO=bar sudo time git diff');
			deepStrictEqual(parsed?.segments[0].envPrefixes, ['FOO=bar']);
			deepStrictEqual(parsed?.segments[0].wrappers, ['sudo', 'time']);
			deepStrictEqual(parsed?.segments[0].tokens, ['git', 'diff']);
		});
	});

	suite('segmentHead', () => {
		test('handles plain command', () => {
			const seg = parseCommand('git diff HEAD~1')!.segments[0];
			deepStrictEqual(segmentHead(seg), { head: 'git', sub: 'diff' });
		});

		test('skips long flags before subcommand', () => {
			const seg = parseCommand('git --no-pager diff src/foo.ts')!.segments[0];
			deepStrictEqual(segmentHead(seg), { head: 'git', sub: 'diff' });
		});

		test('does not skip short flags', () => {
			const seg = parseCommand('git -C /tmp/repo diff')!.segments[0];
			deepStrictEqual(segmentHead(seg), { head: 'git', sub: '-C' });
		});
	});

	suite('parseCommandHead', () => {
		test('returns undefined for empty input', () => {
			strictEqual(parseCommandHead(undefined), undefined);
			strictEqual(parseCommandHead(''), undefined);
		});
		test('parses simple commands', () => {
			deepStrictEqual(parseCommandHead('git diff HEAD~5'), { head: 'git', sub: 'diff' });
		});
		test('uses first segment of pipeline', () => {
			deepStrictEqual(parseCommandHead('git diff | cat'), { head: 'git', sub: 'diff' });
		});
		test('strips env / wrappers', () => {
			deepStrictEqual(parseCommandHead('CI=1 sudo time git status'), { head: 'git', sub: 'status' });
		});
	});

	suite('segmentHasFlag', () => {
		test('detects bundled short flags', () => {
			const seg = parseCommand('ls -la')!.segments[0];
			ok(segmentHasFlag(seg, ['l']));
			ok(segmentHasFlag(seg, ['a']));
			ok(!segmentHasFlag(seg, ['r']));
		});
		test('detects long flags', () => {
			const seg = parseCommand('git --no-pager log')!.segments[0];
			ok(segmentHasFlag(seg, ['no-pager']));
			ok(!segmentHasFlag(seg, ['pager']));
		});
	});
});
