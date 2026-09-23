/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { ChatSessionHandoffController } from '../../electron-browser/chatSessionHandoff.js';

suite('ChatSessionHandoff', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves hidden state after the first handoff in this window', async () => {
		const openedSessions: string[] = [];
		const visibilityBySession = new Map<string, boolean>();
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override getAllWidgets(): readonly IChatWidget[] {
				return Array.from(visibilityBySession, ([resource, visible]) => createChatWidget(URI.parse(resource), visible));
			}
		}();

		const controller = new ChatSessionHandoffController(chatWidgetService, () => true, async sessionResource => {
			openedSessions.push(sessionResource.toString());
			return true;
		});
		const session = URI.parse('test:/session');

		visibilityBySession.set(session.toString(), false);
		await controller.open(session);
		await controller.open(session);
		visibilityBySession.set(session.toString(), true);
		await controller.open(session);
		await controller.open(URI.parse('test:/new'));

		assert.deepStrictEqual(openedSessions, ['test:/session', 'test:/session', 'test:/new']);
	});

	test('retries unsuccessful opens', async () => {
		const session = URI.parse('test:/session');
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override getAllWidgets(): readonly IChatWidget[] {
				return [createChatWidget(session, false)];
			}
		}();
		const results = [false, true];
		let attempts = 0;
		const controller = new ChatSessionHandoffController(chatWidgetService, () => true, async () => results[attempts++]);

		await controller.open(session);
		await controller.open(session);
		await controller.open(session);

		assert.strictEqual(attempts, 2);
	});

	test('coalesces concurrent opens', async () => {
		const session = URI.parse('test:/session');
		const pendingOpen = new DeferredPromise<boolean>();
		let attempts = 0;
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override getAllWidgets(): readonly IChatWidget[] {
				return [];
			}
		}();
		const controller = new ChatSessionHandoffController(chatWidgetService, () => true, async () => {
			attempts++;
			return pendingOpen.p;
		});

		const first = controller.open(session);
		const second = controller.open(session);
		pendingOpen.complete(true);
		await Promise.all([first, second]);

		assert.strictEqual(attempts, 1);
	});

	test('waits for a pending open before preserving hidden state', async () => {
		const session = URI.parse('test:/session');
		const pendingOpen = new DeferredPromise<boolean>();
		let visible = true;
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override getAllWidgets(): readonly IChatWidget[] {
				return [createChatWidget(session, visible)];
			}
		}();
		let attempts = 0;
		const controller = new ChatSessionHandoffController(chatWidgetService, () => true, async () => {
			attempts++;
			return attempts === 1 ? true : pendingOpen.p;
		});

		await controller.open(session);
		const second = controller.open(session);
		visible = false;
		let thirdResolved = false;
		const third = controller.open(session).then(() => thirdResolved = true);
		await Promise.resolve();
		const resolvedWhilePending = thirdResolved;
		pendingOpen.complete(true);
		await Promise.all([second, third]);

		assert.deepStrictEqual({ attempts, resolvedWhilePending, thirdResolved }, { attempts: 2, resolvedWhilePending: false, thirdResolved: true });
	});

	test('does not treat an inactive Chat editor as a hidden Chat view', async () => {
		const session = URI.parse('test:/session');
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override getAllWidgets(): readonly IChatWidget[] {
				return [createChatWidget(session, false)];
			}
		}();
		let attempts = 0;
		const controller = new ChatSessionHandoffController(chatWidgetService, () => false, async () => {
			attempts++;
			return true;
		});

		await controller.open(session);
		await controller.open(session);

		assert.strictEqual(attempts, 2);
	});
});

function createChatWidget(sessionResource: URI, visible: boolean): IChatWidget {
	return new class extends mock<IChatWidget>() {
		override readonly visible = visible;
		override readonly viewModel = new class extends mock<NonNullable<IChatWidget['viewModel']>>() {
			override readonly sessionResource = sessionResource;
		}();
	}();
}
