/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatInteractivity, IChat, ISession, ISessionChangesSummary, ISessionFolder, ISessionWorkspace, SessionStatus } from '../../common/session.js';

/** A peer chat of a {@link ITestSessionSpec}. */
export interface ITestChatSpec {
	/** Unique within its session. */
	readonly id: string;
	readonly title: string;
	readonly status?: SessionStatus;
	readonly interactivity?: ChatInteractivity;
}

/** Plain data describing a session for tests and component fixtures. */
export interface ITestSessionSpec {
	/** The session id, from which the session and chat resources derive. */
	readonly id: string;
	readonly title: string;
	/** Workspace label. Omit for a session without a workspace. */
	readonly workspace?: string;
	readonly isQuickChat?: boolean;
	readonly status?: SessionStatus;
	/** Status of the main chat when it differs from the session status. */
	readonly mainChatStatus?: SessionStatus;
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

export function buildTestWorkspace(label: string): ISessionWorkspace {
	const root = URI.file(`/home/user/projects/${label}`);
	const folder: ISessionFolder = { root, workingDirectory: root, name: label, description: undefined };
	return {
		uri: root,
		label,
		icon: Codicon.folder,
		folders: [folder],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
}

function buildTestChat(resource: URI, title: string, status: SessionStatus, interactivity: ChatInteractivity, createdAt: Date, updatedAt: Date): ITestChat {
	const titleValue = observableValue('testChatTitle', title);
	const statusValue = observableValue('testChatStatus', status);
	const chat: IChat = {
		resource,
		createdAt,
		workspace: constObservable(undefined),
		title: titleValue,
		updatedAt: constObservable(updatedAt),
		status: statusValue,
		changes: constObservable([]),
		changesets: constObservable([]),
		checkpoints: constObservable(undefined),
		modelId: constObservable(undefined),
		modelSource: constObservable(undefined),
		mode: constObservable(undefined),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		interactivity: constObservable(interactivity),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		capabilities: constObservable({ canRename: true, canArchive: false, canDelete: true }),
	};
	return { chat, title: titleValue, status: statusValue };
}

/** Builds a complete {@link ISession}, with times relative to `now`. */
export function buildTestSession(spec: ITestSessionSpec, now: number = Date.now()): ITestSession {
	const updatedAt = new Date(now - (spec.minutesAgo ?? 0) * 60_000);
	const createdAt = new Date(now - (spec.createdMinutesAgo ?? spec.minutesAgo ?? 0) * 60_000);
	const status = observableValue('testSessionStatus', spec.status ?? SessionStatus.Completed);
	const mainChat = buildTestChat(getTestChatResource(spec.id, 'main'), spec.title, spec.mainChatStatus ?? spec.status ?? SessionStatus.Completed, ChatInteractivity.Full, createdAt, updatedAt);
	const chats = new Map((spec.chats ?? []).map(chat => [chat.id, buildTestChat(getTestChatResource(spec.id, chat.id), chat.title, chat.status ?? SessionStatus.Completed, chat.interactivity ?? ChatInteractivity.Full, createdAt, updatedAt)] as const));
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
		workspace: constObservable(spec.workspace ? buildTestWorkspace(spec.workspace) : undefined),
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
