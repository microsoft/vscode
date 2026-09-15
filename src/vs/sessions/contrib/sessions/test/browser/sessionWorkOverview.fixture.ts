/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { size } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { registerChatFixtureServices } from '../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { CustomViewNode } from '../../../../browser/parts/customViewNode.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionInputDraft, ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionReviewService } from '../../../../services/sessions/browser/sessionReviewService.js';
import { ISessionWorkTrackingService } from '../../../../services/sessions/browser/sessionWorkTrackingService.js';
import { ISessionsBoardService, SessionsBoardService } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { SessionWorkView } from '../../../../services/sessions/common/sessionWorkQuery.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { SessionBoardView } from '../../browser/views/sessionBoardView.js';
import { addWorkCardRequest, SessionWorkCardTestChatService } from './sessionWorkCardContentTestUtils.js';

async function renderWorkOverview({ container, disposableStore, theme, fileIconTheme }: ComponentFixtureContext, view: SessionWorkView, width = 1100, pending = false, collection?: string): Promise<void> {
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	container.style.width = `${width}px`;
	container.style.height = '700px';
	const now = Date.now();
	const sessions = [
		{ title: pending ? 'Confirm the reconnect policy' : 'Fix sign-in after a window reload', status: pending ? SessionStatus.NeedsInput : SessionStatus.Error, changes: false },
		{ title: 'Preserve the draft when reconnecting', status: SessionStatus.Completed, changes: true },
		{ title: 'Reproduce the checkout regression', status: SessionStatus.Error, changes: false },
		{ title: 'Reduce startup reconnect retries', status: SessionStatus.InProgress, changes: false },
		{ title: 'Explain session routing', status: SessionStatus.Completed, changes: false },
	].map((item, index) => {
		const session = makeSession(URI.parse(`test:/overview-${index}`), {
			status: item.status, isQuickChat: index === 4,
			changes: item.changes ? [{ uri: URI.file('/repo/sessionConnection.ts'), insertions: 38, deletions: 12 }] : [],
		});
		const title = constObservable(item.title);
		const status = observableValue('status', item.status);
		const chat = { ...session.mainChat.get(), title, status, lastTurnEnd: constObservable(new Date(now - (index + 1) * 1000)) };
		return { ...session, title, status, mainChat: constObservable(chat), chats: constObservable([chat]), lastTurnEnd: chat.lastTurnEnd };
	});
	const chatService = new SessionWorkCardTestChatService(disposableStore);
	const drafts = new ResourceMap<ISettableObservable<ISessionInputDraft>>();
	const getDraft = (resource: URI) => {
		let draft = drafts.get(resource);
		if (!draft) {
			draft = observableValue<ISessionInputDraft>('fixtureDraft', { inputText: '', attachments: [] });
			drafts.set(resource, draft);
		}
		return draft;
	};
	const instantiation = createEditorServices(disposableStore, {
		colorTheme: theme,
		fileIconTheme,
		additionalServices: registration => {
			registerChatFixtureServices(registration);
			registration.defineInstance(IChatService, chatService);
			registration.define(ISessionsBoardService, SessionsBoardService);
			registration.definePartialInstance(ISessionsManagementService, { onDidChangeSessions: Event.None, getSessions: () => sessions, getSession: resource => sessions.find(session => session.resource.toString() === resource.toString()) });
			registration.definePartialInstance(ISessionsService, {
				activeSession: constObservable(undefined),
				visibleSessions: constObservable([]),
				sessionReview: constObservable(undefined),
				canOpenSession: async () => true,
				openSessionReview: async () => { throw new Error('This isolated fixture does not host native review editors'); },
			});
			registration.definePartialInstance(ISessionGroupsService, {
				onDidChange: Event.None,
				getGroups: () => [{ id: 'release', name: 'Release readiness', createdAt: 0 }],
				getGroup: id => id === 'release' ? { id, name: 'Release readiness', createdAt: 0 } : undefined,
				getGroupOfSession: () => 'release',
			});
			registration.definePartialInstance(ISessionsListModelService, { onDidChange: Event.None, isSessionPinned: () => false, getSortKey: session => session.createdAt.getTime() });
			registration.definePartialInstance(ISessionWorkTrackingService, {
				getState: resource => constObservable({ lastOpenedAt: now - 60 * 86400000, reviewedResult: resource.path.endsWith('1') ? 'earlier-result' : undefined }),
			});
			registration.definePartialInstance(ISessionInputDraftService, { getDraft, setDraft: (resource, draft) => getDraft(resource).set(draft, undefined) });
			registration.definePartialInstance(ISessionReviewService, {
				send: async (_session, chat, query) => {
					const model = chatService.getSession(chat.resource);
					if (!(model instanceof ChatModel)) { throw new Error('Missing sample conversation'); }
					addWorkCardRequest(model, query, [{ kind: 'markdownContent', content: new MarkdownString('Sample reply received. No agent or external service was called.') }]).response?.complete();
					return true;
				},
			});
			registration.definePartialInstance(IChatEntitlementService, { sentiment: { hidden: false } });
		},
	});
	const configuration = instantiation.get(IConfigurationService);
	if (!(configuration instanceof TestConfigurationService)) { throw new Error('Expected the fixture configuration service'); }
	configuration.setUserConfiguration('chat', { editor: { fontSize: 13, fontFamily: 'default', fontWeight: 'default', lineHeight: 0, wordWrap: 'on' } });
	configuration.setUserConfiguration('editor', { fontFamily: 'monospace', fontLigatures: false, bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false } });
	configuration.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
	configuration.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, true);
	for (const session of sessions) {
		const model = disposableStore.add(instantiation.createInstance(ChatModel, undefined, {
			initialLocation: ChatAgentLocation.Chat, canUseTools: true, resource: session.mainChat.get().resource, disableBackgroundKeepAlive: true,
		}));
		chatService.addSession(model);
		if (session.status.get() === SessionStatus.NeedsInput) {
			const question = new ChatQuestionCarouselData([
				{
					id: 'retry', type: 'singleSelect', title: 'How should reconnect retries work?', options: [
						{ id: 'bounded', label: 'Retry three times', value: 'bounded' },
						{ id: 'manual', label: 'Wait for me', value: 'manual' },
					]
				},
			], true, 'fixture-reconnect');
			const request = addWorkCardRequest(model, 'Choose the retry behavior.', [question]);
			disposableStore.add(chatService.onDidReceiveQuestionCarouselAnswer(answer => {
				if (answer.requestId === request.id) {
					request.response?.complete();
					session.status.set(SessionStatus.Completed, undefined);
				}
			}));
		} else {
			addWorkCardRequest(model, session.title.get(), [{ kind: 'markdownContent', content: new MarkdownString('The native conversation stays attached to this card while its size changes.\n\n- The reply remains below the result.\n- Layout changes do not change the session or its draft.') }]).response?.complete();
		}
	}
	instantiation.get(ISessionsBoardService).updateOptions({ view, collection });
	const host = disposableStore.add(instantiation.createInstance(CustomViewNode, { id: 'fixture.workOverview', ctor: new SyncDescriptor(SessionBoardView) }));
	container.appendChild(host.element);
	size(host.element, width, 700);
	host.layout(width, 700);
	await Promise.resolve();
	await Promise.resolve();
}

const interactive = { virtualTime: { enabled: false } };

export default defineThemedFixtureGroup({ path: 'sessions/WorkOverview/' }, {
	Overview: defineComponentFixture({ ...interactive, render: context => renderWorkOverview(context, 'overview'), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	AllSessions: defineComponentFixture({ ...interactive, render: context => renderWorkOverview(context, 'all') }),
	Collection: defineComponentFixture({ ...interactive, render: context => renderWorkOverview(context, 'all', 1100, false, 'release') }),
	PendingInput: defineComponentFixture({ ...interactive, render: context => renderWorkOverview(context, 'overview', 1100, true) }),
	Archive: defineComponentFixture({ ...interactive, render: context => renderWorkOverview(context, 'archive') }),
	Narrow: defineComponentFixture({ ...interactive, render: context => renderWorkOverview(context, 'overview', 540) }),
});
