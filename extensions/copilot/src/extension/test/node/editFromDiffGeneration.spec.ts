/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { deepStrictEqual } from 'assert';
import { promises as fs, readdirSync } from 'fs';
import { suite, test } from 'vitest';
import * as path from '../../../util/vs/base/common/path';
import { Reporter, createEditsFromPseudoDiff, createEditsFromRealDiff } from '../../prompt/node/editFromDiffGeneration';
import { Lines } from '../../prompt/node/editGeneration';
import { applyEdits } from '../../prompt/node/intents';

suite('Real Diff Apply', function () {
	createTestsFromFixtures(path.join(__dirname, './fixtures/gitdiff'), (original: string, diff: string, expected: string, messages: string[]) => {
		const reporter = new ReporterImpl();
		const linesEdits = createEditsFromRealDiff(Lines.fromString(original), Lines.fromString(diff), reporter);
		const actual = applyEdits(original, linesEdits.map(e => e.toTextEdit()));
		deepStrictEqual(Lines.fromString(actual), Lines.fromString(expected));
		deepStrictEqual(reporter.messages, messages);
		deepStrictEqual(reporter.recovered, []);
	});
});

suite('Pseudo Diff Apply', function () {
	createTestsFromFixtures(path.join(__dirname, './fixtures/pseudodiff'), (original: string, diff: string, expected: string, messages: string[]) => {
		const reporter = new ReporterImpl();
		const linesEdits = createEditsFromPseudoDiff(Lines.fromString(original), Lines.fromString(diff), reporter);
		const actual = applyEdits(original, linesEdits.map(e => e.toTextEdit()));
		deepStrictEqual(Lines.fromString(actual), Lines.fromString(expected));
		deepStrictEqual(reporter.messages, messages);
	});
});

class ReporterImpl implements Reporter {
	public recovered: [number, number][] = [];
	public messages: string[] = [];

	recovery(originalLine: number, newLine: number) {
		this.recovered.push([originalLine, newLine]);
	}
	warning(message: string) {
		this.messages.push(message);
	}
}


function createTestsFromFixtures(testDir: string, runTest: (original: string, diff: string, expected: string, messages: string[]) => void) {
	const entries = readdirSync(testDir);
	for (const entry of entries) {

		const match = entry.match(/^(\d\d-\w+)-([^.]+)$/);
		if (match) {
			test(`${match[1]} - ${match[2].replace(/_/g, ' ')}`, async () => {
				const expected = await fs.readFile(path.join(testDir, entry), 'utf8');
				const diff = await fs.readFile(path.join(testDir, `${entry}.diff`), 'utf8');
				const original = await fs.readFile(path.join(testDir, match[1]), 'utf8');
				let messages = [];
				try {
					messages = JSON.parse(await fs.readFile(path.join(testDir, `${entry}.messages`), 'utf8'));
				} catch (e) {
					// ignore
				}
				runTest(original, diff, expected, messages);
			});
		}
	}
}
