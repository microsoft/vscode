/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatWidgetService } from '../../../../browser/chat.js';
import { ChatRequestOriginPart } from '../../../../browser/widget/chatContentParts/chatRequestOriginPart.js';
import { ChatRequestOriginKind, ChatRequestOriginService, IChatRequestOriginService } from '../../../../common/chatRequestOrigin.js';
import { IChatService } from '../../../../common/chatService/chatService.js';
import { ChatSideChatService, IChatSideChatService } from '../../../../common/chatSideChatService.js';

suite('ChatRequestOriginPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders accessible delegation provenance and opens its source', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const sourceSessionResource = URI.parse('agent-host-codex:/source-thread');
		const opened = new DeferredPromise<URI>();
		const originService = disposables.add(new ChatRequestOriginService());
		const sideChatService = disposables.add(new ChatSideChatService());
		disposables.add(originService.registerOpener({
			open: async origin => {
				opened.complete(origin.sourceSessionResource);
				return true;
			},
		}));
		instantiationService.stub(IChatRequestOriginService, originService);
		instantiationService.stub(IChatSideChatService, sideChatService);
		instantiationService.stub(IChatService, new class extends mock<IChatService>() { });
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() { });

		const part = disposables.add(instantiationService.createInstance(
			ChatRequestOriginPart,
			URI.parse('agent-host-codex:/child-thread'),
			{
				kind: ChatRequestOriginKind.Delegation,
				sourceSessionResource,
			},
		));
		part.domNode.click();

		assert.deepStrictEqual({
			text: part.domNode.textContent,
			role: part.domNode.getAttribute('role'),
			tabIndex: part.domNode.tabIndex,
			ariaLabel: part.domNode.getAttribute('aria-label'),
			delegationClass: part.domNode.classList.contains('delegation'),
			opened: await opened.p,
		}, {
			text: 'Sent by Codex from another chat',
			role: 'button',
			tabIndex: 0,
			ariaLabel: 'Sent by Codex from another chat. Select to open the source chat.',
			delegationClass: true,
			opened: sourceSessionResource,
		});
	});

	test('distinguishes delegation from another chat in the same session', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IChatRequestOriginService, disposables.add(new ChatRequestOriginService()));
		instantiationService.stub(IChatSideChatService, disposables.add(new ChatSideChatService()));
		instantiationService.stub(IChatService, new class extends mock<IChatService>() { });
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() { });

		const part = disposables.add(instantiationService.createInstance(
			ChatRequestOriginPart,
			URI.parse('agent-host-copilot:/session#target'),
			{
				kind: ChatRequestOriginKind.Delegation,
				sourceSessionResource: URI.parse('agent-host-session://copilot/session?chat=source&turn=turn-1'),
				delegationScope: 'chat',
			},
		));

		assert.deepStrictEqual({
			text: part.domNode.textContent,
			ariaLabel: part.domNode.getAttribute('aria-label'),
		}, {
			text: 'Sent from another chat',
			ariaLabel: 'Sent from another chat. Select to open the source.',
		});
	});

	test('preserves side chat source presentation and navigation', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const sideChatResource = URI.parse('agent-host-codex:/session#side-chat');
		const sourceSessionResource = URI.parse('agent-host-codex:/session');
		const revealed = new DeferredPromise<URI>();
		const sideChatService = disposables.add(new ChatSideChatService());
		disposables.add(sideChatService.registerProvider({
			canAskInSideChat: () => false,
			askInSideChat: async () => { },
			observeSideChatOrigin: () => constObservable({
				sourceSessionResource,
				sourceTurnId: 'turn-1',
				sourceTitle: 'Source chat',
				selection: { text: 'Selected code' },
			}),
			revealSideChatSource: async resource => revealed.complete(resource),
		}));
		instantiationService.stub(IChatRequestOriginService, disposables.add(new ChatRequestOriginService()));
		instantiationService.stub(IChatSideChatService, sideChatService);
		instantiationService.stub(IChatService, new class extends mock<IChatService>() { });
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() { });

		const part = disposables.add(instantiationService.createInstance(ChatRequestOriginPart, sideChatResource, undefined));
		part.domNode.click();

		assert.deepStrictEqual({
			text: part.domNode.textContent,
			ariaLabel: part.domNode.getAttribute('aria-label'),
			delegationClass: part.domNode.classList.contains('delegation'),
			revealed: await revealed.p,
		}, {
			text: 'Source chatSelected code',
			ariaLabel: 'Side chat about Source chat: Selected code. Select to show the original message.',
			delegationClass: false,
			revealed: sideChatResource,
		});
	});
});
