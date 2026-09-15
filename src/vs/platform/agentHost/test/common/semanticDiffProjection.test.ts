/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ISemanticDiffFile, ISemanticDiffHunk, SemanticDiffChangeType } from '../../common/semanticDiff.js';
import { getDefaultSemanticDiffEnabledTypes, projectSemanticDiffFiles, resolveSemanticDiffFile } from '../../common/semanticDiffProjection.js';

const file: ISemanticDiffFile = { id: 'file', path: 'src/file.ts', oldPath: null, status: 'modified', contentKind: 'text' };
const allTypes = new Set<SemanticDiffChangeType | null>(['logic', 'test', 'supporting', 'generated', null]);

function hunk(overrides: Partial<ISemanticDiffHunk> = {}): ISemanticDiffHunk {
	return {
		id: 'hunk', fileId: file.id, oldRange: { start: 1, count: 1 }, newRange: { start: 1, count: 1 },
		additions: 1, deletions: 1,
		classification: {
			groupId: 'group', changeType: 'logic', secondaryChangeTypes: [],
			summary: 'Not source text', groupReason: 'Not source text', typeReason: 'Not source text',
			groupConfidence: 'high', typeConfidence: 'high', uncertainty: null
		},
		...overrides
	};
}

function patch(body: string, headers = 'index 1234567..abcdef0 100644\n', entry = file): string {
	return `diff --git a/${entry.oldPath ?? entry.path} b/${entry.path}\n${headers}` +
		(body ? `--- ${entry.status === 'added' ? '/dev/null' : `a/${entry.oldPath ?? entry.path}`}\n+++ ${entry.status === 'deleted' ? '/dev/null' : `b/${entry.path}`}\n${body}` : '');
}

function lines(start: number, end: number): string[] {
	return Array.from({ length: end - start + 1 }, (_, index) => `line${start + index}\n`);
}

function context(start: number, end: number): string {
	return lines(start, end).map(line => ` ${line}`).join('');
}

function multiHunkFixture(first: 'insert' | 'delete' = 'insert') {
	const insert = first === 'insert';
	const original = lines(1, 30).join('');
	const modified = [
		...(insert ? ['line1\n', 'inserted\n'] : []), ...lines(2, 13), 'changed14\n', ...lines(15, 26), 'changed27\n', ...lines(28, 30)
	].join('');
	const firstHunk = hunk({
		id: 'first', oldRange: { start: 1, count: 4 }, newRange: { start: 1, count: insert ? 5 : 3 },
		additions: insert ? 1 : 0, deletions: insert ? 0 : 1,
		classification: { ...hunk().classification, groupId: 'other' }
	});
	const secondHunk = hunk({
		id: 'second', oldRange: { start: 11, count: 7 }, newRange: { start: insert ? 12 : 10, count: 7 },
		classification: { ...hunk().classification, changeType: 'test', secondaryChangeTypes: ['supporting'] }
	});
	const thirdHunk = hunk({
		id: 'third', oldRange: { start: 24, count: 7 }, newRange: { start: insert ? 25 : 23, count: 7 },
		classification: { ...hunk().classification, changeType: null, typeConfidence: null, uncertainty: 'Unresolved type' }
	});
	return {
		original, modified, hunks: [firstHunk, secondHunk, thirdHunk],
		patch: patch(
			`@@ -1,4 +1,${insert ? 5 : 3} @@\n${insert ? ' line1\n+inserted\n' : '-line1\n'}${context(2, 4)}` +
			`@@ -11,7 +${insert ? 12 : 10},7 @@ enclosing function\n${context(11, 13)}-line14\n+changed14\n${context(15, 17)}` +
			`@@ -24,7 +${insert ? 25 : 23},7 @@\n${context(24, 26)}-line27\n+changed27\n${context(28, 30)}`
		)
	};
}

suite('Semantic diff projection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('same file in two groups projects only selected group hunks', () => {
		const fixture = multiHunkFixture();
		const resolved = resolveSemanticDiffFile(file, fixture.hunks, fixture.original, fixture.modified, fixture.patch);
		const [group] = projectSemanticDiffFiles([resolved], 'group', allTypes);
		const [other] = projectSemanticDiffFiles([resolved], 'other', allTypes);
		assert.deepStrictEqual({
			group: { original: group.original, modified: group.modified, hunks: group.hunks.map(hunk => hunk.id), additions: group.additions, deletions: group.deletions },
			other: { modified: other.modified, hunks: other.hunks.map(hunk => hunk.id), additions: other.additions, deletions: other.deletions },
			canonical: resolved.modified
		}, {
			group: {
				original: fixture.original,
				modified: [...lines(1, 13), 'changed14\n', ...lines(15, 26), 'changed27\n', ...lines(28, 30)].join(''),
				hunks: ['second', 'third'], additions: 2, deletions: 2
			},
			other: {
				modified: ['line1\n', 'inserted\n', ...lines(2, 30)].join(''),
				hunks: ['first'], additions: 1, deletions: 0
			},
			canonical: fixture.modified
		});
	});

	test('retains only actual changed lines, not hunk context, on both source sides', () => {
		const fixture = multiHunkFixture();
		const resolved = resolveSemanticDiffFile(file, fixture.hunks, fixture.original, fixture.modified, fixture.patch);
		assert.deepStrictEqual(resolved.hunks.map(hunk => ({
			original: hunk.originalChangedRanges,
			modified: hunk.modifiedChangedRanges,
			frozen: [hunk.originalChangedRanges, hunk.modifiedChangedRanges, ...hunk.originalChangedRanges, ...hunk.modifiedChangedRanges].every(Object.isFrozen),
		})), [
			{ original: [], modified: [{ start: 2, count: 1 }], frozen: true },
			{ original: [{ start: 14, count: 1 }], modified: [{ start: 15, count: 1 }], frozen: true },
			{ original: [{ start: 27, count: 1 }], modified: [{ start: 28, count: 1 }], frozen: true },
		]);
	});

	test('splits changed ranges around unchanged lines within a single hunk', () => {
		const item = hunk({ oldRange: { start: 1, count: 5 }, newRange: { start: 1, count: 6 }, additions: 3, deletions: 2 });
		const resolved = resolveSemanticDiffFile(file, [item], 'head\nold1\nmiddle\nold2\ntail\n', 'head\nnew1\nextra\nmiddle\nnew2\ntail\n',
			patch('@@ -1,5 +1,6 @@\n head\n-old1\n+new1\n+extra\n middle\n-old2\n+new2\n tail\n'));
		assert.deepStrictEqual({
			original: resolved.hunks[0].originalChangedRanges,
			modified: resolved.hunks[0].modifiedChangedRanges,
		}, {
			original: [{ start: 2, count: 1 }, { start: 4, count: 1 }],
			modified: [{ start: 2, count: 2 }, { start: 5, count: 1 }],
		});
	});

	for (const first of ['insert', 'delete'] as const) {
		test(`excluded earlier ${first} preserves canonical coordinates and adjusts projected coordinates`, () => {
			const fixture = multiHunkFixture(first);
			const resolved = resolveSemanticDiffFile(file, fixture.hunks, fixture.original, fixture.modified, fixture.patch);
			const [projected] = projectSemanticDiffFiles([resolved], 'group', allTypes);
			assert.deepStrictEqual(projected.mappings, [
				{ hunkId: 'second', original: { start: 11, count: 7 }, canonicalModified: { start: first === 'insert' ? 12 : 10, count: 7 }, projectedModified: { start: 11, count: 7 } },
				{ hunkId: 'third', original: { start: 24, count: 7 }, canonicalModified: { start: first === 'insert' ? 25 : 23, count: 7 }, projectedModified: { start: 24, count: 7 } }
			]);
		});
	}

	test('selected earlier insertions affect later projected ranges exactly once', () => {
		const fixture = multiHunkFixture();
		fixture.hunks[0].classification.groupId = 'group';
		const resolved = resolveSemanticDiffFile(file, fixture.hunks, fixture.original, fixture.modified, fixture.patch);
		const [projected] = projectSemanticDiffFiles([resolved], 'group', allTypes);
		assert.deepStrictEqual({
			text: projected.modified,
			ranges: projected.mappings.map(mapping => mapping.projectedModified),
			additions: projected.additions, deletions: projected.deletions
		}, {
			text: fixture.modified,
			ranges: [{ start: 1, count: 5 }, { start: 12, count: 7 }, { start: 25, count: 7 }],
			additions: 3, deletions: 2
		});
	});

	test('partial reports verify but exclude actual unreported earlier and later hunks', () => {
		const fixture = multiHunkFixture();
		const resolved = resolveSemanticDiffFile(file, fixture.hunks.slice(1, 2), fixture.original, fixture.modified, fixture.patch);
		const [projected] = projectSemanticDiffFiles([resolved], 'group', allTypes);
		assert.deepStrictEqual({
			hunks: resolved.hunks.map(hunk => hunk.id),
			text: projected.modified,
			ranges: projected.mappings
		}, {
			hunks: ['second'],
			text: [...lines(1, 13), 'changed14\n', ...lines(15, 30)].join(''),
			ranges: [{ hunkId: 'second', original: { start: 11, count: 7 }, canonicalModified: { start: 12, count: 7 }, projectedModified: { start: 11, count: 7 } }]
		});
	});

	test('primary types control selection; secondary types do not duplicate or reveal hunks', () => {
		const fixture = multiHunkFixture();
		const resolved = resolveSemanticDiffFile(file, fixture.hunks, fixture.original, fixture.modified, fixture.patch);
		const describe = (types: ReadonlySet<SemanticDiffChangeType | null>) => projectSemanticDiffFiles([resolved], 'group', types)
			.map(file => ({ hunks: file.hunks.map(hunk => hunk.id), additions: file.additions, deletions: file.deletions }));
		assert.deepStrictEqual({
			primary: describe(new Set(['test'])),
			secondary: describe(new Set(['supporting'])),
			both: describe(new Set(['test', 'supporting'])),
			unclassified: describe(new Set([null])),
			none: describe(new Set())
		}, {
			primary: [{ hunks: ['second'], additions: 1, deletions: 1 }],
			secondary: [],
			both: [{ hunks: ['second'], additions: 1, deletions: 1 }],
			unclassified: [{ hunks: ['third'], additions: 1, deletions: 1 }],
			none: []
		});
	});

	for (const type of ['logic', 'test', 'supporting', 'generated', null] as const) {
		test(`defaults enable highest present primary type (${type}) and unclassified`, () => {
			const fixture = multiHunkFixture();
			fixture.hunks[1].classification.changeType = type;
			fixture.hunks[1].classification.secondaryChangeTypes = [];
			const resolved = resolveSemanticDiffFile(file, fixture.hunks, fixture.original, fixture.modified, fixture.patch);
			assert.deepStrictEqual([...getDefaultSemanticDiffEnabledTypes([resolved], 'group')], type === null ? [null] : [type, null]);
		});
	}

	test('defaults choose priority rather than file order, with no implied unclassified selection', () => {
		const fixture = multiHunkFixture();
		fixture.hunks[0].classification.groupId = 'group';
		fixture.hunks[2].classification.changeType = 'supporting';
		const resolved = resolveSemanticDiffFile(file, fixture.hunks, fixture.original, fixture.modified, fixture.patch);
		assert.deepStrictEqual([...getDefaultSemanticDiffEnabledTypes([resolved], 'group')], ['logic']);
	});

	test('preserves supplied file order, canonical hunk order, and source snapshots', () => {
		const fixture = multiHunkFixture();
		const entry = { ...file, path: 'second.ts' };
		const input = fixture.hunks[1];
		const first = resolveSemanticDiffFile(entry, [input], fixture.original, fixture.modified, fixture.patch.replaceAll(file.path, entry.path));
		const second = resolveSemanticDiffFile(file, fixture.hunks, fixture.original, fixture.modified, fixture.patch);
		entry.path = 'mutated.ts';
		input.newRange.start = 999;
		input.classification.groupId = 'mutated';
		input.classification.secondaryChangeTypes.push('generated');
		const projected = projectSemanticDiffFiles([first, second], 'group', allTypes);
		assert.deepStrictEqual({
			files: projected.map(file => file.file.path),
			hunks: projected.map(file => file.hunks.map(hunk => hunk.id)),
			range: first.hunks[0].newRange,
			secondary: first.hunks[0].classification.secondaryChangeTypes,
			frozen: [first, first.file, first.hunks, first.hunks[0], first.hunks[0].newRange, first.hunks[0].classification, first.hunks[0].classification.secondaryChangeTypes, projected, projected[0], projected[0].mappings].every(Object.isFrozen)
		}, {
			files: ['second.ts', 'src/file.ts'], hunks: [['second'], ['second', 'third']],
			range: { start: 12, count: 7 }, secondary: ['supporting'], frozen: true
		});
	});

	for (const status of ['added', 'deleted'] as const) {
		test(`${status} file preserves missing side and zero-count anchor`, () => {
			const added = status === 'added';
			const entry = { ...file, status };
			const range = { start: 1, count: 2 };
			const empty = { start: 0, count: 0 };
			const item = hunk({ oldRange: added ? empty : range, newRange: added ? range : empty, additions: added ? 2 : 0, deletions: added ? 0 : 2 });
			const original = added ? undefined : 'one\ntwo\n';
			const modified = added ? 'one\ntwo\n' : undefined;
			const body = added ? '@@ -0,0 +1,2 @@\n+one\n+two\n' : '@@ -1,2 +0,0 @@\n-one\n-two\n';
			const headers = added ? 'new file mode 100644\nindex 0000000..abcdef0\n' : 'deleted file mode 100644\nindex 1234567..0000000\n';
			const resolved = resolveSemanticDiffFile(entry, [item], original, modified, patch(body, headers, entry));
			const [projected] = projectSemanticDiffFiles([resolved], 'group', allTypes);
			assert.deepStrictEqual({
				original: projected.original, modified: projected.modified, additions: projected.additions, deletions: projected.deletions, mappings: projected.mappings
			}, {
				original, modified, additions: item.additions, deletions: item.deletions,
				mappings: [{ hunkId: 'hunk', original: item.oldRange, canonicalModified: item.newRange, projectedModified: item.newRange }]
			});
		});
	}

	test('zero-byte added and deleted files retain absence versus empty text', () => {
		const added = { ...file, status: 'added' as const };
		const deleted = { ...file, status: 'deleted' as const };
		const a = resolveSemanticDiffFile(added, [], undefined, '', patch('', 'new file mode 100644\nindex 0000000..e69de29\n', added));
		const d = resolveSemanticDiffFile(deleted, [], '', undefined, patch('', 'deleted file mode 100644\nindex e69de29..0000000\n', deleted));
		assert.deepStrictEqual([a, d].map(file => ({ original: file.original, modified: file.modified, hunks: file.hunks })), [
			{ original: undefined, modified: '', hunks: [] }, { original: '', modified: undefined, hunks: [] }
		]);
	});

	for (const emptyOriginal of [true, false]) {
		test(`modified file ${emptyOriginal ? 'from' : 'to'} zero bytes remains present`, () => {
			const original = emptyOriginal ? '' : 'text\n';
			const modified = emptyOriginal ? 'text\n' : '';
			const item = hunk({
				oldRange: { start: emptyOriginal ? 0 : 1, count: emptyOriginal ? 0 : 1 },
				newRange: { start: emptyOriginal ? 1 : 0, count: emptyOriginal ? 1 : 0 },
				additions: emptyOriginal ? 1 : 0, deletions: emptyOriginal ? 0 : 1
			});
			const body = emptyOriginal ? '@@ -0,0 +1 @@\n+text\n' : '@@ -1 +0,0 @@\n-text\n';
			const resolved = resolveSemanticDiffFile(file, [item], original, modified, patch(body));
			assert.strictEqual(projectSemanticDiffFiles([resolved], 'group', allTypes)[0].modified, modified);
		});
	}

	test('insertion and deletion anchors at EOF include no imaginary source line', () => {
		const original = 'before\n';
		const inserted = hunk({ oldRange: { start: 1, count: 0 }, newRange: { start: 2, count: 1 }, additions: 1, deletions: 0 });
		const deleted = hunk({ oldRange: { start: 2, count: 1 }, newRange: { start: 1, count: 0 }, additions: 0, deletions: 1 });
		const a = resolveSemanticDiffFile(file, [inserted], original, 'before\nafter\n', patch('@@ -1,0 +2 @@\n+after\n'));
		const d = resolveSemanticDiffFile(file, [deleted], 'before\nafter\n', original, patch('@@ -2 +1,0 @@\n-after\n'));
		assert.deepStrictEqual([a, d].map(file => {
			const [projected] = projectSemanticDiffFiles([file], 'group', allTypes);
			return { modified: projected.modified, projectedRange: projected.mappings[0].projectedModified };
		}), [
			{ modified: 'before\nafter\n', projectedRange: { start: 2, count: 1 } },
			{ modified: 'before\n', projectedRange: { start: 1, count: 0 } }
		]);
	});

	test('renamed file uses old and new paths and preserves rename metadata', () => {
		const entry = { ...file, status: 'renamed' as const, oldPath: 'old.ts' };
		const body = '@@ -1,4 +1,4 @@\n-old\n+new\n context\n more\n end\n';
		const headers = 'similarity index 80%\nrename from old.ts\nrename to src/file.ts\nindex 1234567..abcdef0 100644\n';
		const item = hunk({ oldRange: { start: 1, count: 4 }, newRange: { start: 1, count: 4 } });
		const resolved = resolveSemanticDiffFile(entry, [item], 'old\ncontext\nmore\nend\n', 'new\ncontext\nmore\nend\n', patch(body, headers, entry));
		const [projected] = projectSemanticDiffFiles([resolved], 'group', allTypes);
		assert.deepStrictEqual({ file: projected.file, modified: projected.modified }, { file: entry, modified: 'new\ncontext\nmore\nend\n' });
	});

	test('pure renames and mode-only changes resolve without inventing textual hunks', () => {
		const renamed = { ...file, status: 'renamed' as const, oldPath: 'old.ts', contentKind: 'metadata' as const };
		const mode = { ...file, contentKind: 'metadata' as const };
		assert.deepStrictEqual([
			resolveSemanticDiffFile(renamed, [], 'same\n', 'same\n', patch('', 'similarity index 100%\nrename from old.ts\nrename to src/file.ts\n', renamed)),
			resolveSemanticDiffFile(mode, [], '', '', patch('', 'old mode 100644\nnew mode 100755\n'))
		].map(file => file.hunks), [[], []]);
	});

	test('UTF-8 octal quoted rename paths and filenames containing spaces decode exactly', () => {
		const entry = { ...file, status: 'renamed' as const, oldPath: 'old café.ts', path: 'new café.ts' };
		const text = 'diff --git "a/old caf\\303\\251.ts" "b/new caf\\303\\251.ts"\n' +
			'similarity index 80%\nrename from "old caf\\303\\251.ts"\nrename to "new caf\\303\\251.ts"\nindex 1234567..abcdef0 100644\n' +
			'--- "a/old caf\\303\\251.ts"\n+++ "b/new caf\\303\\251.ts"\n@@ -1 +1 @@\n-old\n+new\n';
		const resolved = resolveSemanticDiffFile(entry, [hunk()], 'old\n', 'new\n', text);
		assert.deepStrictEqual({ file: resolved.file, text: projectSemanticDiffFiles([resolved], 'group', allTypes)[0].modified }, { file: entry, text: 'new\n' });
	});

	for (const path of ['space b/file name.ts', 'café.ts', '雪.ts', 'quote"file.ts', 'tab\tfile.ts']) {
		test(`accepts literal and quoted Git paths: ${JSON.stringify(path)}`, () => {
			const entry = { ...file, path };
			const needsQuotes = /["\t]/.test(path);
			const quote = (text: string) => needsQuotes ? JSON.stringify(text) : text;
			const text = `diff --git ${quote(`a/${path}`)} ${quote(`b/${path}`)}\nindex 1234567..abcdef0 100644\n` +
				`--- ${quote(`a/${path}`)}${needsQuotes ? '' : '\t'}\n+++ ${quote(`b/${path}`)}${needsQuotes ? '' : '\t'}\n@@ -1 +1 @@\n-old\n+new\n`;
			assert.strictEqual(resolveSemanticDiffFile(entry, [hunk()], 'old\n', 'new\n', text).file.path, path);
		});
	}

	for (const [name, original, modified, body, count] of [
		['CRLF', 'old\r\ncontext\r\n', 'new\r\ncontext\r\n', '@@ -1,2 +1,2 @@\n-old\r\n+new\r\n context\r\n', 2],
		['mixed EOL', 'old\r\ncontext\n', 'new\ncontext\n', '@@ -1,2 +1,2 @@\n-old\r\n+new\n context\n', 2],
		['neither final newline', 'old', 'new', '@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n', 1],
		['adding final newline', 'old', 'old\n', '@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+old\n', 1],
		['removing final newline', 'old\n', 'old', '@@ -1 +1 @@\n-old\n+old\n\\ No newline at end of file\n', 1],
		['context without final newline', 'old\ncontext', 'new\ncontext', '@@ -1,2 +1,2 @@\n-old\n+new\n context\n\\ No newline at end of file\n', 2],
		['CR without final newline', 'old\r', 'new\r', '@@ -1 +1 @@\n-old\r\n\\ No newline at end of file\n+new\r\n\\ No newline at end of file\n', 1],
		['UTF-8 BOM', '\ufeffold\n', '\ufeffnew\n', '@@ -1 +1 @@\n-\ufeffold\n+\ufeffnew\n', 1]
	] as const) {
		test(`preserves exact source text: ${name}`, () => {
			const item = hunk({ oldRange: { start: 1, count }, newRange: { start: 1, count } });
			const resolved = resolveSemanticDiffFile(file, [item], original, modified, patch(body));
			const [projected] = projectSemanticDiffFiles([resolved], 'group', allTypes);
			assert.deepStrictEqual({ original: projected.original, modified: projected.modified, before: resolved.hunks[0].original, after: resolved.hunks[0].modified }, {
				original, modified, before: original, after: modified
			});
		});
	}

	test('rejects unknown groups even with all filters disabled', () => {
		const resolved = resolveSemanticDiffFile(file, [hunk()], 'old\n', 'new\n', patch('@@ -1 +1 @@\n-old\n+new\n'));
		assert.throws(() => projectSemanticDiffFiles([resolved], 'missing', new Set()), /no resolved hunks/);
		assert.throws(() => getDefaultSemanticDiffEnabledTypes([resolved], 'missing'), /no resolved hunks/);
	});

	for (const [name, mutate] of [
		['wrong old start', (item: ISemanticDiffHunk) => item.oldRange.start++],
		['wrong new start', (item: ISemanticDiffHunk) => item.newRange.start++],
		['wrong old count', (item: ISemanticDiffHunk) => item.oldRange.count++],
		['wrong new count', (item: ISemanticDiffHunk) => item.newRange.count++],
		['wrong additions', (item: ISemanticDiffHunk) => item.additions++],
		['wrong deletions', (item: ISemanticDiffHunk) => item.deletions++],
		['fractional counts', (item: ISemanticDiffHunk) => item.oldRange.count = 1.5],
		['negative counts', (item: ISemanticDiffHunk) => item.oldRange.count = -1],
		['line zero', (item: ISemanticDiffHunk) => item.newRange.start = 0],
		['unsafe number', (item: ISemanticDiffHunk) => item.newRange.start = Number.MAX_SAFE_INTEGER + 1],
		['NaN counts', (item: ISemanticDiffHunk) => item.newRange.count = NaN],
		['wrong file id', (item: ISemanticDiffHunk) => item.fileId = 'other']
	] as const) {
		test(`rejects claimed hunk mismatch: ${name}`, () => {
			const item = hunk();
			mutate(item);
			assert.throws(() => resolveSemanticDiffFile(file, [item], 'old\n', 'new\n', patch('@@ -1 +1 @@\n-old\n+new\n')), /classified hunk/);
		});
	}

	test('rejects duplicate, out-of-order, and extra claimed hunks instead of silently ignoring them', () => {
		const fixture = multiHunkFixture();
		const supplied = [
			[fixture.hunks[0], fixture.hunks[0]],
			[fixture.hunks[1], fixture.hunks[0]],
			[fixture.hunks[0], { ...fixture.hunks[1], id: fixture.hunks[0].id }],
			[...fixture.hunks, hunk()]
		];
		for (const hunks of supplied) {
			assert.throws(() => resolveSemanticDiffFile(file, hunks, fixture.original, fixture.modified, fixture.patch), /classified hunk/);
		}
	});

	for (const [name, original, modified] of [
		['old content', 'wrong\n', 'new\n'],
		['new content', 'old\n', 'wrong\n'],
		['unreported trailing change', 'old\nsame\n', 'new\nwrong\n'],
		['unreported extra target lines', 'old\n', 'new\nextra\n'],
		['missing original', undefined, 'new\n'],
		['missing modified', 'old\n', undefined],
		['missing old final newline marker', 'old', 'new\n'],
		['missing new final newline marker', 'old\n', 'new'],
		['normalizing CRLF', 'old\r\n', 'new\n']
	] as const) {
		test(`rejects source mismatch: ${name}`, () => {
			assert.throws(() => resolveSemanticDiffFile(file, [hunk()], original, modified, patch('@@ -1 +1 @@\n-old\n+new\n')), /source contents/);
		});
	}

	test('verifies context, omitted hunks, and gaps against both immutable texts', () => {
		const fixture = multiHunkFixture();
		for (const corrupted of [
			fixture.patch.replace(' line2\n', ' changed context\n'),
			fixture.patch.replace('-line1\n', '-wrong\n').replace('+inserted\n', '+wrong\n'),
			fixture.patch.replace('@@ -11,7 +12,7 @@', '@@ -11,7 +13,7 @@')
		]) {
			assert.throws(() => resolveSemanticDiffFile(file, fixture.hunks.slice(1), fixture.original, fixture.modified, corrupted), /source contents/);
		}
		assert.throws(() => resolveSemanticDiffFile(file, fixture.hunks, fixture.original, fixture.modified.replace('line8\n', 'wrong gap\n'), fixture.patch), /source contents/);
	});

	for (const path of ['', '/absolute', '../escape', 'dir/../escape', './file', 'dir//file', 'dir/', 'C:/file', 'a\\file', 'nul\0file', 'line\nfile', '\ud800']) {
		test(`rejects invalid path ${JSON.stringify(path)}`, () => {
			assert.throws(() => resolveSemanticDiffFile({ ...file, path }, [], '', '', ''), /repository-relative path/);
		});
	}

	for (const [name, body] of [
		['wrong old filename', patch('@@ -1 +1 @@\n-old\n+new\n').replace('--- a/src/file.ts', '--- a/other.ts')],
		['wrong new filename', patch('@@ -1 +1 @@\n-old\n+new\n').replace('+++ b/src/file.ts', '+++ b/other.ts')],
		['wrong Git header', patch('@@ -1 +1 @@\n-old\n+new\n').replace('diff --git a/src/file.ts', 'diff --git a/other.ts')],
		['missing headers', '@@ -1 +1 @@\n-old\n+new\n'],
		['empty', ''],
		['missing terminal patch newline', patch('@@ -1 +1 @@\n-old\n+new')],
		['duplicate file', patch('@@ -1 +1 @@\n-old\n+new\n').repeat(2)],
		['unknown header', patch('@@ -1 +1 @@\n-old\n+new\n', 'unexpected header\n')],
		['duplicate header', patch('@@ -1 +1 @@\n-old\n+new\n', 'index 1234567..abcdef0 100644\nindex 1234567..abcdef0 100644\n')],
		['absent index', patch('@@ -1 +1 @@\n-old\n+new\n', '')],
		['binary patch', patch('', 'index 1234567..abcdef0 100644\nGIT binary patch\nliteral 1\n')],
		['unsupported mode', patch('@@ -1 +1 @@\n-old\n+new\n', 'index 1234567..abcdef0 120000\n')],
		['conflicting status', patch('@@ -1 +1 @@\n-old\n+new\n', 'new file mode 100644\nindex 0000000..abcdef0\n')],
		['zero old object for modification', patch('@@ -1 +1 @@\n-old\n+new\n', 'index 0000000..abcdef0 100644\n')],
		['incomplete mode change', patch('@@ -1 +1 @@\n-old\n+new\n', 'old mode 100644\nindex 1234567..abcdef0\n')],
		['unchanged mode', patch('', 'old mode 100644\nnew mode 100644\n')],
		['empty hunk', patch('@@ -0,0 +0,0 @@\n')],
		['context-only hunk', patch('@@ -1 +1 @@\n old\n')],
		['unchanged replacement', patch('@@ -1 +1 @@\n-old\n+old\n')],
		['truncated count', patch('@@ -1,2 +1,2 @@\n-old\n+new\n')],
		['excess deletion', patch('@@ -1 +1 @@\n-old\n-old\n+new\n')],
		['extra addition', patch('@@ -1 +1 @@\n-old\n+new\n+extra\n')],
		['zero start with positive count', patch('@@ -0 +1 @@\n-old\n+new\n')],
		['negative count', patch('@@ -1,-1 +1 @@\n-old\n+new\n')],
		['huge count', patch('@@ -1,999999999999999999999 +1 @@\n-old\n+new\n')],
		['fractional range', patch('@@ -1.5 +1 @@\n-old\n+new\n')],
		['combined diff', patch('@@@ -1 -1 +1 @@@\n-old\n+new\n')],
		['orphan EOF marker', patch('@@ -1 +1 @@\n\\ No newline at end of file\n-old\n+new\n')],
		['duplicate EOF marker', patch('@@ -1 +1 @@\n-old\n\\ No newline at end of file\n\\ No newline at end of file\n+new\n')],
		['trailing EOF marker', patch('@@ -1 +1 @@\n-old\n+new\n\\ No newline at end of file\n\\ No newline at end of file\n')],
		['unknown EOF marker', patch('@@ -1 +1 @@\n-old\n+new\n\\ arbitrary marker\n')],
		['trailing garbage', patch('@@ -1 +1 @@\n-old\n+new\narbitrary\n')],
		['trailing blank line', patch('@@ -1 +1 @@\n-old\n+new\n\n')],
		['extra body without hunk header', patch('-old\n+new\n')],
		['missing new filename header', patch('@@ -1 +1 @@\n-old\n+new\n').replace('+++ b/src/file.ts\n', '')],
		['NUL in patch', patch('@@ -1 +1 @@\n-old\0\n+new\n')],
		['unpaired surrogate in ignored section header', patch('@@ -1 +1 @@ \ud800\n-old\n+new\n')],
		['invalid quote escape', patch('@@ -1 +1 @@\n-old\n+new\n').replace('a/src/file.ts b/', '"a/src/\\x66ile.ts" b/')],
		['unterminated quoted path', patch('@@ -1 +1 @@\n-old\n+new\n').replace('a/src/file.ts b/', '"a/src/file.ts b/')],
		['path header suffix', patch('@@ -1 +1 @@\n-old\n+new\n').replace('--- a/src/file.ts', '--- a/src/file.ts ignored')]
	] as const) {
		test(`rejects malformed or contradictory patch: ${name}`, () => {
			assert.throws(() => resolveSemanticDiffFile(file, [hunk()], 'old\n', 'new\n', body), /Git patch/);
		});
	}

	test('rejects invalid UTF-8 quoted bytes even when lossy decoding would match a filename', () => {
		const entry = { ...file, path: '\ufffd.ts' };
		assert.throws(() => resolveSemanticDiffFile(entry, [], '', '', 'diff --git "a/\\377.ts" "b/\\377.ts"\nold mode 100644\nnew mode 100755\n'), /Git patch/);
	});

	test('rejects overlapping or duplicate actual hunks', () => {
		const body = '@@ -1 +1 @@\n-old\n+new\n@@ -1 +1 @@\n-old\n+new\n';
		assert.throws(() => resolveSemanticDiffFile(file, [], 'old\n', 'new\n', patch(body)), /source contents/);
	});

	test('rejects duplicate insertion or deletion anchors in the actual patch', () => {
		for (const [original, modified, body] of [
			['', 'one\ntwo\n', '@@ -0,0 +1 @@\n+one\n@@ -0,0 +2 @@\n+two\n'],
			['one\ntwo\n', '', '@@ -1 +0,0 @@\n-one\n@@ -2 +0,0 @@\n-two\n']
		]) {
			assert.throws(() => resolveSemanticDiffFile(file, [], original, modified, patch(body)), /source contents/);
		}
	});

	test('rejects non-final newline markers in the middle of a source file', () => {
		const body = '@@ -1,2 +1,2 @@\n-old\n\\ No newline at end of file\n+new\n same\n';
		assert.throws(() => resolveSemanticDiffFile(file, [], 'oldsame\n', 'new\nsame\n', patch(body)), /source contents/);
	});

	test('rejects contradictory rename paths and incomplete rename headers', () => {
		const renamed = { ...file, status: 'renamed' as const, oldPath: 'old.ts' };
		for (const headers of [
			'similarity index 100%\nrename from wrong.ts\nrename to src/file.ts\n',
			'similarity index 100%\nrename from old.ts\n',
			'similarity index 101%\nrename from old.ts\nrename to src/file.ts\n',
			'rename from old.ts\nrename to src/file.ts\n'
		]) {
			assert.throws(() => resolveSemanticDiffFile(renamed, [], '', '', patch('', headers, renamed)), /Git patch/);
		}
		assert.throws(() => resolveSemanticDiffFile({ ...file, oldPath: 'old.ts' }, [], '', '', ''), /Git patch/);
		assert.throws(() => resolveSemanticDiffFile({ ...renamed, oldPath: file.path }, [], '', '', ''), /Git patch/);
	});

	test('rejects binary and non-UTF-8 text with concise content-free errors', () => {
		assert.throws(() => resolveSemanticDiffFile({ ...file, contentKind: 'binary' }, [], '', '', ''), /Binary files/);
		for (const content of ['private\0content', 'private\ud800content']) {
			assert.throws(() => resolveSemanticDiffFile(file, [], content, '', ''), error => {
				assert.ok(error instanceof Error);
				assert.strictEqual(error.message, 'Only UTF-8 text files can be projected.');
				return true;
			});
		}
	});
});
