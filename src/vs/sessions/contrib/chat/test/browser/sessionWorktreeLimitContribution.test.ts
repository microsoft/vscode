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
import { IConfirmation, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { DEFAULT_CHAT_CAPABILITIES, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionWorktreeLimitContribution } from '../../browser/sessionWorktreeLimitContribution.js';

suite('SessionWorktreeLimitContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('prompts at the worktree count limit when an old session can be cleaned up', async () => {
		const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		const sessions = [
			createSession('eligible', old),
			...Array.from({ length: 19 }, (_, index) => createSession(`recent-${index}`, new Date())),
		];
		let confirmation: IConfirmation | undefined;
		const service = disposables.add(createService(sessions, {
			confirm: async options => {
				confirmation = options;
				return { confirmed: false };
			},
		}));

		await service.refresh();

		assert.deepStrictEqual({
			message: confirmation?.message,
			detail: confirmation?.detail,
			primaryButton: confirmation?.primaryButton,
			cancelButton: confirmation?.cancelButton,
		}, {
			message: 'You have 20 session worktrees',
			detail: 'Storage is limited by the number of worktrees. Archive old sessions to clean up their worktrees and make room for new sessions.',
			primaryButton: 'Review and Clean Up',
			cancelButton: 'Remind Me Later',
		});
	});

	test('does not prompt below the limit or without an eligible cleanup candidate', async () => {
		let confirmationCount = 0;
		const dialogService = {
			confirm: async () => {
				confirmationCount++;
				return { confirmed: false };
			},
		};
		const belowLimit = disposables.add(createService(
			Array.from({ length: 19 }, (_, index) => createSession(`old-${index}`, new Date(0))),
			dialogService,
		));
		const noCandidates = disposables.add(createService(
			Array.from({ length: 20 }, (_, index) => createSession(`recent-${index}`, new Date())),
			dialogService,
		));

		await belowLimit.refresh();
		await noCandidates.refresh();

		assert.strictEqual(confirmationCount, 0);
	});

	test('counts a shared worktree only once', async () => {
		let confirmationCount = 0;
		const sessions = Array.from({ length: 20 }, (_, index) =>
			createSession(`old-${index}`, new Date(0), index === 19 ? 'old-18' : undefined));
		const service = disposables.add(createService(sessions, {
			confirm: async () => {
				confirmationCount++;
				return { confirmed: false };
			},
		}));

		await service.refresh();

		assert.strictEqual(confirmationCount, 0);
	});
});

function createService(sessions: readonly ISession[], dialogService: Pick<IDialogService, 'confirm'>): SessionWorktreeLimitContribution {
	return new SessionWorktreeLimitContribution(
		upcastPartial<ISessionsManagementService>({
			getSessions: () => sessions,
			onDidChangeSessions: Event.None,
			archiveSession: async () => { },
		}),
		upcastPartial<ISessionsService>({ activeSession: constObservable(undefined) }),
		upcastPartial<ISessionsListModelService>({ isSessionPinned: () => false }),
		upcastPartial<IQuickInputService>({}),
		upcastPartial<IDialogService>(dialogService),
		upcastPartial<IStorageService>({
			getNumber: () => 0,
			store: () => { },
		}),
		upcastPartial<ILogService>({ error: () => { } }),
	);
}

function createSession(id: string, updatedAt: Date, worktreeId = id): ISession {
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
		status: constObservable(SessionStatus.Completed),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		workspace: constObservable({
			uri: URI.file(`/repo/${id}`),
			label: id,
			icon: Codicon.folder,
			folders: [{
				root: URI.file(`/repo/${id}`),
				workingDirectory: URI.file(`/repo.worktrees/${worktreeId}`),
				name: id,
				description: undefined,
				gitRepository: {
					uri: URI.file(`/repo/${id}`),
					workTreeUri: URI.file(`/repo.worktrees/${worktreeId}`),
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
