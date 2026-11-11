/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import {
	SessionHasChangesContext,
	SessionHasCachedChangesContext,
	SessionHasPullRequestContext,
	SessionHasIssuesContext,
	SessionHasWorkspaceContext,
	IsQuickChatSessionContext,
	SessionIsArchivedContext,
	SessionIsActiveContext,
	SessionIsCreatedContext,
	SessionIsReadContext,
	SessionIsStickyContext,
	SessionProviderIdContext,
	SessionSupportsDeleteContext,
	SessionSupportsMultipleChatsContext,
	SessionSupportsForkContext,
	SessionSupportsSideChatContext,
	SessionSupportsRenameContext,
	SessionTypeContext,
	SessionWorkspaceIsVirtualContext,
	SessionIdContext,
	SessionHasMultipleCommittedChatsContext,
	SessionShouldShowChatTabsContext,
	SessionHasMultipleOpenChatsContext,
	SessionActiveChatIsClosableContext,
	SessionActiveChatCanArchiveContext,
	SessionActiveChatIsDeletableContext,
	SessionActiveChatIsUntitledContext,
	SessionActiveChatHasSideChatsContext,
	SessionActiveChatResourceContext,
	SessionActiveChatCanvasReferenceKeysContext,
	SessionHasGitRepositoryContext,
} from './contextkeys.js';
import { ChatOriginKind, getChatCapabilities, IChat, isActiveSessionStatus, isSessionCreated, isSideChatOf, ISession, isWorkspacelessQuickChat, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionChangesStatsCache, readChatChangesStats, readSessionChangesStats } from '../../../services/sessions/common/sessionChangesStatsCache.js';
import { getCanvasReferenceKey } from '../../../common/canvasReference.js';
import { IPaneViewState } from '../../../services/sessions/common/sessionPane.js';

/**
 * The set of session context keys bound to a single {@link IContextKeyService}.
 */
interface ISessionContextKeys {
	readonly sessionId: IContextKey<string>;
	readonly providerId: IContextKey<string>;
	readonly type: IContextKey<string>;
	readonly isArchived: IContextKey<boolean>;
	readonly isActive: IContextKey<boolean>;
	readonly isRead: IContextKey<boolean>;
	readonly supportsMultipleChats: IContextKey<boolean>;
	readonly supportsFork: IContextKey<boolean>;
	readonly supportsSideChat: IContextKey<boolean>;
	readonly supportsRename: IContextKey<boolean>;
	readonly supportsDelete: IContextKey<boolean>;
	readonly workspaceIsVirtual: IContextKey<boolean>;
	readonly hasGitRepository: IContextKey<boolean>;
	readonly hasChanges: IContextKey<boolean>;
	readonly hasCachedChanges: IContextKey<boolean>;
	readonly hasPullRequest: IContextKey<boolean>;
	readonly hasIssues: IContextKey<boolean>;
	readonly hasWorkspace: IContextKey<boolean>;
	readonly isQuickChat: IContextKey<boolean>;
	readonly isCreated: IContextKey<boolean>;
	readonly sticky: IContextKey<boolean>;
	readonly hasMultipleCommittedChats: IContextKey<boolean>;
	readonly shouldShowChatTabs: IContextKey<boolean>;
	readonly hasMultipleOpenChats: IContextKey<boolean>;
	readonly activeChatIsClosable: IContextKey<boolean>;
	readonly activeChatCanArchive: IContextKey<boolean>;
	readonly activeChatIsDeletable: IContextKey<boolean>;
	readonly activeChatIsUntitled: IContextKey<boolean>;
	readonly activeChatResource: IContextKey<string>;
	readonly activeChatCanvasReferenceKeys: IContextKey<string[]>;
	readonly activeChatHasSideChats: IContextKey<boolean>;
}

/**
 * Caches the bound context keys per {@link IContextKeyService}. Binding a
 * {@link RawContextKey} resets it to its default value, so re-binding on every
 * call (these helpers run inside `autorun`s) would churn the keys and emit
 * spurious change events. Binding once per service and reusing the bound keys
 * lets {@link IContextKey.set} short-circuit unchanged values instead. The map
 * is weak so entries are released once the service is disposed and collected.
 */
const boundKeysByService = new WeakMap<IContextKeyService, ISessionContextKeys>();

function getBoundKeys(contextKeyService: IContextKeyService): ISessionContextKeys {
	let keys = boundKeysByService.get(contextKeyService);
	if (!keys) {
		keys = {
			sessionId: SessionIdContext.bindTo(contextKeyService),
			providerId: SessionProviderIdContext.bindTo(contextKeyService),
			type: SessionTypeContext.bindTo(contextKeyService),
			isArchived: SessionIsArchivedContext.bindTo(contextKeyService),
			isActive: SessionIsActiveContext.bindTo(contextKeyService),
			isRead: SessionIsReadContext.bindTo(contextKeyService),
			supportsMultipleChats: SessionSupportsMultipleChatsContext.bindTo(contextKeyService),
			supportsFork: SessionSupportsForkContext.bindTo(contextKeyService),
			supportsSideChat: SessionSupportsSideChatContext.bindTo(contextKeyService),
			supportsRename: SessionSupportsRenameContext.bindTo(contextKeyService),
			supportsDelete: SessionSupportsDeleteContext.bindTo(contextKeyService),
			workspaceIsVirtual: SessionWorkspaceIsVirtualContext.bindTo(contextKeyService),
			hasGitRepository: SessionHasGitRepositoryContext.bindTo(contextKeyService),
			hasChanges: SessionHasChangesContext.bindTo(contextKeyService),
			hasCachedChanges: SessionHasCachedChangesContext.bindTo(contextKeyService),
			hasPullRequest: SessionHasPullRequestContext.bindTo(contextKeyService),
			hasIssues: SessionHasIssuesContext.bindTo(contextKeyService),
			hasWorkspace: SessionHasWorkspaceContext.bindTo(contextKeyService),
			isQuickChat: IsQuickChatSessionContext.bindTo(contextKeyService),
			isCreated: SessionIsCreatedContext.bindTo(contextKeyService),
			sticky: SessionIsStickyContext.bindTo(contextKeyService),
			hasMultipleCommittedChats: SessionHasMultipleCommittedChatsContext.bindTo(contextKeyService),
			shouldShowChatTabs: SessionShouldShowChatTabsContext.bindTo(contextKeyService),
			hasMultipleOpenChats: SessionHasMultipleOpenChatsContext.bindTo(contextKeyService),
			activeChatIsClosable: SessionActiveChatIsClosableContext.bindTo(contextKeyService),
			activeChatCanArchive: SessionActiveChatCanArchiveContext.bindTo(contextKeyService),
			activeChatIsDeletable: SessionActiveChatIsDeletableContext.bindTo(contextKeyService),
			activeChatIsUntitled: SessionActiveChatIsUntitledContext.bindTo(contextKeyService),
			activeChatResource: SessionActiveChatResourceContext.bindTo(contextKeyService),
			activeChatCanvasReferenceKeys: SessionActiveChatCanvasReferenceKeysContext.bindTo(contextKeyService),
			activeChatHasSideChats: SessionActiveChatHasSideChatsContext.bindTo(contextKeyService),
		};
		boundKeysByService.set(contextKeyService, keys);
	}
	return keys;
}

/**
 * Sets every context key that can be derived from an {@link ISession} on the
 * given context key service. The service may be the global/root service (so the
 * keys reflect the active session) or a scoped service owned by an isolated
 * component (e.g. a session view), in which case the keys are scoped to that
 * component's session.
 *
 * When invoked from within an `autorun`/`derived`, pass the `reader` so the
 * observable session properties are tracked and the keys are re-applied on
 * change. Pass `undefined` for a one-shot read (equivalent to `.get()`).
 *
 * Passing `undefined` for `session` resets the keys to their defaults (e.g. for
 * the empty new-session slot).
 *
 * Pass the `changesStatsCache` on surfaces that render the changes pill so it can
 * be shown optimistically while the session's own changes are still loading.
 */
export function setSessionContextKeys(session: ISession | undefined, contextKeyService: IContextKeyService, reader: IReader | undefined, changesStatsCache?: ISessionChangesStatsCache): void {
	contextKeyService.bufferChangeEvents(() => {
		setSessionContextKeysUnbuffered(session, contextKeyService, reader, changesStatsCache);
	});
}

function setSessionContextKeysUnbuffered(session: ISession | undefined, contextKeyService: IContextKeyService, reader: IReader | undefined, changesStatsCache?: ISessionChangesStatsCache): void {
	const keys = getBoundKeys(contextKeyService);
	keys.sessionId.set(session?.sessionId ?? '');
	keys.providerId.set(session?.providerId ?? '');
	keys.type.set(session?.sessionType ?? '');
	keys.isArchived.set(session?.isArchived.read(reader) ?? false);
	keys.isActive.set(session ? isActiveSessionStatus(session.status.read(reader)) : false);
	keys.isRead.set(session?.mainChat.read(reader).isRead.read(reader) ?? true);
	const capabilities = session?.capabilities.read(reader);
	keys.supportsMultipleChats.set(capabilities?.supportsMultipleChats ?? false);
	keys.supportsFork.set(capabilities?.supportsFork ?? false);
	keys.supportsSideChat.set(capabilities?.supportsSideChat ?? false);
	keys.supportsRename.set(capabilities?.supportsRename ?? false);
	keys.supportsDelete.set(capabilities?.supportsDelete ?? false);
	const workspace = session?.workspace.read(reader);
	keys.workspaceIsVirtual.set(workspace?.isVirtualWorkspace ?? true);
	keys.hasGitRepository.set(session?.hasGitRepository?.read(reader) ?? workspace?.folders.some(folder => folder.gitRepository !== undefined) ?? false);

	const worktreePending = session?.worktreePending?.read(reader) ?? false;
	const changesStats = session ? readSessionChangesStats(session, reader) : undefined;
	keys.hasChanges.set(!worktreePending && !!changesStats && (changesStats.insertions > 0 || changesStats.deletions > 0));

	// A session reports its changes late, so until it does the pill it last showed
	// is rendered from the cache. The remembered pill is dropped as soon as the
	// session reports its own changes, even when it reports none.
	const changesReported = changesStats !== undefined;
	const cachedFiles = !changesReported && session ? changesStatsCache?.get(session.sessionId, reader)?.files ?? 0 : 0;
	keys.hasCachedChanges.set(!worktreePending && cachedFiles > 0);

	const pullRequest = session?.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader)?.pullRequest;
	keys.hasPullRequest.set(!!pullRequest);

	const issues = session?.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader)?.issues;
	keys.hasIssues.set(!!issues?.length);

	keys.hasWorkspace.set(!!session?.workspace.read(reader)?.label);

	// Sourced from the session's `isQuickChat` tag — never inferred from
	// `workspace === undefined` (which is also transiently true for a
	// still-resolving workspace session).
	keys.isQuickChat.set(!!session && (session.isQuickChat?.read(reader) ?? false));

}

/**
 * Sets every context key of the session a host shows: the keys of {@link setSessionContextKeys}, and the keys of the chat
 * it shows of it, which the session does not select for every place that shows it, and of the state of the pane that
 * shows it. Without a pane, as for a chat window or a composer, the session is not pinned and shows no tab strip.
 *
 * See {@link setSessionContextKeys} for the `reader` and `undefined` semantics.
 */
export function setHostSessionContextKeys(session: ISession | undefined, chat: IChat | undefined, paneState: IPaneViewState | undefined, contextKeyService: IContextKeyService, reader: IReader | undefined, changesStatsCache?: ISessionChangesStatsCache): void {
	contextKeyService.bufferChangeEvents(() => {
		setSessionContextKeysUnbuffered(session, contextKeyService, reader, changesStatsCache);
		const keys = getBoundKeys(contextKeyService);
		keys.isCreated.set(isSessionCreated(session, reader));
		keys.sticky.set(paneState?.sticky.read(reader) ?? false);
		const focusedChat = chat;
		const activeChatStats = focusedChat ? readChatChangesStats(focusedChat, reader) : undefined;
		const worktreePending = session?.worktreePending?.read(reader) ?? false;
		keys.hasChanges.set(!worktreePending && !!activeChatStats && (activeChatStats.insertions > 0 || activeChatStats.deletions > 0));
		const mainChat = session?.mainChat?.read(reader);
		const isMainChat = mainChat && focusedChat && isEqual(mainChat.resource, focusedChat.resource);
		const cachedFiles = activeChatStats === undefined && isMainChat && session && !isWorkspacelessQuickChat(session, focusedChat, reader) ? changesStatsCache?.get(session.sessionId, reader)?.files ?? 0 : 0;
		keys.hasCachedChanges.set(!worktreePending && cachedFiles > 0);

		// Count committed (non-draft) chats: untitled in-composer drafts are excluded
		// so the Chats dropdown only surfaces once a session has more than one
		// real chat. Counts the whole chat list (open or closed) so a committed chat
		// that was closed still keeps the menu available to reopen it.
		const committedChatCount = session?.chats.read(reader)
			.reduce((count, chat) => chat.status.read(reader) === SessionStatus.Untitled || chat.origin?.kind === ChatOriginKind.Tool ? count : count + 1, 0) ?? 0;
		keys.hasMultipleCommittedChats.set(committedChatCount > 1);

		// The tab strip is shown when the session has more than one chat (counting
		// closed chats) or its single remaining chat's title diverged from the session title.
		keys.shouldShowChatTabs.set(paneState?.tabs.shouldShowChatTabs.read(reader) ?? false);

		// More than one open chat tab (incl. drafts): scopes chat-to-chat navigation
		// so it stays a no-op when only a single open chat remains (e.g. a single
		// chat with a diverged title, or one open + one closed chat).
		keys.hasMultipleOpenChats.set((paneState?.tabs.visibleChatTabs.read(reader).length ?? 0) > 1);

		// The active chat can be closed (hidden) from the tab strip when it is a
		// non-main chat — including read-only subagent chats, which surface as
		// closeable tabs. The main chat lives and dies with its session.
		const activeChat = chat;
		const mainResource = session?.mainChat.read(reader).resource;
		keys.activeChatResource.set(activeChat?.resource.toString() ?? '');
		keys.activeChatCanvasReferenceKeys.set(activeChat && session ? (activeChat.canvases?.read(reader) ?? []).map(canvas => getCanvasReferenceKey({
			providerId: session.providerId,
			session: session.resource,
			chat: activeChat.resource,
			canvas: canvas.resource,
		})) : []);
		const isNonMainChat = !!activeChat && !!mainResource && !isEqual(mainResource, activeChat.resource);
		keys.activeChatIsClosable.set(isNonMainChat);
		keys.activeChatCanArchive.set(!!activeChat && !(activeChat.isArchived?.read(reader) ?? false) && getChatCapabilities(activeChat, session, reader).canArchive);
		// It can be permanently deleted only when its effective capabilities allow
		// it: the main chat and worker (subagent) chats report `canDelete: false`,
		// so they are closeable but not deletable.
		keys.activeChatIsDeletable.set(!!activeChat && getChatCapabilities(activeChat, session, reader).canDelete);
		keys.activeChatIsUntitled.set(activeChat?.status.read(reader) === SessionStatus.Untitled);
		const workspace = activeChat?.workspace.read(reader);
		keys.workspaceIsVirtual.set(workspace?.isVirtualWorkspace ?? true);
		keys.hasWorkspace.set(!!workspace?.label);
		keys.isQuickChat.set(!!session && isWorkspacelessQuickChat(session, activeChat, reader));

		const allChats = session?.chats.read(reader) ?? [];
		keys.activeChatHasSideChats.set(!!activeChat && allChats.some(chat => isSideChatOf(chat, activeChat.resource)));
	});
}
