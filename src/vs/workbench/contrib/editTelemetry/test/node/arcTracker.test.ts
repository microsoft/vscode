/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { ArcTracker } from '../../common/arcTracker.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { readFileSync } from 'fs';
import { join, resolve } from '../../../../../base/common/path.js';
import { StringEdit, StringReplacement } from '../../../../../editor/common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { ensureDependenciesAreSet } from '../../../../../editor/common/core/text/positionToOffset.js';

suite('ArcTracker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	ensureDependenciesAreSet();

	const fixturesOutDir = FileAccess.asFileUri('vs/workbench/contrib/editTelemetry/test/node/data').fsPath;
	const fixturesSrcDir = resolve(fixturesOutDir).replaceAll('\\', '/').replace('/out/vs/workbench/', '/src/vs/workbench/');

	function getData(name: string): IEdits {
		const path = join(fixturesSrcDir, name + '.edits.w.json');
		const src = readFileSync(path, 'utf8');
		return JSON.parse(src);
	}

	test('issue-264048', () => {
		const stats = runTestWithData(getData('issue-264048'));
		assert.deepStrictEqual(stats, ([
			{
				arc: 8,
				deletedLineCounts: 1,
				insertedLineCounts: 1
			},
			{
				arc: 8,
				deletedLineCounts: 0,
				insertedLineCounts: 1
			},
			{
				arc: 8,
				deletedLineCounts: 0,
				insertedLineCounts: 1
			}
		]));
	});

	test('line-insert', () => {
		const stats = runTestWithData(getData('line-insert'));
		assert.deepStrictEqual(stats, ([
			{
				arc: 7,
				deletedLineCounts: 0,
				insertedLineCounts: 1
			},
			{
				arc: 5,
				deletedLineCounts: 0,
				insertedLineCounts: 1
			}
		]));
	});

	test('line-modification', () => {
		const stats = runTestWithData(getData('line-modification'));
		assert.deepStrictEqual(stats, ([
			{
				arc: 6,
				deletedLineCounts: 1,
				insertedLineCounts: 1
			},
			{
				arc: 6,
				deletedLineCounts: 1,
				insertedLineCounts: 1
			},
			{
				arc: 0,
				deletedLineCounts: 0,
				insertedLineCounts: 0
			}
		]));
	});

	test('multiline-insert', () => {
		const stats = runTestWithData(getData('multiline-insert'));
		assert.deepStrictEqual(stats, ([
			{
				arc: 24,
				deletedLineCounts: 0,
				insertedLineCounts: 3
			},
			{
				arc: 23,
				deletedLineCounts: 0,
				insertedLineCounts: 2
			}
		]));
	});
});

interface IEdits {
	initialText: string;
	edits: Array<{
		replacements: Array<{
			start: number;
			endEx: number;
			text: string;
		}>;
	}>;
}

function createStringEditFromJson(editData: IEdits['edits'][0]): StringEdit {
	const replacements = editData.replacements.map(replacement =>
		new StringReplacement(
			OffsetRange.ofStartAndLength(replacement.start, replacement.endEx - replacement.start),
			replacement.text
		)
	);
	return new StringEdit(replacements);
}

function runTestWithData(data: IEdits): unknown {
	const edits = data.edits.map(editData => createStringEditFromJson(editData));

	const t = new ArcTracker(
		new StringText(data.initialText),
		edits[0]
	);

	const stats: unknown[] = [];
	stats.push(t.getValues());
	let lastLineNumbers = t.getLineCountInfo().insertedLineCounts;
	let lastArc = t.getAcceptedRestrainedCharactersCount();

	for (let i = 1; i < edits.length; i++) {
		t.handleEdits(edits[i]);
		stats.push(t.getValues());

		const newLineNumbers = t.getLineCountInfo().insertedLineCounts;
		assert.ok(newLineNumbers <= lastLineNumbers, `Line numbers must not increase. Last: ${lastLineNumbers}, new: ${newLineNumbers}`);
		lastLineNumbers = newLineNumbers;

		const newArc = t.getAcceptedRestrainedCharactersCount();
		assert.ok(newArc <= lastArc, `ARC must not increase. Last: ${lastArc}, new: ${newArc}`);
		lastArc = newArc;
	}
	return stats;
}
