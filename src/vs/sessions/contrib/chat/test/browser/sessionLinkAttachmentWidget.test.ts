/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IAction } from '../../../../../base/common/actions.js';
import { timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IAgentHostConnectionsService, IAgentHostSessionIdentity } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { buildOpenSessionLinkUri } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IChatRequestSessionLinkVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ISessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IChat, ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { SessionLinkAttachmentWidget } from '../../browser/sessionLinkAttachmentWidget.js';

suite('SessionLinkAttachmentWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const backendSession = URI.parse('copilotcli:/session-1');

	function createWidget(sessions: readonly ISession[], link = URI.parse(buildOpenSessionLinkUri(backendSession))) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessions: () => [...sessions],
			onDidChangeSessions: Event.None,
		}));
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			resolveSessionResourceIdentity: (resource: URI): IAgentHostSessionIdentity => ({ backendSession: resource.with({ scheme: 'copilotcli' }), backendSessionIsAdvertised: true, connectionAuthority: 'local' }),
		}));
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() { });
		// Names each icon after what the sessions list chooses it from.
		instantiationService.stub(ISessionsListModelService, upcastPartial<ISessionsListModelService>({
			getStatusIcon: (status, isRead, _isArchived, completedStateIcon) => ThemeIcon.fromId(`status-${status}${isRead ? '' : '-unread'}${completedStateIcon ? `-${completedStateIcon.id}` : ''}`),
		}));
		instantiationService.stub(IProductService, upcastPartial<IProductService>({ urlProtocol: 'code-oss' }));
		// An in-progress session spins, as in the sessions list, where motion is allowed.
		instantiationService.stub(IAccessibilityService, 'isMotionReduced', () => false);
		const opened: string[] = [];
		instantiationService.stub(IOpenerService, upcastPartial<IOpenerService>({
			open: async target => {
				opened.push(target.toString());
				return true;
			},
		}));
		const contextMenus: IAction[][] = [];
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({
			showContextMenu: delegate => { contextMenus.push([...delegate.getActions?.() ?? []]); },
		}));
		const copied: string[] = [];
		instantiationService.stub(IClipboardService, upcastPartial<IClipboardService>({
			writeText: async text => { copied.push(text); },
		}));

		const attachment: IChatRequestSessionLinkVariableEntry = { kind: 'sessionLink', id: `sessionLink:${link}`, name: 'Session', value: link };
		const widget = store.add(instantiationService.createInstance(SessionLinkAttachmentWidget, attachment, { shouldFocusClearButton: false, supportsDeletion: true }, document.createElement('div')));
		const icon = () => {
			const current = [...widget.element.querySelector('.chat-session-link-attachment-icon')!.children].filter(child => !(child as HTMLElement).dataset.iconFadingOut).at(-1)!;
			return current.classList.contains('monaco-pixel-spinner') ? 'spinner' : [...current.classList].find(className => className.startsWith('codicon-'));
		};
		const render = () => ({
			label: widget.element.querySelector('.chat-attached-context-custom-text')?.textContent,
			displayName: widget.displayName,
			icon: icon(),
			ariaLabel: widget.element.ariaLabel,
		});
		return { widget, render, opened, contextMenus, copied };
	}

	test('shows the title and status of the linked session as the sessions list does, and follows them', () => {
		const status = observableValue('status', SessionStatus.InProgress);
		const isRead = observableValue('isRead', true);
		const completedStateIcon = observableValue<ThemeIcon | undefined>('completedStateIcon', undefined);
		const title = observableValue('title', 'Fix the login bug');
		const session = upcastPartial<ISession>({
			resource: URI.parse('agent-host-copilotcli:/session-1'),
			title,
			status,
			// The sessions list reads a session's row as read when its main chat is, whatever its peer chats are.
			isRead: constObservable(false),
			mainChat: constObservable(upcastPartial<IChat>({ isRead })),
			isArchived: constObservable(false),
			completedStateIcon,
			chats: constObservable<readonly IChat[]>([]),
		});
		const { render } = createWidget([session]);

		const inProgress = render();
		status.set(SessionStatus.NeedsInput, undefined);
		const needsInput = render();
		transaction(tx => {
			status.set(SessionStatus.Completed, tx);
			isRead.set(false, tx);
			completedStateIcon.set(Codicon.gitPullRequest, tx);
			title.set('Fixed the login bug', tx);
		});
		const completed = render();

		assert.deepStrictEqual({ inProgress, needsInput, completed }, {
			inProgress: { label: 'Fix the login bug', displayName: 'Fix the login bug', icon: 'spinner', ariaLabel: 'Link to session Fix the login bug, In Progress' },
			needsInput: { label: 'Fix the login bug', displayName: 'Fix the login bug', icon: 'codicon-status-2', ariaLabel: 'Link to session Fix the login bug, Attention Needed' },
			completed: { label: 'Fixed the login bug', displayName: 'Fixed the login bug', icon: 'codicon-status-3-unread-git-pull-request', ariaLabel: 'Link to session Fixed the login bug, Completed' },
		});
	});

	test('shows the chat that a chat link opens, and a session that the window does not know by the name of the link', () => {
		const chat = upcastPartial<IChat>({
			resource: URI.parse('agent-host-copilotcli:/session-1#chat-2'),
			title: constObservable('Review the tests'),
			status: constObservable(SessionStatus.Error),
			isRead: constObservable(true),
			isArchived: constObservable(false),
			completedStateIcon: constObservable(undefined),
		});
		const session = upcastPartial<ISession>({
			resource: URI.parse('agent-host-copilotcli:/session-1'),
			chats: constObservable([chat]),
			workspace: constObservable(undefined),
		});

		assert.deepStrictEqual({
			chat: createWidget([session], URI.parse(buildOpenSessionLinkUri(backendSession, 'chat-2'))).render(),
			unknown: createWidget([]).render(),
		}, {
			chat: { label: 'Review the tests', displayName: 'Review the tests', icon: 'codicon-status-4', ariaLabel: 'Link to chat Review the tests, Failed' },
			unknown: { label: 'Session', displayName: 'Session', icon: 'codicon-agent', ariaLabel: 'Link to session' },
		});
	});

	test('opens the linked session when clicked, its context menu opens it or copies the link that the sessions list copies, and a middle click removes it', async () => {
		const { widget, opened, contextMenus, copied } = createWidget([]);
		let removed = 0;
		store.add(widget.onDidDelete(() => removed++));

		widget.element.click();
		widget.element.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
		widget.element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		const actions = contextMenus[0];
		await actions.find(action => action.id === 'chat.sessionLinkAttachment.copyLink')?.run();
		await timeout(0);

		assert.deepStrictEqual({ opened, menu: actions.map(action => action.label), copied, removed }, {
			removed: 1,
			opened: ['agent-host-session://copilotcli/session-1'],
			menu: ['Open Session', '', 'Copy Link'],
			copied: ['code-oss://agents/agent-host-session/copilotcli/session-1'],
		});
	});
});
