/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IModelContentChangedEvent } from '../../../../../../../editor/common/textModelEvents.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/virtualScheduling/index.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';
import { resolveOnboardingTarget } from '../../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload } from '../../../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenarioService } from '../../../../../onboarding/common/onboardingScenarioService.js';
import { IAgentHostNewSessionFolderService } from '../../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { ChatAgentHostFolderChipVisible, ChatAgentHostNewWorktreeToggleVisible, registerWorktreeControl } from '../../../../browser/agentSessions/agentHost/agentHostNewWorktreeToggle.js';
import { AGENT_HOST_WORKTREE_HINT_ID, AgentHostWorktreeHint } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeHint.js';
import { AgentHostWorktreeSessionSources, IAgentHostWorktreeSessionSources } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeSessionSources.js';
import { IAgentSession } from '../../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../browser/agentSessions/agentSessionsService.js';
import { IChatWidget, IChatWidgetService } from '../../../../browser/chat.js';
import { IChatViewHostService, IChatViewHostShownSession } from '../../../../browser/chatViewHost.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../common/constants.js';

suite('Agent host worktree hint', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/vscode');
	const worktree = URI.file('/work/vscode.worktrees/feature');
	const started = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/first-chat' });
	const draft = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-second' });

	/** The hint in a window whose folder is the primary, where a chat that a first request started works in `firstChatIn`. */
	function createHint(options: { readonly firstChatIn: URI; readonly control: 'checkbox' | 'chip' | 'none'; readonly shown?: boolean }) {
		// Its own, as target providers are global: one hint at a time
		const disposables = store.add(new DisposableStore());
		const instantiationService = disposables.add(new TestInstantiationService());
		const shownSession = observableValue<IChatViewHostShownSession | undefined>('shown', undefined);
		const onDidChangeSessions = disposables.add(new Emitter<void>());
		const workingDirectories = new Map<string, string>();
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ shownSession }));
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			getSession: (resource: URI) => { const path = workingDirectories.get(resource.toString()); return path ? upcastPartial<IAgentSession>({ metadata: { workingDirectoryPath: path } }) : undefined; },
			model: upcastPartial<IAgentSessionsService['model']>({ onDidChangeSessions: onDidChangeSessions.event }),
		}));
		instantiationService.stub(IAgentHostWorktreeSessionSources, disposables.add(new AgentHostWorktreeSessionSources()));
		instantiationService.stub(IAgentHostNewSessionFolderService, upcastPartial<IAgentHostNewSessionFolderService>({ onDidChangeFolder: Event.None, getFolder: () => undefined, isNoWorkspace: () => false }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<IWorkspace>({ uri: primary, folders: [upcastPartial<IWorkspaceFolder>({ uri: primary })] }) }));
		const shown = { value: options.shown ?? false };
		instantiationService.stub(IOnboardingScenarioService, upcastPartial<IOnboardingScenarioService>({ hasBeenShown: () => shown.value }));

		// The Chat view's new chat, whose input shows the New Worktree checkbox or the folder chip
		const domNode = append(mainWindow.document.body, $('div'));
		disposables.add({ dispose: () => domNode.remove() });
		const control = options.control === 'checkbox' ? append(domNode, $('.action-item.checkbox-action-item.chat-input-checkbox-item', undefined, 'New Worktree'))
			: options.control === 'chip' ? append(domNode, $('.action-item', undefined, 'vscode'))
				: undefined;
		if (control) {
			// As the checkbox and the chip do as they render
			disposables.add(registerWorktreeControl(control));
		}
		const keys = disposables.add(new ContextKeyService(new TestConfigurationService()));
		keys.createKey(ChatAgentHostNewWorktreeToggleVisible.key, options.control === 'checkbox');
		keys.createKey(ChatAgentHostFolderChipVisible.key, options.control === 'chip');
		const onDidChangeInput = disposables.add(new Emitter<IModelContentChangedEvent>());
		let input = '';
		const widget = upcastPartial<IChatWidget>({
			location: ChatAgentLocation.Chat,
			domNode,
			viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: draft, model: upcastPartial<NonNullable<IChatWidget['viewModel']>['model']>({ getRequests: () => [] }) }),
			onDidChangeViewModel: Event.None,
			inputEditor: upcastPartial<IChatWidget['inputEditor']>({ onDidChangeModelContent: onDidChangeInput.event }),
			scopedContextKeyService: keys,
			getInput: () => input,
		});
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ getAllWidgets: () => [widget], onDidAddWidget: Event.None, onDidRemoveWidget: Event.None }));
		const hint = disposables.add(instantiationService.createInstance(AgentHostWorktreeHint));

		const settle = () => new Promise<void>(resolve => setTimeout(resolve, AgentHostWorktreeHint.SETTLE_DELAY_MS + 1));
		/** The first chat: a first request started it, and the host reports where it works. */
		const startFirstChat = async () => {
			shownSession.set({ resource: started, reason: 'commit' }, undefined);
			workingDirectories.set(started.toString(), options.firstChatIn.fsPath);
			onDidChangeSessions.fire();
			await settle();
		};
		const state = () => {
			const target = resolveOnboardingTarget(mainWindow, (onboardingScenarioRegistry.getScenario(AGENT_HOST_WORKTREE_HINT_ID)!.presentation.payload as ISpotlightPayload).steps[0].targetId);
			return { signal: hint.signal.get(), target: target?.element === control };
		};
		const type = async (text: string) => {
			input = text;
			onDidChangeInput.fire(upcastPartial<IModelContentChangedEvent>({}));
			await settle();
		};
		return { startFirstChat, state, type, shown, settle, onDidChangeSessions, dispose: () => disposables.dispose() };
	}

	test('shows once on the worktree control of a new chat in the folder after a chat worked in the folder, not while the user types', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const checkbox = createHint({ firstChatIn: primary, control: 'checkbox' });
		await checkbox.settle();
		const beforeFirstChat = checkbox.state();
		await checkbox.startFirstChat();
		const onCheckbox = checkbox.state();
		await checkbox.type('fix the');
		const whileTyping = checkbox.state();
		await checkbox.type('');
		const emptyAgain = checkbox.state();
		// The engine ran it, which it records for the profile
		checkbox.shown.value = true;
		checkbox.onDidChangeSessions.fire();
		await checkbox.settle();
		const afterShown = checkbox.state();
		checkbox.dispose();

		const chip = createHint({ firstChatIn: primary, control: 'chip' });
		await chip.startFirstChat();

		assert.deepStrictEqual({ beforeFirstChat, onCheckbox, whileTyping, emptyAgain, afterShown, onChip: chip.state() }, {
			beforeFirstChat: { signal: false, target: false },
			onCheckbox: { signal: true, target: true },
			whileTyping: { signal: false, target: false },
			emptyAgain: { signal: true, target: true },
			afterShown: { signal: false, target: false },
			onChip: { signal: true, target: true },
		});
	}));

	test('does not show after a chat that worked in a worktree, once it was shown before, or without a worktree control', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const inWorktree = createHint({ firstChatIn: worktree, control: 'checkbox' });
		await inWorktree.startFirstChat();
		const inWorktreeSignal = inWorktree.state().signal;
		inWorktree.dispose();
		const shownBefore = createHint({ firstChatIn: primary, control: 'checkbox', shown: true });
		await shownBefore.startFirstChat();
		const shownBeforeSignal = shownBefore.state().signal;
		shownBefore.dispose();
		const noControl = createHint({ firstChatIn: primary, control: 'none' });
		await noControl.startFirstChat();

		assert.deepStrictEqual({ inWorktree: inWorktreeSignal, shownBefore: shownBeforeSignal, noControl: noControl.state().signal }, {
			inWorktree: false,
			shownBefore: false,
			noControl: false,
		});
	}));

	test('runs only with AI features and worktree support on, in a local editor window', () => {
		// Registers the scenario
		createHint({ firstChatIn: primary, control: 'checkbox' });
		const when = onboardingScenarioRegistry.getScenario(AGENT_HOST_WORKTREE_HINT_ID)!.when!;
		const eligible = (values: { readonly ai?: boolean; readonly worktree?: boolean; readonly sessionsWindow?: boolean; readonly remote?: string }) => {
			const context = store.add(new ContextKeyService(new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: values.worktree ?? true })));
			context.createKey(ChatContextKeys.enabled.key, values.ai ?? true);
			context.createKey('isSessionsWindow', values.sessionsWindow ?? false);
			context.createKey('remoteName', values.remote ?? '');
			return context.contextMatchesRules(when);
		};

		assert.deepStrictEqual({
			eligible: eligible({}),
			aiOff: eligible({ ai: false }),
			worktreeOff: eligible({ worktree: false }),
			agentsWindow: eligible({ sessionsWindow: true }),
			remote: eligible({ remote: 'ssh-remote' }),
		}, { eligible: true, aiOff: false, worktreeOff: false, agentsWindow: false, remote: false });
	});
});
