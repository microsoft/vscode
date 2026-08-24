/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { buildOpenSessionLinkUri } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { ILinkPresentationProvider, ILinkPresentationService } from '../../../../../platform/dataChannel/common/dataChannel.js';
import { IOpener, IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionLinkChatState, ISessionLinkState, OpenSessionLinkOpenerContribution, readSessionState } from '../../browser/openSessionLinkOpener.contribution.js';

suite('OpenSessionLinkOpenerContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens deep session and chat links in the Agents window', async () => {
		let registeredOpener: IOpener | undefined;
		const openerService = new class extends mock<IOpenerService>() {
			override registerOpener(opener: IOpener): IDisposable {
				registeredOpener = opener;
				return Disposable.None;
			}
		};
		const sessionResource = URI.parse('copilotcli:/session-1');
		const session = upcastPartial<ISession>({ resource: sessionResource });
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override getSessions(): ISession[] {
				return [session];
			}
		};
		const opened: string[] = [];
		const sessionsService = new class extends mock<ISessionsService>() {
			override async openSession(resource: URI): Promise<void> {
				opened.push(`session:${resource.toString()}`);
			}

			override async openChat(_session: ISession, resource: URI): Promise<void> {
				opened.push(`chat:${resource.toString()}`);
			}
		};
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			override resolveSessionResource() {
				return undefined;
			}
		};
		const linkPresentationService = new class extends mock<ILinkPresentationService>() {
			override registerLinkPresentationProvider(): IDisposable {
				return Disposable.None;
			}
		};
		store.add(new OpenSessionLinkOpenerContribution(
			openerService,
			sessionsManagementService,
			sessionsService,
			connectionsService,
			linkPresentationService,
		));

		if (!registeredOpener) {
			throw new Error('Expected the contribution to register an opener');
		}

		assert.deepStrictEqual({
			results: [
				await registeredOpener.open(buildOpenSessionLinkUri(sessionResource)),
				await registeredOpener.open(buildOpenSessionLinkUri(sessionResource, 'chat-2')),
			],
			opened,
		}, {
			results: [true, true],
			opened: [
				'session:copilotcli:/session-1',
				'chat:copilotcli:/session-1#chat-2',
			],
		});
	});

	test('uses a contextual placeholder without opening the linked chat', () => {
		const sessionResource = URI.parse('copilotcli:/session-1');
		const chatResource = sessionResource.with({ fragment: 'chat-2' });
		const chat = upcastPartial<IChat>({
			resource: chatResource,
			title: observableValue('chatTitle', 'Resolved chat'),
			status: observableValue('chatStatus', SessionStatus.Completed),
		});
		const chats = observableValue<readonly IChat[]>('chats', []);
		const session = upcastPartial<ISession>({
			resource: sessionResource,
			title: observableValue('sessionTitle', 'Parent session'),
			description: observableValue('sessionDescription', undefined),
			status: observableValue('sessionStatus', SessionStatus.Completed),
			chats,
		});
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;

			override getSessions(): ISession[] {
				return [session];
			}
		};
		let presentationProvider: ILinkPresentationProvider | undefined;
		const linkPresentationService = new class extends mock<ILinkPresentationService>() {
			override registerLinkPresentationProvider(_registration: Parameters<ILinkPresentationService['registerLinkPresentationProvider']>[0], provider: ILinkPresentationProvider): IDisposable {
				presentationProvider = provider;
				return Disposable.None;
			}
		};
		store.add(new OpenSessionLinkOpenerContribution(
			new class extends mock<IOpenerService>() {
				override registerOpener(): IDisposable { return Disposable.None; }
			},
			sessionsManagementService,
			new class extends mock<ISessionsService>() { },
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResource() { return undefined; }
			},
			linkPresentationService,
		));

		const watcher = presentationProvider?.createLinkPresentationWatcher(URI.parse(buildOpenSessionLinkUri(sessionResource, 'chat-2')));
		if (!watcher) {
			throw new Error('Expected the contribution to register a link presentation provider');
		}
		store.add(watcher);

		const placeholder = watcher.presentation.get();
		chats.set([chat], undefined);
		assert.deepStrictEqual({
			placeholder,
			resolved: watcher.presentation.get(),
		}, {
			placeholder: {
				kind: 'chat',
				title: 'Chat · Parent session',
				status: { kind: 'success', label: 'Completed' },
				tooltip: 'Chat · Parent session · Completed',
				ariaLabel: 'Agent chat Chat · Parent session, Completed',
			},
			resolved: {
				kind: 'chat',
				title: 'Resolved chat',
				status: { kind: 'success', label: 'Completed' },
				tooltip: 'Resolved chat · Completed',
				ariaLabel: 'Agent chat Resolved chat, Completed',
			},
		});
	});

	test('reactively reads the targeted chat state', () => {
		const chatStatus = observableValue('chatStatus', SessionStatus.Completed);
		const chat: ISessionLinkChatState = {
			resource: URI.parse('agent-host-copilotcli:/session?unused=true#peer'),
			title: observableValue('chatTitle', 'Peer chat'),
			status: chatStatus,
		};
		const chats = observableValue<readonly ISessionLinkChatState[]>('chats', []);
		const session: ISessionLinkState = {
			title: observableValue('sessionTitle', 'Parent session'),
			description: observableValue('sessionDescription', { value: 'Session details' }),
			status: observableValue('sessionStatus', SessionStatus.InProgress),
			chats,
		};
		const values: unknown[] = [];
		store.add(autorun(reader => {
			values.push(readSessionState(session, 'peer', reader));
		}));

		chats.set([chat], undefined);
		chatStatus.set(SessionStatus.NeedsInput, undefined);

		assert.deepStrictEqual(values, [
			{
				kind: 'chat',
				title: 'Chat · Parent session',
				detail: 'Session details',
				status: { kind: 'pending', label: 'Working' },
				tooltip: 'Chat · Parent session · Working',
				ariaLabel: 'Agent chat Chat · Parent session, Working',
			},
			{
				kind: 'chat',
				title: 'Peer chat',
				detail: 'Session details',
				status: { kind: 'success', label: 'Completed' },
				tooltip: 'Peer chat · Completed',
				ariaLabel: 'Agent chat Peer chat, Completed',
			},
			{
				kind: 'chat',
				title: 'Peer chat',
				detail: 'Session details',
				status: { kind: 'warning', label: 'Needs input' },
				tooltip: 'Peer chat · Needs input',
				ariaLabel: 'Agent chat Peer chat, Needs input',
			},
		]);
	});
});
