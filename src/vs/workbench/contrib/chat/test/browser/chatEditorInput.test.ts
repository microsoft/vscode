/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Verbosity } from '../../../../common/editor.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatEditorInput } from '../../browser/chatEditorInput.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';

suite('ChatEditorInput', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('getTitle should return name for SHORT verbosity', () => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));

		const sessionUri = URI.parse('vscode-chat-editor://chat-123');
		const input = store.add(instantiationService.createInstance(
			ChatEditorInput,
			sessionUri,
			{ title: { fallback: 'Test Chat' } }
		));

		// Short verbosity (used for tab labels) should return just the name
		const title = input.getTitle(Verbosity.SHORT);
		assert.strictEqual(title, 'Test Chat');
	});

	test('getTitle with LONG verbosity should include session type for non-local sessions', () => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		const chatSessionsService = instantiationService.get(IChatSessionsService);

		// Create input with non-local session type
		const sessionUri = URI.parse('vscode-chat-session://test-provider/session-123?chatSessionType=test-provider');
		const input = store.add(instantiationService.createInstance(
			ChatEditorInput,
			sessionUri,
			{ title: { fallback: 'Test Chat' } }
		));

		// Mock the session type contribution
		const mockContribution = {
			type: 'test-provider',
			name: 'testProvider',
			displayName: 'Test Provider',
			description: 'A test provider',
			extensionDescription: {} as any,
		};

		const originalGetAll = chatSessionsService.getAllChatSessionContributions;
		chatSessionsService.getAllChatSessionContributions = () => [mockContribution];

		try {
			// Long verbosity (used for tooltips) should include session type
			const longTitle = input.getTitle(Verbosity.LONG);
			assert.ok(longTitle.includes('Test Provider'), `Expected title to include 'Test Provider', got: ${longTitle}`);
			assert.ok(longTitle.includes('|'), `Expected title to include separator '|', got: ${longTitle}`);
		} finally {
			chatSessionsService.getAllChatSessionContributions = originalGetAll;
		}
	});

	test('getTitle with LONG verbosity should not include session type for local sessions', () => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));

		// Create input with local session (default)
		const sessionUri = URI.parse('vscode-chat-editor://chat-123');
		const input = store.add(instantiationService.createInstance(
			ChatEditorInput,
			sessionUri,
			{ title: { fallback: 'Local Chat' } }
		));

		// Long verbosity should not include session type for local sessions
		const longTitle = input.getTitle(Verbosity.LONG);
		assert.ok(!longTitle.includes('|'), `Expected title to not include separator '|' for local sessions, got: ${longTitle}`);
	});
});
