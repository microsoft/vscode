/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { TextRange } from '../../common/state/sessionState.js';
import { computeWorkingSetRangeChanges, type IWorkingSetFileContents } from '../../node/workingSetFileContents.js';
import { InProcessDiffComputeService } from './inProcessDiffComputeService.js';

suite('computeWorkingSetRangeChanges', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	// Changes the second line, removes the fifth, and adds a line at the end.
	const contents: IWorkingSetFileContents = {
		baseline: encoder.encode('one\ntwo\nthree\nfour\nfive\nsix\n'),
		current: encoder.encode('one\nTWO\nthree\nfour\nsix\nseven\n'),
		rebased: false,
	};

	function range(startLine: number, startCharacter: number, endLine: number, endCharacter: number): TextRange {
		return { start: { line: startLine, character: startCharacter }, end: { line: endLine, character: endCharacter } };
	}

	async function pick(target: TextRange, side?: 'before' | 'after', fileContents = contents) {
		const changes = await computeWorkingSetRangeChanges(fileContents, side, target, new InProcessDiffComputeService());
		return changes && {
			selected: `${changes.selected}/${changes.total}`,
			withRange: decoder.decode(changes.baselineWithRange),
			withoutRange: decoder.decode(changes.currentWithoutRange),
		};
	}

	test('picks the hunks that the lines of a range touch on either side of the diff', async () => {
		assert.deepStrictEqual({
			changedLine: await pick(range(1, 1, 1, 1)),
			// The removed line sits between the fourth and fifth lines of the current content.
			lineAfterRemoval: await pick(range(4, 0, 4, 3)),
			removedLineOnBaseline: await pick(range(4, 0, 4, 4), 'before'),
			// A selection of whole lines doesn't cover the line it ends at the start of.
			wholeLines: await pick(range(1, 0, 3, 0)),
			unchangedLine: await pick(range(2, 0, 2, 5)),
			reversed: await pick(range(5, 0, 0, 0)),
		}, {
			changedLine: { selected: '1/3', withRange: 'one\nTWO\nthree\nfour\nfive\nsix\n', withoutRange: 'one\ntwo\nthree\nfour\nsix\nseven\n' },
			lineAfterRemoval: { selected: '1/3', withRange: 'one\ntwo\nthree\nfour\nsix\n', withoutRange: 'one\nTWO\nthree\nfour\nfive\nsix\nseven\n' },
			removedLineOnBaseline: { selected: '1/3', withRange: 'one\ntwo\nthree\nfour\nsix\n', withoutRange: 'one\nTWO\nthree\nfour\nfive\nsix\nseven\n' },
			wholeLines: { selected: '1/3', withRange: 'one\nTWO\nthree\nfour\nfive\nsix\n', withoutRange: 'one\ntwo\nthree\nfour\nsix\nseven\n' },
			unchangedLine: { selected: '0/3', withRange: 'one\ntwo\nthree\nfour\nfive\nsix\n', withoutRange: 'one\nTWO\nthree\nfour\nsix\nseven\n' },
			reversed: { selected: '3/3', withRange: 'one\nTWO\nthree\nfour\nsix\nseven\n', withoutRange: 'one\ntwo\nthree\nfour\nfive\nsix\n' },
		});
	});

	test('picks one of two separated hunks of a file whose line endings changed too, keeping each side\'s line endings', async () => {
		const converted: IWorkingSetFileContents = {
			baseline: encoder.encode('one\r\ntwo\r\nthree\r\nfour\r\nfive\r\n'),
			current: encoder.encode('one\nTWO\nthree\nfour\nFIVE\n'),
			rebased: false,
		};

		assert.deepStrictEqual({
			first: await pick(range(1, 0, 1, 3), undefined, converted),
			second: await pick(range(4, 0, 4, 4), undefined, converted),
			both: await pick(range(0, 0, 4, 4), undefined, converted),
		}, {
			first: { selected: '1/2', withRange: 'one\r\nTWO\r\nthree\r\nfour\r\nfive\r\n', withoutRange: 'one\ntwo\nthree\nfour\nFIVE\n' },
			second: { selected: '1/2', withRange: 'one\r\ntwo\r\nthree\r\nfour\r\nFIVE\r\n', withoutRange: 'one\nTWO\nthree\nfour\nfive\n' },
			// Touching every hunk makes callers accept or discard the whole file, line endings included.
			both: { selected: '2/2', withRange: 'one\r\nTWO\r\nthree\r\nfour\r\nFIVE\r\n', withoutRange: 'one\ntwo\nthree\nfour\nfive\n' },
		});
	});

	test('does not split the changes of a file that is created, deleted, or not text', async () => {
		const text = encoder.encode('text\n');
		assert.deepStrictEqual({
			created: await pick(range(0, 0, 0, 0), undefined, { baseline: undefined, current: text, rebased: false }),
			deleted: await pick(range(0, 0, 0, 0), undefined, { baseline: text, current: undefined, rebased: false }),
			notText: await pick(range(0, 0, 0, 0), undefined, { baseline: text, current: new Uint8Array([0xff]), rebased: false }),
		}, {
			created: undefined,
			deleted: undefined,
			notText: undefined,
		});
	});
});
