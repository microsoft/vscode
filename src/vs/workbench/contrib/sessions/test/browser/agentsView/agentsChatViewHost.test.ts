/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { IChat, ISession, ISessionType } from '../../../../../services/sessions/common/session.js';
import { IChatWidget, IChatWidgetService } from '../../../../chat/browser/chat.js';
import { IChatModelReference, IChatService } from '../../../../chat/common/chatService/chatService.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { AgentsChatViewHost } from '../../../browser/agentsView/agentsChatViewHost.js';
import { IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { IChatViewHostShownSession } from '../../../../chat/browser/chatViewHost.js';
import { LocalChatSessionUri } from '../../../../chat/common/model/chatUri.js';
import { IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';

suite('AgentsChatViewHost', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	interface IHostOptions {
		readonly chatAvailable?: boolean;
		readonly chatPart?: Partial<IAgentsChatPartService>;
		readonly sessionsManagementService?: Partial<ISessionsManagementService>;
		readonly widgets?: IChatWidget[];
		readonly providersAcquired?: () => void;
		readonly contentCreated?: IObservable<boolean>;
		readonly chatService?: Partial<IChatService>;
		readonly ownsNewChat?: boolean;
	}

	function createHost(options: IHostOptions = {}) {
		const calls: string[] = [];
		const composerWidget = upcastPartial<IChatWidget>({});
		const chatPart = upcastPartial<IAgentsChatPartService>({
			activeChat: constObservable(undefined),
			show: async (_target, showOptions) => { calls.push(`show preserveFocus=${showOptions?.preserveFocus}`); },
			openComposer: async (target, openOptions) => { calls.push(`openComposer sessionType=${target?.sessionTypeId} newComposer=${openOptions?.newComposer}`); },
			getComposerWidget: async () => composerWidget,
			openChat: async session => { calls.push(`openChat ${session.resource.toString()}`); },
			isShowing: () => false,
			...options.chatPart,
		});
		const host = new AgentsChatViewHost(
			constObservable(options.ownsNewChat ?? true),
			chatPart,
			upcastPartial<ISessionsManagementService>({ getSessionForChatResource: () => undefined, getSession: () => undefined, getAllSessionTypes: () => [], getSessions: () => [], onDidChangeSession: () => toDisposable(() => { }), ...options.sessionsManagementService }),
			upcastPartial<IChatWidgetService>({ getAllWidgets: () => options.widgets ?? [] }),
			upcastPartial<IWorkbenchLayoutService>({ isVisible: () => false }),
			upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [] }) }),
			upcastPartial<IContextKeyService>({ contextMatchesRules: () => options.chatAvailable ?? true }),
			upcastPartial<IAgentsViewProvidersService>({
				acquire: () => {
					options.providersAcquired?.();
					calls.push('acquire');
					return toDisposable(() => calls.push('release'));
				},
			}),
			upcastPartial<IEditorService>({ activeEditor: undefined }),
			upcastPartial<IChatService>({
				acquireOrLoadSession: async resource => {
					calls.push(`hold ${resource.toString()}`);
					return upcastPartial<IChatModelReference>({ dispose: () => calls.push(`release ${resource.toString()}`) });
				},
				...options.chatService,
			}),
			upcastPartial<INotificationService>({ info: message => { calls.push(`info ${message}`); return undefined!; } }),
			upcastPartial<IAgentsChatPartFrame>({ contentCreated: options.contentCreated ?? constObservable(true) }),
		);
		return { host, calls, composerWidget };
	}

	/** A session of `resource` whose chat the chat part shows with a widget. */
	function sessionOf(resource: URI) {
		const session = upcastPartial<ISession>({ resource });
		const owner = { session, chat: upcastPartial<IChat>({ resource }) };
		const widget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<IChatWidget['viewModel'] & object>({ sessionResource: resource }) });
		return { owner, widget };
	}

	test('opening a session by its resource holds the providers before it looks the session up, as they may be released, until the chat part shows it', async () => {
		const chatResource = URI.parse('agent-host-copilot:/session-1');
		const { owner, widget } = sessionOf(chatResource);
		let registered = false;
		const lookups: boolean[] = [];
		const { host, calls } = createHost({
			// Its session is known only once the providers are registered
			sessionsManagementService: { getSessionForChatResource: () => { lookups.push(registered); return registered ? owner : undefined; } },
			widgets: [widget],
			providersAcquired: () => registered = true,
		});

		const opened = await host.openSession(chatResource);

		assert.deepStrictEqual({ opened: opened === widget, lookups, calls }, { opened: true, lookups: [true], calls: ['acquire', 'openChat agent-host-copilot:/session-1', 'release'] });
	});

	test('what would show the Chat view gets the widget of the composer it shows, whose submits create the session', async () => {
		const { host, calls, composerWidget } = createHost();

		const revealed = await host.reveal(true);
		const toggled = await host.toggle();

		assert.deepStrictEqual({ revealed: revealed === composerWidget, toggled, calls }, {
			revealed: true,
			toggled: true,
			calls: ['show preserveFocus=true', 'show preserveFocus=undefined'],
		});
	});

	test('reveals only a session that the chat part shows', async () => {
		const chatResource = URI.parse('agent-host-copilot:/session-1');
		const { owner, widget } = sessionOf(chatResource);
		const showing = createHost({ chatPart: { isShowing: () => true }, sessionsManagementService: { getSessionForChatResource: () => owner }, widgets: [widget] });
		const notShowing = createHost({ sessionsManagementService: { getSessionForChatResource: () => owner }, widgets: [widget] });

		assert.deepStrictEqual({
			showing: await showing.host.revealIfShowing(chatResource) === widget,
			notShowing: await notShowing.host.revealIfShowing(chatResource),
			notShowingCalls: notShowing.calls,
		}, { showing: true, notShowing: undefined, notShowingCalls: [] });
	});

	test('shows nothing while chat is hidden or disabled, such as with AI features off', async () => {
		const { host, calls } = createHost({ chatAvailable: false });

		const results = [await host.reveal(), await host.openSession(URI.parse('test:/chat')), await host.toggle()];

		assert.deepStrictEqual({ results, calls }, { results: [undefined, undefined, false], calls: [] });
	});

	test('a started session that runs shows in the chat part, its model held until the start ends', async () => {
		const untitled = URI.parse('agent-host-copilot:/untitled-1');
		const real = URI.parse('agent-host-copilot:/session-1');
		const { owner, widget } = sessionOf(real);
		const { host, calls } = createHost({ sessionsManagementService: { getSessionForChatResource: () => owner }, widgets: [widget] });

		const start = await host.startSession(untitled, { local: false, importingConversation: false });
		await start.moved(real);
		const shown = await start.complete(real, true);
		start.dispose();

		assert.deepStrictEqual({ shown, calls }, {
			shown: true,
			calls: ['hold agent-host-copilot:/untitled-1', 'acquire', 'openChat agent-host-copilot:/session-1', 'release', 'release agent-host-copilot:/untitled-1'],
		});
	});

	test('a new session that did not run is not shown: a composer of its type shows instead, which gets the request back', async () => {
		const untitled = URI.parse('agent-host-copilot:/untitled-1');
		const { host, calls, composerWidget } = createHost();

		const start = await host.startSession(untitled, { local: false, importingConversation: false });
		const shown = await start.complete(untitled, false);
		const composer = await start.createComposer();
		start.dispose();

		assert.deepStrictEqual({ shown, composer: composer === composerWidget, calls }, {
			shown: false,
			composer: true,
			calls: ['hold agent-host-copilot:/untitled-1', 'openComposer sessionType=agent-host-copilot newComposer=true', 'release agent-host-copilot:/untitled-1'],
		});
	});

	test('completing a session that did not run waits for its composer to show, and fails as showing it fails', async () => {
		const untitled = URI.parse('agent-host-copilot:/untitled-1');
		const opening = new DeferredPromise<void>();
		const { host } = createHost({ chatPart: { openComposer: () => opening.p } });

		const start = await host.startSession(untitled, { local: false, importingConversation: false });
		let settled = false;
		const completed = start.complete(untitled, false).finally(() => settled = true);
		await timeout(0);
		const pendingWhileShowing = !settled;
		opening.error(new Error('no composer'));
		const error = await completed.then(() => undefined, (e: Error) => e.message);
		start.dispose();

		assert.deepStrictEqual({ pendingWhileShowing, error }, { pendingWhileShowing: true, error: 'no composer' });
	});

	test('does not start local chat, which the chat part does not show', async () => {
		const { host, calls } = createHost();

		const error = await host.startSession(URI.parse('vscode-chat-session://local/1'), { local: true, importingConversation: false }).then(() => undefined, e => e);

		assert.deepStrictEqual({ cancelled: isCancellationError(error), calls }, {
			cancelled: true,
			calls: ['info Local chat sessions are not available while chats open in the chat part.'],
		});
	});

	test('opens a session as restored or committed when asked to, so that it does not report it as opened', async () => {
		const chatResource = URI.parse('agent-host-copilot:/session-1');
		const { owner, widget } = sessionOf(chatResource);
		const opened: string[] = [];
		const { host } = createHost({
			chatPart: { openChat: async (_session, _chat, openOptions) => { opened.push(`restore=${openOptions?.restore} commit=${openOptions?.commit}`); } },
			sessionsManagementService: { getSessionForChatResource: () => owner },
			widgets: [widget],
		});

		await host.openSession(chatResource, { restore: true });
		await host.openSession(chatResource, { commit: true });
		await host.openSession(chatResource);

		assert.deepStrictEqual(opened, ['restore=true commit=undefined', 'restore=undefined commit=true', 'restore=undefined commit=undefined']);
	});

	test('deactivated while it loads the session it starts, it releases the session and starts nothing', async () => {
		const load = new DeferredPromise<void>();
		const calls: string[] = [];
		const { host, calls: hostCalls } = createHost({ chatService: { acquireOrLoadSession: async () => { await load.p; return upcastPartial<IChatModelReference>({ dispose: () => calls.push('release model') }); } } });

		const starting = host.startSession(URI.parse('agent-host-copilot:/untitled-1'), { local: false, importingConversation: false });
		host.deactivate();
		load.complete();
		let cancelled = false;
		try {
			await starting;
		} catch (error) {
			cancelled = isCancellationError(error);
		}

		assert.deepStrictEqual({ cancelled, calls: [...hostCalls, ...calls] }, { cancelled: true, calls: ['release model'] });
	});

	test('deactivated while it looks up the session it started, it shows neither the session nor a composer', async () => {
		const lookup = new DeferredPromise<void>();
		const chatResource = URI.parse('agent-host-copilot:/session-1');
		const { owner } = sessionOf(chatResource);
		const { host, calls } = createHost({
			sessionsManagementService: {
				getSessionForChatResource: () => lookup.isSettled ? owner : undefined,
				onDidChangeSession: listener => { void lookup.p.then(() => listener([])); return toDisposable(() => { }); },
			},
		});

		const start = await host.startSession(URI.parse('agent-host-copilot:/untitled-1'), { local: false, importingConversation: false });
		const completing = start.complete(chatResource, true);
		host.deactivate();
		lookup.complete();
		const shown = await completing;
		const composer = await start.createComposer();
		start.dispose();

		assert.deepStrictEqual({ shown, composer, calls }, { shown: false, composer: undefined, calls: ['hold agent-host-copilot:/untitled-1', 'acquire', 'release', 'release agent-host-copilot:/untitled-1'] });
	});

	test('deactivated while it looks a session up, it does not open the chat part', async () => {
		const chatResource = URI.parse('agent-host-copilot:/session-1');
		const { owner, widget } = sessionOf(chatResource);
		const lookup = new DeferredPromise<void>();
		const { host, calls } = createHost({
			sessionsManagementService: {
				getSessionForChatResource: () => lookup.isSettled ? owner : undefined,
				onDidChangeSession: listener => { void lookup.p.then(() => listener([])); return toDisposable(() => { }); },
			},
			widgets: [widget],
		});

		const opening = host.openSession(chatResource);
		host.deactivate();
		lookup.complete();

		assert.deepStrictEqual({ opened: await opening, calls }, { opened: undefined, calls: ['acquire', 'release'] });
	});

	test('shows the chats of the window\'s sessions and of the types its providers offer, and leaves other chats, such as local chat, to the Chat view', () => {
		const knownChat = URI.parse('known-chat:/chat-1');
		const knownSession = URI.parse('known-session:/session-1');
		const { host } = createHost({
			sessionsManagementService: {
				getSessionForChatResource: resource => resource.toString() === knownChat.toString() ? sessionOf(knownChat).owner : undefined,
				getSession: resource => resource.toString() === knownSession.toString() ? sessionOf(knownSession).owner.session : undefined,
				getAllSessionTypes: () => [upcastPartial<ISessionType>({ id: 'copilot-cloud', chatSessionType: 'copilot-cloud-agent' }), upcastPartial<ISessionType>({ id: 'local' })],
			},
		});

		assert.deepStrictEqual({
			agentHost: host.canShow(URI.parse('agent-host-copilot:/session-1')),
			knownChat: host.canShow(knownChat),
			knownSession: host.canShow(knownSession),
			untitledOfOfferedType: host.canShow(URI.parse('copilot-cloud-agent:/untitled-1')),
			local: host.canShow(LocalChatSessionUri.forSession('local-1')),
			extension: host.canShow(URI.parse('some-extension-chat:/session-1')),
		}, { agentHost: true, knownChat: true, knownSession: true, untitledOfOfferedType: true, local: false, extension: false });
	});

	test('New Chat opens a new-session composer in the chat part, unless chat is hidden or disabled, or the Chat view keeps its New Chat', () => {
		const available = createHost();
		const unavailable = createHost({ chatAvailable: false });
		const notOwned = createHost({ ownsNewChat: false });

		assert.deepStrictEqual({
			available: available.host.newChat(), availableCalls: available.calls,
			unavailable: unavailable.host.newChat(), unavailableCalls: unavailable.calls,
			notOwned: notOwned.host.newChat(), notOwnedCalls: notOwned.calls,
		}, {
			available: true, availableCalls: ['openComposer sessionType=undefined newComposer=true'],
			unavailable: false, unavailableCalls: [],
			notOwned: false, notOwnedCalls: [],
		});
	});

	test('reports the chat of the chat part\'s active tab only once the chat part exists, without creating it', () => {
		const contentCreated = observableValue('contentCreated', false);
		const shown: IChatViewHostShownSession = { resource: URI.parse('agent-host-copilot:/session-1'), reason: 'restore' };
		const read: string[] = [];
		const { host } = createHost({ contentCreated, chatPart: { get shownSession() { read.push('shownSession'); return constObservable(shown); } } });

		const before = host.shownSession.get();
		contentCreated.set(true, undefined);

		assert.deepStrictEqual({ before, after: host.shownSession.get(), read }, { before: undefined, after: shown, read: ['shownSession'] });
	});
});
