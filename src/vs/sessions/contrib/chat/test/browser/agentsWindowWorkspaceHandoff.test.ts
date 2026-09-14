/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService, IPromptChoice, IPromptChoiceWithMenu, NoOpNotification } from '../../../../../platform/notification/common/notification.js';
import { ILifecycleService, LifecyclePhase } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { ISelectWorkspaceOptions } from '../../../../browser/parts/chatView.js';
import { SessionView } from '../../../../browser/parts/sessionView.js';
import { ISessionsSetUpService } from '../../../../browser/sessionsSetUpService.js';
import { WorkspaceSelectionOrigin } from '../../../../common/workspaceSelection.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionNavigationRequest, ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { WorkspaceHandoffState } from '../../../sessions/browser/sessionsWindowOpenTelemetry.js';
import { AgentsWindowWorkspaceHandoff, WORKSPACE_HANDOFF_TIMEOUT_MS } from '../../browser/agentsWindowWorkspaceHandoff.js';
import { INewSessionComposerService, NewSessionComposerService } from '../../browser/newSessionComposerService.js';

suite('Agents Window workspace handoff', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const folderUri = URI.file('/private/from-editor');

	function createHarness() {
		const instantiationService = disposables.add(new TestInstantiationService());
		const composerService = disposables.add(new NewSessionComposerService());
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const initialRestoreComplete = observableValue('restored', true);
		const navigationRequest = observableValue<ISessionNavigationRequest | undefined>('navigationRequest', undefined);
		const onWillSend = disposables.add(new Emitter<ISession>());
		const selections: { folder: URI; options?: ISelectWorkspaceOptions }[] = [];
		const notifications: (IPromptChoice | IPromptChoiceWithMenu)[][] = [];
		const states: WorkspaceHandoffState[] = [];
		const openingOptions: boolean[] = [];
		let providerReady = true;
		let viewReady = true;
		let applies = true;
		let defaultAllowed = true;
		let welcome = Promise.resolve();
		let resolutionError: Error | undefined;
		const sessionsService = upcastPartial<ISessionsService>({
			activeSession,
			initialRestoreComplete,
			navigationRequest,
			openNewSession: async (options, token = CancellationToken.None) => {
				if (!options?.preserveNavigation) {
					navigationRequest.set({ token }, undefined);
				}
				openingOptions.push(!!options?.cancelRestore);
				activeSession.set(undefined, undefined);
				return { session: undefined, trustDeclined: false };
			},
		});
		instantiationService.stub(ISessionsService, sessionsService);
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onWillSendRequest: onWillSend.event,
			resolveWorkspace: () => {
				if (resolutionError) {
					throw resolutionError;
				}
				return providerReady ? { providerId: 'local', workspace: upcastPartial({}) } : undefined;
			},
		}));
		const sessionsPartService = upcastPartial<ISessionsPartService>({
			getSessionView: () => viewReady ? upcastPartial<SessionView>({
				selectWorkspace: (folder, options) => {
					if (options?.isDefault && !defaultAllowed) {
						return 'preserved';
					}
					selections.push({ folder, options });
					return applies ? 'applied' : 'notReady';
				},
			}) : undefined,
		});
		instantiationService.stub(ISessionsPartService, sessionsPartService);
		instantiationService.stub(ISessionsSetUpService, upcastPartial<ISessionsSetUpService>({ whenWelcomeDone: () => welcome }));
		instantiationService.stub(INewSessionComposerService, composerService);
		disposables.add(composerService.registerComposer({
			get canApplyWorkspaceDefault() { return defaultAllowed; },
			animatePrompt: async () => false,
			showPromptOptions: () => false,
		}));
		instantiationService.stub(ILifecycleService, upcastPartial<ILifecycleService>({ when: async () => { }, phase: LifecyclePhase.Eventually, onWillShutdown: Event.None }));
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ getViewWithId: () => null }));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
			prompt: (_severity, _message, choices) => {
				notifications.push(choices);
				return new NoOpNotification();
			},
		}));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({ executeCommand: async () => undefined }));
		instantiationService.stub(ILogService, upcastPartial<ILogService>({ warn: () => { }, error: () => { } }));
		const handoff = disposables.add(instantiationService.createInstance(AgentsWindowWorkspaceHandoff));
		return {
			handoff, composerService, sessionsService, sessionsPartService, activeSession, initialRestoreComplete, onWillSend, states, selections, notifications, openingOptions,
			set providerReady(value: boolean) { providerReady = value; },
			set viewReady(value: boolean) { viewReady = value; },
			set applies(value: boolean) { applies = value; },
			set defaultAllowed(value: boolean) { defaultAllowed = value; },
			set welcome(value: Promise<void>) { welcome = value; },
			set resolutionError(value: Error) { resolutionError = value; },
			open: (isDefault = false, folder = folderUri) => handoff.selectWorkspace({ folderUri: folder, preferDevContainer: true, isDefault }, state => states.push(state)),
		};
	}

	test('retains the requested folder through setup and late provider and view readiness, past Eventually', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness();
			const welcome = new DeferredPromise<void>();
			harness.welcome = welcome.p;
			harness.providerReady = false;
			harness.viewReady = false;
			const opening = harness.open();
			await timeout(500);
			await welcome.complete();
			await timeout(500);
			harness.providerReady = true;
			await timeout(500);
			harness.viewReady = true;
			await opening;
			assert.deepStrictEqual({
				stages: [...new Set(harness.states)],
				openingOptions: harness.openingOptions,
				selections: harness.selections.map(entry => ({ folder: entry.folder.toString(), options: entry.options })),
				notifications: harness.notifications.length,
			}, {
				stages: ['waitingForSetup', 'waitingForSessionView', 'waitingForProvider', 'applied'],
				openingOptions: [true],
				selections: [{ folder: folderUri.toString(), options: { providerId: 'local', preferDevContainer: true, selectionOrigin: WorkspaceSelectionOrigin.WindowOpen, isDefault: false } }],
				notifications: 0,
			});
		});
	});

	for (const action of ['select', 'newComposer', 'send', 'createdSession', 'supersede', 'dispose'] as const) {
		test(`${action} cancels a workspace handoff waiting for setup`, async () => {
			const harness = createHarness();
			const welcome = new DeferredPromise<void>();
			harness.welcome = welcome.p;
			const opening = harness.open();
			if (action === 'select') {
				harness.composerService.notifyUserWorkspaceSelection();
			} else if (action === 'newComposer') {
				harness.composerService.notifyUserNavigation();
			} else if (action === 'send') {
				harness.composerService.notifyWillSendRequest({ query: 'test' }, undefined);
			} else if (action === 'createdSession') {
				harness.activeSession.set(upcastPartial<IActiveSession>({ isCreated: observableValue('created', true) }), undefined);
			} else if (action === 'supersede') {
				harness.handoff.cancel();
			} else {
				harness.handoff.dispose();
			}
			await opening;
			await welcome.complete();
			assert.deepStrictEqual({
				state: harness.states.at(-1),
				openings: harness.openingOptions.length,
				selections: harness.selections.length,
				notifications: harness.notifications.length,
			}, {
				state: action === 'select' || action === 'newComposer' ? 'userChanged' : action === 'send' || action === 'createdSession' ? 'sessionAlreadyCreated' : action === 'supersede' ? 'superseded' : 'cancelled',
				openings: 0,
				selections: 0,
				notifications: 0,
			});
		});
	}

	for (const waitingFor of ['setup', 'provider'] as const) {
		test(`direct remote workspace navigation cancels a handoff waiting for ${waitingFor}`, async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				const harness = createHarness();
				const welcome = new DeferredPromise<void>();
				harness.welcome = waitingFor === 'setup' ? welcome.p : Promise.resolve();
				harness.providerReady = waitingFor !== 'provider';
				const opening = harness.open();
				await timeout(100);

				const remoteFolder = URI.parse('vscode-remote://ssh-remote+host/project');
				await harness.sessionsService.openNewSession();
				harness.sessionsPartService.getSessionView(harness.activeSession.get()?.sessionId)?.selectWorkspace(remoteFolder);

				harness.providerReady = true;
				await welcome.complete();
				await opening;
				assert.deepStrictEqual({
					state: harness.states.at(-1),
					folders: harness.selections.map(selection => selection.folder.toString()),
					workspaceChoices: harness.composerService.userWorkspaceSelectionVersion.get(),
					navigationChoices: harness.composerService.userNavigationVersion.get(),
				}, {
					state: 'userChanged',
					folders: [remoteFolder.toString()],
					workspaceChoices: 0,
					navigationChoices: 0,
				});
			});
		});
	}

	test('a newer explicit folder wins when the older request resumes', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness();
			harness.providerReady = false;
			const oldOpening = harness.open();
			await timeout(100);
			harness.providerReady = true;
			const latestFolder = URI.file('/private/latest');
			await harness.open(false, latestFolder);
			await oldOpening;
			assert.deepStrictEqual(harness.selections.map(entry => entry.folder.toString()), [latestFolder.toString()]);
		});
	});

	test('a later explicit user selection cancels provider retries', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness();
			harness.providerReady = false;
			const opening = harness.open();
			await timeout(500);
			harness.composerService.notifyUserWorkspaceSelection();
			harness.providerReady = true;
			await opening;
			assert.deepStrictEqual({ state: harness.states.at(-1), selections: harness.selections }, { state: 'userChanged', selections: [] });
		});
	});

	for (const unavailable of ['provider', 'view', 'acknowledgement'] as const) {
		test(`offers recovery after the ${unavailable} deadline instead of claiming success`, async () => {
			await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 200 }, async () => {
				const harness = createHarness();
				harness.providerReady = unavailable !== 'provider';
				harness.viewReady = unavailable !== 'view';
				harness.applies = unavailable !== 'acknowledgement';
				const startedAt = Date.now();
				await harness.open();
				const timedOut = { state: harness.states.at(-1), duration: Date.now() - startedAt, actions: harness.notifications[0].map(choice => choice.label) };
				harness.providerReady = harness.viewReady = harness.applies = true;
				await harness.notifications[0][0].run();
				assert.deepStrictEqual({ timedOut, retried: harness.states.at(-1) }, {
					timedOut: {
						state: unavailable === 'provider' ? 'providerUnavailable' : unavailable === 'view' ? 'viewUnavailable' : 'selectionNotApplied',
						duration: WORKSPACE_HANDOFF_TIMEOUT_MS,
						actions: ['Retry', 'Choose Workspace'],
					},
					retried: 'applied',
				});
			});
		});
	}

	test('reports provider errors with recovery rather than silently abandoning the request', async () => {
		const harness = createHarness();
		harness.resolutionError = new Error('unavailable');
		await harness.open();
		assert.deepStrictEqual({ state: harness.states.at(-1), notifications: harness.notifications.length }, { state: 'error', notifications: 1 });
	});

	test('an inferred default waits for restore without opening a new session', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness();
			harness.initialRestoreComplete.set(false, undefined);
			const opening = harness.open(true);
			await timeout(100);
			harness.initialRestoreComplete.set(true, undefined);
			await opening;
			assert.deepStrictEqual({ openings: harness.openingOptions, origin: harness.selections[0]?.options?.selectionOrigin }, {
				openings: [],
				origin: WorkspaceSelectionOrigin.WindowContext,
			});
		});
	});

	test('cancels an inferred default while waiting for initial restore', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness();
			harness.initialRestoreComplete.set(false, undefined);
			const opening = harness.open(true);
			await timeout(100);
			harness.handoff.cancel();
			await opening;
			harness.initialRestoreComplete.set(true, undefined);
			assert.deepStrictEqual({ state: harness.states.at(-1), selections: harness.selections }, { state: 'superseded', selections: [] });
		});
	});

	test('does not show a warning when an inferred default times out', async () => {
		await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 200 }, async () => {
			const harness = createHarness();
			harness.providerReady = false;
			await harness.open(true);
			assert.deepStrictEqual({ state: harness.states.at(-1), notifications: harness.notifications }, { state: 'providerUnavailable', notifications: [] });
		});
	});

	test('navigating to a created session cancels pending provider retries', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness();
			harness.providerReady = false;
			const opening = harness.open();
			await timeout(100);
			harness.activeSession.set(upcastPartial<IActiveSession>({ isCreated: observableValue('created', true) }), undefined);
			harness.providerReady = true;
			await opening;
			assert.deepStrictEqual({ state: harness.states.at(-1), selections: harness.selections }, { state: 'sessionAlreadyCreated', selections: [] });
		});
	});

	test('asks the target view rather than the most recently mounted composer whether a default is safe', async () => {
		const harness = createHarness();
		disposables.add(harness.composerService.registerComposer({
			canApplyWorkspaceDefault: false,
			animatePrompt: async () => false,
			showPromptOptions: () => false,
		}));
		await harness.open(true);
		assert.deepStrictEqual({ state: harness.states.at(-1), selections: harness.selections.length }, { state: 'applied', selections: 1 });
	});

	for (const protectedState of ['restoredSession', 'quickChat', 'composer'] as const) {
		test(`an inferred default preserves ${protectedState}`, async () => {
			const harness = createHarness();
			if (protectedState === 'restoredSession') {
				harness.activeSession.set(upcastPartial<IActiveSession>({ isCreated: observableValue('created', true) }), undefined);
			} else if (protectedState === 'quickChat') {
				harness.activeSession.set(upcastPartial<IActiveSession>({
					isCreated: observableValue('created', false), isQuickChat: observableValue('quickChat', true),
				}), undefined);
			} else {
				harness.defaultAllowed = false;
			}
			await harness.open(true);
			assert.deepStrictEqual({ state: harness.states.at(-1), selections: harness.selections, openings: harness.openingOptions }, {
				state: 'preservedSession', selections: [], openings: [],
			});
		});
	}
});
