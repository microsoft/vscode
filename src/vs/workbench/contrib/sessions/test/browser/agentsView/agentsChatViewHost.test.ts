/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { IChat, ISession } from '../../../../../services/sessions/common/session.js';
import { IChatWidget, IChatWidgetService } from '../../../../chat/browser/chat.js';
import { IChatModelReference, IChatService } from '../../../../chat/common/chatService/chatService.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { AgentsChatViewHost } from '../../../browser/agentsView/agentsChatViewHost.js';
import { IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';
import { ISessionChange, ISessionsManagementService } from '../../../common/sessionsManagement.js';

suite('AgentsChatViewHost', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	interface IHostOptions {
		readonly chatAvailable?: boolean;
		readonly chatPart?: Partial<IAgentsChatPartService>;
		readonly sessionsManagementService?: Partial<ISessionsManagementService>;
		readonly widgets?: IChatWidget[];
		readonly providersAcquired?: () => void;
		/** Holds the loading of a session's model until it resolves. */
		readonly loading?: Promise<void>;
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
			chatPart,
			upcastPartial<ISessionsManagementService>({ getSessionForChatResource: () => undefined, getSessions: () => [], onDidChangeSession: () => toDisposable(() => { }), ...options.sessionsManagementService }),
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
					await options.loading;
					calls.push(`hold ${resource.toString()}`);
					return upcastPartial<IChatModelReference>({ dispose: () => calls.push(`release ${resource.toString()}`) });
				},
			}),
			upcastPartial<INotificationService>({ info: message => { calls.push(`info ${message}`); return undefined!; } }),
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

	test('a session it is still looking up as it is deactivated does not open in the chat part once found', async () => {
		const chatResource = URI.parse('agent-host-copilot:/session-1');
		const { owner, widget } = sessionOf(chatResource);
		const changes = new Emitter<readonly ISessionChange[]>();
		let known = false;
		const { host, calls } = createHost({
			sessionsManagementService: { getSessionForChatResource: () => known ? owner : undefined, getSession: () => undefined, onDidChangeSession: changes.event },
			widgets: [widget],
		});

		const opening = host.openSession(chatResource);
		await timeout(0);
		host.deactivate();
		known = true;
		changes.fire([]);
		const opened = await opening;
		changes.dispose();

		assert.deepStrictEqual({ opened, calls }, { opened: undefined, calls: ['acquire', 'release'] });
	});

	test('a session started before it is deactivated shows neither the session nor a composer once it completes', async () => {
		const untitled = URI.parse('agent-host-copilot:/untitled-1');
		const real = URI.parse('agent-host-copilot:/session-1');
		const { owner, widget } = sessionOf(real);
		const loading = new DeferredPromise<void>();
		const { host, calls } = createHost({ sessionsManagementService: { getSessionForChatResource: () => owner }, widgets: [widget], loading: loading.p });

		const starting = host.startSession(untitled, { local: false, importingConversation: false });
		host.deactivate();
		loading.complete();
		const start = await starting;
		const shownRun = await start.complete(real, true);
		const shownNotRun = await start.complete(untitled, false);
		const composer = await start.createComposer();
		start.dispose();

		assert.deepStrictEqual({ shownRun, shownNotRun, composer, calls }, {
			shownRun: false,
			shownNotRun: false,
			composer: undefined,
			calls: ['hold agent-host-copilot:/untitled-1', 'release agent-host-copilot:/untitled-1'],
		});
	});

	test('a session started while active still shows once reactivated calls start anew, but not what started before', async () => {
		const untitled = URI.parse('agent-host-copilot:/untitled-1');
		const real = URI.parse('agent-host-copilot:/session-1');
		const { owner, widget } = sessionOf(real);
		const { host, calls } = createHost({ sessionsManagementService: { getSessionForChatResource: () => owner }, widgets: [widget] });

		const stale = await host.startSession(untitled, { local: false, importingConversation: false });
		host.deactivate();
		const fresh = await host.startSession(untitled, { local: false, importingConversation: false });
		const shown = { stale: await stale.complete(real, true), fresh: await fresh.complete(real, true) };
		stale.dispose();
		fresh.dispose();

		assert.deepStrictEqual({ shown, opened: calls.filter(call => call.startsWith('openChat')) }, { shown: { stale: false, fresh: true }, opened: ['openChat agent-host-copilot:/session-1'] });
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

	test('does not start local chat, which the Agents view does not show', async () => {
		const { host, calls } = createHost();

		const error = await host.startSession(URI.parse('vscode-chat-session://local/1'), { local: true, importingConversation: false }).then(() => undefined, e => e);

		assert.deepStrictEqual({ cancelled: isCancellationError(error), calls }, {
			cancelled: true,
			calls: ['info Local chat sessions are not available while the Agents view is enabled.'],
		});
	});
});
