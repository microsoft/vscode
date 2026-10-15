/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mockObject, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatWidget } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatViewModel } from '../../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession } from '../../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { SessionsAgentHostPolicyContinuationPresenter } from '../../browser/agentHostPolicyContinuationPresenter.js';
import { LocalAgentHostSessionsProvider } from '../../browser/localAgentHostSessionsProvider.js';

suite('Sessions Agent Host policy continuation presenter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sourceResource = URI.parse('agent-host-claude:/source');
	const target = URI.parse('agent-host-copilotcli:/copy');
	const other = URI.parse('agent-host-copilotcli:/other');

	function setup() {
		const services = store.add(new TestInstantiationService());
		const state = { sourceCurrent: true, switchDuringResolve: false, switchDuringTrust: false, canOpen: true };
		const opened: string[] = [];
		const resolved: string[] = [];
		const activeChat = observableValue('activeChat', upcastPartial<IChat>({ resource: sourceResource }));
		const destination = upcastPartial<ISession>({ resource: target, providerId: LOCAL_AGENT_HOST_PROVIDER_ID });
		const provider: LocalAgentHostSessionsProvider = Object.assign(Object.create(LocalAgentHostSessionsProvider.prototype), {
			resolveCreatedSession: async (resource: URI) => {
				resolved.push(resource.toString());
				if (state.switchDuringResolve) { activeChat.set(upcastPartial<IChat>({ resource: other }), undefined); }
				return destination;
			},
		});
		const providers = mockObject<ISessionsProvidersService>()();
		providers.getProvider.callsFake((providerId: string) => {
			assert.strictEqual(providerId, LOCAL_AGENT_HOST_PROVIDER_ID);
			return provider;
		});
		services.stub(ISessionsProvidersService, { getProvider: providers.getProvider });
		services.stub(ISessionsService, {
			activeSession: constObservable(upcastPartial<IActiveSession>({ activeChat })),
			canOpenSession: async session => {
				assert.strictEqual(session, destination);
				if (state.switchDuringTrust) { activeChat.set(upcastPartial<IChat>({ resource: other }), undefined); }
				return state.canOpen;
			},
			openSession: async resource => { opened.push(resource.toString()); },
		});
		const source = upcastPartial<IChatWidget>({ viewModel: upcastPartial<ChatViewModel>({ sessionResource: sourceResource }) });
		const presenter = services.createInstance(SessionsAgentHostPolicyContinuationPresenter);
		return {
			state, opened, resolved, activeChat,
			open: () => presenter.open(target, source, () => {
				if (!state.sourceCurrent) { throw new CancellationError(); }
			}),
		};
	}

	test('resolves the local provider copy and opens it through the Sessions service', async () => {
		const { open, opened, resolved } = setup();
		await open();
		assert.deepStrictEqual({ resolved, opened }, { resolved: [target.toString()], opened: [target.toString()] });
	});

	for (const phase of ['resolve', 'trust'] as const) {
		test('preserves a newer active chat selected during ' + phase, async () => {
			const { open, opened, state, activeChat } = setup();
			state.switchDuringResolve = phase === 'resolve';
			state.switchDuringTrust = phase === 'trust';
			await assert.rejects(open(), CancellationError);
			const cancelledNavigation = [...opened];
			state.switchDuringResolve = false;
			state.switchDuringTrust = false;
			activeChat.set(upcastPartial<IChat>({ resource: sourceResource }), undefined);
			await open();
			assert.deepStrictEqual({ cancelledNavigation, opened }, { cancelledNavigation: [], opened: [target.toString()] });
		});
	}

	test('retains the source when opening is declined', async () => {
		const { open, opened, state } = setup();
		state.canOpen = false;
		await assert.rejects(open(), CancellationError);
		state.canOpen = true;
		await open();
		assert.deepStrictEqual(opened, [target.toString()]);
	});
});
