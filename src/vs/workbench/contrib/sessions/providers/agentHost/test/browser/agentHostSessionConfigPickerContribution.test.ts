/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IActionViewItemService } from '../../../../../../../platform/actions/browser/actionViewItemService.js';
import { isIMenuItem, MenuRegistry } from '../../../../../../../platform/actions/common/actions.js';
import { SessionConfigKey } from '../../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult } from '../../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IWorkbenchLayoutService } from '../../../../../../services/layout/browser/layoutService.js';
import { ISessionHost, ISessionHostService } from '../../../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../../../../services/sessions/common/session.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatPhoneInputPresenter } from '../../../../../chat/browser/widget/input/chatPhoneInputPresenter.js';
import { Menus } from '../../../../browser/menus.js';
import { ISessionsProvidersService } from '../../../../browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../browser/sessionsService.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { AgentHostSessionConfigPickerContribution } from '../../browser/agentHostSessionConfigPicker.js';

suite('AgentHostSessionConfigPickerContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const config: ResolveSessionConfigResult = {
		schema: {
			type: 'object',
			properties: {
				[SessionConfigKey.Isolation]: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'], default: 'folder' },
				[SessionConfigKey.Branch]: { type: 'string', title: 'Branch', enum: ['main'], default: 'main' },
			},
		},
		values: {},
	};

	function sessionOf(sessionId: string): { session: ISession; chat: IChat } {
		const resource = URI.parse(`agent-host-copilot:/${sessionId}`);
		const chat = upcastPartial<IChat>({ resource: resource.with({ fragment: `chat-of-${sessionId}` }) });
		const mainChat = upcastPartial<IChat>({ resource });
		return { session: upcastPartial<ISession>({ sessionId, providerId: LOCAL_AGENT_HOST_PROVIDER_ID, resource, mainChat: constObservable(mainChat) }), chat };
	}

	function hostShowing(shown: IObservable<{ session: ISession; chat: IChat } | undefined>): ISessionHost {
		return upcastPartial<ISessionHost>({ session: shown.map(value => value?.session), chat: shown.map(value => value?.chat) });
	}

	function setup(options: { panes?: readonly { session: ISession; chat: IChat }[] } = {}) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const configResources: string[] = [];
		const provider = upcastPartial<IAgentHostSessionsProvider>({
			id: LOCAL_AGENT_HOST_PROVIDER_ID,
			onDidChangeSessionConfig: new Emitter<string>().event,
			getSessionConfig: (_sessionId, chat) => {
				configResources.push(chat.toString());
				return config;
			},
			getCreateSessionConfig: () => ({}),
		});
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			onDidChangeProviders: Event.None,
			getProviders: () => [provider],
			getProvider: <T>() => provider as T,
		}));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			slotPanes: constObservable((options.panes ?? []).map(pane => ({ session: constObservable(pane.session), chat: constObservable(pane.chat) }))) as unknown as ISessionsService['slotPanes'],
		}));
		const hosts = observableValue<readonly ISessionHost[]>('hosts', []);
		instantiationService.stub(ISessionHostService, upcastPartial<ISessionHostService>({ hosts }));
		instantiationService.stub(IActionViewItemService, upcastPartial<IActionViewItemService>({ register: () => Disposable.None }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ mainContainer: document.createElement('div') }));
		instantiationService.stub(IChatPhoneInputPresenter, upcastPartial<IChatPhoneInputPresenter>({}));
		const contribution = store.add(instantiationService.createInstance(AgentHostSessionConfigPickerContribution));
		return { hosts, contribution, configResources };
	}

	function pickersOf(sessionId: string): string[] {
		return MenuRegistry.getMenuItems(Menus.NewSessionRepositoryConfig)
			.filter(isIMenuItem)
			.filter(item => item.when?.serialize().includes(`'${sessionId}'`))
			.map(item => item.command.title as string)
			.sort();
	}

	test('registers the repository pickers of the draft a chat window composer shows, with the chat it shows', () => {
		const { hosts, configResources } = setup();
		const draft = sessionOf('chat-window-draft');
		hosts.set([hostShowing(constObservable(draft))], undefined);

		assert.deepStrictEqual({ pickers: pickersOf('chat-window-draft'), configResources: [...new Set(configResources)] }, {
			pickers: ['Branch', 'Isolation'],
			configResources: [draft.chat.resource.toString()],
		});
	});

	test('registers a session a pane and a host both show once', () => {
		const shown = sessionOf('shared');
		const { hosts } = setup({ panes: [shown] });
		hosts.set([hostShowing(constObservable(shown))], undefined);

		assert.deepStrictEqual(pickersOf('shared'), ['Branch', 'Isolation']);
	});

	test('moves the pickers with the session a host shows and drops them with the host', () => {
		const { hosts } = setup();
		const first = sessionOf('first');
		const second = sessionOf('second');
		const shown = observableValue<{ session: ISession; chat: IChat } | undefined>('shown', first);
		hosts.set([hostShowing(shown)], undefined);
		const initial = { first: pickersOf('first'), second: pickersOf('second') };

		shown.set(second, undefined);
		const switched = { first: pickersOf('first'), second: pickersOf('second') };

		hosts.set([], undefined);
		const removed = { first: pickersOf('first'), second: pickersOf('second') };

		assert.deepStrictEqual({ initial, switched, removed }, {
			initial: { first: ['Branch', 'Isolation'], second: [] },
			switched: { first: [], second: ['Branch', 'Isolation'] },
			removed: { first: [], second: [] },
		});
	});

	test('drops the pickers when the contribution is disposed', () => {
		const { hosts, contribution } = setup();
		hosts.set([hostShowing(constObservable(sessionOf('disposed')))], undefined);
		const before = pickersOf('disposed');

		contribution.dispose();

		assert.deepStrictEqual({ before, after: pickersOf('disposed') }, { before: ['Branch', 'Isolation'], after: [] });
	});
});
