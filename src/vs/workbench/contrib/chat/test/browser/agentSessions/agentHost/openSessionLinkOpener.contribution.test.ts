/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { waitForState } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { buildOpenSessionLinkUri } from '../../../../../../../platform/agentHost/common/openSessionLink.js';
import { ILinkPresentationProvider, ILinkPresentationProviderRegistration, ILinkPresentationService } from '../../../../../../../platform/dataChannel/common/dataChannel.js';
import { IOpener, IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IPathService } from '../../../../../../services/path/common/pathService.js';
import { AgentHostOpenSessionLinkOpenerContribution } from '../../../../browser/agentSessions/agentHost/openSessionLinkOpener.contribution.js';
import { ISessionSummaryHoverService } from '../../../../browser/agentSessions/sessionSummaryHoverService.js';
import { IChatWidget, IChatWidgetService } from '../../../../browser/chat.js';
import { ChatRequestOriginKind, ChatRequestOriginService } from '../../../../common/chatRequestOrigin.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionsService } from '../../../../common/chatSessionsService.js';

suite('AgentHostOpenSessionLinkOpenerContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens a delegated request-origin link through the same opener as an agent-host-session:// URI', async () => {
		let registeredOpener: IOpener | undefined;
		const openerService = new class extends mock<IOpenerService>() {
			override registerOpener(opener: IOpener): IDisposable {
				registeredOpener = opener;
				return Disposable.None;
			}
		};

		let openedResource: URI | undefined;
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override async openSession(sessionResource: URI): Promise<IChatWidget | undefined> {
				openedResource = sessionResource;
				return new class extends mock<IChatWidget>() { };
			}
		};

		const chatSessionsService = new class extends mock<IChatSessionsService>() {
			override async activateChatSessionItemProvider(): Promise<void> { }
		};

		const requestOriginService = store.add(new ChatRequestOriginService());

		store.add(new AgentHostOpenSessionLinkOpenerContribution(
			openerService,
			chatWidgetService,
			chatSessionsService,
			requestOriginService,
			new class extends mock<ILinkPresentationService>() {
				override registerLinkPresentationProvider(): IDisposable { return Disposable.None; }
			},
			new NullLogService(),
			new class extends mock<ISessionSummaryHoverService>() {
				override registerProvider(): IDisposable { return Disposable.None; }
			},
			new class extends mock<IPathService>() { },
		));

		assert.ok(registeredOpener, 'expected an opener service opener to be registered');

		const backendSession = URI.parse('codex:/source-thread');
		const link = buildOpenSessionLinkUri(backendSession);

		const opened = await requestOriginService.open({
			kind: ChatRequestOriginKind.Delegation,
			sourceSessionResource: URI.parse(link),
		});

		assert.strictEqual(opened, true);
		assert.ok(openedResource);
		assert.strictEqual(openedResource!.toString(), 'agent-host-codex:/source-thread');
	});

	test('opens and presents the exact peer chat from an agent-host-session link', async () => {
		let registeredOpener: IOpener | undefined;
		const openerService = new class extends mock<IOpenerService>() {
			override registerOpener(opener: IOpener): IDisposable {
				registeredOpener = opener;
				return Disposable.None;
			}
		};

		let openedResource: URI | undefined;
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override async openSession(sessionResource: URI): Promise<IChatWidget | undefined> {
				openedResource = sessionResource;
				return new class extends mock<IChatWidget>() { };
			}
		};

		const sessionResource = URI.parse('agent-host-copilotcli:/session');
		const timing = { created: 1, lastRequestStarted: 1, lastRequestEnded: 1 };
		const peerChat: IChatSessionItem = {
			resource: sessionResource.with({ fragment: 'peer-chat' }),
			label: 'Hi',
			timing,
		};
		const chatSessionsService = new class extends mock<IChatSessionsService>() {
			override readonly onDidChangeAvailability = Event.None;
			override readonly onDidChangeInProgress = Event.None;
			override readonly onDidChangeItemsProviders = Event.None;
			override readonly onDidChangeSessionItems = Event.None;
			override async activateChatSessionItemProvider(): Promise<void> { }
			override async *getChatSessionItems(): AsyncIterable<{ readonly chatSessionType: string; readonly items: readonly IChatSessionItem[] }> {
				yield {
					chatSessionType: sessionResource.scheme,
					items: [{
						resource: sessionResource,
						label: 'Main chat',
						status: ChatSessionStatus.NeedsInput,
						timing,
						children: [peerChat],
					}],
				};
			}
		};

		const providers = new Map<string, ILinkPresentationProvider>();
		const linkPresentationService = new class extends mock<ILinkPresentationService>() {
			override registerLinkPresentationProvider(registration: ILinkPresentationProviderRegistration, provider: ILinkPresentationProvider): IDisposable {
				providers.set(registration.id, provider);
				return Disposable.None;
			}
		};
		const requestOriginService = store.add(new ChatRequestOriginService());
		store.add(new AgentHostOpenSessionLinkOpenerContribution(
			openerService,
			chatWidgetService,
			chatSessionsService,
			requestOriginService,
			linkPresentationService,
			new NullLogService(),
			new class extends mock<ISessionSummaryHoverService>() {
				override registerProvider(): IDisposable { return Disposable.None; }
			},
			new class extends mock<IPathService>() { },
		));

		assert.ok(registeredOpener);
		const link = URI.parse(buildOpenSessionLinkUri('copilotcli:/session', 'peer-chat'));
		const opened = await registeredOpener.open(link);
		const watcher = store.add(providers.get('workbench.agentChatLinkPresentation')!.createLinkPresentationWatcher(link));
		const presentation = await waitForState(watcher.presentation, value => value?.title === peerChat.label);

		assert.deepStrictEqual({
			opened,
			openedResource: openedResource?.toString(),
			presentation: presentation && { kind: presentation.kind, title: presentation.title, status: presentation.status?.kind },
		}, {
			opened: true,
			openedResource: 'agent-host-copilotcli:/session#peer-chat',
			presentation: { kind: 'chat', title: 'Hi', status: 'warning' },
		});
	});

	test('does not claim a request origin that is not an agent-host-session:// link', async () => {
		const openerService = new class extends mock<IOpenerService>() {
			override registerOpener(): IDisposable { return Disposable.None; }
		};
		const chatWidgetService = new class extends mock<IChatWidgetService>() { };
		const chatSessionsService = new class extends mock<IChatSessionsService>() { };
		const requestOriginService = store.add(new ChatRequestOriginService());

		store.add(new AgentHostOpenSessionLinkOpenerContribution(
			openerService,
			chatWidgetService,
			chatSessionsService,
			requestOriginService,
			new class extends mock<ILinkPresentationService>() {
				override registerLinkPresentationProvider(): IDisposable { return Disposable.None; }
			},
			new NullLogService(),
			new class extends mock<ISessionSummaryHoverService>() {
				override registerProvider(): IDisposable { return Disposable.None; }
			},
			new class extends mock<IPathService>() { },
		));

		const opened = await requestOriginService.open({
			kind: ChatRequestOriginKind.Delegation,
			sourceSessionResource: URI.parse('agent-host-codex:/some-other-session'),
		});

		assert.strictEqual(opened, false);
	});
});
