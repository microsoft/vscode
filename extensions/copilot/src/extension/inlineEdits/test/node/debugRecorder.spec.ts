/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { assert, expect, suite, test } from 'vitest';
import { LogEntry } from '../../../../platform/workspaceRecorder/common/workspaceLog';
import * as path from '../../../../util/vs/base/common/path';
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

});

