/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { findTranscriptContextEntry, getGettingReadyMessage, NewChatView, shouldShowGettingReady } from '../../browser/chatView.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';
import { NewChatWidget } from '../../browser/newChatWidget.js';
import { IChatRequestTranscriptContextVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { URI } from '../../../../../base/common/uri.js';

suite('Sessions - Chat View', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards new chat visibility to the aquarium host', () => {
		const forwarded: boolean[] = [];
		const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), {
			_widget: Object.assign(Object.create(NewChatWidget.prototype), {
				setHostVisible: (visible: boolean) => forwarded.push(visible),
			}),
		});

		view.setVisible(false);
		view.setVisible(true);

		assert.deepStrictEqual(forwarded, [false, true]);
	});

	test('does not forward aquarium visibility to the peer chat composer', () => {
		const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), {
			_widget: Object.create(NewChatInSessionWidget.prototype),
		});

		assert.doesNotThrow(() => view.setVisible(false));
	});

	test('shows getting ready until a hidden bootstrap completes or visible content appears', () => {
		assert.deepStrictEqual({
			empty: shouldShowGettingReady(0, 0, undefined),
			hiddenPending: shouldShowGettingReady(1, 0, true),
			hiddenComplete: shouldShowGettingReady(1, 0, false),
			visiblePending: shouldShowGettingReady(2, 1, true),
		}, {
			empty: true,
			hiddenPending: true,
			hiddenComplete: false,
			visiblePending: false,
		});
	});

	test('shows current worktree activity while getting ready', () => {
		assert.deepStrictEqual({
			activity: getGettingReadyMessage(true, 'Creating isolated worktree (42%)', 'Getting ready...'),
			fallback: getGettingReadyMessage(true, undefined, 'Getting ready...'),
			visibleRequest: getGettingReadyMessage(false, 'Creating isolated worktree (42%)', 'Getting ready...'),
		}, {
			activity: 'Creating isolated worktree (42%)',
			fallback: 'Getting ready...',
			visibleRequest: undefined,
		});
	});

	test('finds transcript context in hidden request attachments', () => {
		const attachment: IChatRequestTranscriptContextVariableEntry = {
			kind: 'transcriptContext',
			id: 'pr',
			name: 'PR',
			value: '{}',
			uri: URI.parse('https://github.com/owner/repo/pull/42'),
		};

		assert.strictEqual(findTranscriptContextEntry([{
			variableData: { variables: [] },
			attachedContext: [attachment],
		}]), attachment);
	});
});
