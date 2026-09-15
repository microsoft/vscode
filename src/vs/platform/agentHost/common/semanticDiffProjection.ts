/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { localize } from '../../../nls.js';
import { ISemanticDiffChangeTypeRanges, ISemanticDiffFile, ISemanticDiffHunk, ISemanticDiffRange, SemanticDiffChangeType } from './semanticDiff.js';

/** A canonical classified hunk with its exact, context-inclusive source text. */
export interface ISemanticDiffVerifiedHunk extends Readonly<Omit<ISemanticDiffHunk, 'changeTypeRanges'>> {
	readonly hasSubmittedChangeTypeRanges: boolean;
	readonly changeTypeRanges: readonly Readonly<ISemanticDiffChangeTypeRanges>[];
	readonly original: string;
	readonly modified: string;
	readonly originalChangedRanges: readonly Readonly<ISemanticDiffRange>[];
	readonly modifiedChangedRanges: readonly Readonly<ISemanticDiffRange>[];
}

export interface ISemanticDiffResolvedFile {
	readonly file: Readonly<ISemanticDiffFile>;
	readonly original: string | undefined;
	readonly modified: string | undefined;
	readonly hunks: readonly ISemanticDiffVerifiedHunk[];
}

/** Ranges use Git's one-based lines and zero-count, after-line anchors on every side. */
export interface ISemanticDiffHunkMapping {
	readonly hunkId: string;
	readonly original: Readonly<ISemanticDiffRange>;
	readonly canonicalModified: Readonly<ISemanticDiffRange>;
	readonly projectedModified: Readonly<ISemanticDiffRange>;
}

export interface ISemanticDiffProjectedFile {
	readonly file: Readonly<ISemanticDiffFile>;
	readonly original: string | undefined;
	readonly modified: string | undefined;
	readonly hunks: readonly ISemanticDiffVerifiedHunk[];
	readonly mappings: readonly ISemanticDiffHunkMapping[];
	readonly additions: number;
	readonly deletions: number;
}

interface IPatchHunk {
	readonly oldRange: ISemanticDiffRange;
	readonly newRange: ISemanticDiffRange;
	readonly original: readonly string[];
	readonly modified: readonly string[];
	readonly additions: number;
	readonly deletions: number;
	readonly originalChangedRanges: readonly ISemanticDiffRange[];
	readonly modifiedChangedRanges: readonly ISemanticDiffRange[];
}

function invalidPatch(): never {
	throw new Error(localize('semanticDiffProjection.invalidPatch', "The Git patch is malformed or does not match the classified file."));
}

function invalidSource(): never {
	throw new Error(localize('semanticDiffProjection.invalidSource', "The source contents do not match the Git comparison."));
}

function invalidHunk(): never {
	throw new Error(localize('semanticDiffProjection.invalidHunk', "A classified hunk does not match the Git comparison."));
}

function validatePath(path: string): void {
	if (!path || path.length > 4096 || /^[a-z]:/i.test(path) || /[\\\0\r\n]/.test(path) ||
		path.split('/').some(segment => !segment || segment === '.' || segment === '..') ||
		VSBuffer.fromString(path).toString() !== path) {
		throw new Error(localize('semanticDiffProjection.invalidPath', "The classified file path is not a valid repository-relative path."));
	}
}

function validateText(text: string | undefined): void {
	if (text !== undefined && (text.includes('\0') || VSBuffer.fromString(text).toString() !== text)) {
		throw new Error(localize('semanticDiffProjection.unsupportedText', "Only UTF-8 text files can be projected."));
	}
}

/** Consume a Git C-quoted UTF-8 path, or its exact unquoted spelling (which may contain spaces). */
function consumePath(text: string, start: number, expected: string): number {
	if (text[start] !== '"') {
		if (/["\\\x00-\x1f\x7f]/.test(expected) || !text.startsWith(expected, start)) {
			invalidPatch();
		}
		return start + expected.length;
	}
	const bytes: number[] = [];
	const escapes: Readonly<Record<string, number>> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };
	let position = start + 1;
	while (position < text.length && text[position] !== '"') {
		if (text[position] === '\\') {
			position++;
			const octal = /^[0-3][0-7]{2}/.exec(text.slice(position, position + 3));
			if (octal) {
				bytes.push(parseInt(octal[0], 8));
				position += 3;
			} else {
				const byte = escapes[text[position++]];
				if (byte === undefined) {
					invalidPatch();
				}
				bytes.push(byte);
			}
		} else {
			const point = text.codePointAt(position)!;
			if (point < 32 || point === 127) {
				invalidPatch();
			}
			const character = String.fromCodePoint(point);
			bytes.push(...VSBuffer.fromString(character).buffer);
			position += character.length;
		}
	}
	const encoded = VSBuffer.fromByteArray(bytes);
	const decoded = encoded.toString();
	const roundTrip = VSBuffer.fromString(decoded);
	if (text[position] !== '"' || decoded !== expected || roundTrip.byteLength !== bytes.length ||
		bytes.some((byte, index) => byte !== roundTrip.buffer[index])) {
		invalidPatch();
	}
	return position + 1;
}

function matchPath(text: string, expected: string, allowTab = false): void {
	const end = consumePath(text, 0, expected);
	if (end !== text.length && !(allowTab && text.slice(end) === '\t')) {
		invalidPatch();
	}
}

function rangeOffset(range: Readonly<ISemanticDiffRange>): number {
	return range.count === 0 ? range.start : range.start - 1;
}

function validRange(range: Readonly<ISemanticDiffRange>): boolean {
	return Number.isSafeInteger(range.start) && Number.isSafeInteger(range.count) &&
		range.start >= 0 && range.count >= 0 && range.start <= 2147483647 && range.count <= 2147483647 &&
		(range.count === 0 || range.start > 0);
}

/** Keep line terminators in the text; an empty file has no lines. */
function sourceLines(text: string | undefined): string[] {
	return text?.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function parseHunk(lines: readonly string[], start: number): { hunk: IPatchHunk; end: number } {
	const match = /^@@ -(?<oldStart>\d+)(?:,(?<oldCount>\d+))? \+(?<newStart>\d+)(?:,(?<newCount>\d+))? @@(?: [^\n]*)?$/.exec(lines[start]);
	if (!match?.groups) {
		invalidPatch();
	}
	const oldRange = { start: Number(match.groups.oldStart), count: Number(match.groups.oldCount ?? 1) };
	const newRange = { start: Number(match.groups.newStart), count: Number(match.groups.newCount ?? 1) };
	if (!validRange(oldRange) || !validRange(newRange) || oldRange.count + newRange.count === 0) {
		invalidPatch();
	}
	const original: string[] = [];
	const modified: string[] = [];
	const originalChangedRanges: ISemanticDiffRange[] = [];
	const modifiedChangedRanges: ISemanticDiffRange[] = [];
	let additions = 0;
	let deletions = 0;
	let position = start + 1;
	while (original.length < oldRange.count || modified.length < newRange.count) {
		const line = lines[position++];
		if (line === undefined || ![' ', '-', '+'].includes(line[0])) {
			invalidPatch();
		}
		let text = line.slice(1) + '\n';
		if (lines[position] === '\\ No newline at end of file') {
			text = text.slice(0, -1);
			position++;
		}
		if (line[0] === '-') {
			appendChangedLine(originalChangedRanges, oldRange.start + original.length);
		} else if (line[0] === '+') {
			appendChangedLine(modifiedChangedRanges, newRange.start + modified.length);
		}
		if (line[0] !== '+') {
			original.push(text);
		}
		if (line[0] !== '-') {
			modified.push(text);
		}
		additions += line[0] === '+' ? 1 : 0;
		deletions += line[0] === '-' ? 1 : 0;
		if (original.length > oldRange.count || modified.length > newRange.count) {
			invalidPatch();
		}
	}
	if (additions + deletions === 0 || original.join('') === modified.join('')) {
		invalidPatch();
	}
	return { hunk: { oldRange, newRange, original, modified, additions, deletions, originalChangedRanges, modifiedChangedRanges }, end: position };
}

function appendChangedLine(ranges: ISemanticDiffRange[], line: number): void {
	const last = ranges.at(-1);
	if (last && last.start + last.count === line) {
		last.count++;
	} else {
		ranges.push({ start: line, count: 1 });
	}
}

function parsePatch(file: ISemanticDiffFile, patch: string): IPatchHunk[] {
	if (!patch.endsWith('\n') || patch.includes('\0') || VSBuffer.fromString(patch).toString() !== patch) {
		invalidPatch();
	}
	const lines = patch.slice(0, -1).split('\n');
	const oldPath = file.oldPath ?? file.path;
	if (!lines[0].startsWith('diff --git ')) {
		invalidPatch();
	}
	const oldEnd = consumePath(lines[0], 'diff --git '.length, `a/${oldPath}`);
	if (lines[0][oldEnd] !== ' ' || consumePath(lines[0], oldEnd + 1, `b/${file.path}`) !== lines[0].length) {
		invalidPatch();
	}

	const headers = new Map<string, string>();
	let position = 1;
	while (position < lines.length && !lines[position].startsWith('--- ') && !lines[position].startsWith('@@')) {
		const match = /^(?<key>new file mode|deleted file mode|old mode|new mode|similarity index|dissimilarity index|rename from|rename to|index) (?<value>.+)$/.exec(lines[position++]);
		if (!match?.groups || headers.has(match.groups.key)) {
			invalidPatch();
		}
		headers.set(match.groups.key, match.groups.value);
	}
	const added = headers.has('new file mode');
	const deleted = headers.has('deleted file mode');
	const renamed = headers.has('rename from') || headers.has('rename to');
	if (added !== (file.status === 'added') || deleted !== (file.status === 'deleted') || renamed !== (file.status === 'renamed')) {
		invalidPatch();
	}
	for (const key of ['new file mode', 'deleted file mode', 'old mode', 'new mode']) {
		const mode = headers.get(key);
		if (mode !== undefined && !/^100(?:644|755)$/.test(mode)) {
			invalidPatch();
		}
	}
	if (headers.has('old mode') !== headers.has('new mode') ||
		(headers.has('old mode') && (added || deleted || headers.get('old mode') === headers.get('new mode')))) {
		invalidPatch();
	}
	if (renamed) {
		if (!headers.has('rename from') || !headers.has('rename to') || !headers.has('similarity index')) {
			invalidPatch();
		}
		matchPath(headers.get('rename from')!, oldPath);
		matchPath(headers.get('rename to')!, file.path);
	}
	for (const key of ['similarity index', 'dissimilarity index']) {
		const similarity = headers.get(key);
		if (similarity !== undefined && (!/^(?:100|[1-9]?\d)%$/.test(similarity) ||
			(key === 'similarity index' ? !renamed : file.status !== 'modified'))) {
			invalidPatch();
		}
	}
	const index = headers.get('index');
	if (index !== undefined) {
		const match = /^(?<old>[0-9a-f]{4,64})\.\.(?<new>[0-9a-f]{4,64})(?: (?<mode>100(?:644|755)))?$/.exec(index);
		if (!match?.groups || /^0+$/.test(match.groups.old) !== added || /^0+$/.test(match.groups.new) !== deleted ||
			(match.groups.mode !== undefined && (added || deleted || headers.has('old mode')))) {
			invalidPatch();
		}
	}

	const hunks: IPatchHunk[] = [];
	if (position < lines.length) {
		if (!lines[position].startsWith('--- ') || !lines[position + 1]?.startsWith('+++ ') || index === undefined) {
			invalidPatch();
		}
		matchPath(lines[position++].slice(4), added ? '/dev/null' : `a/${oldPath}`, true);
		matchPath(lines[position++].slice(4), deleted ? '/dev/null' : `b/${file.path}`, true);
		while (position < lines.length) {
			const parsed = parseHunk(lines, position);
			hunks.push(parsed.hunk);
			position = parsed.end;
		}
		if (!hunks.length) {
			invalidPatch();
		}
	}
	if (((added || deleted) && index === undefined) || (!hunks.length && file.status === 'modified' && !headers.has('old mode'))) {
		invalidPatch();
	}
	return hunks;
}

function sameLines(left: readonly string[], leftOffset: number, right: readonly string[], rightOffset: number, count: number): boolean {
	if (leftOffset < 0 || rightOffset < 0 || leftOffset + count > left.length || rightOffset + count > right.length) {
		return false;
	}
	for (let i = 0; i < count; i++) {
		if (left[leftOffset + i] !== right[rightOffset + i]) {
			return false;
		}
	}
	return true;
}

/** Resolve exactly one file's complete Git patch; unreported actual hunks are verified but not classified. */
export function resolveSemanticDiffFile(file: ISemanticDiffFile, hunks: readonly ISemanticDiffHunk[], original: string | undefined, modified: string | undefined, patch: string): ISemanticDiffResolvedFile {
	validatePath(file.path);
	if (file.oldPath !== null) {
		validatePath(file.oldPath);
	}
	if (file.status === 'renamed' ? file.oldPath === null || file.oldPath === file.path : file.oldPath !== null) {
		invalidPatch();
	}
	if (file.contentKind === 'binary') {
		throw new Error(localize('semanticDiffProjection.binary', "Binary files cannot be projected."));
	}
	if ((original === undefined) !== (file.status === 'added') || (modified === undefined) !== (file.status === 'deleted')) {
		invalidSource();
	}
	validateText(original);
	validateText(modified);
	const actualHunks = parsePatch(file, patch);
	if (file.contentKind !== 'text' && actualHunks.length) {
		invalidHunk();
	}
	const oldLines = sourceLines(original);
	const newLines = sourceLines(modified);
	let oldEnd = 0;
	let newEnd = 0;
	let previousOldStart = -1;
	let previousNewStart = -1;
	for (const hunk of actualHunks) {
		const oldStart = rangeOffset(hunk.oldRange);
		const newStart = rangeOffset(hunk.newRange);
		const gap = oldStart - oldEnd;
		if (gap < 0 || oldStart <= previousOldStart || newStart <= previousNewStart || newStart - newEnd !== gap ||
			!sameLines(oldLines, oldEnd, newLines, newEnd, gap) ||
			!sameLines(oldLines, oldStart, hunk.original, 0, hunk.oldRange.count) ||
			!sameLines(newLines, newStart, hunk.modified, 0, hunk.newRange.count)) {
			invalidSource();
		}
		oldEnd = oldStart + hunk.oldRange.count;
		newEnd = newStart + hunk.newRange.count;
		previousOldStart = oldStart;
		previousNewStart = newStart;
	}
	if (oldLines.length - oldEnd !== newLines.length - newEnd ||
		!sameLines(oldLines, oldEnd, newLines, newEnd, oldLines.length - oldEnd)) {
		invalidSource();
	}

	let previous = -1;
	const ids = new Set<string>();
	const verified = hunks.map(hunk => {
		if (hunk.fileId !== file.id || ids.has(hunk.id) || !validRange(hunk.oldRange) || !validRange(hunk.newRange)) {
			invalidHunk();
		}
		ids.add(hunk.id);
		const index = actualHunks.findIndex(actual =>
			actual.oldRange.start === hunk.oldRange.start && actual.oldRange.count === hunk.oldRange.count &&
			actual.newRange.start === hunk.newRange.start && actual.newRange.count === hunk.newRange.count);
		const actual = actualHunks[index];
		if (index <= previous || !actual || actual.additions !== hunk.additions || actual.deletions !== hunk.deletions) {
			invalidHunk();
		}
		if (hunk.reviewFocus && (
			!hunk.reviewFocus.oldRanges.every(range => actual.originalChangedRanges.some(changed => containsRange(changed, range))) ||
			!hunk.reviewFocus.newRanges.every(range => actual.modifiedChangedRanges.some(changed => containsRange(changed, range)))
		)) {
			invalidHunk();
		}
		if (hunk.changeTypeRanges && (
			!rangesExactlyCover(actual.originalChangedRanges, hunk.changeTypeRanges.flatMap(ranges => ranges.oldRanges)) ||
			!rangesExactlyCover(actual.modifiedChangedRanges, hunk.changeTypeRanges.flatMap(ranges => ranges.newRanges))
		)) {
			invalidHunk();
		}
		previous = index;
		const classification = { ...hunk.classification, secondaryChangeTypes: [...hunk.classification.secondaryChangeTypes] };
		Object.freeze(classification.secondaryChangeTypes);
		const changeTypeRanges = (hunk.changeTypeRanges ?? [{
			changeType: hunk.classification.changeType,
			oldRanges: actual.originalChangedRanges,
			newRanges: actual.modifiedChangedRanges,
		}]).map(ranges => {
			const item = {
				...ranges,
				oldRanges: ranges.oldRanges.map(range => Object.freeze({ ...range })),
				newRanges: ranges.newRanges.map(range => Object.freeze({ ...range })),
			};
			Object.freeze(item.oldRanges);
			Object.freeze(item.newRanges);
			return Object.freeze(item);
		});
		Object.freeze(changeTypeRanges);
		const reviewFocus = hunk.reviewFocus && {
			...hunk.reviewFocus,
			oldRanges: hunk.reviewFocus.oldRanges.map(range => Object.freeze({ ...range })),
			newRanges: hunk.reviewFocus.newRanges.map(range => Object.freeze({ ...range })),
		};
		if (reviewFocus) {
			Object.freeze(reviewFocus.oldRanges);
			Object.freeze(reviewFocus.newRanges);
			Object.freeze(reviewFocus);
		}
		return Object.freeze({
			...hunk,
			oldRange: Object.freeze({ ...hunk.oldRange }),
			newRange: Object.freeze({ ...hunk.newRange }),
			classification: Object.freeze(classification),
			hasSubmittedChangeTypeRanges: hunk.changeTypeRanges !== undefined,
			changeTypeRanges,
			reviewFocus,
			original: actual.original.join(''),
			modified: actual.modified.join(''),
			originalChangedRanges: Object.freeze(actual.originalChangedRanges.map(range => Object.freeze({ ...range }))),
			modifiedChangedRanges: Object.freeze(actual.modifiedChangedRanges.map(range => Object.freeze({ ...range }))),
		});
	});
	return Object.freeze({ file: Object.freeze({ ...file }), original, modified, hunks: Object.freeze(verified) });
}

function containsRange(outer: ISemanticDiffRange, inner: ISemanticDiffRange): boolean {
	return inner.start >= outer.start && inner.start + inner.count <= outer.start + outer.count;
}

function rangesExactlyCover(expected: readonly ISemanticDiffRange[], ranges: readonly ISemanticDiffRange[]): boolean {
	const normalize = (input: readonly ISemanticDiffRange[]): ISemanticDiffRange[] | undefined => {
		const result: ISemanticDiffRange[] = [];
		for (const range of input.toSorted((left, right) => left.start - right.start)) {
			const previous = result.at(-1);
			if (previous && range.start < previous.start + previous.count) {
				return undefined;
			}
			if (previous && range.start === previous.start + previous.count) {
				previous.count += range.count;
			} else {
				result.push({ ...range });
			}
		}
		return result;
	};
	const normalizedExpected = normalize(expected);
	const normalizedRanges = normalize(ranges);
	return normalizedExpected !== undefined && normalizedRanges !== undefined &&
		normalizedExpected.length === normalizedRanges.length &&
		normalizedExpected.every((range, index) => range.start === normalizedRanges[index].start && range.count === normalizedRanges[index].count);
}

function groupHunks(files: readonly ISemanticDiffResolvedFile[], groupId: string): ISemanticDiffVerifiedHunk[] {
	const hunks = files.flatMap(file => file.hunks.filter(hunk => hunk.classification.groupId === groupId));
	if (!hunks.length) {
		throw new Error(localize('semanticDiffProjection.unknownGroup', "The semantic group has no resolved hunks."));
	}
	return hunks;
}

/** Enable the highest-priority primary type present, plus unclassified hunks when present. */
export function getDefaultSemanticDiffEnabledTypes(files: readonly ISemanticDiffResolvedFile[], groupId: string): ReadonlySet<SemanticDiffChangeType | null> {
	const present = new Set(groupHunks(files, groupId).map(hunk => hunk.classification.changeType));
	const types: readonly SemanticDiffChangeType[] = ['logic', 'test', 'supporting', 'generated'];
	const highest = types.find(type => present.has(type));
	const enabled = new Set<SemanticDiffChangeType | null>();
	if (highest) {
		enabled.add(highest);
	}
	if (present.has(null)) {
		enabled.add(null);
	}
	return enabled;
}

/** Rebuild read-only presentations from the baseline, applying only the group's enabled primary hunks. */
export function projectSemanticDiffFiles(files: readonly ISemanticDiffResolvedFile[], groupId: string, enabledTypes: ReadonlySet<SemanticDiffChangeType | null>): readonly ISemanticDiffProjectedFile[] {
	groupHunks(files, groupId);
	const projected: ISemanticDiffProjectedFile[] = [];
	for (const resolved of files) {
		const hunks = resolved.hunks.filter(hunk => hunk.classification.groupId === groupId && enabledTypes.has(hunk.classification.changeType));
		if (!hunks.length) {
			continue;
		}
		const lines = sourceLines(resolved.original);
		const parts: string[] = [];
		const mappings: ISemanticDiffHunkMapping[] = [];
		let offset = 0;
		let delta = 0;
		let additions = 0;
		let deletions = 0;
		for (const hunk of hunks) {
			const start = rangeOffset(hunk.oldRange);
			parts.push(lines.slice(offset, start).join(''), hunk.modified);
			mappings.push(Object.freeze({
				hunkId: hunk.id,
				original: hunk.oldRange,
				canonicalModified: hunk.newRange,
				projectedModified: Object.freeze({ start: start + delta + (hunk.newRange.count === 0 ? 0 : 1), count: hunk.newRange.count })
			}));
			offset = start + hunk.oldRange.count;
			delta += hunk.newRange.count - hunk.oldRange.count;
			additions += hunk.additions;
			deletions += hunk.deletions;
		}
		parts.push(lines.slice(offset).join(''));
		const modified = parts.join('');
		projected.push(Object.freeze({
			file: resolved.file, original: resolved.original,
			modified: resolved.file.status === 'deleted' && modified === '' ? undefined : modified,
			hunks: Object.freeze(hunks), mappings: Object.freeze(mappings), additions, deletions
		}));
	}
	return Object.freeze(projected);
}
