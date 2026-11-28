/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { SESSIONS_WORKSPACES_ENABLED_SETTING } from '../../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IViewsService } from '../../../../../../workbench/services/views/common/viewsService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { IAgentWorkbenchLayoutService } from '../../../../../browser/workbench.js';
import { ISessionsHostLayoutService } from '../../../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { IChat, ISessionChangeset, ISessionWorkspace, SessionRepositoryKind, SessionStatus, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../../../../workbench/services/sessions/common/session.js';
import { ISessionInputPickerVisibility, SessionInputPickerVisibility } from '../../../../../../workbench/contrib/sessions/common/sessionPickerVisibility.js';
import { ISendRequestSentEvent, ISessionsManagementService } from '../../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { ISessionChangesService } from '../../../../../../workbench/contrib/sessionChanges/browser/sessionChangesService.js';
import { IOnboardingScenarioService } from '../../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { AgentHostSessionConfigPicker, MobileAgentHostSessionConfigPicker } from '../../../../../../workbench/contrib/sessions/providers/agentHost/browser/agentHostSessionConfigPicker.js';
import { worktreeSuggestionInputPresentation } from '../../../../../../workbench/contrib/sessions/browser/worktreeSuggestion/worktreeSuggestionInputPresentation.js';
import { IWorktreeSuggestionService, WorktreeSuggestionService } from '../../../../../../workbench/contrib/sessions/browser/worktreeSuggestion/worktreeSuggestionService.js';
import { WorktreeSuggestionVariant } from '../../../../../../workbench/contrib/sessions/common/worktreeSuggestion.js';
import { NullWorktreeSuggestionService } from '../../../../../../workbench/contrib/sessions/test/browser/worktreeSuggestion/worktreeSuggestionTestUtils.js';
import { IChatSessionFileChange2 } from '../../../../../../workbench/common/chatSessionFileChange.js';
import '../../../../../../workbench/contrib/sessions/browser/chat/media/chatWidget.css';
import '../../../../../browser/media/style.css';
import { ITestSessionWithChat, testChatSourceOf } from '../../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';

interface IIsolationPickerOptions {
	readonly value: 'worktree' | 'folder';
	readonly devContainer?: boolean;
	/**
	 * Selects a worktree for each Git folder, listing two Git repositories, or with `'kept'` the
	 * session's choice once its two folders are in one repository, which no longer offers it.
	 */
	readonly allFolders?: boolean | 'kept';
	/** Shows the phone repository sheet instead of the desktop dropdown. */
	readonly phone?: boolean;
	/** Suggests a new worktree for a folder with uncommitted files, counted after Branch and listed in the picker. */
	readonly uncommittedFiles?: {
		/** Whether the user already started a session in a new worktree. */
		readonly worktreeSessionCreated: boolean;
	};
}

const UNCOMMITTED_FILES = ['src/app.ts', 'README.md', 'src/todo.ts', 'src/store.ts', 'src/view.ts'];

async function renderIsolationPicker({ container, disposableStore, theme }: ComponentFixtureContext, { value, devContainer = false, allFolders = false, phone = false, uncommittedFiles }: IIsolationPickerOptions): Promise<void> {
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	if (phone) {
		container.classList.add('phone-layout');
		container.style.position = 'relative';
		container.style.boxSizing = 'border-box';
		container.style.contain = 'layout paint';
	}
	container.style.width = phone ? '390px' : '480px';
	container.style.height = phone ? '640px' : uncommittedFiles ? '340px' : '220px';
	container.style.padding = 'var(--vscode-spacing-size160)';
	if (uncommittedFiles) {
		// The Git extension registers the color of modified files, which the fixture's color registry lacks.
		container.style.setProperty('--vscode-gitDecoration-modifiedResourceForeground', theme.getColor('gitDecoration.modifiedResourceForeground')?.toString() ?? 'var(--vscode-editorWarning-foreground)');
	}
	const changed = disposableStore.add(new Emitter<string>());
	const config: ResolveSessionConfigResult = {
		schema: {
			type: 'object',
			properties: {
				[SessionConfigKey.Isolation]: {
					type: 'string',
					title: 'Where to run this session',
					enum: ['folder', 'worktree'],
				},
				...(allFolders ? {
					[SessionConfigKey.WorktreeFolders]: {
						type: 'string',
						title: 'Worktree Folders',
						enum: ['primary', 'all'],
						default: 'primary',
					},
				} : {}),
			},
		},
		values: { [SessionConfigKey.Isolation]: value, ...(allFolders ? { [SessionConfigKey.WorktreeFolders]: 'all' } : {}) },
	};
	const provider = new class extends mock<IAgentHostSessionsProvider>() {
		override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
		override readonly onDidChangeSessionConfig = changed.event;
		override getSessionConfig() { return config; }
		override getCreateSessionConfig() { return {}; }
		override isSessionConfigResolving() { return constObservable(false); }
		override isDevContainerEnabled() { return devContainer; }
		override async setSessionConfigValue(sessionId: string, _chat: URI, property: string, nextValue: unknown) {
			config.values[property] = nextValue;
			changed.fire(sessionId);
		}
		override trackSessionConfigOperation(): void { }
		override async setIsolationMode(): Promise<void> { }
	}();
	const workspace: ISessionWorkspace | undefined = (uncommittedFiles || allFolders) ? {
		label: 'repo',
		icon: { id: 'folder' },
		uri: URI.file('/repo'),
		folders: (allFolders ? ['/repo', '/docs'] : ['/repo']).map(path => ({
			root: URI.file(path),
			workingDirectory: URI.file(path),
			name: path.substring(1),
			description: undefined,
			gitRepository: { uri: URI.file(path), workTreeUri: undefined, baseBranchName: undefined, branchName: 'main', uncommittedChanges: uncommittedFiles ? UNCOMMITTED_FILES.length : 0, gitHubInfo: constObservable(undefined) },
		})),
		...(allFolders ? { repositories: ['/repo', '/docs'].map(path => ({ root: URI.file(allFolders === 'kept' ? '/repo' : path), folder: URI.file(path), kind: SessionRepositoryKind.Folder })) } : {}),
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	} : undefined;
	const changes = UNCOMMITTED_FILES.map((path, index): IChatSessionFileChange2 => ({ uri: URI.file(`/repo/${path}`), modifiedUri: URI.file(`/repo/${path}`), insertions: 12 - index * 2, deletions: index }));
	const chat = new class extends mock<IChat>() {
		override readonly resource = URI.parse('test-chat:/fixture');
		override readonly changesets = constObservable(uncommittedFiles ? [new class extends mock<ISessionChangeset>() {
			override readonly id = UNCOMMITTED_CHANGES_CHANGESET_ID;
			override readonly isEnabled = constObservable(true);
			override readonly isLoadingChanges = constObservable(false);
			override readonly changes = constObservable(changes);
		}()] : undefined);
	}();
	const session = constObservable<ITestSessionWithChat | undefined>(new class extends mock<ITestSessionWithChat>() {
		override readonly sessionId = 'fixture';
		override readonly resource = URI.parse('test-session:/fixture');
		override readonly providerId = provider.id;
		override readonly status = constObservable(SessionStatus.Untitled);
		override readonly loading = constObservable(false);
		override readonly worktreePending = constObservable(false);
		override readonly workspace = constObservable(workspace);
		override readonly activeChat = constObservable(chat);
		override readonly mainChat = constObservable(chat);
	}());
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme, additionalServices: registerWorkbenchServices });
	instantiationService.stub(ISessionInputPickerVisibility, disposableStore.add(new SessionInputPickerVisibility()));
	instantiationService.stub(IProductService, { quality: 'insider' });
	instantiationService.stub(IUriIdentityService, { extUri });
	if (allFolders) {
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(SESSIONS_WORKSPACES_ENABLED_SETTING, true);
		instantiationService.stub(IConfigurationService, configurationService);
	}
	const providers: ISessionsProvider[] = [provider];
	instantiationService.stub(ISessionsProvidersService, {
		onDidChangeProviders: Event.None,
		getProviders: () => providers,
		getProvider: <T extends ISessionsProvider>(id: string) => providers.find(candidate => candidate.id === id) as T | undefined,
	});
	instantiationService.stub(IAgentWorkbenchLayoutService, { mainContainer: container });
	instantiationService.stub(ISessionsHostLayoutService, {});
	instantiationService.stub(ISessionChangesService, {});
	instantiationService.stub(IViewsService, {});
	if (uncommittedFiles) {
		const requestSent = disposableStore.add(new Emitter<ISendRequestSentEvent>());
		instantiationService.stub(ISessionsManagementService, { onDidSendRequest: requestSent.event });
		instantiationService.stub(IChatEntitlementService, { sentimentObs: constObservable({}) });
		instantiationService.stub(IOnboardingScenarioService, {});
		const suggestions = disposableStore.add(instantiationService.createInstance(WorktreeSuggestionService));
		suggestions.setPreview(WorktreeSuggestionVariant.UncommittedFilesCount);
		if (uncommittedFiles.worktreeSessionCreated) {
			requestSent.fire({ session: session.get()!, chat, isNewSession: true, isNewChat: true, newSessionConfig: { isolation: 'worktree', providerConfig: {} }, options: { query: '' } });
		}
		instantiationService.stub(IWorktreeSuggestionService, suggestions);
	} else {
		instantiationService.stub(IWorktreeSuggestionService, new NullWorktreeSuggestionService());
	}
	instantiationService.set(IQuickInputService, new class extends mock<IQuickInputService>() { }());
	instantiationService.set(ILayoutService, new class extends mock<ILayoutService>() {
		override readonly mainContainer = container;
		override readonly activeContainer = container;
		override readonly onDidLayoutContainer = Event.None;
		override getContainer() { return container; }
	}());
	instantiationService.set(IContextViewService, disposableStore.add(instantiationService.createInstance(ContextViewService)));
	instantiationService.set(IActionWidgetService, disposableStore.add(instantiationService.createInstance(ActionWidgetService)));
	const row = dom.append(container, dom.$('.new-chat-session-options'));
	const picker = disposableStore.add(instantiationService.createInstance(phone ? MobileAgentHostSessionConfigPicker : AgentHostSessionConfigPicker, testChatSourceOf(session), {
		property: SessionConfigKey.Isolation,
		isolationPresentation: worktreeSuggestionInputPresentation.createIsolationPicker?.(session, instantiationService),
	}));
	const trigger = picker.render(row);
	picker.setFocusable(true);
	trigger?.click();
	await new Promise<void>(resolve => dom.getWindow(container).requestAnimationFrame(() => resolve()));
	if (phone) {
		const overlay = container.querySelector<HTMLElement>('.mobile-picker-sheet-overlay');
		if (!overlay) {
			throw new Error('Expected the phone repository sheet');
		}
		overlay.style.height = '100%';
		disposableStore.add(toDisposable(() => overlay.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')?.click()));
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/chat/isolationPicker/' }, {
	NewWorktree: defineComponentFixture({
		render: context => renderIsolationPicker(context, { value: 'worktree' }),
	}),
	Branch: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderIsolationPicker(context, { value: 'folder' }),
	}),
	NewWorktreeForAllFolders: defineComponentFixture({
		render: context => renderIsolationPicker(context, { value: 'worktree', allFolders: true }),
	}),
	KeptNewWorktreeForAllFolders: defineComponentFixture({
		render: context => renderIsolationPicker(context, { value: 'worktree', allFolders: 'kept' }),
	}),
	PhoneKeptNewWorktreeForAllFolders: defineComponentFixture({
		render: context => renderIsolationPicker(context, { value: 'worktree', allFolders: 'kept', phone: true }),
	}),
	PhoneNewWorktreeForAllFoldersWithDevContainer: defineComponentFixture({
		render: context => renderIsolationPicker(context, { value: 'folder', allFolders: true, devContainer: true, phone: true }),
	}),
	DevContainer: defineComponentFixture({
		render: context => renderIsolationPicker(context, { value: 'folder', devContainer: true }),
	}),
	UncommittedFiles: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderIsolationPicker(context, { value: 'folder', uncommittedFiles: { worktreeSessionCreated: false } }),
	}),
	UncommittedFilesAfterWorktreeSession: defineComponentFixture({
		render: context => renderIsolationPicker(context, { value: 'folder', uncommittedFiles: { worktreeSessionCreated: true } }),
	}),
});
