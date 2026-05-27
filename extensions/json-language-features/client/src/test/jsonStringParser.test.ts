/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert/strict';
import test from 'node:test';
import { JsonDocumentLike, JsonParserService } from '../common/jsonStringParser';

class TestDocument implements JsonDocumentLike {
	constructor(
		public readonly uri: { toString(): string },
		public version: number,
		private lines: string[]
	) { }

	lineAt(line: number): { text: string } {
		return { text: this.lines[line] ?? '' };
	}

	update(lines: string[], version = this.version + 1): void {
		this.lines = lines;
		this.version = version;
	}
}

function createDocument(lines: string[], version = 1): TestDocument {
	return new TestDocument({ toString: () => 'file:///test.json' }, version, lines);
}

test('records snapshots at the configured interval', () => {
	const service = new JsonParserService(2);
	const document = createDocument([
		'{',
		'  "value": "first",',
		'  "other": "second"',
		'}'
	]);

	assert.equal(service.isInsideJsonString(document, { line: 3, character: 0 }), false);
	assert.deepEqual(service.getSnapshotLinesForTesting(document.uri.toString()), [1, 3]);
});

test('incremental invalidation preserves earlier snapshots', () => {
	const service = new JsonParserService(2);
	const document = createDocument([
		'{',
		'  "value": "first",',
		'  "other": "second",',
		'  "third": "third"',
		'}'
	]);

	service.isInsideJsonString(document, { line: 3, character: 17 });
	assert.deepEqual(service.getSnapshotLinesForTesting(document.uri.toString()), [1, 3]);

	service.onDidChangeTextDocument(document, [{ range: { start: { line: 2 } } }]);
	assert.deepEqual(service.getSnapshotLinesForTesting(document.uri.toString()), [1]);
});

test('uses the current document version when reusing snapshots', () => {
	const service = new JsonParserService(2);
	const document = createDocument([
		'{',
		'  "value": "first"',
		'}'
	]);

	assert.equal(service.isInsideJsonString(document, { line: 1, character: 15 }), true);
	assert.deepEqual(service.getSnapshotLinesForTesting(document.uri.toString()), [1]);

	document.update([
		'{',
		'  "value": "second"',
		'}'
	], 2);

	assert.equal(service.isInsideJsonString(document, { line: 1, character: 16 }), true);
	assert.deepEqual(service.getSnapshotLinesForTesting(document.uri.toString()), [1]);
});

test('analysis exposes cache and scan details', () => {
	const service = new JsonParserService(2);
	const document = createDocument([
		'{',
		'  "value": "alpha",',
		'  "nested": {',
		'    "text": "beta"',
		'  }',
		'}'
	]);

	assert.equal(service.isInsideJsonString(document, { line: 3, character: 16 }), true);
	const analysis = service.getAnalysisSummary(document, { line: 3, character: 16 });
	assert.equal(analysis.insideString, true);
	assert.equal(analysis.snapshotLine, 1);
	assert.equal(analysis.snapshotVersionMatched, true);
	assert.equal(analysis.startLine, 2);
	assert.equal(analysis.endLine, 3);
	assert.equal(analysis.linesScanned, 2);
	assert.equal(analysis.finalState.inString, true);

	const summary = service.getCacheSummaryForTesting(document.uri.toString());
	assert.ok(summary);
	assert.equal(summary?.snapshotCount, 2);
	assert.deepEqual(summary?.snapshotLines, [1, 3]);
	assert.deepEqual(summary?.snapshotVersions, [1, 1]);
});
