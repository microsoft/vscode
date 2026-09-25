/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ByteSize } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { DEFAULT_CHAT_CAPABILITIES, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionWorktreeCleanupService } from '../../browser/sessionWorktreeCleanupService.js';

suite('SessionWorktreeCleanupService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('only includes old, completed, unpinned, inactive worktree sessions above the threshold', async () => {
		const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		const recent = new Date();
		const eligible = createSession('eligible', old);
		const activeSession = createSession('active', old);
		const active = upcastPartial<IActiveSession>({
			...activeSession,
			activeChat: activeSession.mainChat,
			isCreated: constObservable(true),
			sticky: constObservable(false),
			openChats: activeSession.chats,
			closedChats: constObservable([]),
			lastClosedChat: undefined,
			visibleChatTabs: activeSession.chats,
		});
		const pinned = createSession('pinned', old);
		const running = createSession('running', old, SessionStatus.InProgress);
		const archived = createSession('archived', old, SessionStatus.Completed, true);
		const newSession = createSession('recent', recent);
		const sessions = [eligible, active, pinned, running, archived, newSession];
		const managementService = upcastPartial<ISessionsManagementService>({
			getSessions: () => sessions,
			getSessionWorktreeDiskUsage: async session => session === eligible ? 6 * ByteSize.GB : ByteSize.GB,
			archiveSession: async () => { },
			onDidArchiveSession: Event.None,
			onDidChangeSessions: Event.None,
		});
		const sessionsService = upcastPartial<ISessionsService>({ activeSession: constObservable(active) });
		const listModelService = upcastPartial<ISessionsListModelService>({ isSessionPinned: session => session === pinned });
		const service = disposables.add(new SessionWorktreeCleanupService(
			managementService,
			sessionsService,
			listModelService,
			upcastPartial<IQuickInputService>({}),
			upcastPartial<IDialogService>({}),
			upcastPartial<IStorageService>({ getNumber: () => 0, onDidChangeValue: () => Event.None }),
			upcastPartial<ILogService>({ warn: () => { } }),
		));

		await service.refresh();

		assert.deepStrictEqual(service.summary.get(), {
			candidates: [{ session: eligible, sizeBytes: 6 * ByteSize.GB }],
			totalBytes: 6 * ByteSize.GB,
		});
	});
});

function createSession(id: string, updatedAt: Date, status = SessionStatus.Completed, archived = false): ISession {
	const resource = URI.parse(`test:/${id}`);
	const chat = upcastPartial<IChat>({
		resource,
		capabilities: constObservable(DEFAULT_CHAT_CAPABILITIES),
	});
	return upcastPartial<ISession>({
		sessionId: id,
		resource,
		providerId: 'test',
		sessionType: 'test',
		createdAt: updatedAt,
		updatedAt: constObservable(updatedAt),
		title: constObservable(id),
		status: constObservable(status),
		isArchived: constObservable(archived),
		isRead: constObservable(true),
		workspace: constObservable({
			uri: URI.file(`/repo/${id}`),
			label: id,
			icon: Codicon.folder,
			folders: [{
				root: URI.file(`/repo/${id}`),
				workingDirectory: URI.file(`/repo.worktrees/${id}`),
				name: id,
				description: undefined,
				gitRepository: {
					uri: URI.file(`/repo/${id}`),
					workTreeUri: URI.file(`/repo.worktrees/${id}`),
					baseBranchName: 'main',
					gitHubInfo: constObservable(undefined),
				},
			}],
			isVirtualWorkspace: false,
			requiresWorkspaceTrust: false,
		}),
		chats: constObservable([chat]),
		mainChat: constObservable(chat),
	});
}
