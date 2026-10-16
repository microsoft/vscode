/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import type { IFileWriteOptions, IStat } from '../../../files/common/files.js';
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

/** Gives every write a later modification time, even within the same millisecond. */
class SequencedInMemoryFileSystemProvider extends InMemoryFileSystemProvider {
	private _clock = 0;
	private readonly _mtimes = new ResourceMap<number>();

	override async writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		await super.writeFile(resource, content, opts);
		this._mtimes.set(resource, ++this._clock);
	}

	override async stat(resource: URI): Promise<IStat> {
		const stat = await super.stat(resource);
		return { ...stat, mtime: this._mtimes.get(resource) ?? stat.mtime };
	}
}

function setup(disposables: Pick<DisposableStore, 'add'>) {
	const fileService = disposables.add(new FileService(new NullLogService()));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new SequencedInMemoryFileSystemProvider())));
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
			const prepared = await revert.prepare(resource, steps, CancellationToken.None);
			await prepared.apply();
			return prepared.outcome;
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

	test('writes nothing until applied, and undo puts back the earlier content unless the file changed since', async () => {
		const { revert, write, read } = setup(disposables);

		await write('a\nB\n');
		const prepared = await revert.prepare(resource, [step('a\nb\n', 'a\nB\n')], CancellationToken.None);
		const beforeApply = await read();
		await prepared.apply();
		const afterApply = await read();
		const undone = await prepared.undo();
		const afterUndo = await read();

		const reapplied = await revert.prepare(resource, [step('a\nb\n', 'a\nB\n')], CancellationToken.None);
		await reapplied.apply();
		await write('changed\n');
		const notUndone = await reapplied.undo();

		assert.deepStrictEqual({ beforeApply, afterApply, undone, afterUndo, notUndone, afterRefusedUndo: await read() }, {
			beforeApply: 'a\nB\n',
			afterApply: 'a\nb\n',
			undone: true,
			afterUndo: 'a\nB\n',
			notUndone: false,
			afterRefusedUndo: 'changed\n',
		});
	});

	test('can not undo recreating a file because deletion can not be conditional', async () => {
		const { revert, read } = setup(disposables);

		const prepared = await revert.prepare(resource, [step('old\n', '')], CancellationToken.None);
		await prepared.apply();
		const afterApply = await read();

		assert.deepStrictEqual({ afterApply, undone: await prepared.undo(), afterUndo: await read() }, { afterApply: 'old\n', undone: false, afterUndo: 'old\n' });
	});

	test('undo only puts back content that apply may have written', async () => {
		const { fileService, revert, write, read } = setup(disposables);
		const results: Record<string, unknown> = {};

		await write('a\nB\n');
		const conflicting = await revert.prepare(resource, [step('a\nb\n', 'a\nB\n')], CancellationToken.None);
		await write('changed\n');
		const reason = await conflicting.apply().then(() => undefined, (error: FileEditRevertConflictError) => error.reason);
		results.conflict = { reason, undone: await conflicting.undo(), content: await read() };

		await write('a\nB\n');
		const failing = await revert.prepare(resource, [step('a\nb\n', 'a\nB\n')], CancellationToken.None);
		const writeFile = fileService.writeFile.bind(fileService);
		fileService.writeFile = async (target, content, options) => {
			fileService.writeFile = writeFile;
			// The content is written, but resolving the file afterwards fails.
			await writeFile(target, content, options);
			throw new Error('stat failed');
		};
		const error = await failing.apply().then(() => undefined, (error: Error) => error.message);
		results.failedAfterWriting = { error, written: await read(), undone: await failing.undo(), content: await read() };

		assert.deepStrictEqual(results, {
			conflict: { reason: FileEditRevertConflictReason.ChangedDuringRevert, undone: true, content: 'changed\n' },
			failedAfterWriting: { error: 'stat failed', written: 'a\nb\n', undone: true, content: 'a\nB\n' },
		});
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

	test('does not overwrite a same-length change made right before the write', async () => {
		const { fileService, write, read, run } = setup(disposables);
		await write('a\nB\n');
		const writeFile = fileService.writeFile.bind(fileService);
		fileService.writeFile = async (target, content, options) => {
			fileService.writeFile = writeFile;
			// A save of the same length lands between the revert's final read and its write.
			await write('x\nY\n');
			return writeFile(target, content, options);
		};

		const outcome = await run([step('a\nb\n', 'a\nB\n')]);

		assert.deepStrictEqual({ outcome, content: await read() }, { outcome: FileEditRevertConflictReason.ChangedDuringRevert, content: 'x\nY\n' });
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
			revert.prepare(resource, [step('a\nb\nc\nd\n', 'A\nb\nc\nd\n'), step('A\nb\nC\nd\n', 'A\nb\nC\nD\n')], cts.token),
			error => error instanceof CancellationError,
		);

		assert.deepStrictEqual({ diffCalls, content: await read() }, { diffCalls: 2, content: 'A\nb\nC\nD\n' });
	});

	test('reverts several edits newest first, keeps changes made between them, and skips edits that changed nothing', async () => {
		const { write, read, run } = setup(disposables);
		const results: Record<string, unknown> = {};

		await write('s2');
		results.contiguous = { outcome: await run([step('s0', 's1'), step('s1', 's2')]), content: await read() };

		// The user changed `c` to `C` between the two edits.
		await write('A\nb\nC\nD\n');
		results.withGap = { outcome: await run([step('a\nb\nc\nd\n', 'A\nb\nc\nd\n'), step('A\nb\nC\nd\n', 'A\nb\nC\nD\n')]), content: await read() };

		// An edit in between created the file and deleted it again, which can't be merged.
		await write('A\nb\nC\nD\n');
		results.withNoOpEdit = { outcome: await run([step('a\nb\nc\nd\n', 'A\nb\nc\nd\n'), step(undefined, undefined), step('A\nb\nC\nd\n', 'A\nb\nC\nD\n')]), content: await read() };
		results.onlyNoOpEdits = { outcome: await run([step('x', 'x')]), content: await read() };

		// The second edit undid the first, so the file already has its start content.
		await write('s0');
		results.cancelledOut = { outcome: await run([step('s0', 's1'), step('s1', 's0')]), content: await read() };

		assert.deepStrictEqual(results, {
			contiguous: { outcome: FileEditRevertOutcome.Reverted, content: 's0' },
			withGap: { outcome: FileEditRevertOutcome.Reverted, content: 'a\nb\nC\nd\n' },
			withNoOpEdit: { outcome: FileEditRevertOutcome.Reverted, content: 'a\nb\nC\nd\n' },
			onlyNoOpEdits: { outcome: FileEditRevertOutcome.AlreadyReverted, content: 'a\nb\nC\nd\n' },
			cancelledOut: { outcome: FileEditRevertOutcome.AlreadyReverted, content: 's0' },
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
