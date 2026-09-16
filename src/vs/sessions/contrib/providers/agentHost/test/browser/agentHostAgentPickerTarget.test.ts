/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Action } from '../../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IChatWidgetService } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatMode, IChatMode } from '../../../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatService } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionContext, SessionContext } from '../../../../../services/sessions/browser/sessionContext.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { IChat } from '../../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ModePicker, ModePickerModel } from '../../../copilotChatSessions/browser/modePicker.js';
import { AgentHostAgentPickerContribution } from '../../browser/agentHostAgentPicker.js';

suite('AgentHostAgentPickerTarget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function setup() {
		const instantiation = workbenchInstantiationService(undefined, store);
		const select = store.add(new Emitter<IChatMode>());
		instantiation.stubInstance(ModePicker, { onDidSelect: select.event, dispose() { } });
		instantiation.stubInstance(ModePickerModel, { setSession() { }, dispose() { } });
		const globalActiveSession = constObservable(undefined);
		instantiation.stub(ISessionsService, { activeSession: globalActiveSession });
		instantiation.stub(IChatService, { getSession: () => undefined });
		instantiation.stub(IChatWidgetService, { onDidAddWidget: Event.None, onDidChangeFocusedSession: Event.None });
		instantiation.stub(ILogService, new NullLogService());
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
			override setAgent = sinon.spy();
		}();
		instantiation.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			constructor(private readonly provider: ISessionsProvider) { super(); }

			override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
				return providerId === this.provider.id ? this.provider as T : undefined;
			}
		}(provider));
		const factories = new Map<MenuId, IActionViewItemFactory>();
		instantiation.stub(IActionViewItemService, {
			register: (menu, _command, factory) => {
				factories.set(menu, factory);
				return toDisposable(() => factories.delete(menu));
			},
		});
		store.add(instantiation.createInstance(AgentHostAgentPickerContribution));
		const childChat = new class extends mock<IChat>() {
			override readonly resource = URI.parse('agent-host-copilotcli:/session#child');
		}();
		const activeChat = observableValue<IChat>('activeChat', childChat);
		const session = new class extends mock<IActiveSession>() {
			override readonly resource = URI.parse('agent-host-copilotcli:/session');
			override readonly sessionId = 'owning-session';
			override readonly providerId = LOCAL_AGENT_HOST_PROVIDER_ID;
			override readonly mode = constObservable(undefined);
			override readonly activeChat = activeChat;
		}();
		const scope = store.add(instantiation.createChild(new ServiceCollection(
			[ISessionContext, new SessionContext(constObservable(session))],
		)));
		const factory = factories.get(MenuId.ChatInput);
		assert.ok(factory);
		const item = factory(store.add(new Action('sessions.agentHost.agentPicker')), {}, scope, 1);
		assert.ok(item);
		store.add(item);
		return { provider, select, session, childChat, activeChat, globalActiveSession };
	}

	test('choosing and clearing an agent targets the scoped child without activating the main session', () => {
		const h = setup();
		const mode = new class extends mock<IChatMode>() {
			override readonly id = 'agent://review';
			override readonly name = constObservable('Review');
		}();
		h.select.fire(mode);
		h.select.fire(ChatMode.Agent);
		assert.deepStrictEqual({
			calls: h.provider.setAgent.getCalls().map(call => call.args),
			globalActiveSession: h.globalActiveSession.get(),
		}, {
			calls: [
				[h.session.sessionId, { uri: mode.id, name: 'Review' }, h.childChat.resource],
				[h.session.sessionId, undefined, h.childChat.resource],
			],
			globalActiveSession: undefined,
		});
	});

	test('a reused picker follows the scoped active child at invocation time', () => {
		const h = setup();
		const otherChild = new class extends mock<IChat>() {
			override readonly resource = URI.parse('agent-host-copilotcli:/session#other-child');
		}();
		h.activeChat.set(otherChild, undefined);
		h.select.fire(ChatMode.Agent);
		assert.deepStrictEqual(h.provider.setAgent.firstCall.args, [h.session.sessionId, undefined, otherChild.resource]);
	});
});
