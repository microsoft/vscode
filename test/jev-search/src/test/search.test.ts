/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SourceFile, chunkText, collectChunks, rankCandidates, searchLimits } from '../search';
import { RelevanceScore, scoreLocally } from '../scorer';

suite('Jev Search PoC', () => {
	test('chunks CRLF text with source ranges and line limits', () => {
		const lines = Array.from({ length: 42 }, (_, index) => `line ${index}`);
		assert.deepStrictEqual(chunkText(lines.join('\r\n'), 'file'), {
			chunks: [
				{ id: 'file:0', text: lines.slice(0, 40).join('\n'), startLine: 0, endLine: 39, endCharacter: 7 },
				{ id: 'file:40', text: lines.slice(40).join('\n'), startLine: 40, endLine: 41, endCharacter: 7 },
			],
			limitHit: false,
		});
	});

	test('bounds long lines and reports omitted content', () => {
		const text = 'x'.repeat(searchLimits.chunkCharacters + 1);
		const result = chunkText(`${text}\nnext`, 'file');
		assert.deepStrictEqual(result, {
			chunks: [
				{ id: 'file:0', text: text.slice(0, searchLimits.chunkCharacters), startLine: 0, endLine: 0, endCharacter: searchLimits.chunkCharacters },
				{ id: 'file:1', text: 'next', startLine: 1, endLine: 1, endCharacter: 4 },
			],
			limitHit: true,
		});
	});

	test('bounds the combined character count without truncating ordinary lines', () => {
		const line = 'x'.repeat(searchLimits.chunkCharacters / 2);
		const result = chunkText(`${line}\n${line}`, 'file');
		assert.deepStrictEqual({
			lengths: result.chunks.map(chunk => chunk.text.length),
			starts: result.chunks.map(chunk => chunk.startLine),
			limitHit: result.limitHit,
		}, { lengths: [3000, 3000], starts: [0, 1], limitHit: false });
	});

	test('does not create empty candidates', () => {
		assert.deepStrictEqual(chunkText('\n \r\n\t', 'file'), { chunks: [], limitHit: false });
	});

	async function* files(texts: string[]): AsyncIterable<SourceFile<string>> {
		for (const [index, text] of texts.entries()) {
			yield { resource: `${index}.ts`, size: Buffer.byteLength(text), isFile: true, readText: async () => text };
		}
	}

	test('collects at most the file budget and marks incomplete searches', async () => {
		const result = await collectChunks(files(Array.from({ length: searchLimits.files + 1 }, () => 'code')), undefined, new AbortController().signal);
		assert.deepStrictEqual({ files: result.files, chunks: result.chunks.length, limitHit: result.limitHit },
			{ files: searchLimits.files, chunks: searchLimits.files, limitHit: true });
	});

	test('does not report a limit when exactly the file budget exists', async () => {
		const result = await collectChunks(files(Array.from({ length: searchLimits.files }, () => 'code')), undefined, new AbortController().signal);
		assert.deepStrictEqual({ files: result.files, limitHit: result.limitHit }, { files: searchLimits.files, limitHit: false });
	});

	test('collects at most the chunk budget and retains source locations', async () => {
		const text = Array.from({ length: searchLimits.chunkLines * (searchLimits.chunks + 1) }, () => 'x').join('\n');
		const result = await collectChunks(files([text]), undefined, new AbortController().signal);
		assert.deepStrictEqual({
			count: result.chunks.length,
			lastResource: result.chunks.at(-1)?.resource,
			lastLine: result.chunks.at(-1)?.endLine,
			limitHit: result.limitHit,
		}, { count: searchLimits.chunks, lastResource: '0.ts', lastLine: 7999, limitHit: true });
	});

	test('skips binary and oversized text and reports the PoC size cap', async () => {
		const result = await collectChunks(files(['\0binary', 'x'.repeat(searchLimits.fileBytes + 1), 'code']), undefined, new AbortController().signal);
		assert.deepStrictEqual({
			chunks: result.chunks.map(chunk => chunk.resource),
			skipped: result.skipped,
			limitHit: result.limitHit,
		}, { chunks: ['2.ts'], skipped: 2, limitHit: true });
	});

	test('honors a stricter caller file-size limit without claiming PoC truncation', async () => {
		const result = await collectChunks(files(['too large', 'ok']), 2, new AbortController().signal);
		assert.deepStrictEqual({
			chunks: result.chunks.map(chunk => chunk.text),
			skipped: result.skipped,
			limitHit: result.limitHit,
		}, { chunks: ['ok'], skipped: 1, limitHit: false });
	});

	test('does not read an oversized file', async () => {
		async function* source(): AsyncIterable<SourceFile<string>> {
			yield {
				resource: 'large.ts', size: searchLimits.fileBytes + 1, isFile: true,
				readText: async () => assert.fail('Oversized files must not be read.'),
			};
		}
		assert.strictEqual((await collectChunks(source(), undefined, new AbortController().signal)).skipped, 1);
	});

	test('rechecks the budget against unsaved document contents', async () => {
		async function* source(): AsyncIterable<SourceFile<string>> {
			yield { resource: 'changed.ts', size: 2, isFile: true, readText: async () => 'x'.repeat(searchLimits.fileBytes + 1) };
		}
		const result = await collectChunks(source(), undefined, new AbortController().signal);
		assert.deepStrictEqual({ chunks: result.chunks, skipped: result.skipped, limitHit: result.limitHit },
			{ chunks: [], skipped: 1, limitHit: true });
	});

	test('propagates file-read errors', async () => {
		const error = new Error('File no longer exists');
		async function* source(): AsyncIterable<SourceFile<string>> {
			yield { resource: 'deleted.ts', size: 2, isFile: true, readText: async () => { throw error; } };
		}
		await assert.rejects(collectChunks(source(), undefined, new AbortController().signal), error);
	});

	test('cancellation during reading prevents late chunks', async () => {
		const controller = new AbortController();
		async function* source(): AsyncIterable<SourceFile<string>> {
			yield { resource: 'code.ts', size: 4, isFile: true, readText: async () => { controller.abort(); return 'code'; } };
		}
		await assert.rejects(collectChunks(source(), undefined, controller.signal), { name: 'AbortError' });
	});

	test('a pre-cancelled collection does not enumerate files', async () => {
		const controller = new AbortController();
		controller.abort();
		async function* source(): AsyncIterable<SourceFile<string>> {
			assert.fail('Files must not be enumerated.');
		}
		await assert.rejects(collectChunks(source(), undefined, controller.signal), { name: 'AbortError' });
	});

	test('the documented demo queries rank the expected bundled source files first', async () => {
		const folder = path.resolve(__dirname, '../../fixtures/workspace');
		const candidates = await Promise.all(['cache.ts', 'retry.ts', 'settings.ts'].map(async name => ({
			id: name,
			text: await fs.readFile(path.join(folder, name), 'utf8'),
		})));
		const actual: string[] = [];
		for (const query of ['where do we retry requests', 'expire cached entries', 'validate settings']) {
			const result = await rankCandidates(query, candidates, scoreLocally, 1, new AbortController().signal);
			actual.push(result.matches[0].candidate.id);
		}
		assert.deepStrictEqual(actual, ['retry.ts', 'cache.ts', 'settings.ts']);
	});

	test('the local demo ranks token overlap, not a fabricated model response', async () => {
		const result = await rankCandidates('where do we retry requests', [
			{ id: 'cache', text: 'function clearCache() {}' },
			{ id: 'retry', text: 'function retryRequest() {}' },
			{ id: 'request', text: 'function sendRequest() {}' },
		], scoreLocally, 20, new AbortController().signal);
		assert.deepStrictEqual(result.matches.map(match => match.candidate.id), ['retry', 'request']);
	});

	test('validates IDs, sorts scores and keeps ties stable even if responses arrive out of order', async () => {
		const candidates = ['a', 'b', 'c', 'd'].map(id => ({ id, text: id }));
		const result = await rankCandidates('query', candidates, async () => [
			{ id: 'd', score: 0 },
			{ id: 'c', score: 0.5 },
			{ id: 'b', score: 1 },
			{ id: 'a', score: 0.5 },
		], 2, new AbortController().signal);
		assert.deepStrictEqual(result, {
			matches: [{ candidate: candidates[1], score: 1 }, { candidate: candidates[0], score: 0.5 }],
			limitHit: true,
		});
	});

	test('does not expose paths or source ranges to a scorer', async () => {
		const candidate = { id: 'a', text: 'code', uri: 'file:///private/path.ts', startLine: 10 };
		await rankCandidates('query', [candidate], async (_query, candidates) => {
			assert.deepStrictEqual(candidates, [{ id: 'a', text: 'code' }]);
			return [{ id: 'a', score: 1 }];
		}, 1, new AbortController().signal);
	});

	for (const [name, scores] of [
		['missing', []],
		['unknown', [{ id: 'other', score: 1 }]],
		['too many', [{ id: 'a', score: 1 }, { id: 'a', score: 1 }]],
		['negative', [{ id: 'a', score: -1 }]],
		['too large', [{ id: 'a', score: 2 }]],
		['not finite', [{ id: 'a', score: NaN }]],
	] satisfies [string, RelevanceScore[]][]) {
		test(`rejects ${name} scores rather than returning a success-shaped fallback`, async () => {
			await assert.rejects(rankCandidates('query', [{ id: 'a', text: 'code' }], async () => scores, 1, new AbortController().signal));
		});
	}

	test('rejects duplicate responses even when the response count matches', async () => {
		await assert.rejects(rankCandidates('query', [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }], async () => [
			{ id: 'a', score: 1 }, { id: 'a', score: 0.5 },
		], 2, new AbortController().signal), /duplicate/);
	});

	test('does not invoke a scorer with no candidates', async () => {
		assert.deepStrictEqual(await rankCandidates('query', [], async () => {
			assert.fail('The scorer must not run.');
		}, 20, new AbortController().signal), { matches: [], limitHit: false });
	});

	test('cancellation prevents scoring', async () => {
		const controller = new AbortController();
		controller.abort();
		await assert.rejects(rankCandidates('query', [{ id: 'a', text: 'a' }], async () => {
			assert.fail('The scorer must not run.');
		}, 1, controller.signal), { name: 'AbortError' });
	});

	test('cancellation prevents a late response from becoming results', async () => {
		const controller = new AbortController();
		await assert.rejects(rankCandidates('query', [{ id: 'a', text: 'a' }], async () => {
			controller.abort();
			return [{ id: 'a', score: 1 }];
		}, 1, controller.signal), { name: 'AbortError' });
	});

	test('a scorer failure is propagated without a demo fallback', async () => {
		const error = new Error('Scorer unavailable');
		await assert.rejects(rankCandidates('query', [{ id: 'a', text: 'a' }], async () => {
			throw error;
		}, 1, new AbortController().signal), error);
	});

	test('rejects unbounded requests', async () => {
		const candidates = Array.from({ length: searchLimits.chunks + 1 }, (_, index) => ({ id: String(index), text: 'code' }));
		await assert.rejects(rankCandidates('query', candidates, scoreLocally, 1, new AbortController().signal), /unbounded/);
	});
});
