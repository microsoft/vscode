/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { _util } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { INotificationService, IPromptChoice, NoOpNotification } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IssueReporterOverlay } from '../../browser/issueReporterOverlay.js';
import { IRecordingData, IRecordingService, RecordingState } from '../../browser/recordingService.js';
import { IssueReporterEditorPane } from '../../electron-browser/issueReporterEditorPane.js';

type PermissionStatus = Awaited<ReturnType<INativeHostService['getMediaAccessStatus']>>;

suite('Issue reporter recording recovery', () => {
	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Exercise private recording handlers without widening the editor API. */
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createPane(status: PermissionStatus) {
		const calls: string[] = [];
		const choices: IPromptChoice[] = [];
		const messages: string[] = [];
		const requestStarted = new DeferredPromise<void>();
		const captureStarted = new DeferredPromise<void>();
		const service = new class extends mock<IRecordingService>() {
			override readonly onDidChangeState = Event.None;
			override readonly onDidFailRecording = Event.None;
			override state = RecordingState.Idle;
			permission = status;
			grantedOnRequest = false;
			statusAfterRequest: PermissionStatus | undefined;
			statusError: Error | undefined;
			requestError: Error | undefined;
			startError: Error | undefined;
			stopError: Error | undefined;
			settingsError: Error | undefined;
			requestGate: DeferredPromise<void> | undefined;
			captureGate: DeferredPromise<void> | undefined;
			stopGate: DeferredPromise<void> | undefined;
			discards = 0;

			override async getScreenCapturePermissionStatus(): Promise<PermissionStatus> {
				calls.push('status');
				if (this.statusError) {
					throw this.statusError;
				}
				return this.permission;
			}

			override async requestScreenCapturePermission(): Promise<boolean> {
				calls.push('request');
				void requestStarted.complete();
				await this.requestGate?.p;
				if (this.requestError) {
					throw this.requestError;
				}
				if (this.grantedOnRequest) {
					this.permission = 'granted';
				} else if (this.statusAfterRequest) {
					this.permission = this.statusAfterRequest;
				}
				return this.grantedOnRequest;
			}

			override async startRecording(): Promise<void> {
				calls.push('start');
				void captureStarted.complete();
				const discards = this.discards;
				await this.captureGate?.p;
				if (discards !== this.discards) {
					throw new CancellationError();
				}
				if (this.startError) {
					throw this.startError;
				}
				this.state = RecordingState.Recording;
			}

			override async stopRecording(): Promise<IRecordingData | undefined> {
				calls.push('stop');
				await this.stopGate?.p;
				this.state = RecordingState.Idle;
				if (this.stopError) {
					throw this.stopError;
				}
				return undefined;
			}

			override discardRecording(): void {
				calls.push('discard');
				this.discards++;
				this.state = RecordingState.Idle;
			}

			override async openScreenCapturePermissionSettings(): Promise<void> {
				calls.push('settings');
				if (this.settingsError) {
					throw this.settingsError;
				}
			}
		}();
		const wizard = new class extends mock<IssueReporterOverlay>() {
			private currentState = RecordingState.Idle;
			override get recordingState(): RecordingState { return this.currentState; }
			override reserveRecordingSlot(): boolean { return true; }
			override setRecordingState(state: RecordingState): void { this.currentState = state; }
			override dispose(): void { }
		}();
		const instantiationService = store.add(new TestInstantiationService());
		for (const dependency of _util.getServiceDependencies(IssueReporterEditorPane as typeof IssueReporterEditorPane & _util.DI_TARGET_OBJ)) {
			instantiationService.stub(dependency.id, {});
		}
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IRecordingService, service);
		instantiationService.stub(INotificationService, {
			prompt: (_severity, message, promptChoices) => {
				calls.push('guidance');
				messages.push(String(message));
				choices.push(...promptChoices);
				return new NoOpNotification();
			},
			warn: message => { calls.push('guidance'); messages.push(String(message)); },
			error: message => { calls.push('error'); messages.push(String(message)); },
		});
		const pane = store.add(instantiationService.createInstance(IssueReporterEditorPane, new class extends mock<IEditorGroup>() { }()));
		pane['wizard'] = wizard;
		pane['inputDisposables'].add(wizard);
		return { pane, service, wizard, calls, choices, messages, requestStarted, captureStarted };
	}

	test('registers denied access on explicit Record before showing guidance', async () => {
		const { pane, calls, wizard } = createPane('denied');
		await pane['startRecording']();
		assert.deepStrictEqual({ calls, state: wizard.recordingState }, {
			calls: ['status', 'request', 'status'], state: RecordingState.Idle,
		});
	});

	test('starts recording after the native request grants access', async () => {
		const { pane, service, calls, wizard } = createPane('not-determined');
		service.grantedOnRequest = true;
		await pane['startRecording']();
		assert.deepStrictEqual({ calls, state: wizard.recordingState }, {
			calls: ['status', 'request', 'start'], state: RecordingState.Recording,
		});
	});

	for (const status of ['denied', 'not-determined', 'unknown'] as const) {
		test(`${status} uses one native request per Record and guides only on retry`, async () => {
			const { pane, calls } = createPane(status);
			await pane['startRecording']();
			await pane['startRecording']();
			assert.deepStrictEqual(calls, ['status', 'request', 'status', 'status', 'request', 'status', 'guidance']);
		});
	}

	test('restricted access explains the restriction without requesting access', async () => {
		const { pane, calls, messages, wizard } = createPane('restricted');
		await pane['startRecording']();
		assert.deepStrictEqual({ calls, state: wizard.recordingState, restricted: !isMacintosh || messages[0].includes('restricted by macOS') }, {
			calls: ['status', 'guidance'], state: RecordingState.Idle, restricted: true,
		});
	});

	test('reads the updated status after a denied native request', async () => {
		const { pane, service, calls } = createPane('not-determined');
		service.statusAfterRequest = 'restricted';
		await pane['startRecording']();
		assert.deepStrictEqual(calls, ['status', 'request', 'status', 'guidance']);
	});

	test('already granted access starts without requesting permission again', async () => {
		const { pane, calls, wizard } = createPane('granted');
		await pane['startRecording']();
		assert.deepStrictEqual({ calls, state: wizard.recordingState }, { calls: ['status', 'start'], state: RecordingState.Recording });
	});

	test('overlapping Record actions share one pending native request', async () => {
		const { pane, service, calls } = createPane('denied');
		const requestGate = service.requestGate = new DeferredPromise<void>();
		const start = pane['startRecording']();
		assert.strictEqual(pane['startRecording'](), start);
		await requestGate.complete();
		await start;
		assert.deepStrictEqual(calls, ['status', 'request', 'status']);
	});

	test('native request rejection does not duplicate the first permission prompt', async () => {
		const { pane, service, calls } = createPane('denied');
		service.requestError = new Error('TCC denied');
		await pane['startRecording']();
		await pane['startRecording']();
		assert.deepStrictEqual(calls, ['status', 'request', 'status', 'status', 'request', 'status', 'guidance']);
	});

	test('permission status errors are handled without leaving a rejected action', async () => {
		const { pane, service, calls, wizard } = createPane('granted');
		service.statusError = new Error('status unavailable');
		await pane['startRecording']();
		assert.deepStrictEqual({ calls, state: wizard.recordingState }, { calls: ['status', 'status', 'error'], state: RecordingState.Idle });
	});

	test('failed starts with granted permission give restart and regrant recovery on macOS', async () => {
		const { pane, service, calls, messages, wizard } = createPane('granted');
		service.startError = new Error('No live capture');
		await pane['startRecording']();
		assert.deepStrictEqual({
			calls, state: wizard.recordingState,
			recovery: !isMacintosh || /quit and reopen.*remove.*grant access again/.test(messages[0]),
		}, { calls: ['status', 'start', 'status', 'error'], state: RecordingState.Idle, recovery: true });
		service.startError = undefined;
		await pane['startRecording']();
		assert.strictEqual(wizard.recordingState, RecordingState.Recording);
	});

	test('settings action only navigates, including after repeated permission failures', async () => {
		const { pane, calls, choices } = createPane('denied');
		await pane['startRecording']();
		await pane['startRecording']();
		const beforeSettings = calls.slice();
		if (isMacintosh) {
			await choices[0].run();
		}
		assert.deepStrictEqual(calls, [...beforeSettings, ...(isMacintosh ? ['settings'] : [])]);
	});

	test('settings navigation failure is surfaced without requesting access', async () => {
		const { pane, service, calls, choices } = createPane('restricted');
		service.settingsError = new Error('settings unavailable');
		await pane['startRecording']();
		if (isMacintosh) {
			await choices[0].run();
		}
		assert.deepStrictEqual(calls, isMacintosh ? ['status', 'guidance', 'settings', 'error'] : ['status', 'guidance']);
	});

	for (const action of ['dispose', 'stop'] as const) {
		test(`${action} while permission is pending cannot start recording later`, async () => {
			const { pane, service, calls, requestStarted } = createPane('denied');
			const requestGate = service.requestGate = new DeferredPromise<void>();
			service.grantedOnRequest = true;
			const start = pane['startRecording']();
			await requestStarted.p;
			if (action === 'dispose') {
				pane.dispose();
			} else {
				await pane['stopRecording']();
			}
			await requestGate.complete();
			await start;
			assert.deepStrictEqual(calls, ['status', 'request']);
		});
	}

	test('closing the pane cancels an acquired or pending capture', async () => {
		const { pane, service, calls, captureStarted } = createPane('granted');
		const captureGate = service.captureGate = new DeferredPromise<void>();
		const start = pane['startRecording']();
		await captureStarted.p;
		pane.dispose();
		await captureGate.complete();
		await start;
		assert.deepStrictEqual({ calls, state: service.state }, { calls: ['status', 'start', 'discard'], state: RecordingState.Idle });
	});

	test('duplicate stop actions do not collect or save the same recording twice', async () => {
		const { pane, service, calls, wizard } = createPane('granted');
		const stopGate = service.stopGate = new DeferredPromise<void>();
		await pane['startRecording']();
		const stop = pane['stopRecording']();
		assert.strictEqual(pane['stopRecording'](), stop);
		await stopGate.complete();
		await stop;
		assert.deepStrictEqual({ calls, state: wizard.recordingState }, { calls: ['status', 'start', 'stop'], state: RecordingState.Idle });
	});

	test('stop failures reset the wizard and surface an actionable error', async () => {
		const { pane, service, calls, wizard } = createPane('granted');
		await pane['startRecording']();
		service.stopError = new Error('No video captured');
		await pane['stopRecording']();
		assert.deepStrictEqual({ calls, state: wizard.recordingState }, { calls: ['status', 'start', 'stop', 'error'], state: RecordingState.Idle });
	});
	/* eslint-enable local/code-no-bracket-notation-for-identifiers */
});
