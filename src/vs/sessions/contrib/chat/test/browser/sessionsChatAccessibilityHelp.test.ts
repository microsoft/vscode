/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SESSION_ARCHIVE_NUDGE_SETTING } from '../../browser/sessionArchiveNudge.js';
import { SessionsChatAccessibilityHelp } from '../../browser/sessionsChatAccessibilityHelp.js';
import { SessionsListPromoteNewChatActionContext } from '../../../../common/contextkeys.js';
import { SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode } from '../../../../common/sessionConfig.js';

suite('SessionsChatAccessibilityHelp', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function stubContextKeyService(instantiationService: TestInstantiationService, configuration: TestConfigurationService, promoteNewChatAction = false): void {
		const contextKeyService = store.add(new ContextKeyService(configuration));
		SessionsListPromoteNewChatActionContext.bindTo(contextKeyService).set(promoteNewChatAction);
		instantiationService.stub(IContextKeyService, contextKeyService);
	}

	test('describes restoring filtered pull requests from another pill context menu', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
		const pillHelp = provider.provideContent().split('\n').find(line => line.includes('Pull Requests Options'));

		assert.deepStrictEqual({
			keyboard: pillHelp?.includes('<keybinding:editor.action.showContextMenu>'),
			filterRecovery: pillHelp?.includes('any other pill\'s context menu or the toolbar context menu'),
		}, { keyboard: true, filterRecovery: true });
	});

	test('describes removing recorded artifacts and references after persistence', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
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

	test('describes forking to the side and the keyboard-only alternative', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
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
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));

		assert.strictEqual(
			provider.provideContent().split('\n').find(line => line.startsWith('Activate a subagent pill')),
			'Activate a subagent pill in the chat transcript to open the subagent beside the current chat. With the keyboard, focus a pill and press Enter or Space; Alt+Enter also opens it to the side. You can also drag a pill to a chat group\'s edge to choose where it opens.',
		);
	});

	for (const { configuredValue, expectedConversation, expectedListAction } of [
		{ configuredValue: undefined, expectedConversation: 'show a single chat', expectedListAction: 'open a chat as a tab' },
		{ configuredValue: SessionsChatTabsMode.Multiple, expectedConversation: 'show a single chat', expectedListAction: 'open a chat as a tab' },
		{ configuredValue: SessionsChatTabsMode.Single, expectedConversation: 'show multiple tabs', expectedListAction: 'show a chat as the session view' },
	]) {
		test(`describes sessions list chat presentation when the setting is ${configuredValue ?? 'default'}`, () => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService(configuredValue === undefined ? undefined : { [SESSIONS_CHAT_TABS_SETTING]: configuredValue });
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
			const content = provider.provideContent().split('\n');

			assert.deepStrictEqual({
				conversationDescription: content.some(line => line.includes(expectedConversation)),
				menuAvailability: content.some(line => line.includes(`For sessions that support multiple chats, use Show Chat Tabs in the session overflow menu to ${expectedConversation}.`)),
				sessionListAction: content.some(line => line.includes(expectedListAction)),
			}, {
				conversationDescription: true,
				menuAvailability: true,
				sessionListAction: true,
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
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
		const backgroundHelp = provider.provideContent().split('\n').find(line => line.includes('Set Background'));

		assert.deepStrictEqual({
			activation: backgroundHelp?.includes('press Tab to find it, then press Enter or Space to activate it'),
			nextButton: backgroundHelp?.includes('Each activation selects another random icon as the next Celebrate button.'),
		}, { activation: true, nextButton: true });
	});
});
