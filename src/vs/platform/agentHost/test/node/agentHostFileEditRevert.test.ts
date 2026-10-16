/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostFileEditRevert, applyTextReplacements, FileEditRevertConflictError, FileEditRevertConflictReason, FileEditRevertOutcome, rebaseLineReplacements, type IFileEditRevertStep } from '../../node/agentHostFileEditRevert.js';
import { InProcessDiffComputeService } from './inProcessDiffComputeService.js';

const resource = URI.file('/repo/file.ts');

function bytes(text: string): Uint8Array {
	return VSBuffer.fromString(text).buffer;
}

function step(start: string | undefined, end: string | undefined): IFileEditRevertStep {
	return { start: start === undefined ? undefined : bytes(start), end: end === undefined ? undefined : bytes(end) };
}

function setup(disposables: Pick<DisposableStore, 'add'>) {
	const fileService = disposables.add(new FileService(new NullLogService()));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
	const diffService = new InProcessDiffComputeService();
	const revert = new AgentHostFileEditRevert(fileService, diffService);

	const write = (content: string | Uint8Array) => fileService.writeFile(resource, typeof content === 'string' ? VSBuffer.fromString(content) : VSBuffer.wrap(content));
	const read = async (): Promise<string | undefined> => {
		try {
			return (await fileService.readFile(resource)).value.toString();
		} catch {
			return undefined;
		}
	};
	const run = async (steps: readonly IFileEditRevertStep[]): Promise<FileEditRevertOutcome | FileEditRevertConflictReason> => {
		try {
			return (await revert.revert(resource, steps, CancellationToken.None)).outcome;
		} catch (error) {
			if (error instanceof FileEditRevertConflictError) {
				return error.reason;
			}
			throw error;
		}
	};
	return { fileService, diffService, revert, write, read, run };
}

suite('AgentHostFileEditRevert', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('restores the start content byte for byte when the file still has the end content', async () => {
		const { fileService, write, run } = setup(disposables);
		const start = bytes('\uFEFFone\r\ntwo\r\n');
		await write('\uFEFFone\r\nTWO\r\n');

		const outcome = await run([{ start, end: bytes('\uFEFFone\r\nTWO\r\n') }]);

		assert.deepStrictEqual({
			outcome,
			restored: (await fileService.readFile(resource)).value.equals(VSBuffer.wrap(start)),
		}, {
			outcome: FileEditRevertOutcome.Reverted,
			restored: true,
		});
	});

	test('keeps edits made after the turn on other lines, including the adjacent line', async () => {
		const { write, read, run } = setup(disposables);
		const results = [];
		for (const [current, expected] of [
			['a\nB\nc\nd\nE\n', 'a\nb\nc\nd\nE\n'],
			['a\nB\nC\nd\ne\n', 'a\nb\nC\nd\ne\n'],
			['new first line\na\nB\nc\nd\ne\n', 'new first line\na\nb\nc\nd\ne\n'],
		]) {
			await write(current);
			results.push({ outcome: await run([step('a\nb\nc\nd\ne\n', 'a\nB\nc\nd\ne\n')]), content: await read(), expected });
		}

		assert.deepStrictEqual(results.map(result => ({ outcome: result.outcome, content: result.content })), results.map(result => ({ outcome: FileEditRevertOutcome.Reverted, content: result.expected })));
	});

	test('treats a later change identical to part of the revert as already applied', async () => {
		const { write, read, run } = setup(disposables);
		await write('a\nb\nc\nD\n');

		const outcome = await run([step('a\nb\nc\nd\n', 'a\nB\nc\nD\n')]);

		assert.deepStrictEqual({ outcome, content: await read() }, { outcome: FileEditRevertOutcome.Reverted, content: 'a\nb\nc\nd\n' });
	});

	test('leaves the file untouched when a later edit changes the same lines', async () => {
		const { write, read, run } = setup(disposables);
		const results: Record<string, unknown> = {};

		await write('a\nBB\nc\n');
		results.sameLine = { outcome: await run([step('a\nb\nc\n', 'a\nB\nc\n')]), content: await read() };

		// Reverting the turn's trailing newline would join `x` to the line before it.
		await write('a\nx');
		results.lineAfterRemovedLineBreak = { outcome: await run([step('a', 'a\n')]), content: await read() };

		assert.deepStrictEqual(results, {
			sameLine: { outcome: FileEditRevertConflictReason.Overlap, content: 'a\nBB\nc\n' },
			lineAfterRemovedLineBreak: { outcome: FileEditRevertConflictReason.Overlap, content: 'a\nx' },
		});
	});

	test('reverts a BOM the turn added while keeping later edits', async () => {
		const { fileService, write, run } = setup(disposables);
		await write('\uFEFFa\nB\nc\n');

		const outcome = await run([step('a\nb\n', '\uFEFFa\nB\n')]);

		assert.deepStrictEqual({ outcome, content: Array.from((await fileService.readFile(resource)).value.buffer) }, { outcome: FileEditRevertOutcome.Reverted, content: Array.from(bytes('a\nb\nc\n')) });
	});

	test('undo puts back the earlier content unless the file changed since', async () => {
		const { revert, write, read } = setup(disposables);

		await write('a\nB\n');
		const undone = await (await revert.revert(resource, [step('a\nb\n', 'a\nB\n')], CancellationToken.None)).undo();
		const afterUndo = await read();

		const result = await revert.revert(resource, [step('a\nb\n', 'a\nB\n')], CancellationToken.None);
		await write('changed\n');
		const notUndone = await result.undo();

		assert.deepStrictEqual({ undone, afterUndo, notUndone, afterRefusedUndo: await read() }, { undone: true, afterUndo: 'a\nB\n', notUndone: false, afterRefusedUndo: 'changed\n' });
	});

	test('does nothing when the file already has its start content', async () => {
		const { fileService, write, run } = setup(disposables);
		await write('a\nb\n');
		const before = await fileService.resolve(resource, { resolveMetadata: true });

		const outcome = await run([step('a\nb\n', 'a\nB\n')]);

		assert.deepStrictEqual({
			outcome,
			mtimeUnchanged: (await fileService.resolve(resource, { resolveMetadata: true })).mtime === before.mtime,
		}, {
			outcome: FileEditRevertOutcome.AlreadyReverted,
			mtimeUnchanged: true,
		});
	});

	test('never deletes a file the turn created because deletion can not be conditional', async () => {
		const { fileService, write, read, run } = setup(disposables);
		const del = fileService.del.bind(fileService);
		let deleteCalls = 0;
		fileService.del = async (resource, options) => {
			deleteCalls++;
			await write('concurrent\n');
			return del(resource, options);
		};

		await write('new\n');
		const unchanged = { outcome: await run([step(undefined, 'new\n')]), content: await read() };
		await write('new\nmore\n');
		const edited = { outcome: await run([step(undefined, 'new\n')]), content: await read() };
		await write('');
		const emptied = { outcome: await run([step(undefined, 'new\n')]), content: await read() };

		assert.deepStrictEqual({ unchanged, edited, emptied, deleteCalls }, {
			unchanged: { outcome: FileEditRevertConflictReason.ConditionalDeleteUnavailable, content: 'new\n' },
			edited: { outcome: FileEditRevertConflictReason.Overlap, content: 'new\nmore\n' },
			emptied: { outcome: FileEditRevertConflictReason.Overlap, content: '' },
			deleteCalls: 0,
		});
	});

	test('recreates a file that the turn deleted', async () => {
		const { read, run } = setup(disposables);

		// The edit tracker records a file deleted by a tool as an edit to empty content.
		const outcome = await run([step('old\n', '')]);

		assert.deepStrictEqual({ outcome, content: await read() }, { outcome: FileEditRevertOutcome.Reverted, content: 'old\n' });
	});

	test('leaves the file untouched when it can not be merged', async () => {
		const { diffService, write, read, run } = setup(disposables);
		const results: Record<string, unknown> = {};

		await write(new Uint8Array([0xFF, 0x02]));
		results.notUtf8 = await run([{ start: new Uint8Array([0xFF, 0x00]), end: new Uint8Array([0xFF, 0x01]) }]);

		await write('a\nB\nc\nD\n');
		diffService.hitTimeout = true;
		results.diffTimeout = { outcome: await run([step('a\nb\nc\nd\n', 'a\nB\nc\nd\n')]), content: await read() };

		assert.deepStrictEqual(results, {
			notUtf8: FileEditRevertConflictReason.Overlap,
			diffTimeout: { outcome: FileEditRevertConflictReason.Overlap, content: 'a\nB\nc\nD\n' },
		});
	});

	test('does not overwrite a change made while the revert is computed', async () => {
		const { diffService, write, read, run } = setup(disposables);
		await write('a\nB\nc\nD\n');
		diffService.onDetailedDiff = async () => {
			diffService.onDetailedDiff = undefined;
			await write('concurrent\n');
		};

		const outcome = await run([step('a\nb\nc\nd\n', 'a\nB\nc\nd\n')]);

		assert.deepStrictEqual({ outcome, content: await read() }, { outcome: FileEditRevertConflictReason.ChangedDuringRevert, content: 'concurrent\n' });
	});

	test('stops a multi-step merge when it is cancelled', async () => {
		const { diffService, revert, write, read } = setup(disposables);
		const cts = disposables.add(new CancellationTokenSource());
		await write('A\nb\nC\nD\n');
		let diffCalls = 0;
		diffService.onDetailedDiff = async () => {
			if (++diffCalls === 2) {
				cts.cancel();
			}
		};

		await assert.rejects(
			revert.revert(resource, [step('a\nb\nc\nd\n', 'A\nb\nc\nd\n'), step('A\nb\nC\nd\n', 'A\nb\nC\nD\n')], cts.token),
			error => error instanceof CancellationError,
		);

		assert.deepStrictEqual({ diffCalls, content: await read() }, { diffCalls: 2, content: 'A\nb\nC\nD\n' });
	});

	test('reverts several turns newest first, keeps edits made between them, and skips turns that changed nothing', async () => {
		const { write, read, run } = setup(disposables);
		const results: Record<string, unknown> = {};

		await write('s2');
		results.contiguous = { outcome: await run([step('s0', 's1'), step('s1', 's2')]), content: await read() };

		// The user changed `c` to `C` between the two turns.
		await write('A\nb\nC\nD\n');
		results.withGap = { outcome: await run([step('a\nb\nc\nd\n', 'A\nb\nc\nd\n'), step('A\nb\nC\nd\n', 'A\nb\nC\nD\n')]), content: await read() };

		// A turn in between created the file and deleted it again, which can't be merged.
		await write('A\nb\nC\nD\n');
		results.withNoOpTurn = { outcome: await run([step('a\nb\nc\nd\n', 'A\nb\nc\nd\n'), step(undefined, undefined), step('A\nb\nC\nd\n', 'A\nb\nC\nD\n')]), content: await read() };
		results.onlyNoOpTurns = { outcome: await run([step('x', 'x')]), content: await read() };

		assert.deepStrictEqual(results, {
			contiguous: { outcome: FileEditRevertOutcome.Reverted, content: 's0' },
			withGap: { outcome: FileEditRevertOutcome.Reverted, content: 'a\nb\nC\nd\n' },
			withNoOpTurn: { outcome: FileEditRevertOutcome.Reverted, content: 'a\nb\nC\nd\n' },
			onlyNoOpTurns: { outcome: FileEditRevertOutcome.AlreadyReverted, content: 'a\nb\nC\nd\n' },
		});
	});

	test('rebaseLineReplacements detects conflicts per line, not per character', () => {
		const base = 'one two\nthree\nfour\n';
		const revert = [{ start: 0, endExclusive: 3, text: 'ONE' }];

		const sameLine = rebaseLineReplacements(base, revert, [{ start: 4, endExclusive: 7, text: 'TWO' }]);
		const insertedLineAbove = rebaseLineReplacements(base, [{ start: 8, endExclusive: 13, text: 'THREE' }], [{ start: 0, endExclusive: 0, text: 'zero\n' }]);
		const sameInsertionPoint = rebaseLineReplacements(base, [{ start: 8, endExclusive: 8, text: 'x\n' }], [{ start: 8, endExclusive: 8, text: 'y\n' }]);

		assert.deepStrictEqual({
			sameLine,
			insertedLineAbove: insertedLineAbove && applyTextReplacements('zero\n' + base, insertedLineAbove),
			sameInsertionPoint,
		}, {
			sameLine: undefined,
			insertedLineAbove: 'zero\none two\nTHREE\nfour\n',
			sameInsertionPoint: undefined,
		});
	});
});
