/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentHostFilterEntry, IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { COMPARE_AGENTS_ENABLED_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../../common/constants.js';
import { AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING } from '../../browser/responseSelectionSideChatController.js';
import { SESSION_ARCHIVE_NUDGE_SETTING } from '../../browser/sessionArchiveNudge.js';
import { SessionComparisonAccessibleView, SessionsChatAccessibilityHelp } from '../../browser/sessionsChatAccessibilityHelp.js';
import { SessionsListPromoteNewChatActionContext } from '../../../../common/contextkeys.js';
import { SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode } from '../../../../common/sessionConfig.js';

suite('SessionsChatAccessibilityHelp', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function stubContextKeyService(instantiationService: TestInstantiationService, configuration: TestConfigurationService, promoteNewChatAction = false): void {
		const contextKeyService = store.add(new ContextKeyService(configuration));
		SessionsListPromoteNewChatActionContext.bindTo(contextKeyService).set(promoteNewChatAction);
		instantiationService.stub(IContextKeyService, contextKeyService);
	}

	test('describes picker shortcuts only when the unified workspace picker is enabled', () => {
		const getPickerHelp = (enabled: boolean) => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({ [UNIFIED_WORKSPACE_PICKER_SETTING]: enabled });
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			return store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent()
				.split('\n')
				.find(line => line.includes('open and focus the workspace picker'));
		};
		const enabledHelp = getPickerHelp(true);

		assert.deepStrictEqual({
			disabled: getPickerHelp(false) !== undefined,
			enabled: enabledHelp !== undefined,
			contextMenuKeybinding: enabledHelp?.includes('<keybinding:editor.action.showContextMenu>'),
			mouseOnly: enabledHelp?.includes('Right-click'),
		}, {
			disabled: false,
			enabled: true,
			contextMenuKeybinding: true,
			mouseOnly: false,
		});
	});

	for (const sessionCreationProviderId of [undefined, 'creation']) {
		test(`describes repository creation only for a creation host (provider: ${sessionCreationProviderId})`, () => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService();
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, {
				selectedHost: upcastPartial<IAgentHostFilterEntry>({ sessionCreationProviderId }),
			});
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent();

			assert.deepStrictEqual({
				browserRepositorySearch: content.includes('When choosing a GitHub repository in the browser, search or enter a GitHub URL or owner/repository.'),
				repositoryCreation: content.includes('Open Select Repository to choose its repository.'),
				firstSend: content.includes('Selecting a repository does not start an environment; sending your first message does.'),
				defaultModel: content.includes('Agent Default means the host chooses the model.'),
			}, {
				browserRepositorySearch: isWeb,
				repositoryCreation: sessionCreationProviderId !== undefined,
				firstSend: sessionCreationProviderId !== undefined,
				defaultModel: sessionCreationProviderId !== undefined,
			});
		});
	}

	test('describes subagent groups and restoring filtered pills from another context menu', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
		const content = provider.provideContent();
		const pillHelp = content.split('\n').find(line => line.includes('Pull Requests Options'));

		assert.deepStrictEqual({
			keyboard: pillHelp?.includes('<keybinding:editor.action.showContextMenu>'),
			filterRecovery: pillHelp?.includes('any other pill\'s context menu or the toolbar context menu'),
			subagentOptions: pillHelp?.includes('Subagent Options offers Show All and Show In Progress'),
			persistence: pillHelp?.includes('remembered across sessions'),
			groups: content.includes('Subagents: In Progress and Subagents: Completed'),
			waiting: content.includes('In Progress includes subagents waiting for input'),
			failed: content.includes('Completed includes failed subagents'),
		}, { keyboard: true, filterRecovery: true, subagentOptions: true, persistence: true, groups: true, waiting: true, failed: true });
	});

	test('describes removing recorded artifacts and references after persistence', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent();

		assert.deepStrictEqual({
			recordedArtifactsAndReferences: content.includes('Recorded artifacts and references'),
			singleItemActions: content.includes('pill hover actions or context menu'),
			persistence: content.includes('waits for persistence'),
			oldAction: content.includes('Remove Pull Request Artifact'),
			immediateRemoval: content.includes('Removal is immediate'),
		}, {
			recordedArtifactsAndReferences: true,
			singleItemActions: true,
			persistence: true,
			oldAction: false,
			immediateRemoval: false,
		});
	});

	test('describes the existing response-selection input by default', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));

		assert.strictEqual(
			provider.provideContent().split('\n').find(line => line.startsWith('When you select assistant response text')),
			'When you select assistant response text, an Ask Question input appears. Type a side question and press Enter to send it, press Shift+Enter to insert a new line, or press Escape to dismiss the input.',
		);
	});

	test('describes the experimental response-selection menu when enabled', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({
			[AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING]: true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));

		assert.strictEqual(
			provider.provideContent().split('\n').find(line => line.startsWith('When you select assistant response text')),
			'When you select assistant response text, an action menu appears. Press Tab to focus the menu, use the Up Arrow and Down Arrow keys to move between actions, and press Enter to activate one. Press Escape to dismiss the menu. Ask with /btw opens a question input anchored to the selected text. Quote appends the selection as a blockquote in the chat input when the conversation is interactive. Copy copies the selected text.',
		);
	});

	test('describes forking to the side and the keyboard-only alternative', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));

		assert.strictEqual(
			provider.provideContent().split('\n').find(line => line.startsWith('Alt-click')),
			'Alt-click, or Option-click on macOS, the Fork Conversation button at a checkpoint to open the fork beside its source. Ordinary activation keeps its existing behavior. With the keyboard, activate Fork Conversation, reopen the source from the Sessions list, then choose Open to the Side from the fork\'s context menu.',
		);
	});

	test('describes opening subagents to the side without a modifier', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));

		assert.strictEqual(
			provider.provideContent().split('\n').find(line => line.startsWith('Activate a subagent pill')),
			'Activate a subagent pill in the chat transcript to open the subagent beside the current chat. With the keyboard, focus a pill and press Enter or Space; Alt+Enter also opens it to the side. You can also drag a pill to a chat group\'s edge to choose where it opens.',
		);
	});

	for (const { configuredValue, expectedConversation, expectedListAction, expectedGroupCloseHelp } of [
		{ configuredValue: undefined, expectedConversation: 'show a single chat', expectedListAction: 'open a chat as a tab', expectedGroupCloseHelp: false },
		{ configuredValue: SessionsChatTabsMode.Multiple, expectedConversation: 'show a single chat', expectedListAction: 'open a chat as a tab', expectedGroupCloseHelp: false },
		{ configuredValue: SessionsChatTabsMode.Single, expectedConversation: 'show multiple tabs', expectedListAction: 'show a chat as the session view', expectedGroupCloseHelp: true },
	]) {
		test(`describes sessions list chat presentation when the setting is ${configuredValue ?? 'default'}`, () => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService(configuredValue === undefined ? undefined : { [SESSIONS_CHAT_TABS_SETTING]: configuredValue });
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
			const content = provider.provideContent().split('\n');

			assert.deepStrictEqual({
				conversationDescription: content.some(line => line.includes(expectedConversation)),
				menuAvailability: content.some(line => line.includes(`For sessions that support multiple chats, use Show Chat Tabs in the session overflow menu to ${expectedConversation}.`)),
				sessionListAction: content.some(line => line.includes(expectedListAction)),
				pinHelp: content.some(line => line.includes('Pin keeps that chat visible when another chat opens')),
				groupCloseHelp: content.some(line => line.includes('Close removes that chat group')),
				lastGroupCloseHelp: content.some(line => line.includes('Closing the last group closes the session from the grid. Non-main chats are hidden and can be reopened later.')),
			}, {
				conversationDescription: true,
				menuAvailability: true,
				sessionListAction: true,
				pinHelp: expectedGroupCloseHelp,
				groupCloseHelp: expectedGroupCloseHelp,
				lastGroupCloseHelp: expectedGroupCloseHelp,
			});
		});
	}

	for (const { wording, action, dismiss, promoteNewChatAction, expectedSessionListHelp } of [
		{ wording: ChatSessionArchiveActionWording.Archive, action: 'Archive', dismiss: 'Dismiss Archive Suggestion', promoteNewChatAction: true, expectedSessionListHelp: 'For sessions that support multiple chats, the session row toolbar offers New Chat in This Session before Archive. Open the session\'s context menu to pin or unpin it.' },
		{ wording: ChatSessionArchiveActionWording.MarkAsDone, action: 'Mark as Done', dismiss: 'Dismiss Mark as Done Suggestion', promoteNewChatAction: true, expectedSessionListHelp: 'For sessions that support multiple chats, the session row toolbar offers New Chat in This Session before Mark as Done. Open the session\'s context menu to pin or unpin it.' },
		{ wording: ChatSessionArchiveActionWording.Archive, action: 'Archive', dismiss: 'Dismiss Archive Suggestion', promoteNewChatAction: false, expectedSessionListHelp: 'The session row toolbar offers Pin or Unpin before Archive. For sessions that support multiple chats, open the session\'s context menu to start a new chat.' },
		{ wording: ChatSessionArchiveActionWording.MarkAsDone, action: 'Mark as Done', dismiss: 'Dismiss Mark as Done Suggestion', promoteNewChatAction: false, expectedSessionListHelp: 'The session row toolbar offers Pin or Unpin before Mark as Done. For sessions that support multiple chats, open the session\'s context menu to start a new chat.' },
	]) {
		test(`describes the actual dismiss control and Escape for ${action} with promoted New Chat ${promoteNewChatAction}`, () => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({
				[SESSION_ARCHIVE_NUDGE_SETTING]: true,
				[ChatSessionArchiveActionWordingSettingId]: wording,
			});
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration, promoteNewChatAction);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
			const content = provider.provideContent();
			const nudgeHelp = content.split('\n').find(line => line.includes('suggestion may appear'));
			const sessionListHelp = content.split('\n').find(line => line.includes('session row toolbar offers'));

			assert.deepStrictEqual({
				controls: nudgeHelp?.includes(`Use Tab or Shift+Tab to reach ${action}, Configure Automatic Cleanup, or ${dismiss}, then Enter or Space to activate it.`),
				cleanupSettings: nudgeHelp?.includes('Configure Automatic Cleanup opens the settings for automatically archiving inactive merged sessions and permanently deleting automatically archived merged sessions.'),
				escape: nudgeHelp?.includes(`${dismiss}, or Escape while the suggestion is focused, hides the suggestion`),
				focus: nudgeHelp?.includes('returns focus to the chat input'),
				close: nudgeHelp?.includes('Close'),
				onboarding: content.includes('The action waits until you activate the highlighted action, activate Understood, or press Escape to end the spotlight.'),
				sessionListHelp,
			}, {
				controls: true,
				cleanupSettings: true,
				escape: true,
				focus: true,
				close: false,
				onboarding: true,
				sessionListHelp: expectedSessionListHelp,
			});
		});
	}

	test('describes the Codicon background Celebrate button', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
		const backgroundHelp = provider.provideContent().split('\n').find(line => line.includes('Set Background'));

		assert.deepStrictEqual({
			activation: backgroundHelp?.includes('press Tab to find it, then press Enter or Space to activate it'),
			nextButton: backgroundHelp?.includes('Each activation selects another random icon as the next Celebrate button.'),
		}, { activation: true, nextButton: true });
	});

	test('describes Run and Compare Agents only when enabled', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({
			[COMPARE_AGENTS_ENABLED_SETTING]: false,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		const disabledProvider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
		const disabledContent = disabledProvider.provideContent();
		await configuration.setUserConfiguration(COMPARE_AGENTS_ENABLED_SETTING, true);
		const enabledProvider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));

		assert.deepStrictEqual({
			disabled: disabledContent.includes('activate Run and Compare Agents'),
			enabled: enabledProvider.provideContent().includes('activate Run and Compare Agents'),
			workspaceAndBranch: enabledProvider.provideContent().includes('choose a Git repository with at least one commit and a remote, choose the base branch'),
			permissions: enabledProvider.provideContent().includes('provider-specific Permissions selection'),
			bulkPermissions: enabledProvider.provideContent().includes('Allow all permissions for every participant'),
			permissionInfo: enabledProvider.provideContent().includes('Activate the adjacent information button'),
			evaluatorInfo: enabledProvider.provideContent().includes('Their information buttons describe each role'),
			setupSteps: enabledProvider.provideContent().includes('two-step comparison setup'),
			stepButtons: enabledProvider.provideContent().includes('Attempts and Evaluation step buttons'),
			effort: enabledProvider.provideContent().includes('supported reasoning effort'),
			opensAttemptsGrid: enabledProvider.provideContent().includes('open every available attempt in a resizable grid'),
			twoPaneInputs: enabledProvider.provideContent().includes('With two attempt panes, both chat inputs remain visible'),
			threePaneInputs: enabledProvider.provideContent().includes('With three or more, only the active attempt pane shows its chat input'),
			screenReaderInputs: enabledProvider.provideContent().includes('Screen-reader optimized mode keeps every attempt input visible'),
			stopParticipant: enabledProvider.provideContent().includes('stop only that participant'),
			stopAll: enabledProvider.provideContent().includes('stops every running attempt, Judge, and Synthesizer'),
			stopOnlyWhileRunning: enabledProvider.provideContent().includes('Stop and Stop All are available only while their comparison sessions are running'),
			archiveComparison: enabledProvider.provideContent().includes('check-mark Archive Comparison action'),
			deleteGroup: enabledProvider.provideContent().includes('Delete Group remains available from the comparison header context menu'),
			inactivePaneNotification: enabledProvider.provideContent().includes('question tool needs input in an inactive visible pane'),
			rationaleOrder: enabledProvider.provideContent().includes('Comparison, Validation, Code quality, Solution'),
			attemptLinks: enabledProvider.provideContent().includes('activate its link to reveal that session'),
			accessibleView: enabledProvider.provideContent().includes('use Open Accessible View<keybinding:editor.action.accessibleView>'),
			focusAttempts: enabledProvider.provideContent().includes('use its adjacent dropdown to focus another attempt'),
			additionalInstructions: enabledProvider.provideContent().includes('choose Additional Synthesis Instructions'),
			submitInstructions: enabledProvider.provideContent().includes('Activate Start Synthesis with Instructions'),
			customSynthesis: enabledProvider.provideContent().includes('activate Custom Synthesis to reveal a decision table'),
			customSynthesisScroll: enabledProvider.provideContent().includes('The table scrolls when its decisions or attempt columns exceed the available space'),
			choiceButtons: enabledProvider.provideContent().includes('Use Tab to move between the choice buttons'),
		}, {
			disabled: false,
			enabled: true,
			workspaceAndBranch: true,
			permissions: true,
			bulkPermissions: true,
			permissionInfo: true,
			evaluatorInfo: true,
			setupSteps: true,
			stepButtons: true,
			effort: true,
			opensAttemptsGrid: true,
			twoPaneInputs: true,
			threePaneInputs: true,
			screenReaderInputs: true,
			stopParticipant: true,
			stopAll: true,
			stopOnlyWhileRunning: true,
			archiveComparison: true,
			deleteGroup: true,
			inactivePaneNotification: true,
			rationaleOrder: true,
			attemptLinks: true,
			accessibleView: true,
			focusAttempts: true,
			additionalInstructions: true,
			submitInstructions: true,
			customSynthesis: true,
			customSynthesisScroll: true,
			choiceButtons: true,
		});
	});

	test('provides the focused Judge result as plain text and restores focus', () => {
		const judgeResource = URI.parse('test:///judge');
		const comparison: ISessionComparison = {
			id: 'comparison',
			groupId: 'group',
			title: 'Comparison',
			createdAt: 0,
			workspace: URI.file('/repo'),
			prompt: 'Implement',
			participants: [{
				id: 'attempt',
				role: SessionComparisonParticipantRole.Attempt,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Codex' },
				completion: { elapsedMs: 3_000, tokenCount: 42 },
			}, {
				id: 'judge',
				role: SessionComparisonParticipantRole.Judge,
				sessionResource: judgeResource,
				harness: { providerId: 'test', sessionTypeId: 'test', label: 'Judge' },
			}],
			verdict: {
				recommendedParticipantId: 'attempt',
				explanation: 'Best result.',
				conflicts: [],
				attempts: [],
			},
		};
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(upcastPartial<IActiveSession>({
				sessionId: 'judge',
				resource: judgeResource,
			}));
		}());
		instantiationService.stub(ISessionComparisonService, new class extends mock<ISessionComparisonService>() {
			override readonly comparisons = constObservable([comparison]);
		}());
		const origin = mainWindow.document.createElement('button');
		mainWindow.document.body.appendChild(origin);
		store.add({ dispose: () => origin.remove() });
		origin.focus();

		const provider = new SessionComparisonAccessibleView().getProvider(instantiationService);
		assert.ok(provider);
		store.add(provider);
		const content = provider?.provideContent();
		provider?.onClose();

		assert.deepStrictEqual({
			type: provider?.options.type,
			content,
			focusRestored: mainWindow.document.activeElement === origin,
		}, {
			type: AccessibleViewType.View,
			content: [
				'Comparison result',
				'Attempt 1 (Codex) won',
				'',
				'Why it won',
				'Best result.',
				'',
				'Attempt time and token usage',
				'Attempt 1 (Codex): Total time 3s; Total tokens 42',
			].join('\n'),
			focusRestored: true,
		});
	});
});
