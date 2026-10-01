/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatInteractivity, DEFAULT_CHAT_CAPABILITIES, IChat, ISession, ISessionChangesSummary, ISessionWorkspace, SessionStatus } from '../../common/session.js';

/** A peer chat of a {@link ITestSessionSpec}. */
export interface ITestChatSpec {
	/** Unique within its session. */
	readonly id: string;
	readonly title: string;
	readonly workspace?: string;
	readonly status?: SessionStatus;
	/** Minutes since this chat was last updated; defaults to the session's {@link ITestSessionSpec.minutesAgo}. */
	readonly minutesAgo?: number;
	/** Whether this chat's modified time is resolved; defaults to `true`. */
	readonly hasModifiedTime?: boolean;
	readonly interactivity?: ChatInteractivity;
	readonly isArchived?: boolean;
	readonly isRead?: boolean;
	/** Whether the chat can be archived on its own; defaults to `false`, like {@link DEFAULT_CHAT_CAPABILITIES}. */
	readonly canArchive?: boolean;
}

/** Plain data describing a session for tests and component fixtures. */
export interface ITestSessionSpec {
	/** The session id, from which the session and chat resources derive. */
	readonly id: string;
	readonly title: string;
	/** Workspace label. Omit for a session without a workspace. */
	readonly workspace?: string;
	readonly workspaceFolders?: readonly [string, ...string[]];
	readonly isQuickChat?: boolean;
	readonly status?: SessionStatus;
	/** Status of the main chat when it differs from the session status. */
	readonly mainChatStatus?: SessionStatus;
	/** Minutes since the main chat was last updated; defaults to {@link minutesAgo}. */
	readonly mainChatMinutesAgo?: number;
	/** Whether the main chat's modified time is resolved; defaults to `true`. */
	readonly mainChatHasModifiedTime?: boolean;
	/** Read state of the main chat when it differs from the session read state. */
	readonly mainChatIsRead?: boolean;
	/** Status description rendered as markdown. */
	readonly description?: string;
	/** Minutes since the session was last updated. */
	readonly minutesAgo?: number;
	/** Minutes since the session was created; defaults to {@link minutesAgo}. */
	readonly createdMinutesAgo?: number;
	readonly changesSummary?: ISessionChangesSummary;
	readonly isRead?: boolean;
	readonly isArchived?: boolean;
	readonly isExternal?: boolean;
	/** Defaults to whether the session has {@link chats}. */
	readonly supportsMultipleChats?: boolean;
	/** Peer chats besides the main chat. */
	readonly chats?: readonly ITestChatSpec[];
}

/** A chat built from a spec, with handles to change its state. */
export interface ITestChat {
	readonly chat: IChat;
	readonly title: ISettableObservable<string>;
	readonly status: ISettableObservable<SessionStatus>;
	readonly updatedAt: ISettableObservable<Date | undefined>;
	readonly isArchived: ISettableObservable<boolean>;
	readonly isRead: ISettableObservable<boolean>;
}

/** A session built from a {@link ITestSessionSpec}, with handles to change its state. */
export interface ITestSession {
	readonly session: ISession;
	readonly mainChat: ITestChat;
	/** Peer chats by {@link ITestChatSpec.id}. */
	readonly chats: ReadonlyMap<string, ITestChat>;
	readonly title: ISettableObservable<string>;
	readonly status: ISettableObservable<SessionStatus>;
	readonly isRead: ISettableObservable<boolean>;
	readonly isArchived: ISettableObservable<boolean>;
}

export function getTestSessionResource(sessionId: string): URI {
	return URI.parse(`vscode-session://session/${sessionId}`);
}

export function getTestChatResource(sessionId: string, chatId: string): URI {
	return URI.parse(`vscode-session://session/${sessionId}/chat/${chatId}`);
}

export function buildTestWorkspace(label: string, folderLabels: readonly [string, ...string[]] = [label]): ISessionWorkspace {
	const folders = folderLabels.map(folderLabel => {
		const root = URI.file(`/home/user/projects/${folderLabel}`);
		return { root, workingDirectory: root, name: folderLabel, description: undefined };
	});
	return {
		uri: folders[0].root,
		label,
		icon: Codicon.folder,
		folders,
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
}

function buildTestChat(resource: URI, spec: Omit<ITestChatSpec, 'id'>, createdAt: Date, updatedAt: Date | undefined): ITestChat {
	const title = observableValue('testChatTitle', spec.title);
	const status = observableValue('testChatStatus', spec.status ?? SessionStatus.Completed);
	const updatedAtObservable = observableValue<Date | undefined>('testChatUpdatedAt', updatedAt);
	const isArchived = observableValue('testChatIsArchived', spec.isArchived ?? false);
	const isRead = observableValue('testChatIsRead', spec.isRead ?? true);
	const chat: IChat = {
		resource,
		createdAt,
		workspace: constObservable(spec.workspace ? buildTestWorkspace(spec.workspace) : undefined),
		title,
		updatedAt: updatedAtObservable,
		status,
		changes: constObservable([]),
		changesets: constObservable([]),
		checkpoints: constObservable(undefined),
		modelId: constObservable(undefined),
		modelSource: constObservable(undefined),
		mode: constObservable(undefined),
		isArchived,
		isRead,
		interactivity: constObservable(spec.interactivity ?? ChatInteractivity.Full),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		capabilities: constObservable({ ...DEFAULT_CHAT_CAPABILITIES, canArchive: spec.canArchive ?? DEFAULT_CHAT_CAPABILITIES.canArchive }),
	};
	return { chat, title, status, updatedAt: updatedAtObservable, isArchived, isRead };
}

/** Builds a complete {@link ISession}, with times relative to `now`. */
export function buildTestSession(spec: ITestSessionSpec, now: number = Date.now()): ITestSession {
	const updatedAt = new Date(now - (spec.minutesAgo ?? 0) * 60_000);
	const createdAt = new Date(now - (spec.createdMinutesAgo ?? spec.minutesAgo ?? 0) * 60_000);
	const status = observableValue('testSessionStatus', spec.status ?? SessionStatus.Completed);
	const mainChatUpdatedAt = spec.mainChatHasModifiedTime === false ? undefined : new Date(now - (spec.mainChatMinutesAgo ?? spec.minutesAgo ?? 0) * 60_000);
	const mainChat = buildTestChat(getTestChatResource(spec.id, 'main'), { title: spec.title, status: spec.mainChatStatus ?? spec.status, isRead: spec.mainChatIsRead ?? spec.isRead }, createdAt, mainChatUpdatedAt);
	const chats = new Map((spec.chats ?? []).map(chat => {
		const chatUpdatedAt = chat.hasModifiedTime === false ? undefined : new Date(now - (chat.minutesAgo ?? spec.minutesAgo ?? 0) * 60_000);
		return [chat.id, buildTestChat(getTestChatResource(spec.id, chat.id), chat, createdAt, chatUpdatedAt)] as const;
	}));
	const title = observableValue('testSessionTitle', spec.title);
	const isRead = observableValue('testSessionIsRead', spec.isRead ?? true);
	const isArchived = observableValue('testSessionIsArchived', spec.isArchived ?? false);
	const session: ISession = {
		sessionId: spec.id,
		resource: getTestSessionResource(spec.id),
		providerId: 'local',
		sessionType: 'local',
		icon: Codicon.account,
		createdAt,
		workspace: constObservable(spec.workspace ? buildTestWorkspace(spec.workspace, spec.workspaceFolders) : undefined),
		isQuickChat: constObservable(spec.isQuickChat ?? false),
		isExternal: constObservable(spec.isExternal ?? false),
		title,
		updatedAt: constObservable(updatedAt),
		status,
		changesSummary: constObservable(spec.changesSummary),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived,
		isRead,
		description: constObservable(spec.description ? new MarkdownString(spec.description) : undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable([mainChat.chat, ...[...chats.values()].map(chat => chat.chat)]),
		mainChat: constObservable(mainChat.chat),
		capabilities: constObservable({
			supportsMultipleChats: spec.supportsMultipleChats ?? chats.size > 0,
			supportsRename: true,
			supportsImport: spec.isExternal === true,
		}),
	};
	return { session, mainChat, chats, title, status, isRead, isArchived };
}
