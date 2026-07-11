/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import {
	SessionHasChangesContext,
	SessionHasPullRequestContext,
	SessionHasWorkspaceContext,
	IsQuickChatSessionContext,
	SessionIsArchivedContext,
	SessionIsCreatedContext,
	SessionIsReadContext,
	SessionIsStickyContext,
	SessionProviderIdContext,
	SessionSupportsDeleteContext,
	SessionSupportsMultipleChatsContext,
	SessionSupportsForkContext,
	SessionSupportsRenameContext,
	SessionTypeContext,
	SessionWorkspaceIsVirtualContext,
	SessionIdContext,
	SessionHasMultipleCommittedChatsContext,
	SessionShouldShowChatTabsContext,
	SessionHasMultipleOpenChatsContext,
	SessionActiveChatIsClosableContext,
	SessionActiveChatIsDeletableContext,
	SessionActiveChatHasSubagentsContext,
} from '../../../common/contextkeys.js';
import { ChatOriginKind, getChatCapabilities, ISession, SessionStatus } from './session.js';
import { IActiveSession } from './sessionsManagement.js';

/**
 * The set of session context keys bound to a single {@link IContextKeyService}.
 */
interface ISessionContextKeys {
	readonly sessionId: IContextKey<string>;
	readonly providerId: IContextKey<string>;
	readonly type: IContextKey<string>;
	readonly isArchived: IContextKey<boolean>;
	readonly isRead: IContextKey<boolean>;
	readonly supportsMultipleChats: IContextKey<boolean>;
	readonly supportsFork: IContextKey<boolean>;
	readonly supportsRename: IContextKey<boolean>;
	readonly supportsDelete: IContextKey<boolean>;
	readonly workspaceIsVirtual: IContextKey<boolean>;
	readonly hasChanges: IContextKey<boolean>;
	readonly hasPullRequest: IContextKey<boolean>;
	readonly hasWorkspace: IContextKey<boolean>;
	readonly isQuickChat: IContextKey<boolean>;
	readonly isCreated: IContextKey<boolean>;
	readonly sticky: IContextKey<boolean>;
	readonly hasMultipleCommittedChats: IContextKey<boolean>;
	readonly shouldShowChatTabs: IContextKey<boolean>;
	readonly hasMultipleOpenChats: IContextKey<boolean>;
	readonly activeChatIsClosable: IContextKey<boolean>;
	readonly activeChatIsDeletable: IContextKey<boolean>;
	readonly activeChatHasSubagents: IContextKey<boolean>;
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
			isRead: SessionIsReadContext.bindTo(contextKeyService),
			supportsMultipleChats: SessionSupportsMultipleChatsContext.bindTo(contextKeyService),
			supportsFork: SessionSupportsForkContext.bindTo(contextKeyService),
			supportsRename: SessionSupportsRenameContext.bindTo(contextKeyService),
			supportsDelete: SessionSupportsDeleteContext.bindTo(contextKeyService),
			workspaceIsVirtual: SessionWorkspaceIsVirtualContext.bindTo(contextKeyService),
			hasChanges: SessionHasChangesContext.bindTo(contextKeyService),
			hasPullRequest: SessionHasPullRequestContext.bindTo(contextKeyService),
			hasWorkspace: SessionHasWorkspaceContext.bindTo(contextKeyService),
			isQuickChat: IsQuickChatSessionContext.bindTo(contextKeyService),
			isCreated: SessionIsCreatedContext.bindTo(contextKeyService),
			sticky: SessionIsStickyContext.bindTo(contextKeyService),
			hasMultipleCommittedChats: SessionHasMultipleCommittedChatsContext.bindTo(contextKeyService),
			shouldShowChatTabs: SessionShouldShowChatTabsContext.bindTo(contextKeyService),
			hasMultipleOpenChats: SessionHasMultipleOpenChatsContext.bindTo(contextKeyService),
			activeChatIsClosable: SessionActiveChatIsClosableContext.bindTo(contextKeyService),
			activeChatIsDeletable: SessionActiveChatIsDeletableContext.bindTo(contextKeyService),
			activeChatHasSubagents: SessionActiveChatHasSubagentsContext.bindTo(contextKeyService),
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
 */
export function setSessionContextKeys(session: ISession | undefined, contextKeyService: IContextKeyService, reader: IReader | undefined): void {
	const keys = getBoundKeys(contextKeyService);
	keys.sessionId.set(session?.sessionId ?? '');
	keys.providerId.set(session?.providerId ?? '');
	keys.type.set(session?.sessionType ?? '');
	keys.isArchived.set(session?.isArchived.read(reader) ?? false);
	keys.isRead.set(session?.isRead.read(reader) ?? true);
	const capabilities = session?.capabilities.read(reader);
	keys.supportsMultipleChats.set(capabilities?.supportsMultipleChats ?? false);
	keys.supportsFork.set(capabilities?.supportsFork ?? false);
	keys.supportsRename.set(capabilities?.supportsRename ?? false);
	keys.supportsDelete.set(capabilities?.supportsDelete ?? false);
	keys.workspaceIsVirtual.set(session?.workspace.read(reader)?.isVirtualWorkspace ?? true);

	// Mirror the changes pill: the default changeset, falling back to the session's changes.
	const defaultChangeset = session?.changesets.read(reader)?.find(c => c.isDefault.read(reader));
	let insertions = 0;
	let deletions = 0;
	for (const change of defaultChangeset?.changes.read(reader) ?? session?.changes.read(reader) ?? []) {
		insertions += change.insertions;
		deletions += change.deletions;
	}
	keys.hasChanges.set(insertions > 0 || deletions > 0);

	const pullRequest = session?.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader)?.pullRequest;
	keys.hasPullRequest.set(!!pullRequest);

	keys.hasWorkspace.set(!!session?.workspace.read(reader)?.label);

	// Sourced from the session's `isQuickChat` tag — never inferred from
	// `workspace === undefined` (which is also transiently true for a
	// still-resolving workspace session).
	keys.isQuickChat.set(!!session && (session.isQuickChat?.read(reader) ?? false));
}

/**
 * Sets every context key that can be derived from an {@link IActiveSession} on
 * the given context key service. This is a superset of
 * {@link setSessionContextKeys} that also applies the keys which only exist on
 * an active (visible) session, then delegates to it for the shared keys.
 *
 * See {@link setSessionContextKeys} for the `reader` and `undefined` semantics.
 */
export function setActiveSessionContextKeys(session: IActiveSession | undefined, contextKeyService: IContextKeyService, reader: IReader | undefined): void {
	setSessionContextKeys(session, contextKeyService, reader);
	const keys = getBoundKeys(contextKeyService);
	keys.isCreated.set(session?.isCreated.read(reader) ?? false);
	keys.sticky.set(session?.sticky.read(reader) ?? false);

	// Count committed (non-draft) chats: untitled in-composer drafts are excluded
	// so the Conversations menu only surfaces once a session has more than one
	// real chat. Counts the whole chat list (open or closed) so a committed chat
	// that was closed still keeps the menu available to reopen it.
	const committedChatCount = session?.chats.read(reader)
		.reduce((count, chat) => chat.status.read(reader) === SessionStatus.Untitled || chat.origin?.kind === ChatOriginKind.Tool ? count : count + 1, 0) ?? 0;
	keys.hasMultipleCommittedChats.set(committedChatCount > 1);

	// The tab strip is shown when the session has more than one chat (counting
	// closed chats) or its single remaining chat's title diverged from the
	// session title; the header then hides its own New Chat button.
	keys.shouldShowChatTabs.set(session?.shouldShowChatTabs.read(reader) ?? false);

	// More than one open chat tab (incl. drafts): scopes chat-to-chat navigation
	// so it stays a no-op when only a single open chat remains (e.g. a single
	// chat with a diverged title, or one open + one closed chat).
	keys.hasMultipleOpenChats.set((session?.visibleChatTabs.read(reader).length ?? 0) > 1);

	// The active chat can be closed (hidden) from the tab strip when it is a
	// non-main chat — including read-only subagent chats, which surface as
	// closeable tabs. The main chat lives and dies with its session.
	const activeChat = session?.activeChat.read(reader);
	const mainResource = session?.mainChat.read(reader).resource;
	const isNonMainChat = !!activeChat && !!mainResource && !isEqual(activeChat.resource, mainResource);
	keys.activeChatIsClosable.set(isNonMainChat);
	// It can be permanently deleted only when its effective capabilities allow
	// it: the main chat and worker (subagent) chats report `canDelete: false`,
	// so they are closeable but not deletable.
	keys.activeChatIsDeletable.set(!!activeChat && getChatCapabilities(activeChat, session, reader).canDelete);

	// The active chat has subagents when any tool-origin chat names it as its
	// parent. These are listed as a separate group in the Conversations menu, so
	// the menu must surface even when the active chat is the only committed chat.
	const allChats = session?.chats.read(reader) ?? [];
	keys.activeChatHasSubagents.set(!!activeChat && allChats.some(chat =>
		chat.origin?.kind === ChatOriginKind.Tool &&
		!!chat.origin.parentChat &&
		isEqual(chat.origin.parentChat, activeChat.resource)));
}
