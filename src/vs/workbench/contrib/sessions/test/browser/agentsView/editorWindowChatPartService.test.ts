/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ContextKeyValue, IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IChatViewHostService } from '../../../../chat/browser/chatViewHost.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { EditorWindowChatPartService } from '../../../browser/agentsView/agentsChatPartContribution.js';
import { IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { AgentsChatViewHost } from '../../../browser/agentsView/agentsChatViewHost.js';
import { IEditorWindowSessionsPresenterService } from '../../../browser/editorWindow/editorWindowSessionsPresenter.js';
import { IEditorWindowSessionsRuntime } from '../../../browser/editorWindow/editorWindowSessionsRuntime.js';

suite('EditorWindowChatPartService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** The service, as the window starts with the chat part shown or not, recording what it does. */
	function createService(state: { visible: boolean }) {
		const events: string[] = [];
		const layoutService = upcastPartial<IWorkbenchLayoutService>({
			setChatPartAnchor: anchor => events.push(`anchor ${anchor?.viewId}`),
			onDidChangePartVisibility: Event.None,
			isVisible: part => part === Parts.CHAT_PART && state.visible,
			setPartHidden: (hidden, part) => {
				if (part === Parts.CHAT_PART) {
					state.visible = !hidden;
					events.push(hidden ? 'hide' : 'show');
				}
			},
		});
		const contextKeyService = upcastPartial<IContextKeyService>({
			createKey: <T extends ContextKeyValue>() => upcastPartial<IContextKey<T>>({ set: () => { }, reset: () => { } }),
			contextMatchesRules: () => true,
		});
		const chatPart = upcastPartial<IAgentsChatPartService>({ restore: async () => { events.push('restore'); } });
		const instantiationService = upcastPartial<IInstantiationService>({
			createInstance: (ctor: unknown) => ctor === AgentsChatViewHost
				? upcastPartial<AgentsChatViewHost>({ deactivate: () => events.push('deactivate host') })
				: toDisposable(() => { }),
			invokeFunction: <R, TS extends unknown[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R => fn(upcastPartial<ServicesAccessor>({ get: <T>(): T => chatPart as T }), ...args),
		});
		const service = disposables.add(new EditorWindowChatPartService(
			instantiationService,
			layoutService,
			contextKeyService,
			upcastPartial<ILifecycleService>({ when: () => Promise.resolve() }),
			upcastPartial<IChatViewHostService>({ registerHost: () => { events.push('register host'); return toDisposable(() => events.push('unregister host')); } }),
			upcastPartial<IEditorWindowSessionsPresenterService>({ registerPresenter: () => { events.push('register presenter'); return toDisposable(() => events.push('unregister presenter')); } }),
			upcastPartial<IEditorWindowSessionsRuntime>({ enable: () => { events.push('hold providers'); return toDisposable(() => events.push('release providers')); } }),
			upcastPartial<IAgentsChatPartFrame>({ get part() { events.push('create part'); return undefined!; }, contentCreated: constObservable(false) }),
		));
		return { service, events };
	}

	test('does nothing until a feature enables it; features share the chat part, which docks beside the anchor of the highest priority', async () => {
		const { service, events } = createService({ visible: false });
		const step = (label: string) => events.push(`-- ${label}`);

		step('nothing enabled');
		const list = service.enable({ anchorViewId: 'list', anchorPriority: 1, enabled: constObservable(true) });
		step('the list enables it');
		const view = service.enable({ anchorViewId: 'view', anchorPriority: 2, enabled: constObservable(true) });
		step('the view enables it');
		view.dispose();
		step('the view no longer does');
		list.dispose();
		await timeout(0);

		assert.deepStrictEqual(events, [
			'-- nothing enabled',
			'create part', 'hold providers', 'register host', 'register presenter', 'anchor list',
			'-- the list enables it',
			'anchor view',
			'-- the view enables it',
			'anchor list',
			'-- the view no longer does',
			'unregister host', 'deactivate host', 'unregister presenter', 'anchor undefined', 'release providers',
		]);
	});

	test('while chats do not open in it, it neither restores nor shows, and the Chat view keeps its chats; once they do, it replaces the Chat view', async () => {
		const enabled = observableValue('enabled', false);
		const { service, events } = createService({ visible: true });
		const step = (label: string) => events.push(`-- ${label}`);

		const registration = disposables.add(service.enable({ anchorViewId: 'chat', anchorPriority: 1, enabled }));
		// The window gets ready and restores
		await timeout(0);
		step('chats open in the chat part');
		enabled.set(true, undefined);
		step('they no longer do');
		enabled.set(false, undefined);
		registration.dispose();

		assert.deepStrictEqual(events, [
			'create part', 'hold providers', 'anchor chat',
			'hide',
			'-- chats open in the chat part',
			'register host', 'register presenter',
			'-- they no longer do',
			'unregister host', 'deactivate host', 'unregister presenter',
			'anchor undefined', 'release providers',
		]);
	});

	test('restores the chats it showed as the window last closed, while chats open in it', async () => {
		const { service, events } = createService({ visible: true });

		disposables.add(service.enable({ anchorViewId: 'list', anchorPriority: 1, enabled: constObservable(true) }));
		await timeout(0);

		assert.deepStrictEqual(events, ['create part', 'hold providers', 'register host', 'register presenter', 'anchor list', 'restore']);
	});
});
