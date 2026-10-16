/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { TestAccessibilityService } from '../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { LocalModelEnabledSettingId, type ILocalModelActiveV1, type ILocalModelFamilyV1, type ILocalModelLoadV1, type ILocalModelOperationV1, type ILocalModelStatusV1 } from '../../../../../../platform/agentHost/common/localModel.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { LocalModelService } from '../../../../../services/agentHost/browser/localModelService.js';
import { ILocalModelInteractionHandler } from '../../../../../services/agentHost/common/localModelService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { LOCAL_MODEL_SHOW_DETAILS_COMMAND_ID } from '../../../browser/agentSessions/agentHost/localModelSetupFlow.js';
import { LOCAL_MODEL_STATUS_NOTICE_ID, LocalModelSetupProgress } from '../../../browser/agentSessions/agentHost/localModelSetupProgress.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { createChatInputNotificationService, createStatus, describeNotice, installedFamily, offeredFamily, otherFamily, RecordingChatInputNotificationService, RecordingCommandService, runNoticeAction, TestLocalModelConnection } from './localModelTestUtils.js';

const GiB = 1024 ** 3;

function withOperation(operation: Partial<ILocalModelOperationV1> & Pick<ILocalModelOperationV1, 'state'>, family: ILocalModelFamilyV1 = offeredFamily): ILocalModelFamilyV1 {
	return { ...family, operation: { id: 'op-1', kind: 'setup', resumeOnStartup: true, ...operation } };
}

const readyActive: ILocalModelActiveV1 = { familyId: installedFamily.familyId, contentId: 'c1', servingGeneration: 1, server: 'ready', autoEligible: true };

class ScreenReaderAccessibilityService extends TestAccessibilityService {
	override isScreenReaderOptimized(): boolean {
		return true;
	}
}

/** Records the links it opens. */
class RecordingOpenerService extends mock<IOpenerService>() {
	readonly opened: string[] = [];
	override async open(target: URI | string): Promise<boolean> {
		this.opened.push(target.toString());
		return true;
	}
}

suite('LocalModelSetupProgress', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function setup(initial: ILocalModelStatusV1 | undefined, options: { readonly confirmStopNow?: boolean[]; readonly screenReader?: boolean; readonly chatInputNotifications?: IChatInputNotificationService } = {}) {
		const connection = new TestLocalModelConnection();
		disposables.add({ dispose: () => connection.dispose() });
		connection.setStatus(initial);
		const service = disposables.add(new LocalModelService(connection, new TestConfigurationService(), new NullLogService()));
		const confirmStopNow = [...options.confirmStopNow ?? []];
		disposables.add(service.registerInteractionHandler(upcastPartial<ILocalModelInteractionHandler>({ confirmStopNow: async () => confirmStopNow.shift() ?? false })));
		const notices = new RecordingChatInputNotificationService();
		const commands = new RecordingCommandService();
		const opener = new RecordingOpenerService();
		const contextKeyService = new MockContextKeyService();
		contextKeyService.createKey(ChatContextKeys.enabled.key, true);
		const lifecycle = new class extends mock<ILifecycleService>() { override readonly willShutdown = false; };
		const create = () => disposables.add(new LocalModelSetupProgress(
			connection,
			service,
			options.chatInputNotifications ?? notices,
			commands,
			options.screenReader ? new ScreenReaderAccessibilityService() : new TestAccessibilityService(),
			lifecycle,
			new TestConfigurationService({ [LocalModelEnabledSettingId]: true }),
			contextKeyService,
			opener,
		));
		const controller = create();
		const visible = () => notices.visible(LOCAL_MODEL_STATUS_NOTICE_ID);
		/** The visible notice, prefixed with its priority. */
		const show = () => {
			const notice = visible();
			return notice && `${notice.group?.priority} ${describeNotice(notice)}`;
		};
		return { connection, notices, commands, opener, controller, create, visible, show };
	}

	test('one running notice per operation, titled by phase, with download progress, gone when the operation completes', () => {
		const { connection, notices, visible } = setup(createStatus([withOperation({ state: 'running', phase: 'resolving' })]));
		const first = visible()!;
		connection.setStatus(createStatus([withOperation({ state: 'running', phase: 'checkingDevice' })]));
		connection.setStatus(createStatus([withOperation({ state: 'running', phase: 'downloading', completedBytes: 10 * GiB, totalBytes: 50 * GiB, bytesPerSecond: 64 * 1024 * 1024 })]));
		connection.setStatus(createStatus([withOperation({ state: 'running', phase: 'downloading', completedBytes: 20 * GiB, totalBytes: 50 * GiB, bytesPerSecond: 64 * 1024 * 1024 })]));
		connection.setStatus(createStatus([withOperation({ state: 'running', phase: 'verifying', completedBytes: 50 * GiB, totalBytes: 50 * GiB })]));
		connection.setStatus(createStatus([withOperation({ state: 'running', phase: 'loading' }, installedFamily)], { active: { ...readyActive, server: 'starting' } }));
		connection.setStatus(createStatus([installedFamily], { active: readyActive }));

		assert.deepStrictEqual({
			scope: { id: first.id, sessionTypes: first.sessionTypes, group: first.group, dismissible: first.dismissible, autoDismissOnMessage: first.autoDismissOnMessage, keepOpen: first.actions.map(action => action.keepOpen) },
			published: notices.published.map(describeNotice),
			announcementKeys: [...new Set(notices.published.map(notice => notice.announcementKey))],
			visible: visible(),
		}, {
			scope: { id: 'localModel.status', sessionTypes: ['agent-host-copilotcli'], group: { id: 'localModel', priority: 2 }, dismissible: true, autoDismissOnMessage: false, keepOpen: [true] },
			published: [
				'Info: Setting up Example Flash 1.0… (indeterminate) [Pause]',
				'Info: Setting up Example Flash 1.0: Checking this device… (indeterminate) [Pause]',
				'Info: Downloading Example Flash 1.0: 10.0 GB of 50.0 GB, about 11 min remaining (20%) [Pause]',
				// The bar moves with the bytes; the text waits for the throttle.
				'Info: Downloading Example Flash 1.0: 10.0 GB of 50.0 GB, about 11 min remaining (40%) [Pause]',
				'Info: Setting up Example Flash 1.0: Verifying… (indeterminate) [Pause]',
				'Info: Loading Example Flash 1.0… (indeterminate) [Pause]',
			],
			announcementKeys: ['running:op-1:resolving', 'running:op-1:checkingDevice', 'running:op-1:downloading', 'running:op-1:verifying', 'running:op-1:loading'],
			visible: undefined,
		});
	});

	test('progress updates keep their place behind a newer notice of the same severity; a new state comes forward', () => {
		const chatInputNotifications = disposables.add(createChatInputNotificationService());
		const download = (percent: number) => createStatus([withOperation({ state: 'running', phase: 'downloading', completedBytes: percent, totalBytes: 100 })]);
		const { connection } = setup(download(1), { chatInputNotifications });
		chatInputNotifications.setNotification({ id: 'quota', severity: ChatInputNotificationSeverity.Info, message: 'Credit Limit Reached', description: undefined, actions: [], dismissible: true, autoDismissOnMessage: false });
		const active = () => chatInputNotifications.getActiveNotification()?.id;
		const shown = [active()];
		connection.setStatus(download(2));
		shown.push(active());
		connection.setStatus(createStatus([withOperation({ state: 'running', phase: 'verifying' })]));
		shown.push(active());
		// Another operation is a new state.
		connection.setStatus(createStatus([offeredFamily, withOperation({ id: 'swap-1', kind: 'swap', state: 'running', phase: 'loading' }, otherFamily)]));
		shown.push(active());
		assert.deepStrictEqual(shown, ['quota', 'quota', 'quota', LOCAL_MODEL_STATUS_NOTICE_ID]);
	});

	test('download text changes every 5 seconds, or every minute with a screen reader; screen readers only hear a new phase', () => runWithFakedTimers({}, async () => {
		const download = (completedGiB: number) => createStatus([withOperation({ state: 'running', phase: 'downloading', completedBytes: completedGiB * GiB, totalBytes: 50 * GiB })]);
		const run = async (screenReader: boolean) => {
			const { connection, notices, visible } = setup(download(1), { screenReader });
			const texts = [visible()?.message];
			connection.setStatus(download(2));
			texts.push(visible()?.message);
			await timeout(5_000);
			connection.setStatus(download(3));
			texts.push(visible()?.message);
			await timeout(60_000);
			connection.setStatus(download(4));
			texts.push(visible()?.message);
			connection.setStatus(createStatus([withOperation({ state: 'running', phase: 'verifying' })]));
			return { texts, percents: notices.published.map(notice => notice.progress?.percent), announcementKeys: [...new Set(notices.published.map(notice => notice.announcementKey))] };
		};
		const downloaded = (gb: number) => `Downloading Example Flash 1.0: ${gb}.0 GB of 50.0 GB`;
		const announcementKeys = ['running:op-1:downloading', 'running:op-1:verifying'];
		assert.deepStrictEqual({ default: await run(false), screenReader: await run(true) }, {
			default: { texts: [downloaded(1), downloaded(1), downloaded(3), downloaded(4)], percents: [2, 4, 6, 8, undefined], announcementKeys },
			screenReader: { texts: [downloaded(1), downloaded(1), downloaded(1), downloaded(4)], percents: [2, 4, 6, 8, undefined], announcementKeys },
		});
	}));

	test('Pause, Resume, Cancel and Stop Now act on the operation; the notice says so at once and then follows its state', async () => {
		const { connection, commands, visible } = setup(createStatus([withOperation({ state: 'running', phase: 'downloading', completedBytes: 1, totalBytes: 100 })]));
		runNoticeAction(visible(), 'Pause', commands);
		const afterPause = describeNotice(visible());
		connection.setStatus(createStatus([withOperation({ state: 'paused', pausedReason: 'user', phase: 'downloading' })]));
		const paused = describeNotice(visible());
		runNoticeAction(visible(), 'Resume', commands);
		connection.setStatus(createStatus([withOperation({ state: 'running', phase: 'downloading', completedBytes: 2, totalBytes: 100 })]));
		const resumed = describeNotice(visible());

		// A window that only finds the pause, say after a reload, doesn't bring it up again.
		const reloaded = setup(createStatus([withOperation({ state: 'paused', pausedReason: 'user', phase: 'downloading' })]));

		const swap = setup(createStatus([withOperation({ id: 'swap-1', kind: 'swap', state: 'running', phase: 'loading' }, installedFamily)]));
		const swapNotice = describeNotice(swap.visible());
		runNoticeAction(swap.visible(), 'Cancel', swap.commands);
		const afterCancel = describeNotice(swap.visible());

		const drain = setup(
			createStatus([withOperation({ state: 'running', kind: 'swap', phase: 'draining' }, installedFamily)], { active: { ...readyActive, familyId: 'other', drain: { runningStreams: 2 } } }),
			{ confirmStopNow: [false, true] },
		);
		const waiting = describeNotice(drain.visible());
		await runNoticeAction(drain.visible(), 'Stop Now', drain.commands);
		const afterDecline = describeNotice(drain.visible());
		await runNoticeAction(drain.visible(), 'Stop Now', drain.commands);
		const afterStopNow = describeNotice(drain.visible());

		// Cancel while it waits takes the change back: the active model stays loaded.
		const takeBack = setup(createStatus([withOperation({ state: 'running', kind: 'swap', phase: 'draining' }, installedFamily), otherFamily], { active: { ...readyActive, familyId: otherFamily.familyId, server: 'stopping', swapTo: installedFamily.familyId, drain: { runningStreams: 2 } } }));
		runNoticeAction(takeBack.visible(), 'Cancel', takeBack.commands);
		const afterTakeBack = describeNotice(takeBack.visible());
		takeBack.connection.setStatus(createStatus([installedFamily, otherFamily], { active: { ...readyActive, familyId: otherFamily.familyId } }));

		assert.deepStrictEqual({
			afterPause,
			paused,
			resumed,
			requests: connection.requests,
			commands: commands.executed,
			reloaded: reloaded.visible(),
			swap: { notice: swapNotice, afterCancel, requests: swap.connection.requests },
			drain: { waiting, afterDecline, afterStopNow, requests: drain.connection.requests },
			takeBack: { afterCancel: afterTakeBack, afterKept: takeBack.visible(), requests: takeBack.connection.requests },
		}, {
			afterPause: 'Info: Pausing Example Flash 1.0… (1%) [(Pausing…)]',
			paused: 'Warning: Setting up Example Flash 1.0 is paused. [Resume*]',
			resumed: 'Info: Downloading Example Flash 1.0: 1 KB of 1 KB (2%) [Pause]',
			requests: [{ action: 'pause', operationId: 'op-1' }, { action: 'resume', operationId: 'op-1' }],
			commands: [],
			reloaded: undefined,
			swap: {
				notice: 'Info: Loading Example Flash 1.0… (indeterminate) [Cancel]',
				afterCancel: 'Info: Cancelling loading Example Flash 1.0… (indeterminate) [(Cancelling…)]',
				requests: [{ action: 'cancel', operationId: 'swap-1' }],
			},
			drain: {
				waiting: 'Info: Waiting for 2 responses to finish before loading Example Flash 1.0… (indeterminate) [Stop Now, Cancel]',
				afterDecline: 'Info: Waiting for 2 responses to finish before loading Example Flash 1.0… (indeterminate) [Stop Now, Cancel]',
				afterStopNow: 'Info: Stopping the running responses… (indeterminate) [(Stopping…)]',
				requests: [{ action: 'stopNow' }],
			},
			takeBack: {
				afterCancel: 'Info: Cancelling loading Example Flash 1.0… (indeterminate) [(Cancelling…)]',
				afterKept: undefined,
				requests: [{ action: 'cancel', operationId: 'op-1' }],
			},
		});
	});

	test('Pause, Cancel and Stop Now show as secondary buttons (Stop Now as text beside a model change\'s Cancel), also once sent, with no Details; the notice shows the in-progress indicator only while an operation runs', () => {
		const describe = (window: ReturnType<typeof setup>) => {
			const notice = window.visible();
			return notice && { busy: notice.busy === true, actions: notice.actions.map(action => [action.label, action.primary ? 'primary' : action.filled ? 'button' : 'text', ...action.disabled ? ['disabled'] : []].join(' ')) };
		};
		const download = setup(createStatus([withOperation({ state: 'running', phase: 'downloading', completedBytes: 1, totalBytes: 100 })]));
		const downloading = describe(download);
		runNoticeAction(download.visible(), 'Pause', download.commands);
		const failed = { code: 'downloadFailed', message: 'The download failed.', actions: ['retry'] } as const;
		assert.deepStrictEqual({
			downloading,
			pausing: describe(download),
			swap: describe(setup(createStatus([withOperation({ id: 'swap-1', kind: 'swap', state: 'running', phase: 'loading' }, installedFamily)]))),
			drain: describe(setup(createStatus([withOperation({ state: 'running', kind: 'swap', phase: 'draining' }, installedFamily)], { active: { ...readyActive, familyId: 'other', drain: { runningStreams: 2 } } }))),
			updateDrain: describe(setup(createStatus([withOperation({ state: 'running', kind: 'update', phase: 'draining' }, installedFamily)], { active: { ...readyActive, drain: { runningStreams: 2 } } }))),
			hostLoad: describe(setup(createStatus([installedFamily], { active: { ...readyActive, server: 'starting', load: { step: 'loading', startedAt: Date.now() } } }))),
			paused: describe(setup(createStatus([withOperation({ state: 'paused', pausedReason: 'network', phase: 'downloading' })]))),
			error: describe(setup(createStatus([withOperation({ state: 'error', phase: 'downloading', error: failed })]))),
		}, {
			downloading: { busy: true, actions: ['Pause button'] },
			pausing: { busy: true, actions: ['Pausing… button disabled'] },
			swap: { busy: true, actions: ['Cancel button'] },
			// Stop Now ends the responses; Cancel keeps the active model.
			drain: { busy: true, actions: ['Stop Now text', 'Cancel button'] },
			updateDrain: { busy: true, actions: ['Stop Now button'] },
			hostLoad: { busy: true, actions: ['Cancel button'] },
			paused: { busy: false, actions: ['Resume primary'] },
			error: { busy: false, actions: ['Retry primary'] },
		});
	});

	test('a context size change reloads the model: the notice says Reloading, not Loading; a swap to another model and a first load keep Loading', () => {
		const reloadOperation = { id: 'reload-1', kind: 'swap', state: 'running' } as const;
		const reloading = (phase: 'draining' | 'loading', active: Partial<ILocalModelActiveV1>) => createStatus([withOperation({ ...reloadOperation, phase }, installedFamily)], { active: { ...readyActive, swapTo: installedFamily.familyId, ...active } });
		const { connection, visible, commands } = setup(reloading('draining', { drain: { runningStreams: 2 } }));
		const shown = [describeNotice(visible())];
		// No response running: the old server is still releasing its memory.
		connection.setStatus(reloading('loading', { server: 'stopping' }));
		shown.push(describeNotice(visible()));
		connection.setStatus(reloading('loading', { server: 'starting', load: { step: 'loading', startedAt: Date.now() } }));
		shown.push(describeNotice(visible()));
		runNoticeAction(visible(), 'Cancel', commands);
		shown.push(describeNotice(visible()));

		// A swap to another model: the outgoing model is still the active one while it unloads.
		const swap = setup(createStatus([withOperation({ id: 'swap-1', kind: 'swap', state: 'running', phase: 'loading' }, installedFamily)], { active: { ...readyActive, familyId: 'other', server: 'stopping', swapTo: installedFamily.familyId } }));
		assert.deepStrictEqual({ shown, swap: describeNotice(swap.visible()) }, {
			shown: [
				'Info: Waiting for 2 responses to finish before reloading Example Flash 1.0… (indeterminate) [Stop Now, Cancel]',
				'Info: Reloading Example Flash 1.0… (indeterminate) [Cancel]',
				'Info: Reloading Example Flash 1.0… (indeterminate) [Cancel]',
				'Info: Cancelling reloading Example Flash 1.0… (indeterminate) [(Cancelling…)]',
			],
			swap: 'Info: Loading Example Flash 1.0… (indeterminate) [Cancel]',
		});
	});

	test('a drain with no response running never says "Waiting for 0 responses": it reads as the load (or reload) it is part of', () => {
		const draining = (operation: Partial<ILocalModelOperationV1>, active: Partial<ILocalModelActiveV1>) => describeNotice(setup(createStatus(
			[withOperation({ id: 'op-1', state: 'running', phase: 'draining', ...operation }, installedFamily)],
			{ active: { ...readyActive, ...active } },
		)).visible());
		assert.deepStrictEqual({
			swapNoneRunning: draining({ kind: 'swap' }, { familyId: 'other', swapTo: installedFamily.familyId, drain: { runningStreams: 0 } }),
			reloadNoneRunning: draining({ kind: 'swap' }, { swapTo: installedFamily.familyId, drain: { runningStreams: 0 } }),
			reloadNoDrain: draining({ kind: 'swap' }, { swapTo: installedFamily.familyId }),
			updateNoneRunning: draining({ kind: 'update' }, { drain: { runningStreams: 0 } }),
			oneRunning: draining({ kind: 'swap' }, { familyId: 'other', swapTo: installedFamily.familyId, drain: { runningStreams: 1 } }),
		}, {
			swapNoneRunning: 'Info: Loading Example Flash 1.0… (indeterminate) [Cancel]',
			reloadNoneRunning: 'Info: Reloading Example Flash 1.0… (indeterminate) [Cancel]',
			reloadNoDrain: 'Info: Reloading Example Flash 1.0… (indeterminate) [Cancel]',
			updateNoneRunning: 'Info: Updating Example Flash 1.0… (indeterminate) [Pause]',
			oneRunning: 'Info: Waiting for 1 response to finish before loading Example Flash 1.0… (indeterminate) [Stop Now, Cancel]',
		});
	});

	test('a load shows its step; with an estimate its bar moves once a second and the time remaining with the text; screen readers hear a new step only', () => runWithFakedTimers({}, async () => {
		const loading = (load: ILocalModelLoadV1, operation?: Partial<ILocalModelOperationV1>) => createStatus(
			[operation ? withOperation({ state: 'running', ...operation }, installedFamily) : installedFamily],
			{ active: { ...readyActive, server: 'starting', load } },
		);
		const ready = createStatus([installedFamily], { active: readyActive });

		// A load the host started for a request, estimated from the last one.
		const estimated = setup(loading({ step: 'loading', startedAt: 0, expectedMs: 20_000 }));
		const shown = [describeNotice(estimated.visible())];
		await timeout(1_500);
		shown.push(describeNotice(estimated.visible()));
		await timeout(5_000);
		shown.push(describeNotice(estimated.visible()));
		estimated.connection.setStatus(loading({ step: 'warmingUp', startedAt: 0, expectedMs: 20_000 }));
		shown.push(describeNotice(estimated.visible()));
		// Taking longer than the last time: the bar stops short of the end.
		await timeout(30_000);
		shown.push(describeNotice(estimated.visible()));
		estimated.connection.setStatus(ready);
		shown.push(describeNotice(estimated.visible()));
		const announcementKeys = [...new Set(estimated.notices.published.map(notice => notice.announcementKey))];

		// A first load has no estimate: an indeterminate bar that doesn't tick. Cancel stops it.
		const first = setup(loading({ step: 'loading', startedAt: Date.now() }));
		const firstNotice = describeNotice(first.visible());
		const published = first.notices.published.length;
		await timeout(3_000);
		const ticked = first.notices.published.length - published;
		runNoticeAction(first.visible(), 'Cancel', first.commands);
		const firstCancelled = describeNotice(first.visible());
		first.connection.setStatus(ready);

		// A swap's load is its operation's, which can be cancelled.
		const swap = setup(loading({ step: 'loading', startedAt: Date.now(), expectedMs: 10_000 }, { id: 'swap-1', kind: 'swap', phase: 'loading' }));
		const swapNotice = describeNotice(swap.visible());
		runNoticeAction(swap.visible(), 'Cancel', swap.commands);
		const afterCancel = describeNotice(swap.visible());
		swap.connection.setStatus(ready);

		assert.deepStrictEqual({ shown, announcementKeys, first: { notice: firstNotice, ticked, cancelled: firstCancelled, requests: first.connection.requests }, swap: { notice: swapNotice, afterCancel } }, {
			shown: [
				'Info: Loading Example Flash 1.0, about 20 s remaining (0%) [Cancel]',
				'Info: Loading Example Flash 1.0, about 19 s remaining (5%) [Cancel]',
				'Info: Loading Example Flash 1.0, about 14 s remaining (30%) [Cancel]',
				'Info: Warming up Example Flash 1.0, about 14 s remaining (32%) [Cancel]',
				'Info: Warming up Example Flash 1.0, almost done… (95%) [Cancel]',
				undefined,
			],
			announcementKeys: [`loading:${installedFamily.familyId}:0:loading`, `loading:${installedFamily.familyId}:0:warmingUp`],
			first: {
				notice: 'Info: Loading Example Flash 1.0… (indeterminate) [Cancel]',
				ticked: 0,
				cancelled: 'Info: Cancelling loading Example Flash 1.0… (indeterminate) [(Cancelling…)]',
				requests: [{ action: 'stop' }],
			},
			swap: {
				notice: 'Info: Loading Example Flash 1.0, about 10 s remaining (0%) [Cancel]',
				afterCancel: 'Info: Cancelling loading Example Flash 1.0… (indeterminate) [(Cancelling…)]',
			},
		});
	}));

	test('a load\'s time remaining counts down a second at a time on screen, then reads almost done; its accessible text keeps the throttle, and screen readers hear only a new step', () => runWithFakedTimers({}, async () => {
		// 25.5 s into a load whose last comparable one took 30 s.
		const startedAt = Date.now();
		await timeout(25_500);
		const start = Date.now();
		const { connection, notices, visible } = setup(createStatus([installedFamily], { active: { ...readyActive, server: 'starting', load: { step: 'loading', startedAt, expectedMs: 30_000 } } }));
		// Sampled every 100 ms: the message on screen, then what assistive technology gets.
		const changes: string[] = [];
		const sample = () => {
			const notice = visible();
			const line = `${notice?.message} (${notice?.progress?.percent}%) | ${notice?.ariaMessage}`;
			if (changes.at(-1)?.endsWith(line) !== true) {
				changes.push(`${Date.now() - start} ms: ${line}`);
			}
		};
		sample();
		await timeout(50);
		for (let i = 0; i < 60; i++) {
			sample();
			await timeout(100);
		}
		const announcementKeys = [...new Set(notices.published.map(notice => notice.announcementKey))];
		connection.setStatus(createStatus([installedFamily], { active: readyActive }));
		const steady = 'Loading Example Flash 1.0, about 5 s remaining';
		assert.deepStrictEqual({ changes, announcementKeys }, {
			changes: [
				`0 ms: Loading Example Flash 1.0, about 5 s remaining (85%) | ${steady}`,
				`550 ms: Loading Example Flash 1.0, about 4 s remaining (86%) | ${steady}`,
				`1550 ms: Loading Example Flash 1.0, about 3 s remaining (90%) | ${steady}`,
				`2550 ms: Loading Example Flash 1.0, about 2 s remaining (93%) | ${steady}`,
				`3550 ms: Loading Example Flash 1.0, about 1 s remaining (95%) | ${steady}`,
				// The estimate ran out: the bar holds, and the countdown stops ticking.
				'4550 ms: Loading Example Flash 1.0, almost done… (95%) | Loading Example Flash 1.0, almost done…',
			],
			announcementKeys: [`loading:${installedFamily.familyId}:${startedAt}:loading`],
		});
	}));
	test('a load retried without speculative decoding says so through both of its steps, heard once, with progress as for any load', () => runWithFakedTimers({}, async () => {
		const retry = 'withoutSpeculativeDecoding';
		const loading = (load: ILocalModelLoadV1, operation?: Partial<ILocalModelOperationV1>, active?: Partial<ILocalModelActiveV1>) => createStatus(
			[operation ? withOperation({ state: 'running', ...operation }, installedFamily) : installedFamily],
			{ active: { ...readyActive, server: 'starting', load, ...active } },
		);
		// The warm-up crashed this llama.cpp build with speculative decoding: the host loads the model again without it.
		const ready = createStatus([installedFamily], { active: readyActive });
		const start = Date.now();
		const host = setup(loading({ step: 'warmingUp', startedAt: start }));
		const shown = [describeNotice(host.visible())];
		host.connection.setStatus(loading({ step: 'loading', startedAt: start + 1, retry }));
		shown.push(describeNotice(host.visible()));
		host.connection.setStatus(loading({ step: 'warmingUp', startedAt: start + 1, retry }));
		shown.push(describeNotice(host.visible()));
		const announcementKeys = [...new Set(host.notices.published.map(notice => notice.announcementKey))];
		host.connection.setStatus(ready);

		// A swap's retry, estimated from the last comparable load, and a reload's.
		const swapSetup = setup(loading({ step: 'loading', startedAt: Date.now(), expectedMs: 10_000, retry }, { id: 'swap-1', kind: 'swap', phase: 'loading' }));
		const swap = describeNotice(swapSetup.visible());
		swapSetup.connection.setStatus(ready);
		const reloadSetup = setup(loading({ step: 'loading', startedAt: Date.now(), retry }, { id: 'reload-1', kind: 'swap', phase: 'loading' }, { swapTo: installedFamily.familyId }));
		const reload = describeNotice(reloadSetup.visible());
		reloadSetup.connection.setStatus(ready);
		assert.deepStrictEqual({ shown, announcementKeys, swap, reload }, {
			shown: [
				'Info: Warming up Example Flash 1.0… (indeterminate) [Cancel]',
				'Info: Retrying Example Flash 1.0 without speculative decoding… (indeterminate) [Cancel]',
				'Info: Retrying Example Flash 1.0 without speculative decoding… (indeterminate) [Cancel]',
			],
			announcementKeys: [`loading:${installedFamily.familyId}:${start}:warmingUp`, `loading:${installedFamily.familyId}:${start + 1}:withoutSpeculativeDecoding`],
			swap: 'Info: Retrying Example Flash 1.0 without speculative decoding, about 10 s remaining (0%) [Cancel]',
			reload: 'Info: Retrying Example Flash 1.0 without speculative decoding… (indeterminate) [Cancel]',
		});
	}));

	test('a failure outranks a running operation, which outranks a pause; dismissing shows the next, and a failure that comes back shows again', () => {
		const gemma: ILocalModelFamilyV1 = { ...offeredFamily, familyId: 'gemma-local', capiId: 'gemma-local', displayName: 'Gemma' };
		const paused = withOperation({ id: 'op-3', state: 'paused', pausedReason: 'network', phase: 'downloading' }, gemma);
		const running = withOperation({ id: 'op-2', kind: 'update', state: 'running', phase: 'downloading' }, otherFamily);
		const failed = withOperation({ state: 'error', phase: 'downloading', error: { code: 'downloadFailed', message: 'The download of Example Flash 1.0 failed.', actions: ['retry'] } });
		const { connection, notices, show } = setup(createStatus([paused, running, failed]));
		const shown = [show()];
		for (let i = 0; i < 3; i++) {
			notices.dismissNotification(LOCAL_MODEL_STATUS_NOTICE_ID);
			shown.push(show());
		}
		connection.setStatus(createStatus([paused, running, withOperation({ state: 'running', phase: 'downloading' })]));
		const retried = show();
		connection.setStatus(createStatus([paused, running, failed]));

		assert.deepStrictEqual({ shown, retried, failedAgain: show() }, {
			shown: [
				'3 Error: The download of Example Flash 1.0 failed. [Retry*]',
				'2 Info: Downloading Example Coder… (indeterminate) [Pause]',
				'1 Warning: Paused: the download of Gemma was interrupted. [Resume*]',
				undefined,
			],
			retried: '2 Info: Downloading Example Flash 1.0… (indeterminate) [Pause]',
			failedAgain: '3 Error: The download of Example Flash 1.0 failed. [Retry*]',
		});
	});

	test('the device check failing explains it in the notice', () => {
		const { connection, show } = setup(createStatus([withOperation({ state: 'running', phase: 'resolving' })]));
		connection.setStatus(createStatus([withOperation({ state: 'running', phase: 'checkingDevice' })]));
		// The device check says the device is insufficient: the family is no longer offered.
		connection.setStatus(createStatus([]));
		assert.deepStrictEqual(show(), '1 Info: This device doesn\'t have enough GPU memory for Example Flash 1.0. []');
	});

	test('failures offer their remedies, without Details; a disconnect interrupts a running operation', () => {
		const notFound = { code: 'runtimeNotFound', message: 'llama.cpp isn\'t set up on this device.', actions: ['getLlamaCpp', 'openSettings', 'retry'] } as const;
		const { connection, commands, opener, visible, show } = setup(createStatus([withOperation({ state: 'error', phase: 'resolving', error: notFound })]));
		const failed = describeNotice(visible());
		for (const label of ['Open Settings', 'Get llama.cpp']) {
			runNoticeAction(visible(), label, commands);
		}
		connection.setStatus(createStatus([withOperation({ state: 'running', phase: 'checkingDevice' })]));
		const recovered = describeNotice(visible());
		connection.setStatus(undefined);
		const disconnected = show();
		connection.setStatus(createStatus([installedFamily], { active: { ...readyActive, server: 'error', error: { code: 'crashed', message: 'Example Flash 1.0 stopped unexpectedly.', actions: ['retry'] } } }));
		const crashed = describeNotice(visible());
		runNoticeAction(visible(), 'Retry', commands);

		assert.deepStrictEqual({ failed, recovered, disconnected, crashed, requests: connection.requests, commands: commands.executed, opened: opener.opened }, {
			failed: 'Error: llama.cpp isn\'t set up on this device. [Open Settings, Retry, Get llama.cpp*]',
			recovered: 'Info: Setting up Example Flash 1.0: Checking this device… (indeterminate) [Pause]',
			disconnected: '1 Warning: Setting up Example Flash 1.0 was interrupted because the agent host stopped. []',
			crashed: 'Error: Example Flash 1.0 stopped unexpectedly. [Retry*]',
			requests: [{ action: 'start' }],
			commands: [
				['workbench.action.openSettings', '@id:chat.copilot.localModel.llamaServerPath'],
			],
			opened: ['https://github.com/ggml-org/llama.cpp/releases'],
		});
	});

	test('a failure for want of a usable llama.cpp, before the download, in a model change or at load, offers Open Settings, Retry and Get llama.cpp', () => {
		const remedies = ['getLlamaCpp', 'openSettings', 'retry'] as const;
		const notFound = { code: 'runtimeNotFound', message: 'llama.cpp isn\'t set up on this device. Get llama.cpp, or set chat.copilot.localModel.llamaServerPath.', actions: remedies } as const;
		const unsupported = { code: 'runtimeUnsupportedModel', message: 'This llama.cpp build (0.6.0-dev (b11459)) can\'t run Example Flash 1.0 yet. Get a newer llama.cpp, or set chat.copilot.localModel.llamaServerPath to a build that supports it.', actions: remedies } as const;
		const run = (error: typeof notFound | typeof unsupported, failed: ILocalModelStatusV1) => {
			const { connection, commands, opener, visible } = setup(failed);
			const operationFailed = describeNotice(visible());
			runNoticeAction(visible(), 'Retry', commands);
			// Selecting the active model started it, without an operation.
			connection.setStatus(createStatus([installedFamily], { active: { ...readyActive, server: 'error', error } }));
			const loadFailed = describeNotice(visible());
			runNoticeAction(visible(), 'Retry', commands);
			runNoticeAction(visible(), 'Get llama.cpp', commands);
			return { operationFailed, loadFailed, requests: connection.requests, opened: opener.opened };
		};
		const expected = (error: typeof notFound | typeof unsupported, operationId: string) => ({
			operationFailed: `Error: ${error.message} [Open Settings, Retry, Get llama.cpp*]`,
			loadFailed: `Error: ${error.message} [Open Settings, Retry, Get llama.cpp*]`,
			requests: [{ action: 'retry', operationId }, { action: 'start' }],
			opened: ['https://github.com/ggml-org/llama.cpp/releases'],
		});
		assert.deepStrictEqual({
			swapWithoutLlamaCpp: run(notFound, createStatus([withOperation({ id: 'swap-1', kind: 'swap', state: 'error', phase: 'loading', error: notFound }, installedFamily)], { active: { ...readyActive, server: 'stopped' } })),
			unsupportedBeforeDownload: run(unsupported, createStatus([withOperation({ state: 'error', phase: 'resolving', error: unsupported })])),
		}, {
			swapWithoutLlamaCpp: expected(notFound, 'swap-1'),
			unsupportedBeforeDownload: expected(unsupported, 'op-1'),
		});
	});

	test('Review opens the model\'s details for a model that changed since consent', () => {
		const consent = setup(createStatus([withOperation({ state: 'paused', pausedReason: 'consentChanged', phase: 'downloading' })]));
		const notice = describeNotice(consent.visible());
		runNoticeAction(consent.visible(), 'Review…', consent.commands);

		assert.deepStrictEqual({ notice, commands: consent.commands.executed, requests: consent.connection.requests }, {
			notice: 'Warning: Paused: Example Flash 1.0 changed since you agreed to set it up. Review the details to continue. [Review…*]',
			commands: [[LOCAL_MODEL_SHOW_DETAILS_COMMAND_ID, offeredFamily.familyId]],
			// Setup consent happens on the details page.
			requests: [],
		});
	});

	test('a host that publishes no status shows nothing, and turning the feature off removes the notice', () => {
		const silent = setup(undefined);
		const { controller, notices } = setup(createStatus([withOperation({ state: 'running', phase: 'resolving' })]));
		controller.dispose();
		assert.deepStrictEqual({ silent: silent.notices.published.length, afterDispose: [...notices.notifications.keys()] }, { silent: 0, afterDispose: [] });
	});
});
