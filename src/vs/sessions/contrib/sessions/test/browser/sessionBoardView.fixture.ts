/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/sessionBoard.contribution.js';
import { getWindow, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { toFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { Menus } from '../../../../browser/menus.js';
import { CustomViewNode } from '../../../../browser/parts/customViewNode.js';
import { SessionsBoardVisibleContext } from '../../../../common/contextkeys.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionInputDraft, ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionsBoardService, SessionsBoardService } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { VisibleSession } from '../../../../services/sessions/browser/visibleSessions.js';
import { ChatInteractivity, IChat, ISessionArtifact, SessionArtifactKind, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { SESSION_BOARD_VIEW_ID } from '../../../../services/sessions/common/sessionReview.js';
import { SessionBoardView } from '../../browser/views/sessionBoardView.js';
import { createTestSession } from './sessionsListTestUtils.js';

interface IBoardFixtureOptions {
	readonly width?: number;
	readonly collection?: boolean;
	readonly sparse?: boolean;
	readonly keyboardFocus?: boolean;
	readonly longTitle?: boolean;
}

async function renderBoard({ container, disposableStore, theme, fileIconTheme }: ComponentFixtureContext, options: IBoardFixtureOptions = {}): Promise<void> {
	const width = options.width ?? 1040;
	container.style.width = `${width}px`;
	container.style.height = '730px';
	container.style.display = 'flex';
	const specifications = options.sparse ? [
		{ title: 'hi', project: 'osortega/simple-server', status: SessionStatus.Completed },
		{ title: 'hi', project: 'osortega/simple-server', status: SessionStatus.Completed },
		{ title: 'New remote session', project: 'osortega/simple-server', status: SessionStatus.Completed },
		{ title: 'hello', project: 'osortega/simple-server', status: SessionStatus.Completed },
		{ title: 'Change port to 3193', project: 'osortega/simple-server', status: SessionStatus.Completed },
		{ title: 'Change port to 3192', project: 'osortega/simple-server', status: SessionStatus.Completed },
	] : [
		{ title: options.longTitle ? 'Audit extension permissions and preserve confirmation choices when switching between review results' : 'Audit extension permissions', project: 'microsoft/vscode', status: SessionStatus.NeedsInput },
		{ title: 'Simplify session cards', project: 'microsoft/vscode', status: SessionStatus.InProgress },
		{ title: 'Improve keyboard navigation', project: 'microsoft/vscode', status: SessionStatus.Completed },
		{ title: 'Confirm the retry policy', project: 'atlas-api', status: SessionStatus.NeedsInput },
		{ title: 'Fix cache invalidation', project: 'atlas-api', status: SessionStatus.Completed },
		{ title: 'Add request tracing', project: 'atlas-api', status: SessionStatus.InProgress },
		{ title: 'Prepare release notes', project: 'docs', status: SessionStatus.Completed },
	];
	const sessions = specifications.map((specification, index) => {
		const original = createTestSession(specification.title, { resourceId: `board-fixture-${index}` }).session;
		const workspace = URI.file(`/projects/${specification.project}`);
		const status = constObservable(specification.status);
		const updatedAt = constObservable(new Date(Date.now() - (index + 1) * 15 * 60 * 1000));
		const chat: IChat = {
			resource: original.resource.with({ fragment: 'main' }), title: original.title, createdAt: original.createdAt, updatedAt,
			status, changes: constObservable([]), checkpoints: constObservable(undefined), modelId: constObservable(undefined),
			modelSource: constObservable(undefined), mode: constObservable(undefined), isArchived: constObservable(false),
			isRead: constObservable(true), interactivity: constObservable(ChatInteractivity.Full), description: constObservable(undefined), lastTurnEnd: constObservable(undefined),
		};
		const artifacts: ISessionArtifact[] = options.sparse ? [] : [{
			id: `artifact-${index}`, label: 'Review notes', kind: SessionArtifactKind.File, isArtifact: true, uri: URI.joinPath(workspace, 'review.md'),
		}, ...(index % 2 === 0 ? [{
			id: `pr-${index}`, label: 'Pull request', kind: SessionArtifactKind.PullRequest, isArtifact: false,
			link: URI.parse(`https://github.com/example/project/pull/${42 + index}`),
		}] : [])];
		return disposableStore.add(new VisibleSession({
			...original, status, updatedAt, chats: constObservable([chat]), mainChat: constObservable(chat),
			artifacts: constObservable(artifacts),
			changesSummary: options.sparse ? undefined : constObservable({ files: index % 3 + 1, additions: 24 + index, deletions: 8 + index }),
			workspace: constObservable({
				uri: workspace, label: specification.project, icon: Codicon.repo,
				folders: [{ root: workspace, workingDirectory: workspace, name: specification.project, description: undefined }],
				requiresWorkspaceTrust: false, isVirtualWorkspace: false,
			}),
		}, chat));
	});
	const drafts = new ResourceMap<ISettableObservable<ISessionInputDraft>>();
	const getDraft = (resource: URI) => {
		let draft = drafts.get(resource);
		if (!draft) {
			draft = observableValue<ISessionInputDraft>('boardFixtureDraft', { inputText: '', attachments: [] });
			drafts.set(resource, draft);
		}
		return draft;
	};
	if (!options.sparse) {
		getDraft(sessions[0].activeChat.get().resource).set({
			inputText: 'Keep the existing confirmation behavior.',
			attachments: [toFileVariableEntry(URI.file('/projects/vscode/permissions.ts'))],
		}, undefined);
	}
	const instantiation = createEditorServices(disposableStore, {
		colorTheme: theme,
		fileIconTheme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.define(IContextKeyService, ContextKeyService);
			registration.define(IMenuService, MenuService);
			registration.define(ISessionsBoardService, SessionsBoardService);
			registration.definePartialInstance(ISessionsService, {
				visibleSessions: constObservable(sessions),
				sessionReview: constObservable(undefined),
				activeSession: constObservable(sessions[0]),
				canOpenSession: async () => { throw new Error('The compact board fixture must not load a conversation'); },
			});
			registration.definePartialInstance(ISessionInputDraftService, { getDraft, setDraft: (resource, value) => getDraft(resource).set(value, undefined) });
			registration.definePartialInstance(ISessionGroupsService, {
				onDidChange: Event.None,
				getGroups: () => [{ id: 'today', name: 'Today', createdAt: 0 }, { id: 'release', name: 'Release', createdAt: 0 }],
				getGroupOfSession: id => Number(id.slice(id.lastIndexOf('-') + 1)) % 2 ? 'release' : 'today',
			});
			registration.definePartialInstance(ISessionsListModelService, {
				onDidChange: Event.None,
				getSortKey: session => session.updatedAt.get().getTime(),
			});
			registration.definePartialInstance(ISessionChangesStatsCache, { get: () => undefined });
		},
	});
	const context = instantiation.get(IContextKeyService);
	ChatContextKeys.enabled.bindTo(context).set(true);
	IsSessionsWindowContext.bindTo(context).set(true);
	SessionsBoardVisibleContext.bindTo(context).set(true);
	const boardService = instantiation.get(ISessionsBoardService);
	if (options.collection) { boardService.updateOptions({ grouping: 'collection' }); }
	boardService.saveView(options.collection ? 'Review queue' : 'All projects');
	if (options.sparse) {
		instantiation.get(IStorageService).store('sessions.board.cardSizes', JSON.stringify(sessions.map((session, index) => ({
			resource: session.resource.toString(), width: index % 2 ? 480 : 305, height: 480,
		}))), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
	const view = disposableStore.add(instantiation.createInstance(CustomViewNode, {
		id: SESSION_BOARD_VIEW_ID,
		ctor: new SyncDescriptor(SessionBoardView),
		actions: { style: 'toolbar', menuId: Menus.SessionsBoardToolbar },
	}));
	container.appendChild(view.element);
	view.layout(width, 730);
	if (options.keyboardFocus) { view.focus(); }
	await new Promise<void>(resolve => disposableStore.add(scheduleAtNextAnimationFrame(getWindow(container), () => resolve())));

	const cards = [...container.querySelectorAll<HTMLElement>('.session-board-card')];
	const rectangles = cards.map(card => card.getBoundingClientRect());
	if (rectangles.some(rectangle => Math.abs(rectangle.width - rectangles[0].width) > 1)) {
		throw new Error('Compact board cards must have equal column widths, including when older custom widths were saved.');
	}
	if (options.sparse && rectangles.some(rectangle => rectangle.height > 150)) {
		throw new Error('A compact card without result metadata must fit within 150px instead of reserving empty rows.');
	}
	if (rectangles.some(rectangle => rectangle.width > width)) {
		throw new Error('A compact board card must fit inside a narrow view.');
	}
	if (container.querySelector('.session-board-card-resources .action-label.codicon')) {
		throw new Error('Resource labels must use text typography rather than an icon font.');
	}
	if (cards.some(card => getWindow(card).getComputedStyle(card.querySelector<HTMLElement>('.session-board-card-title')!).borderWidth !== '0px')) {
		throw new Error('Session titles must be unboxed headings, not bordered text fields.');
	}
}

const expectedVisualDescriptions = [
	'The native Session board shows orderly equal-width compact cards under project or collection headings with counts.',
	'Session titles are readable unboxed headings, result labels do not overlap, and absent metadata leaves no reserved empty rows.',
	'Grouping, search, status, saved views, and View Options are visible; narrow layouts wrap the controls and show one card column.',
	'Card actions stay quiet at rest and are visible with keyboard focus or high contrast. Reply fields remain keyboard accessible.',
];

export default defineThemedFixtureGroup({ path: 'sessions/SessionBoard/', labels: { kind: 'screenshot' } }, {
	Projects: defineComponentFixture({ render: context => renderBoard(context), expectedVisualDescriptions, additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	Collections: defineComponentFixture({ render: context => renderBoard(context, { collection: true }), expectedVisualDescriptions }),
	Sparse: defineComponentFixture({ render: context => renderBoard(context, { sparse: true }), expectedVisualDescriptions }),
	WindowWidth: defineComponentFixture({ render: context => renderBoard(context, { width: 820, sparse: true }), expectedVisualDescriptions }),
	Narrow: defineComponentFixture({ render: context => renderBoard(context, { width: 390, longTitle: true }), expectedVisualDescriptions }),
	KeyboardFocus: defineComponentFixture({ render: context => renderBoard(context, { keyboardFocus: true }), expectedVisualDescriptions }),
});
