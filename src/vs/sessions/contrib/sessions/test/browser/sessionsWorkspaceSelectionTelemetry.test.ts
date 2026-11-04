/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryData, ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { AgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';
import { ILifecycleService, ShutdownReason } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IWorkspaceSelectionSnapshot, WorkspaceSelectionOrigin } from '../../../../common/workspaceSelection.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISendRequestSentEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISendRequestOptions } from '../../../../services/sessions/common/sessionsProvider.js';
import { INewSessionComposerService, NewSessionComposerService } from '../../../chat/browser/newSessionComposerService.js';
import { FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS } from '../../browser/sessionsWindowOpenTelemetry.js';
import { SessionsWorkspaceSelectionTelemetry } from '../../browser/sessionsWorkspaceSelectionTelemetry.js';

suite('SessionsWorkspaceSelectionTelemetry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = URI.file('/private/suggested-project');

	function createHarness() {
		const instantiationService = disposables.add(new TestInstantiationService());
		const composerService = disposables.add(new NewSessionComposerService());
		const lifecycleService = disposables.add(new TestLifecycleService());
		const selectionChanged = disposables.add(new Emitter<void>());
		const requestSent = disposables.add(new Emitter<ISendRequestSentEvent>());
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const events: { name: string; data?: ITelemetryData }[] = [];
		let selection: IWorkspaceSelectionSnapshot | undefined;
		disposables.add(composerService.registerComposer({
			get workspaceSelection() { return selection; },
			onDidChangeWorkspaceSelection: selectionChanged.event,
			animatePrompt: async () => false,
			showPromptOptions: () => false,
		}));
		instantiationService.stub(INewSessionComposerService, composerService);
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({ activeSession }));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({ onDidSendRequest: requestSent.event }));
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiationService.stub(ITelemetryService, upcastPartial<ITelemetryService>({ publicLog2: (name, data) => { events.push({ name, data }); } }));
		instantiationService.stub(ILifecycleService, lifecycleService);
		disposables.add(instantiationService.createInstance(SessionsWorkspaceSelectionTelemetry, AgentsWindowOpenSource.KeyboardShortcut, {
			workspaceArgumentKind: 'local', workspaceArgumentIsDefault: true, hasSessionArgument: false,
		}));
		return {
			composerService, lifecycleService, events,
			setSelection(folderUri: URI | undefined, origin = WorkspaceSelectionOrigin.WindowContext) {
				selection = {
					folderUri, origin, state: folderUri ? 'selected' : 'noWorkspace',
					historyState: 'loaded', sessionFallbackState: 'idle', registeredProviderCount: 1,
				};
				selectionChanged.fire();
			},
			setReady(folderUri: URI) {
				activeSession.set(upcastPartial<IActiveSession>({
					isCreated: observableValue('created', false),
					loading: observableValue('loading', false),
					workspace: observableValue<ISessionWorkspace>('workspace', {
						uri: folderUri, label: 'workspace', icon: Codicon.folder,
						folders: [{ root: folderUri, workingDirectory: folderUri, name: 'workspace', description: undefined }],
						requiresWorkspaceTrust: true, isVirtualWorkspace: false,
					}),
				}), undefined);
			},
			startRequest(options: ISendRequestOptions) {
				composerService.notifyWillSendRequest(options, selection);
			},
			succeedRequest(options: ISendRequestOptions) {
				requestSent.fire(upcastPartial<ISendRequestSentEvent>({ options, isNewSession: true }));
			},
		};
	}

	test('records a retained, usable default once without uploading identifiers or request content', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness();
			await timeout(100);
			harness.setSelection(folder);
			await timeout(200);
			harness.setReady(folder);
			await timeout(100);
			const options = { query: 'private request text' };
			harness.startRequest(options);
			harness.succeedRequest(options);
			harness.lifecycleService.fireShutdown(ShutdownReason.CLOSE);
			assert.deepStrictEqual(harness.events, [{
				name: 'agents/workspaceSelectionOutcome',
				data: {
					source: 'keyboardShortcut',
					workspaceArgumentKind: 'local',
					workspaceArgumentIsDefault: true,
					observationReason: 'firstRequest',
					observationDurationMs: 400,
					firstRequestSent: true,
					defaultAvailable: true,
					defaultOrigin: 'windowContext',
					timeToDefaultMs: 100,
					timeToUsableDefaultMs: 300,
					userSelectedWorkspace: false,
					defaultRetainedAtFirstRequest: true,
					workspaceSelectedAtFirstRequest: true,
				},
			}]);
		});
	});

	for (const choice of ['different', 'same', 'noWorkspace'] as const) {
		test(`records ${choice} user selection separately from default retention`, () => {
			const harness = createHarness();
			harness.setSelection(folder);
			harness.composerService.notifyUserWorkspaceSelection();
			harness.setSelection(choice === 'different' ? URI.file('/private/user-choice') : choice === 'same' ? folder : undefined, WorkspaceSelectionOrigin.User);
			const options = { query: 'test' };
			harness.startRequest(options);
			harness.succeedRequest(options);
			const data = harness.events[0].data;
			assert.deepStrictEqual({
				defaultOrigin: data?.defaultOrigin, acted: data?.userSelectedWorkspace,
				retained: data?.defaultRetainedAtFirstRequest, selected: data?.workspaceSelectedAtFirstRequest,
			}, { defaultOrigin: 'windowContext', acted: true, retained: choice === 'same', selected: choice !== 'noWorkspace' });
		});
	}

	test('uses the actual successful request snapshot when background sends complete out of order', () => {
		const harness = createHarness();
		harness.setSelection(folder);
		const first = { query: 'first' };
		const second = { query: 'second' };
		harness.startRequest(first);
		harness.composerService.notifyUserWorkspaceSelection();
		harness.setSelection(URI.file('/private/other'), WorkspaceSelectionOrigin.User);
		harness.startRequest(second);
		harness.setSelection(undefined);
		harness.succeedRequest(second);
		harness.succeedRequest(first);
		assert.deepStrictEqual({
			count: harness.events.length,
			selected: harness.events[0].data?.workspaceSelectedAtFirstRequest,
			retained: harness.events[0].data?.defaultRetainedAtFirstRequest,
		}, { count: 1, selected: true, retained: false });
	});

	test('allows automatic priority upgrades before the user chooses', () => {
		const harness = createHarness();
		harness.setSelection(URI.file('/private/history'), WorkspaceSelectionOrigin.VSCodeRecent);
		harness.setSelection(folder, WorkspaceSelectionOrigin.WindowContext);
		const options = { query: 'test' };
		harness.startRequest(options);
		harness.succeedRequest(options);
		assert.deepStrictEqual({
			origin: harness.events[0].data?.defaultOrigin, retained: harness.events[0].data?.defaultRetainedAtFirstRequest,
		}, { origin: 'windowContext', retained: true });
	});

	for (const end of ['timer', 'close', 'quit', 'reload'] as const) {
		test(`a failed send followed by ${end} does not count as conversion`, async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				const harness = createHarness();
				harness.setSelection(folder);
				harness.startRequest({ query: 'unsent' });
				if (end === 'timer') {
					await timeout(FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS);
				} else {
					harness.lifecycleService.fireShutdown(end === 'quit' ? ShutdownReason.QUIT : end === 'reload' ? ShutdownReason.RELOAD : ShutdownReason.CLOSE);
				}
				assert.deepStrictEqual({
					reason: harness.events[0].data?.observationReason,
					sent: harness.events[0].data?.firstRequestSent,
					retained: harness.events[0].data?.defaultRetainedAtFirstRequest,
					usable: harness.events[0].data?.timeToUsableDefaultMs,
				}, { reason: end, sent: false, retained: undefined, usable: undefined });
			});
		});
	}

	test('does not call the first manual workspace a default', () => {
		const harness = createHarness();
		harness.composerService.notifyUserWorkspaceSelection();
		harness.setSelection(folder, WorkspaceSelectionOrigin.User);
		const options = { query: 'test' };
		harness.startRequest(options);
		harness.succeedRequest(options);
		assert.deepStrictEqual({
			defaultAvailable: harness.events[0].data?.defaultAvailable,
			selected: harness.events[0].data?.workspaceSelectedAtFirstRequest,
			retained: harness.events[0].data?.defaultRetainedAtFirstRequest,
		}, { defaultAvailable: false, selected: true, retained: undefined });
	});

	test('records conversion without inferring acceptance for an uncorrelated send', () => {
		const harness = createHarness();
		harness.setSelection(folder);
		harness.succeedRequest({ query: 'request outside the composer' });
		assert.deepStrictEqual({
			sent: harness.events[0].data?.firstRequestSent,
			available: harness.events[0].data?.defaultAvailable,
			retained: harness.events[0].data?.defaultRetainedAtFirstRequest,
			selected: harness.events[0].data?.workspaceSelectedAtFirstRequest,
		}, { sent: true, available: true, retained: undefined, selected: undefined });
	});

	test('records a bounded no-default observation and stops listening after emission', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness();
			await timeout(FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS + 100);
			harness.setSelection(folder);
			const options = { query: 'outside the observation interval' };
			harness.startRequest(options);
			harness.succeedRequest(options);
			assert.deepStrictEqual({
				count: harness.events.length, reason: harness.events[0].data?.observationReason,
				duration: harness.events[0].data?.observationDurationMs,
				available: harness.events[0].data?.defaultAvailable,
				selected: harness.events[0].data?.workspaceSelectedAtFirstRequest,
			}, { count: 1, reason: 'timer', duration: FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS, available: false, selected: undefined });
		});
	});
});
