/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
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
import { AGENT_HOST_WORKTREE_SEND_CHOICE_ID, AgentHostWorktreeSendChoice, isRecentChatInFolder, IWorktreeSendChoiceSession, WORKTREE_SEND_CHOICE_RECENT_MS } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeSendChoice.js';
import { AgentHostWorktreeSessionSources, IAgentHostWorktreeSessionSources } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeSessionSources.js';
import { IAgentSession } from '../../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../browser/agentSessions/agentSessionsService.js';
import { IChatWidget, IChatWidgetService } from '../../../../browser/chat.js';
import { ChatSubmitRequestHandlerService, IChatSubmitRequestHandlerService } from '../../../../browser/chatSubmitRequestHandlerService.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';

type Answer = 'useWorktree' | 'continue' | 'escape';

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

	function createWindow(options: { readonly firstChatIn?: URI; readonly isolations?: readonly string[]; readonly ai?: boolean }) {
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
		// The isolation of each new chat, as its configuration has it
		const isolations = new Map<string, string>();
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, upcastPartial<IAgentHostUntitledProvisionalSessionService>({
			onDidChange: Event.None,
			getResolvedConfig: (resource: URI) => ({ schema: { type: 'object', properties: { isolation: { type: 'string', title: 'Isolation', enum: [...options.isolations ?? ['folder', 'worktree']] } } }, values: { isolation: isolations.get(resource.toString()) ?? 'folder' } }),
			getPreparedSessionConfig: () => undefined,
			applyConfigChange: async (resource: URI, _provider: string, _folder: URI | undefined, partial: Record<string, unknown>) => {
				isolations.set(resource.toString(), String(partial.isolation));
				return resource;
			},
		}));
		// An earlier chat of the agent host, an hour ago, in `firstChatIn`
		const earlier = options.firstChatIn && upcastPartial<IAgentSession>({
			resource: URI.from({ scheme: SessionType.AgentHostCopilot, path: `/earlier-${draftCount}` }),
			providerType: SessionType.AgentHostCopilot,
			isArchived: () => false,
			metadata: { workingDirectoryPath: options.firstChatIn.fsPath },
			timing: { created: NOW - 3 * HOUR, lastRequestStarted: NOW - 2 * HOUR, lastRequestEnded: NOW - HOUR },
		});
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			model: upcastPartial<IAgentSessionsService['model']>({ sessions: earlier ? [earlier] : [] }),
		}));
		instantiationService.stub(IAgentHostWorktreeSessionSources, disposables.add(new AgentHostWorktreeSessionSources()));
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		const warnings: string[] = [];
		const notifications = new TestNotificationService();
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ warn: (message: unknown) => { warnings.push(String(message)); return notifications.warn(''); } }));
		// The chat input's worktree control, which the callout points at
		const domNode = append(mainWindow.document.body, $('div'));
		disposables.add({ dispose: () => domNode.remove() });
		const control = append(domNode, $('.action-item', undefined, 'New Worktree'));
		disposables.add(registerWorktreeControl(control));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ getWidgetBySessionResource: () => upcastPartial<IChatWidget>({ domNode }) }));
		// The callout: what it points at, and the user's answer, held until `answered` completes where given
		const asked: { readonly onControl: boolean }[] = [];
		let answer: Answer = 'continue';
		let answered: DeferredPromise<void> | undefined;
		instantiationService.stub(IOnboardingScenarioService, upcastPartial<IOnboardingScenarioService>({
			runScenario: async (id: string) => {
				const step = (onboardingScenarioRegistry.getScenario(id)!.presentation.payload as ISpotlightPayload).steps[0];
				asked.push({ onControl: resolveOnboardingTarget(mainWindow, step.targetId)?.element === control });
				await answered?.p;
				if (answer === 'useWorktree') {
					await step.primaryAction!.run(undefined!);
					return OnboardingOutcome.Completed;
				}
				return answer === 'continue' ? OnboardingOutcome.Skipped : OnboardingOutcome.Dismissed;
			},
		}));
		const submit = new ChatSubmitRequestHandlerService();
		instantiationService.stub(IChatSubmitRequestHandlerService, submit);
		const service = disposables.add(instantiationService.createInstance(AgentHostWorktreeSendChoice, () => NOW));

		/** The requests sent, by the isolation each new chat then had. */
		const sent: string[] = [];
		const newDraft = () => URI.from({ scheme: SessionType.AgentHostCopilot, path: `/untitled-${++draftCount}` });
		/** Sends the first request of `draft`, as ChatWidget does through its submit handlers. */
		const send = async (draft: URI) => {
			if (!await submit.tryHandle({ sessionResource: draft, input: 'hello' })) {
				sent.push(isolations.get(draft.toString()) ?? 'folder');
			}
		};
		const setAnswer = (value: Answer, held?: DeferredPromise<void>) => { answer = value; answered = held; };
		/** Picks where `draft` works in its folder chip, as the user does. */
		const pick = (draft: URI, inWorktree: boolean) => {
			const choices = instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => draft);
			return choices.setNewWorktree(inWorktree).finally(() => choices.dispose());
		};
		// Its contributions are global, one window at a time
		return { newDraft, send, sent, asked, setAnswer, pick, warnings, service, control, dispose: () => disposables.dispose() };
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

		assert.deepStrictEqual({
			pickedFolder: await asked({ firstChatIn: primary }, false),
			noWorktreeSupport: await asked({ firstChatIn: primary, isolations: ['folder'] }),
			aiOff: await asked({ firstChatIn: primary, ai: false }),
			noRecentChatInFolder: await asked({}),
			firstChatInWorktree: await asked({ firstChatIn: worktree }),
		}, {
			pickedFolder: { asked: 0, sent: ['folder'] },
			noWorktreeSupport: { asked: 0, sent: ['folder'] },
			aiOff: { asked: 0, sent: ['folder'] },
			noRecentChatInFolder: { asked: 0, sent: ['folder'] },
			firstChatInWorktree: { asked: 0, sent: ['folder'] },
		});
	});

	test('tells another chat surface where its new chat works: asked once on its control, then as remembered, and the folder without a control to ask on', async () => {
		const window = createWindow({});
		const draft = window.newDraft();
		const withoutControl = await window.service.runWorktreeSendChoice(draft, undefined);
		window.setAnswer('useWorktree');
		const first = await window.service.runWorktreeSendChoice(draft, window.control);
		window.setAnswer('continue');
		const second = await window.service.runWorktreeSendChoice(window.newDraft(), window.control);
		const asked = window.asked.length;
		window.dispose();

		assert.deepStrictEqual({ withoutControl, first, second, asked }, { withoutControl: 'folder', first: 'worktree', second: 'worktree', asked: 1 });
	});

	test('its callout offers Use New Worktree and Continue in Folder', () => {
		createWindow({});
		const step = (onboardingScenarioRegistry.getScenario(AGENT_HOST_WORKTREE_SEND_CHOICE_ID)!.presentation.payload as ISpotlightPayload).steps[0];
		assert.deepStrictEqual({ title: step.title, primary: step.primaryAction?.label, end: step.endTourLabel, focusEndTour: step.focusEndTour }, {
			title: 'Work in Parallel', primary: 'Use New Worktree', end: 'Continue in Folder', focusEndTour: undefined,
		});
	});
});
