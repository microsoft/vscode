/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import {
	CANDIDATES,
	PROJECT_CONTEXT_BYTE_CAP,
	type ProjectContext,
	type ProjectContextSource,
	capContents,
	pickFirst,
} from '../src/agents/AgentsMdLoader';
import { formatProjectContextSection } from '../src/chat/WorkspaceContextProvider';

// The integrated `AgentsMdLoader` constructor and watcher path call
// `vscode.workspace.createFileSystemWatcher` and `vscode.Uri.joinPath` —
// surfaces that depend on a real extension host runtime. We instead exercise
// the loader through its decomposed pieces:
//
//   * `pickFirst` drives the priority order over an injected `tryRead`,
//     letting us emulate a multi-file workspace with a plain `Map`.
//   * `capContents` is pure and deterministic: byte cap, paragraph
//     boundary, line boundary fallback, truncation flag.
//   * `formatProjectContextSection` is pure and verifies the markdown the
//     workspace context provider emits for the loaded snapshot.
//
// Together these cover the documented behaviour without booting an
// extension host or a live filesystem watcher.

function makeReader(files: ReadonlyMap<string, string>):
	(relPath: string, source: ProjectContextSource) => Promise<ProjectContext | undefined> {
	return async (relPath, source) => {
		const text = files.get(relPath);
		if (text === undefined) {
			return undefined;
		}
		const { contents, truncated } = capContents(text, PROJECT_CONTEXT_BYTE_CAP);
		return {
			source,
			path: `/workspace/${relPath}`,
			contents,
			truncated,
		};
	};
}

suite('AgentsMdLoader', () => {

	suite('pickFirst priority order', () => {
		test('returns the .son-of-anton/AGENTS.md entry when all three candidates exist', async () => {
			const files = new Map([
				['.son-of-anton/AGENTS.md', '# fork rules\n'],
				['AGENTS.md', '# universal rules\n'],
				['CLAUDE.md', '# claude rules\n'],
			]);
			const result = await pickFirst(CANDIDATES, makeReader(files));
			assert.deepStrictEqual(
				{ source: result.source, contents: result.contents.trim() },
				{ source: '.son-of-anton/AGENTS.md', contents: '# fork rules' },
			);
		});

		test('falls back to AGENTS.md when the fork-private file is absent', async () => {
			const files = new Map([
				['AGENTS.md', '# universal\n'],
				['CLAUDE.md', '# claude\n'],
			]);
			const result = await pickFirst(CANDIDATES, makeReader(files));
			assert.deepStrictEqual(
				{ source: result.source, contents: result.contents.trim() },
				{ source: 'AGENTS.md', contents: '# universal' },
			);
		});

		test('falls back to CLAUDE.md when both AGENTS.md variants are absent', async () => {
			const files = new Map([['CLAUDE.md', '# claude only\n']]);
			const result = await pickFirst(CANDIDATES, makeReader(files));
			assert.deepStrictEqual(
				{ source: result.source, contents: result.contents.trim() },
				{ source: 'CLAUDE.md', contents: '# claude only' },
			);
		});

		test('returns the empty "none" context when no candidate exists', async () => {
			const result = await pickFirst(CANDIDATES, makeReader(new Map()));
			assert.deepStrictEqual(
				{ source: result.source, contents: result.contents, truncated: result.truncated },
				{ source: 'none', contents: '', truncated: false },
			);
		});
	});

	suite('capContents truncation', () => {
		test('returns the input unchanged when under the cap', () => {
			const result = capContents('# small\n\nbody\n', PROJECT_CONTEXT_BYTE_CAP);
			assert.deepStrictEqual(result, { contents: '# small\n\nbody\n', truncated: false });
		});

		test('sets truncated:true and stays under the byte cap when input exceeds 8KB', () => {
			// Build a deterministic >8KB input with paragraph boundaries so the
			// truncator can pick a clean break point.
			const paragraph = 'Lorem ipsum dolor sit amet. '.repeat(20).trim();
			const raw = Array.from({ length: 50 }, (_, i) => `## Section ${i + 1}\n\n${paragraph}`).join('\n\n');
			assert.ok(raw.length > PROJECT_CONTEXT_BYTE_CAP, 'fixture must exceed cap');

			const { contents, truncated } = capContents(raw, PROJECT_CONTEXT_BYTE_CAP);
			const byteLength = new TextEncoder().encode(contents).length;

			assert.deepStrictEqual(
				{
					truncated,
					underCap: byteLength <= PROJECT_CONTEXT_BYTE_CAP,
					nonEmpty: contents.length > 0,
					endsCleanly: !contents.endsWith(' '),
				},
				{ truncated: true, underCap: true, nonEmpty: true, endsCleanly: true },
			);
		});

		test('prefers paragraph boundaries over arbitrary cuts when truncating', () => {
			// Two paragraphs separated by a blank line; cap chosen so the cut
			// would otherwise land inside the second paragraph.
			const first = 'A'.repeat(40);
			const second = 'B'.repeat(40);
			const raw = `${first}\n\n${second}`;
			// Cap of 60 is past the paragraph break (at byte 40+2 = 42) but
			// before the second paragraph ends. We force the helper down its
			// paragraph branch by ensuring the break is past byteCap/2.
			const { contents, truncated } = capContents(raw, 60);
			assert.deepStrictEqual(
				{
					truncated,
					endsAtFirstParagraph: contents === first,
				},
				{ truncated: true, endsAtFirstParagraph: true },
			);
		});
	});

	suite('formatProjectContextSection', () => {
		test('returns empty string for the "none" source so callers can omit the section', () => {
			const result = formatProjectContextSection({
				source: 'none',
				contents: '',
				truncated: false,
			});
			assert.strictEqual(result, '');
		});

		test('emits a blockquoted section labelled with the source filename', () => {
			const result = formatProjectContextSection({
				source: 'CLAUDE.md',
				path: '/repo/CLAUDE.md',
				contents: '# Project\nUse tabs.\nNever ship secrets.',
				truncated: false,
			});
			assert.deepStrictEqual(
				{
					hasHeader: result.startsWith('**Project Context** (from CLAUDE.md):'),
					hasBlockquote: result.includes('\n> # Project\n> Use tabs.\n> Never ship secrets.'),
					hasTruncationPointer: result.includes('truncated to 8KB'),
				},
				{ hasHeader: true, hasBlockquote: true, hasTruncationPointer: false },
			);
		});

		test('appends a truncation pointer with the absolute path when the loader truncated the file', () => {
			const result = formatProjectContextSection({
				source: 'AGENTS.md',
				path: '/repo/AGENTS.md',
				contents: '# header\nbody line',
				truncated: true,
			});
			assert.deepStrictEqual(
				{
					hasHeader: result.startsWith('**Project Context** (from AGENTS.md):'),
					hasPointer: result.includes('_(truncated to 8KB; full file at /repo/AGENTS.md)_'),
				},
				{ hasHeader: true, hasPointer: true },
			);
		});

		test('drops the section entirely when the loaded contents are blank', () => {
			const result = formatProjectContextSection({
				source: 'AGENTS.md',
				path: '/repo/AGENTS.md',
				contents: '   \n\n',
				truncated: false,
			});
			assert.strictEqual(result, '');
		});

		test('caps the inline preview at the inline-line-limit and marks it truncated even when the loader did not', () => {
			const longBody = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`).join('\n');
			const result = formatProjectContextSection({
				source: 'AGENTS.md',
				path: '/repo/AGENTS.md',
				contents: longBody,
				truncated: false,
			});
			assert.deepStrictEqual(
				{
					includesLine50: result.includes('Line 50'),
					includesLine51: result.includes('Line 51'),
					hasPointer: result.includes('truncated to 8KB'),
				},
				{ includesLine50: true, includesLine51: false, hasPointer: true },
			);
		});
	});
});
