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
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
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
import { ISessionsBoardService } from '../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, SessionStatus } from '../../../services/sessions/common/session.js';
import { SESSION_BOARD_VIEW_ID, SessionReviewSection } from '../../../services/sessions/common/sessionReview.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getSessionWorkViewLabel, SESSION_WORK_VIEWS } from '../../../services/sessions/common/sessionWorkQuery.js';
import { SessionBoardView } from './views/sessionBoardView.js';

const boardEnabled = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, SessionsBoardVisibleContext);
const reviewEnabled = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, SessionReviewVisibleContext);

registerAction2(class ShowSessionBoard extends Action2 {
	constructor() {
		super({
			id: 'sessions.showSessionBoard',
			title: localize2('sessionBoard.show', "Show Work Overview"),
			category: SessionsCategories.Sessions,
			icon: Codicon.layout,
			f1: true,
			precondition: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled),
			menu: { id: Menus.SidebarSessionsHeader, group: 'navigation', order: 5, when: ChatContextKeys.enabled },
		});
	}
	override run(accessor: ServicesAccessor): void {
		if (accessor.get(IChatEntitlementService).sentiment.hidden) { return; }
		accessor.get(ISessionsBoardService).updateOptions({ view: 'overview', collection: undefined, status: undefined, filter: '' });
		accessor.get(ISessionsService).setSessionBoardVisible(true);
		accessor.get(ICustomViewGridPartService).focusActiveView();
	}
});

registerAction2(class CreateWorkCollection extends Action2 {
	constructor() {
		super({ id: 'sessions.work.createCollection', title: localize2('sessionsWork.createCollection', "Create Collection"), icon: Codicon.newFolder, precondition: boardEnabled, f1: true });
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const groups = accessor.get(ISessionGroupsService);
		const board = accessor.get(ISessionsBoardService);
		const name = await accessor.get(IQuickInputService).input({
			prompt: localize('sessionsWork.collectionName', "Collection name"),
			validateInput: async value => value.trim() ? undefined : localize('sessionsWork.nameRequired', "Enter a collection name."),
		});
		if (name) {
			const group = groups.createGroup(name.trim());
			board.updateOptions({ view: 'all', collection: group.id, filter: '', status: undefined });
		}
	}
});

registerAction2(class ManageWorkCollection extends Action2 {
	constructor() {
		super({ id: 'sessions.work.manageCollection', title: localize2('sessionsWork.manageCollection', "Manage Collection"), precondition: boardEnabled });
	}
	override async run(accessor: ServicesAccessor, id: string): Promise<void> {
		const groups = accessor.get(ISessionGroupsService);
		const quickInput = accessor.get(IQuickInputService);
		const dialog = accessor.get(IDialogService);
		const board = accessor.get(ISessionsBoardService);
		const group = groups.getGroup(id);
		if (!group) { throw new Error(localize('sessionsWork.missingCollection', "This collection no longer exists.")); }
		const choice = await quickInput.pick([
			{ id: 'rename', label: localize('sessionsWork.renameCollection', "Rename Collection") },
			{ id: 'remove', label: localize('sessionsWork.removeCollection', "Remove Collection") },
		], { placeHolder: group.name });
		if (choice?.id === 'rename') {
			const name = await quickInput.input({ value: group.name, prompt: localize('sessionsWork.collectionName', "Collection name"), validateInput: async value => value.trim() ? undefined : localize('sessionsWork.nameRequired', "Enter a collection name.") });
			if (name) { groups.renameGroup(id, name.trim()); }
		} else if (choice?.id === 'remove') {
			const result = await dialog.confirm({ message: localize('sessionsWork.confirmRemoveCollection', "Remove the collection '{0}'?", group.name), detail: localize('sessionsWork.removeCollectionDetail', "Its sessions will remain available in All sessions."), primaryButton: localize('sessionsWork.removeCollection', "Remove Collection") });
			if (result.confirmed) {
				groups.deleteGroup(id);
				if (board.options.get().collection === id) { board.updateOptions({ collection: undefined }); }
			}
		}
	}
});

registerAction2(class NewWork extends Action2 {
	constructor() {
		super({ id: 'sessions.work.newSession', title: localize2('sessionsWork.newSession', "New Work"), icon: Codicon.add, precondition: boardEnabled, f1: true });
	}
	override run(accessor: ServicesAccessor): void {
		const sessions = accessor.get(ISessionsService);
		const board = accessor.get(ISessionsBoardService);
		const groups = accessor.get(ISessionGroupsService);
		const notification = accessor.get(INotificationService);
		if (accessor.get(IChatEntitlementService).sentiment.hidden) { return; }
		const collection = board.options.get().collection;
		const session = sessions.openQuickChat();
		if (!session) {
			notification.warn(localize('sessionsWork.noQuickChatProvider', "No provider is currently available for workspace-less work. Choose a provider in New Session and try again."));
			return;
		}
		if (collection) { groups.setPendingNewSessionGroup(collection); }
	}
});

registerAction2(class RemoveSavedWorkView extends Action2 {
	constructor() {
		super({ id: 'sessions.work.removeSavedView', title: localize2('sessionsWork.removeSavedView', "Remove Saved View"), precondition: boardEnabled });
	}
	override async run(accessor: ServicesAccessor, id: string): Promise<void> {
		const board = accessor.get(ISessionsBoardService);
		const view = board.savedViews.get().find(view => view.id === id);
		if (!view) { throw new Error(localize('sessionsWork.missingSavedView', "This saved view no longer exists.")); }
		const confirmation = await accessor.get(IDialogService).confirm({
			message: localize('sessionsWork.removeSavedViewConfirm', "Remove the saved view '{0}'?", view.name),
			detail: localize('sessionsWork.removeSavedViewDetail', "Only the saved filters are removed. No sessions are changed."),
			primaryButton: localize('sessionsWork.removeSavedView', "Remove Saved View"),
		});
		if (confirmation.confirmed) { board.deleteView(id); }
	}
});

registerAction2(class SearchWork extends Action2 {
	constructor() {
		super({
			id: 'sessions.work.search', title: localize2('sessionsWork.search', "Find Work"), precondition: boardEnabled, f1: true,
			keybinding: { primary: KeyMod.CtrlCmd | KeyCode.KeyF, weight: KeybindingWeight.SessionsContrib, when: ContextKeyExpr.and(boardEnabled, SessionsBoardFocusContext, SessionReviewVisibleContext.negate()) },
		});
	}
	override run(accessor: ServicesAccessor): void { accessor.get(ISessionsBoardService).activeView.get()?.focusSearch?.(); }
});

registerAction2(class SelectReviewChat extends Action2 {
	constructor() {
		super({
			id: 'sessions.review.selectChat',
			title: localize2('sessionReview.selectChat', "Choose Conversation"),
			icon: Codicon.commentDiscussion,
			precondition: reviewEnabled,
			menu: { id: Menus.SessionReviewNavigation, group: 'navigation', order: 2 },
		});
	}
	override async run(accessor: ServicesAccessor, session: IActiveSession): Promise<void> {
		const sessions = accessor.get(ISessionsService);
		const state = sessions.sessionReview.get();
		if (!state || !isEqual(state.sessionResource, session.resource)) { return; }
		const selected = await accessor.get(IQuickInputService).pick(session.chats.get().filter(chat => chat.interactivity.get() !== ChatInteractivity.Hidden).map(chat => ({
			label: chat.title.get() || localize('sessionReview.untitledConversation', "Untitled Conversation"),
			description: getSessionConversationStatusLabel(chat.status.get()),
			chat,
		})), { placeHolder: localize('sessionReview.chooseConversation', "Choose the conversation to read and reply to") });
		if (selected && sessions.sessionReview.get() === state) {
			await sessions.openSessionReview(session, state.section, {
				artifact: state.artifact, resource: state.resource, pullRequest: state.pullRequest, chatResource: selected.chat.resource,
			});
		}
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
			...SESSION_WORK_VIEWS.filter(view => view !== 'cards').map(view => ({ id: `view:${view}`, label: getSessionWorkViewLabel(view) })),
			{ id: 'created', label: localize('sessionBoard.sortCreated', "Sort by Creation Time") },
			{ id: 'updated', label: localize('sessionBoard.sortUpdated', "Sort by Last Activity") },
			{ id: 'status', label: localize('sessionBoard.filterStatus', "Filter by Status...") },
			...board.savedViews.get().map(view => ({ id: view.id, label: view.name, description: localize('sessionBoard.savedView', "Saved view") })),
		], { placeHolder: localize('sessionBoard.chooseOptions', "Customize the session board") });
		if (!choice) { return; }
		const workView = SESSION_WORK_VIEWS.find(view => choice.id === `view:${view}`);
		if (workView) { board.updateOptions({ view: workView }); }
		else if (choice.id === 'created' || choice.id === 'updated') { board.updateOptions({ sort: choice.id }); }
		else if (choice.id === 'status') {
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
			? board.activeView.get()?.getAccessibilityHelp?.() ?? [
				localize('sessionBoard.help', "My work contains Needs you, Needs review, In progress, and a collapsed All sessions section. Every session is a compact card. Ordinary cards show metadata and a lightweight reply input without loading conversations. Visible cards waiting for input load their real approval or question controls automatically; a decision always requires your action. Use arrow keys to navigate the tree and Tab to enter card controls. Enter opens focused review from a card header and sends from its reply input; Shift+Enter adds a line. Find Work filters titles and workspaces without performing actions."),
				localize('sessionBoard.collectionsHelp', "Pin as Automatic Collection adds a section to the sidebar while keeping it in My work. Automatic collections update as sessions change and do not accept manual drops. Drag a card header onto a manual collection, or use Move to Collection in the card menu. This changes its manual collection, not its status or repository. Removing a collection leaves its sessions available in All sessions. Save View stores filter criteria. More Actions provides archive suggestions, archived sessions, and view options."),
				localize('sessionBoard.resizeHelp', "Drag the right or bottom edge of a card to resize it. Increasing height reveals the conversation above the reply; reducing height returns to the compact card without losing its draft. With a card header focused, use {0} or {1} to resize its width and {2} or {3} to show more or less conversation. Expand or Collapse Conversation is also available in the card menu. These resize commands are available in the Command Palette.", '<keybinding:sessions.board.increaseWidth>', '<keybinding:sessions.board.decreaseWidth>', '<keybinding:sessions.board.increaseHeight>', '<keybinding:sessions.board.decreaseHeight>'),
				localize('sessionBoard.reviewArchiveHelp', "Mark Results Reviewed records a review checkpoint, not approval or task completion. Consider Archiving uses explicit local activity and known outcomes; automatic card loading does not count as human activity. Missing data requires inspection. Select cards with their checkboxes, or press Space on a card header. Archive Selected previews effects and rechecks each session; Keep Selected dismisses suggestions."),
			].join('\n\n')
			: board.activeView.get()?.getAccessibleContent?.() ?? (board.activeView.get()?.sessions ?? []).map(session => localize('sessionBoard.accessibleSession', "{0}. {1}. {2}.", session.title.get(), session.workspace.get()?.label ?? '', getSessionConversationStatusLabel(session.status.get()))).join('\n\n'),
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
				return localize('sessionReview.help', "Session review keeps navigation on the left and your reply below the native result editor. The reply identifies its target conversation and remains in the same place when switching results. Back to Board is at the start of the review controls. Choose Conversation selects another chat in this session; each chat keeps its own draft and references. Use Tab to move between the controls and the reply, and Up and Down Arrow in the section list. The selected section is highlighted and available result counts are shown. Add to Reply places the current file, changes, or link in the reply without changing its text or sending a message. References remain attached when switching results. An empty artifact catalog offers Open Conversation. Back to Board closes the native modal editor and returns to the same work overview. The native editor's Escape and close actions also return to the overview. Enter sends a reply; Shift+Enter adds a line. Chat history is loaded only for Conversation or when needed to send.");
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
		@ISessionsManagementService management: ISessionsManagementService,
		@ISessionsBoardService board: ISessionsBoardService,
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
		this._register(management.onDidReplaceSession(({ from, to }) => board.rebindCardSession(from.sessionId, to.sessionId)));
		this._register(management.onDidDeleteSession(session => board.removeCardSession(session.sessionId)));
	}
}
registerWorkbenchContribution2(SessionBoardContribution.ID, SessionBoardContribution, WorkbenchPhase.BlockRestore);
