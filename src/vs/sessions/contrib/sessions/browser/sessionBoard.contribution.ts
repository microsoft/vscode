/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './sessionReviewController.js';
import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { Menus } from '../../../browser/menus.js';
import { getSessionConversationStatusLabel } from '../../../browser/sessionConversationGroups.js';
import { SessionsCategories } from '../../../common/categories.js';
import { SessionReviewArtifactsFocusContext, SessionReviewHasPullRequestContext, SessionReviewHasSelectionContext, SessionReviewSectionContext, SessionReviewSidebarFocusContext, SessionReviewVisibleContext, SessionsBoardCardExpandedContext, SessionsBoardCardFocusContext, SessionsBoardFocusContext, SessionsBoardVisibleContext } from '../../../common/contextkeys.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { ICustomViewGridPartService } from '../../../services/customView/browser/customViewGridPartService.js';
import { ISessionGroupsService } from '../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionInputDraftService } from '../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionReviewService } from '../../../services/sessions/browser/sessionReviewService.js';
import { ISessionsBoardOptions, ISessionsBoardService } from '../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { SESSION_BOARD_VIEW_ID, SessionReviewSection } from '../../../services/sessions/common/sessionReview.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionBoardView } from './views/sessionBoardView.js';

const boardEnabled = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, SessionsBoardVisibleContext);
const reviewEnabled = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, SessionReviewVisibleContext);

registerAction2(class ShowSessionBoard extends Action2 {
	constructor() {
		super({
			id: 'sessions.showSessionBoard',
			title: localize2('sessionBoard.show', "Show Sessions Board"),
			category: SessionsCategories.Sessions,
			icon: Codicon.layout,
			f1: true,
			precondition: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled),
			menu: { id: Menus.SidebarSessionsHeader, group: 'navigation', order: 5, when: ChatContextKeys.enabled },
		});
	}
	override run(accessor: ServicesAccessor): void {
		if (accessor.get(IChatEntitlementService).sentiment.hidden) { return; }
		accessor.get(ISessionsService).setSessionBoardVisible(true);
		accessor.get(ICustomViewGridPartService).focusActiveView();
	}
});

registerAction2(class CloseSessionBoard extends Action2 {
	constructor() {
		super({ id: 'sessions.closeSessionBoard', title: localize2('sessionBoard.close', "Close Sessions Board"), category: SessionsCategories.Sessions, icon: Codicon.close, f1: true, precondition: boardEnabled, menu: { id: Menus.SessionsBoardToolbar, group: 'navigation', order: 100 } });
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessions = accessor.get(ISessionsService);
		const part = accessor.get(ISessionsPartService);
		const review = accessor.get(ISessionReviewService);
		if (!await review.close()) { return; }
		sessions.setSessionBoardVisible(false);
		part.focusSession(sessions.activeSession.get());
	}
});

registerAction2(class ExpandBoardChat extends Action2 {
	constructor() {
		super({
			id: 'sessions.board.toggleExpanded',
			title: localize2('sessionBoard.expand', "Expand Chat"),
			icon: Codicon.screenFull,
			precondition: boardEnabled,
			toggled: { condition: SessionsBoardCardExpandedContext, title: localize('sessionBoard.collapse', "Collapse Chat"), icon: Codicon.screenNormal },
			menu: { id: Menus.SessionsBoardCard, group: 'navigation', order: 1 },
		});
	}
	override run(accessor: ServicesAccessor, session: IActiveSession): void {
		accessor.get(ISessionsBoardService).activeView.get()?.toggleMaximizeSession(session.sessionId);
	}
});

registerAction2(class ReviewBoardSession extends Action2 {
	constructor() {
		super({ id: 'sessions.board.openSession', title: localize2('sessionBoard.review', "Review Session"), icon: Codicon.linkExternal, precondition: boardEnabled, menu: { id: Menus.SessionsBoardCard, group: 'navigation', order: 2 } });
	}
	override async run(accessor: ServicesAccessor, session: IActiveSession): Promise<void> {
		await accessor.get(ISessionsService).openSessionReview(session, SessionReviewSection.Conversation);
	}
});

registerAction2(class SendBoardReply extends Action2 {
	constructor() { super({ id: 'sessions.board.sendReply', title: localize2('sessionBoard.send', "Send Reply"), precondition: boardEnabled }); }
	override async run(accessor: ServicesAccessor, session: IActiveSession): Promise<void> {
		const drafts = accessor.get(ISessionInputDraftService);
		const chat = session.activeChat.get();
		const before = drafts.getDraft(chat.resource).get();
		if (await accessor.get(ISessionReviewService).send(session, chat, before.inputText, before.attachments)) {
			if (drafts.getDraft(chat.resource).get() === before) {
				drafts.setDraft(chat.resource, { inputText: '', attachments: [] });
			}
		}
	}
});

for (const [order, item] of [
	{ section: SessionReviewSection.Conversation, title: localize2('sessionReview.conversation', "Conversation"), icon: Codicon.comment },
	{ section: SessionReviewSection.Artifacts, title: localize2('sessionReview.artifacts', "Artifacts"), icon: Codicon.files },
	{ section: SessionReviewSection.Changes, title: localize2('sessionReview.changes', "Changes"), icon: Codicon.gitCompare },
	{ section: SessionReviewSection.PullRequest, title: localize2('sessionReview.pr', "Pull Request"), icon: Codicon.gitPullRequest },
].entries()) {
	registerAction2(class SelectReviewSection extends Action2 {
		constructor() {
			super({
				id: `sessions.review.${item.section}`, title: item.title, icon: item.icon,
				precondition: item.section === SessionReviewSection.PullRequest ? ContextKeyExpr.and(reviewEnabled, SessionReviewHasPullRequestContext) : reviewEnabled,
				toggled: SessionReviewSectionContext.isEqualTo(item.section),
				menu: { id: Menus.SessionReview, group: 'navigation', order },
			});
		}
		override async run(accessor: ServicesAccessor, session?: IActiveSession): Promise<void> {
			const sessions = accessor.get(ISessionsService);
			const target = session ?? sessions.activeSession.get();
			if (!target) { return; }
			if (item.section === SessionReviewSection.Conversation || !isEqual(sessions.sessionReview.get()?.sessionResource, target.resource)) {
				await sessions.openSessionReview(target, item.section);
			} else {
				sessions.setSessionReviewSection(item.section);
			}
		}
	});
}

registerAction2(class DiscussReviewResult extends Action2 {
	constructor() {
		super({ id: 'sessions.review.discuss', title: localize2('sessionReview.addToReply', "Add to Reply"), icon: Codicon.addCompact, precondition: ContextKeyExpr.and(reviewEnabled, SessionReviewHasSelectionContext), menu: { id: Menus.SessionReviewActions, group: 'navigation', order: 1 } });
	}
	override run(accessor: ServicesAccessor): void { accessor.get(ISessionReviewService).discuss(); }
});
registerAction2(class BackToSessionBoard extends Action2 {
	constructor() {
		super({ id: 'sessions.review.back', title: localize2('sessionReview.back', "Back to Board"), icon: Codicon.arrowLeft, precondition: reviewEnabled, menu: { id: Menus.SessionReviewNavigation, group: 'navigation', order: 1 } });
	}
	override async run(accessor: ServicesAccessor): Promise<void> { await accessor.get(ISessionReviewService).close(); }
});

registerAction2(class ResetBoardLayout extends Action2 {
	constructor() {
		super({ id: 'sessions.resetSessionBoardLayout', title: localize2('sessionBoard.reset', "Reset Board Layout"), category: SessionsCategories.Sessions, icon: Codicon.discard, f1: true, precondition: boardEnabled, menu: { id: Menus.SessionsBoardToolbar, group: 'secondary', order: 1 } });
	}
	override run(accessor: ServicesAccessor): void { accessor.get(ISessionsBoardService).activeView.get()?.resetLayout(); }
});

for (const item of [
	{ id: 'increaseWidth', title: localize2('sessionBoard.increaseWidth', "Increase Card Width"), key: KeyCode.RightArrow, width: 40, height: 0 },
	{ id: 'decreaseWidth', title: localize2('sessionBoard.decreaseWidth', "Decrease Card Width"), key: KeyCode.LeftArrow, width: -40, height: 0 },
	{ id: 'increaseHeight', title: localize2('sessionBoard.increaseHeight', "Show More Chat Output"), key: KeyCode.DownArrow, width: 0, height: 40 },
	{ id: 'decreaseHeight', title: localize2('sessionBoard.decreaseHeight', "Show Less Chat Output"), key: KeyCode.UpArrow, width: 0, height: -40 },
]) {
	registerAction2(class ResizeBoardCard extends Action2 {
		constructor() {
			super({
				id: `sessions.board.${item.id}`, title: item.title, category: SessionsCategories.Sessions, precondition: boardEnabled, f1: true,
				keybinding: { primary: KeyMod.Alt | KeyMod.Shift | item.key, weight: KeybindingWeight.SessionsContrib, when: ContextKeyExpr.and(boardEnabled, SessionsBoardCardFocusContext) },
			});
		}
		override run(accessor: ServicesAccessor, session?: IActiveSession): void { accessor.get(ISessionsBoardService).activeView.get()?.resizeCard(session?.sessionId, item.width, item.height); }
	});
}

registerAction2(class BoardViewOptions extends Action2 {
	constructor() {
		super({ id: 'sessions.board.viewOptions', title: localize2('sessionBoard.options', "View Options"), icon: Codicon.settingsGear, precondition: boardEnabled, menu: { id: Menus.SessionsBoardControls, group: 'navigation', order: 10 } });
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const board = accessor.get(ISessionsBoardService);
		const quickInput = accessor.get(IQuickInputService);
		const choice = await quickInput.pick([
			{ id: 'project', label: localize('sessionBoard.groupProject', "Group by Project") },
			{ id: 'collection', label: localize('sessionBoard.groupCollection', "Group by Collection") },
			{ id: 'created', label: localize('sessionBoard.sortCreated', "Sort by Creation Time") },
			{ id: 'updated', label: localize('sessionBoard.sortUpdated', "Sort by Last Activity") },
			{ id: 'compact', label: localize('sessionBoard.compact', "Toggle Compact Cards") },
			{ id: 'fields', label: localize('sessionBoard.fields', "Choose Card Fields...") },
			{ id: 'status', label: localize('sessionBoard.filterStatus', "Filter by Status...") },
			...board.savedViews.get().map(view => ({ id: view.id, label: view.name, description: localize('sessionBoard.savedView', "Saved view") })),
		], { placeHolder: localize('sessionBoard.chooseOptions', "Customize the session board") });
		if (!choice) { return; }
		if (choice.id === 'project' || choice.id === 'collection') { board.updateOptions({ grouping: choice.id }); }
		else if (choice.id === 'created' || choice.id === 'updated') { board.updateOptions({ sort: choice.id }); }
		else if (choice.id === 'compact') { board.updateOptions({ compact: !board.options.get().compact }); }
		else if (choice.id === 'fields') {
			const fields: { key: keyof ISessionsBoardOptions; label: string }[] = [
				{ key: 'showChanges', label: localize('sessionBoard.fieldChanges', "Changed Files") },
				{ key: 'showArtifacts', label: localize('sessionBoard.fieldArtifacts', "Artifacts") },
				{ key: 'showPullRequest', label: localize('sessionBoard.fieldPR', "Pull Requests") },
				{ key: 'showReply', label: localize('sessionBoard.fieldReply', "Reply Input") },
				{ key: 'showBranch', label: localize('sessionBoard.fieldBranch', "Branch") },
			];
			const selected = await quickInput.pick(fields.map(field => ({ ...field, picked: !!board.options.get()[field.key] })), { canPickMany: true, placeHolder: localize('sessionBoard.selectFields', "Fields shown on compact cards") });
			if (selected) {
				const chosen = new Set(selected.map(field => field.key));
				board.updateOptions({ showChanges: chosen.has('showChanges'), showArtifacts: chosen.has('showArtifacts'), showPullRequest: chosen.has('showPullRequest'), showReply: chosen.has('showReply'), showBranch: chosen.has('showBranch') });
			}
		} else if (choice.id === 'status') {
			const selected = await quickInput.pick([
				{ status: undefined, label: localize('sessionBoard.allStatuses', "All Statuses") },
				...[SessionStatus.InProgress, SessionStatus.NeedsInput, SessionStatus.Completed, SessionStatus.Error].map(status => ({ status, label: getSessionConversationStatusLabel(status) })),
			], { placeHolder: localize('sessionBoard.selectStatus', "Filter sessions by status") });
			if (selected) { board.updateOptions({ status: selected.status }); }
		} else { board.selectView(choice.id); }
	}
});

registerAction2(class SaveBoardView extends Action2 {
	constructor() { super({ id: 'sessions.board.saveView', title: localize2('sessionBoard.save', "Save View"), icon: Codicon.pin, precondition: boardEnabled, menu: { id: Menus.SessionsBoardControls, group: 'secondary', order: 5 } }); }
	override async run(accessor: ServicesAccessor): Promise<void> {
		const board = accessor.get(ISessionsBoardService);
		const name = await accessor.get(IQuickInputService).input({ prompt: localize('sessionBoard.viewName', "Name this session board view"), validateInput: async value => value.trim() ? undefined : localize('sessionBoard.nameRequired', "Enter a name.") });
		if (name) { board.saveView(name); }
	}
});

registerAction2(class MoveBoardSessionToGroup extends Action2 {
	constructor() { super({ id: 'sessions.board.moveToGroup', title: localize2('sessionBoard.moveGroup', "Move to Collection..."), precondition: boardEnabled, menu: { id: Menus.SessionsBoardCard, group: 'secondary', order: 10 } }); }
	override async run(accessor: ServicesAccessor, session: IActiveSession): Promise<void> {
		const groups = accessor.get(ISessionGroupsService);
		const quickInput = accessor.get(IQuickInputService);
		const choices: (IQuickPickItem & { id: string })[] = [
			...groups.getGroups().map(group => ({ id: group.id, label: group.name })),
			{ id: 'new', label: localize('sessionBoard.newGroup', "Create Collection...") },
			{ id: 'none', label: localize('sessionBoard.noGroup', "Remove from Collection") },
		];
		const picked = await quickInput.pick(choices, { canPickMany: false });
		if (!picked) { return; }
		if (picked.id === 'none') { groups.removeFromGroup(session.sessionId); }
		else if (picked.id === 'new') {
			const name = await quickInput.input({ prompt: localize('sessionBoard.collectionName', "Collection name"), validateInput: async value => value.trim() ? undefined : localize('sessionBoard.nameRequired', "Enter a name.") });
			if (name) { groups.createGroup(name.trim(), [session.sessionId]); }
		} else { groups.addToGroup(session.sessionId, picked.id); }
	}
});

function restoreFocus(accessor: ServicesAccessor): () => void {
	const focused = getActiveElement();
	const board = accessor.get(ISessionsBoardService);
	const review = accessor.get(ISessionReviewService);
	const sessions = accessor.get(ISessionsService);
	return () => {
		if (isHTMLElement(focused) && focused.isConnected) { focused.focus(); }
		else if (sessions.sessionReview.get()) { review.focusReply(); }
		else { board.activeView.get()?.focusSession(undefined); }
	};
}

class SessionBoardAccessibility implements IAccessibleViewImplementation {
	readonly priority = 130;
	readonly name = 'sessionsBoard';
	readonly when = ContextKeyExpr.and(boardEnabled, SessionsBoardFocusContext, SessionReviewVisibleContext.negate());
	constructor(readonly type: AccessibleViewType) { }
	getProvider(accessor: ServicesAccessor) {
		const board = accessor.get(ISessionsBoardService);
		return new AccessibleContentProvider(AccessibleViewProviderId.SessionsBoard, { type: this.type }, () => this.type === AccessibleViewType.Help
			? [
				localize('sessionBoard.help', "The session board shows compact cards grouped by project or collection. Cards do not load chat history until expanded. Use Tab to reach the grouping, search, status and saved-view controls, then the session cards. Card actions appear on keyboard focus or hover. Enter sends from a compact reply field. Use View Options to choose sorting, density and card fields, and Save View in the toolbar menu to keep those choices. Expand Chat shows the existing chat view. Artifacts, Changes and Pull Request open a session review with a persistent reply. Use Move to Collection in the card menu to organize a session."),
				localize('sessionBoard.resizeHelp', "Compact cards use equal-width columns and fit their content. With a card header action focused, use {0} or {1} to expand and resize chat output by a column, and {2} or {3} to change how much output is visible. Collapsing restores the compact column while remembering the expanded size. These commands are also available in the Command Palette.", '<keybinding:sessions.board.increaseWidth>', '<keybinding:sessions.board.decreaseWidth>', '<keybinding:sessions.board.increaseHeight>', '<keybinding:sessions.board.decreaseHeight>'),
			].join('\n\n')
			: (board.activeView.get()?.sessions ?? []).map(session => localize('sessionBoard.accessibleSession', "{0}. {1}. {2}.", session.title.get(), session.workspace.get()?.label ?? '', getSessionConversationStatusLabel(session.status.get()))).join('\n\n'),
			restoreFocus(accessor), AccessibilityVerbositySettingId.SessionsBoard);
	}
}
class SessionReviewAccessibility implements IAccessibleViewImplementation {
	readonly priority = 140;
	readonly name = 'sessionReview';
	readonly when = ContextKeyExpr.and(reviewEnabled, ContextKeyExpr.or(SessionReviewSidebarFocusContext, SessionReviewArtifactsFocusContext));
	constructor(readonly type: AccessibleViewType) { }
	getProvider(accessor: ServicesAccessor) {
		const sessions = accessor.get(ISessionsService);
		const drafts = accessor.get(ISessionInputDraftService);
		const review = accessor.get(ISessionReviewService);
		return new AccessibleContentProvider(AccessibleViewProviderId.SessionReview, { type: this.type }, () => {
			if (this.type === AccessibleViewType.Help) {
				return localize('sessionReview.help', "Session review keeps your reply next to native result editors, or below them in a narrow window. Back to Board is at the start of the review controls. Use Tab to move between the controls and the reply. Use Up and Down Arrow in the vertical section list, or Left and Right Arrow when the sections are arranged horizontally. The selected section is highlighted and available result counts are shown. Add to Reply places the current file, changes, or link in the reply without changing its text or sending a message. The current result and this action stay next to the reply. References remain attached when switching results. An empty artifact catalog offers Open Conversation. Back to Board closes the native modal editor and returns to the same board. The native editor's Escape and close actions also return to the board. Enter sends a reply; Shift+Enter adds a line. Chat history is loaded only for Conversation or when needed to send.");
			}
			const session = sessions.activeSession.get();
			if (!session) { return ''; }
			const draft = drafts.getDraft(session.activeChat.get().resource).get();
			const content = [
				localize('sessionReview.accessible', "Session: {0}\nState: {1}\nReply: {2}\nReferences: {3}", session.title.get(), getSessionConversationStatusLabel(session.status.get()), draft.inputText, draft.attachments.map(attachment => attachment.name).join(', ')),
			];
			const selection = review.selection.get();
			if (selection) {
				content.push(localize('sessionReview.accessibleSelection', "Reviewing: {0}\n{1}", selection.label, selection.resource.toString()));
			}
			for (const artifact of session.artifacts?.get() ?? []) {
				content.push(localize('sessionReview.accessibleArtifact', "{0}: {1}\n{2}", artifact.isArtifact ? localize('sessionReview.artifact', "Artifact") : localize('sessionReview.reference', "Reference"), artifact.label, (artifact.uri ?? artifact.link)?.toString() ?? artifact.commitHash ?? ''));
			}
			return content.join('\n\n');
		}, restoreFocus(accessor), AccessibilityVerbositySettingId.SessionReview);
	}
}
AccessibleViewRegistry.register(new SessionBoardAccessibility(AccessibleViewType.Help));
AccessibleViewRegistry.register(new SessionBoardAccessibility(AccessibleViewType.View));
AccessibleViewRegistry.register(new SessionReviewAccessibility(AccessibleViewType.Help));
AccessibleViewRegistry.register(new SessionReviewAccessibility(AccessibleViewType.View));

class SessionBoardContribution extends Disposable {
	static readonly ID = 'sessions.nativeSessionBoard';
	constructor(
		@ICustomViewService customViews: ICustomViewService,
		@ISessionsService sessions: ISessionsService,
		@IChatEntitlementService entitlement: IChatEntitlementService,
		@ISessionReviewService _review: ISessionReviewService,
	) {
		super();
		this._register(customViews.registerCustomView({ id: SESSION_BOARD_VIEW_ID, ctor: new SyncDescriptor(SessionBoardView), actions: { style: 'toolbar', menuId: Menus.SessionsBoardToolbar } }, { restore: false }));
		this._register(autorun(reader => {
			if (sessions.isSessionBoardVisible.read(reader) && customViews.activeCustomView.read(reader)?.id !== SESSION_BOARD_VIEW_ID) {
				sessions.setSessionBoardVisible(false);
			}
		}));
		this._register(entitlement.onDidChangeSentiment(() => {
			if (entitlement.sentiment.hidden) { sessions.setSessionBoardVisible(false); }
		}));
	}
}
registerWorkbenchContribution2(SessionBoardContribution.ID, SessionBoardContribution, WorkbenchPhase.BlockRestore);
