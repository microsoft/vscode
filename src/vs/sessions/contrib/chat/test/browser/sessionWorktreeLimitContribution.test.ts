/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { setARIAContainer } from '../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IConfirmation, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, IQuickPickSeparator, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { DEFAULT_CHAT_CAPABILITIES, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
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
		let nextPromptAfter = 0;
		const service = disposables.add(createService(sessions, {
			confirm: async options => {
				confirmation = options;
				return { confirmed: false };
			},
		}, true, {
			setSnoozedUntil: value => nextPromptAfter = value,
		}));

		await service.refresh();

		assert.deepStrictEqual({
			message: confirmation?.message,
			detail: confirmation?.detail,
			primaryButton: confirmation?.primaryButton,
			cancelButton: confirmation?.cancelButton,
			cooldownRecorded: nextPromptAfter > Date.now(),
		}, {
			message: 'You have 20 session worktrees',
			detail: 'Storage is limited by the number of worktrees. Archive old sessions to clean up their worktrees and make room for new sessions.',
			primaryButton: 'Review and Clean Up',
			cancelButton: 'Remind Me Later',
			cooldownRecorded: true,
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
		await belowLimit.refresh();
		belowLimit.dispose();

		const noCandidates = disposables.add(createService(
			Array.from({ length: 20 }, (_, index) => createSession(`recent-${index}`, new Date())),
			dialogService,
		));

		await noCandidates.refresh();

		assert.strictEqual(confirmationCount, 0);
	});

	test('manual cleanup works below the automatic worktree limit', async () => {
		const eligible = createSession('eligible', new Date(0));
		let confirmationCount = 0;
		const archived: string[] = [];
		let pickerShown = false;
		let measuredAfterPicker = false;
		const service = disposables.add(createService([eligible], {
			confirm: async () => {
				confirmationCount++;
				return { confirmed: true };
			},
		}, true, {
			quickInputService: createAcceptingQuickInputService(() => pickerShown = true),
			getSnoozedUntil: () => Date.now() + 24 * 60 * 60 * 1000,
			getSessionWorktreeDiskUsage: async () => {
				measuredAfterPicker = pickerShown;
				return 1024;
			},
			archiveSession: async session => {
				archived.push(session.sessionId);
				eligible.isArchived.set(true, undefined);
			},
		}));

		await service.cleanupWorktrees();

		assert.deepStrictEqual({ confirmationCount, archived, measuredAfterPicker }, {
			confirmationCount: 1,
			archived: ['eligible'],
			measuredAfterPicker: true,
		});
	});

	test('manual cleanup allows selecting a recent session', async () => {
		const recent = createSession('recent', new Date());
		const archived: string[] = [];
		const service = disposables.add(createService([recent], {
			confirm: async () => ({ confirmed: true }),
		}, true, {
			quickInputService: createAcceptingQuickInputService(undefined, true),
			archiveSession: async session => {
				archived.push(session.sessionId);
				recent.isArchived.set(true, undefined);
			},
		}));

		await service.cleanupWorktrees();

		assert.deepStrictEqual(archived, ['recent']);
	});

	test('manual cleanup explains when no worktrees are eligible', async () => {
		let title: string | undefined;
		let detail: string | undefined;
		const archived = createSession('archived', new Date(0));
		archived.isArchived.set(true, undefined);
		const service = disposables.add(createService([archived], {
			confirm: async () => ({ confirmed: false }),
			info: async (message, details) => {
				title = message;
				detail = details;
			},
		}));

		await service.cleanupWorktrees();

		assert.deepStrictEqual({ title, detail }, {
			title: 'No Session Worktrees to Clean Up',
			detail: 'Cleanup is available for completed, inactive sessions that exclusively own their worktrees.',
		});
	});

	test('does not prompt when the experiment is disabled', async () => {
		let confirmationCount = 0;
		const service = disposables.add(createService(
			Array.from({ length: 20 }, (_, index) => createSession(`old-${index}`, new Date(0))),
			{
				confirm: async () => {
					confirmationCount++;
					return { confirmed: false };
				},
			},
			false,
		));

		await service.refresh();

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

	test('does not offer the active session or a session with a shared worktree', async () => {
		const active = createSession('active', new Date(0));
		const shared = createSession('shared', new Date(0), 'shared-worktree');
		const sessions = [
			active,
			shared,
			createSession('recent-shared-owner', new Date(), 'shared-worktree'),
			...Array.from({ length: 18 }, (_, index) => createSession(`recent-${index}`, new Date())),
		];
		let confirmationCount = 0;
		const service = disposables.add(createService(sessions, {
			confirm: async () => {
				confirmationCount++;
				return { confirmed: false };
			},
		}, true, {
			activeSession: upcastPartial<IActiveSession>({ ...active, activeChat: active.mainChat }),
		}));

		await service.refresh();

		assert.strictEqual(confirmationCount, 0);
	});

	test('accepting the picker archives the selected session', async () => {
		const eligible = createSession('eligible', new Date(0));
		const sessions = [
			eligible,
			...Array.from({ length: 19 }, (_, index) => createSession(`recent-${index}`, new Date())),
		];
		let confirmationCount = 0;
		const archived: string[] = [];
		let pickerSnapshot: { readonly selected: readonly string[]; readonly details: readonly (string | undefined)[] } | undefined;
		const service = disposables.add(createService(sessions, {
			confirm: async () => {
				confirmationCount++;
				return { confirmed: true };
			},
		}, true, {
			quickInputService: createAcceptingQuickInputService((items, selectedItems) => {
				pickerSnapshot = {
					selected: selectedItems.map(item => item.label),
					details: items.filter(item => item.type !== 'separator').map(item => item.detail),
				};
			}),
			isSessionPinned: session => session.sessionId === 'recent-0',
			archiveSession: async session => {
				archived.push(session.sessionId);
				eligible.isArchived.set(true, undefined);
			},
		}));

		await service.refresh();

		assert.deepStrictEqual({ confirmationCount, archived, pickerSnapshot }, {
			confirmationCount: 2,
			archived: ['eligible'],
			pickerSnapshot: {
				selected: ['eligible'],
				details: [
					`Last updated ${eligible.updatedAt.get().toLocaleDateString()}`,
					`Pinned — last updated ${sessions[1].updatedAt.get().toLocaleDateString()}`,
					...Array.from({ length: 18 }, (_, index) => `Recently updated ${sessions[index + 2].updatedAt.get().toLocaleDateString()}`),
				],
			},
		});
	});

	test('reports estimated reclaimable storage in dialogs and picker', async () => {
		const eligible = createSession('eligible', new Date(0));
		const sessions = [
			eligible,
			...Array.from({ length: 19 }, (_, index) => createSession(`recent-${index}`, new Date())),
		];
		const details: (string | undefined)[] = [];
		let pickerDescription: string | undefined;
		const service = disposables.add(createService(sessions, {
			confirm: async options => {
				details.push(typeof options.detail === 'string' ? options.detail : options.detail?.value);
				return { confirmed: true };
			},
		}, true, {
			quickInputService: createAcceptingQuickInputService(items => pickerDescription = items.find(item => item.type !== 'separator')?.description),
			getSessionWorktreeDiskUsage: async () => 1.5 * 1024 * 1024 * 1024,
			archiveSession: async () => eligible.isArchived.set(true, undefined),
		}));

		await service.refresh();

		assert.deepStrictEqual({
			details,
			pickerDescription,
		}, {
			details: [
				'Storage is limited by the number of worktrees. Archiving this old session can reclaim about 1.50GB and make room for new sessions.',
				'This can reclaim about 1.50GB. You can restore archived sessions later.',
			],
			pickerDescription: '1.50GB',
		});
	});

	test('reports sessions that did not transition to archived', async () => {
		const ariaHost = document.createElement('div');
		document.body.appendChild(ariaHost);
		disposables.add(toDisposable(() => ariaHost.remove()));
		setARIAContainer(ariaHost);
		const eligible = createSession('eligible', new Date(0));
		const sessions = [
			eligible,
			...Array.from({ length: 19 }, (_, index) => createSession(`recent-${index}`, new Date())),
		];
		const errors: string[] = [];
		const service = disposables.add(createService(sessions, {
			confirm: async () => ({ confirmed: true }),
		}, true, {
			quickInputService: createAcceptingQuickInputService(),
			archiveSession: async () => { },
			logError: message => errors.push(message),
		}));

		await service.refresh();

		assert.deepStrictEqual({
			alert: [...ariaHost.querySelectorAll('.monaco-alert')].map(element => element.textContent).find(Boolean),
			errors,
		}, {
			alert: 'No sessions were archived. Check the logs and try again.',
			errors: ['[SessionWorktreeLimitContribution] Provider did not archive session eligible'],
		});
	});

	test('can prompt again at the same count after the startup cooldown expires', async () => {
		let snoozedUntil = 0;
		let confirmationCount = 0;
		const sessions = [
			createSession('eligible', new Date(0)),
			...Array.from({ length: 19 }, (_, index) => createSession(`recent-${index}`, new Date())),
		];
		const service = disposables.add(createService(sessions, {
			confirm: async () => {
				confirmationCount++;
				return { confirmed: false };
			},
		}, true, {
			getSnoozedUntil: () => snoozedUntil,
			setSnoozedUntil: value => snoozedUntil = value,
		}));

		await service.refresh();
		snoozedUntil = 0;
		await service.refresh();

		assert.strictEqual(confirmationCount, 2);
	});
});

interface IServiceOptions {
	readonly activeSession?: IActiveSession;
	readonly quickInputService?: IQuickInputService;
	readonly archiveSession?: (session: ISession) => Promise<void>;
	readonly getSessionWorktreeDiskUsage?: (session: ISession) => Promise<number | undefined>;
	readonly isSessionPinned?: (session: ISession) => boolean;
	readonly logError?: (message: string) => void;
	readonly getSnoozedUntil?: () => number;
	readonly setSnoozedUntil?: (value: number) => void;
}

function createService(sessions: readonly ISession[], dialogService: Pick<IDialogService, 'confirm'> & Partial<Pick<IDialogService, 'info'>>, enabled = true, options: IServiceOptions = {}): SessionWorktreeLimitContribution {
	return new SessionWorktreeLimitContribution(
		upcastPartial<ISessionsManagementService>({
			getSessions: () => [...sessions],
			onDidChangeSessions: Event.None,
			archiveSession: options.archiveSession ?? (async () => { }),
			getSessionWorktreeDiskUsage: options.getSessionWorktreeDiskUsage,
		}),
		upcastPartial<ISessionsService>({ activeSession: constObservable(options.activeSession) }),
		upcastPartial<ISessionsListModelService>({ isSessionPinned: options.isSessionPinned ?? (() => false) }),
		options.quickInputService ?? upcastPartial<IQuickInputService>({}),
		upcastPartial<IDialogService>(dialogService),
		upcastPartial<IConfigurationService>({
			getValue: () => enabled,
			onDidChangeConfiguration: Event.None,
		}),
		upcastPartial<IStorageService>({
			getNumber: () => options.getSnoozedUntil?.() ?? 0,
			store: (_key, value) => options.setSnoozedUntil?.(Number(value)),
			onDidChangeValue: () => Event.None,
		}),
		upcastPartial<ILogService>({ error: message => options.logError?.(typeof message === 'string' ? message : message.message) }),
	);
}

function createAcceptingQuickInputService(onShow?: (items: readonly (IQuickPickItem | IQuickPickSeparator)[], selectedItems: readonly IQuickPickItem[]) => void, selectAll = false): IQuickInputService {
	const createQuickPick = (<T extends IQuickPickItem>() => {
		const onDidAccept = new Emitter<IQuickPickDidAcceptEvent>();
		const onDidHide = new Emitter<IQuickInputHideEvent>();
		const picker = upcastPartial<IQuickPick<T>>({
			items: [],
			selectedItems: [],
			onDidAccept: onDidAccept.event,
			onDidHide: onDidHide.event,
			show: () => {
				if (selectAll) {
					picker.selectedItems = picker.items.filter(item => (item as IQuickPickItem | IQuickPickSeparator).type !== 'separator');
				}
				onShow?.(picker.items, picker.selectedItems);
				onDidAccept.fire({ inBackground: false });
			},
			hide: () => onDidHide.fire({ reason: QuickInputHideReason.Other }),
			dispose: () => {
				onDidAccept.dispose();
				onDidHide.dispose();
			},
		});
		return picker;
	}) as IQuickInputService['createQuickPick'];
	return upcastPartial<IQuickInputService>({
		createQuickPick,
	});
}

interface IMutableTestSession extends ISession {
	readonly isArchived: ISettableObservable<boolean>;
}

function createSession(id: string, updatedAt: Date, worktreeId = id): IMutableTestSession {
	const resource = URI.parse(`test:/${id}`);
	const chat = upcastPartial<IChat>({
		resource,
		capabilities: constObservable(DEFAULT_CHAT_CAPABILITIES),
	});
	return upcastPartial<IMutableTestSession>({
		sessionId: id,
		resource,
		providerId: 'test',
		sessionType: 'test',
		createdAt: updatedAt,
		updatedAt: constObservable(updatedAt),
		title: constObservable(id),
		status: constObservable(SessionStatus.Completed),
		isArchived: observableValue(id, false),
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
