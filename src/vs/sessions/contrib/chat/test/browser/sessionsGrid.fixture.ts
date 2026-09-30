/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Direction } from '../../../../../base/browser/ui/grid/grid.js';
import { assert } from '../../../../../base/common/assert.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { autorun, constObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IChatWidgetFixtureHandle, renderChatWidget } from '../../../../../workbench/test/browser/componentFixtures/chat/chatWidget.fixture.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { getAgentsPartCardContentSize } from '../../../../browser/parts/agentsPartCard.js';
import { AbstractChatView, ChatViewKind } from '../../../../browser/parts/chatView.js';
import { IChatViewFactory } from '../../../../services/chatView/browser/chatViewFactory.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { createTestActiveSession } from '../../../../test/browser/sessionViewTestUtils.js';
import { createSessionsWorkbenchFixture } from './sessionsWorkbenchFixtureUtils.js';

import '../../../../browser/media/style.css';
import '../../browser/media/chatView.css';

class FixtureChatView extends AbstractChatView {
	private chat: IChat | undefined;
	private dimensions = { width: 0, height: 0 };
	private widget: IChatWidgetFixtureHandle | undefined;

	constructor(readonly kind: ChatViewKind, private readonly context: ComponentFixtureContext) {
		super();
	}

	override setChat(chat: IChat): void { this.chat = chat; }
	override setVisible(visible: boolean): void { this.widget?.listWidget.setVisible(visible); }
	override toJSON(): object { return {}; }
	override focus(): void {
		if (this.widget) {
			this.context.focus(this.widget.inputPart);
		}
	}

	async render(): Promise<void> {
		assert(this.chat !== undefined, 'Expected a bound chat');
		const { width, height } = this.dimensions;
		assert(width > 0 && height > 0, 'Expected a laid-out chat');
		await renderChatWidget({ ...this.context, container: this.element, disposableStore: this._store }, {
			width,
			height,
			useAuxiliaryBarWrapper: false,
			messages: [{
				user: `Review ${this.chat.title.get().toLowerCase()}.`,
				assistant: [{ kind: 'markdown', text: 'The implementation keeps the existing behavior. The focused tests pass.' }],
			}],
			onRendered: widget => {
				this.widget = widget;
				widget.inputPart.inputEditor.updateOptions({ cursorBlinking: 'solid' });
			},
		});
		this.element.style.backgroundColor = 'transparent';
		this.doLayout(width, height);
	}

	protected override doLayout(width: number, height: number): void {
		this.dimensions = { width, height };
		if (this.widget) {
			this.widget.inputPart.setMaxHeight(height / 2);
			this.widget.inputPart.layout(width);
			this.widget.listWidget.layout(Math.max(0, height - this.widget.inputPart.height.get()), width);
		}
	}
}

/** Cloud sessions keep the production chrome independent of local tasks, authentication, and network access. */
async function renderSessionsGrid(context: ComponentFixtureContext, options: { maximized?: boolean; multipleChats?: boolean } = {}): Promise<void> {
	const workspace = constObservable<ISessionWorkspace>({
		uri: URI.parse('https://github.com/microsoft/vscode'),
		label: 'microsoft/vscode',
		icon: Codicon.repo,
		folders: [],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: true,
	});
	const sessions = ['Grid layout', 'Session lifecycle', 'Keyboard navigation'].map((title, index) => {
		const session = createTestActiveSession(`fixture-${index}`);
		const chat: IChat = { ...session.mainChat.get(), workspace, title: constObservable(title) };
		const sessionChats = options.multipleChats && index === 0
			? [chat, { ...chat, resource: chat.resource.with({ path: '/regression-tests' }), title: constObservable('Regression tests') }]
			: [chat];
		return {
			...session,
			workspace,
			title: constObservable(title),
			sticky: observableValue(session, index === 0),
			mainChat: constObservable(chat),
			activeChat: observableValue(session, chat),
			chats: constObservable(sessionChats),
			openChats: constObservable(sessionChats),
			visibleChatTabs: constObservable(sessionChats),
			shouldShowChatTabs: constObservable(false),
		};
	});
	const [left, top, bottom] = sessions;
	const sessionsService = new class extends mock<ISessionsService>() {
		override readonly activeSession = observableValue<IActiveSession | undefined>(this, left);
		override readonly visibleSessions = observableValue<readonly IActiveSession[]>(this, sessions);
		override setActive(session: IActiveSession | undefined): void {
			this.activeSession.set(session, undefined);
		}
		override toggleSessionStickiness(session: ISession): void {
			const target = sessions.find(candidate => candidate.sessionId === session.sessionId);
			assert(target !== undefined);
			target.sticky.set(!target.sticky.get(), undefined);
		}
		override closeSession(session: ISession | undefined): void {
			const remaining = this.visibleSessions.get().filter(candidate => candidate !== session);
			transaction(tx => {
				this.visibleSessions.set(remaining, tx);
				if (this.activeSession.get() === session) {
					this.activeSession.set(remaining[0], tx);
				}
			});
		}
		override async openChat(session: ISession, resource: URI): Promise<void> {
			const target = sessions.find(candidate => candidate.sessionId === session.sessionId);
			const chat = target?.chats.get().find(candidate => candidate.resource.toString() === resource.toString());
			assert(target !== undefined && chat !== undefined, 'Expected an existing fixture chat');
			target.activeChat.set(chat, undefined);
		}
	}();
	const { part, grid, layout, instantiationService } = createSessionsWorkbenchFixture(context, 1440, 900, sessionsService);
	const chats: FixtureChatView[] = [];
	instantiationService.stub(IChatViewFactory, new class extends mock<IChatViewFactory>() {
		override createNewChatView(_parent: HTMLElement, isNewChatInSession: boolean): AbstractChatView {
			return new FixtureChatView(isNewChatInSession ? 'newChatInSession' : 'newSession', context);
		}
		override createChatView(): AbstractChatView {
			const view = new FixtureChatView('chat', context);
			chats.push(view);
			return view;
		}
	}());
	const slots = [
		{ id: left.sessionId },
		{ id: top.sessionId },
		{ id: bottom.sessionId, placement: { reference: top.sessionId, direction: Direction.Down } },
	];
	context.disposableStore.add(autorun(reader => {
		const visible = sessionsService.visibleSessions.read(reader);
		part.updateVisibleSessions(visible, sessionsService.activeSession.read(reader), slots.filter(slot => visible.some(session => session.sessionId === slot.id)));
	}));
	layout();
	part.resizeSession(left.sessionId, options.multipleChats ? Direction.Right : Direction.Left, options.multipleChats ? 180 : 120);
	part.resizeSession(top.sessionId, Direction.Down, 40);
	if (options.multipleChats) {
		part.getSessionView(left.sessionId)!.splitChatToSide(left.chats.get()[1].resource);
	}
	await Promise.all(chats.map(chat => chat.render()));
	context.disposableStore.add(part.onDidFocusSession(id => sessionsService.setActive(sessions.find(session => session.sessionId === id))));
	if (options.maximized) {
		part.toggleMaximizeSession(left.sessionId);
	}
	const sizes = sessions.map(session => {
		const element = part.getSessionView(session.sessionId)!.element;
		return { width: element.offsetWidth, height: element.offsetHeight };
	});
	if (options.maximized) {
		const allocation = grid.getViewSize(part);
		const contentSize = getAgentsPartCardContentSize(allocation.width, allocation.height, false, false, false);
		assert(sizes[0].width === contentSize.width && sizes[0].height === contentSize.height && sizes.slice(1).every(size => size.width === 0 && size.height === 0), 'Expected only the maximized pane to be visible');
	} else {
		assert(options.multipleChats ? sizes[0].width > sizes[1].width : sizes[0].width < sizes[1].width, 'Expected the intended session widths');
		assert(sizes[0].height === sizes[1].height + sizes[2].height && sizes[1].height > sizes[2].height, 'Expected unequal nested splits');
	}
	if (options.multipleChats) {
		const groups = part.getSessionView(left.sessionId)!.element.querySelectorAll<HTMLElement>('.chat-group-view');
		assert(groups.length === 2 && [...groups].every(group => group.offsetWidth > 0), 'Expected two visible chat groups within one session');
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/grid/' }, {
	NestedSplits: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents workbench title bar sits above the floating Sessions card, with sidebars and panels hidden. Three session panes fill the card: a narrow full-height pane on the left and two unequal-height panes stacked on the right. Each pane has a session header, a completed conversation, and a chat input.'],
		render: context => renderSessionsGrid(context),
	}),
	Maximized: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents workbench title bar and floating Sessions card are visible, with sidebars and panels hidden. Only the Grid layout session fills the card with its header, completed conversation, and chat input. No sibling panes or split sashes are visible.'],
		render: context => renderSessionsGrid(context, { maximized: true }),
	}),
	MultipleChats: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The Agents workbench shows three sessions with sidebars and panels hidden. The wide left session contains two side-by-side chats, Grid layout and Regression tests, each with its own tab strip, conversation, and input below one shared session header. The other two sessions remain stacked on the right.'],
		render: context => renderSessionsGrid(context, { multipleChats: true }),
	}),
});
