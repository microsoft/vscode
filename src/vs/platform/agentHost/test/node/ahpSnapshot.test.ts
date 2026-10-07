/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AhpSnapshotRecorder } from './e2e/harness/ahpSnapshot.js';

suite('AhpSnapshotRecorder', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes only registered fixture URLs in error results and retains them across message clears', () => {
		const recorder = new AhpSnapshotRecorder();
		recorder.setFixtureUrl('auth', 'http://127.0.0.1:43123');
		recorder.clear();
		recorder.record('c2s', { id: 1, method: 'authenticate', params: {} });
		recorder.record('s2c', {
			id: 1,
			error: { code: -32602, message: 'Wrong resource http://127.0.0.1:43123/protected; unrelated http://127.0.0.1:43234 stays unchanged' },
		});
		const snapshot = recorder.serialize();
		assert.deepStrictEqual({
			placeholder: snapshot.includes('${url_auth}/protected'),
			stalePort: snapshot.includes('43123'),
			unregistered: snapshot.includes('http://127.0.0.1:43234'),
		}, { placeholder: true, stalePort: false, unregistered: true });
	});

	test('omits tool success by provider name before snapshot normalization', () => {
		const recorder = new AhpSnapshotRecorder();
		recorder.record('s2c', {
			method: 'action',
			params: {
				channel: 'ahp-chat://session/chat',
				action: {
					type: ActionType.ChatToolCallStart,
					turnId: 'turn-1',
					toolCallId: 'tool-1',
					toolName: 'bash',
					displayName: 'Run command',
				},
			},
		});
		recorder.record('s2c', {
			method: 'action',
			params: {
				channel: 'ahp-chat://session/chat',
				action: {
					type: ActionType.ChatToolCallComplete,
					turnId: 'turn-1',
					toolCallId: 'tool-1',
					result: { success: false },
				},
			},
		});

		const snapshot = recorder.serialize({
			profile: 'behavior',
			omitToolCallSuccessForToolNames: ['bash'],
		});

		assert.deepStrictEqual({
			normalizedToolName: snapshot.includes('toolName: ${shell}'),
			includesSuccess: snapshot.includes('success:'),
		}, {
			normalizedToolName: true,
			includesSuccess: false,
		});
	});
});
