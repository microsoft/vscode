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
import { Event } from '../../../../../base/common/event.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
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
import { AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING, COMPARE_AGENTS_ENABLED_SETTING, EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, NEW_SESSION_WELCOME_PHRASES_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../../common/constants.js';
import { TABBED_MODEL_PICKER_SETTING_ID } from '../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerWidget.js';
import { AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING } from '../../browser/responseSelectionSideChatController.js';
import { SESSION_ARCHIVE_NUDGE_SETTING } from '../../browser/sessionArchiveNudge.js';
import { SessionComparisonAccessibleView, SessionsChatAccessibilityHelp } from '../../browser/sessionsChatAccessibilityHelp.js';
import { SessionsListPromoteNewChatActionContext } from '../../../../common/contextkeys.js';
import { SESSIONS_CHAT_TABS_SETTING, SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, SessionsChatTabsMode } from '../../../../common/sessionConfig.js';
import { RemoteSessionToolsEnabledSettingId } from '../../../remoteSessions/common/remoteSessions.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerSamplesEnabledSettingId } from '../../../../common/devContainerAgentHostService.js';
suite('SessionsChatAccessibilityHelp', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('documents navigation through sessions and singleton views', () => {
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
			back: content.includes('Go back through visited sessions, the New Session view, and custom views such as Automations<keybinding:sessions.goBack>'),
			forward: content.includes('Go forward through visited sessions and views<keybinding:sessions.goForward>'),
			singletonViews: content.includes('moves its single history entry to the most recent position'),
		}, { back: true, forward: true, singletonViews: true });
	});

	test('documents layout density only on desktop', () => {
		const densityHelp = [false, true].map(phone => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService();
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			const mainContainer = mainWindow.document.createElement('div');
			mainContainer.classList.toggle('phone-layout', phone);
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer });
			const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent();
			return content.includes('Choose Default or Compact from View > Layout Density');
		});

		assert.deepStrictEqual(densityHelp, [true, false]);
	});

	for (const { name, hostsEnabled, toolsEnabled, aiDisabled, enabled } of [
		{ name: 'default', hostsEnabled: true, toolsEnabled: undefined, aiDisabled: false, enabled: false },
		{ name: 'enabled', hostsEnabled: true, toolsEnabled: true, aiDisabled: false, enabled: true },
		{ name: 'tools disabled', hostsEnabled: true, toolsEnabled: false, aiDisabled: false, enabled: false },
		{ name: 'hosts disabled', hostsEnabled: false, toolsEnabled: true, aiDisabled: false, enabled: false },
		{ name: 'AI disabled', hostsEnabled: true, toolsEnabled: true, aiDisabled: true, enabled: false },
	]) {
		test(`describes remote delegation only when available: ${name}`, () => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({
				[RemoteAgentHostsEnabledSettingId]: hostsEnabled,
				[RemoteSessionToolsEnabledSettingId]: toolsEnabled,
				'chat.disableAIFeatures': aiDisabled,
			});
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
			const content = provider.provideContent();
			assert.deepStrictEqual({
				delegation: content.includes('originating chat while this Agents window remains connected'),
				inspection: content.includes('inspect a remote session using its session link'),
				readOnly: content.includes('without changing focus, marking the chat as read, or approving pending requests'),
			}, { delegation: enabled, inspection: enabled, readOnly: enabled });
		});
	}

	function stubContextKeyService(instantiationService: TestInstantiationService, configuration: TestConfigurationService, promoteNewChatAction = false): void {
		instantiationService.stub(IEnvironmentService, { isBuilt: false });
		instantiationService.stub(IChatEntitlementService, { sentiment: { hidden: configuration.getValue('chat.disableAIFeatures') === true } });
		const contextKeyService = store.add(new ContextKeyService(configuration));
		SessionsListPromoteNewChatActionContext.bindTo(contextKeyService).set(promoteNewChatAction);
		instantiationService.stub(IContextKeyService, contextKeyService);
	}

	for (const { name, built, extensionDevelopment, hostsEnabled, aiDisabled, hidden, enabled } of [
		{ name: 'source', built: false, extensionDevelopment: false, hostsEnabled: true, aiDisabled: false, hidden: false, enabled: true },
		{ name: 'extension development', built: true, extensionDevelopment: true, hostsEnabled: true, aiDisabled: false, hidden: false, enabled: true },
		{ name: 'normal built product', built: true, extensionDevelopment: false, hostsEnabled: true, aiDisabled: false, hidden: false, enabled: true },
		{ name: 'remote hosts disabled', built: true, extensionDevelopment: false, hostsEnabled: false, aiDisabled: false, hidden: false, enabled: false },
		{ name: 'AI master setting disabled', built: true, extensionDevelopment: false, hostsEnabled: true, aiDisabled: true, hidden: false, enabled: false },
		{ name: 'AI hidden', built: true, extensionDevelopment: false, hostsEnabled: true, aiDisabled: false, hidden: true, enabled: false },
	]) {
		test(`Environments accessibility help matches discovery availability: ${name}`, () => {
			const instantiation = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: hostsEnabled, 'chat.disableAIFeatures': aiDisabled });
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiation.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiation, configuration);
			instantiation.stub(IEnvironmentService, { isBuilt: built, isExtensionDevelopment: extensionDevelopment });
			instantiation.stub(IChatEntitlementService, { sentiment: { hidden } });
			instantiation.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiation.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiation.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiation)).provideContent();
			assert.deepStrictEqual({
				discoveryHelp: content.includes('choose Environments to discover your environments'),
				refreshHelp: content.includes('Tab reaches Refresh Environments.'),
				hiddenHelp: content.includes('Hide in This Profile') || content.includes('Restore Host'),
				missionControl: content.includes('Mission Control'),
			}, { discoveryHelp: enabled, refreshHelp: enabled, hiddenHelp: false, missionControl: false });
		});
	}

	test('describes Dev Container samples only when all picker prerequisites are enabled', () => {
		const variants = [
			{},
			{ [DevContainerSamplesEnabledSettingId]: false },
			{ [DevContainerAgentHostEnabledSettingId]: false },
			{ [RemoteAgentHostsEnabledSettingId]: false },
			{ 'chat.disableAIFeatures': true },
		];
		const visible = variants.map(overrides => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({
				[DevContainerSamplesEnabledSettingId]: true,
				[DevContainerAgentHostEnabledSettingId]: true,
				[RemoteAgentHostsEnabledSettingId]: true,
				...overrides,
			});
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent();
			return content.includes('The workspace picker includes Dev Container Sample.');
		});
		assert.deepStrictEqual(visible, [true, false, false, false, false]);
	});

	test('describes welcome name editing only when welcome phrases are enabled', () => {
		const snapshots = [false, true].map(enabled => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({ [NEW_SESSION_WELCOME_PHRASES_SETTING]: enabled });
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent();
			return {
				nameEditing: content.includes('Press Tab to reach Customize Welcome Message'),
				announcementSetting: content.includes('set accessibility.verbosity.newSessionWelcome to false'),
			};
		});

		assert.deepStrictEqual(snapshots, [
			{ nameEditing: false, announcementSetting: false },
			{ nameEditing: true, announcementSetting: true },
		]);
	});

	test('describes automatic external session adoption', () => {
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

		assert.strictEqual(
			content.split('\n').find(line => line.startsWith('Once you send a message to an external session')),
			'Once you send a message to an external session\'s agent, it becomes a regular session. Its banner and External hover label disappear, and it is no longer grouped or filtered as external.',
		);
	});

	test('documents the Copilot to Local feedback survey', () => {
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
			survey: content.includes('a feedback survey may appear above the chat input'),
			keyboard: content.includes('Use Up and Down Arrow to choose why you switched, then press Enter or Space to submit'),
			acknowledgement: content.includes('a message confirms that your feedback was recorded'),
			feedbackLink: content.includes('Use Tab to reach Share it on GitHub to provide specific feedback in a GitHub issue'),
		}, {
			survey: true,
			keyboard: true,
			acknowledgement: true,
			feedbackLink: true,
		});
	});

	test('describes External section keyboard actions only when the section is enabled', () => {
		const snapshots = [undefined, false, true].map(enabled => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({ [SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING]: enabled });
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent();
			const sectionHelp = content.split('\n').find(line => line.includes('External section above Archived'));
			return {
				filter: content.includes('Created Externally submenu') && content.includes('None, Recent, Last 24 Hours, Last 7 Days, or Last 30 Days'),
				defaults: content.includes('Last 7 Days is the default') && content.includes('Show in External Section') && content.includes('This option is off by default'),
				submenuChoices: content.includes('Current choices are checked inside the submenus'),
				viewActions: content.includes('Compact View and Collapse All Groups are available from the Sessions More Actions menu'),
				applicationDefaults: content.includes('In Local and on remote hosts, applications other than VS Code are hidden by default') && content.includes('Slack and Teams applications in Cloud are also hidden by default'),
				vscodeChoice: content.includes('VS Code is always offered for each available environment, even before you create a session there'),
				importAction: content.includes('use Import in its row toolbar, before Archive or Mark as Done'),
				section: sectionHelp !== undefined,
				keyboard: sectionHelp?.includes('<keybinding:editor.action.showContextMenu>') ?? false,
			};
		});

		assert.deepStrictEqual(snapshots, [
			{ filter: true, defaults: true, submenuChoices: true, viewActions: true, applicationDefaults: true, vscodeChoice: true, importAction: true, section: false, keyboard: false },
			{ filter: true, defaults: true, submenuChoices: true, viewActions: true, applicationDefaults: true, vscodeChoice: true, importAction: true, section: false, keyboard: false },
			{ filter: true, defaults: true, submenuChoices: true, viewActions: true, applicationDefaults: true, vscodeChoice: true, importAction: true, section: true, keyboard: true },
		]);
	});

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

	test('describes controls according to the effective new-session layout', () => {
		const getLayoutHelp = (unifiedPicker: boolean, experimentalLayout: boolean, agentPickerInAttachContext = false, screenReader = false) => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({
				[UNIFIED_WORKSPACE_PICKER_SETTING]: unifiedPicker,
				[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING]: experimentalLayout,
				[AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING]: agentPickerInAttachContext,
			});
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			instantiationService.stub(IAccessibilityService, { isScreenReaderOptimized: () => screenReader, onDidChangeScreenReaderOptimized: Event.None });
			const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent().split('\n');
			return {
				controls: content.find(line => line.startsWith('Inside the new-session prompt') || line.startsWith('When an Agent picker')),
				sync: content.find(line => line.startsWith('When available for a folder session with incoming or outgoing commits')),
				hasSessionOptions: content.some(line => line.startsWith('Above the new-session input')),
				sessionOptionsMentionsToggle: content.some(line => line.includes('Hide Session Options collapses these controls')),
			};
		};

		assert.deepStrictEqual([
			getLayoutHelp(false, false),
			getLayoutHelp(false, false, true),
			getLayoutHelp(true, false),
			getLayoutHelp(false, true),
			getLayoutHelp(true, true),
			getLayoutHelp(true, true, false, true),
			getLayoutHelp(true, true, true),
		], [
			{
				controls: 'Inside the new-session prompt, Add Context and Model appear in the input toolbar. Agent, Mode, and Permissions appear below the input when available for the selected harness. Use Tab to reach the controls, arrow keys to navigate toolbar items, and Enter or Space to open a picker.',
				sync: 'When available for a folder session with incoming or outgoing commits, Sync Changes appears with the commit counts in the same repository toolbar as the worktree and branch controls below the input. It is hidden when New Worktree is selected. Use Tab and the arrow keys to reach it, then Enter or Space to synchronize the session\'s repository. The action is disabled while synchronization is running.',
				hasSessionOptions: false,
				sessionOptionsMentionsToggle: false,
			},
			{
				controls: 'When an Agent picker is available in a new or running session, it initially appears in Add Context. Open Add Context and choose Agent to select an agent. After you select an agent, the Agent picker returns to its usual position. Other new-session controls remain in their layout-specific positions. Use Tab to reach toolbar controls, arrow keys to navigate toolbar items, and Enter or Space to open a picker.',
				sync: 'When available for a folder session with incoming or outgoing commits, Sync Changes appears with the commit counts in the same repository toolbar as the worktree and branch controls below the input. It is hidden when New Worktree is selected. Use Tab and the arrow keys to reach it, then Enter or Space to synchronize the session\'s repository. The action is disabled while synchronization is running.',
				hasSessionOptions: false,
				sessionOptionsMentionsToggle: false,
			},
			{
				controls: 'Inside the new-session prompt, Add Context and Model appear in the input toolbar. Agent, Mode, and Permissions appear below the input when available for the selected harness. Use Tab to reach the controls, arrow keys to navigate toolbar items, and Enter or Space to open a picker.',
				sync: 'When available for a folder session with incoming or outgoing commits, Sync Changes appears with the commit counts in the same repository toolbar as the worktree and branch controls below the input. It is hidden when New Worktree is selected. Use Tab and the arrow keys to reach it, then Enter or Space to synchronize the session\'s repository. The action is disabled while synchronization is running.',
				hasSessionOptions: false,
				sessionOptionsMentionsToggle: false,
			},
			{
				controls: 'Inside the new-session prompt, Add Context and Model appear in the input toolbar. Agent, Mode, and Permissions appear below the input when available for the selected harness. Use Tab to reach the controls, arrow keys to navigate toolbar items, and Enter or Space to open a picker.',
				sync: 'When available for a folder session with incoming or outgoing commits, Sync Changes appears with the commit counts in the same repository toolbar as the worktree and branch controls below the input. It is hidden when New Worktree is selected. Use Tab and the arrow keys to reach it, then Enter or Space to synchronize the session\'s repository. The action is disabled while synchronization is running.',
				hasSessionOptions: false,
				sessionOptionsMentionsToggle: false,
			},
			{
				controls: 'Inside the new-session prompt, the controls appear in this order: Add Context, Agent, Mode and Permissions, and Model. Which controls are available depends on the selected harness. Use Tab to reach the controls, arrow keys to navigate toolbar items, and Enter or Space to open a picker.',
				sync: 'When available for a folder session with incoming or outgoing commits, Sync Changes appears with the commit counts in the same repository toolbar as the worktree and branch controls above the input. It is hidden when New Worktree is selected. Use Tab and the arrow keys to reach it, then Enter or Space to synchronize the session\'s repository. The action is disabled while synchronization is running.',
				hasSessionOptions: true,
				sessionOptionsMentionsToggle: true,
			},
			{
				controls: 'Inside the new-session prompt, the controls appear in this order: Add Context, Agent, Mode and Permissions, and Model. Which controls are available depends on the selected harness. Use Tab to reach the controls, arrow keys to navigate toolbar items, and Enter or Space to open a picker.',
				sync: 'When available for a folder session with incoming or outgoing commits, Sync Changes appears with the commit counts in the same repository toolbar as the worktree and branch controls above the input. It is hidden when New Worktree is selected. Use Tab and the arrow keys to reach it, then Enter or Space to synchronize the session\'s repository. The action is disabled while synchronization is running.',
				hasSessionOptions: true,
				sessionOptionsMentionsToggle: false,
			},
			{
				controls: 'When an Agent picker is available in a new or running session, it initially appears in Add Context. Open Add Context and choose Agent to select an agent. After you select an agent, the Agent picker returns to its usual position. Other new-session controls remain in their layout-specific positions. Use Tab to reach toolbar controls, arrow keys to navigate toolbar items, and Enter or Space to open a picker.',
				sync: 'When available for a folder session with incoming or outgoing commits, Sync Changes appears with the commit counts in the same repository toolbar as the worktree and branch controls above the input. It is hidden when New Worktree is selected. Use Tab and the arrow keys to reach it, then Enter or Space to synchronize the session\'s repository. The action is disabled while synchronization is running.',
				hasSessionOptions: true,
				sessionOptionsMentionsToggle: true,
			},
		]);
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
				modeAndPermissions: content.includes('Before sending, use the mode picker to choose Interactive, Plan, or Autopilot, and the permissions picker to configure tool approvals.'),
				modelAndReasoning: content.includes('Open the model picker to choose a cloud model and its supported reasoning effort.'),
			}, {
				browserRepositorySearch: isWeb,
				repositoryCreation: sessionCreationProviderId !== undefined,
				firstSend: sessionCreationProviderId !== undefined,
				modeAndPermissions: sessionCreationProviderId !== undefined,
				modelAndReasoning: sessionCreationProviderId !== undefined,
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
			copyActions: content.includes('its context menu offers the item\'s copy actions'),
			persistence: content.includes('waits for persistence'),
			oldAction: content.includes('Remove Pull Request Artifact'),
			immediateRemoval: content.includes('Removal is immediate'),
		}, {
			recordedArtifactsAndReferences: true,
			singleItemActions: true,
			copyActions: true,
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
			'When you select assistant response text, an action menu appears. Press Tab to focus the menu, use the Up Arrow and Down Arrow keys to move between actions, and press Enter to activate one. Press Escape to dismiss the menu. Ask in a Side Chat opens a question input anchored to the selected text. Quote appends the selection as a blockquote in the chat input when the conversation is interactive. Copy copies the selected text.',
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
		{ wording: ChatSessionArchiveActionWording.Archive, action: 'Archive', dismiss: 'Dismiss Archive Suggestion', promoteNewChatAction: true, expectedSessionListHelp: 'For sessions that support multiple chats, the session row toolbar offers New Nested Session before Archive. Open the session\'s context menu to pin or unpin it.' },
		{ wording: ChatSessionArchiveActionWording.MarkAsDone, action: 'Mark as Done', dismiss: 'Dismiss Mark as Done Suggestion', promoteNewChatAction: true, expectedSessionListHelp: 'For sessions that support multiple chats, the session row toolbar offers New Nested Session before Mark as Done. Open the session\'s context menu to pin or unpin it.' },
		{ wording: ChatSessionArchiveActionWording.Archive, action: 'Archive', dismiss: 'Dismiss Archive Suggestion', promoteNewChatAction: false, expectedSessionListHelp: 'The session row toolbar offers Pin or Unpin before Archive. For sessions that support multiple chats, open the session\'s context menu to start a new chat.' },
		{ wording: ChatSessionArchiveActionWording.MarkAsDone, action: 'Mark as Done', dismiss: 'Dismiss Mark as Done Suggestion', promoteNewChatAction: false, expectedSessionListHelp: 'The session row toolbar offers Pin or Unpin before Mark as Done. For sessions that support multiple chats, open the session\'s context menu to start a new chat.' },
	]) {
		test(`describes the actual dismiss control and Escape for ${action} with promoted New Nested Session ${promoteNewChatAction}`, () => {
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
				continuation: content.includes('Sending a new message after the suggestion appears hides it for those pull requests, including after a reload. It can appear again when a new pull request is added to the session and all its pull requests have merged.'),
				sessionListHelp,
			}, {
				controls: true,
				cleanupSettings: true,
				escape: true,
				focus: true,
				close: false,
				onboarding: true,
				continuation: true,
				sessionListHelp: expectedSessionListHelp,
			});
		});
	}

	test('describes the background Celebrate button and tint toggle', () => {
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
		const backgroundHelp = content.split('\n').find(line => line.includes('Set Background'));
		const tintHelp = content.split('\n').find(line => line.includes('Tint Window to Match Background'));

		assert.deepStrictEqual({
			activation: backgroundHelp?.includes('press Tab to find it, then press Enter or Space to activate it'),
			nextButton: backgroundHelp?.includes('Each activation selects another random icon as the next Celebrate button.'),
			tintKeyboardAccess: tintHelp?.includes('Command Palette'),
			tintCheckedState: tintHelp?.includes('A check mark means tinting is enabled.'),
			tintPreservesImage: tintHelp?.includes('Turning it off keeps the background image'),
		}, { activation: true, nextButton: true, tintKeyboardAccess: true, tintCheckedState: true, tintPreservesImage: true });
	});

	test('describes generic directional navigation for the session grid', () => {
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
		const sessionGridHelp = content.split('\n').find(line => line.includes('Session panes form a separate grid'));

		assert.deepStrictEqual([
			'workbench.action.navigateLeft',
			'workbench.action.navigateRight',
			'workbench.action.navigateUp',
			'workbench.action.navigateDown',
		].map(commandId => sessionGridHelp?.includes(`<keybinding:${commandId}>`)), [true, true, true, true]);
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
		instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		const disabledProvider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
		const disabledContent = disabledProvider.provideContent();
		await configuration.setUserConfiguration(COMPARE_AGENTS_ENABLED_SETTING, true);
		const pickerDisabledContent = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent();
		await configuration.setUserConfiguration(TABBED_MODEL_PICKER_SETTING_ID, true);
		const enabledProvider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));

		assert.deepStrictEqual({
			disabled: disabledContent.includes('activate Compare Models'),
			pickerDisabled: pickerDisabledContent.includes('activate Compare Models'),
			enabled: enabledProvider.provideContent().includes('activate Compare Models'),
			repeated: enabledProvider.provideContent().includes('choose one model and set Number of Runs from two to ten'),
			optionalJudge: enabledProvider.provideContent().includes('run attempts without review'),
			optionalSynthesizer: enabledProvider.provideContent().includes('Without a Synthesizer, review is available but synthesis is not'),
			done: enabledProvider.provideContent().includes('Done returns to the composer'),
			configRefresh: enabledProvider.provideContent().includes('Comparison selections are kept while draft permissions or mode are updating.'),
			cancelSetup: enabledProvider.provideContent().includes('Cancel, Escape, or clicking outside the picker discards setup changes'),
			opensAttemptsGrid: enabledProvider.provideContent().includes('open every available attempt in a resizable grid'),
			twoPaneInputs: enabledProvider.provideContent().includes('With two attempt panes, both chat inputs remain visible'),
			threePaneInputs: enabledProvider.provideContent().includes('With three or more, only the active attempt pane shows its chat input'),
			screenReaderInputs: enabledProvider.provideContent().includes('Screen-reader optimized mode keeps every attempt input visible'),
			stopParticipant: enabledProvider.provideContent().includes('stop only that participant'),
			stopAll: enabledProvider.provideContent().includes('stops every running attempt, Judge, and Synthesizer'),
			stopOnlyWhileRunning: enabledProvider.provideContent().includes('Stop and Stop All are available only while their comparison sessions are running'),
			archiveComparison: enabledProvider.provideContent().includes('comparison header\'s Mark All as Done action'),
			undoComparison: enabledProvider.provideContent().includes('Undo restores the group and its sessions.'),
			tokenWarning: enabledProvider.provideContent().includes('Running a comparison uses tokens for each session.'),
			instructions: enabledProvider.provideContent().includes('press Enter or Space to expand or collapse the full instructions'),
			gridOptOut: enabledProvider.provideContent().includes('Turn off sessions.chat.compareAgents.openInGrid to start them without automatic navigation.'),
			deleteGroup: enabledProvider.provideContent().includes('Delete Group remains available from the comparison header context menu'),
			inactivePaneNotification: enabledProvider.provideContent().includes('question tool needs input in an inactive visible pane'),
			rationaleOrder: enabledProvider.provideContent().includes('Comparison, Validation, Code quality, Solution'),
			attemptLinks: enabledProvider.provideContent().includes('activate its link to reveal that session'),
			accessibleView: enabledProvider.provideContent().includes('use Open Accessible View<keybinding:editor.action.accessibleView>'),
			focusAttempts: enabledProvider.provideContent().includes('use its adjacent dropdown to focus another attempt'),
			additionalInstructions: enabledProvider.provideContent().includes('choose Additional Synthesis Instructions'),
			submitInstructions: enabledProvider.provideContent().includes('Activate Start Synthesis with Instructions'),
			customSynthesis: enabledProvider.provideContent().includes('activate Custom Synthesis to reveal a decision table'),
		}, {
			disabled: false,
			pickerDisabled: false,
			enabled: true, repeated: true, optionalJudge: true, optionalSynthesizer: true, done: true,
			configRefresh: true,
			cancelSetup: true,
			opensAttemptsGrid: true,
			twoPaneInputs: true,
			threePaneInputs: true,
			screenReaderInputs: true,
			stopParticipant: false,
			stopAll: false,
			stopOnlyWhileRunning: false,
			archiveComparison: true,
			undoComparison: true,
			tokenWarning: true,
			instructions: true,
			gridOptOut: true,
			deleteGroup: true,
			inactivePaneNotification: true,
			rationaleOrder: true,
			attemptLinks: true,
			accessibleView: true,
			focusAttempts: true,
			additionalInstructions: true,
			submitInstructions: true,
			customSynthesis: false,
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
				'Attempt 1 (Codex): Total time 3s; Tokens used 42',
			].join('\n'),
			focusRestored: true,
		});
	});
});
