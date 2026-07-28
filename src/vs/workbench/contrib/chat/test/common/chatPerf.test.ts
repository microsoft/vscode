/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { getMarks } from '../../../../../base/common/performance.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatPerfMark, clearChatMarks, markChat } from '../../common/chatPerf.js';

suite('chatPerf', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let sessionResource: URI;

	setup(() => {
		sessionResource = URI.parse(`test://session/${Date.now()}`);
	});

	teardown(() => {
		clearChatMarks(sessionResource);
	});

	test('markChat emits a mark with the expected prefix', () => {
		markChat(sessionResource, ChatPerfMark.RequestStart);

		const marks = getMarks().filter(m => m.name.includes(sessionResource.toString()));
		assert.strictEqual(marks.length, 1);
		assert.ok(marks[0].name.startsWith('code/chat/'));
		assert.ok(marks[0].name.endsWith('/request/start'));
	});

	test('clearChatMarks removes all marks for the session', () => {
		markChat(sessionResource, ChatPerfMark.RequestStart);
		markChat(sessionResource, ChatPerfMark.FirstToken);

		clearChatMarks(sessionResource);

		const marks = getMarks().filter(m => m.name.includes(sessionResource.toString()));
		assert.strictEqual(marks.length, 0);
	});

	test('clearChatMarks does not affect marks from a different session', () => {
		const otherSession = URI.parse(`test://session/other-${Date.now()}`);
		markChat(sessionResource, ChatPerfMark.RequestStart);
		markChat(otherSession, ChatPerfMark.FirstToken);

		clearChatMarks(sessionResource);

		const remaining = getMarks().filter(m => m.name.includes(otherSession.toString()));
		assert.strictEqual(remaining.length, 1);

		clearChatMarks(otherSession);
	});
});
