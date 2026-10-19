/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { createPausedLocationEntry } from '../../browser/debugChatIntegration.js';
import { StackFrame, Thread } from '../../common/debugModel.js';
import { Source } from '../../common/debugSource.js';
import { createTestSession } from './callStack.test.js';
import { createMockDebugModel, mockUriIdentityService } from './mockDebugModel.js';

suite('Debug - Chat Integration', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createPausedLocation(range: IRange, frameName = 'main') {
		const session = disposables.add(createTestSession(createMockDebugModel(disposables)));
		const thread = new Thread(session, 'mockthread', 1);
		const source = new Source({ name: 'main.c', path: '/src/main.c' }, 'aDebugSessionId', mockUriIdentityService, new NullLogService());
		const entry = createPausedLocationEntry(new StackFrame(thread, 1, source, frameName, 'normal', range, 0, true));
		return { source, value: entry.value, modelDescription: entry.modelDescription };
	}

	test('paused location covers a valid range when the adapter reports an unknown column', () => {
		const empty = createPausedLocation({ startLineNumber: 5, startColumn: 3, endLineNumber: 5, endColumn: 3 });
		// The Debug Adapter Protocol uses 0 for a column that is unknown
		const unknownColumn = createPausedLocation({ startLineNumber: 5, startColumn: 0, endLineNumber: 5, endColumn: 0 });

		assert.deepStrictEqual(
			[empty.value, unknownColumn.value],
			[
				{ uri: empty.source.uri, range: new Range(5, 3, 6, 1) },
				{ uri: unknownColumn.source.uri, range: new Range(5, 1, 6, 1) },
			]
		);
	});

	test('paused location does not point at a line when the adapter reports an unknown line', () => {
		// The Debug Adapter Protocol uses 0 for a line that is unknown
		const unknownLine = createPausedLocation({ startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 });
		const unnamedFrame = createPausedLocation({ startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 }, '');

		assert.deepStrictEqual(
			[
				{ value: unknownLine.value, modelDescription: unknownLine.modelDescription },
				{ value: unnamedFrame.value, modelDescription: unnamedFrame.modelDescription },
			],
			[
				{ value: unknownLine.source.uri, modelDescription: 'The debugger is currently paused somewhere in this file in "main". The debug adapter did not report the line it is paused on.' },
				{ value: unnamedFrame.source.uri, modelDescription: 'The debugger is currently paused somewhere in this file. The debug adapter did not report the line it is paused on.' },
			]
		);
	});
});
