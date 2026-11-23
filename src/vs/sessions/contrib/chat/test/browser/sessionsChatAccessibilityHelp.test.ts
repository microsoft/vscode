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
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ArtifactIntegrationsSettingId } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentHostFilterService } from '../../../../../workbench/contrib/sessions/common/agentHostFilter.js';
import { ISessionsPartService } from '../../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { IChatViewFactory } from '../../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { defaultNewSessionPresentation } from '../../../../../workbench/contrib/sessions/browser/chat/defaultNewSessionPresentation.js';
import { mobileNewSessionPresentation } from '../../../mobile/browser/mobileNewSessionPresentation.js';
import { worktreeSuggestionInputPresentation } from '../../../../../workbench/contrib/sessions/browser/worktreeSuggestion/worktreeSuggestionInputPresentation.js';
import { IChat } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING, AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING, AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING, COMPARE_AGENTS_ENABLED_SETTING, ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING, NEW_SESSION_WELCOME_PHRASES_SETTING, WORKSPACE_OPT_OUT_SETTING } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { SessionComparisonAccessibleView, SessionsChatAccessibilityHelp } from '../../browser/sessionsChatAccessibilityHelp.js';
import { SESSIONS_LIST_PROMOTE_NEW_CHAT_ACTION_DEFAULT, SessionsListPromoteNewChatActionContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { SESSION_ACTIVITY_BAR_SETTING, SESSIONS_CHAT_TABS_SETTING, SESSIONS_SEND_LATER_ENABLED_SETTING, SessionsChatTabsMode } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { AgentWorkbenchLayout, ISessionsHostLayoutService } from '../../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../../../chatWindow/common/chatWindows.js';
import type { SessionView } from '../../../../../workbench/contrib/sessions/browser/parts/sessionView.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED } from '../../../../../workbench/contrib/webview/browser/webview.js';
import { WebviewFindAccessibilityHelp } from '../../../../../workbench/contrib/webview/browser/webviewFindAccessibilityHelp.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatNativeComponentsRenderer, registerChatNativeComponentsRenderer } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatNativeComponents.js';
import { ITestSessionWithChat, testGridPane } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
suite('SessionsChatAccessibilityHelp', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function getHelp(configuration = new TestConfigurationService(), screenReaderOptimized = false, hidden = false): string {
		const instantiation = store.add(new TestInstantiationService());
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiation, configuration);
		instantiation.stub(IChatEntitlementService, { sentiment: { hidden } });
		instantiation.stub(IAccessibilityService, { isScreenReaderOptimized: () => screenReaderOptimized });
		instantiation.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiation.stub(IAgentHostFilterService, { selectedHost: undefined });
		instantiation.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		instantiation.stub(ISessionsHostLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop });
		return store.add(new SessionsChatAccessibilityHelp().getProvider(instantiation)).provideContent();
	}

	test('keeps non-obvious navigation without routine outcome or focus guarantees', () => {
		const help = getHelp();
		assert.deepStrictEqual({
			authenticate: help.includes('Use Tab to reach Authenticate and Enter or Space'),
			explainCondition: help.includes('In a conversation that supports side chats, when a terminal command needs approval'),
			artifactSwitch: help.includes('Use Tab to reach a rule\'s switch and Space to change it'),
			artifactText: help.includes('Use the Accessible View<keybinding:editor.action.accessibleView> to read full list content'),
			outcomeGuarantees: help.includes('An incomplete or cancelled attempt is not reported as a success'),
			focusGuarantees: help.includes('focus moves to its explanation and returns to the control'),
			visualDetails: /glyph animation|gold star|window.density.layout|reserved space/.test(help),
		}, {
			authenticate: true, explainCondition: true, artifactSwitch: true, artifactText: true, outcomeGuarantees: false, focusGuarantees: false, visualDetails: false,
		});
	});

	test('keeps Inbox keyboard navigation and the screen-reader auto-advance setting', () => {
		const help = getHelp();
		assert.deepStrictEqual({
			toggle: help.includes('arrow keys to reach Toggle Inbox'),
			tree: help.includes('Left Arrow to collapse categories, Right Arrow to expand them'),
			autoAdvance: help.includes('keeps you in the current conversation when a screen reader is attached'),
			approvalNavigation: help.includes('controls navigation after replying or approving a request in Inbox'),
			choices: help.includes('Set it to off to always stay, on to always advance'),
			newSession: help.includes('newSession to open New Session and focus its input'),
			triageAlgorithms: /aggregate status|last 7 days|first automatic move spotlights/.test(help),
		}, { toggle: true, tree: true, autoAdvance: true, approvalNavigation: true, choices: true, newSession: true, triageAlgorithms: false });
	});

	test('only includes scheduled-message navigation when Send Later is enabled', () => {
		assert.deepStrictEqual([false, true].map(enabled => {
			const help = getHelp(new TestConfigurationService({ [SESSIONS_SEND_LATER_ENABLED_SETTING]: enabled }));
			return {
				picker: help.includes('In the Send Later picker'),
				calendar: help.includes('Page Up and Page Down by month'),
				edit: help.includes('Enter saves the edit without sending immediately'),
			};
		}), [false, true].map(enabled => ({ picker: enabled, calendar: enabled, edit: enabled })));
	});

	test('scopes view-mode and HTML reading guidance to visible AI and preview availability', () => {
		assert.deepStrictEqual([
			{ disabled: false, hidden: false, html: true },
			{ disabled: false, hidden: false, html: false },
			{ disabled: true, hidden: false, html: true },
			{ disabled: false, hidden: true, html: true },
		].map(({ disabled, hidden, html }) => {
			const help = getHelp(new TestConfigurationService({
				'chat.disableAIFeatures': disabled,
				[ChatConfiguration.HtmlPreviewEnabled]: html,
			}), false, hidden);
			return {
				viewMode: help.includes('View Mode to select Compact, Verbose, or Conversation'),
				htmlSource: help.includes('Use Tab to focus the HTML preview and press Shift+F10'),
				htmlAccessible: help.includes('original source is also available in the chat Accessible View'),
				disabledPreview: help.includes('Inline HTML previews are disabled'),
				titleGeneration: help.includes('generates titles'),
			};
		}), [
			{ viewMode: true, htmlSource: true, htmlAccessible: true, disabledPreview: false, titleGeneration: false },
			{ viewMode: true, htmlSource: false, htmlAccessible: false, disabledPreview: true, titleGeneration: false },
			{ viewMode: false, htmlSource: false, htmlAccessible: false, disabledPreview: false, titleGeneration: false },
			{ viewMode: false, htmlSource: false, htmlAccessible: false, disabledPreview: false, titleGeneration: false },
		]);
	});

	test('only includes native visual reading guidance with its renderer and setting', () => {
		const read = (enabled: boolean) => {
			const help = getHelp(new TestConfigurationService({ [ChatConfiguration.NativeComponentsEnabled]: enabled }));
			return {
				source: help.includes('Choose Show Source to toggle the original markup'),
				text: help.includes('presents each visual as text'),
			};
		};
		const withoutRenderer = read(true);
		store.add(registerChatNativeComponentsRenderer(upcastPartial<IChatNativeComponentsRenderer>({})));
		assert.deepStrictEqual({ withoutRenderer, enabled: read(true), disabled: read(false) }, {
			withoutRenderer: { source: false, text: false },
			enabled: { source: true, text: true },
			disabled: { source: false, text: false },
		});
	});

	test('only includes remote environment discovery navigation when available', () => {
		assert.deepStrictEqual([
			{ enabled: true, disabled: false, hidden: false },
			{ enabled: false, disabled: false, hidden: false },
			{ enabled: true, disabled: true, hidden: false },
			{ enabled: true, disabled: false, hidden: true },
		].map(({ enabled, disabled, hidden }) => {
			const help = getHelp(new TestConfigurationService({
				[RemoteAgentHostsEnabledSettingId]: enabled,
				'chat.disableAIFeatures': disabled,
			}), false, hidden);
			return help.includes('Tab reaches Refresh Environments');
		}), [true, false, false, false]);
	});

	test('keeps comparison reading and launch navigation only while comparisons are enabled', () => {
		assert.deepStrictEqual([false, true].map(enabled => {
			const help = getHelp(new TestConfigurationService({ [COMPARE_AGENTS_ENABLED_SETTING]: enabled }));
			return {
				setup: help.includes('Use Compare Models<keybinding:sessions.compareModels>'),
				launch: help.includes('activate Run N Attempts to launch'),
				inputs: help.includes('Screen-reader optimized mode keeps every attempt input visible'),
				verdict: help.includes('Open Accessible View<keybinding:editor.action.accessibleView> to read its verdict'),
			};
		}), [false, true].map(enabled => ({ setup: enabled, launch: enabled, inputs: enabled, verdict: enabled })));
	});

	test('keeps keyboard access to grouped artifacts, comments, and floating details', () => {
		const help = getHelp();
		assert.deepStrictEqual({
			artifactNavigation: help.includes('Up and Down Arrow, Home and End move between artifacts'),
			artifactDismissal: help.includes('Escape returns focus to the pill'),
			commentScroll: help.includes('Tab to the scrollable comments region and use the arrow keys'),
			customizations: help.includes('Activate Less to hide them again and return focus to More'),
			moveDetails: help.includes('Tab to the Move grip and use Arrow keys to reposition it'),
			resizeDetails: help.includes('Tab to a width or height resize handle'),
		}, {
			artifactNavigation: true, artifactDismissal: true, commentScroll: true, customizations: true, moveDetails: true, resizeDetails: true,
		});
	});

	test('only includes separate-window and activity-bar navigation when enabled', () => {
		assert.deepStrictEqual([false, true].map(enabled => {
			const help = getHelp(new TestConfigurationService({
				[CHAT_WINDOWS_ENABLED_SETTING]: enabled,
				[SESSION_ACTIVITY_BAR_SETTING]: enabled,
			}));
			return {
				window: help.includes('Use Open Chat in New Window'),
				newSession: help.includes('In a chat window, New Session<keybinding:sessions.chatWindow.newSession>'),
				activityBar: help.includes('Tab past the input controls to reach the Session Activity Bar'),
			};
		}), [false, true].map(enabled => ({ window: enabled, newSession: enabled, activityBar: enabled })));
	});

	test('documents side chats in the side panel, and leaves them out of the archive help, while side chats show there', () => {
		const help = (sideChatsInSidePane: boolean) => {
			const instantiation = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService();
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiation.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiation, configuration, undefined, sideChatsInSidePane);
			instantiation.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiation.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiation.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			instantiation.stub(ISessionsHostLayoutService, {});
			const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiation)).provideContent();
			return { sidePanel: content.includes('open as tabs of the side panel'), archiveListsSideChats: content.includes('including a /btw side chat') };
		};

		assert.deepStrictEqual([help(false), help(true)], [
			{ sidePanel: false, archiveListsSideChats: true },
			{ sidePanel: true, archiveListsSideChats: false },
		]);
	});

	test('defers to webview Find help while the Find input is focused', () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const context = store.add(new ContextKeyService(configuration));
		IsSessionsWindowContext.bindTo(context).set(true);
		const findFocused = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED.bindTo(context);
		const implementations = [new SessionsChatAccessibilityHelp(), new WebviewFindAccessibilityHelp()];
		assert.deepStrictEqual([false, true].map(focused => {
			findFocused.set(focused);
			return implementations
				.filter(implementation => context.contextMatchesRules(implementation.when))
				.sort((a, b) => b.priority - a.priority)
				.map(implementation => implementation.name);
		}), [['sessionsChat'], ['webview-find']]);
	});

	for (const remotesEnabled of [false, true]) {
		for (const manageEnabled of [undefined, false, true]) {
			test(`documents Manage only when available (remotes: ${remotesEnabled}, manage: ${manageEnabled})`, () => {
				const instantiation = store.add(new TestInstantiationService());
				const configuration = new TestConfigurationService({
					[ENVIRONMENT_PICKER_SETTING]: true,
					[RemoteAgentHostsEnabledSettingId]: remotesEnabled,
					...(manageEnabled === undefined ? {} : { [ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING]: manageEnabled }),
				});
				store.add(configuration.onDidChangeConfigurationEmitter);
				instantiation.stub(IConfigurationService, configuration);
				stubContextKeyService(instantiation, configuration);
				instantiation.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
				instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
				instantiation.stub(IAgentHostFilterService, { selectedHost: undefined });
				const container = mainWindow.document.createElement('div');
				instantiation.stub(IWorkbenchLayoutService, { mainContainer: container });
				instantiation.stub(IAgentWorkbenchLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop, mainContainer: container });
				instantiation.stub(ISessionsHostLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop });
				const telemetry = new TestExperimentTriggerTelemetryService();
				instantiation.stub(ITelemetryService, telemetry);
				instantiation.stub(IAccessibilityService, { isScreenReaderOptimized: () => false });
				const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiation)).provideContent();
				assert.deepStrictEqual({
					describesManage: content.includes('Choose Manage Remote Environments at the bottom of the Environment picker'),
					triggers: telemetry.triggers.filter(name => name === `config.${ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING}`),
				}, {
					describesManage: !isWeb && remotesEnabled && manageEnabled === true,
					triggers: !isWeb && remotesEnabled ? [`config.${ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING}`] : [],
				});
			});
		}
	}

	test('documents repo-less Cloud chats with and without the Environment picker', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		instantiationService.stub(ISessionsHostLayoutService, {});
		const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent();

		assert.deepStrictEqual({
			environmentPicker: content.includes('When GitHub sandboxes are enabled, choose Cloud in the Environment picker, then Chat in the workspace picker, to chat without a repository or pull request.'),
			harnessPicker: content.includes('If the Environment picker is disabled, choose Cloud in the harness picker instead.'),
		}, { environmentPicker: true, harnessPicker: true });
	});

	function stubContextKeyService(instantiationService: TestInstantiationService, configuration: TestConfigurationService, promoteNewChatAction = SESSIONS_LIST_PROMOTE_NEW_CHAT_ACTION_DEFAULT, sideChatsInSidePane = false): void {
		instantiationService.stub(IChatViewFactory, { newSessionInput: worktreeSuggestionInputPresentation, newSessionPresentation: defaultNewSessionPresentation });
		instantiationService.stub(ITelemetryService, new TestExperimentTriggerTelemetryService());
		instantiationService.stub(IAccessibilityService, { isScreenReaderOptimized: () => false });
		instantiationService.stub(IEnvironmentService, { isBuilt: false });
		instantiationService.stub(IChatEntitlementService, { sentiment: { hidden: configuration.getValue('chat.disableAIFeatures') === true } });
		const contextKeyService = store.add(new ContextKeyService(configuration));
		SessionsListPromoteNewChatActionContext.bindTo(contextKeyService).set(promoteNewChatAction);
		ChatContextKeys.sideChatsInSidePane.bindTo(contextKeyService).set(sideChatsInSidePane);
		instantiationService.stub(IContextKeyService, contextKeyService);
	}

	test('documents optional input features only when the entry supplies them', () => {
		const help = [undefined, worktreeSuggestionInputPresentation].map(newSessionInput => {
			const instantiation = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService();
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiation.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiation, configuration);
			instantiation.stub(IChatViewFactory, { newSessionInput });
			instantiation.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiation.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiation.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			instantiation.stub(ISessionsHostLayoutService, {});
			return store.add(new SessionsChatAccessibilityHelp().getProvider(instantiation)).provideContent();
		});
		assert.deepStrictEqual(help.map(content => content.includes('may suggest New Worktree')), [false, true]);
	});

	test('documents the selected welcome presentation without desktop tray instructions on mobile', () => {
		const help = [defaultNewSessionPresentation, mobileNewSessionPresentation].map(newSessionPresentation => {
			const instantiation = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService();
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiation.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiation, configuration);
			instantiation.stub(IChatViewFactory, { newSessionPresentation });
			instantiation.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiation.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiation.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			instantiation.stub(ISessionsHostLayoutService, {});
			return store.add(new SessionsChatAccessibilityHelp().getProvider(instantiation)).provideContent();
		});
		assert.deepStrictEqual(help.map(content => ({
			collapse: content.includes('Collapse to Icon'),
			modelButton: content.includes('model button beside Add Context opens Configure Session'),
			secondaryControls: content.includes('controls row above the prompt'),
		})), [{ collapse: true, modelButton: false, secondaryControls: false }, { collapse: false, modelButton: true, secondaryControls: true }]);
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
			instantiationService.stub(ISessionsHostLayoutService, {});
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

	test('describes pull request feedback banners only when artifact integrations are disabled', () => {
		const snapshots = [false, true].map(enabled => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({ [ArtifactIntegrationsSettingId]: enabled });
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			instantiationService.stub(ISessionsHostLayoutService, {});
			const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent();
			return {
				pullRequestBanner: content.includes('When pull requests have failing checks or unreviewed comments, one banner appears above the input.'),
				failingChecksBanner: content.includes('use Reveal in its banner item to open that pull request'),
				artifactIntegrations: content.includes(`While the ${ArtifactIntegrationsSettingId} setting is enabled, pull request failing-check and review-comment banners do not appear above the input.`),
			};
		});

		assert.deepStrictEqual(snapshots, [
			{ pullRequestBanner: true, failingChecksBanner: true, artifactIntegrations: false },
			{ pullRequestBanner: false, failingChecksBanner: false, artifactIntegrations: true },
		]);
	});

	test('describes picker shortcuts', () => {
		const getPickerHelp = () => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({});
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			instantiationService.stub(ISessionsHostLayoutService, {});
			return store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent()
				.split('\n')
				.find(line => line.includes('open and focus the workspace picker'));
		};
		const enabledHelp = getPickerHelp();

		assert.deepStrictEqual({
			enabled: enabledHelp !== undefined,
			contextMenuKeybinding: enabledHelp?.includes('<keybinding:editor.action.showContextMenu>'),
			mouseOnly: enabledHelp?.includes('Right-click'),
		}, {
			enabled: true,
			contextMenuKeybinding: true,
			mouseOnly: false,
		});
	});

	test('workspace opt-out help is opt-in and records exposure in both experiment arms', () => {
		const results = [undefined, false, true].map(enabled => {
			const instantiationService = store.add(new TestInstantiationService());
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const configuration = new TestConfigurationService({
				[WORKSPACE_OPT_OUT_SETTING]: enabled,
			});
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			instantiationService.stub(IAccessibilityService, { isScreenReaderOptimized: () => false, onDidChangeScreenReaderOptimized: Event.None });
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ITelemetryService, telemetryService);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			instantiationService.stub(ISessionsHostLayoutService, {});
			const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent();
			return {
				hasOptOutHelp: content.includes('reveal Chat without a workspace'),
				triggers: telemetryService.triggers,
			};
		});
		assert.deepStrictEqual(results, [false, false, true].map(hasOptOutHelp => ({
			hasOptOutHelp,
			triggers: [`config.${WORKSPACE_OPT_OUT_SETTING}`],
		})));
	});

	test('describes controls according to the effective new-session layout', () => {
		const getLayoutHelp = (agentPickerInAttachContext = false, screenReader = false) => {
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(ITelemetryService, new TestExperimentTriggerTelemetryService());
			const configuration = new TestConfigurationService({
				[AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING]: agentPickerInAttachContext,
				[WORKSPACE_OPT_OUT_SETTING]: true,
			});
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			instantiationService.stub(ISessionsHostLayoutService, {});
			instantiationService.stub(IAccessibilityService, { isScreenReaderOptimized: () => screenReader, onDidChangeScreenReaderOptimized: Event.None });
			const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent().split('\n');
			return {
				controls: content.find(line => line.startsWith('Inside the new-session prompt') || line.startsWith('When an Agent picker')),
				sync: content.find(line => line.startsWith('When available for a folder session with incoming or outgoing commits')),
				hasSessionOptions: content.some(line => line.startsWith('Above the new-session input')),
				sessionOptionsMentionsToggle: content.some(line => line.includes('Hide Session Options collapses these controls')),
				hasClearWorkspace: content.some(line => line.includes('Chat without a workspace') && line.includes('You can send without choosing a workspace.')),
			};
		};

		assert.deepStrictEqual([
			getLayoutHelp(),
			getLayoutHelp(false, true),
			getLayoutHelp(true)
		], [
			{
				controls: 'Inside the new-session prompt, the controls appear in this order: Add Context, Agent, Mode and Permissions, and Model. Which controls are available depends on the selected harness. Use Tab to reach the controls, arrow keys to navigate toolbar items, and Enter or Space to open a picker.',
				sync: 'When available for a folder session with incoming or outgoing commits, Sync Changes appears with the commit counts in the same repository toolbar as the worktree and branch controls above the input. It is hidden when New Worktree is selected. Use Tab and the arrow keys to reach it, then Enter or Space to synchronize the session\'s repository. The action is disabled while synchronization is running.',
				hasSessionOptions: true,
				sessionOptionsMentionsToggle: true,
				hasClearWorkspace: true,
			},
			{
				controls: 'Inside the new-session prompt, the controls appear in this order: Add Context, Agent, Mode and Permissions, and Model. Which controls are available depends on the selected harness. Use Tab to reach the controls, arrow keys to navigate toolbar items, and Enter or Space to open a picker.',
				sync: 'When available for a folder session with incoming or outgoing commits, Sync Changes appears with the commit counts in the same repository toolbar as the worktree and branch controls above the input. It is hidden when New Worktree is selected. Use Tab and the arrow keys to reach it, then Enter or Space to synchronize the session\'s repository. The action is disabled while synchronization is running.',
				hasSessionOptions: true,
				sessionOptionsMentionsToggle: false,
				hasClearWorkspace: true,
			},
			{
				controls: 'When an Agent picker is available in a new or running session, it appears in Add Context when the default agent is selected. Open Add Context and choose Agent to select an agent. A one-time spotlight may explain this change. Activate Understood or press Escape to dismiss it, or activate the highlighted Add Context action to open the menu and dismiss the tip. While a custom agent is selected, the Agent picker appears in its usual position. Selecting the default agent moves it back into Add Context. Other new-session controls remain in their layout-specific positions. Use Tab to reach toolbar controls, arrow keys to navigate toolbar items, and Enter or Space to open a picker.',
				sync: 'When available for a folder session with incoming or outgoing commits, Sync Changes appears with the commit counts in the same repository toolbar as the worktree and branch controls above the input. It is hidden when New Worktree is selected. Use Tab and the arrow keys to reach it, then Enter or Space to synchronize the session\'s repository. The action is disabled while synchronization is running.',
				hasSessionOptions: true,
				sessionOptionsMentionsToggle: true,
				hasClearWorkspace: true,
			}
		]);
	});

	test('omits response-selection help when the menu is disabled', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({
			[AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING]: false,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		instantiationService.stub(ISessionsHostLayoutService, {});
		const provider = store.add(new SessionsChatAccessibilityHelp(true).getProvider(instantiationService));

		assert.strictEqual(provider.provideContent().split('\n').find(line => line.startsWith('When you select assistant response text')), undefined);
	});

	test('describes the response-selection menu when enabled', () => {
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
		instantiationService.stub(ISessionsHostLayoutService, {});
		const provider = store.add(new SessionsChatAccessibilityHelp(true).getProvider(instantiationService));

		assert.strictEqual(
			provider.provideContent().split('\n').find(line => line.startsWith('When you select assistant response text')),
			'When you select assistant response text, an action menu appears. Press Tab to focus the menu, use the Up Arrow and Down Arrow keys to move between actions, and press Enter to activate one. Press Escape to dismiss the menu. Ask in a Side Chat opens a question input anchored to the selected text. Quote appends the selection as a blockquote in the chat input when the conversation is interactive. Copy copies the selected text.',
		);
	});

	test('omits response-selection help when the widget is unsupported', () => {
		const selectionHelp = [false, true].map(enhancedSelectionMenu => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({
				[AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING]: enhancedSelectionMenu,
			});
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			stubContextKeyService(instantiationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			instantiationService.stub(ISessionsHostLayoutService, {});
			const provider = store.add(new SessionsChatAccessibilityHelp(false).getProvider(instantiationService));
			return provider.provideContent().split('\n').find(line => line.startsWith('When you select assistant response text'));
		});

		assert.deepStrictEqual(selectionHelp, [undefined, undefined]);
	});

	for (const { configuredValue, expectedConversation, expectedListAction, expectedGroupCloseHelp } of [
		{ configuredValue: undefined, expectedConversation: 'show multiple tabs', expectedListAction: 'show a chat as the session view', expectedGroupCloseHelp: true },
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
			instantiationService.stub(ISessionsHostLayoutService, {});
			const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
			const content = provider.provideContent().split('\n');

			assert.deepStrictEqual({
				conversationDescription: content.some(line => line.includes(expectedConversation)),
				menuAvailability: content.some(line => line.includes(`For sessions that support multiple chats, use Show Chat Tabs in the session overflow menu to ${expectedConversation}.`)),
				sessionListAction: content.some(line => line.includes(expectedListAction)),
				markNestedSessionsRead: content.includes('When a parent session has unread nested sessions, open its context menu and choose Mark Nested Sessions as Read.'),
				pinHelp: content.some(line => line.includes('Pin keeps that chat visible when another chat opens')),
				groupCloseHelp: content.some(line => line.includes('Close removes that chat group')),
				lastGroupCloseHelp: content.some(line => line.includes('Closing the last group closes the session from the grid. Non-main chats are hidden and can be reopened later.')),
			}, {
				conversationDescription: true,
				menuAvailability: true,
				sessionListAction: true,
				markNestedSessionsRead: true,
				pinHelp: expectedGroupCloseHelp,
				groupCloseHelp: expectedGroupCloseHelp,
				lastGroupCloseHelp: expectedGroupCloseHelp,
			});
		});
	}

	test('mobile help omits unavailable background controls and generation even when appearance tools are configured', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ [AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		stubContextKeyService(instantiationService, configuration);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
		instantiationService.stub(ISessionsHostLayoutService, {});
		const content = store.add(new SessionsChatAccessibilityHelp(undefined, false).getProvider(instantiationService)).provideContent();
		assert.deepStrictEqual(['Set Background', 'Change Background Layout', 'Tint Window to Match Background', 'Celebrate button', 'Get Theme Colors', '/generate-chat-background']
			.filter(text => content.includes(text)), []);
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
		instantiationService.stub(ISessionsHostLayoutService, {});
		const content = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService)).provideContent();
		const sessionGridHelp = content.split('\n').find(line => line.includes('Session panes form a separate grid'));

		assert.deepStrictEqual({
			navigation: [
				'workbench.action.navigateLeft',
				'workbench.action.navigateRight',
				'workbench.action.navigateUp',
				'workbench.action.navigateDown',
			].map(commandId => sessionGridHelp?.includes(`<keybinding:${commandId}>`)),
			openInGrid: content.includes('Open in Grid'),
			splitView: content.includes('choose Split View from the Open in submenu of the session row\'s context menu'),
			editorWindow: content.includes('choose Editor Window from the Open in submenu of its context menu in the Sessions list'),
		}, { navigation: [true, true, true, true], openInGrid: false, splitView: true, editorWindow: true });
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
		// The grid's active pane shows the Judge.
		const judgePane = upcastPartial<ITestSessionWithChat>({
			sessionId: 'judge',
			resource: judgeResource,
			activeChat: constObservable(upcastPartial<IChat>({ resource: judgeResource })),
		});
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
			override getActiveSessionView() { return upcastPartial<SessionView>({ getSession: () => judgePane, pane: constObservable(testGridPane(judgePane)), focus: () => { } }); }
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
