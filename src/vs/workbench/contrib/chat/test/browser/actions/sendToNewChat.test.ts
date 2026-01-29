/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { SendToNewChatAction } from '../../../../browser/actions/chatExecuteActions.js';
import { IChatWidget } from '../../../../browser/chat.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ChatWidget } from '../../../../browser/widget/chatWidget.js';

suite('SendToNewChatAction', () => {
	let store: DisposableStore;

	setup(() => {
		store = new DisposableStore();
	});

	teardown(() => {
		store.dispose();
	});

	test('delegates to widget.acceptInput with sendToNewChat option', async () => {
		const insta = workbenchInstantiationService(undefined, store);
		const action = new SendToNewChatAction();

		let capturedInput: string | undefined;
		let capturedOptions: any | undefined;

		const fakeWidget: Partial<IChatWidget> = {
			getInput: () => 'hello',
			acceptInput: async (input?: string, options?: any) => {
				capturedInput = input;
				capturedOptions = options;
				return undefined as any;
			}
		};

		// call action with the widget provided in the context
		await insta.invokeFunction(accessor => action.run(accessor, { widget: fakeWidget as IChatWidget }));

		assert.strictEqual(capturedInput, 'hello');
		assert.ok(capturedOptions?.sendToNewChat, 'sendToNewChat option should be set');
		assert.strictEqual(capturedOptions?.storeToHistory, true, 'storeToHistory should be true');
	});

	test('does nothing when widget is not available', async () => {
		const insta = workbenchInstantiationService(undefined, store);
		const action = new SendToNewChatAction();

		// Should not throw
		await insta.invokeFunction(accessor => action.run(accessor, undefined));
	});

	test('ChatWidget _acceptInput with sendToNewChat clears and sends to original session', async () => {
		// Build a minimal fake 'this' that mirrors the fields used by _acceptInput
		const sent: Array<{ session: string; message: string }> = [];
		let cancelledSession: string | undefined;
		let cleared = false;
		let accessibilityAccepted: string | undefined;
		let accessibilityDisposed: string | undefined;

		const fakeThis: any = {
			viewModel: { sessionResource: { toString: () => 'session:1' }, getItems: () => [] },

			getInput: () => 'editor text',
			_applyPromptFileIfSet: async () => { },
			_autoAttachInstructions: async () => { },
			chatService: {
				sendRequest: async (session: any, message: string) => {
					sent.push({ session: session.toString ? session.toString() : String(session), message });
					return {
						responseCompletePromise: Promise.resolve(),
						responseCreatedPromise: Promise.resolve({}),
						agent: {}
					};
				},
				cancelCurrentRequestForSession: (s: any) => { cancelledSession = s.toString ? s.toString() : String(s); }
			},
			chatAccessibilityService: {
				acceptRequest: (s: any) => { accessibilityAccepted = s.toString ? s.toString() : String(s); },
				disposeRequest: (s: any) => { accessibilityDisposed = s.toString ? s.toString() : String(s); },
				acceptResponse: () => { /* noop */ }
			},
			currentRequest: undefined,
			clear: async () => { cleared = true; },
			handleDelegationExitIfNeeded: async () => { /* noop */ },
			viewOptions: {},
			_location: { resolveData: () => undefined },
			input: { currentLanguageModel: undefined, currentModeKind: undefined, getAttachedContext: () => ({ asArray: () => [] }), getAttachedAndImplicitContext: () => ({ asArray: () => [] }), acceptInput: () => { /* noop */ } },
			getModeRequestOptions: () => ({}),
			updateChatViewVisibility: () => { /* noop */ },
		};

		// Call private method
		await (ChatWidget as any).prototype._acceptInput.call(fakeThis, { query: 'my request' }, { sendToNewChat: true });

		assert.strictEqual(cancelledSession, 'session:1');
		assert.strictEqual(cleared, true);
		assert.strictEqual(sent.length, 1);
		assert.strictEqual(sent[0].session, 'session:1');
		assert.strictEqual(sent[0].message, 'my request');
		assert.strictEqual(accessibilityAccepted, 'session:1');
	});
});
