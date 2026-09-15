/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatInteractivity, ChatModelSource, IChat, ISession, ISessionArtifact, ISessionChangeset, ISessionChangesSummary, ISessionFileChange, ISessionTurnFileChange, ISessionWorkspace, SessionRemoteConnectionStatus, SessionStatus } from '../../common/session.js';

export function createWorkTestChat(resource = URI.parse('test:/session/chat')) {
	const chat = {
		resource,
		createdAt: new Date(0),
		title: observableValue('title', 'Chat'),
		updatedAt: observableValue('updatedAt', new Date(0)),
		status: observableValue('status', SessionStatus.Completed),
		changes: observableValue<readonly ISessionFileChange[]>('changes', []),
		lastTurnChanges: observableValue<readonly ISessionTurnFileChange[]>('lastTurnChanges', []),
		checkpoints: constObservable(undefined),
		modelId: observableValue<string | undefined>('modelId', undefined),
		modelSource: constObservable<ChatModelSource | undefined>(undefined),
		mode: constObservable(undefined),
		isArchived: observableValue('isArchived', false),
		isRead: observableValue('isRead', false),
		interactivity: observableValue('interactivity', ChatInteractivity.Full),
		description: observableValue<IMarkdownString | undefined>('description', undefined),
		lastTurnEnd: observableValue<Date | undefined>('lastTurnEnd', undefined),
	};
	return chat satisfies IChat;
}

export function createWorkTestSession(resource = URI.parse('test:/session')) {
	const chat = createWorkTestChat(resource.with({ path: `${resource.path}/chat` }));
	const session = {
		resource,
		sessionId: `test:${resource.toString()}`,
		providerId: 'test-provider',
		sessionType: 'test-type',
		icon: Codicon.copilot,
		createdAt: new Date(0),
		workspace: observableValue<ISessionWorkspace | undefined>('workspace', undefined),
		remoteConnectionStatus: observableValue<SessionRemoteConnectionStatus>('remoteConnectionStatus', { kind: 'connected' }),
		worktreePending: observableValue('worktreePending', false),
		isAutomation: observableValue('isAutomation', false),
		title: observableValue('title', 'Work'),
		updatedAt: observableValue('updatedAt', new Date(0)),
		status: observableValue('status', SessionStatus.Completed),
		changesSummary: observableValue<ISessionChangesSummary | undefined>('changesSummary', undefined),
		changes: observableValue<readonly ISessionFileChange[]>('changes', []),
		changesets: observableValue<readonly ISessionChangeset[] | undefined>('changesets', []),
		artifacts: observableValue<readonly ISessionArtifact[]>('artifacts', []),
		modelId: observableValue<string | undefined>('modelId', undefined),
		mode: constObservable(undefined),
		loading: observableValue('loading', false),
		isNewSessionRequestInProgress: observableValue('isNewSessionRequestInProgress', false),
		isArchived: observableValue('isArchived', false),
		isRead: observableValue('isRead', false),
		description: observableValue<IMarkdownString | undefined>('description', undefined),
		lastTurnEnd: observableValue<Date | undefined>('lastTurnEnd', undefined),
		chats: observableValue<readonly IChat[]>('chats', [chat]),
		mainChat: observableValue<IChat>('mainChat', chat),
		capabilities: constObservable({ supportsMultipleChats: true }),
	};
	return { session: session satisfies ISession, chat };
}
