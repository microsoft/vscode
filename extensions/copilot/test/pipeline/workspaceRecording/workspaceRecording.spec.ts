/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import type { HeaderLogEntry, LogEntry } from '../../../src/platform/workspaceRecorder/common/workspaceLog';
import { processWorkspaceRecordingSample } from './processWorkspaceRecording';
import {
	loadWorkspaceRecording,
	materializeWorkspaceRecordingSample,
	selectWorkspaceRecordingSamples,
	type IWorkspaceRecordingSampleDescriptor,
} from './workspaceRecording';

const header: HeaderLogEntry = {
	kind: 'header',
	documentType: 'workspaceRecording@1.0',
	repoRootUri: 'file:///private/workspace',
	time: 0,
	uuid: 'recording-id',
	revision: 4,
};

const content = 'zero\none\ntwo\nthree\n';

function userEdit(id: number, time: number, start: number, text: string, version: number): LogEntry {
	return {
		kind: 'changed',
		id,
		time,
		edit: [[start, start, text]],
		v: version,
		metadata: { source: 'cursor', kind: 'type', detailedSource: 'keyboard' },
	};
}

function generatedEdit(id: number, time: number, start: number, text: string, version: number): LogEntry {
	return {
		kind: 'changed',
		id,
		time,
		edit: [[start, start, text]],
		v: version,
		metadata: { source: 'applyEdits' },
	};
}

function acceptedEdit(id: number, time: number, start: number, text: string, version: number): LogEntry {
	return {
		kind: 'changed',
		id,
		time,
		edit: [[start, start, text]],
		v: version,
		metadata: { source: 'inlineCompletionAccept', $nes: true, $$requestUuid: 'request-id' },
	};
}

function documentPrefix(relativePath = 'src/file.ts'): LogEntry[] {
	return [
		header,
		{ kind: 'applicationStart', time: 1, commitHash: 'commit' },
		{ kind: 'documentEncountered', id: 0, time: 2, relativePath },
		{ kind: 'setContent', id: 0, time: 3, content, v: 1 },
		{ kind: 'selectionChanged', id: 0, time: 500, selection: [[0, 0]] },
	];
}

async function withRecording<T>(entries: readonly LogEntry[], run: (recordingPath: string) => Promise<T>): Promise<T> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nes-workspace-recording-test-'));
	const recordingPath = path.join(directory, 'current.workspaceRecording.jsonl');
	try {
		await fs.writeFile(recordingPath, `\n${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`);
		return await run(recordingPath);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
}

describe('workspace recording input', () => {
	it('loads a revision-4 recording with the writer\'s leading blank line', async () => {
		await withRecording(documentPrefix(), async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			expect({
				revision: recording.revision,
				entryKinds: recording.entries.map(entry => entry.kind),
				operationCount: recording.resolved.operations.length,
			}).toEqual({
				revision: 4,
				entryKinds: ['header', 'applicationStart', 'documentEncountered', 'setContent', 'selectionChanged'],
				operationCount: 2,
			});
		});
	});

	it('rejects concatenated rotations and unsafe paths', async () => {
		await withRecording([...documentPrefix(), header], async recordingPath => {
			await expect(loadWorkspaceRecording(recordingPath)).rejects.toThrow(/multiple headers/);
		});
		await withRecording(documentPrefix('../outside.ts'), async recordingPath => {
			await expect(loadWorkspaceRecording(recordingPath)).rejects.toThrow(/unsafe path segment/);
		});
	});

	it('reports the physical line for truncated JSON', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nes-workspace-recording-test-'));
		const recordingPath = path.join(directory, 'current.workspaceRecording.jsonl');
		try {
			await fs.writeFile(recordingPath, `\n${JSON.stringify(header)}\n{"kind":"changed"`);
			await expect(loadWorkspaceRecording(recordingPath)).rejects.toThrow(/line 3: invalid JSON/);
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});
});

describe('workspace recording pivot policy', () => {
	it.each([
		{ delta: 199, expectedPivotKind: 'user-edit' },
		{ delta: 200, expectedPivotKind: 'user-edit' },
		{ delta: 201, expectedPivotKind: 'cursor-move' },
	] as const)('suppresses only cursor moves up to 200 ms after a same-document edit ($delta ms)', async ({ delta, expectedPivotKind }) => {
		const entries = [
			...documentPrefix(),
			userEdit(0, 1000, content.length, 'a', 2),
			{ kind: 'selectionChanged', id: 0, time: 1000 + delta, selection: [[5, 5]] } satisfies LogEntry,
			userEdit(0, 2000, content.length + 1, 'b', 3),
			generatedEdit(0, 2100, 0, 'generated', 4),
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			expect(selectWorkspaceRecordingSamples(recording, 100).map(sample => sample.pivotKind)).toEqual([expectedPivotKind]);
		});
	});

	it('keeps a deliberate cursor move immediately before typing', async () => {
		const entries = [
			...documentPrefix(),
			{ kind: 'selectionChanged', id: 0, time: 900, selection: [[5, 5]] } satisfies LogEntry,
			userEdit(0, 1000, content.length, 'a', 2),
			userEdit(0, 1100, content.length + 1, 'b', 3),
			generatedEdit(0, 1200, 0, 'generated', 4),
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			expect(selectWorkspaceRecordingSamples(recording, 100).map(sample => sample.pivotKind)).toContain('cursor-move');
		});
	});

	it('continues a nearby oracle after a cursor move', async () => {
		const entries = [
			...documentPrefix(),
			userEdit(0, 1000, content.length, 'a', 2),
			userEdit(0, 1100, content.length + 1, 's', 3),
			{ kind: 'selectionChanged', id: 0, time: 1500, selection: [[content.indexOf('two'), content.indexOf('two')]] } satisfies LogEntry,
			acceptedEdit(0, 2000, content.length + 2, 'et', 4),
			generatedEdit(0, 2100, 0, 'generated', 5),
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			const sample = selectWorkspaceRecordingSamples(recording, 100).find(sample => sample.pivotOperationIndex === 2);
			expect({
				oracleOperationCount: sample?.oracleOperationIndices.length,
				oracleEdits: sample?.oracleEdits,
				stopReason: sample?.oracleStopReason,
			}).toEqual({
				oracleOperationCount: 2,
				oracleEdits: [[content.length + 1, content.length + 1, 'set']],
				stopReason: 'generated-edit',
			});
		});
	});

	it('stops an oracle before a generated edit', async () => {
		const entries = [
			...documentPrefix(),
			userEdit(0, 1000, content.length, 'a', 2),
			userEdit(0, 1100, content.length + 1, 'b', 3),
			generatedEdit(0, 1200, 0, 'generated', 4),
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			const first = selectWorkspaceRecordingSamples(recording, 100)[0];
			expect({
				oracleOperationCount: first.oracleOperationIndices.length,
				stopReason: first.oracleStopReason,
			}).toEqual({
				oracleOperationCount: 1,
				stopReason: 'generated-edit',
			});
		});
	});

	it('composes consecutive accepted completions with the user edit', async () => {
		const entries = [
			...documentPrefix(),
			userEdit(0, 1000, content.length, 'p', 2),
			userEdit(0, 1100, content.length + 1, 'inter', 3),
			acceptedEdit(0, 9000, content.length + 6, 'face Device', 4),
			acceptedEdit(0, 18_000, content.length + 17, 'Option {', 5),
			generatedEdit(0, 18_100, 0, 'generated', 6),
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			const first = selectWorkspaceRecordingSamples(recording, 100)[0];
			expect({
				oracleOperationCount: first.oracleOperationIndices.length,
				oracleEdits: first.oracleEdits,
				stopReason: first.oracleStopReason,
			}).toEqual({
				oracleOperationCount: 3,
				oracleEdits: [[content.length + 1, content.length + 1, 'interface DeviceOption {']],
				stopReason: 'generated-edit',
			});
		});
	});

	it('ignores no-op generated edits while collecting the oracle', async () => {
		const entries: LogEntry[] = [
			...documentPrefix(),
			userEdit(0, 1000, content.length, 'p', 2),
			userEdit(0, 1100, content.length + 1, 'inter', 3),
			{
				kind: 'changed',
				id: 0,
				time: 1200,
				edit: [[0, 1, 'z']],
				v: 4,
				metadata: { source: 'suggest' },
			},
			userEdit(0, 1300, content.length + 6, 'face', 5),
			generatedEdit(0, 1400, 0, 'generated', 6),
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			const first = selectWorkspaceRecordingSamples(recording, 100)[0];
			expect({
				oracleOperationCount: first.oracleOperationIndices.length,
				oracleEdits: first.oracleEdits,
				stopReason: first.oracleStopReason,
			}).toEqual({
				oracleOperationCount: 2,
				oracleEdits: [[content.length + 1, content.length + 1, 'interface']],
				stopReason: 'generated-edit',
			});
		});
	});

	it('omits an oracle continued by a touching generated edit', async () => {
		const entries = [
			...documentPrefix(),
			userEdit(0, 1000, content.length, 'a', 2),
			userEdit(0, 1100, content.length + 1, 'b', 3),
			generatedEdit(0, 1200, content.length + 2, 'generated', 4),
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			expect(selectWorkspaceRecordingSamples(recording, 100)).toEqual([]);
		});
	});

	it('omits an oracle continued by a touching edit after an idle gap', async () => {
		const entries = [
			...documentPrefix(),
			userEdit(0, 1000, content.length, 'a', 2),
			userEdit(0, 1100, content.length + 1, 'b', 3),
			userEdit(0, 6200, content.length + 2, 'c', 4),
			generatedEdit(0, 6300, 0, 'generated', 5),
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			expect(selectWorkspaceRecordingSamples(recording, 100)).toEqual([]);
		});
	});

	it('composes touching change operations before limiting oracle edits', async () => {
		const entries = [...documentPrefix()];
		let currentLength = content.length;
		entries.push(userEdit(0, 1000, currentLength, 'p', 2));
		currentLength++;
		for (let i = 0; i < 12; i++) {
			entries.push(userEdit(0, 1100 + i * 100, currentLength, String(i % 10), i + 3));
			currentLength++;
		}
		entries.push(generatedEdit(0, 2400, 0, 'generated', 15));
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			const first = selectWorkspaceRecordingSamples(recording, 100, 1)[0];
			const processed = processWorkspaceRecordingSample(recording, first, 0);
			try {
				expect({
					oracleOperationCount: first.oracleOperationIndices.length,
					oracleEdits: first.oracleEdits,
					processedOracleEdits: processed.isOk() ? processed.val.nextUserEdit.edit : undefined,
					stopReason: first.oracleStopReason,
				}).toEqual({
					oracleOperationCount: 12,
					oracleEdits: [[content.length + 1, content.length + 1, '012345678901']],
					processedOracleEdits: [[content.length + 1, content.length + 1, '012345678901']],
					stopReason: 'generated-edit',
				});
			} finally {
				if (processed.isOk()) {
					processed.val.replayer.dispose();
				}
			}
		});
	});

	it('limits composed non-touching oracle edits', async () => {
		const entries: LogEntry[] = [
			...documentPrefix(),
			userEdit(0, 1000, content.length, 'p', 2),
			{
				kind: 'changed',
				id: 0,
				time: 1100,
				edit: [[0, 0, 'a'], [5, 5, 'b'], [10, 10, 'c']],
				v: 3,
				metadata: { source: 'cursor', kind: 'type', detailedSource: 'keyboard' },
			},
			generatedEdit(0, 1200, content.length + 1, 'generated', 4),
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			expect(selectWorkspaceRecordingSamples(recording, 100, 2)[0].oracleEdits).toEqual([
				[0, 0, 'a'],
				[5, 5, 'b'],
			]);
		});
	});

	it('omits samples whose oracle reaches the end of the recording', async () => {
		const entries = [
			...documentPrefix(),
			userEdit(0, 1000, content.length, 'a', 2),
			userEdit(0, 1100, content.length + 1, 'b', 3),
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			expect(selectWorkspaceRecordingSamples(recording, 100)).toEqual([]);
		});
	});

	it('omits an oracle that composes to no edit', async () => {
		const entries: LogEntry[] = [
			...documentPrefix(),
			userEdit(0, 1000, content.length, 'p', 2),
			userEdit(0, 1100, content.length + 1, 'x', 3),
			{
				kind: 'changed',
				id: 0,
				time: 1200,
				edit: [[content.length + 1, content.length + 2, '']],
				v: 4,
				metadata: { source: 'cursor', kind: 'type', detailedSource: 'keyboard' },
			},
			generatedEdit(0, 1300, 0, 'generated', 5),
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			expect(selectWorkspaceRecordingSamples(recording, 100).some(sample => sample.pivotOperationIndex === 2)).toBe(false);
		});
	});

	it('evenly caps selected pivots deterministically', async () => {
		const entries = [...documentPrefix()];
		let currentLength = content.length;
		let version = 2;
		for (let i = 0; i < 103; i++) {
			const time = 1000 + i * 300;
			entries.push(userEdit(0, time, currentLength, 'x', version++));
			currentLength++;
			entries.push(userEdit(0, time + 100, currentLength, 'y', version++));
			currentLength++;
			entries.push(generatedEdit(0, time + 200, 0, 'g', version++));
			currentLength++;
		}
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			const all = selectWorkspaceRecordingSamples(recording, 1000);
			const capped = selectWorkspaceRecordingSamples(recording, 100);
			expect({
				all: all.length,
				capped: capped.length,
				first: capped[0].pivotOperationIndex,
				last: capped.at(-1)?.pivotOperationIndex,
				one: selectWorkspaceRecordingSamples(recording, 1).map(sample => sample.pivotOperationIndex),
				none: selectWorkspaceRecordingSamples(recording, 0),
			}).toEqual({
				all: 103,
				capped: 100,
				first: all[0].pivotOperationIndex,
				last: all.at(-1)?.pivotOperationIndex,
				one: [all[0].pivotOperationIndex],
				none: [],
			});
		});
	});

	it('drops identical inputs with conflicting cursor labels', async () => {
		const entries: LogEntry[] = [
			...documentPrefix(),
			{ kind: 'setContent', id: 0, time: 400_000, content, v: 2 },
			userEdit(0, 400_100, 0, '', 3),
			userEdit(0, 400_200, 0, '', 4),
			{ kind: 'selectionChanged', id: 0, time: 400_500, selection: [[content.indexOf('two'), content.indexOf('two')]] },
			generatedEdit(0, 499_800, 0, '', 5),
			{ kind: 'selectionChanged', id: 0, time: 499_900, selection: [[0, 0]] },
			{ kind: 'setContent', id: 0, time: 800_000, content, v: 6 },
			userEdit(0, 800_100, 0, '', 7),
			userEdit(0, 800_200, 0, '', 8),
			{ kind: 'selectionChanged', id: 0, time: 800_500, selection: [[content.indexOf('three'), content.indexOf('three')]] },
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			expect(selectWorkspaceRecordingSamples(recording, 100)).toEqual([]);
		});
	});
});

describe('workspace recording materialization', () => {
	it('inlines a restore whose stored content predates the context window', async () => {
		const entries: LogEntry[] = [
			header,
			{ kind: 'documentEncountered', id: 0, time: 1000, relativePath: 'src/file.ts' },
			{ kind: 'setContent', id: 0, time: 900, content, v: 1 },
			{ kind: 'storeContent', id: 0, time: 1001, contentId: 'content-hash', v: 1 },
			{ kind: 'restoreContent', id: 0, time: 400_000, contentId: 'content-hash', v: 2 },
			{ kind: 'selectionChanged', id: 0, time: 400_050, selection: [[0, 0]] },
			userEdit(0, 400_100, content.length, 'a', 3),
			userEdit(0, 400_200, content.length + 1, 'b', 4),
			generatedEdit(0, 400_300, 0, 'generated', 5),
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			const descriptor = selectWorkspaceRecordingSamples(recording, 100)[0];
			const sample = materializeWorkspaceRecordingSample(recording, descriptor);
			const processed = processWorkspaceRecordingSample(recording, descriptor, 0);
			try {
				expect({
					kinds: sample.entries.map(entry => entry.kind),
					contextTruncated: sample.provenance.contextTruncated,
					processed: processed.isOk(),
				}).toEqual({
					kinds: ['meta', 'documentEncountered', 'setContent', 'selectionChanged', 'changed', 'changed'],
					contextTruncated: true,
					processed: true,
				});
			} finally {
				if (processed.isOk()) {
					processed.val.replayer.dispose();
				}
			}
		});
	});

	it('removes raw identifiers, events, metadata, and absolute timestamps', async () => {
		const entries: LogEntry[] = [
			...documentPrefix(),
			{
				kind: 'event',
				time: 600,
				data: {
					sourceId: 'InlineCompletions.fetch',
					kind: 'end',
					requestId: 1,
					error: undefined,
					result: [],
					correlationId: 'correlation',
				},
			},
			userEdit(0, 1000, content.length, 'a', 2),
			userEdit(0, 1100, content.length + 1, 'b', 3),
			generatedEdit(0, 1200, 0, 'generated', 4),
		];
		await withRecording(entries, async recordingPath => {
			const recording = await loadWorkspaceRecording(recordingPath);
			const descriptor: IWorkspaceRecordingSampleDescriptor = selectWorkspaceRecordingSamples(recording, 100)[0];
			const serialized = JSON.stringify(materializeWorkspaceRecordingSample(recording, descriptor));
			for (const forbidden of ['recording-id', 'commitHash', 'sourceId', 'correlationId', 'metadata', '$$requestUuid', 'file:///private/workspace']) {
				expect(serialized).not.toContain(forbidden);
			}
			expect(serialized).toContain('file:///workspace');
		});
	});
});
