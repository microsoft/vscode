/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { errorHandler } from '../../../../../../../base/common/errors.js';
import { Event } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../../platform/notification/test/common/testNotificationService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { IWorkspaceFolderLocationService } from '../../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../../../../platform/workspace/common/workspace.js';
import { ResolveSessionConfigResult } from '../../../../../../../platform/agentHost/common/state/protocol/channels-root/commands.js';
import { IWorkbenchEnvironmentService } from '../../../../../../services/environment/common/environmentService.js';
import { resolveOnboardingTarget } from '../../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload } from '../../../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../../onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../../onboarding/common/onboardingScenarioService.js';
import { IAgentHostNewSessionFolderService } from '../../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { registerWorktreeControl } from '../../../../browser/agentSessions/agentHost/agentHostNewWorktreeToggle.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { AgentHostWorktreeFolderChoices, IAgentHostWorktreeLocationsCache } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeFolderChoices.js';
import { AGENT_HOST_WORKTREE_SEND_CHOICE_ID, AgentHostWorktreeSendChoice, IAgentHostWorktreeSendChoiceService, isRecentChatInFolder, IWorktreeSendChoiceSession, toWorktreeSendChoiceSessions, WORKTREE_SEND_CHOICE_RECENT_MS } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeSendChoice.js';
import { AgentHostWorktreeSessionSources, IAgentHostWorktreeSessionSources } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeSessionSources.js';
import { IAgentSession } from '../../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../browser/agentSessions/agentSessionsService.js';
import { IChatWidget, IChatWidgetService } from '../../../../browser/chat.js';
import { ChatSubmitRequestCancelled, ChatSubmitRequestHandlerService, IChatSubmitRequestHandlerService } from '../../../../browser/chatSubmitRequestHandlerService.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';

/** The user's answer in the callout; `abort` where it ends without one, as where it cannot show. */
type Answer = 'useWorktree' | 'continue' | 'escape' | 'abort';

suite('Agent host Work in Parallel choice on send', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/vscode');
	const worktree = URI.file('/work/vscode.worktrees/feature');
	let draftCount = 0;

	/**
	 * The Chat view's new chats in a window whose folder is the primary: the user answers the callout with `answer`, and a chat
	 * that a first request started earlier works in `firstChatIn`.
	 */
	const NOW = Date.UTC(2026, 10, 16, 12);
	const HOUR = 60 * 60 * 1000;

	function createWindow(options: { readonly firstChatIn?: URI; readonly firstChatArchived?: boolean; readonly isolations?: readonly string[]; readonly ai?: boolean }) {
		const disposables = store.add(new DisposableStore());
		const instantiationService = disposables.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: true });
		instantiationService.stub(IConfigurationService, configuration);
		const contextKeyService = disposables.add(new ContextKeyService(configuration));
		contextKeyService.createKey(ChatContextKeys.enabled.key, options.ai ?? true);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: primary, folders: [upcastPartial<IWorkspaceFolder>({ uri: primary })] }),
			getWorkbenchState: () => WorkbenchState.FOLDER,
		}));
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: false, remoteAuthority: undefined }));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({ getLocation: () => undefined, canSetLocation: () => true }));
		instantiationService.stub(IAgentHostWorktreeLocationsCache, upcastPartial<IAgentHostWorktreeLocationsCache>({ isActive: () => true, getLocations: () => [], refresh: () => { }, onWillRefresh: Event.None, onDidChange: Event.None }));
		const chosen = new Set<string>();
		instantiationService.stub(IAgentHostNewSessionFolderService, upcastPartial<IAgentHostNewSessionFolderService>({ getFolder: () => undefined, isNoWorkspace: () => false, isNewWorktree: () => false, isIsolationChosen: (resource: URI) => chosen.has(resource.toString()), setIsolationChosen: (resource: URI) => { chosen.add(resource.toString()); } }));
		// The isolation of each new chat, as its configuration has it; a change to it can be held until `applied` completes, or
		// fail: a new worktree before or after it changes the configuration; after which going back to the folder fails too, does
		// nothing, or the configuration or its isolation is gone
		const isolations = new Map<string, string>();
		let applied: DeferredPromise<void> | undefined;
		let applyFails: 'beforeChange' | 'afterChange' | 'rollbackToo' | 'rollbackNoop' | 'configGone' | 'isolationGone' | undefined;
		let config: 'known' | 'gone' | 'noIsolation' = 'known';
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, upcastPartial<IAgentHostUntitledProvisionalSessionService>({
			onDidChange: Event.None,
			getResolvedConfig: (resource: URI): ResolveSessionConfigResult | undefined => config === 'gone' ? undefined : ({ schema: { type: 'object', properties: config === 'noIsolation' ? {} : { isolation: { type: 'string', title: 'Isolation', enum: [...options.isolations ?? ['folder', 'worktree']] } } }, values: { isolation: isolations.get(resource.toString()) ?? 'folder' } }),
			getPreparedSessionConfig: () => undefined,
			applyConfigChange: async (resource: URI, _provider: string, _folder: URI | undefined, partial: Record<string, unknown>) => {
				if (applyFails === 'beforeChange' && partial.isolation === 'worktree') {
					throw new Error('cannot create the worktree');
				}
				if (applyFails === 'rollbackNoop' && partial.isolation !== 'worktree') {
					return resource;
				}
				// The configuration changes at once, and the host is told after
				isolations.set(resource.toString(), String(partial.isolation));
				if (partial.isolation === 'worktree' && (applyFails === 'configGone' || applyFails === 'isolationGone')) {
					config = applyFails === 'configGone' ? 'gone' : 'noIsolation';
				}
				await applied?.p;
				if (applyFails && (partial.isolation === 'worktree' || applyFails === 'rollbackToo')) {
					throw new Error(`cannot change to ${partial.isolation}`);
				}
				return resource;
			},
		}));
		// An earlier chat of the agent host, an hour ago, in `firstChatIn`
		const earlier = options.firstChatIn && upcastPartial<IAgentSession>({
			resource: URI.from({ scheme: SessionType.AgentHostCopilot, path: `/earlier-${draftCount}` }),
			providerType: SessionType.AgentHostCopilot,
			isArchived: () => options.firstChatArchived === true,
			metadata: { workingDirectoryPath: options.firstChatIn.fsPath },
			timing: { created: NOW - 3 * HOUR, lastRequestStarted: NOW - 2 * HOUR, lastRequestEnded: NOW - HOUR },
		});
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			model: upcastPartial<IAgentSessionsService['model']>({ sessions: earlier ? [earlier] : [] }),
		}));
		instantiationService.stub(IAgentHostWorktreeSessionSources, disposables.add(new AgentHostWorktreeSessionSources()));
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		const warnings: string[] = [];
		const errorMessages: string[] = [];
		const notifications = new TestNotificationService();
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
			warn: (message: unknown) => { warnings.push(String(message)); return notifications.warn(''); },
			error: (message: unknown) => { errorMessages.push(String(message)); return notifications.error(''); },
		}));
		// The worktree control of each chat input, which the callout points at
		const controls = new Map<string, HTMLElement>();
		const controlOf = (resource?: URI) => {
			const key = resource?.toString() ?? '';
			let control = controls.get(key);
			if (!control) {
				const domNode = append(mainWindow.document.body, $('div'));
				disposables.add({ dispose: () => domNode.remove() });
				control = append(domNode, $('.action-item', undefined, 'New Worktree'));
				disposables.add(registerWorktreeControl(control));
				controls.set(key, control);
			}
			return control;
		};
		const control = controlOf();
		// The chat input showing each new chat, until it is closed
		const widgets = new Map<string, IChatWidget | undefined>();
		const widgetOf = (resource: URI) => {
			const key = resource.toString();
			if (!widgets.has(key)) {
				widgets.set(key, upcastPartial<IChatWidget>({ domNode: controlOf(resource).parentElement! }));
			}
			return widgets.get(key);
		};
		const close = (resource: URI) => { widgets.set(resource.toString(), undefined); };
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ getWidgetBySessionResource: widgetOf }));
		// The callout: the control it points at, and the user's answers in turn, each held until its `held` completes where given
		const asked: { readonly onControl: boolean }[] = [];
		const askedOn: (HTMLElement | undefined)[] = [];
		const answers: { readonly answer: Answer; readonly held?: DeferredPromise<void> }[] = [];
		let answer: Answer = 'continue';
		// As the onboarding service does, a run of a scenario that is running already joins it
		let running: Promise<OnboardingOutcome> | undefined;
		instantiationService.stub(IOnboardingScenarioService, upcastPartial<IOnboardingScenarioService>({
			runScenario: (id: string) => running ??= run(id).finally(() => { running = undefined; }),
		}));
		const run = async (id: string): Promise<OnboardingOutcome> => {
			const step = (onboardingScenarioRegistry.getScenario(id)!.presentation.payload as ISpotlightPayload).steps[0];
			const element = resolveOnboardingTarget(mainWindow, step.targetId)?.element;
			asked.push({ onControl: [...controls.values()].some(control => control === element) });
			askedOn.push(element);
			const next = answers.shift() ?? { answer };
			await next.held?.p;
			switch (next.answer) {
				case 'useWorktree':
					await step.primaryAction!.run(undefined!);
					return OnboardingOutcome.Completed;
				case 'continue':
				case 'escape':
					return OnboardingOutcome.Skipped;
				case 'abort':
					return OnboardingOutcome.Aborted;
			}
		};
		const submit = new ChatSubmitRequestHandlerService();
		instantiationService.stub(IChatSubmitRequestHandlerService, submit);
		const service = disposables.add(instantiationService.createInstance(AgentHostWorktreeSendChoice, () => NOW));

		/** The requests sent, by the isolation each new chat then had; and those kept in the input, neither sent nor cleared. */
		const sent: string[] = [];
		const kept: URI[] = [];
		const newDraft = () => URI.from({ scheme: SessionType.AgentHostCopilot, path: `/untitled-${++draftCount}` });
		/** Sends the first request of `draft`, as ChatWidget does through its submit handlers. */
		const send = async (draft: URI) => {
			const result = await submit.tryHandle({ sessionResource: draft, input: 'hello' });
			if (result === ChatSubmitRequestCancelled) {
				kept.push(draft);
			} else if (!result) {
				sent.push(isolations.get(draft.toString()) ?? 'folder');
			}
		};
		/** Answers the next callout with `value`, held until `held` completes where given; and the later ones too, unless queued again. */
		const setAnswer = (value: Answer, held?: DeferredPromise<void>) => { answer = value; answers.push({ answer: value, held }); };
		const holdApply = (held: DeferredPromise<void> | undefined) => { applied = held; };
		const failApply = (when: NonNullable<typeof applyFails>) => { applyFails = when; };
		/** Picks where `draft` works in its folder chip, as the user does. */
		const pick = (draft: URI, inWorktree: boolean) => {
			const choices = instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => draft);
			return choices.setNewWorktree(inWorktree).finally(() => choices.dispose());
		};
		// Its contributions are global, one window at a time
		const isolationOf = (draft: URI) => isolations.get(draft.toString()) ?? 'folder';
		return { newDraft, send, sent, kept, errorMessages, widgetOf, earlier: earlier?.resource, asked, askedOn, setAnswer, close, isolationOf, holdApply, failApply, pick, warnings, service, control, controlOf, dispose: () => disposables.dispose() };
	}

	test('asks of a new chat in the folder only after another chat of the agent host was active in the folder itself within the last day', () => {
		const draft = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-draft' });
		const session = (overrides: Partial<IWorktreeSendChoiceSession> = {}): IWorktreeSendChoiceSession => ({
			resource: URI.from({ scheme: SessionType.AgentHostCopilot, path: '/other' }),
			isAgentHost: true, isArchived: false, workingDirectory: primary, lastActivity: NOW - 2 * HOUR,
			...overrides,
		});
		const recent = (...sessions: IWorktreeSendChoiceSession[]) => isRecentChatInFolder(sessions, primary, draft, NOW);

		assert.deepStrictEqual({
			twoHoursAgo: recent(session()),
			dayAgoExactly: recent(session({ lastActivity: NOW - WORKTREE_SEND_CHOICE_RECENT_MS })),
			justOverADay: recent(session({ lastActivity: NOW - WORKTREE_SEND_CHOICE_RECENT_MS - 1 })),
			twentyFiveHours: recent(session({ lastActivity: NOW - 25 * HOUR })),
			worktreeOnly: recent(session({ workingDirectory: worktree })),
			archivedOnly: recent(session({ isArchived: true })),
			localCopilotOnly: recent(session({ isAgentHost: false })),
			draftItself: recent(session({ resource: draft })),
			unknownFolder: recent(session({ workingDirectory: undefined })),
			oneOfMany: recent(session({ workingDirectory: worktree }), session({ isArchived: true }), session()),
		}, {
			twoHoursAgo: true,
			// The bound is included
			dayAgoExactly: true,
			justOverADay: false,
			twentyFiveHours: false,
			worktreeOnly: false,
			archivedOnly: false,
			localCopilotOnly: false,
			draftItself: false,
			unknownFolder: false,
			oneOfMany: true,
		});
	});

	test('reads agent sessions as the predicate does: where they work, by the given lookup else their metadata, and their last activity', () => {
		const at = (path: string, overrides: Partial<IAgentSession> = {}) => upcastPartial<IAgentSession>({
			resource: URI.from({ scheme: SessionType.AgentHostCopilot, path }), providerType: SessionType.AgentHostCopilot, isArchived: () => false,
			metadata: { worktreePath: '/work/vscode.worktrees/feature', workingDirectoryPath: '/work/vscode' },
			timing: { created: 1, lastRequestStarted: 2, lastRequestEnded: 3 }, ...overrides,
		});
		const sessions = [
			at('/ended'),
			at('/started', { metadata: { workingDirectoryPath: '/work/vscode' }, timing: { created: 1, lastRequestStarted: 2, lastRequestEnded: undefined } }),
			at('/new', { providerType: 'local', isArchived: () => true, metadata: undefined, timing: { created: 1, lastRequestStarted: undefined, lastRequestEnded: undefined } }),
			at('/fromSource'),
		];
		const read = toWorktreeSendChoiceSessions(sessions, resource => resource.path === '/fromSource' ? primary : undefined)
			.map(session => ({ path: session.resource.path, isAgentHost: session.isAgentHost, isArchived: session.isArchived, workingDirectory: session.workingDirectory?.path, lastActivity: session.lastActivity }));

		assert.deepStrictEqual(read, [
			// Its worktree, over the folder it is of
			{ path: '/ended', isAgentHost: true, isArchived: false, workingDirectory: '/work/vscode.worktrees/feature', lastActivity: 3 },
			{ path: '/started', isAgentHost: true, isArchived: false, workingDirectory: '/work/vscode', lastActivity: 2 },
			{ path: '/new', isAgentHost: false, isArchived: true, workingDirectory: undefined, lastActivity: 1 },
			{ path: '/fromSource', isAgentHost: true, isArchived: false, workingDirectory: '/work/vscode', lastActivity: 3 },
		]);
	});

	test('asks as the first request of a new chat in the folder is sent, after a chat worked in the folder, and sends it once, in a new worktree or in the folder', async () => {
		const results: Record<string, unknown> = {};
		for (const answer of ['useWorktree', 'continue', 'escape'] as const) {
			const window = createWindow({ firstChatIn: primary });
			window.setAnswer(answer);
			await window.send(window.newDraft());
			results[answer] = { asked: window.asked, sent: window.sent };
			window.dispose();
		}

		assert.deepStrictEqual(results, {
			useWorktree: { asked: [{ onControl: true }], sent: ['worktree'] },
			continue: { asked: [{ onControl: true }], sent: ['folder'] },
			escape: { asked: [{ onControl: true }], sent: ['folder'] },
		});
	});

	test('asks once, and applies the answer to the later new chats without asking', async () => {
		const results: Record<string, unknown> = {};
		for (const answer of ['useWorktree', 'continue'] as const) {
			const window = createWindow({ firstChatIn: primary });
			window.setAnswer(answer);
			await window.send(window.newDraft());
			await window.send(window.newDraft());
			results[answer] = { asked: window.asked.length, sent: window.sent };
			window.dispose();
		}

		assert.deepStrictEqual(results, {
			useWorktree: { asked: 1, sent: ['worktree', 'worktree'] },
			continue: { asked: 1, sent: ['folder', 'folder'] },
		});
	});

	test('a request sent again while it asks is sent once, as answered', async () => {
		const window = createWindow({ firstChatIn: primary });
		const held = new DeferredPromise<void>();
		window.setAnswer('useWorktree', held);
		const draft = window.newDraft();
		const first = window.send(draft);
		await Promise.resolve();
		await window.send(draft);
		held.complete();
		await first;

		assert.deepStrictEqual({ asked: window.asked.length, sent: window.sent }, { asked: 1, sent: ['worktree'] });
	});

	test('does not ask where the user chose where the chat works, it cannot work in a new worktree, AI features are off, or no chat of the window worked in the folder', async () => {
		const asked = async (options: Parameters<typeof createWindow>[0], picked?: boolean) => {
			const window = createWindow(options);
			window.setAnswer('useWorktree');
			const draft = window.newDraft();
			if (picked !== undefined) {
				await window.pick(draft, picked);
			}
			await window.send(draft);
			window.dispose();
			return { asked: window.asked.length, sent: window.sent };
		};

		const askedOf = async (resource: URI) => {
			const window = createWindow({ firstChatIn: primary });
			window.setAnswer('useWorktree');
			await window.send(resource);
			window.dispose();
			return { asked: window.asked.length, sent: window.sent };
		};

		assert.deepStrictEqual({
			pickedFolder: await asked({ firstChatIn: primary }, false),
			noWorktreeSupport: await asked({ firstChatIn: primary, isolations: ['folder'] }),
			aiOff: await asked({ firstChatIn: primary, ai: false }),
			noRecentChatInFolder: await asked({}),
			chatAreaSession: await askedOf(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/3f2a6c1e-chat-area' })),
			firstChatInWorktree: await asked({ firstChatIn: worktree }),
		}, {
			pickedFolder: { asked: 0, sent: ['folder'] },
			noWorktreeSupport: { asked: 0, sent: ['folder'] },
			aiOff: { asked: 0, sent: ['folder'] },
			noRecentChatInFolder: { asked: 0, sent: ['folder'] },
			// The chat area composer's session, which asks on its own
			chatAreaSession: { asked: 0, sent: ['folder'] },
			firstChatInWorktree: { asked: 0, sent: ['folder'] },
		});
	});

	test('tells another chat surface where its new chat works: asked once on its control, then as remembered without asking', async () => {
		const window = createWindow({});
		window.setAnswer('useWorktree');
		const first = await window.service.askWorktreeOnSend(window.control);
		window.setAnswer('continue');
		const second = await window.service.askWorktreeOnSend(window.control);
		const asked = window.asked;
		window.dispose();

		assert.deepStrictEqual({ first, second, asked }, { first: 'worktree', second: 'worktree', asked: [{ onControl: true }] });
	});

	test('a request sent again while its new worktree is applied, or the remembered choice is, is sent once', async () => {
		const sendTwice = async (remembered: boolean) => {
			const window = createWindow({ firstChatIn: primary });
			window.setAnswer('useWorktree');
			if (remembered) {
				await window.send(window.newDraft());
			}
			const applying = new DeferredPromise<void>();
			window.holdApply(applying);
			const draft = window.newDraft();
			const first = window.send(draft);
			await timeout(0);
			await window.send(draft);
			window.holdApply(undefined);
			applying.complete();
			await first;
			window.dispose();
			return { asked: window.asked.length, sent: window.sent };
		};

		assert.deepStrictEqual({
			asked: await sendTwice(false),
			remembered: await sendTwice(true),
		}, {
			asked: { asked: 1, sent: ['worktree'] },
			remembered: { asked: 1, sent: ['worktree', 'worktree'] },
		});
	});

	test('remembers only an answer the user gave: where the callout ends without one, it sends in the folder and asks next time', async () => {
		const window = createWindow({ firstChatIn: primary });
		window.setAnswer('abort');
		await window.send(window.newDraft());
		window.setAnswer('useWorktree');
		await window.send(window.newDraft());
		await window.send(window.newDraft());
		window.dispose();

		assert.deepStrictEqual({ asked: window.asked.length, sent: window.sent }, { asked: 2, sent: ['folder', 'worktree', 'worktree'] });
	});

	test('asks of new chats sent together one after another, each on its own control with its own answer', async () => {
		const window = createWindow({ firstChatIn: primary });
		const held = new DeferredPromise<void>();
		window.setAnswer('abort', held);
		window.setAnswer('useWorktree');
		const first = window.newDraft();
		const second = window.newDraft();
		const sending = [window.send(first), window.send(second)];
		await timeout(0);
		const askedWhileHeld = window.asked.length;
		held.complete();
		await Promise.all(sending);
		const askedOn = window.askedOn.map(element => element === window.controlOf(first) ? 'first' : element === window.controlOf(second) ? 'second' : 'other');
		window.dispose();

		assert.deepStrictEqual({ askedWhileHeld, askedOn, sent: window.sent }, { askedWhileHeld: 1, askedOn: ['first', 'second'], sent: ['folder', 'worktree'] });
	});

	test('sends in the folder, with a warning, only where a new worktree that cannot be applied is undone; else keeps the request in the input', async () => {
		const results: Record<string, unknown> = {};
		const handler = errorHandler.getUnexpectedErrorHandler();
		try {
			for (const when of ['beforeChange', 'afterChange', 'rollbackToo', 'rollbackNoop', 'configGone', 'isolationGone'] as const) {
				const errors: unknown[] = [];
				errorHandler.setUnexpectedErrorHandler(error => errors.push(error));
				const window = createWindow({ firstChatIn: primary });
				window.setAnswer('useWorktree');
				window.failApply(when);
				await window.send(window.newDraft());
				window.dispose();
				results[when] = { sent: window.sent, kept: window.kept.length, warnings: window.warnings.length, errorMessages: window.errorMessages.length, errors: errors.length };
			}
		} finally {
			errorHandler.setUnexpectedErrorHandler(handler);
		}

		assert.deepStrictEqual(results, {
			beforeChange: { sent: ['folder'], kept: 0, warnings: 1, errorMessages: 0, errors: 1 },
			// Undone: back to the folder
			afterChange: { sent: ['folder'], kept: 0, warnings: 1, errorMessages: 0, errors: 1 },
			// Not undone: where it works is not known, so it is not sent
			rollbackToo: { sent: [], kept: 1, warnings: 0, errorMessages: 1, errors: 2 },
			// Back to the folder did nothing, or where it works can no longer be read
			rollbackNoop: { sent: [], kept: 1, warnings: 0, errorMessages: 1, errors: 1 },
			configGone: { sent: [], kept: 1, warnings: 0, errorMessages: 1, errors: 1 },
			isolationGone: { sent: [], kept: 1, warnings: 0, errorMessages: 1, errors: 1 },
		});
	});

	test('does not ask where the worktree control is hidden or gone, and remembers nothing', async () => {
		const results: Record<string, unknown> = {};
		for (const how of ['hidden', 'removed'] as const) {
			const window = createWindow({ firstChatIn: primary });
			window.setAnswer('useWorktree');
			const draft = window.newDraft();
			const control = window.controlOf(draft);
			window.widgetOf(draft);
			if (how === 'hidden') {
				control.style.display = 'none';
			} else {
				control.remove();
			}
			await window.send(draft);
			await window.send(window.newDraft());
			window.dispose();
			results[how] = { asked: window.asked.length, sent: window.sent };
		}

		assert.deepStrictEqual(results, {
			// The next new chat, whose control shows, is asked
			hidden: { asked: 1, sent: ['folder', 'worktree'] },
			removed: { asked: 1, sent: ['folder', 'worktree'] },
		});
	});

	test('another chat surface\'s ask remembers only an answer the user gave, and waits for a callout shown before, with its own control and answer', async () => {
		const window = createWindow({ firstChatIn: primary });
		window.setAnswer('abort');
		const aborted = await window.service.askWorktreeOnSend(window.control);
		const held = new DeferredPromise<void>();
		window.setAnswer('continue', held);
		window.setAnswer('useWorktree');
		const draft = window.newDraft();
		const sending = window.send(draft);
		await timeout(0);
		const other = window.controlOf(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/chat-area' }));
		const asking = window.service.askWorktreeOnSend(other);
		await timeout(0);
		const askedWhileHeld = window.asked.length;
		held.complete();
		await sending;
		const answered = await asking;
		const askedOn = window.askedOn.map(element => element === window.controlOf(draft) ? 'draft' : element === other ? 'other' : element === window.control ? 'control' : 'unknown');
		window.dispose();

		// The Chat view's Continue in Folder is remembered first, so the later ask applies it without a callout
		assert.deepStrictEqual({ aborted, askedWhileHeld, askedOn, sent: window.sent, answered }, { aborted: 'folder', askedWhileHeld: 2, askedOn: ['control', 'draft'], sent: ['folder'], answered: 'folder' });
	});

	test('does not apply a new worktree to a new chat whose chat input closed while it asked', async () => {
		const window = createWindow({ firstChatIn: primary });
		const held = new DeferredPromise<void>();
		window.setAnswer('useWorktree', held);
		const draft = window.newDraft();
		const sending = window.send(draft);
		await timeout(0);
		window.close(draft);
		held.complete();
		await sending;
		const isolation = window.isolationOf(draft);
		window.dispose();

		assert.deepStrictEqual({ asked: window.asked.length, isolation }, { asked: 1, isolation: 'folder' });
	});

	test('tells another chat surface whether a chat was active in a folder within the last day, not counting its own new chat', () => {
		const archived = createWindow({ firstChatIn: primary, firstChatArchived: true });
		const archivedOnly = archived.service.isRecentChatInFolder(primary, archived.newDraft());
		archived.dispose();
		const window = createWindow({ firstChatIn: primary });
		const service: IAgentHostWorktreeSendChoiceService = window.service;
		const results = {
			inFolder: service.isRecentChatInFolder(primary, window.newDraft()),
			otherFolder: service.isRecentChatInFolder(worktree, window.newDraft()),
			archivedOnly,
			draftItself: service.isRecentChatInFolder(primary, window.earlier!),
		};
		window.dispose();

		assert.deepStrictEqual(results, { inFolder: true, otherFolder: false, archivedOnly: false, draftItself: false });
	});

	test('its callout offers Use New Worktree and Continue in Folder', () => {
		createWindow({});
		const step = (onboardingScenarioRegistry.getScenario(AGENT_HOST_WORKTREE_SEND_CHOICE_ID)!.presentation.payload as ISpotlightPayload).steps[0];
		assert.deepStrictEqual({ title: step.title, primary: step.primaryAction?.label, end: step.endTourLabel, focusEndTour: step.focusEndTour }, {
			title: 'Work in Parallel', primary: 'Use New Worktree', end: 'Continue in Folder', focusEndTour: undefined,
		});
	});
});
