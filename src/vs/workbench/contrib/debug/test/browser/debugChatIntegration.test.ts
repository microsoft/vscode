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

	test('paused location range is valid when the adapter reports an unknown line or column', () => {
		const session = disposables.add(createTestSession(createMockDebugModel(disposables)));
		const thread = new Thread(session, 'mockthread', 1);
		const source = new Source({ name: 'main.c', path: '/src/main.c' }, 'aDebugSessionId', mockUriIdentityService, new NullLogService());
		const pausedLocation = (range: IRange) => createPausedLocationEntry(new StackFrame(thread, 1, source, 'main', 'normal', range, 0, true)).value;

		assert.deepStrictEqual([
			pausedLocation({ startLineNumber: 5, startColumn: 3, endLineNumber: 5, endColumn: 3 }),
			// The Debug Adapter Protocol uses 0 for a line or column that is unknown
			pausedLocation({ startLineNumber: 5, startColumn: 0, endLineNumber: 5, endColumn: 0 }),
			pausedLocation({ startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 }),
		], [
			{ uri: source.uri, range: new Range(5, 3, 6, 1) },
			{ uri: source.uri, range: new Range(5, 1, 6, 1) },
			{ uri: source.uri, range: new Range(1, 1, 2, 1) },
		]);
	});
});
