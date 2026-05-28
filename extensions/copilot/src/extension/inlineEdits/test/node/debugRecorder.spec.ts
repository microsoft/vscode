/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { assert, expect, suite, test } from 'vitest';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { MutableObservableWorkspace } from '../../../../platform/inlineEdits/common/observableWorkspace';
import { LogEntry } from '../../../../platform/workspaceRecorder/common/workspaceLog';
import * as path from '../../../../util/vs/base/common/path';
import { URI } from '../../../../util/vs/base/common/uri';
import { StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { ObservableWorkspaceRecordingReplayer } from '../../common/observableWorkspaceRecordingReplayer';
import { DebugRecorder } from '../../node/debugRecorder';

suite('Debug recorder', () => {

	// like `Date.now()` but repeats the same time on every 4th invocation
	// eg 1 2 3 4 4 5 6 7 8 8 9 ...
	function createRepeatingGetNow() {
		let last = 0;
		let next = 1;
		return () => {
			const current = next;
			if (current % 4 !== 0 || last === current) {
				next += 1;
			}
			last = current;
			return current;
		};
	}

	test('enforce total ordering on events', async () => {

		function assertMonotonousTime(log: LogEntry[]) {
			let lastTime: number | undefined;
			for (const entry of log) {
				if (entry.kind === 'meta' || lastTime === undefined) {
					continue;
				}
				expect(entry.time).toBeGreaterThan(lastTime);
				lastTime = entry.time;
			}
		}

		const recordingFileContents = await fs.readFile(path.join(__dirname, 'recordings/ChangePointToPoint3D.recording.w.json'), 'utf-8');
		const recordingInfo = JSON.parse(recordingFileContents) as { log: LogEntry[] };
		const replayer = new ObservableWorkspaceRecordingReplayer(recordingInfo);
		const getNow = createRepeatingGetNow();
		const recorder = new DebugRecorder(replayer.workspace, getNow);
		replayer.replay();
		const log = recorder.getRecentLog()?.filter(e => e.kind !== 'header')?.map(e => e.kind === 'setContent' ? { ...e, content: '<omitted>' } : ('relativePath' in e ? { ...e, relativePath: e.relativePath.replace('\\', '/') } : e));
		assert(log);
		assertMonotonousTime(log);
		expect(log).toMatchInlineSnapshot(`
			[
			  {
			    "id": 0,
			    "kind": "documentEncountered",
			    "relativePath": "src/point.ts",
			    "time": 1,
			  },
			  {
			    "content": "<omitted>",
			    "id": 0,
			    "kind": "setContent",
			    "time": 1,
			    "v": 1,
			  },
			  {
			    "id": 0,
			    "kind": "opened",
			    "time": 1,
			  },
			  {
			    "id": 0,
			    "kind": "selectionChanged",
			    "selection": [
			      [
			        0,
			        0,
			      ],
			    ],
			    "time": 2,
			  },
			  {
			    "id": 0,
			    "kind": "selectionChanged",
			    "selection": [
			      [
			        12,
			        12,
			      ],
			    ],
			    "time": 3,
			  },
			  {
			    "id": 0,
			    "kind": "selectionChanged",
			    "selection": [
			      [
			        12,
			        12,
			      ],
			    ],
			    "time": 4,
			  },
			  {
			    "edit": [
			      [
			        12,
			        12,
			        "3",
			      ],
			    ],
			    "id": 0,
			    "kind": "changed",
			    "time": 5,
			    "v": 5,
			  },
			  {
			    "id": 0,
			    "kind": "selectionChanged",
			    "selection": [
			      [
			        12,
			        12,
			      ],
			    ],
			    "time": 7,
			  },
			  {
			    "id": 0,
			    "kind": "selectionChanged",
			    "selection": [
			      [
			        13,
			        13,
			      ],
			    ],
			    "time": 8,
			  },
			  {
			    "id": 1,
			    "kind": "documentEncountered",
			    "relativePath": "package.json",
			    "time": 9,
			  },
			  {
			    "content": "<omitted>",
			    "id": 1,
			    "kind": "setContent",
			    "time": 9,
			    "v": 1,
			  },
			  {
			    "id": 1,
			    "kind": "opened",
			    "time": 9,
			  },
			  {
			    "id": 1,
			    "kind": "selectionChanged",
			    "selection": [
			      [
			        0,
			        0,
			      ],
			    ],
			    "time": 10,
			  },
			  {
			    "id": 1,
			    "kind": "selectionChanged",
			    "selection": [],
			    "time": 11,
			  },
			  {
			    "edit": [
			      [
			        13,
			        13,
			        "D",
			      ],
			    ],
			    "id": 0,
			    "kind": "changed",
			    "time": 12,
			    "v": 8,
			  },
			  {
			    "id": 0,
			    "kind": "selectionChanged",
			    "selection": [
			      [
			        13,
			        13,
			      ],
			    ],
			    "time": 14,
			  },
			  {
			    "id": 0,
			    "kind": "selectionChanged",
			    "selection": [
			      [
			        14,
			        14,
			      ],
			    ],
			    "time": 15,
			  },
			]
		`);
	});

	suite('getLogInRange', () => {

		function setup() {
			const workspace = new MutableObservableWorkspace();
			let nowMs = 1000;
			const getNow = () => nowMs;
			const setNow = (n: number) => { nowMs = n; };

			const recorder = new DebugRecorder(workspace, getNow);
			const workspaceRoot = URI.parse('file:///workspace');
			const doc = workspace.addDocument({ id: DocumentId.create('file:///workspace/a.ts'), workspaceRoot, initialValue: 'hello' });

			function insertEdit(at: number, text: string): void {
				const cur = doc.value.get().value;
				doc.applyEdit(new StringEdit([StringReplacement.replace(new OffsetRange(cur.length, cur.length), text)]));
			}

			return { workspace, recorder, doc, setNow, getNow, insertEdit };
		}

		test('filters entries outside [from, to]', () => {
			const { recorder, setNow, insertEdit } = setup();

			setNow(1000); insertEdit(1000, 'a'); // before range
			setNow(2000); insertEdit(2000, 'b'); // in range
			setNow(3000); insertEdit(3000, 'c'); // in range
			setNow(4000); insertEdit(4000, 'd'); // after range

			setNow(5000);
			const log = recorder.getLogInRange(1500, 3500);

			assert(log);
			const changes = log.filter(e => e.kind === 'changed') as Extract<LogEntry, { kind: 'changed' }>[];
			expect(changes.map(c => c.time)).toEqual([2000, 3000]);
		});

		test('returns empty when no edits in range', () => {
			const { recorder, setNow, insertEdit } = setup();

			setNow(1000); insertEdit(1000, 'a');
			setNow(2000); insertEdit(2000, 'b');

			setNow(5000);
			const log = recorder.getLogInRange(3000, 4000);

			assert(log);
			// Header is always emitted; per-doc framing is skipped when no in-range entries.
			expect(log.filter(e => e.kind !== 'header')).toHaveLength(0);
		});

		test('fast-forwards baseValue when fromTimeMs > baseValueTime', () => {
			const { recorder, setNow, insertEdit } = setup();

			// Base value is 'hello' at creation (~1000)
			setNow(1500); insertEdit(1500, ' world');
			setNow(2000); insertEdit(2000, '!');
			setNow(3000); insertEdit(3000, '?');

			// Slice covers [2500, 3500]: the 'hello world!' state at 2000 should be the setContent
			setNow(3500);
			const log = recorder.getLogInRange(2500, 3500);

			assert(log);
			const setContent = log.find(e => e.kind === 'setContent') as Extract<LogEntry, { kind: 'setContent' }>;
			expect(setContent.content).toBe('hello world!');
			expect(setContent.time).toBe(2000);

			const changes = log.filter(e => e.kind === 'changed') as Extract<LogEntry, { kind: 'changed' }>[];
			expect(changes.map(c => c.time)).toEqual([3000]);
		});

		test('returns undefined when no workspace root is known', () => {
			const workspace = new MutableObservableWorkspace();
			const recorder = new DebugRecorder(workspace, () => 0);
			expect(recorder.getLogInRange(0, 1000)).toBeUndefined();
		});
	});

});

