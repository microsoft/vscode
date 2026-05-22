/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { shouldShowOpenEditorsContext } from '../../../browser/actions/chatContext.js';
import { IChatWidget } from '../../../browser/chat.js';

function widget(overrides: Partial<Pick<IChatWidget, 'viewModel' | 'lockedAgentId'>>): Pick<IChatWidget, 'viewModel' | 'lockedAgentId'> {
	return {
		viewModel: undefined,
		lockedAgentId: undefined,
		...overrides,
	} as Pick<IChatWidget, 'viewModel' | 'lockedAgentId'>;
}

function widgetWithSession(sessionResource: URI): Pick<IChatWidget, 'viewModel' | 'lockedAgentId'> {
	return widget({
		viewModel: { sessionResource } as IChatWidget['viewModel'],
	});
}

suite('ChatContext', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('shows Open Editors for regular Copilot CLI sessions with eligible editors', () => {
		assert.strictEqual(
			shouldShowOpenEditorsContext(widgetWithSession(URI.parse('copilotcli:/session-1')), true),
			true
		);
	});

	test('hides Open Editors for Agent Host sessions with eligible editors', () => {
		assert.strictEqual(
			shouldShowOpenEditorsContext(widgetWithSession(URI.parse('agent-host-copilotcli:/session-1')), true),
			false
		);
	});

	test('hides Open Editors for locked Agent Host ids without a session resource', () => {
		assert.strictEqual(
			shouldShowOpenEditorsContext(widget({ lockedAgentId: 'agent-host-copilotcli' }), true),
			false
		);
	});

	test('hides Open Editors when there are no eligible editors', () => {
		assert.strictEqual(
			shouldShowOpenEditorsContext(widgetWithSession(URI.parse('copilotcli:/session-1')), false),
			false
		);
	});
});
