/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, append, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { IDelayedHoverOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { findOnboardingTarget, markOnboardingTarget, resolveOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ExtUri } from '../../../../../base/common/resources.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { autorun, constObservable, derived, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { OS } from '../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IMenu, IMenuChangeEvent, IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { IAction, Separator, SubmenuAction } from '../../../../../base/common/actions.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { SessionGroupAppearancePicker } from '../../browser/views/sessionGroupAppearancePicker.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { createUSLayoutResolvedKeybinding } from '../../../../../platform/keybinding/test/common/keybindingsTestUtils.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IListService, ListService, WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService, OpenExternalOptions, OpenInternalOptions } from '../../../../../platform/opener/common/opener.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { SessionSummaryHoverWidget } from '../../../../../workbench/contrib/chat/browser/agentSessions/sessionSummaryHover.js';
import { AICustomizationManagementEditorInput } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { SpotlightPresentation } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightPresentation.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { OnboardingOutcome } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { TestHostService, TestLayoutService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import '../../../../../workbench/browser/actions/listCommands.js';
import { AgentMergeSessionState } from '../../../../../platform/agentHost/common/agentMerge.js';
import { getSessionChatDragData, isSessionChatDrag, SessionsDataTransfers } from '../../../../browser/dnd.js';
import { IsPhoneLayoutContext, SessionIsArchivedContext, SessionSupportsMultipleChatsContext } from '../../../../common/contextkeys.js';
import { ARCHIVE_CHAT_COMMAND_ID, ARCHIVE_SESSION_COMMAND_ID, ARCHIVE_SESSION_GROUP_COMMAND_ID, ARCHIVE_SESSIONS_WITH_UNDO_COMMAND_ID, SHOW_SESSION_APPLICATION_FILTERS_COMMAND_ID, UNARCHIVE_CHAT_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { getSessionApplication } from '../../../../common/sessionApplication.js';
import { ExternalSessionApplicationBadgeMode, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING, SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING } from '../../../../common/sessionConfig.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import type { ICustomViewDescriptor } from '../../../../services/customView/browser/customView.js';
import { ISessionsListModelService, SessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionGroup, ISessionGroupsChangeEvent, ISessionGroupsService, SessionGroupsService, SessionGroupTree } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionSectionOrderService, SessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { BRANCH_CHANGES_CHANGESET_ID, ChatInteractivity, ChatOriginKind, IChat, ISession, ISessionChangeset, ISessionChangesSummary, ISessionFileChange, ISessionFolder, ISessionType, SessionArtifactKind, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangeEvent, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { computeReorderSortChanges, groupByDate, groupByEnvironment, groupByRepository, groupByWorkspace, groupSessionsForList, ISessionChatItem, ISessionSection, limitSessionsForList, NEW_SESSION_IN_ENVIRONMENT_ACTION_ID, QUICK_CHATS_SECTION_ID, SessionChatItemCanArchiveContext, SessionChatItemCanDeleteContext, SessionChatItemIsArchivedContext, SessionChatItemIsUntitledContext, SessionItemInExternalSectionContext, SessionItemIsCloudContext, SessionSectionRenderer, SessionSectionToolbarMenuId, SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING, SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING, SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING, SessionsFlatList, SessionsList, SessionsListFocusedChatItemContext, sortSessions, SessionsGrouping, SessionsSorting } from '../../browser/views/sessionsList.js';
import { AgentSessionApprovalKind, AgentSessionApprovalModel, IAgentSessionApprovalInfo } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { IChatService, IChatToolInvocation } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatToolInvocation } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatAgentService, IChatAgentService } from '../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { ToolDataSource } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { MockChatService } from '../../../../../workbench/contrib/chat/test/common/chatService/mockChatService.js';
import { getChatSummaryHoverData, getSessionDiffStats, getSessionSummaryHoverData } from '../../browser/sessionHoverContent.js';
import { createListHarness, createTestSession, IListHarnessOptions, ISortChangeRecord, TestSessionsManagementService } from './sessionsListTestUtils.js';
import { SessionsArchiveActionsContribution } from '../../browser/views/sessionsViewActions.js';
import { renderSessionsHeader } from '../../browser/views/sessionsView.js';
import { computePullRequestIcon, GitHubPullRequestState } from '../../../github/common/types.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../browser/automationsConstants.js';
import { OPEN_AI_CUSTOMIZATIONS_COMMAND_ID } from '../../browser/customizationsConstants.js';
import { OPEN_SESSION_COMPARISON_COMMAND_ID } from '../../../sessionComparison/common/sessionComparison.js';
import { BlockedSessionReason, BlockedSessions } from '../../../blockedSessions/browser/blockedSessions.js';
import { NEW_SESSION_ACTION_ID } from '../../../chat/common/constants.js';
import { Menus } from '../../../../browser/menus.js';
import { buildTestSession } from '../../../../services/sessions/test/common/testSessionBuilder.js';
import { TestSessionsList } from './testSessionsList.js';
import { getSessionEnvironments } from '../../browser/views/sessionsListFilters.js';

function clickRow(row: HTMLElement): void {
	row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
	row.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
}

function createSession(id: string, opts: {
	workspaceLabel?: string;
	workspaceResource?: URI;
	folders?: ISessionFolder[];
	createdAt?: Date;
	updatedAt?: Date;
	isArchived?: boolean;
	isRead?: boolean;
	isAutomation?: boolean;
	isExternal?: boolean;
	resource?: URI;
}): ISession & { readonly isArchived: ISettableObservable<boolean, void>; readonly isRead: ISettableObservable<boolean, void> } {
	const createdAt = opts.createdAt ?? new Date();
	const updatedAt = opts.updatedAt ?? createdAt;
	const isArchived = observableValue(`isArchived-${id}`, opts.isArchived ?? false);
	const isRead = observableValue(`isRead-${id}`, opts.isRead ?? true);
	const mainChat = upcastPartial<IChat>({ updatedAt: constObservable(updatedAt), isRead, changes: constObservable([]), changesets: constObservable([]) });
	return {
		sessionId: id,
		resource: opts.resource ?? URI.parse(`session://${id}`),
		providerId: 'test',
		sessionType: 'test',
		harness: 'copilot',
		environment: 'local',
		application: constObservable({ id: 'vscode', label: 'VS Code' }),
		icon: Codicon.account,
		createdAt,
		workspace: observableValue(`workspace-${id}`, opts.workspaceLabel !== undefined ? {
			uri: opts.workspaceResource ?? URI.parse(`session://workspace/${id}`),
			label: opts.workspaceLabel,
			icon: Codicon.folder,
			folders: opts.folders ?? [],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		} : undefined),
		isQuickChat: observableValue(`isQuickChat-${id}`, opts.workspaceLabel === undefined),
		isAutomation: observableValue(`isAutomation-${id}`, opts.isAutomation === true),
		isExternal: observableValue(`isExternal-${id}`, opts.isExternal === true),
		title: observableValue(`title-${id}`, id),
		updatedAt: observableValue(`updatedAt-${id}`, updatedAt),
		status: observableValue(`status-${id}`, SessionStatus.Completed),
		modelId: observableValue(`modelId-${id}`, undefined),
		mode: observableValue(`mode-${id}`, undefined),
		loading: observableValue(`loading-${id}`, false),
		isArchived,
		isRead,
		description: observableValue(`description-${id}`, undefined),
		lastTurnEnd: observableValue(`lastTurnEnd-${id}`, undefined),
		chats: observableValue<readonly IChat[]>(`chats-${id}`, []),
		mainChat: observableValue<IChat>(`mainChat-${id}`, mainChat),
		capabilities: constObservable({ supportsMultipleChats: false }),
	};
}

suite('Sessions - SessionsList', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const noHeaderStatusTrigger = { pending: constObservable(false), includeExpanded: constObservable(false), report: () => { } };
	const noKeybindingService = new class extends mock<IKeybindingService>() { };

	suite('catalogue refresh scheduling', () => {
		async function nextFrame(): Promise<void> {
			await new Promise<void>(resolve => {
				disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve(), -1000));
			});
		}

		async function createFixture() {
			const original = createTestSession('Original').session;
			const changes = disposables.add(new Emitter<ISessionChangeEvent>());
			const providers = disposables.add(new Emitter<ISessionsProvidersChangeEvent>());
			const hosts = disposables.add(new Emitter<void>());
			let reads = 0;
			const management = new class extends TestSessionsManagementService {
				override readonly onDidChangeSessions = changes.event;
				override getSessions(): ISession[] {
					reads++;
					return super.getSessions();
				}
			}([original]);
			const harness = createListHarness(disposables, [original], instantiationService => {
				instantiationService.stub(ISessionsManagementService, management);
				instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
					override readonly onDidChangeProviders = providers.event;
					override getProviders(): ISessionsProvider[] { return []; }
				});
				instantiationService.stub(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
					override readonly onDidChange = hosts.event;
					override readonly selectedHost = undefined;
				});
			});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(400, 400);
			await nextFrame();
			reads = 0;
			let updates = 0;
			harness.store.add(list.onDidUpdate(() => updates++));
			const invalidateCatalogue = () => {
				hosts.fire();
				changes.fire({ added: [], removed: [], changed: [] });
				providers.fire({ added: [], removed: [] });
			};
			return {
				harness, list, management, original, changes, invalidateCatalogue,
				counts: () => ({ reads, updates }),
				titles: () => [...container.querySelectorAll('.session-title')].map(element => element.textContent),
			};
		}

		test('coalesces provider, catalogue and host invalidations while preserving focus and selection', async () => {
			const fixture = await createFixture();
			fixture.list.setFocusedItem({ session: fixture.original.resource });
			fixture.list.setSelectedItems([{ session: fixture.original.resource }]);
			fixture.list.focus();
			const added = createTestSession('Added').session;
			fixture.management.sessions = [fixture.original, added];
			for (let index = 0; index < 125; index++) {
				fixture.invalidateCatalogue();
			}
			const before = fixture.counts();
			await nextFrame();

			assert.deepStrictEqual({
				before, after: fixture.counts(),
				titles: fixture.titles().sort(),
				focused: fixture.list.getFocusedSessions()?.map(session => session.sessionId),
				selected: fixture.list.getItemRow({ session: fixture.original.resource })?.getAttribute('aria-selected'),
			}, {
				before: { reads: 0, updates: 0 }, after: { reads: 1, updates: 1 },
				titles: ['Added', 'Original'], focused: [fixture.original.sessionId], selected: 'true',
			});
		});

		for (const operation of ['added', 'removed', 'changed'] as const) {
			test(`keeps concrete session ${operation} synchronous and cancels a redundant queued refresh`, async () => {
				const fixture = await createFixture();
				fixture.invalidateCatalogue();
				const replacement = createTestSession('Replacement').session;
				fixture.management.sessions = operation === 'removed' ? [] : [replacement];
				fixture.changes.fire({
					added: operation === 'added' ? [replacement] : [],
					removed: operation === 'removed' ? [fixture.original] : [],
					changed: operation === 'changed' ? [replacement] : [],
				});
				const immediate = { ...fixture.counts(), titles: fixture.titles() };
				await nextFrame();

				assert.deepStrictEqual({ immediate, after: fixture.counts() }, {
					immediate: { reads: operation === 'removed' ? 2 : 1, updates: 1, titles: operation === 'removed' ? [] : ['Replacement'] },
					after: { reads: operation === 'removed' ? 2 : 1, updates: 1 },
				});
			});
		}

		for (const explicit of ['refresh', 'update'] as const) {
			test(`an explicit ${explicit} reads the latest pending catalogue synchronously`, async () => {
				const fixture = await createFixture();
				fixture.management.sessions = [createTestSession('Latest').session];
				fixture.invalidateCatalogue();
				if (explicit === 'update') {
					fixture.list.update(true);
				} else {
					fixture.list.refresh();
				}
				const beforeFrame = fixture.counts();
				await nextFrame();

				assert.deepStrictEqual({
					beforeFrame, afterFrame: fixture.counts(),
					titles: fixture.titles(),
				}, {
					beforeFrame: { reads: 1, updates: 1 }, afterFrame: { reads: 1, updates: 1 },
					titles: ['Latest'],
				});
			});
		}

		test('does not render a hidden list and refreshes its latest catalogue when shown', async () => {
			const fixture = await createFixture();
			fixture.invalidateCatalogue();
			fixture.list.setVisible(false);
			fixture.management.sessions = [createTestSession('Latest').session];
			fixture.invalidateCatalogue();
			await nextFrame();
			const hidden = fixture.counts();
			fixture.list.setVisible(true);
			const shown = { ...fixture.counts(), titles: fixture.titles() };
			await nextFrame();

			assert.deepStrictEqual({ hidden, shown, settled: fixture.counts() }, {
				hidden: { reads: 0, updates: 0 }, shown: { reads: 1, updates: 1, titles: ['Latest'] },
				settled: { reads: 1, updates: 1 },
			});
		});

		test('cancels pending work when the list is disposed', async () => {
			const fixture = await createFixture();
			fixture.invalidateCatalogue();
			fixture.list.dispose();
			await nextFrame();
			assert.deepStrictEqual(fixture.counts(), { reads: 0, updates: 0 });
		});

		test('does not lose catalogue changes raised while rendering', async () => {
			const fixture = await createFixture();
			fixture.harness.store.add(Event.once(fixture.list.onDidUpdate)(() => {
				fixture.management.sessions = [createTestSession('Latest').session];
				fixture.invalidateCatalogue();
			}));
			fixture.invalidateCatalogue();
			await nextFrame();
			await nextFrame();
			assert.deepStrictEqual({ ...fixture.counts(), titles: fixture.titles() }, {
				reads: 2, updates: 2, titles: ['Latest'],
			});
		});
	});

	test('uses the large radius token for list hovers even when pointer styles load later', () => {
		const pointerStyle = $('style');
		pointerStyle.textContent = '.monaco-hover.workbench-hover.with-pointer { border-radius: 3px; }';
		append(mainWindow.document.head, pointerStyle);
		disposables.add(toDisposable(() => pointerStyle.remove()));
		const hover = $('.monaco-hover.workbench-hover.with-pointer.sessions-list-hover');
		append(mainWindow.document.body, hover);
		disposables.add(toDisposable(() => hover.remove()));
		const readCorners = () => {
			const style = mainWindow.getComputedStyle(hover);
			return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
		};
		hover.style.setProperty('--vscode-cornerRadius-large', '8px');
		const initial = readCorners();
		hover.style.setProperty('--vscode-cornerRadius-large', '12px');
		assert.deepStrictEqual({ initial, updated: readCorners() }, {
			initial: ['8px', '8px', '8px', '8px'],
			updated: ['12px', '12px', '12px', '12px'],
		});
	});

	suite('SessionSectionRenderer', () => {

		test('selects the rendered section before the toolbar handles its context menu', () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stubInstance(MenuWorkbenchToolBar, new class extends mock<MenuWorkbenchToolBar>() {
				override set context(_context: unknown) { }
				override dispose(): void { }
			});
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const automationService = new class extends mock<IAutomationService>() {
				override readonly runs = constObservable<readonly IAutomationRun[]>([]);
			};
			const selectedSections: ISessionSection[] = [];
			const renderer = new SessionSectionRenderer(
				true,
				section => selectedSections.push(section),
				constObservable(true),
				constObservable(new Set<string>()),
				noHeaderStatusTrigger,
				instantiationService,
				NullHoverService,
				contextKeyService,
				automationService,
				constObservable([]),
				new class extends mock<IUriIdentityService>() {
					override readonly extUri = new ExtUri(() => true);
				},
				new class extends mock<ICustomViewService>() { },
				new class extends mock<IMenuService>() { },
				noKeybindingService,
				constObservable(false),
			);
			const container = document.createElement('div');
			const template = renderer.renderTemplate(container);
			disposables.add(template.disposables);
			const section: ISessionSection = { id: 'workspace:test', label: 'Test', sessions: [] };
			renderer.renderElement(upcastPartial<Parameters<SessionSectionRenderer['renderElement']>[0]>({
				element: section,
				collapsible: true,
				collapsed: false,
			}), 0, template);
			const action = document.createElement('a');
			template.toolbarContainer.append(action);
			action.addEventListener('contextmenu', event => event.stopPropagation());

			action.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));

			assert.deepStrictEqual(selectedSections, [section]);
		});

		test('shows migration guidance in the Customizations hover', () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stubInstance(MenuWorkbenchToolBar, new class extends mock<MenuWorkbenchToolBar>() {
				override set context(_context: unknown) { }
				override dispose(): void { }
			});
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const automationService = new class extends mock<IAutomationService>() {
				override readonly runs = constObservable<readonly IAutomationRun[]>([]);
			};
			let hoverOptions: Parameters<IHoverService['setupDelayedHover']>[1] | undefined;
			const hoverService = new class extends mock<IHoverService>() {
				override setupDelayedHover(...args: Parameters<IHoverService['setupDelayedHover']>): ReturnType<IHoverService['setupDelayedHover']> {
					hoverOptions = args[1];
					return NullHoverService.setupDelayedHover(...args);
				}
			};
			const customizationMigrationsAvailable = observableValue(disposables, true);
			const renderer = new SessionSectionRenderer(
				true,
				() => { },
				constObservable(true),
				constObservable(new Set<string>()),
				noHeaderStatusTrigger,
				instantiationService,
				hoverService,
				contextKeyService,
				automationService,
				constObservable([]),
				new class extends mock<IUriIdentityService>() {
					override readonly extUri = new ExtUri(() => true);
				},
				new class extends mock<ICustomViewService>() { },
				new class extends mock<IMenuService>() { },
				noKeybindingService,
				constObservable(false),
				customizationMigrationsAvailable,
			);
			const container = document.createElement('div');
			const template = renderer.renderTemplate(container);
			disposables.add(template.disposables);
			renderer.renderElement(upcastPartial<Parameters<SessionSectionRenderer['renderElement']>[0]>({
				element: { id: 'customizations', label: 'Customizations', sessions: [] },
				collapsible: false,
				collapsed: false,
			}), 0, template);
			const readHoverOptions = () => typeof hoverOptions === 'function' ? hoverOptions() : hoverOptions;
			const hoverWithMigration = readHoverOptions();
			customizationMigrationsAvailable.set(false, undefined);

			assert.deepStrictEqual({
				contentWithMigration: hoverWithMigration?.content,
				contentWithoutMigration: readHoverOptions()?.content,
				presentation: hoverWithMigration && {
					additionalClasses: hoverWithMigration.additionalClasses,
					appearance: hoverWithMigration.appearance,
					position: hoverWithMigration.position,
					persistence: hoverWithMigration.persistence,
				},
			}, {
				contentWithMigration: 'Some customizations need an update to keep working.',
				contentWithoutMigration: 'Customizations',
				presentation: {
					additionalClasses: ['sessions-list-hover'],
					appearance: { showPointer: true },
					position: { hoverPosition: HoverPosition.RIGHT, forcePosition: true },
					persistence: { hideOnHover: false },
				},
			});
		});

		test('signals extension suggestions on the Customizations entry unless migrations need attention', () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stubInstance(MenuWorkbenchToolBar, new class extends mock<MenuWorkbenchToolBar>() {
				override set context(_context: unknown) { }
				override dispose(): void { }
			});
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const automationService = new class extends mock<IAutomationService>() {
				override readonly runs = constObservable<readonly IAutomationRun[]>([]);
			};
			let hoverOptions: Parameters<IHoverService['setupDelayedHover']>[1] | undefined;
			const hoverService = new class extends mock<IHoverService>() {
				override setupDelayedHover(...args: Parameters<IHoverService['setupDelayedHover']>): ReturnType<IHoverService['setupDelayedHover']> {
					hoverOptions = args[1];
					return NullHoverService.setupDelayedHover(...args);
				}
			};
			const customizationMigrationsAvailable = observableValue(disposables, false);
			const customizationExtensionSuggestionsAvailable = observableValue(disposables, true);
			const renderer = new SessionSectionRenderer(
				true,
				() => { },
				constObservable(true),
				constObservable(new Set<string>()),
				noHeaderStatusTrigger,
				instantiationService,
				hoverService,
				contextKeyService,
				automationService,
				constObservable([]),
				new class extends mock<IUriIdentityService>() {
					override readonly extUri = new ExtUri(() => true);
				},
				new class extends mock<ICustomViewService>() { },
				new class extends mock<IMenuService>() { },
				noKeybindingService,
				constObservable(false),
				customizationMigrationsAvailable,
				undefined,
				undefined,
				undefined,
				undefined,
				customizationExtensionSuggestionsAvailable,
			);
			const container = document.createElement('div');
			const template = renderer.renderTemplate(container);
			disposables.add(template.disposables);
			renderer.renderElement(upcastPartial<Parameters<SessionSectionRenderer['renderElement']>[0]>({
				element: { id: 'customizations', label: 'Customizations', sessions: [] },
				collapsible: false,
				collapsed: false,
			}), 0, template);
			const readState = () => ({
				hover: (typeof hoverOptions === 'function' ? hoverOptions() : hoverOptions)?.content,
				hasDot: template.icon.classList.contains('codicon-circle-filled'),
				iconColor: template.icon.style.color,
			});
			const withSuggestions = readState();
			customizationMigrationsAvailable.set(true, undefined);
			const withMigrations = readState();
			customizationMigrationsAvailable.set(false, undefined);
			customizationExtensionSuggestionsAvailable.set(false, undefined);

			assert.deepStrictEqual({ withSuggestions, withMigrations, withoutSignals: readState() }, {
				withSuggestions: {
					hover: 'Some installed extensions can be enabled in the Agents window.',
					hasDot: true,
					iconColor: 'var(--vscode-activityBarBadge-background)',
				},
				withMigrations: {
					hover: 'Some customizations need an update to keep working.',
					hasDot: true,
					iconColor: 'var(--vscode-activityBarBadge-background)',
				},
				withoutSignals: {
					hover: 'Customizations',
					hasDot: false,
					iconColor: '',
				},
			});
		});

		test('renders in-progress automation status in the leading icon slot', () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stubInstance(MenuWorkbenchToolBar, new class extends mock<MenuWorkbenchToolBar>() {
				override set context(_context: unknown) { }
				override dispose(): void { }
			});
			instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
				override isMotionReduced(): boolean { return false; }
			}());
			instantiationService.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() { });
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const automationService = new class extends mock<IAutomationService>() {
				override readonly runs = constObservable<readonly IAutomationRun[]>([{
					id: 'pending',
					automationId: 'automation',
					status: 'pending',
					trigger: 'schedule',
					startedAt: '2026-08-14T00:00:00.000Z',
				}]);
			};
			const renderer = new SessionSectionRenderer(
				true,
				() => { },
				constObservable(true),
				constObservable(new Set<string>()),
				noHeaderStatusTrigger,
				instantiationService,
				NullHoverService,
				contextKeyService,
				automationService,
				constObservable([]),
				new class extends mock<IUriIdentityService>() {
					override readonly extUri = new ExtUri(() => true);
				},
				new class extends mock<ICustomViewService>() {
					override readonly activeCustomView = constObservable(undefined);
				},
				new class extends mock<IMenuService>() { },
				noKeybindingService,
				constObservable(false),
			);
			const container = document.createElement('div');
			const template = renderer.renderTemplate(container);
			disposables.add(template.disposables);

			renderer.renderElement(upcastPartial<Parameters<SessionSectionRenderer['renderElement']>[0]>({
				element: { id: 'automations', label: 'Automations', sessions: [] },
				collapsible: false,
				collapsed: false,
			}), 0, template);

			const spinner = container.querySelector('.monaco-pixel-spinner');
			assert.deepStrictEqual({
				watchIcon: !!container.querySelector('.session-section-icon.codicon-watch'),
				spinnerParent: spinner?.parentElement?.className,
				newBadge: !!container.querySelector('.session-section-new-badge'),
				trailingStatusIndicator: !!container.querySelector('.session-section-status-indicator'),
			}, {
				watchIcon: false,
				spinnerParent: 'session-section-icon',
				newBadge: false,
				trailingStatusIndicator: false,
			});
		});

		test('keeps New Session inactive when Automations opens', () => {
			const activeCustomView = observableValue<ICustomViewDescriptor | undefined>(disposables, undefined);
			const draftSession = createTestSession('draft').session;
			const activeSession = observableValue<IActiveSession | undefined>(disposables, upcastPartial<IActiveSession>({
				...draftSession,
				isCreated: constObservable(false),
				activeChat: draftSession.mainChat,
			}));
			const harness = createListHarness(disposables, [], instantiationService => {
				ChatAutomationsEnabledContext.bindTo(instantiationService.get(IContextKeyService)).set(true);
				instantiationService.stub(IAutomationService, new class extends mock<IAutomationService>() {
					override readonly automations = constObservable([]);
					override readonly runs = constObservable([]);
					override readonly catalogueState = constObservable('ready' as const);
				});
				instantiationService.stub(ICustomViewService, new class extends mock<ICustomViewService>() {
					override readonly activeCustomView = activeCustomView;
				});
				instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
					override readonly activeSession = activeSession;
					override readonly visibleSessions = constObservable<readonly IActiveSession[]>([]);
				});
			});
			const container = harness.createContainer();
			const navigationContainer = mainWindow.document.createElement('div');
			const listContainer = mainWindow.document.createElement('div');
			container.append(navigationContainer, listContainer);
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, listContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				showNavigationShortcuts: () => true,
				navigationContainer,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const findRow = (label: string) => Array.from(navigationContainer.querySelectorAll<HTMLElement>('.monaco-list-row'))
				.find(row => row.querySelector('.session-section-label')?.textContent === label);
			const newRow = findRow('New Session');
			const automationsRow = findRow('Automations');
			const before = {
				newActive: newRow?.classList.contains('active'),
				newAriaCurrent: newRow?.getAttribute('aria-current'),
				automationsActive: automationsRow?.classList.contains('active'),
			};

			activeCustomView.set(upcastPartial<ICustomViewDescriptor>({ id: AUTOMATIONS_CUSTOM_VIEW_ID }), undefined);

			assert.deepStrictEqual({
				before,
				after: {
					newActive: newRow?.classList.contains('active'),
					newAriaCurrent: newRow?.getAttribute('aria-current'),
					automationsActive: automationsRow?.classList.contains('active'),
				},
			}, {
				before: {
					newActive: false,
					newAriaCurrent: null,
					automationsActive: false,
				},
				after: {
					newActive: false,
					newAriaCurrent: null,
					automationsActive: true,
				},
			});
		});

		for (const activation of ['click', 'keyboard'] as const) {
			test(`spotlights the New Session navigation row and completes via ${activation} activation`, async () => {
				const harness = createListHarness(disposables, [], instantiationService => {
					instantiationService.stub(IListService, disposables.add(new ListService()));
				});
				const container = harness.createContainer();
				const headerButton = mainWindow.document.createElement('button');
				headerButton.textContent = 'New';
				headerButton.style.display = 'none';
				harness.store.add(markOnboardingTarget(headerButton, 'sessions.newSession.button'));
				const navigationContainer = mainWindow.document.createElement('div');
				const listContainer = mainWindow.document.createElement('div');
				container.append(headerButton, navigationContainer, listContainer);
				let showNavigationShortcuts = true;
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, listContainer, {
					grouping: () => SessionsGrouping.Date,
					sorting: () => SessionsSorting.Created,
					showNavigationShortcuts: () => showNavigationShortcuts,
					navigationContainer,
					onSessionOpen: () => { },
				}));
				list.layout(300, 400);
				list.focusCustomizations();

				const target = resolveOnboardingTarget(mainWindow, 'sessions.newSession.button');
				assert.ok(target?.onDidActivate);
				const targetsNavigationRow = target.element === navigationContainer.querySelector('.session-section-new-session');
				let activations = 0;
				harness.store.add(target.onDidActivate(() => activations++));
				const presentation = harness.store.add(new SpotlightPresentation(
					new class extends TestLayoutService { override getContainer(): HTMLElement { return container; } }(),
					new TestHostService(), harness.instantiationService.get(IContextKeyService),
				));
				const shown = new DeferredPromise<void>();
				const result = presentation.run({
					id: 'test.newSessionNavigation',
					trigger: { kind: 'auto' },
					presentation: {
						kind: SPOTLIGHT_PRESENTATION_KIND,
						payload: {
							steps: [{
								id: 'newSession', targetId: 'sessions.newSession.button', title: 'New Session', description: 'Start another task.',
								allowTargetInteraction: true, advanceOnTargetClick: true, hideNext: false,
							}],
						} satisfies ISpotlightPayload,
					},
				}, { targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => { void shown.complete(); } });
				await shown.p;

				if (activation === 'click') {
					target.element.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
				} else {
					const next = [...container.querySelectorAll<HTMLElement>('.spotlight-callout-actions .monaco-button')].at(-1)!;
					next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
					const navigation = navigationContainer.querySelector<HTMLElement>('.monaco-list')!;
					assert.deepStrictEqual({
						focused: mainWindow.document.activeElement === navigation,
						newSessionFocused: target.element.closest('.monaco-list-row')?.classList.contains('focused'),
					}, { focused: true, newSessionFocused: true });
					navigation.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, shiftKey: true, bubbles: true, cancelable: true }));
					assert.strictEqual(mainWindow.document.activeElement, next);
					next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
					// Hidden Electron windows update activeElement without emitting native focus events.
					if (!mainWindow.document.hasFocus()) {
						navigation.dispatchEvent(new FocusEvent('focus'));
					}
					harness.instantiationService.invokeFunction(CommandsRegistry.getCommand('list.select')!.handler);
				}
				const outcome = (await result).outcome;

				showNavigationShortcuts = false;
				list.updateNavigationVisibility();
				const targetAfterRemoval = resolveOnboardingTarget(mainWindow, 'sessions.newSession.button');
				const markerAfterRemoval = target.element.hasAttribute('data-onboarding-id');
				headerButton.style.display = '';

				assert.deepStrictEqual({
					targetsNavigationRow,
					activations,
					outcome,
					overlayRemaining: !!container.querySelector('.spotlight-callout'),
					commands: harness.commandService.calls,
					targetAfterRemoval,
					markerAfterRemoval,
					targetsHeader: resolveOnboardingTarget(mainWindow, 'sessions.newSession.button')?.element === headerButton,
				}, {
					targetsNavigationRow: true,
					activations: 1,
					outcome: OnboardingOutcome.Completed,
					overlayRemaining: false,
					commands: [{ commandId: NEW_SESSION_ACTION_ID, args: [undefined] }],
					targetAfterRemoval: undefined,
					markerAfterRemoval: false,
					targetsHeader: true,
				});
			});
		}

		test('opens migrations from Customizations only while migration attention is active', async () => {
			const customizationMigrationsAvailable = observableValue(disposables, true);
			const harness = createListHarness(disposables, []);
			const container = harness.createContainer();
			const navigationContainer = mainWindow.document.createElement('div');
			const listContainer = mainWindow.document.createElement('div');
			container.append(navigationContainer, listContainer);
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, listContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				showNavigationShortcuts: () => true,
				customizationMigrationsAvailable,
				navigationContainer,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const customizationsRow = navigationContainer.querySelector<HTMLElement>('.session-section-customizations');
			assert.ok(customizationsRow);

			clickRow(customizationsRow);
			await Promise.resolve();
			customizationMigrationsAvailable.set(false, undefined);
			clickRow(customizationsRow);
			await Promise.resolve();

			assert.deepStrictEqual(harness.commandService.calls, [{
				commandId: OPEN_AI_CUSTOMIZATIONS_COMMAND_ID,
				args: [{ migration: true }],
			}, {
				commandId: OPEN_AI_CUSTOMIZATIONS_COMMAND_ID,
				args: [],
			}]);
		});

		test('switches the navigation treatment without disturbing Find focus', async () => {
			const commands: string[] = [];
			const activeEditorChanged = disposables.add(new Emitter<void>());
			const keybindingsChanged = disposables.add(new Emitter<void>());
			const editorState: { activeEditor?: AICustomizationManagementEditorInput } = {};
			const customizationsCount = observableValue(disposables, 7);
			const customizationMigrationsAvailable = observableValue(disposables, true);
			const activeCustomView = observableValue<ICustomViewDescriptor | undefined>(disposables, undefined);
			const keybindingLookupContexts: (IContextKeyService | undefined)[] = [];
			const createNewSessionKeybinding = (keybinding: number) => {
				const resolved = createUSLayoutResolvedKeybinding(keybinding, OS);
				assert.ok(resolved);
				return resolved;
			};
			let newSessionKeybinding = createNewSessionKeybinding(KeyMod.CtrlCmd | KeyCode.KeyN);
			const harness = createListHarness(disposables, [], instantiationService => {
				instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
					override async executeCommand<R>(commandId: string): Promise<R | undefined> {
						commands.push(commandId);
						return undefined;
					}
				});
				ChatAutomationsEnabledContext.bindTo(instantiationService.get(IContextKeyService)).set(true);
				instantiationService.stub(IAutomationService, new class extends mock<IAutomationService>() {
					override readonly automations = constObservable([]);
					override readonly runs = constObservable([]);
					override readonly catalogueState = constObservable('ready' as const);
				});
				instantiationService.stub(ICustomViewService, new class extends mock<ICustomViewService>() {
					override readonly activeCustomView = activeCustomView;
				});
				instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
					override readonly onDidActiveEditorChange = activeEditorChanged.event;
					override get activeEditor(): AICustomizationManagementEditorInput | undefined {
						return editorState.activeEditor;
					}
				});
				instantiationService.stub(IKeybindingService, new class extends MockKeybindingService {
					override get onDidUpdateKeybindings() { return keybindingsChanged.event; }
					override lookupKeybinding(commandId: string, context?: IContextKeyService) {
						if (commandId !== NEW_SESSION_ACTION_ID) {
							return undefined;
						}
						keybindingLookupContexts.push(context);
						return newSessionKeybinding;
					}
				});
			});
			const container = harness.createContainer();
			const navigationContainer = mainWindow.document.createElement('div');
			const sessionsHeader = mainWindow.document.createElement('div');
			const findWidgetContainer = mainWindow.document.createElement('div');
			sessionsHeader.appendChild(findWidgetContainer);
			const listContainer = mainWindow.document.createElement('div');
			container.append(navigationContainer, sessionsHeader, listContainer);
			let showNavigationShortcuts = false;
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, listContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				showNavigationShortcuts: () => showNavigationShortcuts,
				customizationsCount,
				customizationMigrationsAvailable,
				navigationContainer,
				findWidgetContainer,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			list.openFind();
			const findInput = findWidgetContainer.querySelector<HTMLInputElement>('input');
			const focusBeforeSwitch = mainWindow.document.activeElement;

			showNavigationShortcuts = true;
			list.updateNavigationVisibility();
			const focusInTreatment = mainWindow.document.activeElement;
			const treatmentNavigationLabels = Array.from(navigationContainer.querySelectorAll('.session-section-shortcut .session-section-label'), element => element.textContent);
			const treatmentAriaLabels = Array.from(navigationContainer.querySelectorAll('.monaco-list-rows > .monaco-list-row'), element => element.getAttribute('aria-label'));
			const shortcutActionTargets = Array.from(navigationContainer.querySelectorAll('.session-section-shortcut'), element => element.querySelectorAll('a, button').length);
			const newSessionKeybindingVisible = navigationContainer.querySelector('.session-section-new-session .session-section-keybinding')?.classList.contains('visible');
			const shortcutCollapseStates = Array.from(navigationContainer.querySelectorAll('.session-section-shortcut'), element => ({
				ariaExpanded: element.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
				hasChevron: element.querySelector('.session-section-chevron.collapsible') !== null,
			}));
			const customizationsSection = Array.from(navigationContainer.querySelectorAll<HTMLElement>('.session-section-shortcut'))
				.find(element => element.querySelector('.session-section-label')?.textContent === 'Customizations');
			const automationsSection = Array.from(navigationContainer.querySelectorAll<HTMLElement>('.session-section-shortcut'))
				.find(element => element.querySelector('.session-section-label')?.textContent === 'Automations');
			const customizationsIcon = customizationsSection?.querySelector<HTMLElement>('.session-section-icon');
			const customizationsPresentation = {
				hasTotalCountBadge: customizationsSection?.querySelector('.monaco-count-badge') !== null,
				hasMigrationIcon: customizationsIcon?.classList.contains('codicon-circle-filled'),
				hasExtensionsIcon: customizationsIcon?.classList.contains('codicon-extensions'),
				iconColor: customizationsIcon?.style.color,
			};
			customizationMigrationsAvailable.set(false, undefined);
			const customizationsPresentationWithoutMigration = {
				hasMigrationIcon: customizationsIcon?.classList.contains('codicon-circle-filled'),
				hasExtensionsIcon: customizationsIcon?.classList.contains('codicon-extensions'),
				iconColor: customizationsIcon?.style.color,
			};
			const customizationsActiveBeforeOpen = customizationsSection?.classList.contains('active');
			const customizationsAriaCurrentBeforeOpen = customizationsSection?.closest('.monaco-list-row')?.getAttribute('aria-current');
			const initialNewSessionKeybindingAriaLabel = newSessionKeybinding.getAriaLabel();
			newSessionKeybinding = createNewSessionKeybinding(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN);
			keybindingsChanged.fire();
			const updatedNewSessionAriaLabel = navigationContainer.querySelector('.session-section-new-session')?.closest('.monaco-list-row')?.getAttribute('aria-label');
			activeCustomView.set(upcastPartial<ICustomViewDescriptor>({ id: AUTOMATIONS_CUSTOM_VIEW_ID }), undefined);
			const automationsActiveBeforeCustomizations = automationsSection?.classList.contains('active');
			editorState.activeEditor = disposables.add(AICustomizationManagementEditorInput.getOrCreate());
			activeEditorChanged.fire();
			const customizationsActiveWhileOpen = customizationsSection?.classList.contains('active');
			const customizationsAriaCurrentWhileOpen = customizationsSection?.closest('.monaco-list-row')?.getAttribute('aria-current');
			const automationsActiveWhileCustomizationsOpen = automationsSection?.classList.contains('active');
			editorState.activeEditor = undefined;
			activeEditorChanged.fire();
			const customizationsActiveAfterClose = customizationsSection?.classList.contains('active');
			const customizationsAriaCurrentAfterClose = customizationsSection?.closest('.monaco-list-row')?.getAttribute('aria-current');
			const automationsActiveAfterCustomizationsClose = automationsSection?.classList.contains('active');
			navigationContainer.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
			const pointerFocusClassAfterPointer = navigationContainer.classList.contains('session-section-focus-from-pointer');
			mainWindow.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			const pointerFocusClassAfterKeyboard = navigationContainer.classList.contains('session-section-focus-from-pointer');

			showNavigationShortcuts = false;
			list.updateNavigationVisibility();
			list.focusAutomations();
			await timeout(350);
			const controlNavigationLabels = Array.from(navigationContainer.querySelectorAll('.session-section-shortcut .session-section-label'), element => element.textContent);
			const controlTreeShortcuts = Array.from(listContainer.querySelectorAll('.session-section-shortcut .session-section-label'), element => element.textContent);
			const controlAutomationsFocused = list.isAutomationsFocused();
			const controlAutomationsRow = listContainer.querySelector<HTMLElement>('.session-section-shortcut');
			assert.ok(controlAutomationsRow);
			controlAutomationsRow.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			await Promise.resolve();

			assert.deepStrictEqual({
				findInput,
				focusBeforeSwitch,
				focusInTreatment,
				treatmentNavigationLabels,
				treatmentAriaLabels,
				shortcutActionTargets,
				newSessionKeybindingVisible,
				updatedNewSessionAriaLabel,
				shortcutCollapseStates,
				customizationsPresentation,
				customizationsPresentationWithoutMigration,
				customizationsActive: [customizationsActiveBeforeOpen, customizationsActiveWhileOpen, customizationsActiveAfterClose],
				customizationsAriaCurrent: [customizationsAriaCurrentBeforeOpen, customizationsAriaCurrentWhileOpen, customizationsAriaCurrentAfterClose],
				automationsActive: [automationsActiveBeforeCustomizations, automationsActiveWhileCustomizationsOpen, automationsActiveAfterCustomizationsClose],
				pointerFocusClass: [pointerFocusClassAfterPointer, pointerFocusClassAfterKeyboard],
				stableFindHeaderUnmoved: findWidgetContainer.parentElement === sessionsHeader,
				navigationUsesList: navigationContainer.querySelector('.monaco-list') !== null && navigationContainer.querySelector('[role="tree"]') === null,
				sessionsUseTree: listContainer.querySelector('[role="tree"]') !== null,
				controlNavigationLabels,
				controlTreeShortcuts,
				controlAutomationsFocused,
				commands,
				newSessionKeybindingLookupUsesViewContext: keybindingLookupContexts.length >= 2
					&& keybindingLookupContexts.every(context => context === harness.instantiationService.get(IContextKeyService)),
			}, {
				findInput,
				focusBeforeSwitch: findInput,
				focusInTreatment: findInput,
				treatmentNavigationLabels: ['New Session', 'Automations', 'Customizations'],
				treatmentAriaLabels: [`New Session (${initialNewSessionKeybindingAriaLabel})`, 'Automations', 'Customizations, 7 customizations, customization migrations available'],
				shortcutActionTargets: [0, 0, 0],
				newSessionKeybindingVisible: true,
				updatedNewSessionAriaLabel: `New Session (${newSessionKeybinding.getAriaLabel()})`,
				shortcutCollapseStates: [
					{ ariaExpanded: null, hasChevron: false },
					{ ariaExpanded: null, hasChevron: false },
					{ ariaExpanded: null, hasChevron: false },
				],
				customizationsPresentation: {
					hasTotalCountBadge: false,
					hasMigrationIcon: true,
					hasExtensionsIcon: false,
					iconColor: 'var(--vscode-activityBarBadge-background)',
				},
				customizationsPresentationWithoutMigration: {
					hasMigrationIcon: false,
					hasExtensionsIcon: true,
					iconColor: '',
				},
				customizationsActive: [false, true, false],
				customizationsAriaCurrent: [null, 'page', null],
				automationsActive: [true, false, true],
				pointerFocusClass: [true, false],
				stableFindHeaderUnmoved: true,
				navigationUsesList: true,
				sessionsUseTree: true,
				controlNavigationLabels: [],
				controlTreeShortcuts: ['Automations'],
				controlAutomationsFocused: true,
				commands: ['sessionsView.manageAutomations'],
				newSessionKeybindingLookupUsesViewContext: true,
			});
		});

		test('notifies the owner when runtime navigation rows change', () => {
			let setAutomationsEnabled = (_enabled: boolean) => { };
			const harness = createListHarness(disposables, [], instantiationService => {
				const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
				instantiationService.stub(IContextKeyService, contextKeyService);
				const automationsEnabled = ChatAutomationsEnabledContext.bindTo(contextKeyService);
				automationsEnabled.set(false);
				setAutomationsEnabled = enabled => automationsEnabled.set(enabled);
				instantiationService.stub(IAutomationService, new class extends mock<IAutomationService>() {
					override readonly automations = constObservable([]);
					override readonly runs = constObservable([]);
					override readonly catalogueState = constObservable('ready' as const);
				});
				instantiationService.stub(ICustomViewService, new class extends mock<ICustomViewService>() {
					override readonly activeCustomView = constObservable(undefined);
				});
			});
			const container = harness.createContainer();
			const navigationContainer = mainWindow.document.createElement('div');
			const listContainer = mainWindow.document.createElement('div');
			container.append(navigationContainer, listContainer);
			let navigationHeightChanges = 0;
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, listContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				showNavigationShortcuts: () => true,
				navigationContainer,
				onDidChangeNavigationHeight: () => navigationHeightChanges++,
				onSessionOpen: () => { },
			}));
			const labels = () => Array.from(navigationContainer.querySelectorAll('.session-section-label'), element => element.textContent);
			list.layout(300, 400);
			const initialLabels = labels();
			const initialHeightChanges = navigationHeightChanges;

			setAutomationsEnabled(true);
			const enabledLabels = labels();
			const enabledHeightChanges = navigationHeightChanges;
			setAutomationsEnabled(false);

			assert.deepStrictEqual({
				initialLabels,
				enabledLabels,
				disabledLabels: labels(),
				notifiedWhenEnabled: enabledHeightChanges > initialHeightChanges,
				notifiedWhenDisabled: navigationHeightChanges > enabledHeightChanges,
			}, {
				initialLabels: ['New Session', 'Customizations'],
				enabledLabels: ['New Session', 'Automations', 'Customizations'],
				disabledLabels: ['New Session', 'Customizations'],
				notifiedWhenEnabled: true,
				notifiedWhenDisabled: true,
			});
		});

		test('filters only sessions while retaining navigation and Find focus', async () => {
			const sessions = Array.from({ length: 10 }, (_, index) => createTestSession(`session-${index}`).session);
			const harness = createListHarness(disposables, sessions, instantiationService => {
				ChatAutomationsEnabledContext.bindTo(instantiationService.get(IContextKeyService)).set(true);
				instantiationService.stub(IAutomationService, new class extends mock<IAutomationService>() {
					override readonly automations = constObservable([]);
					override readonly runs = constObservable([]);
					override readonly catalogueState = constObservable('ready' as const);
				});
				instantiationService.stub(ICustomViewService, new class extends mock<ICustomViewService>() {
					override readonly activeCustomView = constObservable(undefined);
				});
			});
			const sessionsContent = harness.createContainer();
			const navigationContainer = mainWindow.document.createElement('div');
			const sessionsHeader = mainWindow.document.createElement('div');
			sessionsHeader.className = 'agent-sessions-header-row';
			const findWidgetContainer = mainWindow.document.createElement('div');
			sessionsHeader.appendChild(findWidgetContainer);
			const listContainer = mainWindow.document.createElement('div');
			sessionsContent.append(navigationContainer, sessionsHeader, listContainer);
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, listContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				showNavigationShortcuts: () => true,
				navigationContainer,
				findWidgetContainer,
				onSessionOpen: () => { },
			}));
			list.layout(200, 400);
			list.openFind();

			try {
				const findInput = findWidgetContainer.querySelector<HTMLInputElement>('input');
				assert.ok(findInput);
				findInput.value = 'no matching session';
				findInput.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));

				assert.deepStrictEqual({
					focusedElement: mainWindow.document.activeElement,
					findInput,
					headerIsBeforeTree: sessionsHeader.nextElementSibling === listContainer,
					shortcutLabels: Array.from(navigationContainer.querySelectorAll('.session-section-shortcut .session-section-label'), element => element.textContent),
					sessionRows: listContainer.querySelectorAll('.session-item').length,
				}, {
					focusedElement: findInput,
					findInput,
					headerIsBeforeTree: true,
					shortcutLabels: ['New Session', 'Automations', 'Customizations'],
					sessionRows: 0,
				});
			} finally {
				list.closeFind();
				await timeout(350);
			}
		});

		test('filters sessions by workspace and artifact pull request numbers', async () => {
			const createSessionWithGitHubInfo = (title: string, gitHubInfo: NonNullable<ISessionFolder['gitRepository']>['gitHubInfo']) => {
				const session = createTestSession(title).session;
				const root = URI.file(`/workspace/${title}`);
				return {
					...session,
					workspace: constObservable({
						...session.workspace.get()!,
						folders: [{
							root,
							workingDirectory: root,
							name: title,
							description: undefined,
							gitRepository: {
								uri: root,
								workTreeUri: undefined,
								baseBranchName: 'main',
								gitHubInfo,
							},
						}],
					}),
				};
			};
			const modern = createSessionWithGitHubInfo('Modern PR', constObservable({
				owner: 'microsoft',
				repo: 'vscode',
				pullRequests: [241533, 242000].map(number => ({
					owner: 'microsoft',
					repo: 'vscode',
					number,
					uri: URI.parse(`https://github.com/microsoft/vscode/pull/${number}`),
				})),
			}));
			const legacy = createSessionWithGitHubInfo('Legacy PR', constObservable({
				owner: 'microsoft',
				repo: 'vscode',
				pullRequest: {
					number: 17,
					uri: URI.parse('https://github.com/microsoft/vscode/pull/17'),
				},
			}));
			const createSessionWithArtifact = (title: string, number: number, isGitHub?: boolean) => ({
				...createTestSession(title).session,
				artifacts: constObservable([{
					id: `pr-${number}`,
					kind: SessionArtifactKind.PullRequest,
					label: 'Recorded PR',
					isArtifact: true,
					link: URI.parse(`https://github.com/microsoft/vscode/pull/${number}`),
					...(isGitHub !== undefined ? { isGitHub } : {}),
				}]),
			});
			const artifact = createSessionWithArtifact('Artifact PR', 99, true);
			const unclassifiedArtifact = createSessionWithArtifact('Unclassified Artifact PR', 100);
			const nonGitHubArtifact = createSessionWithArtifact('Non-GitHub Artifact PR', 101, false);
			const harness = createListHarness(disposables, [modern, legacy, artifact, unclassifiedArtifact, nonGitHubArtifact, createTestSession('Unrelated').session]);
			const container = harness.createContainer();
			const findWidgetContainer = mainWindow.document.createElement('div');
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				findWidgetContainer,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			list.openFind();

			try {
				const findInput = findWidgetContainer.querySelector<HTMLInputElement>('input');
				assert.ok(findInput);
				const findTitles = (pattern: string) => {
					findInput.value = pattern;
					findInput.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
					return Array.from(container.querySelectorAll('.session-title'), element => element.textContent);
				};
				const findTitleHighlights = (pattern: string) => {
					findTitles(pattern);
					return Array.from(container.querySelectorAll('.session-title .highlight'), element => element.textContent);
				};

				assert.deepStrictEqual({
					modernWithHash: findTitles('#241533'),
					modernWithoutHash: findTitles('242000'),
					legacyWithHash: findTitles('#17'),
					artifactWithHash: findTitles('#99'),
					unclassifiedArtifactWithHash: findTitles('#100'),
					explicitlyNonGitHubArtifactWithHash: findTitles('#101'),
					titleHighlights: findTitleHighlights('Modern'),
				}, {
					modernWithHash: ['Modern PR'],
					modernWithoutHash: ['Modern PR'],
					legacyWithHash: ['Legacy PR'],
					artifactWithHash: ['Artifact PR'],
					unclassifiedArtifactWithHash: ['Unclassified Artifact PR'],
					explicitlyNonGitHubArtifactWithHash: [],
					titleHighlights: ['Modern'],
				});
			} finally {
				list.closeFind();
				await timeout(350);
			}
		});

		test('keeps navigation and the Sessions header outside the session tree', async () => {
			const sessions = Array.from({ length: 20 }, (_, index) => createTestSession(`session-${index}`).session);
			const harness = createListHarness(disposables, sessions, instantiationService => {
				ChatAutomationsEnabledContext.bindTo(instantiationService.get(IContextKeyService)).set(true);
				instantiationService.stub(IAutomationService, new class extends mock<IAutomationService>() {
					override readonly automations = constObservable([]);
					override readonly runs = constObservable([]);
					override readonly catalogueState = constObservable('ready' as const);
				});
				instantiationService.stub(ICustomViewService, new class extends mock<ICustomViewService>() {
					override readonly activeCustomView = constObservable(undefined);
				});
			});
			const container = harness.createContainer();
			const navigationContainer = mainWindow.document.createElement('div');
			const sessionsHeader = mainWindow.document.createElement('div');
			sessionsHeader.textContent = 'Sessions';
			const findWidgetContainer = mainWindow.document.createElement('div');
			sessionsHeader.append(findWidgetContainer);
			const listContainer = mainWindow.document.createElement('div');
			container.append(navigationContainer, sessionsHeader, listContainer);
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, listContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				showNavigationShortcuts: () => true,
				navigationContainer,
				findWidgetContainer,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			await timeout(0);
			const findSectionRow = (label: string) => Array.from(container.querySelectorAll<HTMLElement>('.session-section-label'))
				.find(element => element.textContent === label)?.closest('.monaco-list-row');
			const treeAriaLevels = {
				recent: findSectionRow('Recent')?.getAttribute('aria-level'),
				session: container.querySelector('.session-item')?.closest('.monaco-list-row')?.getAttribute('aria-level'),
			};
			const tree = Reflect.get(list, 'tree') as { scrollTop: number };
			tree.scrollTop = 400;
			await timeout(0);
			const stickySectionLabels = Array.from(container.querySelectorAll<HTMLElement>('.monaco-tree-sticky-row .session-section-label'))
				.sort((first, second) => Number.parseFloat(first.closest<HTMLElement>('.monaco-tree-sticky-row')?.style.top ?? '0') - Number.parseFloat(second.closest<HTMLElement>('.monaco-tree-sticky-row')?.style.top ?? '0'))
				.map(element => element.textContent);
			const scrollTopBeforeFind = tree.scrollTop;
			list.openFind();
			const scrollTopAfterFind = tree.scrollTop;
			const findInput = findWidgetContainer.querySelector<HTMLInputElement>('input');

			assert.deepStrictEqual({
				treeAriaLevels,
				stickySectionLabels,
				navigationOrder: Array.from(navigationContainer.querySelectorAll('.session-section-label'), element => element.textContent),
				navigationAriaLabel: navigationContainer.querySelector('[role="list"]')?.getAttribute('aria-label'),
				treeAriaLabel: listContainer.querySelector('[role="tree"]')?.getAttribute('aria-label'),
				navigationIsOutsideTree: navigationContainer.querySelector('[role="tree"]') === null,
				headerIsOutsideTree: sessionsHeader.closest('[role="tree"]') === null,
				treeContainsOnlySessionContent: listContainer.querySelector('.session-section-shortcut') === null,
				findFocusedAfterOffscreenOpen: mainWindow.document.activeElement === findInput,
				scrollTopAfterFind,
				scrollTopBeforeFind,
			}, {
				treeAriaLevels: {
					recent: '1',
					session: '2',
				},
				stickySectionLabels: ['Recent'],
				navigationOrder: ['New Session', 'Automations', 'Customizations'],
				navigationAriaLabel: 'Sessions Navigation',
				treeAriaLabel: 'Sessions',
				navigationIsOutsideTree: true,
				headerIsOutsideTree: true,
				treeContainsOnlySessionContent: true,
				findFocusedAfterOffscreenOpen: true,
				scrollTopAfterFind: scrollTopBeforeFind,
				scrollTopBeforeFind: 400,
			});
			list.closeFind();
			await timeout(350);
		});

		test('derives terminal automation status from the supplied session snapshot', () => {
			const session = createSession('automation', {
				isRead: false,
				resource: URI.parse('test-session:/Workspace/Automation'),
			});
			const managementCalls: string[] = [];
			const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
				override getSessions(): ISession[] {
					managementCalls.push('getSessions');
					return [session];
				}

				override getSession(resource: URI): ISession | undefined {
					managementCalls.push(`getSession:${resource.toString()}`);
					return session;
				}
			};
			const automationSessions = constObservable(sessionsManagementService.getSessions());
			managementCalls.length = 0;
			const runs = observableValue<readonly IAutomationRun[]>('automationRuns', []);
			const automationService = new class extends mock<IAutomationService>() {
				override readonly runs = runs;
			};
			const uriIdentityService = new class extends mock<IUriIdentityService>() {
				override readonly extUri = new ExtUri(() => true);
			};
			const renderer = new SessionSectionRenderer(
				true,
				() => { },
				constObservable(true),
				constObservable(new Set<string>()),
				noHeaderStatusTrigger,
				new class extends mock<IInstantiationService>() { },
				NullHoverService,
				new class extends mock<IContextKeyService>() { },
				automationService,
				automationSessions,
				uriIdentityService,
				new class extends mock<ICustomViewService>() { },
				new class extends mock<IMenuService>() { },
				noKeybindingService,
				constObservable(false),
			);
			const runResource = URI.parse('test-session:/workspace/automation');
			const statuses: (SessionStatus | undefined)[] = [];
			for (const status of ['completed', 'failed'] as const) {
				runs.set([{
					id: status,
					automationId: 'automation',
					status,
					trigger: 'schedule',
					sessionResource: runResource,
					startedAt: '2026-08-10T00:00:00.000Z',
				}], undefined);
				statuses.push(renderer.automationStatus.get());
			}
			session.isArchived.set(true, undefined);
			const archivedStatus = renderer.automationStatus.get();
			session.isArchived.set(false, undefined);
			const restoredStatus = renderer.automationStatus.get();
			session.isRead.set(true, undefined);
			const readStatus = renderer.automationStatus.get();
			session.isRead.set(false, undefined);
			const unreadStatus = renderer.automationStatus.get();

			assert.deepStrictEqual({
				resourcesAreDistinct: session.resource.toString() !== runResource.toString(),
				resourcesAreEquivalent: uriIdentityService.extUri.isEqual(session.resource, runResource),
				statuses,
				archivedStatus,
				restoredStatus,
				readStatus,
				unreadStatus,
				isRead: session.isRead.get(),
				managementCalls,
			}, {
				resourcesAreDistinct: true,
				resourcesAreEquivalent: true,
				statuses: [SessionStatus.Completed, SessionStatus.Completed],
				archivedStatus: undefined,
				restoredStatus: SessionStatus.Completed,
				readStatus: undefined,
				unreadStatus: SessionStatus.Completed,
				isRead: false,
				managementCalls: [],
			});
		});

		test('needs-input automation status takes priority over other running runs', () => {
			const runningSession = createSession('automation-running', {
				resource: URI.parse('test-session:/Workspace/Automation-Running'),
			});
			const needsInputSession = createSession('automation-needs-input', {
				resource: URI.parse('test-session:/Workspace/Automation-Needs-Input'),
			});
			const runningStatus = runningSession.status as ReturnType<typeof observableValue<SessionStatus>>;
			const needsInputStatus = needsInputSession.status as ReturnType<typeof observableValue<SessionStatus>>;
			runningStatus.set(SessionStatus.InProgress, undefined);
			needsInputStatus.set(SessionStatus.InProgress, undefined);
			const runs = observableValue<readonly IAutomationRun[]>('automationRuns', []);
			const automationService = new class extends mock<IAutomationService>() {
				override readonly runs = runs;
			};
			const uriIdentityService = new class extends mock<IUriIdentityService>() {
				override readonly extUri = new ExtUri(() => true);
			};
			const renderer = new SessionSectionRenderer(
				true,
				() => { },
				constObservable(true),
				constObservable(new Set<string>()),
				noHeaderStatusTrigger,
				new class extends mock<IInstantiationService>() { },
				NullHoverService,
				new class extends mock<IContextKeyService>() { },
				automationService,
				constObservable([runningSession, needsInputSession]),
				uriIdentityService,
				new class extends mock<ICustomViewService>() { },
				new class extends mock<IMenuService>() { },
				noKeybindingService,
				constObservable(false),
			);
			runs.set([
				{
					id: 'running',
					automationId: 'automation',
					status: 'running',
					trigger: 'schedule',
					sessionResource: runningSession.resource,
					startedAt: '2026-08-10T00:00:00.000Z',
				},
				{
					id: 'needs-input',
					automationId: 'automation',
					status: 'running',
					trigger: 'schedule',
					sessionResource: needsInputSession.resource,
					startedAt: '2026-08-10T00:00:00.000Z',
				},
			], undefined);

			assert.strictEqual(renderer.automationStatus.get(), SessionStatus.InProgress);

			needsInputStatus.set(SessionStatus.NeedsInput, undefined);
			assert.strictEqual(renderer.automationStatus.get(), SessionStatus.NeedsInput);

			needsInputStatus.set(SessionStatus.InProgress, undefined);
			assert.strictEqual(renderer.automationStatus.get(), SessionStatus.InProgress);
		});
	});

	suite('sticky header collapse state', () => {
		const group: ISessionGroup = { id: 'group-a', name: 'Group A', createdAt: 1 };

		for (const kind of ['section', 'group'] as const) {
			test(`updates the ${kind} chevron after its sticky copy is removed`, async () => {
				const sessions = Array.from({ length: 12 }, (_, index) => createTestSession(`Session ${index}`).session);
				const sessionIds = sessions.map(session => session.sessionId);
				const harness = createListHarness(disposables, sessions, kind === 'section'
					? { pinnedSessionIds: new Set(sessionIds) }
					: { groups: [group], memberships: new Map(sessionIds.map(sessionId => [sessionId, group.id])) });
				harness.instantiationService.get(IStorageService).store('sessionsListControl.sectionCollapseState', JSON.stringify({ pinned: false }), StorageScope.PROFILE, StorageTarget.USER);
				const container = harness.createContainer();
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
					grouping: () => SessionsGrouping.Workspace,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
				}));
				list.layout(300, 400);
				const label = kind === 'section' ? 'Pinned' : group.name;
				const getHeader = () => [...container.querySelectorAll<HTMLElement>('.monaco-list-rows .session-section')]
					.find(header => header.querySelector('.session-section-label')?.textContent === label);
				const tree = Reflect.get(list, 'tree') as { scrollTop: number };

				tree.scrollTop = 100;
				await timeout(0);
				const stickyHeaders = [...container.querySelectorAll('.monaco-tree-sticky-row .session-section-label')].map(header => header.textContent);
				tree.scrollTop = 0;
				await timeout(0);
				getHeader()?.click();
				const collapsed = getHeader()?.querySelector('.session-section-chevron')?.className;
				getHeader()?.click();
				const expanded = getHeader()?.querySelector('.session-section-chevron')?.className;

				assert.deepStrictEqual({ stickyHeaders, collapsed, expanded }, {
					stickyHeaders: [label],
					collapsed: 'session-section-chevron collapsible codicon codicon-chevron-right',
					expanded: 'session-section-chevron collapsible codicon codicon-chevron-down',
				});
			});
		}
	});

	suite('row feedback', () => {
		test('keeps custom group toolbar at the trailing edge', () => {
			const group: ISessionGroup = { id: 'group', name: 'Custom Group', createdAt: 1 };
			const session = createTestSession('session').session;
			const harness = createListHarness(disposables, [session], {
				groups: [group],
				memberships: new Map([[session.sessionId, group.id]]),
			});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(1000, 400);

			const groupHeader = container.querySelector<HTMLElement>('.session-group');
			assert.ok(groupHeader);
			const labelContainer = groupHeader.querySelector<HTMLElement>('.session-section-label-container');
			assert.ok(labelContainer);
			assert.deepStrictEqual({
				labelContainerParent: labelContainer.parentElement?.classList.contains('session-group'),
				labelParent: labelContainer.querySelector('.session-section-label')?.parentElement?.classList.contains('session-section-label-container'),
				flexGrow: mainWindow.getComputedStyle(labelContainer).flexGrow,
			}, {
				labelContainerParent: true,
				labelParent: true,
				flexGrow: '1',
			});
		});

		test('aligns workspace and custom group rows with session rows', () => {
			const group: ISessionGroup = { id: 'group', name: 'Custom Group', createdAt: 1 };
			const sessions = Array.from({ length: 6 }, (_, index) => {
				const session = createTestSession(`session-${index}`, {
					workspaceLabel: `Workspace ${index}`,
				}).session;
				return { ...session, updatedAt: constObservable(new Date(index)) };
			});
			const harness = createListHarness(disposables, sessions, {
				groups: [group],
				memberships: new Map([[sessions[0].sessionId, group.id]]),
			});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(1000, 400);

			const groupRow = container.querySelector('.session-group')?.closest('.monaco-list-row');
			const workspaceRow = [...container.querySelectorAll<HTMLElement>('.session-section:not(.session-group)')]
				.find(section => section.querySelector('.session-section-label')?.textContent?.startsWith('Workspace'))
				?.closest('.monaco-list-row');
			const sessionRow = container.querySelector<HTMLElement>('.monaco-list-row.session-list-inset-row');
			const feedbackGeometry = (row: Element | null | undefined) => {
				const style = row ? mainWindow.getComputedStyle(row) : undefined;
				return {
					borderRadius: style?.borderRadius,
					marginLeft: style?.marginLeft,
					marginRight: style?.marginRight,
				};
			};

			assert.deepStrictEqual(
				[workspaceRow, groupRow, sessionRow].map(feedbackGeometry),
				Array(3).fill({
					borderRadius: '0px',
					marginLeft: '0px',
					marginRight: '0px',
				})
			);
		});
	});

	suite('collapsed section status indicators', () => {
		const group: ISessionGroup = { id: 'group-a', name: 'Group A', createdAt: 1 };

		function renderList(sessions: ISession[], options: IListHarnessOptions & { useDefaultSetting?: boolean; screenReader?: boolean } = {}, reducedMotion = false, telemetryService?: ITelemetryService) {
			const harness = createListHarness(disposables, sessions, options);
			if (!options.useDefaultSetting) {
				(harness.instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING, true);
			}
			if (telemetryService) {
				harness.instantiationService.stub(ITelemetryService, telemetryService);
			}
			harness.instantiationService.stub(ISessionsListModelService, 'getStatusIcon', SessionsListModelService.prototype.getStatusIcon);
			harness.instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
				override isMotionReduced(): boolean { return reducedMotion; }
				override isScreenReaderOptimized(): boolean { return options.screenReader ?? false; }
			}());
			const failingCISessions = observableValue<readonly ISession[]>('failingCISessions', []);
			harness.instantiationService.stubInstance(BlockedSessions, new class extends mock<BlockedSessions>() {
				override readonly blockedSessionsWithReasons = derived(reader => failingCISessions.read(reader).map(session => ({
					session,
					reason: BlockedSessionReason.FailingCI,
					occurrenceId: 'failingCI:head',
				})));
				override dispose(): void { }
			}());
			const container = harness.createContainer(400, 700);
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(700, 400);
			return { ...harness, list, container, failingCISessions };
		}

		function unreadSections(container: HTMLElement): string[] {
			return [...container.querySelectorAll('.session-section')]
				.filter(header => header.querySelector('.session-section-icon .codicon-circle-filled'))
				.map(header => header.querySelector('.session-section-label')!.textContent!);
		}

		function needsInputSections(container: HTMLElement): string[] {
			return [...container.querySelectorAll('.session-section')]
				.filter(header => header.querySelector('.session-section-icon .codicon-report-question'))
				.map(header => header.querySelector('.session-section-label')!.textContent!);
		}

		function getHeader(container: HTMLElement, label: string): HTMLElement {
			const header = [...container.querySelectorAll<HTMLElement>('.session-section')]
				.find(header => header.querySelector('.session-section-label')?.textContent === label);
			assert.ok(header, `Expected section ${label}`);
			return header;
		}

		test('derives collapsed section unread state from its chats', () => {
			const built = buildTestSession({
				id: 'section-chat-read-state',
				title: 'Main chat',
				workspace: 'Workspace',
				isRead: false,
				mainChatIsRead: true,
				chats: [{ id: 'peer', title: 'Peer chat', isRead: false }],
			});
			const { list, container } = renderList([built.session]);
			list.collapseAllSections();

			const peerUnread = unreadSections(container);
			built.chats.get('peer')?.isRead.set(true, undefined);
			const chatsRead = unreadSections(container);
			built.mainChat.isRead.set(false, undefined);
			const mainUnread = unreadSections(container);

			assert.deepStrictEqual({ peerUnread, chatsRead, mainUnread }, {
				peerUnread: ['Workspace'],
				chatsRead: [],
				mainUnread: ['Workspace'],
			});
		});

		test('custom group appearance yields to unread status and returns when read', () => {
			const customGroup = { ...group, icon: 'rocket', color: 'charts.blue' };
			const { session, isRead } = createTestSession('Unread', { isRead: false });
			const { list, container } = renderList([session], {
				groups: [customGroup],
				memberships: new Map([[session.sessionId, group.id]]),
			});
			const snapshot = () => {
				const icon = getHeader(container, group.name).querySelector<HTMLElement>('.session-section-icon')!;
				return { rocket: icon.classList.contains('codicon-rocket'), color: icon.style.color, unread: !!icon.querySelector('.codicon-circle-filled') };
			};
			const expanded = snapshot();
			list.collapseAllSections();
			const collapsedUnread = snapshot();
			isRead.set(true, undefined);
			const collapsedRead = snapshot();
			assert.deepStrictEqual({ expanded, collapsedUnread, collapsedRead }, {
				expanded: { rocket: true, color: 'var(--vscode-charts-blue)', unread: false },
				collapsedUnread: { rocket: false, color: '', unread: true },
				collapsedRead: { rocket: true, color: 'var(--vscode-charts-blue)', unread: false },
			});
		});

		test('workspace appearance yields to unread status and returns when read', () => {
			const { session, isRead } = createTestSession('Unread', { isRead: false });
			const { list, container } = renderList([session], {
				sectionAppearances: new Map([['workspace:Workspace', { icon: 'rocket', color: 'terminal.ansiBlue' }]]),
			});
			const snapshot = () => {
				const icon = getHeader(container, 'Workspace').querySelector<HTMLElement>('.session-section-icon')!;
				return { rocket: icon.classList.contains('codicon-rocket'), color: icon.style.color, unread: !!icon.querySelector('.codicon-circle-filled') };
			};
			const expanded = snapshot();
			list.collapseAllSections();
			const collapsedUnread = snapshot();
			isRead.set(true, undefined);
			assert.deepStrictEqual({ expanded, collapsedUnread, collapsedRead: snapshot() }, {
				expanded: { rocket: true, color: 'var(--vscode-terminal-ansiBlue)', unread: false },
				collapsedUnread: { rocket: false, color: '', unread: true },
				collapsedRead: { rocket: true, color: 'var(--vscode-terminal-ansiBlue)', unread: false },
			});
		});

		test('reports the experiment trigger where a header could show a status, whether or not the setting shows it', () => {
			const trigger = [`config.${SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING}`];
			const withPullRequest = (session: ISession): ISession => {
				const root = URI.file('/workspace/pr');
				return {
					...session,
					workspace: constObservable({
						...session.workspace.get()!,
						folders: [{
							root, workingDirectory: root, name: 'pr', description: undefined,
							gitRepository: { uri: root, workTreeUri: undefined, baseBranchName: 'main', gitHubInfo: constObservable({ owner: 'microsoft', repo: 'vscode', pullRequest: { number: 1, uri: URI.parse('https://github.com/microsoft/vscode/pull/1') } }) },
						}],
					}),
				};
			};
			const results = Object.fromEntries(([
				['unread', () => createTestSession('Unread', { isRead: false }).session, false],
				['pull request that could fail CI', () => withPullRequest(createTestSession('Pull request').session), false],
				['read without a pull request', () => createTestSession('Read').session, false],
				['unread with a screen reader', () => createTestSession('Unread', { isRead: false }).session, true],
			] as const).map(([name, createSession, screenReader]) => [name, [true, false].map(useDefaultSetting => {
				const telemetryService = new TestExperimentTriggerTelemetryService();
				const { list } = renderList([createSession()], { useDefaultSetting, screenReader }, false, telemetryService);
				const whileExpanded = [...telemetryService.triggers];
				list.collapseAllSections();
				return { whileExpanded, whileCollapsed: telemetryService.triggers };
			})]));

			// Every arm reports the same headers: collapsed ones, and expanded ones whose status a screen reader announces.
			const collapsed = { whileExpanded: [], whileCollapsed: trigger };
			assert.deepStrictEqual(results, {
				'unread': [collapsed, collapsed],
				'pull request that could fail CI': [collapsed, collapsed],
				'read without a pull request': [{ whileExpanded: [], whileCollapsed: [] }, { whileExpanded: [], whileCollapsed: [] }],
				'unread with a screen reader': [{ whileExpanded: trigger, whileCollapsed: trigger }, { whileExpanded: trigger, whileCollapsed: trigger }],
			});
		});

		test('keeps normal section icons and labels when the setting is unset', () => {
			const unread = createTestSession('Unread', { workspaceLabel: 'Unread workspace', isRead: false }).session;
			const failingCI = createTestSession('Failing CI', { workspaceLabel: 'CI workspace' }).session;
			const needsInput = createTestSession('Needs input', { status: SessionStatus.NeedsInput }).session;
			const { list, container, failingCISessions } = renderList([unread, failingCI, needsInput], {
				groups: [group],
				memberships: new Map([[needsInput.sessionId, group.id]]),
				useDefaultSetting: true,
			});
			failingCISessions.set([failingCI], undefined);
			list.collapseAllSections();

			assert.deepStrictEqual([group.name, 'CI workspace', 'Unread workspace'].map(label => {
				const header = getHeader(container, label);
				return {
					ariaLabel: header.closest('.monaco-list-row')?.getAttribute('aria-label'),
					icon: header.querySelector('.session-section-icon')?.className,
					indicator: !!header.querySelector('.codicon-circle-filled, .codicon-report-question, .monaco-pixel-spinner'),
				};
			}), [
				{ ariaLabel: 'Group A, 1', icon: 'session-section-icon codicon codicon-folder-library', indicator: false },
				{ ariaLabel: 'CI workspace, 1', icon: 'session-section-icon codicon codicon-folder', indicator: false },
				{ ariaLabel: 'Unread workspace, 1', icon: 'session-section-icon codicon codicon-folder', indicator: false },
			]);
		});

		test('marks the group containing an unread session, not the session workspace', () => {
			const grouped = createTestSession('Grouped unread', { workspaceLabel: 'Workspace B', isRead: false }).session;
			const read = createTestSession('Workspace read', { workspaceLabel: 'Workspace B' }).session;
			const unread = createTestSession('Workspace unread', { workspaceLabel: 'Workspace C', isRead: false }).session;
			const { list, container } = renderList([grouped, read, unread], {
				groups: [group, { id: 'empty', name: 'Empty group', createdAt: 2 }],
				memberships: new Map([[grouped.sessionId, group.id]]),
			});
			list.collapseAllSections();

			assert.deepStrictEqual({
				unreadSections: unreadSections(container),
				groupAria: getHeader(container, group.name).closest('.monaco-list-row')?.getAttribute('aria-label'),
				workspaceAria: getHeader(container, 'Workspace B').closest('.monaco-list-row')?.getAttribute('aria-label'),
				color: getHeader(container, group.name).querySelector<HTMLElement>('.codicon-circle-filled')?.style.color,
			}, {
				unreadSections: [group.name, 'Workspace C'],
				groupAria: 'Group A, 1, contains unread sessions',
				workspaceAria: 'Workspace B, 1',
				color: 'var(--vscode-textLink-foreground)',
			});
		});

		test('shows needs-input only in the containing section and respects filters and pins', () => {
			const grouped = createTestSession('Grouped needs input', { workspaceLabel: 'Workspace B', status: SessionStatus.NeedsInput, harness: 'claude' }).session;
			const read = createTestSession('Workspace read', { workspaceLabel: 'Workspace B' }).session;
			const needsInput = createTestSession('Workspace needs input', { workspaceLabel: 'Workspace C', status: SessionStatus.NeedsInput, harness: 'claude' }).session;
			const pinnedSessionIds = new Set<string>();
			const { list, container } = renderList([grouped, read, needsInput], {
				groups: [group],
				memberships: new Map([[grouped.sessionId, group.id]]),
				pinnedSessionIds,
			});
			list.collapseAllSections();
			const states = [needsInputSections(container)];
			list.filters.setExcluded({ kind: 'harness', id: 'claude' }, true);
			states.push(needsInputSections(container));
			list.filters.setExcluded({ kind: 'harness', id: 'claude' }, false);
			states.push(needsInputSections(container));
			pinnedSessionIds.add(grouped.sessionId);
			list.update();
			states.push(needsInputSections(container));

			assert.deepStrictEqual(states, [
				[group.name, 'Workspace C'],
				[],
				[group.name, 'Workspace C'],
				['Pinned', 'Workspace C'],
			]);
		});

		test('shows CI failures only in their containing sections and respects filters and pins', () => {
			const grouped = createTestSession('Grouped CI failure', { workspaceLabel: 'Workspace B', status: SessionStatus.Error, environment: 'cloud' }).session;
			const read = createTestSession('Workspace read', { workspaceLabel: 'Workspace B' }).session;
			const failingCI = createTestSession('Workspace CI failure', { workspaceLabel: 'Workspace C', status: SessionStatus.Error, environment: 'cloud' }).session;
			const pinnedSessionIds = new Set<string>();
			const { list, container, failingCISessions } = renderList([grouped, read, failingCI], {
				groups: [group],
				memberships: new Map([[grouped.sessionId, group.id]]),
				pinnedSessionIds,
			});
			failingCISessions.set([grouped, failingCI, createTestSession('Outside the list').session], undefined);
			const markedSections = () => [...container.querySelectorAll('.session-section')]
				.filter(header => header.querySelector<HTMLElement>('.session-section-icon .codicon-circle-filled')?.style.color === 'var(--vscode-list-warningForeground)')
				.map(header => header.querySelector('.session-section-label')?.textContent);
			list.collapseAllSections();
			const states = [markedSections()];
			list.filters.setExcluded({ kind: 'environment', id: 'cloud' }, true);
			states.push(markedSections());
			list.filters.setExcluded({ kind: 'environment', id: 'cloud' }, false);
			states.push(markedSections());
			pinnedSessionIds.add(grouped.sessionId);
			list.update();
			states.push(markedSections());

			assert.deepStrictEqual(states, [
				[group.name, 'Workspace C'],
				[],
				[group.name, 'Workspace C'],
				['Pinned', 'Workspace C'],
			]);
		});

		for (const grouped of [false, true]) {
			const kind = grouped ? 'group' : 'workspace';

			test(`prioritizes input, inactive CI failures, then unread in a ${kind}`, () => {
				const unread = createTestSession('Unread', { isRead: false });
				const failingCI = createTestSession('Failing CI');
				const needsInput = createTestSession('Needs input');
				const sessions = [unread.session, ...Array.from({ length: 4 }, (_, index) => createTestSession(`Read ${index}`).session), failingCI.session, needsInput.session]
					.map((session, index) => ({ ...session, createdAt: new Date(Date.now() - index * 1000) }));
				const { list, container, failingCISessions } = renderList(sessions, grouped ? {
					groups: [group],
					memberships: new Map(sessions.map(session => [session.sessionId, group.id])),
					cappedGroupIds: [group.id],
				} : {});
				failingCISessions.set([failingCI.session], undefined);
				const label = grouped ? group.name : 'Workspace';
				const header = getHeader(container, label);
				const getStatus = () => {
					if (header.querySelector('.codicon-report-question')) {
						return 'needsInput';
					}
					const dot = header.querySelector<HTMLElement>('.codicon-circle-filled');
					return dot ? dot.style.color === 'var(--vscode-list-warningForeground)' ? 'failingCI' : 'unread' : 'none';
				};
				const hiddenCI = !list.getVisibleSessions().some(session => session.sessionId === failingCI.session.sessionId);
				const states = [getStatus()];
				list.collapseAllSections();
				states.push(getStatus());
				const ciAria = header.closest('.monaco-list-row')?.getAttribute('aria-label');
				needsInput.status.set(SessionStatus.NeedsInput, undefined);
				states.push(getStatus());
				needsInput.isArchived.set(true, undefined);
				states.push(getStatus());
				failingCI.status.set(SessionStatus.InProgress, undefined);
				states.push(getStatus());
				unread.isRead.set(true, undefined);
				states.push(getStatus());
				failingCI.status.set(SessionStatus.Completed, undefined);
				states.push(getStatus());
				failingCI.isArchived.set(true, undefined);
				states.push(getStatus());
				failingCI.isArchived.set(false, undefined);
				states.push(getStatus());
				failingCISessions.set([], undefined);
				states.push(getStatus());
				unread.isRead.set(false, undefined);
				states.push(getStatus());
				unread.isArchived.set(true, undefined);
				states.push(getStatus());

				assert.deepStrictEqual({ hiddenCI, states, ciAria }, {
					hiddenCI: true,
					states: ['none', 'failingCI', 'needsInput', 'failingCI', 'unread', 'none', 'failingCI', 'none', 'failingCI', 'none', 'unread', 'none'],
					ciAria: `${label}, 7, session has failing CI checks`,
				});
			});

			test(`prioritizes needs-input behind show more and reacts to status changes in a ${kind}`, () => {
				const unread = createTestSession('Unread', { isRead: false });
				const needsInput = createTestSession('Needs input', { status: SessionStatus.NeedsInput });
				const sessions = [unread.session, ...Array.from({ length: 4 }, (_, index) => createTestSession(`Read ${index}`).session), needsInput.session]
					.map((session, index) => ({ ...session, createdAt: new Date(Date.now() - index * 1000) }));
				const { list, container } = renderList(sessions, grouped ? {
					groups: [group],
					memberships: new Map(sessions.map(session => [session.sessionId, group.id])),
					cappedGroupIds: [group.id],
				} : {});
				const label = grouped ? group.name : 'Workspace';
				const header = getHeader(container, label);
				const getStatus = () => header.querySelector('.codicon-report-question') ? 'needsInput' : header.querySelector('.codicon-circle-filled') ? 'unread' : 'none';
				const states = [getStatus()];
				const hiddenNeedsInput = !list.getVisibleSessions().some(session => session.sessionId === needsInput.session.sessionId);

				list.collapseAllSections();
				states.push(getStatus());
				const reportQuestionIcon = header.querySelector<HTMLElement>('.codicon-report-question');
				const needsInputAria = header.closest('.monaco-list-row')?.getAttribute('aria-label');
				unread.isRead.set(true, undefined);
				unread.isRead.set(false, undefined);
				const preservesReportQuestionIcon = !!reportQuestionIcon && reportQuestionIcon === header.querySelector('.codicon-report-question');
				needsInput.status.set(SessionStatus.Completed, undefined);
				states.push(getStatus());
				const unreadAria = header.closest('.monaco-list-row')?.getAttribute('aria-label');
				needsInput.status.set(SessionStatus.NeedsInput, undefined);
				states.push(getStatus());
				needsInput.isArchived.set(true, undefined);
				states.push(getStatus());
				needsInput.isArchived.set(false, undefined);
				states.push(getStatus());
				header.click();
				states.push(getStatus());
				const expandedPulse = !!header.querySelector('.session-icon-pulse');
				list.collapseAllSections();
				states.push(getStatus());
				needsInput.status.set(SessionStatus.Completed, undefined);
				states.push(getStatus());
				unread.isRead.set(true, undefined);
				states.push(getStatus());

				assert.deepStrictEqual({
					hiddenNeedsInput,
					states,
					preservesReportQuestionIcon,
					color: reportQuestionIcon?.style.color,
					needsInputAria,
					unreadAria,
					expandedPulse,
					clearedPulse: !!header.querySelector('.session-icon-pulse'),
				}, {
					hiddenNeedsInput: true,
					states: ['none', 'needsInput', 'unread', 'needsInput', 'unread', 'needsInput', 'none', 'needsInput', 'unread', 'none'],
					preservesReportQuestionIcon: true,
					color: 'var(--vscode-list-warningForeground)',
					needsInputAria: `${label}, 6, session needs attention`,
					unreadAria: `${label}, 6, contains unread sessions`,
					expandedPulse: false,
					clearedPulse: false,
				});
			});

			test(`reacts to collapse, read, and archive changes in a ${kind}`, () => {
				const { session, isRead, isArchived } = createTestSession('Unread', { isRead: false });
				const { list, container } = renderList([session], grouped ? {
					groups: [group],
					memberships: new Map([[session.sessionId, group.id]]),
				} : {});
				const label = grouped ? group.name : 'Workspace';
				const states = [unreadSections(container)];

				list.collapseAllSections();
				states.push(unreadSections(container));
				isRead.set(true, undefined);
				states.push(unreadSections(container));
				isRead.set(false, undefined);
				states.push(unreadSections(container));
				isArchived.set(true, undefined);
				states.push(unreadSections(container));
				isArchived.set(false, undefined);
				states.push(unreadSections(container));
				getHeader(container, label).click();
				states.push(unreadSections(container));

				assert.deepStrictEqual({
					states,
					expanded: getHeader(container, label).closest('.monaco-list-row')?.getAttribute('aria-expanded'),
					restoredIcon: !!getHeader(container, label).querySelector(grouped ? '.codicon-folder-library' : '.codicon-folder'),
				}, {
					states: [[], [label], [], [label], [], [label], []],
					expanded: 'true',
					restoredIcon: true,
				});
			});

			test(`includes unread sessions behind show more in a collapsed ${kind}`, () => {
				const sessions = Array.from({ length: 6 }, (_, index) => ({
					...createTestSession(`Session ${index}`, { isRead: index !== 5 }).session,
					createdAt: new Date(Date.now() - index * 1000),
				}));
				const { list, container } = renderList(sessions, grouped ? {
					groups: [group],
					memberships: new Map(sessions.map(session => [session.sessionId, group.id])),
					cappedGroupIds: [group.id],
				} : {});
				const visibleTitles = [...container.querySelectorAll('.session-title')].map(title => title.textContent);

				list.collapseAllSections();

				assert.deepStrictEqual({
					visibleTitles,
					unreadSections: unreadSections(container),
				}, {
					visibleTitles: ['Session 0', 'Session 1', 'Session 2', 'Session 3', 'Session 4'],
					unreadSections: [grouped ? group.name : 'Workspace'],
				});
			});
		}

		test('updates membership and does not retain unread state when headers are reused', () => {
			const { session: unread, isRead } = createTestSession('Unread', { workspaceLabel: 'Workspace B', isRead: false });
			const read = createTestSession('Read', { workspaceLabel: 'Workspace B' }).session;
			const memberships = new Map<string, string>();
			const { list, container, managementService } = renderList([unread, read], { groups: [group], memberships });
			list.collapseAllSections();
			const states = [unreadSections(container)];

			memberships.set(unread.sessionId, group.id);
			list.update();
			states.push(unreadSections(container));
			memberships.delete(unread.sessionId);
			list.update();
			states.push(unreadSections(container));
			managementService.sessions = [read];
			list.refresh();
			isRead.set(true, undefined);
			isRead.set(false, undefined);
			states.push(unreadSections(container));

			assert.deepStrictEqual(states, [['Workspace B'], [group.name], ['Workspace B'], []]);
		});

		test('respects pinned, archived, and automation placement before aggregating unread sessions', () => {
			const pinned = createTestSession('Pinned unread', { workspaceLabel: 'Workspace B', isRead: false }).session;
			const archived = createTestSession('Archived unread', { workspaceLabel: 'Workspace B', isRead: false, isArchived: true }).session;
			const automation: ISession = {
				...createTestSession('Automation unread', { workspaceLabel: 'Workspace B', isRead: false }).session,
				isAutomation: constObservable(true),
			};
			const read = createTestSession('Read', { workspaceLabel: 'Workspace B' }).session;
			const { list, container } = renderList([pinned, archived, automation, read], {
				groups: [group],
				memberships: new Map([pinned, archived, automation].map(session => [session.sessionId, group.id])),
				pinnedSessionIds: new Set([pinned.sessionId]),
			});
			list.setExcludeArchived(false);
			list.collapseAllSections();

			assert.deepStrictEqual({
				unreadSections: unreadSections(container),
				groupAria: getHeader(container, group.name).closest('.monaco-list-row')?.getAttribute('aria-label'),
				workspaceAria: getHeader(container, 'Workspace B').closest('.monaco-list-row')?.getAttribute('aria-label'),
			}, {
				unreadSections: ['Pinned'],
				groupAria: 'Group A, 0',
				workspaceAria: 'Workspace B, 1',
			});
		});

		test('does not count unread sessions excluded by list filters', () => {
			const grouped = createTestSession('Grouped unread', { isRead: false, application: 'github/cli' }).session;
			const unread = createTestSession('Workspace unread', { isRead: false, application: 'github/cli' }).session;
			const read = createTestSession('Read').session;
			const { list, container } = renderList([grouped, unread, read], {
				groups: [group],
				memberships: new Map([[grouped.sessionId, group.id]]),
			});
			list.collapseAllSections();
			list.filters.setExcluded({ kind: 'application', environment: 'local', id: 'github/cli' }, true);
			const filtered = unreadSections(container);
			list.filters.setExcluded({ kind: 'application', environment: 'local', id: 'github/cli' }, false);

			assert.deepStrictEqual({ filtered, restored: unreadSections(container) }, {
				filtered: [],
				restored: [group.name, 'Workspace'],
			});
		});

		test('uses the report-question icon for needs-attention with reduced motion', () => {
			const { session } = createTestSession('Needs input', { status: SessionStatus.NeedsInput });
			const { list, container } = renderList([session], {}, true);
			list.collapseAllSections();
			const header = getHeader(container, 'Workspace');

			assert.deepStrictEqual({
				hasSpinner: !!header.querySelector('.monaco-pixel-spinner'),
				hasReportQuestionIcon: !!header.querySelector('.codicon-report-question'),
				color: header.querySelector<HTMLElement>('.codicon-report-question')?.style.color,
				ariaLabel: header.closest('.monaco-list-row')?.getAttribute('aria-label'),
			}, {
				hasSpinner: false,
				hasReportQuestionIcon: true,
				color: 'var(--vscode-list-warningForeground)',
				ariaLabel: 'Workspace, 1, session needs attention',
			});
		});

		test('never shows status indicators for archived sessions', () => {
			const unread = createTestSession('Archived unread', { isRead: false, isArchived: true }).session;
			const needsInput = createTestSession('Archived needs input', { status: SessionStatus.NeedsInput, isArchived: true }).session;
			const failingCI = createTestSession('Archived CI failure', { isArchived: true }).session;
			const read = createTestSession('Read').session;
			const { list, container, failingCISessions } = renderList([unread, needsInput, failingCI, read], {
				groups: [group],
				memberships: new Map([unread, needsInput, failingCI].map(session => [session.sessionId, group.id])),
			});
			failingCISessions.set([failingCI], undefined);
			list.setExcludeArchived(false);
			list.collapseAllSections();

			assert.deepStrictEqual([group.name, 'Workspace', 'Archived'].map(label => {
				const header = getHeader(container, label);
				return {
					ariaLabel: header.closest('.monaco-list-row')?.getAttribute('aria-label'),
					indicator: !!header.querySelector('.codicon-circle-filled, .codicon-report-question, .monaco-pixel-spinner'),
				};
			}), [
				{ ariaLabel: 'Group A, 0', indicator: false },
				{ ariaLabel: 'Workspace, 1', indicator: false },
				{ ariaLabel: 'Archived, 3', indicator: false },
			]);
		});

		test('reacts to setting changes while a session has failing CI', async () => {
			const { session } = createTestSession('Failing CI');
			const { list, container, instantiationService, failingCISessions } = renderList([session]);
			failingCISessions.set([session], undefined);
			list.collapseAllSections();
			const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
			const states = [];
			for (const enabled of [false, true]) {
				await configurationService.setUserConfiguration(SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
					affectsConfiguration: key => key === SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING,
				}));
				const header = getHeader(container, 'Workspace');
				states.push({
					color: header.querySelector<HTMLElement>('.codicon-circle-filled')?.style.color,
					ariaLabel: header.closest('.monaco-list-row')?.getAttribute('aria-label'),
				});
			}

			assert.deepStrictEqual(states, [
				{ color: undefined, ariaLabel: 'Workspace, 1' },
				{ color: 'var(--vscode-list-warningForeground)', ariaLabel: 'Workspace, 1, session has failing CI checks' },
			]);
		});

		test('reacts to setting changes while a session needs input', async () => {
			const { session } = createTestSession('Needs input', { status: SessionStatus.NeedsInput });
			const { list, container, instantiationService } = renderList([session]);
			list.collapseAllSections();
			const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
			const states = [];
			for (const enabled of [false, true]) {
				await configurationService.setUserConfiguration(SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
					affectsConfiguration: key => key === SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING,
				}));
				const header = getHeader(container, 'Workspace');
				states.push({
					needsInputSections: needsInputSections(container),
					workspaceIcon: !!header.querySelector('.codicon-folder'),
					ariaLabel: header.closest('.monaco-list-row')?.getAttribute('aria-label'),
				});
			}

			assert.deepStrictEqual(states, [
				{ needsInputSections: [], workspaceIcon: true, ariaLabel: 'Workspace, 1' },
				{ needsInputSections: ['Workspace'], workspaceIcon: false, ariaLabel: 'Workspace, 1, session needs attention' },
			]);
		});

		test('reacts to setting changes without refreshing the list', async () => {
			const grouped = createTestSession('Grouped unread', { isRead: false }).session;
			const unread = createTestSession('Workspace unread', { isRead: false }).session;
			const { list, container, instantiationService } = renderList([grouped, unread], {
				groups: [group],
				memberships: new Map([[grouped.sessionId, group.id]]),
			});
			list.collapseAllSections();
			const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
			const states = [];
			for (const enabled of [false, true]) {
				await configurationService.setUserConfiguration(SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
					affectsConfiguration: key => key === SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING,
				}));
				states.push({
					unreadSections: unreadSections(container),
					groupIcon: !!getHeader(container, group.name).querySelector('.codicon-folder-library'),
					workspaceIcon: !!getHeader(container, 'Workspace').querySelector('.codicon-folder'),
					groupAria: getHeader(container, group.name).closest('.monaco-list-row')?.getAttribute('aria-label'),
				});
			}

			assert.deepStrictEqual(states, [
				{ unreadSections: [], groupIcon: true, workspaceIcon: true, groupAria: 'Group A, 1' },
				{ unreadSections: [group.name, 'Workspace'], groupIcon: false, workspaceIcon: false, groupAria: 'Group A, 1, contains unread sessions' },
			]);
		});
	});

	suite('application badges', () => {
		for (const mode of [ExternalSessionApplicationBadgeMode.Off, ExternalSessionApplicationBadgeMode.Title, ExternalSessionApplicationBadgeMode.Details]) {
			test(`renders ${mode} application badges based on the creating application independently of the external flag`, () => {
				const testSession = createTestSession('Session', { isExternal: true });
				const application = observableValue('application', getSessionApplication('vscode'));
				const session: ISession = { ...testSession.session, application };
				const harness = createListHarness(disposables, [session], instantiationService => {
					const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
					configurationService.setUserConfiguration(SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, mode);
					configurationService.setUserConfiguration(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, false);
				});
				const container = harness.createContainer();
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
					grouping: () => SessionsGrouping.Workspace,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
				}));
				list.layout(300, 400);

				const snapshot = () => ({
					titleBadge: container.querySelector('.session-external-application-badge-title.visible')?.textContent,
					detailsBadge: container.querySelector('.session-external-application-badge-details')?.textContent,
					ariaIncludesApplication: container.querySelector('.monaco-list-row[role="treeitem"][aria-level="2"]')?.getAttribute('aria-label')?.includes(`created in ${application.get().label}`) ?? false,
				});
				const vscode = snapshot();
				const unknownApplications = ['agent_tasks_api', 'agent_tasks_public_api', 'api_call_received', 'unknown'].map(name => {
					application.set(getSessionApplication(name), undefined);
					return snapshot();
				});
				application.set(getSessionApplication('github/cli'), undefined);
				const external = snapshot();
				testSession.isExternal.set(false, undefined);
				const continued = snapshot();
				application.set(getSessionApplication('vscode-agents-window'), undefined);
				const vscodeAgentsWindow = snapshot();
				application.set(getSessionApplication('slack'), undefined);
				const otherApplication = snapshot();

				const hidden = { titleBadge: undefined, detailsBadge: undefined, ariaIncludesApplication: false };
				const cliBadge = {
					titleBadge: mode === ExternalSessionApplicationBadgeMode.Title ? 'Copilot CLI' : undefined,
					detailsBadge: mode === ExternalSessionApplicationBadgeMode.Details ? 'Copilot CLI' : undefined,
					ariaIncludesApplication: mode !== ExternalSessionApplicationBadgeMode.Off,
				};
				assert.deepStrictEqual({ vscode, unknownApplications, external, continued, vscodeAgentsWindow, otherApplication }, {
					vscode: hidden,
					unknownApplications: Array(4).fill(hidden),
					external: cliBadge,
					continued: cliBadge,
					vscodeAgentsWindow: hidden,
					otherApplication: {
						titleBadge: mode === ExternalSessionApplicationBadgeMode.Title ? 'Slack' : undefined,
						detailsBadge: mode === ExternalSessionApplicationBadgeMode.Details ? 'Slack' : undefined,
						ariaIncludesApplication: mode !== ExternalSessionApplicationBadgeMode.Off,
					},
				});
			});
		}
	});

	suite('experiment triggers', () => {
		function renderList(sessions: ISession[], configure: (instantiationService: TestInstantiationService) => void = () => { }) {
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const harness = createListHarness(disposables, sessions, instantiationService => {
				instantiationService.stub(ITelemetryService, telemetryService);
				configure(instantiationService);
			});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			return { list, triggers: telemetryService.triggers, harness, container };
		}

		test('reports the Done default trigger when the Filter Sessions dropdown shows, until an archived filter is chosen', () => {
			const results = [false, true].map(chosen => {
				const { list, triggers, harness } = renderList([createTestSession('Active').session], instantiationService => {
					if (chosen) {
						instantiationService.get(IStorageService).store('sessionsListControl.excludeArchived', true, StorageScope.PROFILE, StorageTarget.USER);
					}
				});
				const container = harness.createContainer();
				harness.instantiationService.stub(IMenuService, harness.store.add(harness.instantiationService.createInstance(MenuService)));
				renderSessionsHeader(container, false, harness.instantiationService, harness.store.add(new ContextKeyService(harness.instantiationService.get(IConfigurationService))), harness.store, () => list.reportFilterMenuShown());
				const filter = container.querySelector<HTMLElement>('a.action-label[aria-label="Filter Sessions"][aria-haspopup="true"]');
				const beforeShow = [...triggers];
				filter?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
				return { found: !!filter, beforeShow, afterShow: triggers };
			});

			assert.deepStrictEqual(results, [
				{ found: true, beforeShow: [], afterShow: [`config.${SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING}`] },
				{ found: true, beforeShow: [], afterShow: [] },
			]);
		});

		test('reports the External section trigger for listed external sessions, whether or not they are grouped', () => {
			const results = Object.fromEntries(([
				['grouped', { isExternal: true }, true, false],
				['ungrouped', { isExternal: true }, false, false],
				['pinned', { isExternal: true }, true, true],
				['local', {}, true, false],
			] as const).map(([name, options, groupExternalSessions, pinned]) => {
				const session = createTestSession(name, options).session;
				const { triggers } = renderList([session], instantiationService => {
					(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, groupExternalSessions);
					if (pinned) {
						instantiationService.stub(ISessionsListModelService, 'isSessionPinned', () => true);
					}
				});
				return [name, triggers];
			}));

			assert.deepStrictEqual(results, {
				grouped: [`config.${SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING}`],
				ungrouped: [`config.${SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING}`],
				pinned: [],
				local: [],
			});
		});

		test('renders each external application badge mode and triggers only relevant experiments', () => {
			const results = ([
				[ExternalSessionApplicationBadgeMode.Off, true],
				[ExternalSessionApplicationBadgeMode.Title, true],
				[ExternalSessionApplicationBadgeMode.Details, true],
				[ExternalSessionApplicationBadgeMode.Title, false],
			] as const).map(([mode, showFrom]) => {
				let badgeHover: string | undefined;
				const session = createTestSession('External session', {
					application: 'github/cli',
					environment: 'cloud',
					isExternal: true,
				}).session;
				const { list, triggers, container } = renderList([session], instantiationService => {
					const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
					configurationService.setUserConfiguration(SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, mode);
					configurationService.setUserConfiguration(SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING, showFrom);
					instantiationService.stub(IHoverService, {
						...NullHoverService,
						setupDelayedHoverAtMouse: (...args: Parameters<IHoverService['setupDelayedHoverAtMouse']>) => {
							const target = args[0];
							const options = args[1];
							if (target.classList.contains('session-external-application-badge') && typeof options !== 'function' && typeof options.content === 'string') {
								badgeHover = options.content;
							}
							return NullHoverService.setupDelayedHoverAtMouse(...args);
						},
					});
				});
				list.layout(300, 400);
				const titleBadge = container.querySelector<HTMLElement>('.session-external-application-badge-title.visible');
				const detailsBadge = container.querySelector<HTMLElement>('.session-external-application-badge-details');
				const row = container.querySelector<HTMLElement>('.monaco-list-row[role="treeitem"][aria-level="2"]');
				return {
					titleBadge: titleBadge?.textContent,
					detailsBadge: detailsBadge?.textContent,
					badgeHover,
					ariaIncludesApplication: row?.getAttribute('aria-label')?.includes('created in Copilot CLI'),
					triggers,
				};
			});

			const explicitTriggers = () => [`config.${SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING}`];
			assert.deepStrictEqual(results, [
				{ titleBadge: undefined, detailsBadge: undefined, badgeHover: undefined, ariaIncludesApplication: false, triggers: explicitTriggers() },
				{ titleBadge: 'From Copilot CLI', detailsBadge: undefined, badgeHover: 'From Copilot CLI', ariaIncludesApplication: true, triggers: explicitTriggers() },
				{ titleBadge: undefined, detailsBadge: 'From Copilot CLI', badgeHover: 'From Copilot CLI', ariaIncludesApplication: true, triggers: explicitTriggers() },
				{ titleBadge: 'Copilot CLI', detailsBadge: undefined, badgeHover: 'Copilot CLI', ariaIncludesApplication: true, triggers: explicitTriggers() },
			]);
		});

		test('triggers external application badge experiments only while their values come from defaults', () => {
			const results = ([
				ExternalSessionApplicationBadgeMode.Off,
				ExternalSessionApplicationBadgeMode.Title,
			] as const).map(mode => {
				const session = createTestSession('External session', {
					application: 'github/cli',
					environment: 'cloud',
					isExternal: true,
				}).session;
				const { triggers } = renderList([session], instantiationService => {
					instantiationService.stub(IConfigurationService, new class extends TestConfigurationService {
						constructor() {
							super({
								[SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING]: mode,
								[SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING]: true,
							});
						}

						override inspect<T>(key: string) {
							const value = this.getValue<T>(key);
							return { value, defaultValue: value };
						}
					}());
				});
				return triggers;
			});

			const baseTriggers = [
				`config.${SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING}`,
				`config.${SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING}`,
			];
			assert.deepStrictEqual(results, [
				baseTriggers,
				[...baseTriggers, `config.${SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING}`],
			]);
		});

		test('reports the Done default trigger for archived sessions until an archived filter is chosen', () => {
			const results = Object.fromEntries(([
				['default filter', true, undefined],
				['shown by default', true, true],
				['chosen filter', true, false],
				['nothing archived', false, undefined],
				['obsolete unread filter', true, undefined],
			] as const).map(([name, isArchived, showArchivedByDefault]) => {
				const session = createTestSession(name, { isArchived }).session;
				const { triggers } = renderList([session], instantiationService => {
					if (showArchivedByDefault !== undefined) {
						(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING, showArchivedByDefault);
					}
					if (name === 'chosen filter') {
						instantiationService.get(IStorageService).store('sessionsListControl.excludeArchived', false, StorageScope.PROFILE, StorageTarget.USER);
					}
					if (name === 'obsolete unread filter') {
						instantiationService.get(IStorageService).store('sessionsListControl.excludeRead', true, StorageScope.PROFILE, StorageTarget.USER);
					}
				});
				return [name, triggers];
			}));

			const trigger = [`config.${SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING}`];
			assert.deepStrictEqual(results, {
				'default filter': trigger,
				'shown by default': trigger,
				'chosen filter': [],
				'nothing archived': [],
				'obsolete unread filter': trigger,
			});
		});
	});

	suite('groupByWorkspace', () => {

		test('groups are sorted alphabetically regardless of insertion order', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Zebra' }),
				createSession('2', { workspaceLabel: 'Apple' }),
				createSession('3', { workspaceLabel: 'Mango' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Apple', 'Mango', 'Zebra']);
		});

		test('sessions without workspace are grouped under "Unknown"', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Beta' }),
				createSession('2', {}),
				createSession('3', { workspaceLabel: 'Alpha' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Alpha', 'Beta', 'Unknown']);
		});

		test('multiple sessions in same workspace are grouped together', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Repo-B' }),
				createSession('2', { workspaceLabel: 'Repo-A' }),
				createSession('3', { workspaceLabel: 'Repo-B' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Repo-A', 'Repo-B']);
			assert.strictEqual(groups[0].sessions.length, 1);
			assert.strictEqual(groups[1].sessions.length, 2);
		});

		test('"No Workspace" appears after workspaces that sort alphabetically later', () => {
			const sessions = [
				createSession('1', {}),
				createSession('2', { workspaceLabel: 'Zulu' }),
				createSession('3', { workspaceLabel: 'Alpha' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Alpha', 'Zulu', 'Unknown']);
		});

		test('empty workspace label is treated as "Unknown"', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Zulu' }),
				createSession('2', { workspaceLabel: '' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Zulu', 'Unknown']);
			assert.strictEqual(groups[1].sessions.length, 1);
		});

		test('uses the display label for the group id and the resource for collapse state', () => {
			const workspaceResource = URI.parse('vscode-agent-host://stable-host/project');
			const sessions = [
				createSession('1', { workspaceLabel: 'MyProject', workspaceResource }),
				createSession('2', { workspaceLabel: 'MyProject', workspaceResource }),
			];

			const groups = groupByWorkspace(sessions);

			assert.strictEqual(groups[0].id, 'workspace:MyProject');
			assert.strictEqual(groups[0].collapseStateId, `workspace:${workspaceResource.toString()}`);
		});

		test('uses the display label for collapse state when grouped resources differ', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'MyProject', workspaceResource: URI.parse('file:///a/project') }),
				createSession('2', { workspaceLabel: 'MyProject', workspaceResource: URI.parse('file:///b/project') }),
			];

			const groups = groupByWorkspace(sessions);

			assert.strictEqual(groups[0].id, 'workspace:MyProject');
			assert.strictEqual(groups[0].collapseStateId, undefined);
		});

		test('restores collapse state after a workspace display label changes', () => {
			const workspaceResource = URI.parse('vscode-agent-host://stable-host/project');
			const originalLabel = 'project [Original Host]';
			const renamedLabel = 'project [Renamed Host]';
			const original = createSession('1', { workspaceLabel: originalLabel, workspaceResource });
			const renamed = createSession('1', { workspaceLabel: renamedLabel, workspaceResource });
			const harness = createListHarness(disposables, [original]);
			const storageService = harness.instantiationService.get(IStorageService);
			storageService.store(
				'sessionsListControl.sectionCollapseState',
				JSON.stringify({ [`workspace:${originalLabel}`]: true }),
				StorageScope.PROFILE,
				StorageTarget.USER,
			);

			const createList = (label: string) => {
				const container = harness.createContainer();
				const list = harness.instantiationService.createInstance(TestSessionsList, container, {
					grouping: () => SessionsGrouping.Workspace,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
				});
				list.layout(300, 400);
				return { container, list, sectionId: `workspace:${label}` };
			};

			const first = createList(originalLabel);
			assert.strictEqual(first.list.getItemRow({ section: first.sectionId })?.getAttribute('aria-expanded'), 'false');
			first.list.dispose();

			const persisted = JSON.parse(storageService.get('sessionsListControl.sectionCollapseState', StorageScope.PROFILE)!) as Record<string, boolean>;
			const resourceStateId = `workspace:${workspaceResource.toString()}`;
			assert.strictEqual(persisted[resourceStateId], true);
			assert.strictEqual(persisted[`workspace:${originalLabel}`], undefined);

			harness.managementService.sessions = [renamed];
			const second = createList(renamedLabel);
			assert.strictEqual(second.list.getItemRow({ section: second.sectionId })?.getAttribute('aria-expanded'), 'false');
			second.list.dispose();
		});
	});

	suite('groupByRepository', () => {
		function folder(root: URI, repository?: string): ISessionFolder {
			const [owner, repo] = repository?.split('/') ?? [];
			return {
				root,
				workingDirectory: root,
				name: root.path,
				description: undefined,
				gitRepository: repository ? { uri: root, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: constObservable({ owner, repo }) } : undefined,
			};
		}

		test('groups a repository across environments, names sections by repository, and keeps sessions without one in their workspace', () => {
			const cloudRoot = URI.parse('github-remote-file://github/microsoft/vscode/main');
			// A cloud sandbox session names its repository by URL and reports no Git metadata until its sandbox connects.
			const sandboxRoot = URI.parse('https://github.com/microsoft/vscode');
			const otherHostRoot = URI.parse('https://example.com/microsoft/vscode');
			const sessions = [
				// A cloud session names its repository only through its workspace.
				createSession('cloud', { workspaceLabel: 'microsoft/vscode', workspaceResource: cloudRoot, folders: [folder(cloudRoot)] }),
				createSession('sandbox', { workspaceLabel: 'microsoft/vscode', workspaceResource: sandboxRoot, folders: [folder(sandboxRoot)] }),
				createSession('git url', { workspaceLabel: 'vscode', folders: [folder(URI.parse('https://github.com/microsoft/vscode.git'))] }),
				createSession('local', { workspaceLabel: 'vscode', folders: [folder(URI.file('/src/vscode'), 'microsoft/vscode')] }),
				createSession('remote', { workspaceLabel: 'vscode [Host]', folders: [folder(URI.parse('vscode-agent-host://host/src/vscode'), 'Microsoft/VSCode')] }),
				createSession('fork', { workspaceLabel: 'vscode', folders: [folder(URI.file('/src/fork'), 'someone/vscode')] }),
				// Git metadata takes precedence over a repository URL.
				createSession('fork by url', { workspaceLabel: 'vscode', folders: [folder(sandboxRoot, 'someone/vscode')] }),
				createSession('docs', { workspaceLabel: 'docs', folders: [folder(URI.file('/src/docs'), 'microsoft/vscode-docs')] }),
				createSession('scratch', { workspaceLabel: 'scratch', folders: [folder(URI.file('/tmp/scratch'))] }),
				createSession('other host', { workspaceLabel: 'example', workspaceResource: otherHostRoot, folders: [folder(otherHostRoot)] }),
				createSession('unknown', {}),
			];

			assert.deepStrictEqual(groupByRepository(sessions).map(section => ({ id: section.id, label: section.label, sessions: section.sessions.map(session => session.sessionId) })), [
				{ id: 'workspace:example', label: 'example', sessions: ['other host'] },
				// Repository names are shared by two repository sections, so they include their owner.
				{ id: 'repository:microsoft/vscode', label: 'microsoft/vscode', sessions: ['cloud', 'sandbox', 'git url', 'local', 'remote'] },
				{ id: 'workspace:scratch', label: 'scratch', sessions: ['scratch'] },
				{ id: 'repository:someone/vscode', label: 'someone/vscode', sessions: ['fork', 'fork by url'] },
				{ id: 'repository:microsoft/vscode-docs', label: 'vscode-docs', sessions: ['docs'] },
				{ id: 'workspace:Unknown', label: 'Unknown', sessions: ['unknown'] },
			]);
		});
	});

	suite('migrateCloudSandboxRepositorySections', () => {
		test('gives repository sections the state recorded for their cloud sandbox sessions\' workspace sections, once', () => {
			const storageService = disposables.add(new InMemoryStorageService());
			const store = (key: string, value: object) => storageService.store(key, JSON.stringify(value), StorageScope.PROFILE, StorageTarget.USER);
			const read = (key: string) => JSON.parse(storageService.get(key, StorageScope.PROFILE) ?? 'null');
			store('sessionsListControl.groups', {
				groups: [{ id: 'work', name: 'Work', createdAt: 1 }, { id: 'other', name: 'Other', createdAt: 2 }],
				membership: {},
				sectionMembership: {
					// Repository grouping placed the workspace sections of sessions without a repository under these keys.
					'repository:workspace:osortega/simple-server': 'work',
					'repository:workspace:microsoft/vscode': 'work',
					'repository:workspace:scratch': 'work',
					// The user placed `repository:contoso/app` at the top level, which promotes it.
					'repository:workspace:contoso/app': 'work',
					// Workspace grouping's placement, and a repository section's own placement.
					'workspace:osortega/simple-server': 'other',
					'repository:microsoft/vscode': 'other',
				},
				sectionAppearance: {
					'workspace:osortega/simple-server': { color: 'charts.red' },
					// Without cloud sandbox sessions, this only names a Copilot cloud session's workspace section.
					'workspace:microsoft/vscode-docs': { icon: 'book' },
				},
			});
			store('sessionsListControl.sectionOrder', {
				order: ['workspace:osortega/simple-server', 'group:work', 'workspace:microsoft/vscode-docs', 'repository:contoso/app'],
				promoted: ['workspace:osortega/simple-server', 'workspace:microsoft/vscode-docs', 'repository:contoso/app'],
			});
			store('sessionsListControl.sectionCollapseState', {
				'workspace:https://github.com/contoso/app': true,
				'workspace:https://github.com/microsoft/vscode': true,
				'repository:microsoft/vscode': false,
				'workspace:github-remote-file://github/microsoft/vscode-docs/HEAD': true,
			});
			store('sessionsListControl.sessionGroupExpansionState', { 'workspace:https://github.com/contoso/app': true });
			const orderService = disposables.add(new SessionSectionOrderService(storageService));
			const groupsService = disposables.add(new SessionGroupsService(storageService, upcastPartial<ISessionsManagementService>({
				onDidChangeSessions: Event.None,
				onDidDeleteSession: Event.None,
				onDidArchiveSession: Event.None,
				onWillSendRequest: Event.None,
				onDidReplaceNewDraftSession: Event.None,
				onDidReplaceSession: Event.None,
				onDidStartSession: Event.None,
				onDidDiscardNewSession: Event.None,
				onDidMoveChat: Event.None,
				getSessions: () => [],
				getInFlightNewSessionRequests: () => [],
				getSession: () => undefined,
			}), orderService));
			const migrate = () => SessionsList.migrateCloudSandboxRepositorySections(storageService, groupsService, orderService);

			migrate();
			const migrated = {
				work: groupsService.getChildIds('work'),
				other: groupsService.getChildIds('other'),
				appearances: ['repository:osortega/simple-server', 'repository:microsoft/vscode-docs'].map(id => groupsService.getSectionAppearance(id)),
				order: orderService.capturePositions([]).order,
				promoted: ['repository:osortega/simple-server', 'repository:microsoft/vscode-docs'].filter(id => orderService.isPromoted(id)),
				collapsed: read('sessionsListControl.sectionCollapseState'),
				expanded: read('sessionsListControl.sessionGroupExpansionState'),
			};
			// A later choice of the user stays, as the migration runs once.
			groupsService.moveSection('repository:osortega/simple-server', undefined);
			migrate();

			assert.deepStrictEqual({ ...migrated, groupAfterRerun: groupsService.getGroupOfSection('repository:osortega/simple-server') }, {
				work: ['repository:workspace:osortega/simple-server', 'repository:osortega/simple-server', 'repository:workspace:microsoft/vscode', 'repository:workspace:scratch', 'repository:workspace:contoso/app'],
				other: ['workspace:osortega/simple-server', 'repository:microsoft/vscode'],
				appearances: [{ color: 'charts.red' }, undefined],
				order: ['workspace:osortega/simple-server', 'repository:osortega/simple-server', 'group:work', 'workspace:microsoft/vscode-docs', 'repository:contoso/app'],
				promoted: ['repository:osortega/simple-server'],
				collapsed: {
					'workspace:https://github.com/contoso/app': true,
					'workspace:https://github.com/microsoft/vscode': true,
					'repository:microsoft/vscode': false,
					'workspace:github-remote-file://github/microsoft/vscode-docs/HEAD': true,
					'repository:contoso/app': true,
				},
				expanded: { 'workspace:https://github.com/contoso/app': true, 'repository:contoso/app': true },
				groupAfterRerun: undefined,
			});
		});
	});

	suite('groupByEnvironment', () => {
		test('groups across agents and workspaces by stable environment identity, including disconnected and unknown hosts', () => {
			const sessions = [
				createTestSession('Remote Z', { environment: 'host-z' }).session,
				createTestSession('Cloud', { environment: 'cloud' }).session,
				createTestSession('Local Copilot', { harness: 'copilot', workspaceLabel: 'Alpha' }).session,
				createTestSession('Local Claude', { harness: 'claude', workspaceLabel: 'Beta' }).session,
				createTestSession('Remote A', { environment: 'host-a' }).session,
				createTestSession('Unknown host', { environment: 'missing' }).session,
			];
			const environments = [
				{ id: 'host-z', label: 'Host', isConnected: constObservable(false) },
				{ id: 'host-a', label: 'Host' },
				{ id: 'local', label: 'This Computer' },
				{ id: 'local', label: 'This Computer' },
				{ id: 'empty', label: 'Empty' },
			];

			assert.deepStrictEqual(groupByEnvironment(sessions, getSessionEnvironments(environments)).map(section => ({
				id: section.id, label: section.label, sessions: section.sessions.map(session => session.sessionId),
			})), [
				{ id: 'environment:local', label: 'This Computer', sessions: ['Local Copilot', 'Local Claude'] },
				{ id: 'environment:cloud', label: 'Cloud', sessions: ['Cloud'] },
				{ id: 'environment:host-a', label: 'Host', sessions: ['Remote A'] },
				{ id: 'environment:host-z', label: 'Host', sessions: ['Remote Z'] },
				{ id: 'environment:missing', label: 'missing', sessions: ['Unknown host'] },
			]);
		});

		test('uses built-in labels without an environment catalog', () => {
			const sessions = [
				createTestSession('Cloud', { environment: 'cloud' }).session,
				createTestSession('Local').session,
			];
			const snapshot = (sections: ISessionSection[]) => sections.map(section => ({ id: section.id, label: section.label }));
			const expected = [
				{ id: 'environment:local', label: 'This Computer' },
				{ id: 'environment:cloud', label: 'Cloud' },
			];

			assert.deepStrictEqual({
				direct: snapshot(groupByEnvironment(sessions)),
				list: snapshot(groupSessionsForList(sessions, SessionsGrouping.Environment, SessionsSorting.Created, () => false)),
			}, { direct: expected, list: expected });
		});
	});

	suite('groupByDate', () => {

		const DAY_MS = 86_400_000;

		// `groupByDate` expects sessions pre-sorted most-recent-first.
		function minutesAgo(minutes: number): Date {
			return new Date(Date.now() - minutes * 60_000);
		}

		function daysAgo(days: number): Date {
			return new Date(Date.now() - days * DAY_MS);
		}

		test('sessions within the last 7 days go to "Recent", older ones to "Older"', () => {
			const sessions = [
				createSession('recent-1', { createdAt: minutesAgo(5) }),
				createSession('recent-2', { createdAt: daysAgo(3) }),
				createSession('old-1', { createdAt: daysAgo(10) }),
				createSession('old-2', { createdAt: daysAgo(30) }),
			];

			const sections = groupByDate(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sections.map(s => ({ id: s.id, sessions: s.sessions.map(session => session.sessionId) })), [
				{ id: 'recent', sessions: ['recent-1', 'recent-2'] },
				{ id: 'older', sessions: ['old-1', 'old-2'] },
			]);
		});

		test('sessions updated within the last 24 hours stay in "Recent" when sorting by creation time', () => {
			const sessions = [
				createSession('recently-created', { createdAt: daysAgo(3) }),
				createSession('recently-updated', { createdAt: daysAgo(10), updatedAt: minutesAgo(30) }),
				createSession('old', { createdAt: daysAgo(11), updatedAt: daysAgo(2) }),
			];

			const sections = groupByDate(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sections.map(s => ({ id: s.id, sessions: s.sessions.map(session => session.sessionId) })), [
				{ id: 'recent', sessions: ['recently-created', 'recently-updated'] },
				{ id: 'older', sessions: ['old'] },
			]);
		});

		test('"Recent" is capped at 10 sessions that were not updated within the last 24 hours', () => {
			const twoDaysAgo = daysAgo(2).getTime();
			const sessions = Array.from({ length: 13 }, (_, i) => {
				const createdAt = new Date(twoDaysAgo - i * 60_000);
				return createSession(`s${i}`, { createdAt });
			});

			const sections = groupByDate(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sections.map(s => ({ id: s.id, sessions: s.sessions.map(session => session.sessionId) })), [
				{ id: 'recent', sessions: ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'] },
				{ id: 'older', sessions: ['s10', 's11', 's12'] },
			]);
		});

		test('"Recent" expands from 10 to 15 only for additional recently updated sessions', () => {
			const twoDaysAgo = daysAgo(2).getTime();
			const recentlyCreated = Array.from({ length: 10 }, (_, i) => {
				const createdAt = new Date(twoDaysAgo - i * 60_000);
				return createSession(`created-${i}`, { createdAt });
			});
			const sessions = [
				...recentlyCreated,
				createSession('not-recently-updated', { createdAt: daysAgo(10), updatedAt: daysAgo(2) }),
				...Array.from({ length: 6 }, (_, i) =>
					createSession(`updated-${i}`, { createdAt: daysAgo(11 + i), updatedAt: minutesAgo(i + 1) })),
			];

			const sections = groupByDate(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sections.map(s => ({ id: s.id, sessions: s.sessions.map(session => session.sessionId) })), [
				{
					id: 'recent',
					sessions: [
						'created-0', 'created-1', 'created-2', 'created-3', 'created-4',
						'created-5', 'created-6', 'created-7', 'created-8', 'created-9',
						'updated-0', 'updated-1', 'updated-2', 'updated-3', 'updated-4',
					],
				},
				{ id: 'older', sessions: ['not-recently-updated', 'updated-5'] },
			]);
		});

		test('empty sections are omitted', () => {
			const sessions = [
				createSession('only-old', { createdAt: daysAgo(20) }),
			];

			const sections = groupByDate(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sections.map(s => s.id), ['older']);
		});
	});

	suite('sortSessions', () => {

		test('sorts by createdAt descending when sorting is Created', () => {
			const sessions = [
				createSession('old', { createdAt: new Date('2024-01-01') }),
				createSession('new', { createdAt: new Date('2024-06-01') }),
				createSession('mid', { createdAt: new Date('2024-03-01') }),
			];

			const sorted = sortSessions(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sorted.map(s => s.sessionId), ['new', 'mid', 'old']);
		});

		test('sorts by updatedAt descending when sorting is Updated', () => {
			const sessions = [
				createSession('a', { createdAt: new Date('2024-06-01'), updatedAt: new Date('2024-07-01') }),
				createSession('b', { createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-09-01') }),
				createSession('c', { createdAt: new Date('2024-03-01'), updatedAt: new Date('2024-08-01') }),
			];

			const sorted = sortSessions(sessions, SessionsSorting.Updated);

			assert.deepStrictEqual(sorted.map(s => s.sessionId), ['b', 'c', 'a']);
		});
	});

	suite('limitSessionsForList', () => {

		test('caps sessions and returns a show more item', () => {
			const sessions = ['1', '2', '3'].map(id => createSession(id, {}));
			const result = limitSessionsForList(sessions, 2, {
				enabled: true,
				expanded: false,
				sectionId: 'group:alpha',
				sectionLabel: 'Alpha',
			});

			assert.deepStrictEqual({
				sessions: result.sessions.map(session => session.sessionId),
				showMore: result.showMore,
			}, {
				sessions: ['1', '2'],
				showMore: {
					showMore: true,
					kind: 'sessions',
					mode: 'more',
					sectionId: 'group:alpha',
					stateId: 'group:alpha',
					sectionLabel: 'Alpha',
					remainingCount: 1,
				},
			});
		});

		test('returns all sessions and a show less item when expanded', () => {
			const sessions = ['1', '2', '3'].map(id => createSession(id, {}));
			const result = limitSessionsForList(sessions, 2, {
				enabled: true,
				expanded: true,
				sectionId: 'workspace:alpha',
				stateId: 'workspace:file:///alpha',
				sectionLabel: 'Alpha',
				revealSessionId: '3',
			});

			assert.deepStrictEqual({
				sessions: result.sessions.map(session => session.sessionId),
				showMore: result.showMore,
			}, {
				sessions: ['1', '2', '3'],
				showMore: {
					showMore: true,
					kind: 'sessions',
					mode: 'less',
					sectionId: 'workspace:alpha',
					stateId: 'workspace:file:///alpha',
					sectionLabel: 'Alpha',
					remainingCount: 0,
				},
			});
		});

		test('does not cap when disabled', () => {
			const sessions = ['1', '2', '3'].map(id => createSession(id, {}));
			const result = limitSessionsForList(sessions, 2, {
				enabled: false,
				expanded: false,
				sectionId: 'group:alpha',
				sectionLabel: 'Alpha',
				revealSessionId: '3',
			});

			assert.deepStrictEqual({
				sessions: result.sessions.map(session => session.sessionId),
				showMore: result.showMore,
			}, {
				sessions: ['1', '2', '3'],
				showMore: undefined,
			});
		});

		for (const revealSessionId of ['1', '3', '5', 'missing']) {
			test(`includes only the revealed session beyond the cap (${revealSessionId})`, () => {
				const sessions = ['1', '2', '3', '4', '5'].map(id => createSession(id, {}));
				const result = limitSessionsForList(sessions, 2, {
					enabled: true,
					expanded: false,
					sectionId: 'group:alpha',
					sectionLabel: 'Alpha',
					revealSessionId,
				});
				const addsSession = revealSessionId === '3' || revealSessionId === '5';

				assert.deepStrictEqual({
					sessions: result.sessions.map(session => session.sessionId),
					showMore: result.showMore,
				}, {
					sessions: addsSession ? ['1', '2', revealSessionId] : ['1', '2'],
					showMore: {
						showMore: true,
						kind: 'sessions',
						mode: 'more',
						sectionId: 'group:alpha',
						stateId: 'group:alpha',
						sectionLabel: 'Alpha',
						remainingCount: addsSession ? 2 : 3,
					},
				});
			});
		}

		test('omits show more when the revealed session is the only hidden session', () => {
			const sessions = ['1', '2', '3'].map(id => createSession(id, {}));
			const result = limitSessionsForList(sessions, 2, {
				enabled: true,
				expanded: false,
				sectionId: 'group:alpha',
				sectionLabel: 'Alpha',
				revealSessionId: '3',
			});

			assert.deepStrictEqual({
				sessions: result.sessions.map(session => session.sessionId),
				showMore: result.showMore,
			}, {
				sessions: ['1', '2', '3'],
				showMore: undefined,
			});
		});
	});

	suite('show more state', () => {
		test('lists custom groups in full and caps workspaces until the user chooses otherwise, also after a reload', () => {
			const group: ISessionGroup = { id: 'group-a', name: 'Group A', createdAt: 1 };
			const workspaceResource = URI.parse('file:///workspace');
			const createSessions = (prefix: string, count: number) => Array.from({ length: count }, (_, index) =>
				createTestSession(`${prefix}${index}`, { workspaceResource, createdAt: new Date(Date.now() - index * 1000) }).session);
			const grouped = createSessions('group-', 7);
			const harness = createListHarness(disposables, [...grouped, ...createSessions('workspace-', 8)], {
				groups: [group],
				memberships: new Map(grouped.map(session => [session.sessionId, group.id])),
			});
			const storageService = harness.instantiationService.get(IStorageService);
			const storedState = () => {
				const raw = storageService.get('sessionsListControl.sessionGroupExpansionState', StorageScope.PROFILE);
				return raw === undefined ? undefined : JSON.parse(raw);
			};
			const open = () => {
				const container = harness.createContainer(400, 1400);
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
					grouping: () => SessionsGrouping.Workspace,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
				}));
				list.layout(1400, 400);
				const showMoreLabels = () => [...container.querySelectorAll<HTMLElement>('.monaco-list-rows .session-show-more-label')];
				return {
					list,
					snapshot: () => {
						const visible = list.getVisibleSessions().map(session => session.sessionId);
						return {
							group: visible.filter(id => id.startsWith('group-')).length,
							workspace: visible.filter(id => id.startsWith('workspace-')).length,
							showMore: showMoreLabels().map(label => label.textContent),
						};
					},
					click: (label: string) => {
						const row = showMoreLabels().find(element => element.textContent === label)?.closest<HTMLElement>('.monaco-list-row');
						assert.ok(row, `Expected a "${label}" row`);
						clickRow(row);
					},
				};
			};

			const first = open();
			const defaults = first.snapshot();
			first.click('Show less');
			first.click('+3 more');
			const chosen = first.snapshot();
			first.list.dispose();

			const second = open();
			const reloaded = second.snapshot();
			const stored = storedState();
			second.list.setWorkspaceGroupCapped(false);
			const showAll = second.snapshot();
			second.list.setWorkspaceGroupCapped(true);
			const showRecent = second.snapshot();
			second.list.resetFilters();

			assert.deepStrictEqual({ defaults, chosen, reloaded, stored, showAll, showRecent, reset: second.snapshot(), storedAfterReset: storedState() }, {
				defaults: { group: 7, workspace: 5, showMore: ['Show less', '+3 more'] },
				chosen: { group: 5, workspace: 8, showMore: ['+2 more', 'Show less'] },
				reloaded: { group: 5, workspace: 8, showMore: ['+2 more', 'Show less'] },
				// Keyed by the workspace resource so that the choice survives display label changes.
				stored: { 'group:group-a': false, 'workspace:file:///workspace': true },
				showAll: { group: 7, workspace: 8, showMore: [] },
				showRecent: { group: 5, workspace: 8, showMore: ['+2 more', 'Show less'] },
				reset: { group: 7, workspace: 5, showMore: ['Show less', '+3 more'] },
				storedAfterReset: undefined,
			});
		});

		for (const grouping of [SessionsGrouping.Workspace, SessionsGrouping.Repository]) {
			test(`caps the Chats section like a workspace until the user chooses otherwise (${grouping})`, () => {
				const harness = createListHarness(disposables, Array.from({ length: 8 }, (_, index) =>
					createTestSession(`chat-${index}`, { isQuickChat: true, createdAt: new Date(Date.now() - index * 1000) }).session));
				harness.instantiationService.get(IStorageService).store('sessionsListControl.sectionCollapseState', JSON.stringify({ [QUICK_CHATS_SECTION_ID]: false }), StorageScope.PROFILE, StorageTarget.USER);
				const open = () => {
					const container = harness.createContainer(400, 1400);
					const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
						grouping: () => grouping,
						sorting: () => SessionsSorting.Created,
						onSessionOpen: () => { },
					}));
					list.layout(1400, 400);
					const showMoreLabels = () => [...container.querySelectorAll<HTMLElement>('.monaco-list-rows .session-show-more-label')];
					return {
						list,
						snapshot: () => ({ chats: list.getVisibleSessions().length, showMore: showMoreLabels().map(label => label.textContent) }),
						click: (label: string) => {
							const row = showMoreLabels().find(element => element.textContent === label)?.closest<HTMLElement>('.monaco-list-row');
							assert.ok(row, `Expected a "${label}" row`);
							clickRow(row);
						},
					};
				};

				const first = open();
				const defaults = first.snapshot();
				first.click('+3 more');
				const expanded = first.snapshot();
				first.list.dispose();

				const second = open();
				const reloaded = second.snapshot();
				second.list.setWorkspaceGroupCapped(false);
				const showAll = second.snapshot();
				second.list.setWorkspaceGroupCapped(true);
				second.click('Show less');

				assert.deepStrictEqual({ defaults, expanded, reloaded, showAll, collapsed: second.snapshot() }, {
					defaults: { chats: 5, showMore: ['+3 more'] },
					expanded: { chats: 8, showMore: ['Show less'] },
					reloaded: { chats: 8, showMore: ['Show less'] },
					showAll: { chats: 8, showMore: [] },
					collapsed: { chats: 5, showMore: ['+3 more'] },
				});
			});
		}
	});

	suite('sticky show more and less', () => {
		const group: ISessionGroup = { id: 'project', name: 'Project', createdAt: 1 };
		const sessions = (count: number, prefix = 'session') => Array.from({ length: count }, (_, index) =>
			createTestSession(`${prefix}-${index}`, {
				workspaceResource: URI.parse(`file:///${prefix}`),
				workspaceLabel: 'Project',
				repository: 'owner/project',
				createdAt: new Date(Date.now() - index * 1000),
			}).session);

		function createList(items: ISession[], options: IListHarnessOptions = {}, grouping = SessionsGrouping.Workspace, compact = false) {
			const harness = createListHarness(disposables, items, options);
			const container = harness.createContainer(400, 300);
			const listHost = append(container, $('div'));
			const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, listHost, {
				grouping: () => grouping,
				sorting: () => SessionsSorting.Created,
				compact: () => compact,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const footer = container.querySelector<HTMLElement>('.sessions-list-sticky-show-more')!;
			const button = footer.querySelector<HTMLElement>('[role="button"]')!;
			const snapshot = () => ({
				hidden: footer.hidden,
				label: button.textContent,
				ariaLabel: button.getAttribute('aria-label'),
			});
			const clickMore = () => {
				list.layout(600, 400);
				const row = [...container.querySelectorAll<HTMLElement>('.monaco-list-rows .session-show-more-label')]
					.find(label => label.textContent?.startsWith('+'))?.closest<HTMLElement>('.monaco-list-row');
				assert.ok(row);
				row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
				row.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
				const immediatelyAfterExpansion = { ...snapshot(), scrollTop: list.scrollTop };
				list.layout(300, 400);
				return immediatelyAfterExpansion;
			};
			return { ...harness, container, list, footer, button, snapshot, clickMore };
		}

		for (const commandId of ['list.focusDown', 'list.focusPageDown']) {
			for (const mode of ['more', 'less'] as const) {
				test(`keeps compact rows above sticky ${mode} during repeated ${commandId}`, async () => {
					const grouped = sessions(20);
					const fixture = createList(grouped, {
						groups: [group],
						memberships: new Map(grouped.map(session => [session.sessionId, group.id])),
						cappedGroupIds: mode === 'more' ? [group.id] : undefined,
					}, SessionsGrouping.Workspace, true);
					fixture.list.layout(120, 400);
					fixture.list.setFocusedItem({ session: grouped[0].resource });
					fixture.list.focus();
					const samples = [];
					for (let step = 0; step < (mode === 'more' ? 5 : 20); step++) {
						await fixture.list.focusNextItem(commandId === 'list.focusPageDown');
						const row = fixture.container.querySelector<HTMLElement>('.monaco-list-rows > .monaco-list-row.focused');
						assert.ok(row, 'Expected keyboard focus to have a rendered row');
						const rowBottom = row.getBoundingClientRect().bottom;
						const visibleBottom = fixture.footer.hidden
							? fixture.list.element.getBoundingClientRect().bottom
							: fixture.footer.getBoundingClientRect().top;
						samples.push({
							unobscured: rowBottom <= visibleBottom,
							footerVisible: !fixture.footer.hidden,
							index: Number(row.dataset.index),
						});
					}

					assert.deepStrictEqual({
						allUnobscured: samples.every(sample => sample.unobscured),
						withFooter: samples.some(sample => sample.footerVisible),
						reachedNormalFooter: samples.some(sample => !sample.footerVisible),
						advanced: samples.at(-1)!.index > samples[0].index,
					}, {
						allUnobscured: true,
						withFooter: true,
						reachedNormalFooter: true,
						advanced: true,
					}, JSON.stringify(samples));
				});
			}
		}

		test('keeps compact nested chats above the sticky footer without constraining manual scrolling', async () => {
			const nested = buildTestSession({
				id: 'nested',
				title: 'Nested session',
				workspace: 'Project',
				chats: Array.from({ length: 12 }, (_, index) => ({ id: `chat-${index}`, title: `Chat ${index}` })),
			});
			const grouped = [nested.session, ...sessions(6)];
			const fixture = createList(grouped, {
				groups: [group],
				memberships: new Map(grouped.map(session => [session.sessionId, group.id])),
				cappedGroupIds: [group.id],
			}, SessionsGrouping.Workspace, true);
			fixture.list.layout(180, 400);
			fixture.list.setItemCollapsed({ session: nested.session.resource }, false);
			fixture.list.setFocusedItem({ session: nested.session.resource });
			fixture.list.focus();
			const samples = [];
			for (let step = 0; step < 10; step++) {
				await fixture.list.focusNextItem(false);
				const row = fixture.container.querySelector<HTMLElement>('.monaco-list-rows > .monaco-list-row.focused');
				assert.ok(row);
				samples.push({
					chat: !!row.querySelector('.session-chat-item'),
					unobscured: row.getBoundingClientRect().bottom <= fixture.footer.getBoundingClientRect().top,
				});
			}
			fixture.list.scrollTop = 0;

			assert.deepStrictEqual({
				nestedChatsVisible: samples.every(sample => sample.chat && sample.unobscured),
				footerVisible: !fixture.footer.hidden,
				manualScrollTop: fixture.list.scrollTop,
			}, {
				nestedChatsVisible: true,
				footerVisible: true,
				manualScrollTop: 0,
			});
		});

		for (const grouping of [SessionsGrouping.Workspace, SessionsGrouping.Repository]) {
			test(`pins an expanded ${grouping} section and hands off to its normal footer`, () => {
				const fixture = createList(sessions(20), {}, grouping);
				const capped = fixture.snapshot();
				fixture.clickMore();
				fixture.list.scrollTop = 200;
				const scrolling = fixture.snapshot();
				const pinnedToBottom = fixture.footer.getBoundingClientRect().bottom === fixture.list.element.getBoundingClientRect().top + 300;
				fixture.list.scrollTop = 10000;
				const atEnd = fixture.footer.hidden;
				fixture.list.scrollTop = 200;
				const scrollingBack = fixture.footer.hidden;
				fixture.list.layout(2000, 400);
				const fits = fixture.footer.hidden;
				fixture.list.layout(300, 400);
				const resized = fixture.footer.hidden;

				assert.deepStrictEqual({ capped, scrolling, pinnedToBottom, atEnd, scrollingBack, fits, resized }, {
					capped: { hidden: false, label: '+15 more', ariaLabel: `Show 15 more sessions in ${grouping === SessionsGrouping.Repository ? 'project' : 'Project'}` },
					scrolling: { hidden: false, label: 'Show less', ariaLabel: `Show fewer sessions in ${grouping === SessionsGrouping.Repository ? 'project' : 'Project'}` },
					pinnedToBottom: true,
					atEnd: true,
					scrollingBack: false,
					fits: true,
					resized: false,
				});
			});
		}

		for (const kind of ['show more', 'section header'] as const) {
			test(`shows immediately after expanding a project via ${kind}, with another section above it`, () => {
				const pinned = sessions(1, 'pinned')[0];
				const fixture = createList([pinned, ...sessions(20)], {
					pinnedSessionIds: new Set([pinned.sessionId]),
				});
				fixture.list.setItemCollapsed({ section: 'pinned' }, true);
				let expanded = fixture.clickMore();
				if (kind === 'section header') {
					fixture.list.setItemCollapsed({ section: 'workspace:Project' }, true);
					fixture.list.scrollTop = 0;
					fixture.list.setItemCollapsed({ section: 'workspace:Project' }, false);
					expanded = { ...fixture.snapshot(), scrollTop: fixture.list.scrollTop };
				}

				assert.deepStrictEqual({
					firstSection: fixture.container.querySelector('.monaco-list-rows .session-section-label')?.textContent,
					expanded,
				}, {
					firstSection: 'Pinned',
					expanded: { hidden: false, label: 'Show less', ariaLabel: 'Show fewer sessions in Project', scrollTop: 0 },
				});
			});
		}

		for (const mode of ['more', 'less'] as const) {
			test(`shows the themed list hover background for sticky ${mode} and clears it on mouse out`, () => {
				const grouped = sessions(20);
				const fixture = createList(grouped, {
					groups: [group],
					memberships: new Map(grouped.map(session => [session.sessionId, group.id])),
					cappedGroupIds: mode === 'more' ? [group.id] : undefined,
				});
				fixture.container.style.setProperty('--vscode-list-hoverBackground', 'rgba(10, 20, 30, 0.1)');
				fixture.container.style.setProperty('--vscode-descriptionForeground', 'rgb(100, 110, 120)');
				fixture.container.style.setProperty('--vscode-foreground', 'rgb(200, 210, 220)');
				const appearance = () => {
					const style = mainWindow.getComputedStyle(fixture.button);
					return { background: style.backgroundColor, color: style.color };
				};
				const resting = appearance();
				fixture.button.classList.add('hovered');
				fixture.button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
				const hovered = appearance();
				fixture.container.style.setProperty('--vscode-list-hoverBackground', 'rgb(30, 40, 50)');
				const changedTheme = appearance();
				fixture.button.classList.remove('hovered');
				fixture.button.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));

				assert.deepStrictEqual({
					restingColor: resting.color,
					hoverBackgroundsDifferFromResting: [hovered, changedTheme].every(style => style.background !== resting.background),
					hovered,
					changedTheme,
					restored: appearance(),
				}, {
					restingColor: 'rgb(100, 110, 120)',
					hoverBackgroundsDifferFromResting: true,
					hovered: { background: 'rgba(10, 20, 30, 0.1)', color: 'rgb(200, 210, 220)' },
					changedTheme: { background: 'rgb(30, 40, 50)', color: 'rgb(200, 210, 220)' },
					restored: resting,
				});
			});

			test(`uses the original row's markup, typography, separators and insets for ${mode}`, () => {
				const grouped = sessions(20);
				const fixture = createList(grouped, {
					groups: [group],
					memberships: new Map(grouped.map(session => [session.sessionId, group.id])),
					cappedGroupIds: mode === 'more' ? [group.id] : undefined,
				});
				fixture.container.style.setProperty('--vscode-spacing-size20', '2px');
				fixture.container.style.setProperty('--vscode-spacing-size40', '4px');
				const appearance = (element: HTMLElement) => {
					const style = mainWindow.getComputedStyle(element);
					const label = element.querySelector<HTMLElement>('.session-show-more-label')!;
					const labelStyle = mainWindow.getComputedStyle(label);
					const rect = element.getBoundingClientRect();
					const separator = (pseudo: string) => {
						const style = mainWindow.getComputedStyle(element, pseudo);
						return { content: style.content, width: style.width, height: style.height, background: style.background, flex: style.flex };
					};
					return {
						markup: element.innerHTML,
						left: rect.left,
						width: rect.width,
						height: rect.height,
						font: style.font,
						padding: style.padding,
						gap: style.gap,
						border: style.border,
						color: style.color,
						labelPadding: labelStyle.padding,
						before: separator('::before'),
						after: separator('::after'),
					};
				};
				const sticky = appearance(fixture.button);
				fixture.list.scrollTop = 10000;
				const original = [...fixture.container.querySelectorAll<HTMLElement>('.monaco-list-rows .session-show-more')]
					.find(element => element.textContent === (mode === 'more' ? '+15 more' : 'Show less'));
				assert.ok(original);
				assert.deepStrictEqual({ height: sticky.height, original: appearance(original) }, { height: 26, original: sticky });
			});
		}

		test('keeps more in its normal row when it fits and pins it again after resizing', () => {
			const fixture = createList(sessions(6));
			const overflow = fixture.snapshot();
			fixture.list.layout(600, 400);
			const fits = fixture.footer.hidden;
			fixture.list.layout(300, 400);
			const resized = fixture.snapshot();
			fixture.list.scrollTop = 10000;
			const atEnd = fixture.footer.hidden;
			fixture.list.scrollTop = 0;
			const atStart = fixture.snapshot();

			assert.deepStrictEqual({ overflow, fits, resized, atEnd, atStart }, {
				overflow: { hidden: false, label: '+1 more', ariaLabel: 'Show 1 more session in Project' },
				fits: true,
				resized: overflow,
				atEnd: true,
				atStart: overflow,
			});
		});

		for (const activation of ['click', 'Enter', 'Space'] as const) {
			test(`expands a capped project with ${activation} without jumping to its header`, () => {
				const others = sessions(5);
				const nested = buildTestSession({
					id: 'nested',
					title: 'Nested session',
					workspace: 'Project',
					chats: Array.from({ length: 12 }, (_, index) => ({ id: `chat-${index}`, title: `Chat ${index}` })),
				});
				const grouped = [nested.session, ...others];
				const fixture = createList(grouped, {
					groups: [group],
					memberships: new Map(grouped.map(session => [session.sessionId, group.id])),
					cappedGroupIds: [group.id],
				});
				fixture.list.setItemCollapsed({ session: nested.session.resource }, false);
				fixture.list.scrollTop = 150;
				const capped = { ...fixture.snapshot(), sessions: fixture.list.getVisibleSessions().length, scrollTop: fixture.list.scrollTop };
				fixture.button.focus();
				if (activation === 'click') {
					fixture.button.click();
				} else {
					fixture.button.dispatchEvent(new KeyboardEvent('keydown', {
						key: activation === 'Enter' ? 'Enter' : ' ',
						keyCode: activation === 'Enter' ? 13 : 32,
						bubbles: true,
						cancelable: true,
					}));
				}

				assert.deepStrictEqual({
					capped,
					expanded: { ...fixture.snapshot(), sessions: fixture.list.getVisibleSessions().length, scrollTop: fixture.list.scrollTop },
					treeHasFocus: mainWindow.document.activeElement?.classList.contains('monaco-list'),
					stored: fixture.instantiationService.get(IStorageService).get('sessionsListControl.sessionGroupExpansionState', StorageScope.PROFILE),
				}, {
					capped: { hidden: false, label: '+1 more', ariaLabel: 'Show 1 more session in Project', sessions: 5, scrollTop: 150 },
					expanded: { hidden: false, label: 'Show less', ariaLabel: 'Show fewer sessions in Project', sessions: 6, scrollTop: 150 },
					treeHasFocus: true,
					stored: '{"group:project":true}',
				});
			});
		}

		test('uses one footer for the current section, switching between more and less', () => {
			const first = sessions(20, 'first');
			const second = sessions(6, 'second');
			const otherGroup: ISessionGroup = { id: 'other', name: 'Other Project', createdAt: 2 };
			const fixture = createList([...first, ...second], {
				groups: [group, otherGroup],
				memberships: new Map([...first.map(session => [session.sessionId, group.id] as const), ...second.map(session => [session.sessionId, otherGroup.id] as const)]),
				cappedGroupIds: [otherGroup.id],
			});
			fixture.list.revealItem({ session: first[5].resource });
			const expanded = fixture.snapshot();
			fixture.list.revealItem({ session: second[0].resource });
			const capped = fixture.snapshot();

			assert.deepStrictEqual({
				expanded,
				capped,
				footers: fixture.container.querySelectorAll('.sessions-list-sticky-show-more').length,
			}, {
				expanded: { hidden: false, label: 'Show less', ariaLabel: 'Show fewer sessions in Project' },
				capped: { hidden: false, label: '+1 more', ariaLabel: 'Show 1 more session in Other Project' },
				footers: 1,
			});
		});

		test('preserves the viewport when expansion restores a previously hidden selection', () => {
			const grouped = sessions(20);
			const fixture = createList(grouped, {
				groups: [group],
				memberships: new Map(grouped.map(session => [session.sessionId, group.id])),
				cappedGroupIds: [group.id],
			});
			fixture.list.scrollTop = 30;
			fixture.store.add(fixture.list.onDidUpdate(() => {
				fixture.list.reveal(grouped.at(-1)!.resource);
			}));
			fixture.button.click();

			assert.deepStrictEqual({ scrollTop: fixture.list.scrollTop, footer: fixture.snapshot() }, {
				scrollTop: 30,
				footer: { hidden: false, label: 'Show less', ariaLabel: 'Show fewer sessions in Project' },
			});
		});

		test('updates the remaining count and removes the footer when the project no longer needs capping', () => {
			const fixture = createList(sessions(6));
			const initial = fixture.snapshot();
			fixture.managementService.sessions = sessions(8);
			fixture.list.refresh();
			const added = fixture.snapshot();
			fixture.managementService.sessions = sessions(5);
			fixture.list.refresh();

			assert.deepStrictEqual({ initial, added, noHiddenSessions: fixture.footer.hidden }, {
				initial: { hidden: false, label: '+1 more', ariaLabel: 'Show 1 more session in Project' },
				added: { hidden: false, label: '+3 more', ariaLabel: 'Show 3 more sessions in Project' },
				noHiddenSessions: true,
			});
		});

		for (const activation of ['click', 'Enter', 'Space'] as const) {
			test(`caps only its own project with ${activation} and returns focus to its header`, () => {
				const grouped = sessions(20);
				const others = sessions(3, 'other');
				const fixture = createList([...grouped, ...others], {
					groups: [group],
					memberships: new Map(grouped.map(session => [session.sessionId, group.id])),
				});
				fixture.list.scrollTop = 200;
				fixture.button.focus();
				if (activation === 'click') {
					fixture.button.click();
				} else {
					fixture.button.dispatchEvent(new KeyboardEvent('keydown', {
						key: activation === 'Enter' ? 'Enter' : ' ',
						keyCode: activation === 'Enter' ? 13 : 32,
						bubbles: true,
						cancelable: true,
					}));
				}
				const visible = fixture.list.getVisibleSessions();
				assert.deepStrictEqual({
					footer: fixture.snapshot(),
					grouped: visible.filter(session => grouped.includes(session)).length,
					others: visible.filter(session => others.includes(session)).length,
					focused: fixture.container.querySelector('.monaco-list-row.focused .session-section-label')?.textContent,
					treeHasFocus: mainWindow.document.activeElement?.classList.contains('monaco-list'),
					stored: fixture.instantiationService.get(IStorageService).get('sessionsListControl.sessionGroupExpansionState', StorageScope.PROFILE),
				}, {
					footer: { hidden: false, label: '+15 more', ariaLabel: 'Show 15 more sessions in Project' },
					grouped: 5,
					others: 3,
					focused: 'Project',
					treeHasFocus: true,
					stored: '{"group:project":false}',
				});
			});
		}

		test('updates on section collapse, capping, and empty or very small layouts', () => {
			const grouped = sessions(20);
			const fixture = createList(grouped, {
				groups: [group],
				memberships: new Map(grouped.map(session => [session.sessionId, group.id])),
			});
			const expanded = fixture.footer.hidden;
			fixture.list.setItemCollapsed({ group: group.id }, true);
			const collapsed = fixture.footer.hidden;
			fixture.list.setItemCollapsed({ group: group.id }, false);
			const reopened = fixture.footer.hidden;
			fixture.list.layout(0, 400);
			const zeroHeight = fixture.footer.hidden;
			fixture.list.layout(50, 400);
			const small = fixture.footer.hidden;
			fixture.list.layout(300, 400);
			fixture.list.setWorkspaceGroupCapped(false);
			const uncapped = fixture.footer.hidden;
			fixture.list.setWorkspaceGroupCapped(true);
			fixture.managementService.sessions = [];
			fixture.list.refresh();

			assert.deepStrictEqual({ expanded, collapsed, reopened, zeroHeight, small, uncapped, empty: fixture.footer.hidden }, {
				expanded: false,
				collapsed: true,
				reopened: false,
				zeroHeight: true,
				small: true,
				uncapped: true,
				empty: true,
			});
		});

		test('follows the section being browsed and releases focus when scrolled away', () => {
			const first = sessions(20, 'first');
			const second = sessions(20, 'second');
			const otherGroup: ISessionGroup = { id: 'other', name: 'Other Project', createdAt: 2 };
			const fixture = createList([...first, ...second], {
				groups: [group, otherGroup],
				memberships: new Map([...first.map(session => [session.sessionId, group.id] as const), ...second.map(session => [session.sessionId, otherGroup.id] as const)]),
			});
			fixture.list.revealItem({ session: first[5].resource });
			const firstLabel = fixture.button.getAttribute('aria-label');
			fixture.button.focus();
			fixture.list.revealItem({ session: second[5].resource });
			const secondLabel = fixture.button.getAttribute('aria-label');
			const focusReturned = mainWindow.document.activeElement?.classList.contains('monaco-list');
			fixture.list.scrollTop = 10000;

			assert.deepStrictEqual({ firstLabel, secondLabel, focusReturned, atEnd: fixture.footer.hidden }, {
				firstLabel: 'Show fewer sessions in Project',
				secondLabel: 'Show fewer sessions in Other Project',
				focusReturned: true,
				atEnd: true,
			});
		});
	});

	suite('reset filters', () => {
		function createList(sessions: ISession[], options: IListHarnessOptions = {}, showArchivedByDefault = false) {
			const harness = createListHarness(disposables, sessions, options);
			void (harness.instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING, showArchivedByDefault);
			const container = harness.createContainer(400, 1400);
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(1400, 400);
			const stored = (key: string) => {
				const raw = harness.instantiationService.get(IStorageService).get(`sessionsListControl.${key}`, StorageScope.PROFILE);
				return raw === undefined ? undefined : JSON.parse(raw);
			};
			return { list, container, stored };
		}

		test('undoing a reset restores the filters, archived visibility, and how much of each section is shown', () => {
			const group: ISessionGroup = { id: 'group-a', name: 'Group A', createdAt: 1 };
			const now = Date.now();
			const grouped = Array.from({ length: 7 }, (_, index) => createTestSession(`group-${index}`, { createdAt: new Date(now - index * 1000) }).session);
			const { list, container, stored } = createList([
				...grouped,
				createTestSession('recent', { workspaceLabel: 'Recent', createdAt: new Date(now - 10_000) }).session,
				createTestSession('claude', { workspaceLabel: 'Recent', harness: 'claude', createdAt: new Date(now - 20_000) }).session,
				createTestSession('old', { workspaceLabel: 'Old', createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000) }).session,
			], { groups: [group], memberships: new Map(grouped.map(session => [session.sessionId, group.id])) });
			const showMoreLabels = () => [...container.querySelectorAll<HTMLElement>('.monaco-list-rows .session-show-more-label')];
			const click = (label: string) => {
				const row = showMoreLabels().find(element => element.textContent === label)?.closest<HTMLElement>('.monaco-list-row');
				assert.ok(row, `Expected a "${label}" row`);
				clickRow(row);
			};
			const state = () => ({
				sessions: list.getVisibleSessions().map(session => session.sessionId),
				showMore: showMoreLabels().map(label => label.textContent),
				excludeArchived: list.isExcludeArchived(),
				stored: { filters: stored('filters'), excludeArchived: stored('excludeArchived'), sessionGroupExpansionState: stored('sessionGroupExpansionState') },
			});
			list.filters.setExcluded({ kind: 'harness', id: 'claude' }, true);
			list.setExcludeArchived(false);
			click('Show less');
			click('+1 more workspace');

			const before = state();
			const restore = list.resetFilters();
			const reset = state();
			restore();

			assert.deepStrictEqual({ before, reset, undone: state() }, {
				before: {
					sessions: ['group-0', 'group-1', 'group-2', 'group-3', 'group-4', 'recent', 'old'],
					showMore: ['+2 more', 'Show fewer workspaces'],
					excludeArchived: false,
					stored: { filters: [['["harness","claude"]', true]], excludeArchived: false, sessionGroupExpansionState: { 'group:group-a': false } },
				},
				reset: {
					sessions: ['group-0', 'group-1', 'group-2', 'group-3', 'group-4', 'group-5', 'group-6', 'recent', 'claude'],
					showMore: ['Show less', '+1 more workspace'],
					excludeArchived: true,
					stored: { filters: undefined, excludeArchived: true, sessionGroupExpansionState: undefined },
				},
				undone: before,
			});
		});

		test('undoing a reset restores Show All and an archived filter that follows its default setting', () => {
			const { list, stored } = createList([createTestSession('session').session], {}, true);
			list.setWorkspaceGroupCapped(false);
			const state = () => ({ capped: list.isWorkspaceGroupCapped(), excludeArchived: list.isExcludeArchived(), storedExcludeArchived: stored('excludeArchived') });

			const before = state();
			const restore = list.resetFilters();
			const reset = state();
			restore();

			assert.deepStrictEqual({ before, reset, undone: state() }, {
				before: { capped: false, excludeArchived: false, storedExcludeArchived: undefined },
				reset: { capped: true, excludeArchived: true, storedExcludeArchived: true },
				undone: { capped: false, excludeArchived: false, storedExcludeArchived: undefined },
			});
		});
	});

	suite('repository and environment grouping', () => {
		function render(sessions: ISession[], options: IListHarnessOptions = {}, hostConnected = true, grouping = SessionsGrouping.Repository) {
			const providers = [
				{ id: 'local-provider', environment: { id: 'local', label: 'This Computer' } },
				{ id: 'cloud-provider', environment: { id: 'cloud', label: 'Cloud' } },
				{ id: 'host-provider', environment: { id: 'host', label: 'My Host', isConnected: constObservable(hostConnected) } },
			].map(provider => upcastPartial<ISessionsProvider>(provider));
			const harness = createListHarness(disposables, sessions, options);
			harness.instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return providers; }
				override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined { return providers.find(provider => provider.id === providerId) as T | undefined; }
			});
			const contextKeyService = harness.store.add(new ContextKeyService(new TestConfigurationService()));
			ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
			harness.instantiationService.stub(IContextKeyService, contextKeyService);
			harness.instantiationService.stub(IMenuService, harness.store.add(harness.instantiationService.createInstance(MenuService)));
			const contextMenus: (readonly IAction[])[] = [];
			harness.instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
				override showContextMenu(delegate: IContextMenuDelegate): void {
					contextMenus.push(delegate.getActions());
				}
			});
			const container = harness.createContainer(400, 800);
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => grouping,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(800, 400);
			const rowOf = (label: string) => {
				const row = [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
					.find(row => (row.querySelector('.session-section-label') ?? row.querySelector('.session-title'))?.textContent === label);
				assert.ok(row, `Expected a row for "${label}"`);
				return row;
			};
			return { harness, list, container, contextMenus, rowOf };
		}

		function repositorySession(title: string, environment: string, minutesAgo: number, repository = 'microsoft/vscode') {
			return createTestSession(title, {
				providerId: `${environment}-provider`,
				environment,
				repository,
				workspaceLabel: repository.split('/')[1],
				createdAt: new Date(Date.now() - minutesAgo * 60_000),
			}).session;
		}

		test('does not offer an empty Move to Group submenu when no custom groups exist', () => {
			const { rowOf, contextMenus } = render([repositorySession('Session', 'local', 1)]);
			rowOf('vscode').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

			assert.deepStrictEqual(contextMenus.at(-1)?.filter(action => action.id === 'sessions.moveSectionToGroup'), []);
		});

		for (const [grouping, sectionId, label, connected] of [
			[SessionsGrouping.Workspace, 'workspace:vscode', 'vscode', true],
			[SessionsGrouping.Repository, 'repository:microsoft/vscode', 'vscode', true],
			[SessionsGrouping.Environment, 'environment:host', 'My Host', false],
		] as const) {
			test(`${grouping} headers support independent appearance and reset while nested`, async () => {
				const resetPicker = sinon.stub(SessionGroupAppearancePicker.prototype, 'changeIcon').callsFake(async setIcon => setIcon(undefined));
				disposables.add(toDisposable(() => resetPicker.restore()));
				const parent: ISessionGroup = { id: 'parent', name: 'Parent', createdAt: 1 };
				const { rowOf, contextMenus } = render([repositorySession('Session', 'host', 1)], {
					groups: [parent],
					sectionMemberships: new Map([[sectionId, parent.id]]),
					sectionAppearances: new Map([[sectionId, { icon: 'rocket', color: 'terminal.ansiCyan' }]]),
				}, connected, grouping);
				const snapshot = () => {
					const header = rowOf(label).querySelector<HTMLElement>('.session-section-icon')!;
					return { icon: header.className, color: header.style.color };
				};
				const before = snapshot();
				rowOf(label).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
				const actions = contextMenus.at(-1)!;
				await actions.find(action => action.id === 'sessions.changeGroupIcon')!.run();
				assert.deepStrictEqual({
					before,
					appearanceActions: actions.filter(action => ['sessions.changeGroupIcon', 'sessions.changeGroupColor', 'sessions.resetGroupIcon'].includes(action.id)).map(action => ({ id: action.id, enabled: action.enabled })),
					after: snapshot(),
				}, {
					before: { icon: 'session-section-icon codicon codicon-rocket', color: 'var(--vscode-terminal-ansiCyan)' },
					appearanceActions: [
						{ id: 'sessions.changeGroupIcon', enabled: true },
						{ id: 'sessions.changeGroupColor', enabled: true },
					],
					after: { icon: `session-section-icon codicon codicon-${grouping === SessionsGrouping.Workspace ? 'folder' : grouping === SessionsGrouping.Repository ? 'repo' : 'remote'}`, color: 'var(--vscode-terminal-ansiCyan)' },
				});
			});
		}

		/** Drags `source` onto the top quarter of `target`, as the tree's drag and drop reads it. */
		function drag(source: HTMLElement, target: HTMLElement): void {
			const dataTransfer = new DataTransfer();
			source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
			const bounds = target.getBoundingClientRect();
			const event = (type: string) => {
				const dragEvent = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX: bounds.left + 10, clientY: bounds.top + 1 });
				Object.defineProperty(dragEvent, 'offsetY', { value: 1 });
				return dragEvent;
			};
			target.dispatchEvent(event('dragover'));
			target.dispatchEvent(event('drop'));
			source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
		}

		test('groups a repository across environments and names the environment of each row except this computer', () => {
			const { container } = render([
				repositorySession('In the cloud', 'cloud', 1),
				repositorySession('On this computer', 'local', 2),
				repositorySession('On my host', 'host', 3),
				createTestSession('Scratch', { workspaceLabel: 'scratch', createdAt: new Date(Date.now() - 4 * 60_000) }).session,
			]);

			assert.deepStrictEqual([...container.querySelectorAll<HTMLElement>('.monaco-list-row')].map(row => {
				const section = row.querySelector('.session-section-label')?.textContent;
				const badge = row.querySelector('.session-badge')?.textContent;
				return section ?? `${row.querySelector('.session-title')?.textContent}${badge ? ` (${badge})` : ''}`;
			}), ['scratch', 'Scratch', 'vscode', 'In the cloud (Cloud)', 'On this computer', 'On my host (My Host)']);
		});

		test('groups environments across workspaces and shows workspace badges on their rows', () => {
			const { container } = render([
				repositorySession('In the cloud', 'cloud', 1),
				repositorySession('On this computer', 'local', 2, 'microsoft/vscode-docs'),
				repositorySession('On my host', 'host', 3),
			], {}, false, SessionsGrouping.Environment);

			assert.deepStrictEqual([...container.querySelectorAll<HTMLElement>('.monaco-list-row')].map(row => {
				const section = row.querySelector('.session-section-label')?.textContent;
				const badge = row.querySelector('.session-badge')?.textContent;
				return section ?? `${row.querySelector('.session-title')?.textContent}${badge ? ` (${badge})` : ''}`;
			}), ['This Computer', 'On this computer (vscode-docs)', 'Cloud', 'In the cloud (vscode)', 'My Host', 'On my host (vscode)']);
		});

		test('caps environment sections and their sessions, with environment-specific show more labels', () => {
			const sessions = Array.from({ length: 8 }, (_, index) => repositorySession(`Local ${index}`, 'local', index));
			const { list, container } = render([
				...sessions,
				repositorySession('Old cloud session', 'cloud', 10 * 24 * 60),
			], {}, true, SessionsGrouping.Environment);
			const snapshot = () => ({
				titles: list.getVisibleSessions().map(session => session.title.get()),
				more: [...container.querySelectorAll('.monaco-list-rows .session-show-more-label')].map(label => label.textContent),
			});
			const recent = snapshot();
			const more = [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
				.find(row => row.querySelector('.session-show-more-label')?.textContent === '+1 more environment');
			assert.ok(more);
			const moreAria = more.getAttribute('aria-label');
			clickRow(more);
			const expanded = snapshot();
			list.setWorkspaceGroupCapped(false);

			assert.deepStrictEqual({ recent, moreAria, expanded, all: snapshot() }, {
				recent: { titles: sessions.slice(0, 5).map(session => session.title.get()), more: ['+3 more', '+1 more environment'] },
				moreAria: 'Show 1 more environment',
				expanded: { titles: [...sessions.slice(0, 5).map(session => session.title.get()), 'Old cloud session'], more: ['+3 more', 'Show fewer environments'] },
				all: { titles: [...sessions.map(session => session.title.get()), 'Old cloud session'], more: [] },
			});
		});

		test('environment filtering removes only that environment section', () => {
			const { list, container } = render([
				repositorySession('Local', 'local', 1),
				repositorySession('Cloud', 'cloud', 2),
			], {}, true, SessionsGrouping.Environment);
			list.filters.setExcluded({ kind: 'environment', id: 'cloud' }, true);

			assert.deepStrictEqual({
				sections: [...container.querySelectorAll('.session-section-label')].map(label => label.textContent),
				sessions: list.getVisibleSessions().map(session => session.title.get()),
			}, { sections: ['This Computer'], sessions: ['Local'] });
		});

		for (const hostConnected of [true, false]) {
			test(`New Session offers each available environment of a repository section that spans several (host ${hostConnected ? 'connected' : 'disconnected'})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
				const { harness, list, contextMenus, rowOf } = render([
					repositorySession('Cloud session', 'cloud', 1),
					repositorySession('Latest local session', 'local', 2),
					repositorySession('Host session', 'host', 3),
					repositorySession('Older local session', 'local', 4),
					repositorySession('Docs session', 'local', 5, 'microsoft/vscode-docs'),
				], {}, hostConnected);
				// Other contributions, such as New Session from Pull Request, may add their own entries to the dropdown.
				const environmentActions = (label: string) => {
					const menuCount = contextMenus.length;
					rowOf(label).querySelector('.monaco-dropdown .dropdown-label')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
					return (contextMenus[menuCount] ?? []).filter(action => action.id.startsWith(`${NEW_SESSION_IN_ENVIRONMENT_ACTION_ID}.`));
				};
				// The section toolbars update after their menus' debounced change events.
				await timeout(100);
				const actions = environmentActions('vscode');
				await actions.find(action => action.label === 'New Session in Cloud')?.run();
				const result = {
					entries: actions.map(action => action.label),
					singleEnvironment: {
						newSession: !!rowOf('vscode-docs').querySelector('.action-label.codicon-plus'),
						entries: environmentActions('vscode-docs').map(action => action.label),
					},
					started: harness.commandService.calls
						.filter(call => call.commandId === NEW_SESSION_IN_ENVIRONMENT_ACTION_ID)
						.map(call => [(call.args[0] as ISessionSection).label, call.args[1]]),
				};
				// The list's own timers (e.g. relative times) would keep the virtual clock running.
				list.dispose();

				assert.deepStrictEqual(result, {
					entries: hostConnected
						? ['New Session on This Computer', 'New Session in Cloud', 'New Session on My Host']
						: ['New Session on This Computer', 'New Session in Cloud'],
					singleEnvironment: { newSession: true, entries: [] },
					started: [['vscode', 'cloud']],
				});
			}));
		}

		for (const grouping of [SessionsGrouping.Repository, SessionsGrouping.Environment]) {
			test(`reorders ${grouping} sections and accepts only their own sessions`, () => {
				const group: ISessionGroup = { id: 'group', name: 'Group', createdAt: 1 };
				const grouped = repositorySession('Grouped alpha session', 'local', 3, 'microsoft/alpha');
				const { harness, rowOf } = render([
					repositorySession('Alpha session', 'local', 1, 'microsoft/alpha'),
					repositorySession('Beta session', 'cloud', 2, 'microsoft/beta'),
					grouped,
				], { groups: [group], memberships: new Map([[grouped.sessionId, group.id]]) }, true, grouping);
				const alphaLabel = grouping === SessionsGrouping.Environment ? 'This Computer' : 'alpha';
				const betaLabel = grouping === SessionsGrouping.Environment ? 'Cloud' : 'beta';
				const alphaId = grouping === SessionsGrouping.Environment ? 'environment:local' : 'repository:microsoft/alpha';
				const betaId = grouping === SessionsGrouping.Environment ? 'environment:cloud' : 'repository:microsoft/beta';

				drag(rowOf(betaLabel), rowOf(alphaLabel));
				drag(rowOf('Grouped alpha session'), rowOf(betaLabel));
				const ungroupedOutsideItsSection = [...harness.removedFromGroups];
				drag(rowOf('Grouped alpha session'), rowOf(alphaLabel));

				assert.deepStrictEqual({ reorders: harness.sectionReorders, ungroupedOutsideItsSection, ungrouped: harness.removedFromGroups }, {
					reorders: [{
						visibleOrder: ['group:group', alphaId, betaId],
						draggedId: betaId,
						targetId: alphaId,
						position: 'before',
						promoteId: betaId,
					}],
					ungroupedOutsideItsSection: [],
					ungrouped: [grouped.sessionId],
				});
			});
		}
	});

	suite('session hover diff stats', () => {
		test('does not read or observe detailed changes when the summary is available', () => {
			const changesSummary = observableValue<ISessionChangesSummary>('summary', { files: 7, additions: 40, deletions: 20 });
			const changes = observableValue<readonly ISessionFileChange[]>('changes', []);
			let detailedReads = 0;
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				changesSummary,
				mainChat: constObservable({
					...base.mainChat.get(),
					changes: derived(reader => {
						detailedReads++;
						return changes.read(reader);
					}),
				}),
			};
			const results: ReturnType<typeof getSessionDiffStats>[] = [];
			disposables.add(autorun(reader => results.push(getSessionDiffStats(session, reader))));

			changes.set([{ modifiedUri: URI.file('/workspace/a.ts'), insertions: 3, deletions: 1 }], undefined);
			changesSummary.set({ files: 0, additions: 0, deletions: 0 }, undefined);

			assert.deepStrictEqual({ results, detailedReads }, {
				results: [{ files: 7, insertions: 40, deletions: 20 }, undefined],
				detailedReads: 0,
			});
		});

		test('uses the main chat changes only while the summary is absent', () => {
			const changesSummary = observableValue<ISessionChangesSummary | undefined>('summary', undefined);
			const changes = observableValue<readonly ISessionFileChange[]>('changes', [
				{ modifiedUri: URI.file('/workspace/a.ts'), insertions: 3, deletions: 1 },
			]);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				changesSummary,
				mainChat: constObservable({ ...base.mainChat.get(), changes }),
			};
			const results: ReturnType<typeof getSessionDiffStats>[] = [];
			disposables.add(autorun(reader => results.push(getSessionDiffStats(session, reader))));

			changesSummary.set({ files: 7, additions: 40, deletions: 20 }, undefined);
			changes.set([{ modifiedUri: URI.file('/workspace/a.ts'), insertions: 5, deletions: 2 }], undefined);
			changesSummary.set(undefined, undefined);
			changes.set([], undefined);

			assert.deepStrictEqual(results, [
				{ files: 1, insertions: 3, deletions: 1 },
				{ files: 7, insertions: 40, deletions: 20 },
				{ files: 1, insertions: 5, deletions: 2 },
				undefined,
			]);
		});

		test('prefers the list summary and falls back to detailed changes only when absent', () => {
			const base = createTestSession('Session').session;
			const changes = [
				{ modifiedUri: URI.file('/workspace/a.ts'), insertions: 3, deletions: 1 },
				{ uri: URI.file('/workspace/b.ts'), insertions: 2, deletions: 4 },
			];
			const summary = { files: 7, additions: 40, deletions: 20 };
			const zeroSummary = { files: 0, additions: 0, deletions: 0 };
			const stats = (changesSummary: ISessionChangesSummary | undefined, detailedChanges = changes) => getSessionDiffStats({
				...base,
				mainChat: constObservable({ ...base.mainChat.get(), changes: constObservable(detailedChanges) }),
				changesSummary: constObservable(changesSummary),
			});

			assert.deepStrictEqual({
				summaryOnly: stats(summary, []),
				summaryAndDetails: stats(summary),
				detailsOnly: stats(undefined),
				zeroSummary: stats(zeroSummary),
				noChanges: stats(undefined, []),
				noLineChanges: stats(undefined, [{ modifiedUri: URI.file('/workspace/binary'), insertions: 0, deletions: 0 }]),
			}, {
				summaryOnly: { files: 7, insertions: 40, deletions: 20 },
				summaryAndDetails: { files: 7, insertions: 40, deletions: 20 },
				detailsOnly: { files: 2, insertions: 5, deletions: 5 },
				zeroSummary: undefined,
				noChanges: undefined,
				noLineChanges: undefined,
			});
		});

		for (const flat of [false, true]) {
			test(`shows matching row and hover summaries without selecting sessions in the ${flat ? 'flat' : 'main'} list`, () => {
				const changesSummary = observableValue<ISessionChangesSummary | undefined>('summary', { files: 3, additions: 12, deletions: 4 });
				const sessions = ['First', 'Second'].map(title => {
					const base = createTestSession(title).session;
					const root = URI.file(`/workspace/${title}`);
					return {
						...base,
						changesSummary,
						workspace: constObservable({
							...base.workspace.get()!,
							folders: [{ root, workingDirectory: root, name: title, description: undefined }],
						}),
					};
				});
				const hovers = new Map<HTMLElement, () => IDelayedHoverOptions>();
				const harness = createListHarness(disposables, sessions, instantiationService => {
					instantiationService.stub(IHoverService, {
						...NullHoverService,
						setupDelayedHover: (target, options) => {
							hovers.set(target, typeof options === 'function' ? options : () => options);
							return toDisposable(() => hovers.delete(target));
						},
					});
				});
				const container = harness.createContainer();
				if (flat) {
					const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, { onSessionOpen: () => { } }));
					list.setSessions(sessions);
					list.layout(300, 400);
				} else {
					const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
						grouping: () => SessionsGrouping.Date,
						sorting: () => SessionsSorting.Created,
						onSessionOpen: () => { },
					}));
					list.layout(300, 400);
				}
				const readSummaries = () => [...container.querySelectorAll<HTMLElement>('.session-item')].map(row => {
					const hover = hovers.get(row)?.().content;
					assert.ok(hover instanceof HTMLElement);
					return {
						row: [row.querySelector('.session-diff-added')?.textContent, row.querySelector('.session-diff-removed')?.textContent],
						hover: [hover.querySelector('.session-summary-hover-insertions')?.textContent, hover.querySelector('.session-summary-hover-deletions')?.textContent],
						files: hover.textContent?.includes(`${changesSummary.get()?.files} files changed`),
					};
				});
				const initial = readSummaries();
				changesSummary.set({ files: 5, additions: 30, deletions: 10 }, undefined);
				const updated = readSummaries();
				changesSummary.set({ files: 0, additions: 0, deletions: 0 }, undefined);
				const cleared = readSummaries();
				harness.store.dispose();

				assert.deepStrictEqual({ initial, updated, cleared, remainingHovers: hovers.size }, {
					initial: Array(2).fill({ row: ['+12', '-4'], hover: ['+12', '-4'], files: true }),
					updated: Array(2).fill({ row: ['+30', '-10'], hover: ['+30', '-10'], files: true }),
					cleared: Array(2).fill({ row: [undefined, undefined], hover: [undefined, undefined], files: false }),
					remainingHovers: 0,
				});
			});
		}
	});

	test('created session hover includes its creator action', () => {
		const createdSession = createSession('Created', { workspaceLabel: 'Workspace' });
		const onOpen = () => { };
		const hover = getSessionSummaryHoverData(
			createdSession,
			new class extends mock<ISessionsProvidersService>() {
				override getProvider() { return undefined; }
			},
			new class extends mock<IOpenerService>() { },
			new class extends mock<ILabelService>() { },
			{
				title: 'Creator session',
				onOpen,
			},
			true,
		);

		assert.deepStrictEqual({
			createdBy: hover.createdBy,
			updatedAt: hover.updatedAt,
		}, {
			createdBy: {
				title: 'Creator session',
				onOpen,
			},
			updatedAt: createdSession.updatedAt.get(),
		});
	});

	test('remote session hover shows the remote name after the session type', () => {
		const localSession = createSession('Fix remote reconnection', { workspaceLabel: 'Workspace' });
		const remoteSession: ISession = {
			...localSession,
			remoteConnectionStatus: constObservable({ kind: 'connected' }),
		};
		const provider = upcastPartial<ISessionsProvider>({
			label: 'Remote Mac',
			sessionTypes: [upcastPartial<ISessionType>({ id: 'test', label: 'Copilot CLI' })],
		});
		const createProvidersService = (provider: ISessionsProvider) => new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(): T | undefined {
				return provider as T;
			}
		};
		const providersService = createProvidersService(provider);
		const createHoverData = (session: ISession) => getSessionSummaryHoverData(
			session,
			providersService,
			upcastPartial<IOpenerService>({}),
			upcastPartial<ILabelService>({}),
		);
		const remoteData = createHoverData(remoteSession);
		const titleLine = new SessionSummaryHoverWidget(remoteData).domNode.querySelector('.session-summary-hover-title')?.textContent;
		const disconnectedData = getSessionSummaryHoverData(
			remoteSession,
			createProvidersService({ ...provider, sessionTypes: [] }),
			upcastPartial<IOpenerService>({}),
			upcastPartial<ILabelService>({}),
		);
		const disconnectedTitleLine = new SessionSummaryHoverWidget(disconnectedData).domNode.querySelector('.session-summary-hover-title')?.textContent;

		assert.deepStrictEqual({
			titleLine,
			remoteName: remoteData.remoteName,
			disconnectedTitleLine,
			localRemoteName: createHoverData(localSession).remoteName,
		}, {
			titleLine: 'Fix remote reconnection · Copilot CLI · Remote Mac',
			remoteName: 'Remote Mac',
			disconnectedTitleLine: 'Fix remote reconnection · Remote Mac',
			localRemoteName: undefined,
		});
	});

	test('external session hover without application provenance omits external status', () => {
		const data = getSessionSummaryHoverData(
			createSession('External', { isExternal: true }),
			new class extends mock<ISessionsProvidersService>() {
				override getProvider() { return undefined; }
			},
			new class extends mock<IOpenerService>() { },
			new class extends mock<ILabelService>() { },
		);
		const widget = new SessionSummaryHoverWidget(data);

		assert.deepStrictEqual({
			buttons: [...widget.domNode.querySelectorAll('button')].map(button => button.textContent),
			hasExternalStatus: widget.domNode.textContent?.includes('External Session'),
			applicationHidden: widget.domNode.querySelector('.session-summary-hover-application')?.classList.contains('hidden'),
		}, {
			buttons: [],
			hasExternalStatus: false,
			applicationHidden: true,
		});
	});

	test('session and chat hovers show non-VS Code applications without external status and open application filters', () => {
		const opened: { uri: string; options: OpenInternalOptions | OpenExternalOptions | undefined }[] = [];
		const services = [
			upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }),
			upcastPartial<IOpenerService>({
				open: async (uri, options) => {
					opened.push({ uri: uri.toString(), options });
					return true;
				},
			}),
			upcastPartial<ILabelService>({}),
		] as const;
		const session = {
			...createSession('External', { isExternal: true }),
			isExternal: observableValue('external', true),
			application: observableValue('application', getSessionApplication('copilot-cli')),
		};
		const chat = {
			...session.mainChat.get(),
			title: constObservable('Nested chat'),
			workspace: constObservable(undefined),
		};
		const snapshots = [getSessionSummaryHoverData(session, ...services), getChatSummaryHoverData(session, chat, ...services)].map(data => {
			const widget = new SessionSummaryHoverWidget(data);
			const button = widget.domNode.querySelector<HTMLButtonElement>('.session-summary-hover-application button');
			button?.click();
			return {
				buttonType: button?.type,
				rows: [...widget.domNode.querySelectorAll('button')].map(row => row.textContent),
			};
		});
		session.application.set(getSessionApplication('vscode'), undefined);
		const vscodeApplication = getSessionSummaryHoverData(session, ...services).application;
		const unknownApplications = ['agent_tasks_api', 'agent_tasks_public_api', 'api_call_received', 'unknown'].map(name => {
			session.application.set(getSessionApplication(name), undefined);
			return [
				getSessionSummaryHoverData(session, ...services).application,
				getChatSummaryHoverData(session, chat, ...services).application,
			];
		});
		session.application.set(getSessionApplication('custom_client', 'Custom Client'), undefined);
		const customApplication = getSessionSummaryHoverData(session, ...services).application?.label;
		session.isExternal.set(false, undefined);
		const adoptedApplication = getSessionSummaryHoverData(session, ...services).application?.label;

		assert.deepStrictEqual({ snapshots, opened, vscodeApplication, unknownApplications, customApplication, adoptedApplication }, {
			snapshots: Array(2).fill({ buttonType: 'button', rows: ['Created in · Copilot CLI'] }),
			opened: Array(2).fill({ uri: `command:${SHOW_SESSION_APPLICATION_FILTERS_COMMAND_ID}`, options: { allowCommands: true } }),
			vscodeApplication: undefined,
			unknownApplications: Array(4).fill([undefined, undefined]),
			customApplication: 'Custom Client',
			adoptedApplication: 'Custom Client',
		});
	});

	test('session hover links each pull request and opens it externally', () => {
		const pullRequestUri = URI.parse('https://github.com/microsoft/vscode/pull/241533');
		const root = URI.file('/home/user/projects/vscode');
		const session = upcastPartial<ISession>({
			providerId: 'test',
			sessionType: 'test',
			title: constObservable('Fix the redirect loop'),
			isQuickChat: constObservable(false),
			worktreePending: constObservable(false),
			mainChat: constObservable(upcastPartial<IChat>({ updatedAt: constObservable(new Date()), isRead: constObservable(true), changes: constObservable([]), changesets: constObservable([]) })),
			workspace: constObservable({
				uri: root,
				label: 'vscode',
				icon: Codicon.folder,
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
				folders: [{
					root,
					workingDirectory: root,
					name: 'vscode',
					description: undefined,
					gitRepository: {
						uri: root,
						workTreeUri: undefined,
						baseBranchName: 'main',
						gitHubInfo: constObservable({
							owner: 'microsoft',
							repo: 'vscode',
							pullRequests: [
								{ owner: 'microsoft', repo: 'vscode', number: 241533, uri: pullRequestUri, title: 'Fix the redirect loop', createdByThisSession: true },
								// Inherited from the checkout, so never listed.
								{ owner: 'microsoft', repo: 'vscode', number: 9001, uri: URI.parse('https://github.com/microsoft/vscode/pull/9001'), createdByThisSession: false },
							],
						}),
					},
				}],
			}),
		});
		const opened: { resource: URI | string; openExternal: boolean | undefined }[] = [];
		const hover = getSessionSummaryHoverData(
			session,
			new class extends mock<ISessionsProvidersService>() {
				override getProvider() { return undefined; }
			},
			new class extends mock<IOpenerService>() {
				override async open(resource: URI | string, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
					opened.push({ resource, openExternal: (options as OpenExternalOptions | undefined)?.openExternal });
					return true;
				}
			},
			new class extends mock<ILabelService>() {
				override getUriLabel(resource: URI): string { return resource.path; }
			},
		);
		hover.pullRequests?.forEach(pullRequest => pullRequest.onOpen?.());

		assert.deepStrictEqual({
			pullRequests: hover.pullRequests?.map(pullRequest => ({ title: pullRequest.title, uri: pullRequest.uri?.toString() })),
			opened,
		}, {
			pullRequests: [{ title: 'Fix the redirect loop', uri: pullRequestUri.toString() }],
			opened: [{ resource: pullRequestUri, openExternal: true }],
		});
	});

	suite('groupSessionsForList', () => {

		for (const grouping of Object.values(SessionsGrouping)) {
			const regularSectionId = grouping === SessionsGrouping.Date ? 'recent' : grouping === SessionsGrouping.Environment ? 'environment:local' : 'workspace:Alpha';
			test(`groups external sessions before Done while preserving pins (${grouping})`, () => {
				const sessions: ISession[] = [
					createSession('pinned', { isExternal: true }),
					createSession('archived', { isExternal: true, isArchived: true }),
					createSession('external-workspace', { workspaceLabel: 'Alpha', isExternal: true }),
					createSession('external-chat', { isExternal: true }),
					createSession('automation', { isExternal: true, isAutomation: true }),
					createSession('regular', { workspaceLabel: 'Alpha' }),
				];
				const sections = groupSessionsForList(sessions, grouping, SessionsSorting.Created,
					session => session.sessionId === 'pinned' || session.sessionId === 'archived',
					session => sessions.length - sessions.indexOf(session), undefined, true);

				assert.deepStrictEqual(sections.map(section => ({ id: section.id, sessions: section.sessions.map(s => s.sessionId) })), [
					{ id: 'pinned', sessions: ['pinned'] },
					{ id: regularSectionId, sessions: ['regular'] },
					{ id: 'external', sessions: ['external-workspace', 'external-chat'] },
					{ id: 'archived', sessions: ['archived'] },
				]);
			});

			for (const groupExternalSessions of [undefined, false]) {
				test(`preserves ordinary placement when external grouping is ${groupExternalSessions === undefined ? 'unset' : 'disabled'} (${grouping})`, () => {
					const external = createSession('external', { workspaceLabel: 'Alpha', isExternal: true, createdAt: new Date(Date.now() - 60_000) });
					const quick = createSession('quick', { isExternal: true });
					const sections = groupSessionsForList([external, quick], grouping, SessionsSorting.Created, () => false, undefined, 'Done', groupExternalSessions);

					assert.deepStrictEqual(sections.map(section => ({ id: section.id, sessions: section.sessions.map(s => s.sessionId) })), grouping === SessionsGrouping.Workspace || grouping === SessionsGrouping.Repository ? [
						{ id: 'quickchats', sessions: ['quick'] },
						{ id: regularSectionId, sessions: ['external'] },
					] : [
						{ id: regularSectionId, sessions: ['quick', 'external'] },
					]);
				});
			}
		}

		test('shows pinned sessions in a dedicated top section', () => {
			const pinned = createSession('pinned', { workspaceLabel: 'Alpha', createdAt: new Date('2024-06-01') });
			const regular = createSession('regular', { workspaceLabel: 'Beta', createdAt: new Date('2024-05-01') });
			const sections = groupSessionsForList(
				[pinned, regular],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				session => session.sessionId === pinned.sessionId,
			);

			assert.deepStrictEqual(sections.map(section => section.id), ['pinned', 'workspace:Beta']);
			assert.deepStrictEqual(sections[0].sessions.map(session => session.sessionId), ['pinned']);
		});

		test('keeps archived sessions in Done even when pinned', () => {
			const archivedPinned = createSession('archived-pinned', { workspaceLabel: 'Alpha', isArchived: true, createdAt: new Date('2024-06-01') });
			const sections = groupSessionsForList(
				[archivedPinned],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				() => true,
			);

			assert.deepStrictEqual(sections.map(section => section.id), ['archived']);
			assert.deepStrictEqual(sections[0].sessions.map(session => session.sessionId), ['archived-pinned']);
		});

		test('sorts pinned sessions using supplied sort keys', () => {
			const first = createSession('first', { createdAt: new Date('2024-01-01') });
			const second = createSession('second', { createdAt: new Date('2024-06-01') });
			const sections = groupSessionsForList(
				[first, second],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				() => true,
				session => session.sessionId === first.sessionId ? 200 : 100,
			);

			assert.deepStrictEqual(sections.map(section => ({ id: section.id, sessions: section.sessions.map(session => session.sessionId) })), [
				{ id: 'pinned', sessions: ['first', 'second'] },
			]);
		});

		test('workspace-less sessions form a Chats section directly below Pinned (above groups)', () => {
			const pinned = createSession('pinned', { workspaceLabel: 'Alpha', createdAt: new Date('2024-06-03') });
			const quick = createSession('quick', { createdAt: new Date('2024-06-02') });
			const regular = createSession('regular', { workspaceLabel: 'Beta', createdAt: new Date('2024-06-01') });
			const archived = createSession('archived', { workspaceLabel: 'Gamma', isArchived: true, createdAt: new Date('2024-05-01') });
			const sections = groupSessionsForList(
				[pinned, quick, regular, archived],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				session => session.sessionId === pinned.sessionId,
			);

			assert.deepStrictEqual(sections.map(section => ({ id: section.id, sessions: section.sessions.map(s => s.sessionId) })), [
				{ id: 'pinned', sessions: ['pinned'] },
				{ id: 'quickchats', sessions: ['quick'] },
				{ id: 'workspace:Beta', sessions: ['regular'] },
				{ id: 'archived', sessions: ['archived'] },
			]);
		});

		test('cloud quick chats appear in Chats rather than the Unknown workspace group', () => {
			const quickChat = { ...createSession('cloud-chat', {}), environment: 'cloud', isQuickChat: constObservable(true) };
			const unknown = { ...createSession('unclassified-cloud-session', {}), environment: 'cloud', isQuickChat: undefined };
			const sections = groupSessionsForList(
				[quickChat, unknown],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				() => false,
				undefined,
				undefined,
				true,
			);

			assert.deepStrictEqual(sections.map(section => ({ id: section.id, label: section.label, sessions: section.sessions.map(session => session.sessionId) })), [
				{ id: 'quickchats', label: 'Chats', sessions: ['cloud-chat'] },
				{ id: 'workspace:Unknown', label: 'Unknown', sessions: ['unclassified-cloud-session'] },
			]);
		});

		test('pinned quick chat stays in Pinned, not Quick Chats', () => {
			const quick = createSession('quick', { createdAt: new Date('2024-06-01') });
			const sections = groupSessionsForList(
				[quick],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				() => true,
			);

			assert.deepStrictEqual(sections.map(section => section.id), ['pinned']);
		});

		test('quick chats join the other sessions when grouping by date or environment', () => {
			const pinned = createSession('pinned', { createdAt: new Date('2024-06-03') });
			const quick = createSession('quick', { createdAt: new Date('2024-06-02') });
			const regular = createSession('regular', { workspaceLabel: 'Beta', createdAt: new Date('2024-06-01') });
			const result = [SessionsGrouping.Date, SessionsGrouping.Environment].map(grouping => groupSessionsForList(
				[pinned, quick, regular],
				grouping,
				SessionsSorting.Created,
				session => session.sessionId === pinned.sessionId,
			).map(section => ({ id: section.id, sessions: section.sessions.map(s => s.sessionId) })));

			assert.deepStrictEqual(result, [
				[
					{ id: 'pinned', sessions: ['pinned'] },
					{ id: 'older', sessions: ['quick', 'regular'] },
				],
				[
					{ id: 'pinned', sessions: ['pinned'] },
					{ id: 'environment:local', sessions: ['quick', 'regular'] },
				],
			]);
		});

		test('excludes automation sessions from every section', () => {
			const sessions = [
				createSession('workspace-automation', { workspaceLabel: 'Alpha', isAutomation: true }),
				createSession('quick-automation', { isAutomation: true }),
				createSession('archived-automation', { workspaceLabel: 'Beta', isArchived: true, isAutomation: true }),
				createSession('visible', { workspaceLabel: 'Gamma' }),
			];
			const sections = groupSessionsForList(
				sessions,
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				session => session.sessionId === 'workspace-automation',
			);

			assert.deepStrictEqual(sections.map(section => ({
				id: section.id,
				sessions: section.sessions.map(session => session.sessionId),
			})), [
				{ id: 'workspace:Gamma', sessions: ['visible'] },
			]);
		});
	});

	suite('Application session hover', () => {
		for (const flat of [false, true]) {
			test(`updates ${flat ? 'flat' : 'grouped'} application session hovers while visible and when reopened`, async () => {
				const external = createTestSession('External', { isExternal: true });
				const application = observableValue('application', getSessionApplication('vscode'));
				const session = { ...external.session, application };
				const hovers = new Map<HTMLElement, () => IDelayedHoverOptions>();
				const harness = createListHarness(disposables, [session], instantiationService => {
					instantiationService.stub(IHoverService, {
						...NullHoverService,
						setupDelayedHover: (target, options) => {
							hovers.set(target, typeof options === 'function' ? options : () => options);
							return toDisposable(() => hovers.delete(target));
						},
					});
				});
				const container = harness.createContainer();
				if (flat) {
					const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, { onSessionOpen: () => { } }));
					list.setSessions([session]);
					list.layout(300, 400);
				} else {
					const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
						grouping: () => SessionsGrouping.Date,
						sorting: () => SessionsSorting.Created,
						onSessionOpen: () => { },
					}));
					list.layout(300, 400);
				}
				const row = container.querySelector<HTMLElement>('.session-item');
				assert.ok(row);
				const hover = hovers.get(row)?.();
				assert.ok(hover);
				const content = hover.content;
				assert.ok(content instanceof HTMLElement);
				harness.store.add(toDisposable(() => hover.onDidHide?.()));
				const applicationLabel = () => content.querySelector('.session-summary-hover-application button')?.textContent;
				const title = content.querySelector('.session-summary-hover-title-text');
				hover.onDidShow?.();
				const initialApplication = applicationLabel();
				application.set(getSessionApplication('copilot-cli'), undefined);
				const hydratedApplication = applicationLabel();
				external.isExternal.set(false, undefined);
				const adoptedApplication = applicationLabel();
				await timeout(0);
				const titlePreserved = content.querySelector('.session-summary-hover-title-text') === title;
				hover.onDidHide?.();
				external.isExternal.set(true, undefined);
				application.set(getSessionApplication('claude'), undefined);
				const hiddenApplication = applicationLabel();
				hover.onDidShow?.();
				const reopenedApplication = applicationLabel();
				hover.onDidHide?.();
				external.isExternal.set(false, undefined);
				application.set(getSessionApplication('vscode'), undefined);
				hover.onDidShow?.();
				const provenanceHidden = content.querySelector('.session-summary-hover-application')?.classList.contains('hidden');
				harness.store.dispose();
				application.set(getSessionApplication('copilot-cli'), undefined);
				assert.deepStrictEqual({
					titlePreserved,
					disposedApplication: applicationLabel(),
					remainingHovers: hovers.size,
					initialApplication, hydratedApplication, adoptedApplication, hiddenApplication, reopenedApplication, provenanceHidden,
				}, {
					titlePreserved: true,
					disposedApplication: undefined,
					remainingHovers: 0,
					initialApplication: undefined,
					hydratedApplication: 'Created in · Copilot CLI',
					adoptedApplication: 'Created in · Copilot CLI',
					hiddenApplication: 'Created in · Copilot CLI',
					reopenedApplication: 'Created in · Claude',
					provenanceHidden: true,
				});
			});
		}
	});

	suite('External section', () => {
		function renderList(sessions: ISession[], grouping = SessionsGrouping.Workspace, options: IListHarnessOptions & { groupExternalSessions?: boolean } = {}) {
			const harness = createListHarness(disposables, sessions, options);
			const configurationService = harness.instantiationService.get(IConfigurationService) as TestConfigurationService;
			if (options.groupExternalSessions !== undefined) {
				void configurationService.setUserConfiguration(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, options.groupExternalSessions);
			}
			harness.instantiationService.stub(IContextKeyService, harness.store.add(new ContextKeyService(configurationService)));
			void configurationService.setUserConfiguration(ChatSessionArchiveActionWordingSettingId, ChatSessionArchiveActionWording.MarkAsDone);
			const container = harness.createContainer(400, 700);
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => grouping,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.setExcludeArchived(false);
			list.layout(700, 400);
			return { ...harness, list, container, configurationService };
		}

		function sectionLabels(container: HTMLElement): string[] {
			return [...container.querySelectorAll('.session-section-label')].map(label => label.textContent ?? '');
		}

		for (const grouping of [SessionsGrouping.Workspace, SessionsGrouping.Date]) {
			test(`renders between ordinary groups and Done and preserves custom groups (${grouping})`, () => {
				const sessions = [
					createTestSession('Regular', { workspaceLabel: 'Alpha' }).session,
					createTestSession('External', { workspaceLabel: 'Beta', isExternal: true }).session,
					createTestSession('Grouped', { isExternal: true }).session,
					createTestSession('Pinned', { isExternal: true }).session,
					createTestSession('Finished', { isExternal: true, isArchived: true }).session,
				];
				const { container } = renderList(sessions, grouping, {
					groupExternalSessions: true,
					groups: [{ id: 'custom', name: 'Custom', createdAt: 1 }],
					memberships: new Map([['Grouped', 'custom']]),
					pinnedSessionIds: new Set(['Pinned']),
				});
				const externalRow = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(row => row.querySelector('.session-title')?.textContent === 'External');

				assert.deepStrictEqual({
					sections: sectionLabels(container),
					externalAria: [...container.querySelectorAll('.session-section')].find(header => header.querySelector('.session-section-label')?.textContent === 'External')?.closest('.monaco-list-row')?.getAttribute('aria-label'),
					workspaceBadge: externalRow?.querySelector('.session-badge')?.textContent,
					workspaceAria: externalRow?.closest('.monaco-list-row')?.getAttribute('aria-label')?.includes('in Beta'),
				}, {
					sections: ['Pinned', 'Custom', grouping === SessionsGrouping.Workspace ? 'Alpha' : 'Recent', 'External', 'Done'],
					externalAria: 'External, 1',
					workspaceBadge: 'Beta',
					workspaceAria: true,
				});
			});
		}

		test('reacts to external identity and hides the section when its sessions are filtered out', async () => {
			const session = createTestSession('Session', { workspaceLabel: 'Alpha' });
			const { list, container } = renderList([session.session], SessionsGrouping.Workspace, { groupExternalSessions: true });
			const before = sectionLabels(container);
			session.isExternal.set(true, undefined);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			const external = sectionLabels(container);
			list.filters.setExcluded({ kind: 'harness', id: 'copilot' }, true);
			const filtered = sectionLabels(container);
			list.filters.setExcluded({ kind: 'harness', id: 'copilot' }, false);

			assert.deepStrictEqual({ before, external, filtered, restored: sectionLabels(container) }, {
				before: ['Alpha'],
				external: ['External'],
				filtered: [],
				restored: ['External'],
			});
		});

		test('defaults to ordinary placement and switches grouping and row context live', async () => {
			const session = createTestSession('Session', { workspaceLabel: 'Alpha', isExternal: true });
			const { container, configurationService, instantiationService } = renderList([session.session]);
			const snapshot = () => {
				const row = container.querySelector<HTMLElement>('.session-item');
				assert.ok(row);
				return {
					sections: sectionLabels(container),
					inExternalSection: instantiationService.get(IContextKeyService).getContext(row).getValue(SessionItemInExternalSectionContext.key),
				};
			};
			const snapshots = [snapshot()];
			for (const enabled of [true, false, true]) {
				await configurationService.setUserConfiguration(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
					affectedKeys: new Set([SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING]),
					affectsConfiguration: key => key === SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING,
				}));
				snapshots.push(snapshot());
			}

			assert.deepStrictEqual(snapshots, [
				{ sections: ['Alpha'], inExternalSection: false },
				{ sections: ['External'], inExternalSection: true },
				{ sections: ['Alpha'], inExternalSection: false },
				{ sections: ['External'], inExternalSection: true },
			]);
		});

		test('offers the existing external visibility menu and Mark All as Done without New Session', () => {
			const session = createTestSession('External', { isExternal: true }).session;
			const { instantiationService, store } = renderList([session]);
			store.add(instantiationService.createInstance(SessionsArchiveActionsContribution));
			const menuService = store.add(instantiationService.createInstance(MenuService));
			const context = instantiationService.get(IContextKeyService).createOverlay([['sessionSection.type', 'external'], [ChatContextKeys.enabled.key, true]]);
			const actions = menuService.getMenuActions(SessionSectionToolbarMenuId, context).flatMap(([, group]) => group);
			const configure = actions.find(action => action instanceof SubmenuAction);

			assert.deepStrictEqual({
				actions: actions.map(action => action.label),
				options: configure instanceof SubmenuAction ? configure.actions.map(action => action instanceof Separator ? 'separator' : action.label) : [],
			}, {
				actions: ['Configure External Sessions', 'Mark All as Done'],
				options: ['None', 'Recent', 'Last 24 Hours', 'Last 7 Days', 'Last 30 Days', 'separator', 'Show in External Section'],
			});
		});
	});

	suite('workspace badge on custom-group rows', () => {
		const group = { id: 'group-1', name: 'My Group', createdAt: 1 };

		function renderList(
			sessions: ISession[],
			grouping: SessionsGrouping,
			options: { memberships?: ReadonlyMap<string, string>; pinnedSessionIds?: ReadonlySet<string>; expandSections?: readonly string[] } = {},
		): { readonly list: SessionsList; readonly container: HTMLElement } {
			const harness = createListHarness(disposables, sessions, {
				groups: [group],
				memberships: options.memberships,
				pinnedSessionIds: options.pinnedSessionIds,
			});
			if (options.expandSections) {
				harness.instantiationService.get(IStorageService).store(
					'sessionsListControl.sectionCollapseState',
					JSON.stringify(Object.fromEntries(options.expandSections.map(section => [section, false]))),
					StorageScope.PROFILE,
					StorageTarget.USER,
				);
			}
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => grouping,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			return { list, container };
		}

		function rowSnapshot(container: HTMLElement): { title: string; badge: string | undefined; ariaLabel: string | null; details: string; groupConnector: string | undefined }[] {
			return [...container.querySelectorAll<HTMLElement>('.session-item')].map(item => ({
				title: item.querySelector('.session-title')?.textContent ?? '',
				badge: item.querySelector('.session-badge')?.textContent ?? undefined,
				ariaLabel: item.closest('.monaco-list-row')?.getAttribute('aria-label') ?? null,
				details: item.querySelector('.session-details-row')?.textContent ?? '',
				groupConnector: item.dataset.sessionGroupConnector,
			}));
		}

		test('custom-group rows preserve status icons and comparison styling', () => {
			const first = createTestSession('First', { workspaceLabel: 'vscode' }).session;
			const middle = createTestSession('Middle', { workspaceLabel: 'vscode' }).session;
			const last = createTestSession('Last', { workspaceLabel: 'vscode' }).session;
			const memberships = new Map([first, middle, last].map(session => [session.sessionId, group.id]));
			const { container } = renderList([first, middle, last], SessionsGrouping.Workspace, { memberships });
			const groupRow = container.querySelector<HTMLElement>('.session-group')?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(groupRow);
			groupRow.classList.add('focused');

			assert.deepStrictEqual({
				connectors: rowSnapshot(container).map(row => row.groupConnector),
				comparisonAttempts: [...container.querySelectorAll<HTMLElement>('.session-item')]
					.map(row => row.classList.contains('session-comparison-attempt')),
				statusIconDisplays: [...container.querySelectorAll<HTMLElement>('.session-item .session-icon > .codicon')]
					.map(icon => mainWindow.getComputedStyle(icon).display),
				comparisonControls: container.querySelectorAll('.session-comparison-archive').length,
			}, {
				connectors: [undefined, undefined, undefined],
				comparisonAttempts: [false, false, false],
				statusIconDisplays: ['flex', 'flex', 'flex'],
				comparisonControls: 0,
			});
		});

		test('workspace grouping shows a badge only under a custom group', () => {
			const grouped = createTestSession('Grouped', { workspaceLabel: 'vscode' }).session;
			const ordinary = createTestSession('Ordinary', { workspaceLabel: 'vscode' }).session;
			const { container } = renderList([grouped, ordinary], SessionsGrouping.Workspace, {
				memberships: new Map([[grouped.sessionId, group.id]]),
			});

			assert.deepStrictEqual(rowSnapshot(container).map(row => ({ title: row.title, badge: row.badge })), [
				{ title: 'Grouped', badge: 'vscode' },
				{ title: 'Ordinary', badge: undefined },
			]);
		});

		test('date grouping keeps workspace badges on grouped and ordinary rows', () => {
			const grouped = createTestSession('Grouped', { workspaceLabel: 'vscode' }).session;
			const ordinary = createTestSession('Ordinary', { workspaceLabel: 'monaco' }).session;
			const { container } = renderList([grouped, ordinary], SessionsGrouping.Date, {
				memberships: new Map([[grouped.sessionId, group.id]]),
			});

			assert.deepStrictEqual(rowSnapshot(container).map(row => ({ title: row.title, badge: row.badge })), [
				{ title: 'Grouped', badge: 'vscode' },
				{ title: 'Ordinary', badge: 'monaco' },
			]);
		});

		test('pin and archive take precedence over group membership and retain their badges', () => {
			const pinned = createTestSession('Pinned', { workspaceLabel: 'vscode' }).session;
			const archived = createTestSession('Archived', { workspaceLabel: 'monaco', isArchived: true }).session;
			const memberships = new Map([[pinned.sessionId, group.id], [archived.sessionId, group.id]]);
			const { list, container } = renderList([pinned, archived], SessionsGrouping.Workspace, {
				memberships,
				pinnedSessionIds: new Set([pinned.sessionId]),
				expandSections: ['pinned', 'archived'],
			});
			list.setExcludeArchived(false);
			list.layout(300, 400);

			assert.deepStrictEqual({
				renderedGroups: [list.getRenderedSessionGroup(pinned)?.id, list.getRenderedSessionGroup(archived)?.id],
				rows: rowSnapshot(container).map(row => ({ title: row.title, badge: row.badge })),
			}, {
				renderedGroups: [undefined, undefined],
				rows: [
					{ title: 'Pinned', badge: 'vscode' },
					{ title: 'Archived', badge: 'monaco' },
				],
			});
		});

		test('quick chats never show a workspace badge', () => {
			const quickChat = createTestSession('Quick Chat', { isQuickChat: true }).session;
			const { container } = renderList([quickChat], SessionsGrouping.Date, {
				memberships: new Map([[quickChat.sessionId, group.id]]),
			});

			assert.deepStrictEqual(rowSnapshot(container).map(row => ({ title: row.title, badge: row.badge, details: row.details })), [
				{ title: 'Quick Chat', badge: undefined, details: '' },
			]);
		});

		test('in-progress and needs-input grouped rows suppress the workspace badge', () => {
			const inProgress = createTestSession('Working', { workspaceLabel: 'vscode', status: SessionStatus.InProgress }).session;
			const needsInput = createTestSession('Needs Input', { workspaceLabel: 'monaco', status: SessionStatus.NeedsInput }).session;
			const { container } = renderList([inProgress, needsInput], SessionsGrouping.Workspace, {
				memberships: new Map([[inProgress.sessionId, group.id], [needsInput.sessionId, group.id]]),
			});

			assert.deepStrictEqual(Object.fromEntries(rowSnapshot(container).map(row => [row.title, {
				badge: row.badge,
				ariaHasWorkspace: row.ariaLabel?.includes(' in ') ?? false,
			}])), {
				Working: { badge: undefined, ariaHasWorkspace: false },
				'Needs Input': { badge: undefined, ariaHasWorkspace: false },
			});
		});

		test('accessible names include workspace exactly when the badge is visible', () => {
			const grouped = createTestSession('Grouped', { workspaceLabel: 'vscode' }).session;
			const ordinary = createTestSession('Ordinary', { workspaceLabel: 'monaco' }).session;
			const workspaceRows = renderList([grouped, ordinary], SessionsGrouping.Workspace, {
				memberships: new Map([[grouped.sessionId, group.id]]),
			}).container;
			const dateRows = renderList([ordinary], SessionsGrouping.Date).container;

			assert.deepStrictEqual({
				workspace: rowSnapshot(workspaceRows).map(row => ({ title: row.title, badge: row.badge, ariaLabel: row.ariaLabel })),
				date: rowSnapshot(dateRows).map(row => ({ title: row.title, badge: row.badge, ariaLabel: row.ariaLabel })),
			}, {
				workspace: [
					{ title: 'Grouped', badge: 'vscode', ariaLabel: 'Grouped, updated now, State: Completed, in vscode' },
					{ title: 'Ordinary', badge: undefined, ariaLabel: 'Ordinary, updated now, State: Completed' },
				],
				date: [
					{ title: 'Ordinary', badge: 'monaco', ariaLabel: 'Ordinary, updated now, State: Completed, in monaco' },
				],
			});
		});
	});

	suite('archived filter default', () => {
		function getExcludeArchived(settingValue: boolean, storedValue?: boolean): boolean {
			const harness = createListHarness(disposables, []);
			void (harness.instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING, settingValue);
			if (storedValue !== undefined) {
				harness.instantiationService.get(IStorageService).store('sessionsListControl.excludeArchived', storedValue, StorageScope.PROFILE, StorageTarget.USER);
			}
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, harness.createContainer(), {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			return list.isExcludeArchived();
		}

		test('uses the setting only until the user has changed the filter', () => {
			assert.deepStrictEqual({
				defaultHidden: getExcludeArchived(false),
				experimentShows: getExcludeArchived(true),
				existingHiddenChoice: getExcludeArchived(true, true),
				existingShownChoice: getExcludeArchived(false, false),
			}, {
				defaultHidden: true,
				experimentShows: false,
				existingHiddenChoice: true,
				existingShownChoice: false,
			});
		});
	});

	suite('empty group filter', () => {
		test('migrates removed filters and keeps empty groups visible', () => {
			const emptyGroup: ISessionGroup = { id: 'empty', name: 'Empty Group', createdAt: 2 };
			const populatedGroup: ISessionGroup = { id: 'populated', name: 'Populated Group', createdAt: 1 };
			const grouped = createTestSession('Grouped').session;
			const harness = createListHarness(disposables, [grouped], {
				groups: [emptyGroup, populatedGroup],
				memberships: new Map([[grouped.sessionId, populatedGroup.id]]),
			});
			harness.instantiationService.get(IStorageService).store('sessionsListControl.showEmptyGroups', false, StorageScope.PROFILE, StorageTarget.USER);
			harness.instantiationService.get(IStorageService).store('sessionsListControl.excludedSessionTypes', JSON.stringify(['test']), StorageScope.PROFILE, StorageTarget.USER);
			harness.instantiationService.get(IStorageService).store('sessionsListControl.excludedStatuses', JSON.stringify([SessionStatus.Completed]), StorageScope.PROFILE, StorageTarget.USER);
			harness.instantiationService.get(IStorageService).store('sessionsListControl.excludeRead', true, StorageScope.PROFILE, StorageTarget.USER);
			const quickChatProvider = upcastPartial<ISessionsProvider>({ supportsQuickChats: true });
			harness.instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return [quickChatProvider]; }
				override getProvider() { return undefined; }
			});
			void (harness.instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING, true);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const groupLabels = () => [...container.querySelectorAll<HTMLElement>('.session-section-label')].map(element => element.textContent);

			assert.deepStrictEqual({
				visible: groupLabels(),
				sessionVisible: list.reveal(grouped.resource),
				stored: ['showEmptyGroups', 'excludedSessionTypes', 'excludedStatuses', 'excludeRead'].map(key =>
					harness.instantiationService.get(IStorageService).get(`sessionsListControl.${key}`, StorageScope.PROFILE)),
			}, {
				visible: ['Chats', 'Empty Group', 'Populated Group'],
				sessionVisible: true,
				stored: [undefined, undefined, undefined, undefined],
			});
		});

		test('keeps an empty group visible while it is being renamed', () => {
			const emptyGroup: ISessionGroup = { id: 'empty', name: 'Empty Group', createdAt: 1 };
			const harness = createListHarness(disposables, [], { groups: [emptyGroup] });
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			list.beginRenameGroup(emptyGroup.id);
			const input = container.querySelector<HTMLInputElement>('.session-group-input input');
			const renderedWhileEditing = !!container.querySelector('.session-group');
			input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));

			assert.deepStrictEqual({
				renderedWhileEditing,
				hasRenameInput: !!input,
				renderedAfterEditing: !!container.querySelector('.session-group'),
			}, {
				renderedWhileEditing: true,
				hasRenameInput: true,
				renderedAfterEditing: true,
			});
		});

		test('preserves the group rename draft, focus, and selection across rerenders', () => {
			const group: ISessionGroup = { id: 'group', name: 'Group', createdAt: 1 };
			const harness = createListHarness(disposables, [], { groups: [group] });
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			list.beginRenameGroup(group.id);
			const input = container.querySelector<HTMLInputElement>('.session-group-input input');
			assert.ok(input);
			input.value = 'Group draft';
			input.setSelectionRange(2, 7, 'forward');
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
			list.refresh();
			const rerenderedInput = container.querySelector<HTMLInputElement>('.session-group-input input');
			const rerenderState = {
				draft: rerenderedInput?.value,
				inputRecreated: rerenderedInput !== input,
				focused: mainWindow.document.activeElement === rerenderedInput,
				selectionStart: rerenderedInput?.selectionStart,
				selectionEnd: rerenderedInput?.selectionEnd,
				selectionDirection: rerenderedInput?.selectionDirection,
			};
			rerenderedInput?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			list.beginRenameGroup(group.id);
			const restartedInput = container.querySelector<HTMLInputElement>('.session-group-input input');
			const restartedValue = restartedInput?.value;
			// Close the editor so teardown does not commit it on blur.
			restartedInput?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));

			assert.deepStrictEqual({ rerenderState, restartedValue }, {
				rerenderState: {
					draft: 'Group draft',
					inputRecreated: true,
					focused: true,
					selectionStart: 2,
					selectionEnd: 7,
					selectionDirection: 'forward',
				},
				restartedValue: 'Group',
			});
		});
	});

	suite('nested custom groups', () => {
		const release: ISessionGroup = { id: 'release', name: 'Release work', createdAt: 3 };
		const hotfixes: ISessionGroup = { id: 'hotfixes', name: 'Hotfixes', createdAt: 5, parentId: 'release' };
		const docs: ISessionGroup = { id: 'docs', name: 'Docs', createdAt: 4, parentId: 'release' };
		const urgent: ISessionGroup = { id: 'urgent', name: 'Urgent', createdAt: 6, parentId: 'hotfixes' };
		const triage: ISessionGroup = { id: 'triage', name: 'Triage', createdAt: 2 };

		function labelOf(row: HTMLElement): string {
			return (row.querySelector('.session-section-label') ?? row.querySelector('.session-title') ?? row.querySelector('.session-placeholder-label'))?.textContent ?? '';
		}

		function rowOf(container: HTMLElement, label: string): HTMLElement {
			const row = [...container.querySelectorAll<HTMLElement>('.monaco-list-row')].find(candidate => labelOf(candidate) === label);
			assert.ok(row, `Expected a row for "${label}"`);
			return row;
		}

		/** Drags `source` over `target` at `fraction` of its height, runs `whileOver` there, and drops it. */
		function dragRow(source: HTMLElement, target: HTMLElement, fraction: number, whileOver?: () => void): void {
			const dataTransfer = new DataTransfer();
			const listNode = source.closest<HTMLElement>('.monaco-list');
			source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
			const bounds = target.getBoundingClientRect();
			const clientY = bounds.top + bounds.height * fraction;
			const event = (type: string) => {
				const dragEvent = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX: bounds.left + 10, clientY });
				Object.defineProperty(dragEvent, 'offsetY', { value: clientY - bounds.top });
				return dragEvent;
			};
			target.dispatchEvent(event('dragover'));
			whileOver?.();
			target.dispatchEvent(event('drop'));
			// The drop may re-render the list and detach the dragged row.
			(source.isConnected ? source : listNode)?.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
		}

		function render(grouping = SessionsGrouping.Workspace, sectionMemberships: ReadonlyMap<string, string> = new Map(), liveGroups = false) {
			let currentGrouping = grouping;
			const now = Date.now();
			const session = (title: string, minutesAgo: number) => createTestSession(title, { workspaceLabel: 'vscode', repository: grouping === SessionsGrouping.Repository ? 'microsoft/vscode' : undefined, createdAt: new Date(now - minutesAgo * 60_000) }).session;
			const sessions = [session('Ship notes', 1), session('Fix login', 2), session('Patch CVE', 3), session('Flaky test', 4), session('Ungrouped', 5)];
			const groups = [release, hotfixes, docs, urgent, triage];
			const memberships = new Map([
				[sessions[0].sessionId, release.id],
				[sessions[1].sessionId, hotfixes.id],
				[sessions[2].sessionId, urgent.id],
				[sessions[3].sessionId, triage.id],
			]);
			const harness = createListHarness(disposables, sessions, {
				groups,
				sectionMemberships,
				memberships,
			});
			if (liveGroups) {
				const storageService = harness.instantiationService.get(IStorageService);
				storageService.store('sessionsListControl.groups', JSON.stringify({
					groups, membership: Object.fromEntries(memberships), sectionMembership: Object.fromEntries(sectionMemberships),
				}), StorageScope.PROFILE, StorageTarget.USER);
				const orderService = harness.store.add(new SessionSectionOrderService(storageService));
				harness.instantiationService.stub(ISessionSectionOrderService, orderService);
				harness.instantiationService.stub(ISessionGroupsService, harness.store.add(new SessionGroupsService(storageService, upcastPartial<ISessionsManagementService>({
					onDidChangeSessions: Event.None,
					onDidDeleteSession: Event.None,
					onDidArchiveSession: Event.None,
					onWillSendRequest: Event.None,
					onDidReplaceSession: Event.None,
					onDidReplaceNewDraftSession: Event.None,
					onDidStartSession: Event.None,
					onDidDiscardNewSession: Event.None,
					onDidMoveChat: Event.None,
					getSessions: () => harness.managementService.sessions,
					getInFlightNewSessionRequests: () => [],
					getSession: resource => harness.managementService.getSession(resource),
				}), orderService)));
			}
			const contextMenus: (readonly IAction[])[] = [];
			harness.instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
				override showContextMenu(delegate: IContextMenuDelegate): void {
					contextMenus.push(delegate.getActions());
				}
			});
			const container = harness.createContainer(400, 800);
			const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
				grouping: () => currentGrouping,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(800, 400);
			return { harness, container, list, contextMenus, setGrouping: (value: SessionsGrouping) => { currentGrouping = value; list.resetSectionCollapseState(); list.update(true); } };
		}

		for (const [grouping, sectionId, sectionLabel] of [
			[SessionsGrouping.Workspace, 'workspace:vscode', 'vscode'],
			[SessionsGrouping.Repository, 'repository:microsoft/vscode', 'vscode'],
			[SessionsGrouping.Environment, 'environment:local', 'This Computer'],
		] as const) {
			test(`nests a ${grouping} section with correct totals and depth, only in its grouping mode`, () => {
				const { harness, list, setGrouping } = render(grouping, new Map([[sectionId, docs.id]]));
				const snapshot = () => ({
					sectionLevel: list.getItemRow({ section: sectionId })?.getAttribute('aria-level'),
					sectionDepth: list.getItemRow({ section: sectionId })?.querySelector<HTMLElement>('.session-section')?.style.getPropertyValue('--session-group-depth'),
					automaticDepth: list.getItemRow({ session: harness.managementService.sessions[4].resource })?.querySelector<HTMLElement>('.session-item')?.style.getPropertyValue('--session-group-depth'),
					group: list.getItemRow({ group: docs.id })?.getAttribute('aria-label'),
				});
				const nested = snapshot();
				setGrouping(SessionsGrouping.Date);
				const inactive = snapshot();
				setGrouping(grouping);

				assert.deepStrictEqual({ nested, inactive, restored: snapshot() }, {
					nested: { sectionLevel: '3', sectionDepth: '2', automaticDepth: '2', group: 'Docs, 1' },
					inactive: { sectionLevel: undefined, sectionDepth: undefined, automaticDepth: '', group: 'Docs, 0' },
					restored: nested,
				});
			});

			test(`drags a ${grouping} section into a custom group and back out, without moving individual sessions`, () => {
				const { harness, container, list } = render(grouping, new Map(), true);
				const groupsService = harness.instantiationService.get(ISessionGroupsService);
				list.setItemCollapsed({ group: docs.id }, true);
				dragRow(rowOf(container, sectionLabel), rowOf(container, 'Docs'), 0.5);
				const nested = {
					parent: groupsService.getGroupOfSection(sectionId),
					level: list.getItemRow({ section: sectionId })?.getAttribute('aria-level'),
					parentExpanded: list.getItemRow({ group: docs.id })?.getAttribute('aria-expanded'),
				};
				dragRow(rowOf(container, sectionLabel), rowOf(container, 'Triage'), 0.1);

				assert.deepStrictEqual({
					nested,
					topLevel: {
						parent: groupsService.getGroupOfSection(sectionId),
						level: list.getItemRow({ section: sectionId })?.getAttribute('aria-level'),
					},
					sessionMembership: groupsService.getGroupOfSession(harness.managementService.sessions[4].sessionId),
				}, {
					nested: { parent: docs.id, level: '3', parentExpanded: 'true' },
					topLevel: { parent: undefined, level: '1' },
					sessionMembership: undefined,
				});
			});
		}

		test('remembers workspace fallback nesting independently in Workspace and Repository modes', () => {
			const { harness, list, setGrouping } = render(SessionsGrouping.Workspace, new Map([['workspace:vscode', docs.id]]), true);
			const level = () => list.getItemRow({ section: 'workspace:vscode' })?.getAttribute('aria-level');
			const workspace = level();
			setGrouping(SessionsGrouping.Repository);
			const fallbackBeforeMove = level();
			harness.instantiationService.get(ISessionGroupsService).moveSection('repository:workspace:vscode', triage.id);
			const repository = level();
			setGrouping(SessionsGrouping.Workspace);

			assert.deepStrictEqual({ workspace, fallbackBeforeMove, repository, restored: level() }, {
				workspace: '3', fallbackBeforeMove: '1', repository: '2', restored: '3',
			});
		});

		test('reorders grouping sections and subgroups together and moves a section between parents', () => {
			const { harness, list, container } = render(SessionsGrouping.Workspace, new Map(), true);
			const groupsService = harness.instantiationService.get(ISessionGroupsService);
			dragRow(rowOf(container, 'vscode'), rowOf(container, 'Hotfixes'), 0.1);
			const sectionFirst = groupsService.getChildIds(release.id);
			dragRow(rowOf(container, 'Docs'), rowOf(container, 'vscode'), 0.1);
			const groupFirst = groupsService.getChildIds(release.id);
			dragRow(rowOf(container, 'vscode'), rowOf(container, 'Fix login'), 0.5);

			assert.deepStrictEqual({
				sectionFirst,
				groupFirst,
				newParent: groupsService.getGroupOfSection('workspace:vscode'),
				children: groupsService.getChildIds(hotfixes.id),
				level: list.getItemRow({ section: 'workspace:vscode' })?.getAttribute('aria-level'),
			}, {
				sectionFirst: ['workspace:vscode', hotfixes.id, docs.id],
				groupFirst: [docs.id, 'workspace:vscode', hotfixes.id],
				newParent: hotfixes.id,
				children: ['workspace:vscode', urgent.id],
				level: '3',
			});
		});

		test('context-menu section moves expand their destination and keep old sections visible when removed', async () => {
			const { harness, list, container, contextMenus } = render(SessionsGrouping.Workspace, new Map(), true);
			const menu = (label: string) => {
				rowOf(container, label).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
				return contextMenus.at(-1)!;
			};
			list.setItemCollapsed({ group: docs.id }, true);
			list.setItemCollapsed({ group: release.id }, true);
			const move = menu('vscode').find(action => action.id === 'sessions.moveSectionToGroup');
			assert.ok(move instanceof SubmenuAction);
			await move.actions.find(action => action.id === `sessions.moveSectionToGroup.${docs.id}`)!.run();
			const nested = {
				expanded: list.getItemRow({ group: docs.id })?.getAttribute('aria-expanded'),
				level: list.getItemRow({ section: 'workspace:vscode' })?.getAttribute('aria-level'),
				focused: list.getItemRow({ section: 'workspace:vscode' })?.classList.contains('focused'),
			};
			const old = createTestSession('Old session', { workspaceLabel: 'Old', updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60_000) }).session;
			harness.managementService.sessions.push(old);
			const groupsService = harness.instantiationService.get(ISessionGroupsService);
			groupsService.moveSection('workspace:Old', docs.id);
			list.refresh();
			await menu('Old').find(action => action.id === 'sessions.removeSectionFromGroup')!.run();

			assert.deepStrictEqual({
				nested,
				removed: {
					parent: groupsService.getGroupOfSection('workspace:Old'),
					level: list.getItemRow({ section: 'workspace:Old' })?.getAttribute('aria-level'),
					focused: list.getItemRow({ section: 'workspace:Old' })?.classList.contains('focused'),
					promoted: harness.instantiationService.get(ISessionSectionOrderService).isPromoted('workspace:Old'),
				},
			}, {
				nested: { expanded: 'true', level: '3', focused: true },
				removed: { parent: undefined, level: '1', focused: true, promoted: true },
			});
		});

		test('a stale section-removal action does not reorder when no top-level headers remain', async () => {
			const { harness, list, container, contextMenus } = render(SessionsGrouping.Workspace, new Map([['workspace:vscode', docs.id]]), true);
			rowOf(container, 'vscode').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			const remove = contextMenus.at(-1)!.find(action => action.id === 'sessions.removeSectionFromGroup');
			assert.ok(remove);
			const groupsService = harness.instantiationService.get(ISessionGroupsService);
			for (const group of groupsService.getTree().getSubgroups(undefined)) {
				groupsService.deleteGroup(group.id);
			}
			harness.managementService.sessions.length = 0;
			list.refresh();
			const reorder = sinon.spy(harness.instantiationService.get(ISessionSectionOrderService), 'reorder');
			disposables.add(toDisposable(() => reorder.restore()));

			await remove.run();

			assert.deepStrictEqual({
				parent: groupsService.getGroupOfSection('workspace:vscode'),
				reorders: reorder.callCount,
			}, { parent: undefined, reorders: 0 });
		});

		test('group Mark All as Read includes active nested sections but not another group\'s members', async () => {
			const { harness, list, container, contextMenus } = render(SessionsGrouping.Workspace, new Map([['workspace:vscode', docs.id]]), true);
			const automatic = createTestSession('Automatic unread', { workspaceLabel: 'vscode', isRead: false }).session;
			const elsewhere = createTestSession('Other group unread', { workspaceLabel: 'vscode', isRead: false }).session;
			harness.managementService.sessions.push(automatic, elsewhere);
			harness.instantiationService.get(ISessionGroupsService).addToGroup(elsewhere.sessionId, triage.id);
			list.refresh();
			rowOf(container, 'Release work').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			await contextMenus.at(-1)!.find(action => action.id === 'sessionsViewPane.markAllInSectionRead')!.run();

			assert.deepStrictEqual(harness.managementService.readSessions.map(session => session.title.get()), ['Automatic unread']);
		});

		test('new sessions automatically follow a nested workspace while explicit group membership keeps precedence', () => {
			const { harness, list } = render(SessionsGrouping.Workspace, new Map([['workspace:vscode', docs.id]]));
			const session = createTestSession('New session', { workspaceLabel: 'vscode' }).session;
			harness.managementService.sessions.push(session);
			list.refresh();

			assert.deepStrictEqual({
				automaticLevel: list.getItemRow({ session: session.resource })?.getAttribute('aria-level'),
				explicitLevel: list.getItemRow({ session: harness.managementService.sessions[0].resource })?.getAttribute('aria-level'),
				nestedCount: list.getItemRow({ group: docs.id })?.getAttribute('aria-label'),
				parentCount: list.getItemRow({ group: release.id })?.getAttribute('aria-label'),
			}, { automaticLevel: '4', explicitLevel: '2', nestedCount: 'Docs, 2', parentCount: 'Release work, 5' });
		});

		test('lists subgroups above their parent group\'s sessions, stepping in one level per nesting depth', () => {
			for (const grouping of [SessionsGrouping.Workspace, SessionsGrouping.Date]) {
				const { container } = render(grouping);
				const rows = [...container.querySelectorAll<HTMLElement>('.monaco-list-row')].map(row => {
					const content = row.querySelector<HTMLElement>('.session-group, .session-section, .session-item, .session-placeholder');
					const depth = Number(content?.style.getPropertyValue('--session-group-depth') || 0);
					return `${'  '.repeat(depth)}${labelOf(row)}`;
				});
				const groupHeaders = [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
					.filter(row => row.querySelector('.session-group'))
					.map(row => `${row.getAttribute('aria-label')} (level ${row.getAttribute('aria-level')})`);

				assert.deepStrictEqual({ grouping, rows, groupHeaders }, {
					grouping,
					rows: [
						'Release work',
						'  Hotfixes',
						'    Urgent',
						'    Patch CVE',
						'  Fix login',
						'  Docs',
						'  No session',
						'Ship notes',
						'Triage',
						'Flaky test',
						grouping === SessionsGrouping.Workspace ? 'vscode' : 'Recent',
						'Ungrouped',
					],
					groupHeaders: [
						'Release work, 3 (level 1)',
						'Hotfixes, 2 (level 2)',
						'Urgent, 1 (level 3)',
						'Docs, 0 (level 2)',
						'Triage, 1 (level 1)',
					],
				});
			}
		});

		test('drops a group inside another group, next to a nested group, or back at the top level, but never inside itself', () => {
			const { harness, container, list } = render();
			const drag = (source: string, target: string, fraction: number) => {
				const targetRow = rowOf(container, target);
				let feedback: string[] = [];
				let insertionDepth = 0;
				dragRow(rowOf(container, source), targetRow, fraction, () => {
					feedback = [...targetRow.parentElement!.querySelectorAll<HTMLElement>('.monaco-list-row')]
						.filter(row => /drop-target/.test(row.className) || row.querySelector('.session-header-drop-target'))
						.map(row => `${labelOf(row)}: ${[...row.classList].filter(name => name.startsWith('drop-target')).join(' ') || 'highlighted header'}`);
					insertionDepth = Number(targetRow.closest<HTMLElement>('.sessions-list-control')?.style.getPropertyValue('--session-group-insertion-depth') || 0);
				});
				return {
					drop: `${source} onto ${target} at ${fraction}`,
					feedback,
					insertionDepth,
					moved: harness.movedGroups.splice(0).map(move => `${move.groupId} into ${move.parentId ?? 'top level'}${move.placement ? ` ${move.placement.position} ${move.placement.siblingId}` : ''}`),
					reorders: harness.sectionReorders.splice(0).map(reorder => `${reorder.draggedId} ${reorder.position} ${reorder.targetId} among ${reorder.visibleOrder.join(', ')}`),
				};
			};

			const drops = [
				drag('Triage', 'Release work', 0.5),
				drag('Docs', 'Urgent', 0.1),
				drag('Hotfixes', 'vscode', 0.1),
				drag('Triage', 'Fix login', 0.5),
				drag('Triage', 'Docs', 0.9),
				drag('Release work', 'Urgent', 0.5),
				drag('Release work', 'Patch CVE', 0.5),
			];
			list.setItemCollapsed({ group: urgent.id }, true);
			drops.push(drag('Triage', 'Urgent', 0.9));

			assert.deepStrictEqual(drops, [
				{
					drop: 'Triage onto Release work at 0.5',
					feedback: ['Release work: drop-target'],
					insertionDepth: 0,
					moved: ['triage into release'],
					reorders: [],
				},
				{
					drop: 'Docs onto Urgent at 0.1',
					feedback: ['Urgent: drop-target-before'],
					insertionDepth: 2,
					moved: ['docs into hotfixes before urgent'],
					reorders: [],
				},
				{
					drop: 'Hotfixes onto vscode at 0.1',
					feedback: ['vscode: drop-target-before'],
					insertionDepth: 0,
					moved: ['hotfixes into top level'],
					reorders: ['group:hotfixes before workspace:vscode among group:release, group:triage, workspace:vscode'],
				},
				{
					drop: 'Triage onto Fix login at 0.5',
					feedback: ['Hotfixes: highlighted header'],
					insertionDepth: 0,
					moved: ['triage into hotfixes'],
					reorders: [],
				},
				{
					drop: 'Triage onto Docs at 0.9',
					feedback: ['Docs: drop-target'],
					insertionDepth: 0,
					moved: ['triage into docs'],
					reorders: [],
				},
				{ drop: 'Release work onto Urgent at 0.5', feedback: [], insertionDepth: 0, moved: [], reorders: [] },
				{ drop: 'Release work onto Patch CVE at 0.5', feedback: [], insertionDepth: 0, moved: [], reorders: [] },
				{
					drop: 'Triage onto Urgent at 0.9',
					// The list draws a line after a row as a line before the next row.
					feedback: ['Fix login: drop-target-before'],
					insertionDepth: 2,
					moved: ['triage into hotfixes after urgent'],
					reorders: [],
				},
			]);
		});

		test('moving a header keeps the order of every other group\'s subgroups, even with a stored order that mixes the levels', () => {
			const sessions = [createTestSession('Ungrouped', { workspaceLabel: 'vscode' }).session];
			const harness = createListHarness(disposables, sessions);
			const storageService = harness.instantiationService.get(IStorageService);
			// Release work holds Hotfixes and Docs, and Triage holds Flaky and Perf, newest first by default.
			storageService.store('sessionsListControl.groups', JSON.stringify({
				groups: [
					{ id: 'release', name: 'Release work', createdAt: 4 },
					{ id: 'hotfixes', name: 'Hotfixes', createdAt: 8, parentId: 'release' },
					{ id: 'docs', name: 'Docs', createdAt: 7, parentId: 'release' },
					{ id: 'triage', name: 'Triage', createdAt: 3 },
					{ id: 'flaky', name: 'Flaky', createdAt: 6, parentId: 'triage' },
					{ id: 'perf', name: 'Perf', createdAt: 5, parentId: 'triage' },
				],
				membership: {},
			}), StorageScope.PROFILE, StorageTarget.USER);
			// One flat order of every level, as stored before subgroups had an order of their own. Merging a
			// reorder into it carries the entries that follow a moved header along with it.
			storageService.store('sessionsListControl.sectionOrder', JSON.stringify({
				order: ['group:release', 'group:hotfixes', 'group:flaky', 'group:triage', 'group:docs', 'group:perf'],
				promoted: [],
			}), StorageScope.PROFILE, StorageTarget.USER);
			const orderService = harness.store.add(new SessionSectionOrderService(storageService));
			const groupsService = harness.store.add(new SessionGroupsService(storageService, upcastPartial<ISessionsManagementService>({
				onDidChangeSessions: Event.None,
				onDidDeleteSession: Event.None,
				onDidArchiveSession: Event.None,
				onWillSendRequest: Event.None,
				onDidReplaceNewDraftSession: Event.None,
				onDidReplaceSession: Event.None,
				onDidStartSession: Event.None,
				onDidDiscardNewSession: Event.None,
				onDidMoveChat: Event.None,
				getSessions: () => sessions,
				getInFlightNewSessionRequests: () => [],
				getSession: () => undefined,
			}), orderService));
			harness.instantiationService.stub(ISessionSectionOrderService, orderService);
			harness.instantiationService.stub(ISessionGroupsService, groupsService);
			const container = harness.createContainer(400, 800);
			const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(800, 400);
			const groupHeaders = () => [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
				.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top))
				.flatMap(row => {
					const header = row.querySelector<HTMLElement>('.session-group');
					return header ? [`${'  '.repeat(Number(header.style.getPropertyValue('--session-group-depth') || 0))}${labelOf(row)}`] : [];
				});

			const initial = groupHeaders();
			dragRow(rowOf(container, 'Triage'), rowOf(container, 'Release work'), 0.1);
			const afterTopLevelMove = groupHeaders();
			dragRow(rowOf(container, 'Docs'), rowOf(container, 'Hotfixes'), 0.1);
			const afterSubgroupMove = groupHeaders();

			assert.deepStrictEqual({ initial, afterTopLevelMove, afterSubgroupMove }, {
				initial: ['Release work', '  Hotfixes', '  Docs', 'Triage', '  Flaky', '  Perf'],
				afterTopLevelMove: ['Triage', '  Flaky', '  Perf', 'Release work', '  Hotfixes', '  Docs'],
				afterSubgroupMove: ['Triage', '  Flaky', '  Perf', 'Release work', '  Docs', '  Hotfixes'],
			});
		});

		/**
		 * Renders Release work and Triage, without sessions, with a session in each
		 * of Recent, Older, and Archived, grouped by date with the real group and order services.
		 */
		function renderByDate(sectionOrder?: readonly string[]) {
			const now = Date.now();
			const sessions = [
				createTestSession('Fresh', { createdAt: new Date(now - 60_000) }).session,
				createTestSession('Stale', { createdAt: new Date(now - 30 * 24 * 60 * 60_000) }).session,
				createTestSession('Finished', { createdAt: new Date(now - 120_000), isArchived: true }).session,
			];
			const harness = createListHarness(disposables, sessions);
			const storageService = harness.instantiationService.get(IStorageService);
			storageService.store('sessionsListControl.groups', JSON.stringify({ groups: [release, triage], membership: {} }), StorageScope.PROFILE, StorageTarget.USER);
			if (sectionOrder) {
				storageService.store('sessionsListControl.sectionOrder', JSON.stringify({ order: sectionOrder, promoted: [] }), StorageScope.PROFILE, StorageTarget.USER);
			}
			const orderService = harness.store.add(new SessionSectionOrderService(storageService));
			const groupsService = harness.store.add(new SessionGroupsService(storageService, upcastPartial<ISessionsManagementService>({
				onDidChangeSessions: Event.None,
				onDidDeleteSession: Event.None,
				onDidArchiveSession: Event.None,
				onWillSendRequest: Event.None,
				onDidReplaceNewDraftSession: Event.None,
				onDidReplaceSession: Event.None,
				onDidStartSession: Event.None,
				onDidDiscardNewSession: Event.None,
				onDidMoveChat: Event.None,
				getSessions: () => sessions,
				getInFlightNewSessionRequests: () => [],
				getSession: () => undefined,
			}), orderService));
			harness.instantiationService.stub(ISessionSectionOrderService, orderService);
			harness.instantiationService.stub(ISessionGroupsService, groupsService);
			const container = harness.createContainer(400, 800);
			const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(800, 400);
			list.setExcludeArchived(false);
			const headers = () => [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
				.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top))
				.filter(row => row.querySelector('.session-group, .session-section'))
				.map(labelOf);
			return { container, list, groupsService, headers };
		}

		test('drops a group between and below the date sections, drawing the line below an expanded section\'s rows', () => {
			const { container, list, groupsService, headers } = renderByDate();
			const drag = (source: string, target: string, fraction: number) => {
				const targetRow = rowOf(container, target);
				let feedback: string[] = [];
				dragRow(rowOf(container, source), targetRow, fraction, () => {
					feedback = [...targetRow.parentElement!.querySelectorAll<HTMLElement>('.monaco-list-row')]
						.filter(row => /drop-target/.test(row.className))
						.map(row => `${labelOf(row)}: ${[...row.classList].filter(name => name.startsWith('drop-target')).join(' ')}`);
				});
				return { drop: `${source} onto ${target} at ${fraction}`, feedback, headers: headers() };
			};

			const initial = headers();
			const drops = [
				drag('Triage', 'Older', 0.1),
				drag('Release work', 'Older', 0.9),
				drag('Release work', 'Recent', 0.9),
			];
			// Garbage-collecting the order after a group change keeps the date sections in it.
			groupsService.createGroup('Docs');
			list.update(true);

			assert.deepStrictEqual({ initial, drops, afterNewGroup: headers() }, {
				initial: ['Release work', 'Triage', 'Recent', 'Older', 'Archived'],
				drops: [
					{ drop: 'Triage onto Older at 0.1', feedback: ['Older: drop-target-before'], headers: ['Release work', 'Recent', 'Triage', 'Older', 'Archived'] },
					// Older starts collapsed below Recent, so the line after it is drawn above Archived.
					{ drop: 'Release work onto Older at 0.9', feedback: ['Archived: drop-target-before'], headers: ['Recent', 'Triage', 'Older', 'Release work', 'Archived'] },
					{ drop: 'Release work onto Recent at 0.9', feedback: ['Triage: drop-target-before'], headers: ['Recent', 'Release work', 'Triage', 'Older', 'Archived'] },
				],
				afterNewGroup: ['Docs', 'Recent', 'Release work', 'Triage', 'Older', 'Archived'],
			});
		});

		test('keeps Recent above Older when a reorder in another grouping mode swapped them in the stored order', () => {
			const { headers } = renderByDate(['group:triage', 'older', 'group:release', 'recent']);

			assert.deepStrictEqual(headers(), ['Triage', 'Recent', 'Release work', 'Older', 'Archived']);
		});
	});

	suite('section collapse persistence', () => {
		const group: ISessionGroup = { id: 'group-1', name: 'My Group', createdAt: 1 };

		function createHarness(seededState?: Record<string, boolean>) {
			const grouped = createTestSession('Grouped', { workspaceLabel: 'vscode' }).session;
			const ungrouped = createTestSession('Ungrouped', { workspaceLabel: 'vscode' }).session;
			const harness = createListHarness(disposables, [grouped, ungrouped], {
				groups: [group],
				memberships: new Map([[grouped.sessionId, group.id]]),
			});
			const storageService = harness.instantiationService.get(IStorageService);
			if (seededState) {
				storageService.store('sessionsListControl.sectionCollapseState', JSON.stringify(seededState), StorageScope.PROFILE, StorageTarget.USER);
			}
			let grouping = SessionsGrouping.Date;
			const createList = () => {
				const list = harness.instantiationService.createInstance(TestSessionsList, harness.createContainer(), {
					grouping: () => grouping,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
				});
				list.layout(300, 400);
				return list;
			};
			return {
				createList,
				setGrouping: (list: SessionsList, value: SessionsGrouping) => {
					// Mirrors SessionsView.setGrouping.
					grouping = value;
					list.resetSectionCollapseState();
					list.update(true);
				},
				isGroupExpanded: (list: TestSessionsList) => list.getItemRow({ group: group.id })?.getAttribute('aria-expanded'),
				persisted: () => JSON.parse(storageService.get('sessionsListControl.sectionCollapseState', StorageScope.PROFILE) ?? '{}'),
			};
		}

		test('keeps a collapsed custom group collapsed after a grouping change and a restart', () => {
			const harness = createHarness({ pinned: false, older: true, 'workspace:file:///elsewhere': true });
			const list = harness.createList();
			list.setItemCollapsed({ group: group.id }, true);
			harness.setGrouping(list, SessionsGrouping.Workspace);
			const afterGroupingChange = harness.isGroupExpanded(list);
			list.dispose();

			const restarted = harness.createList();
			const afterRestart = harness.isGroupExpanded(restarted);
			restarted.dispose();

			assert.deepStrictEqual({ afterGroupingChange, afterRestart, persisted: harness.persisted() }, {
				afterGroupingChange: 'false',
				afterRestart: 'false',
				persisted: { pinned: false, [`group:${group.id}`]: true },
			});
		});

		test('Collapse All persists custom groups without dropping state it does not render', () => {
			const harness = createHarness({ 'workspace:file:///elsewhere': false });
			const list = harness.createList();
			list.collapseAllSections();
			list.dispose();

			const restarted = harness.createList();
			const afterRestart = harness.isGroupExpanded(restarted);
			restarted.dispose();

			assert.deepStrictEqual({ afterRestart, persisted: harness.persisted() }, {
				afterRestart: 'false',
				persisted: { 'workspace:file:///elsewhere': false, [`group:${group.id}`]: true, recent: true },
			});
		});
	});

	suite('comparison groups', () => {
		const group: ISessionGroup = { id: 'comparison-group', name: 'Compare: Improve the picker', createdAt: 1 };

		function renderComparison(verdict?: ISessionComparison['verdict'], sessionVariant: 'all' | 'attempt1' | 'none' | 'launching' = 'all', pinnedSessionIds: ReadonlySet<string> = new Set(), includeOrdinaryWorkspace = false, grouping = SessionsGrouping.Workspace, sectionParent?: ISessionGroup, configure?: (harness: ReturnType<typeof createListHarness>) => void, mixedHarnesses = false, presentation: { compact?: boolean; phone?: boolean } = {}) {
			const attempt1 = createTestSession('Stored attempt one', { resourceId: 'attempt-1', status: SessionStatus.InProgress });
			const attempt2 = createTestSession('Stored attempt two', { resourceId: 'attempt-2', status: SessionStatus.InProgress, application: 'github/cli' });
			const judge = createTestSession('Judge', { resourceId: 'judge', status: SessionStatus.InProgress, application: 'github/cli' });
			const synthesis = createTestSession('Synthesis', { resourceId: 'synthesis', status: SessionStatus.InProgress });
			const comparison: ISessionComparison = {
				id: 'comparison-1',
				groupId: group.id,
				title: 'Improve the picker',
				createdAt: 1,
				workspace: URI.parse('file:///workspace'),
				prompt: 'Improve the picker',
				launching: sessionVariant === 'launching' ? true : undefined,
				verdict,
				participants: sessionVariant === 'launching' ? [
					{
						id: 'participant-1',
						role: SessionComparisonParticipantRole.Attempt,
						harness: { providerId: 'test', sessionTypeId: 'copilot', label: 'Copilot', modelLabel: 'Claude Opus 5' },
						sessionResource: attempt1.session.resource,
					},
					{
						id: 'participant-2',
						role: SessionComparisonParticipantRole.Attempt,
						harness: {
							providerId: 'test',
							sessionTypeId: mixedHarnesses ? 'claude' : 'copilot',
							label: mixedHarnesses ? 'Claude' : 'Copilot',
							modelConfiguration: { tier: 'balanced' },
							modelConfigurationLabel: 'Balance',
						},
						sessionResource: attempt2.session.resource,
					},
				] : [
					{
						id: 'participant-1',
						role: SessionComparisonParticipantRole.Attempt,
						harness: { providerId: 'test', sessionTypeId: 'copilot', label: 'Copilot', modelLabel: 'Claude Opus 5' },
						sessionResource: attempt1.session.resource,
					},
					{
						id: 'participant-2',
						role: SessionComparisonParticipantRole.Attempt,
						harness: {
							providerId: 'test',
							sessionTypeId: mixedHarnesses ? 'claude' : 'copilot',
							label: mixedHarnesses ? 'Claude' : 'Copilot',
							modelConfiguration: { tier: 'balanced' },
							modelConfigurationLabel: 'Balance',
						},
						sessionResource: attempt2.session.resource,
					},
					{
						id: 'judge',
						role: SessionComparisonParticipantRole.Judge,
						harness: { providerId: 'test', sessionTypeId: 'copilot', label: 'Copilot', modelLabel: 'Claude Opus 5' },
						sessionResource: judge.session.resource,
					},
					{
						id: 'synthesis',
						role: SessionComparisonParticipantRole.Synthesis,
						harness: { providerId: 'test', sessionTypeId: 'copilot', label: 'Copilot', modelLabel: 'Claude Opus 5' },
						sessionResource: synthesis.session.resource,
					},
				],
			};
			const sessions = sessionVariant === 'all'
				? [attempt2.session, synthesis.session, judge.session, attempt1.session]
				: sessionVariant === 'attempt1'
					? [synthesis.session, judge.session, attempt1.session]
					: sessionVariant === 'launching'
						? [attempt1.session]
						: [];
			const memberships = new Map(sessions.map(session => [session.sessionId, group.id]));
			if (includeOrdinaryWorkspace) {
				sessions.push(createTestSession('Ordinary', { resourceId: 'ordinary', workspaceLabel: 'Zebra' }).session);
			}
			const sectionId = grouping === SessionsGrouping.Environment ? 'environment:local' : 'workspace:Workspace';
			const harness = createListHarness(disposables, sessions, {
				groups: sectionParent ? [group, sectionParent] : [group],
				sectionMemberships: sectionParent ? new Map([[sectionId, sectionParent.id]]) : undefined,
				memberships, comparisons: [comparison], pinnedSessionIds,
			});
			harness.instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
				override isMotionReduced(): boolean { return false; }
			});
			configure?.(harness);
			const contextMenus: (readonly IAction[])[] = [];
			harness.instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
				override showContextMenu(delegate: IContextMenuDelegate): void {
					contextMenus.push(delegate.getActions());
				}
			});
			harness.managementService.onDidArchive = archived => [attempt1, attempt2, judge, synthesis]
				.find(participant => participant.session === archived)?.isArchived.set(true, undefined);
			if (presentation.phone) {
				harness.instantiationService.stub(IContextKeyService, harness.store.add(new ContextKeyService(new TestConfigurationService())));
				IsPhoneLayoutContext.bindTo(harness.instantiationService.get(IContextKeyService)).set(true);
			}
			const container = harness.createContainer();
			if (presentation.phone) {
				container.classList.add('agent-sessions-workbench', 'phone-layout');
			}
			for (const size of [2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36]) {
				container.style.setProperty(`--vscode-spacing-size${size * 10}`, `${size}px`);
			}
			container.style.setProperty('--vscode-descriptionForeground', 'rgb(128, 128, 128)');
			container.style.setProperty('--vscode-tree-indentGuidesStroke', 'rgb(128, 128, 128)');
			container.style.setProperty('--vscode-cornerRadius-small', '4px');
			container.style.setProperty('--vscode-strokeThickness', '1px');
			const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
				grouping: () => grouping,
				sorting: () => SessionsSorting.Created,
				compact: () => presentation.compact ?? false,
				onSessionOpen: () => { },
			}));
			list.filters.setExcluded({ kind: 'application', environment: 'local', id: 'github/cli' }, false);
			list.layout(400, 400);
			return { attempt1, attempt2, judge, synthesis, container, harness, list, contextMenus };
		}

		for (const outcome of ['success', 'cancelled', 'disabled', 'reduced motion', 'failure'] as const) {
			test(`group Mark All as Done confetti: ${outcome}`, async () => {
				const { container, harness, list, attempt1, attempt2, judge, synthesis } = renderComparison(undefined, 'all', new Set(), false, SessionsGrouping.Workspace, undefined, harness => {
					const configurationService = harness.instantiationService.get(IConfigurationService) as TestConfigurationService;
					void configurationService.setUserConfiguration(ChatSessionArchiveActionWordingSettingId, ChatSessionArchiveActionWording.MarkAsDone);
					harness.instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
						override isMotionReduced(): boolean { return outcome === 'reduced motion'; }
					}());
					harness.instantiationService.stub(IContextKeyService, harness.store.add(new ContextKeyService(harness.instantiationService.get(IConfigurationService))));
					harness.instantiationService.stub(IMenuService, harness.store.add(harness.instantiationService.createInstance(MenuService)));
					harness.store.add(harness.instantiationService.createInstance(SessionsArchiveActionsContribution));
				});
				const configurationService = harness.instantiationService.get(IConfigurationService) as TestConfigurationService;
				await configurationService.setUserConfiguration(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING, outcome !== 'disabled');
				const executed = new DeferredPromise<void>();
				sinon.stub(harness.commandService, 'executeCommand').callsFake(async commandId => {
					assert.strictEqual(commandId, ARCHIVE_SESSION_GROUP_COMMAND_ID);
					if (outcome === 'failure') {
						await executed.complete();
						throw new Error('Archive failed');
					}
					if (outcome !== 'cancelled') {
						for (const participant of [attempt1, attempt2, judge, synthesis]) {
							participant.isArchived.set(true, undefined);
						}
						list.dispose();
					}
					await executed.complete();
					return undefined;
				});
				await timeout(100);
				const button = container.querySelector<HTMLElement>('.session-comparison-group .action-label[aria-label="Mark All as Done"]');
				assert.ok(button, container.querySelector('.session-comparison-group')?.outerHTML);
				button.click();
				await executed.p;
				await timeout(0);
				const overlay = document.querySelector('.animation-overlay');
				disposables.add(toDisposable(() => overlay?.remove()));

				assert.deepStrictEqual({ animated: !!overlay, buttonConnected: button.isConnected }, {
					animated: outcome === 'success',
					buttonConnected: outcome === 'cancelled' || outcome === 'failure',
				});
			});
		}

		for (const grouping of [SessionsGrouping.Workspace, SessionsGrouping.Environment]) {
			test(`includes comparison sessions once in a nested ${grouping} section and its parent's bulk actions`, async () => {
				const parent: ISessionGroup = { id: 'parent', name: 'Work', createdAt: 0 };
				const { container, harness, list, contextMenus, attempt1, attempt2 } = renderComparison(undefined, 'all', new Set(), false, grouping, parent);
				harness.managementService.sessions = harness.managementService.sessions.map(session => session === attempt2.session ? {
					...session, environment: 'cloud',
				} : session);
				attempt1.isRead.set(false, undefined);
				attempt2.isRead.set(false, undefined);
				list.refresh();
				const parentRow = [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
					.find(row => row.querySelector('.session-section-label')?.textContent === parent.name)!;
				parentRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
				await contextMenus.at(-1)!.find(action => action.id === 'sessionsViewPane.markAllInSectionRead')!.run();

				assert.deepStrictEqual({
					parent: parentRow.getAttribute('aria-label'),
					comparisonLevel: container.querySelector('.session-comparison-group')?.closest('.monaco-list-row')?.getAttribute('aria-level'),
					comparisonDepth: container.querySelector<HTMLElement>('.session-comparison-group')?.style.getPropertyValue('--session-group-depth'),
					sessions: list.getVisibleSessions().map(session => session.sessionId).sort(),
					read: harness.managementService.readSessions.map(session => session.sessionId).sort(),
				}, {
					parent: 'Work, 4',
					comparisonLevel: '3',
					comparisonDepth: '1',
					sessions: ['attempt-1', 'attempt-2', 'judge', 'synthesis'],
					read: ['attempt-1', 'attempt-2'],
				});
			});
		}

		test('keeps comparison groups visible under their environment without any ungrouped sessions', () => {
			const { container, list } = renderComparison(undefined, 'all', new Set(), false, SessionsGrouping.Environment);

			assert.deepStrictEqual({
				sections: [...container.querySelectorAll('.monaco-list-row[aria-level="1"] .session-section-label')].map(label => label.textContent),
				comparisonLevel: container.querySelector('.session-comparison-group')?.closest('.monaco-list-row')?.getAttribute('aria-level'),
				sessionCount: list.getVisibleSessions().length,
			}, { sections: ['This Computer'], comparisonLevel: '2', sessionCount: 4 });
		});

		test('uses attention wording for blocked comparison participants', () => {
			const { attempt1, attempt2, judge, container } = renderComparison();
			const readPresentation = () => ({
				summary: container.querySelector('.session-comparison-group .session-group-description')?.textContent,
				attempts: [...container.querySelectorAll('.session-comparison-attempt')]
					.map(attempt => attempt.querySelector('.session-comparison-attempt-status.visible')?.textContent),
			});

			attempt1.status.set(SessionStatus.NeedsInput, undefined);
			const oneAttempt = readPresentation();
			attempt2.status.set(SessionStatus.NeedsInput, undefined);
			const bothAttempts = readPresentation();
			attempt1.status.set(SessionStatus.Completed, undefined);
			attempt2.status.set(SessionStatus.Completed, undefined);
			judge.status.set(SessionStatus.NeedsInput, undefined);
			const judgeWaiting = readPresentation();

			assert.deepStrictEqual({ oneAttempt, bothAttempts, judgeWaiting }, {
				oneAttempt: {
					summary: 'Comparison · 1 attempt needs attention',
					attempts: ['Attention needed', undefined],
				},
				bothAttempts: {
					summary: 'Comparison · 2 attempts need attention',
					attempts: [undefined, undefined],
				},
				judgeWaiting: {
					summary: 'Comparison · Judge needs attention',
					attempts: [undefined, undefined],
				},
			});
		});

		test('renders synthesis and Judge before connected compact attempts', () => {
			const { attempt1, attempt2, container } = renderComparison();
			const parent = container.querySelector<HTMLElement>('.session-comparison-group');
			const workspace = [...container.querySelectorAll<HTMLElement>('.session-section')]
				.find(section => section.querySelector('.session-section-label')?.textContent === 'Workspace');
			const attempts = [...container.querySelectorAll<HTMLElement>('.session-comparison-attempt')];
			const participants = [...container.querySelectorAll<HTMLElement>('.session-item')];
			const independentParticipants = participants.filter(participant => !participant.classList.contains('session-comparison-attempt'));
			const judge = independentParticipants.find(participant => participant.querySelector('.session-title')?.textContent === 'Judge');
			assert.ok(parent && workspace && judge);

			assert.deepStrictEqual({
				hierarchy: {
					workspaceLevel: workspace.closest('.monaco-list-row')?.getAttribute('aria-level'),
					workspaceAriaLabel: workspace.closest('.monaco-list-row')?.getAttribute('aria-label'),
					comparisonLevel: parent.closest('.monaco-list-row')?.getAttribute('aria-level'),
					attemptLevels: attempts.map(attempt => attempt.closest('.monaco-list-row')?.getAttribute('aria-level')),
				},
				parent: {
					title: parent.querySelector('.session-section-label')?.textContent,
					summary: parent.querySelector('.session-group-description')?.textContent,
					layersIcon: parent.querySelector('.session-section-icon')?.classList.contains('codicon-layers'),
					ariaLabel: parent.closest('.monaco-list-row')?.getAttribute('aria-label'),
					connector: parent.closest('.monaco-list-row')?.getAttribute('data-session-group-connector'),
					childOrder: [...parent.children].map(child => child.className),
					labelMaxWidth: mainWindow.getComputedStyle(parent.querySelector<HTMLElement>('.session-section-label')!).maxWidth,
					labelsOverflow: mainWindow.getComputedStyle(parent.querySelector<HTMLElement>('.session-group-labels')!).overflow,
				},
				order: participants.map(participant => participant.querySelector('.session-title')?.textContent),
				attempts: attempts.map(attempt => {
					const connectorIcon = attempt.querySelector<HTMLElement>('.session-icon')!;
					const connector = attempt.querySelector<HTMLElement>('.session-group-connector')!;
					const connectorBranchStyle = mainWindow.getComputedStyle(connector, '::before');
					const connectorElbowStyle = mainWindow.getComputedStyle(connector, '::after');
					return {
						title: attempt.querySelector('.session-title')?.textContent,
						ariaLabel: attempt.closest('.monaco-list-row')?.getAttribute('aria-label'),
						status: attempt.querySelector('.session-comparison-attempt-status.visible')?.textContent,
						hasSpinner: !!connectorIcon.querySelector('.monaco-pixel-spinner'),
						details: attempt.querySelector('.session-details-row')?.textContent,
						height: attempt.closest<HTMLElement>('.monaco-list-row')?.style.height,
						connectorVisibility: mainWindow.getComputedStyle(connectorIcon).visibility,
						connector: attempt.getAttribute('data-session-group-connector'),
						connectorBranchDisplay: connectorBranchStyle.display,
						connectorStroke: connectorElbowStyle.borderLeftWidth,
						connectorColor: connectorElbowStyle.borderLeftColor,
						connectorElbow: {
							topStroke: connectorElbowStyle.borderTopWidth,
							bottomStroke: connectorElbowStyle.borderBottomWidth,
							topLeftRadius: connectorElbowStyle.borderTopLeftRadius,
							bottomLeftRadius: connectorElbowStyle.borderBottomLeftRadius,
						},
					};
				}),
				judge: {
					title: judge.querySelector('.session-title')?.textContent,
					isAttempt: judge.classList.contains('session-comparison-attempt'),
					inProgress: judge.classList.contains('in-progress'),
					hasProgressIndicator: judge.querySelector('.session-icon')?.childElementCount === 1,
					connector: judge.getAttribute('data-session-group-connector'),
				},
				independentParticipantConnectors: independentParticipants.map(participant => participant.getAttribute('data-session-group-connector')),
			}, {
				hierarchy: {
					workspaceLevel: '1',
					workspaceAriaLabel: 'Workspace, 4',
					comparisonLevel: '2',
					attemptLevels: ['3', '3'],
				},
				parent: {
					title: 'Improve the picker',
					summary: 'Comparison · 2 attempts working',
					layersIcon: true,
					ariaLabel: 'Improve the picker, Comparison · 2 attempts working',
					connector: null,
					childOrder: [
						'session-section-chevron collapsible codicon codicon-chevron-down',
						'session-section-icon codicon codicon-layers',
						'session-section-label-container session-group-labels',
						'session-group-input',
						'session-section-toolbar has-no-actions',
					],
					labelMaxWidth: '100%',
					labelsOverflow: 'hidden',
				},
				order: ['Synthesis', 'Judge', 'Claude Opus 5', 'Balance'],
				attempts: [
					{ title: 'Claude Opus 5', ariaLabel: 'Claude Opus 5, State: In Progress', status: undefined, hasSpinner: true, details: '', height: '30px', connectorVisibility: 'visible', connector: 'middle', connectorBranchDisplay: 'block', connectorStroke: '1px', connectorColor: 'rgb(128, 128, 128)', connectorElbow: { topStroke: '0px', bottomStroke: '1px', topLeftRadius: '0px', bottomLeftRadius: '4px' } },
					{ title: 'Balance', ariaLabel: 'Balance, State: In Progress', status: undefined, hasSpinner: true, details: '', height: '30px', connectorVisibility: 'visible', connector: 'last', connectorBranchDisplay: 'none', connectorStroke: '1px', connectorColor: 'rgb(128, 128, 128)', connectorElbow: { topStroke: '0px', bottomStroke: '1px', topLeftRadius: '0px', bottomLeftRadius: '4px' } },
				],
				judge: { title: 'Judge', isAttempt: false, inProgress: true, hasProgressIndicator: true, connector: 'middle' },
				independentParticipantConnectors: ['middle', 'middle'],
			});

			attempt1.status.set(SessionStatus.Completed, undefined);
			assert.deepStrictEqual({
				statuses: attempts.map(attempt => attempt.querySelector('.session-comparison-attempt-status.visible')?.textContent),
				ariaLabels: attempts.map(attempt => attempt.closest('.monaco-list-row')?.getAttribute('aria-label')),
			}, {
				statuses: [undefined, undefined],
				ariaLabels: [
					'Claude Opus 5, updated now, State: Completed, in Workspace',
					'Balance, State: In Progress',
				],
			});
			attempt2.status.set(SessionStatus.Completed, undefined);
			assert.deepStrictEqual({
				summary: parent.querySelector('.session-group-description')?.textContent,
				statuses: attempts.map(attempt => attempt.querySelector('.session-comparison-attempt-status.visible')?.textContent),
			}, {
				summary: 'Comparison · Reviewing attempts',
				statuses: [undefined, undefined],
			});
		});

		for (const presentation of [
			{ compact: false, phone: false },
			{ compact: true, phone: false },
			{ compact: false, phone: true },
			{ compact: true, phone: true },
		]) {
			const mode = `compact: ${presentation.compact}, phone: ${presentation.phone}`;

			if (!presentation.phone) {
				test(`aligns disclosure controls for every comparison participant (${mode})`, () => {
					const { container } = renderComparison(undefined, 'all', new Set(), false, SessionsGrouping.Workspace, undefined, harness => {
						harness.managementService.sessions = harness.managementService.sessions.map(session => {
							const nested = buildTestSession({ id: session.sessionId, title: session.title.get(), chats: [{ id: 'peer', title: 'Nested chat' }] });
							return {
								...session,
								chats: nested.session.chats,
								mainChat: nested.session.mainChat,
								capabilities: nested.session.capabilities,
							};
						});
					}, false, presentation);
					const participants = [...container.querySelectorAll<HTMLElement>('.session-item')];

					assert.deepStrictEqual(participants.map(participant => {
						const row = participant.closest<HTMLElement>('.monaco-list-row')!;
						const twistie = row.querySelector<HTMLElement>('.monaco-tl-twistie')!;
						const icon = participant.querySelector<HTMLElement>('.session-icon')!;
						row.classList.add('hovered');
						const appearance = {
							title: participant.querySelector('.session-title')?.textContent,
							leftOffset: twistie.getBoundingClientRect().left - icon.getBoundingClientRect().left,
							topOffset: twistie.getBoundingClientRect().top - icon.getBoundingClientRect().top,
							opacity: mainWindow.getComputedStyle(twistie).opacity,
							pointerEvents: mainWindow.getComputedStyle(twistie).pointerEvents,
						};
						row.classList.remove('hovered');
						return appearance;
					}), ['Synthesis', 'Judge', 'Claude Opus 5', 'Balance'].map(title => ({
						title, leftOffset: 0, topOffset: 0, opacity: '1', pointerEvents: 'auto',
					})));
				});
			}

			test(`keeps comparison connectors clear of participant status icons (${mode})`, () => {
				const { container } = renderComparison(undefined, 'all', new Set(), false, SessionsGrouping.Workspace, undefined, undefined, false, presentation);
				const participants = [...container.querySelectorAll<HTMLElement>('.session-item')];

				assert.deepStrictEqual(participants.map(participant => {
					const connector = participant.querySelector<HTMLElement>('.session-group-connector')!;
					const elbow = mainWindow.getComputedStyle(connector, '::after');
					const icon = participant.querySelector<HTMLElement>('.session-icon')!;
					const iconLeft = icon.getBoundingClientRect().left - participant.getBoundingClientRect().left;
					return {
						inset: mainWindow.getComputedStyle(participant).paddingLeft,
						connectorBeforeIcon: parseFloat(elbow.left) + parseFloat(elbow.width) <= iconLeft,
						hasSpinner: !!icon.querySelector('.monaco-pixel-spinner'),
						decorative: connector.getAttribute('aria-hidden'),
						pointerEvents: mainWindow.getComputedStyle(connector).pointerEvents,
					};
				}), Array.from({ length: 4 }, () => ({
					inset: '36px',
					connectorBeforeIcon: true,
					hasSpinner: true,
					decorative: 'true',
					pointerEvents: 'none',
				})));
			});

			test(`continues the comparison trunk through an expanded middle participant's chats (${mode})`, () => {
				const { attempt1, container, harness, list } = renderComparison(undefined, 'all', new Set(), false, SessionsGrouping.Workspace, undefined, undefined, false, presentation);
				const nested = buildTestSession({ id: 'nested-middle', title: 'Middle participant', chats: [{ id: 'one', title: 'First chat' }, { id: 'two', title: 'Last chat' }] });
				const session: ISession = {
					...attempt1.session,
					chats: nested.session.chats,
					mainChat: nested.session.mainChat,
					capabilities: nested.session.capabilities,
				};
				harness.managementService.sessions = harness.managementService.sessions.map(candidate => candidate === attempt1.session ? session : candidate);
				list.refresh();
				list.layout(600, 400);
				list.setItemCollapsed({ session: session.resource }, false);
				list.setFocusedItem({ session: session.resource });
				const chats = [...container.querySelectorAll<HTMLElement>('.session-comparison-chat')];

				assert.deepStrictEqual(chats.map(chat => {
					const trunk = chat.querySelector<HTMLElement>('.session-comparison-chat-connector');
					const style = trunk && mainWindow.getComputedStyle(trunk);
					return {
						title: chat.querySelector('.session-chat-title')?.textContent,
						left: style?.left,
						top: style?.top,
						bottom: style?.bottom,
						border: style?.borderLeftWidth,
						pointerEvents: style?.pointerEvents,
						decorative: trunk?.getAttribute('aria-hidden'),
					};
				}), ['First chat', 'Last chat'].map(title => ({
					title, left: '20px', top: '0px', bottom: '-2px', border: '1px', pointerEvents: 'none', decorative: 'true',
				})));
			});

			test(`keeps an expanded participant's incoming connector separate from its chat guide (${mode})`, () => {
				const { attempt2, judge, container, harness, list } = renderComparison(undefined, 'all', new Set(), false, SessionsGrouping.Workspace, undefined, undefined, false, presentation);
				const nested = buildTestSession({ id: 'nested-attempt', title: 'Attempt', chats: [{ id: 'peer', title: 'Nested chat' }] });
				const session: ISession = {
					...attempt2.session,
					chats: nested.session.chats,
					mainChat: nested.session.mainChat,
					capabilities: nested.session.capabilities,
				};
				harness.managementService.sessions = harness.managementService.sessions.map(candidate => candidate === attempt2.session ? session : candidate);
				list.refresh();
				list.layout(600, 400);
				list.setItemCollapsed({ session: session.resource }, false);
				list.setFocusedItem({ session: judge.session.resource });
				const participant = container.querySelector<HTMLElement>('.session-item[data-session-group-connector="last"]')!;
				const connector = participant.querySelector<HTMLElement>('.session-group-connector')!;
				const appearance = () => {
					const incoming = mainWindow.getComputedStyle(connector, '::after');
					const outgoing = mainWindow.getComputedStyle(participant, '::after');
					return {
						incoming: { top: incoming.top, opacity: incoming.opacity, borderBottom: incoming.borderBottomWidth },
						outgoing: { top: outgoing.top, opacity: outgoing.opacity, borderBottom: outgoing.borderBottomWidth },
					};
				};
				const resting = appearance();
				list.setFocusedItem({ session: session.resource });
				const focused = appearance();
				list.setFocusedItem({ session: judge.session.resource });

				const chat = container.querySelector<HTMLElement>('.session-comparison-chat')!;
				const chatIcon = chat.querySelector<HTMLElement>('.session-chat-icon')!;
				const elbow = mainWindow.getComputedStyle(chat, '::after');
				const chatIconLeft = chatIcon.getBoundingClientRect().left - chat.getBoundingClientRect().left;
				assert.deepStrictEqual({
					outgoingGuide: mainWindow.getComputedStyle(participant, '::after').left,
					chatTrunk: mainWindow.getComputedStyle(chat, '::before').left,
					chatElbow: elbow.left,
					guideBeforeIcon: parseFloat(elbow.left) + parseFloat(elbow.width) <= chatIconLeft,
					outerTrunk: chat.querySelector('.session-comparison-chat-connector'),
				}, {
					outgoingGuide: presentation.phone ? '20px' : '44px',
					chatTrunk: presentation.phone ? '20px' : '44px',
					chatElbow: presentation.phone ? '20px' : '44px',
					guideBeforeIcon: true,
					outerTrunk: null,
				});

				if (!presentation.phone) {
					const row = participant.closest<HTMLElement>('.monaco-list-row')!;
					const twistie = row.querySelector<HTMLElement>('.session-comparison-attempt-twistie')!;
					const icon = participant.querySelector<HTMLElement>('.session-icon')!;
					row.classList.add('hovered');
					assert.deepStrictEqual({
						outgoingGuide: mainWindow.getComputedStyle(participant, '::after').left,
						chatTrunk: mainWindow.getComputedStyle(chat, '::before').left,
						chatElbow: mainWindow.getComputedStyle(chat, '::after').left,
						chatIndent: mainWindow.getComputedStyle(chat).paddingLeft,
						twistieLeft: twistie.getBoundingClientRect().left,
						twistieTop: twistie.getBoundingClientRect().top,
						twistieOpacity: mainWindow.getComputedStyle(twistie).opacity,
						twistiePointerEvents: mainWindow.getComputedStyle(twistie).pointerEvents,
						iconVisibility: mainWindow.getComputedStyle(icon).visibility,
					}, {
						outgoingGuide: '44px',
						chatTrunk: '44px',
						chatElbow: '44px',
						chatIndent: '60px',
						twistieLeft: icon.getBoundingClientRect().left,
						twistieTop: icon.getBoundingClientRect().top,
						twistieOpacity: '1',
						twistiePointerEvents: 'auto',
						iconVisibility: 'hidden',
					});
					row.classList.remove('hovered');
				}

				const incoming = { top: '0px', opacity: '1', borderBottom: '1px' };
				const outgoing = { top: presentation.phone ? '32px' : presentation.compact ? '20px' : '28px', opacity: '0', borderBottom: '0px' };
				assert.deepStrictEqual({
					expanded: participant.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
					chats: [...container.querySelectorAll('.session-chat-title')].map(title => title.textContent),
					resting,
					focused,
					unfocused: appearance(),
				}, {
					expanded: 'true',
					chats: ['Nested chat'],
					resting: { incoming, outgoing },
					focused: { incoming, outgoing: { ...outgoing, opacity: '1' } },
					unfocused: { incoming, outgoing },
				});
			});
		}

		test('keeps harness names when attempts use different harnesses', () => {
			const { container } = renderComparison(undefined, 'all', new Set(), false, SessionsGrouping.Workspace, undefined, undefined, true);
			assert.deepStrictEqual(
				[...container.querySelectorAll('.session-comparison-attempt .session-title')].map(title => title.textContent),
				['Copilot · Claude Opus 5', 'Claude · Balance'],
			);
		});

		test('keeps the comparison icon quiet at rest and aligned with the title', () => {
			const { container } = renderComparison();
			const parent = container.querySelector<HTMLElement>('.session-comparison-group')!;
			const chevron = parent.querySelector<HTMLElement>('.session-section-chevron')!;
			const label = parent.querySelector<HTMLElement>('.session-section-label')!;
			const icon = parent.querySelector<HTMLElement>('.session-section-icon')!;
			assert.deepStrictEqual({
				chevronOpacity: mainWindow.getComputedStyle(chevron).opacity,
				labelWeight: mainWindow.getComputedStyle(label).fontWeight,
				iconTop: icon.getBoundingClientRect().top,
				labelTop: label.getBoundingClientRect().top,
				height: parent.getBoundingClientRect().height,
				rowHeight: parent.closest('.monaco-list-row')!.getBoundingClientRect().height,
				connector: mainWindow.getComputedStyle(parent, '::after').borderLeftWidth,
			}, {
				chevronOpacity: '0',
				labelWeight: '400',
				iconTop: label.getBoundingClientRect().top,
				labelTop: label.getBoundingClientRect().top,
				height: 44,
				rowHeight: 44,
				connector: '1px',
			});
		});

		test('hides the parent connector when the comparison is collapsed', () => {
			const { container } = renderComparison();
			const parent = container.querySelector<HTMLElement>('.session-comparison-group')!;
			parent.querySelector('.session-section-chevron')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			assert.deepStrictEqual({
				expanded: parent.closest('.monaco-list-row')!.getAttribute('aria-expanded'),
				connector: mainWindow.getComputedStyle(parent, '::after').display,
				participants: container.querySelectorAll('.session-item').length,
			}, {
				expanded: 'false',
				connector: 'none',
				participants: 0,
			});
		});

		test('does not render comparison attempt connectors before sessions hydrate', () => {
			const { container } = renderComparison(undefined, 'none');
			const parent = container.querySelector<HTMLElement>('.session-comparison-group');

			assert.deepStrictEqual({
				title: parent?.querySelector('.session-section-label')?.textContent,
				summary: parent?.querySelector('.session-group-description')?.textContent,
				connectors: container.querySelectorAll('[data-session-group-connector]').length,
			}, {
				title: 'Improve the picker',
				summary: 'Comparison · 2 attempts',
				connectors: 0,
			});
		});

		test('sorts comparison-only workspaces with ordinary workspace sections', () => {
			const ordinary = createTestSession('Ordinary', { resourceId: 'ordinary', workspaceLabel: 'Zebra' }).session;
			const attempt = createTestSession('Attempt', { resourceId: 'apple-attempt', workspaceLabel: 'Apple' }).session;
			const comparison: ISessionComparison = {
				id: 'apple-comparison',
				groupId: group.id,
				title: 'Apple comparison',
				createdAt: 1,
				workspace: URI.parse('file:///apple'),
				prompt: 'Implement',
				participants: [{
					id: 'attempt',
					role: SessionComparisonParticipantRole.Attempt,
					harness: { providerId: 'test', sessionTypeId: 'copilot', label: 'Copilot' },
					sessionResource: attempt.resource,
				}],
			};
			const harness = createListHarness(disposables, [ordinary, attempt], {
				groups: [group],
				memberships: new Map([[attempt.sessionId, group.id]]),
				comparisons: [comparison],
			});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);

			assert.deepStrictEqual(
				[...container.querySelectorAll<HTMLElement>('.monaco-list-row[aria-level="1"] .session-section-label')].map(label => label.textContent),
				['Apple', 'Zebra'],
			);
		});

		test('keeps folderless and same-named workspace comparisons in separate Chats sections', () => {
			const attempts = ['one', 'two'].map(resourceId => createTestSession(resourceId, { resourceId, isQuickChat: true }).session);
			const folderlessComparison: ISessionComparison = {
				id: 'chat-comparison', groupId: group.id, title: 'Compare ideas', createdAt: 1, prompt: 'Compare ideas',
				participants: attempts.map(session => ({
					id: session.sessionId,
					role: SessionComparisonParticipantRole.Attempt,
					harness: { providerId: 'test', sessionTypeId: 'copilot', label: 'Copilot' },
					sessionResource: session.resource,
				})),
			};
			const workspaceGroup: ISessionGroup = { id: 'workspace-comparison-group', name: 'Workspace comparison', createdAt: 2 };
			const workspaceAttempt = createTestSession('workspace-attempt', { resourceId: 'workspace-attempt', workspaceLabel: 'Chats' }).session;
			const workspaceComparison: ISessionComparison = {
				id: 'workspace-comparison', groupId: workspaceGroup.id, title: 'Workspace comparison', createdAt: 2,
				workspace: URI.parse('file:///chats'), prompt: 'Compare workspace ideas',
				participants: [{
					id: workspaceAttempt.sessionId,
					role: SessionComparisonParticipantRole.Attempt,
					harness: { providerId: 'test', sessionTypeId: 'copilot', label: 'Copilot' },
					sessionResource: workspaceAttempt.resource,
				}],
			};
			const harness = createListHarness(disposables, [...attempts, workspaceAttempt], {
				groups: [group, workspaceGroup],
				memberships: new Map([
					...attempts.map(session => [session.sessionId, group.id] as const),
					[workspaceAttempt.sessionId, workspaceGroup.id],
				]),
				comparisons: [folderlessComparison, workspaceComparison],
			});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			for (const row of container.querySelectorAll<HTMLElement>('.monaco-list-row[aria-level="1"]')) {
				if (row.getAttribute('aria-expanded') === 'false') {
					row.querySelector<HTMLElement>('.session-section')?.click();
				}
			}
			const sections: { label: string | undefined; comparisons: string[] }[] = [];
			for (const row of container.querySelectorAll<HTMLElement>('.monaco-list-row')) {
				if (row.getAttribute('aria-level') === '1') {
					sections.push({
						label: row.querySelector('.session-section-label')?.textContent,
						comparisons: [],
					});
				} else if (row.getAttribute('aria-level') === '2' && row.querySelector('.session-comparison-group')) {
					sections.at(-1)?.comparisons.push(row.querySelector('.session-section-label')?.textContent ?? '');
				}
			}
			assert.deepStrictEqual({
				sections,
				comparisons: container.querySelectorAll('.session-comparison-group').length,
				attempts: container.querySelectorAll('.session-comparison-attempt').length,
				levels: [...container.querySelectorAll('.session-comparison-attempt')].map(attempt => attempt.closest('.monaco-list-row')?.getAttribute('aria-level')),
			}, {
				sections: [
					{ label: 'Chats', comparisons: ['Compare ideas'] },
					{ label: 'Chats', comparisons: ['Workspace comparison'] },
				],
				comparisons: 2,
				attempts: 3,
				levels: ['3', '3', '3'],
			});
		});

		test('only allows top-level comparison headers to be dragged', () => {
			const workspace = renderComparison(undefined, 'all', new Set(), true);
			const workspaceSection = [...workspace.container.querySelectorAll<HTMLElement>('.session-section')]
				.find(section => section.querySelector('.session-section-label')?.textContent === 'Zebra');
			const comparisonRow = workspace.container.querySelector('.session-comparison-group')?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(workspaceSection && comparisonRow);
			const dataTransfer = new DataTransfer();
			workspaceSection.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
			const comparisonDragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer });
			comparisonRow.dispatchEvent(comparisonDragOver);
			comparisonRow.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
			workspaceSection.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));

			const dateHarness = createListHarness(disposables, workspace.harness.managementService.sessions, {
				groups: [group],
				memberships: new Map(workspace.harness.managementService.sessions
					.filter(session => session.title.get() !== 'Ordinary')
					.map(session => [session.sessionId, group.id])),
				comparisons: [...workspace.harness.instantiationService.get(ISessionComparisonService).comparisons.get()],
			});
			const dateContainer = dateHarness.createContainer();
			const dateList = dateHarness.store.add(dateHarness.instantiationService.createInstance(SessionsList, dateContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			dateList.layout(300, 400);

			assert.deepStrictEqual({
				workspace: comparisonRow.draggable,
				workspaceSectionReorders: workspace.harness.sectionReorders,
				date: dateContainer.querySelector('.session-comparison-group')?.closest<HTMLElement>('.monaco-list-row')?.draggable,
			}, {
				workspace: false,
				workspaceSectionReorders: [],
				date: true,
			});
		});

		test('shows a pending group without partial attempt rows while attempts launch', () => {
			const { container } = renderComparison(undefined, 'launching');
			const comparison = container.querySelector<HTMLElement>('.session-comparison-group');
			const archive = comparison?.querySelector<HTMLElement>('.session-comparison-archive');

			assert.deepStrictEqual({
				title: comparison?.querySelector('.session-section-label')?.textContent,
				summary: comparison?.querySelector('.session-group-description')?.textContent,
				comparisonGroups: container.querySelectorAll('.session-comparison-group').length,
				sessionRows: container.querySelectorAll('.session-item').length,
				customArchiveButton: !!archive,
			}, {
				title: 'Improve the picker',
				summary: 'Comparison · Starting attempts · 1 of 2 ready',
				comparisonGroups: 1,
				sessionRows: 0,
				customArchiveButton: false,
			});
		});

		test('connects a single hydrated attempt and the other participants to the parent', () => {
			const { container } = renderComparison(undefined, 'attempt1');
			const participants = [...container.querySelectorAll<HTMLElement>('.session-item')];

			assert.deepStrictEqual({
				order: participants.map(participant => participant.querySelector('.session-title')?.textContent),
				attempts: container.querySelectorAll('.session-comparison-attempt').length,
				attemptClasses: participants.map(participant => participant.classList.contains('session-comparison-attempt')),
				connectors: participants.map(participant => participant.getAttribute('data-session-group-connector')),
			}, {
				order: ['Synthesis', 'Judge', 'Claude Opus 5'],
				attempts: 1,
				attemptClasses: [false, false, true],
				connectors: ['middle', 'middle', 'last'],
			});
		});

		test('uses the group toolbar instead of a custom comparison archive button', () => {
			const { attempt1, attempt2, judge, synthesis, container, list } = renderComparison(undefined, 'all', new Set(['attempt-2']));
			attempt1.status.set(SessionStatus.Completed, undefined);
			attempt2.status.set(SessionStatus.NeedsInput, undefined);
			judge.status.set(SessionStatus.NeedsInput, undefined);
			synthesis.status.set(SessionStatus.Completed, undefined);
			list.filters.setExcluded({ kind: 'application', environment: 'local', id: 'github/cli' }, true);
			assert.deepStrictEqual({
				customArchiveButtons: container.querySelectorAll('.session-comparison-archive').length,
				toolbars: container.querySelectorAll('.session-comparison-group .session-section-toolbar .monaco-toolbar').length,
				stopButtons: container.querySelectorAll('.session-comparison-stop-all, .session-comparison-participant-stop').length,
				sessionRows: [...container.querySelectorAll('.session-item')].map(row => row.querySelector('.session-title')?.textContent),
			}, {
				customArchiveButtons: 0,
				toolbars: 1,
				stopButtons: 0,
				sessionRows: ['Synthesis', 'Claude Opus 5'],
			});

		});

		test('allows regrouping sessions from archived comparisons while retaining history lookup', () => {
			const session = createTestSession('Former attempt', { resourceId: 'former-attempt' }).session;
			const targetGroup: ISessionGroup = { id: 'target-group', name: 'Target', createdAt: 2 };
			const comparison: ISessionComparison = {
				id: 'archived-comparison',
				groupId: 'deleted-comparison-group',
				title: 'Archived comparison',
				createdAt: 1,
				archivedAt: 2,
				workspace: URI.parse('file:///workspace'),
				prompt: 'Implement',
				participants: [{
					id: 'attempt',
					role: SessionComparisonParticipantRole.Attempt,
					harness: { providerId: 'test', sessionTypeId: 'copilot', label: 'Copilot' },
					sessionResource: session.resource,
				}],
			};
			const harness = createListHarness(disposables, [session], { groups: [targetGroup], comparisons: [comparison] });
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, harness.createContainer(), {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));

			list.addSessionsToGroup([session], targetGroup.id);

			assert.deepStrictEqual({
				historicalComparisonId: harness.instantiationService.get(ISessionComparisonService).getComparisonForSession(session.resource)?.id,
				addedToGroups: harness.addedToGroups,
			}, {
				historicalComparisonId: comparison.id,
				addedToGroups: [{ groupId: targetGroup.id, sessionIds: [session.sessionId] }],
			});
		});

		test('opens from the parent and reserves disclosure for the chevron', () => {
			const { container, harness } = renderComparison();
			const parent = container.querySelector<HTMLElement>('.session-comparison-group');
			const parentRow = parent?.closest<HTMLElement>('.monaco-list-row');
			const chevron = parent?.querySelector<HTMLElement>('.session-section-chevron');
			assert.ok(parent && parentRow && chevron);
			const expandedBefore = parentRow.getAttribute('aria-expanded');

			parent.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
			parent.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			assert.deepStrictEqual({
				command: harness.commandService.calls.at(-1),
				expanded: parentRow.getAttribute('aria-expanded'),
			}, {
				command: { commandId: OPEN_SESSION_COMPARISON_COMMAND_ID, args: ['comparison-1'] },
				expanded: expandedBefore,
			});

			harness.commandService.calls.length = 0;
			chevron.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			assert.deepStrictEqual({
				commands: harness.commandService.calls,
				expanded: parentRow.getAttribute('aria-expanded'),
				summary: parent.querySelector('.session-group-description')?.textContent,
			}, {
				commands: [],
				expanded: expandedBefore === 'true' ? 'false' : 'true',
				summary: 'Comparison · 2 attempts working',
			});
		});

		test('marks a judged comparison as ready to review', () => {
			const { container } = renderComparison({
				recommendedParticipantId: 'participant-1',
				explanation: 'Attempt 1 is the strongest.',
				conflicts: [],
				attempts: [],
			});
			const parent = container.querySelector<HTMLElement>('.session-comparison-group');

			assert.deepStrictEqual({
				summary: parent?.querySelector('.session-group-description')?.textContent,
				ariaLabel: parent?.closest('.monaco-list-row')?.getAttribute('aria-label'),
			}, {
				summary: 'Comparison · Review ready',
				ariaLabel: 'Improve the picker, Comparison · Review ready',
			});
		});
	});

	suite('drag and drop', () => {

		function sessionRow(container: HTMLElement, title: string): HTMLElement {
			const row = [...container.querySelectorAll<HTMLElement>('.session-title')]
				.find(element => element.textContent === title)
				?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(row, `no session row for "${title}"`);
			return row;
		}

		function sectionRow(container: HTMLElement, label: string): HTMLElement {
			const row = [...container.querySelectorAll<HTMLElement>('.session-section-label')]
				.find(element => element.textContent === label)
				?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(row, `no section row for "${label}"`);
			return row;
		}

		/** Labels of the section/group headers currently highlighted as drop targets. */
		function highlightedHeaders(container: HTMLElement): string[] {
			return [...container.querySelectorAll<HTMLElement>('.session-header-drop-target')]
				.map(header => header.querySelector('.session-section-label')?.textContent ?? '');
		}

		/** Drag `source` onto `target`, returning the headers highlighted while hovering. */
		function drag(source: HTMLElement, target: HTMLElement, container: HTMLElement): string[] {
			const dataTransfer = new DataTransfer();
			source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
			target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
			const highlighted = highlightedHeaders(container);
			target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
			source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
			return highlighted;
		}

		/** Drag `source` below the last row, returning the headers highlighted while hovering. */
		function dragToEmptySpace(source: HTMLElement, container: HTMLElement): string[] {
			const target = container.querySelector<HTMLElement>('.monaco-list-rows');
			assert.ok(target);
			return drag(source, target, container);
		}

		suite('dragging a grouped session out of its group', () => {
			const group: ISessionGroup = { id: 'group-1', name: 'My Group', createdAt: 1 };

			interface IDropHarness {
				readonly container: HTMLElement;
				/** Session ids passed to `removeFromGroup`, in call order. */
				readonly removedFromGroup: string[];
				readonly sortChanges: readonly ISortChangeRecord[];
			}

			function renderGroupedList(sessions: ISession[], memberships: Map<string, string>, groupExternalSessions = false, grouping = SessionsGrouping.Workspace, supportsQuickChats = false): IDropHarness {
				const removedFromGroup: string[] = [];
				const onDidChange = disposables.add(new Emitter<ISessionGroupsChangeEvent>());
				const harness = createListHarness(disposables, sessions, instantiationService => {
					void (instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, groupExternalSessions);
					instantiationService.stub(ISessionGroupsService, new class extends mock<ISessionGroupsService>() {
						override readonly onDidChange = onDidChange.event;
						override getGroups() { return [group]; }
						override getTree() { return new SessionGroupTree([group]); }
						override getGroup(groupId: string) { return groupId === group.id ? group : undefined; }
						override getGroupOfSession(sessionId: string) { return memberships.get(sessionId); }
						override getGroupOfSection() { return undefined; }
						override getSectionAppearance() { return undefined; }
						override getSectionIdsInGroup() { return []; }
						override getChildIds() { return []; }
						override getSessionIdsInGroup(groupId: string) {
							return [...memberships].filter(([, memberGroupId]) => memberGroupId === groupId).map(([sessionId]) => sessionId);
						}
						override removeFromGroup(sessionId: string) {
							if (!memberships.delete(sessionId)) {
								return;
							}
							removedFromGroup.push(sessionId);
							onDidChange.fire({ groupsChanged: false, membershipChanged: new Set([sessionId]) });
						}
					});
					if (supportsQuickChats) {
						void (instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING, true);
						const quickChatProvider = upcastPartial<ISessionsProvider>({ supportsQuickChats: true });
						instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
							override readonly onDidChangeProviders = Event.None;
							override getProviders() { return [quickChatProvider]; }
							override getProvider() { return undefined; }
						});
					}
				});
				const container = harness.createContainer();
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
					grouping: () => grouping,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
				}));
				list.layout(300, 800);
				return { container, removedFromGroup, sortChanges: harness.sortChanges };
			}

			test('drops onto its own workspace section header and leaves the group', () => {
				const grouped = createTestSession('Grouped', { workspaceLabel: 'vscode' }).session;
				const ordinary = createTestSession('Ordinary', { workspaceLabel: 'vscode' }).session;
				const memberships = new Map([[grouped.sessionId, group.id]]);
				const { container, removedFromGroup, sortChanges } = renderGroupedList([grouped, ordinary], memberships);

				const highlighted = drag(sessionRow(container, 'Grouped'), sectionRow(container, 'vscode'), container);

				assert.deepStrictEqual({ highlighted, removedFromGroup, reordered: sortChanges.length }, {
					highlighted: ['vscode'],
					removedFromGroup: [grouped.sessionId],
					reordered: 0,
				});
			});

			test('drops between the sessions of its own workspace section', () => {
				const grouped = createTestSession('Grouped', { workspaceLabel: 'vscode' }).session;
				const ordinary = createTestSession('Ordinary', { workspaceLabel: 'vscode' }).session;
				const memberships = new Map([[grouped.sessionId, group.id]]);
				const { container, removedFromGroup, sortChanges } = renderGroupedList([grouped, ordinary], memberships);

				const highlighted = drag(sessionRow(container, 'Grouped'), sessionRow(container, 'Ordinary'), container);

				assert.deepStrictEqual({
					highlighted,
					removedFromGroup,
					reordered: sortChanges.map(change => [...change.set.keys(), ...change.clear]),
				}, {
					highlighted: ['vscode'],
					removedFromGroup: [grouped.sessionId],
					reordered: [[grouped.sessionId]],
				});
			});

			test('refuses an unrelated workspace section and its sessions', () => {
				const grouped = createTestSession('Grouped', { workspaceLabel: 'vscode' }).session;
				const other = createTestSession('Other', { workspaceLabel: 'monaco' }).session;
				const memberships = new Map([[grouped.sessionId, group.id]]);
				const { container, removedFromGroup, sortChanges } = renderGroupedList([grouped, other], memberships);

				const ontoSection = drag(sessionRow(container, 'Grouped'), sectionRow(container, 'monaco'), container);
				const ontoSession = drag(sessionRow(container, 'Grouped'), sessionRow(container, 'Other'), container);

				assert.deepStrictEqual({ ontoSection, ontoSession, removedFromGroup, reordered: sortChanges.length }, {
					ontoSection: [],
					ontoSession: [],
					removedFromGroup: [],
					reordered: 0,
				});
			});

			test('returns grouped external sessions to External instead of their workspace', () => {
				const grouped = createTestSession('Grouped', { workspaceLabel: 'vscode', isExternal: true }).session;
				const external = createTestSession('External', { workspaceLabel: 'monaco', isExternal: true }).session;
				const regular = createTestSession('Regular', { workspaceLabel: 'vscode' }).session;
				const { container, removedFromGroup, sortChanges } = renderGroupedList([grouped, external, regular], new Map([[grouped.sessionId, group.id]]), true);

				const workspaceTarget = drag(sessionRow(container, 'Grouped'), sectionRow(container, 'vscode'), container);
				const externalTarget = drag(sessionRow(container, 'Grouped'), sectionRow(container, 'External'), container);

				assert.deepStrictEqual({ workspaceTarget, externalTarget, removedFromGroup, reordered: sortChanges.length }, {
					workspaceTarget: [],
					externalTarget: ['External'],
					removedFromGroup: ['Grouped'],
					reordered: 0,
				});
			});

			test('reorders external sessions across workspaces without crossing into regular sessions', () => {
				const first = createTestSession('First', { workspaceLabel: 'vscode', isExternal: true }).session;
				const second = createTestSession('Second', { workspaceLabel: 'monaco', isExternal: true }).session;
				const regular = createTestSession('Regular', { workspaceLabel: 'vscode' }).session;
				const { container, sortChanges } = renderGroupedList([first, second, regular], new Map(), true);

				drag(sessionRow(container, 'First'), sessionRow(container, 'Regular'), container);
				const regularDropChanges = sortChanges.length;
				drag(sessionRow(container, 'First'), sessionRow(container, 'Second'), container);

				assert.deepStrictEqual({
					regularDropChanges,
					reordered: sortChanges.map(change => [...change.set.keys(), ...change.clear]),
				}, {
					regularDropChanges: 0,
					reordered: [['First']],
				});
			});

			test('drops into the date sections when grouping by date', () => {
				const first = createTestSession('First').session;
				const second = createTestSession('Second', { createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }).session;
				const today = createTestSession('Today').session;
				const lastMonth = createTestSession('LastMonth', { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }).session;
				const memberships = new Map([[first.sessionId, group.id], [second.sessionId, group.id]]);
				const { container, removedFromGroup, sortChanges } = renderGroupedList([first, second, today, lastMonth], memberships, false, SessionsGrouping.Date);

				const ontoSession = drag(sessionRow(container, 'First'), sessionRow(container, 'Today'), container);
				const ontoOlderSection = drag(sessionRow(container, 'Second'), sectionRow(container, 'Older'), container);

				assert.deepStrictEqual({
					ontoSession,
					ontoOlderSection,
					removedFromGroup,
					reordered: sortChanges.map(change => [...change.set.keys(), ...change.clear]),
				}, {
					ontoSession: ['Recent'],
					ontoOlderSection: ['Older'],
					removedFromGroup: ['First', 'Second'],
					reordered: [['First'], ['Second']],
				});
			});

			test('returns grouped quick chats to Chats and refuses other sections when grouping by workspace', () => {
				const groupedChat = createTestSession('GroupedChat', { isQuickChat: true }).session;
				const grouped = createTestSession('Grouped').session;
				const chat = createTestSession('Chat', { isQuickChat: true }).session;
				const regular = createTestSession('Regular').session;
				const memberships = new Map([[groupedChat.sessionId, group.id], [grouped.sessionId, group.id]]);
				const { container, removedFromGroup, sortChanges } = renderGroupedList([groupedChat, grouped, chat, regular], memberships, false, SessionsGrouping.Workspace);

				const chatOntoWorkspace = drag(sessionRow(container, 'GroupedChat'), sectionRow(container, 'Workspace'), container);
				const sessionOntoChats = drag(sessionRow(container, 'Grouped'), sectionRow(container, 'Chats'), container);
				const chatOntoChats = drag(sessionRow(container, 'GroupedChat'), sectionRow(container, 'Chats'), container);

				assert.deepStrictEqual({ chatOntoWorkspace, sessionOntoChats, chatOntoChats, removedFromGroup, reordered: sortChanges.length }, {
					chatOntoWorkspace: [],
					sessionOntoChats: [],
					chatOntoChats: ['Chats'],
					removedFromGroup: ['GroupedChat'],
					reordered: 0,
				});
			});

			test('returns grouped quick chats to the date sections when grouping by date', () => {
				const groupedChat = createTestSession('GroupedChat', { isQuickChat: true }).session;
				const regular = createTestSession('Regular').session;
				const memberships = new Map([[groupedChat.sessionId, group.id]]);
				const { container, removedFromGroup } = renderGroupedList([groupedChat, regular], memberships, false, SessionsGrouping.Date, true);

				const chatOntoRecent = drag(sessionRow(container, 'GroupedChat'), sectionRow(container, 'Recent'), container);

				assert.deepStrictEqual({
					chatOntoRecent,
					removedFromGroup,
					hasChatsSection: [...container.querySelectorAll<HTMLElement>('.session-section-label')].some(label => label.textContent === 'Chats'),
				}, {
					chatOntoRecent: ['Recent'],
					removedFromGroup: ['GroupedChat'],
					hasChatsSection: false,
				});
			});

			test('returns the only quick chat to the empty Chats section', () => {
				const groupedChat = createTestSession('GroupedChat', { isQuickChat: true }).session;
				const regular = createTestSession('Regular').session;
				const memberships = new Map([[groupedChat.sessionId, group.id]]);
				const { container, removedFromGroup } = renderGroupedList([groupedChat, regular], memberships, false, SessionsGrouping.Workspace, true);

				const chatOntoChats = drag(sessionRow(container, 'GroupedChat'), sectionRow(container, 'Chats'), container);

				assert.deepStrictEqual({ chatOntoChats, removedFromGroup }, {
					chatOntoChats: ['Chats'],
					removedFromGroup: ['GroupedChat'],
				});
			});
		});

		suite('moving between placements', () => {
			const DAY_MS = 24 * 60 * 60 * 1000;

			function renderList(sessions: ISession[], grouping: SessionsGrouping, options: IListHarnessOptions = {}) {
				const harness = createListHarness(disposables, sessions, options);
				const configurationService = harness.instantiationService.get(IConfigurationService) as TestConfigurationService;
				void configurationService.setUserConfiguration(ChatSessionArchiveActionWordingSettingId, ChatSessionArchiveActionWording.MarkAsDone);
				const container = harness.createContainer(400, 800);
				const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
					grouping: () => grouping,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
				}));
				list.setExcludeArchived(false);
				list.layout(800, 400);
				for (const section of ['pinned', 'older', 'archived']) {
					list.setItemCollapsed({ section }, false);
				}
				return { ...harness, list, container };
			}

			function sortKeys(sortChanges: readonly ISortChangeRecord[]): Record<string, number>[] {
				return sortChanges.map(change => Object.fromEntries(change.set));
			}

			test('unpins sessions dropped into their own section', () => {
				const pinned = createTestSession('Pinned', { workspaceLabel: 'vscode' }).session;
				const regular = createTestSession('Regular', { workspaceLabel: 'vscode' }).session;
				const { container, pinChanges, sortChanges } = renderList([pinned, regular], SessionsGrouping.Workspace, { pinnedSessionIds: new Set([pinned.sessionId]) });

				const ontoHeader = drag(sessionRow(container, 'Pinned'), sectionRow(container, 'vscode'), container);
				const ontoRow = drag(sessionRow(container, 'Pinned'), sessionRow(container, 'Regular'), container);

				assert.deepStrictEqual({ ontoHeader, ontoRow, pinChanges, reordered: sortChanges.map(change => [...change.set.keys(), ...change.clear]) }, {
					ontoHeader: ['vscode'],
					ontoRow: ['vscode'],
					pinChanges: [{ sessionId: 'Pinned', pinned: false }, { sessionId: 'Pinned', pinned: false }],
					reordered: [['Pinned']],
				});
			});

			test('archives sessions dropped on Done and restores archived sessions dropped elsewhere', async () => {
				const active = createTestSession('Active').session;
				const done = createTestSession('Finished', { isArchived: true }).session;
				const { container, commandService, managementService, sortChanges } = renderList([active, done], SessionsGrouping.Date);

				const ontoDone = drag(sessionRow(container, 'Active'), sectionRow(container, 'Done'), container);
				const ontoActive = drag(sessionRow(container, 'Finished'), sessionRow(container, 'Active'), container);
				await timeout(0);

				assert.deepStrictEqual({
					ontoDone,
					ontoActive,
					commands: commandService.calls.filter(call => call.commandId === ARCHIVE_SESSIONS_WITH_UNDO_COMMAND_ID).map(call => ({ commandId: call.commandId, sessionIds: (call.args[0] as ISession[]).map(session => session.sessionId) })),
					unarchived: managementService.unarchived.map(session => session.sessionId),
					reordered: sortChanges.map(change => [...change.set.keys(), ...change.clear]),
				}, {
					ontoDone: ['Done'],
					ontoActive: ['Recent'],
					commands: [{ commandId: ARCHIVE_SESSIONS_WITH_UNDO_COMMAND_ID, sessionIds: ['Active'] }],
					unarchived: ['Finished'],
					reordered: [['Finished']],
				});
			});

			/** Section and session labels of the rendered rows, top to bottom. */
			function renderedRows(container: HTMLElement): string[] {
				return [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
					.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top))
					.map(row => row.querySelector('.session-section-label')?.textContent ?? row.querySelector('.session-title')?.textContent ?? '');
			}

			test('renders sessions dropped on a date section header at the top of that section, unless grouping rules place them elsewhere', () => {
				const now = Date.now();
				const thisWeek = createTestSession('ThisWeek', { createdAt: new Date(now - 2 * DAY_MS) }).session;
				const promoted = createTestSession('Promoted', { createdAt: new Date(now - 20 * DAY_MS), updatedAt: new Date(now) }).session;
				const lastMonth = createTestSession('LastMonth', { createdAt: new Date(now - 30 * DAY_MS) }).session;
				const earlier = createTestSession('Earlier', { createdAt: new Date(now - 40 * DAY_MS) }).session;
				const { container, list } = renderList([thisWeek, promoted, lastMonth, earlier], SessionsGrouping.Date, { liveListModel: true });
				const initial = renderedRows(container);

				// Recently updated sessions render in Recent regardless of their sort key.
				const promotedOntoOlder = drag(sessionRow(container, 'Promoted'), sectionRow(container, 'Older'), container);
				const earlierOntoRecent = drag(sessionRow(container, 'Earlier'), sectionRow(container, 'Recent'), container);
				const thisWeekOntoOlder = drag(sessionRow(container, 'ThisWeek'), sectionRow(container, 'Older'), container);
				list.setItemCollapsed({ section: 'older' }, false);

				assert.deepStrictEqual({ initial, promotedOntoOlder, earlierOntoRecent, thisWeekOntoOlder, rendered: renderedRows(container) }, {
					initial: ['Recent', 'ThisWeek', 'Promoted', 'Older', 'LastMonth', 'Earlier'],
					promotedOntoOlder: [],
					earlierOntoRecent: ['Recent'],
					thisWeekOntoOlder: ['Older'],
					rendered: ['Recent', 'Earlier', 'Promoted', 'Older', 'ThisWeek', 'LastMonth'],
				});
			});

			test('anchors drops below the last row in an earlier date section when the selection empties the last one', () => {
				const now = Date.now();
				const grouped = createTestSession('Grouped', { createdAt: new Date(now - 2 * DAY_MS) }).session;
				const recent = createTestSession('Recent', { createdAt: new Date(now - DAY_MS - 60_000) }).session;
				const older = createTestSession('Older', { createdAt: new Date(now - 30 * DAY_MS) }).session;
				const { container, list, removedFromGroups, sortChanges } = renderList([grouped, recent, older], SessionsGrouping.Date, {
					groups: [{ id: 'g', name: 'Group', createdAt: 1 }],
					memberships: new Map([[grouped.sessionId, 'g']]),
				});
				list.setSelectedItems([{ session: grouped.resource }, { session: older.resource }]);

				const highlighted = dragToEmptySpace(sessionRow(container, 'Grouped'), container);

				const recentKey = recent.createdAt.getTime();
				assert.deepStrictEqual({ highlighted, removedFromGroups, sortKeys: sortKeys(sortChanges) }, {
					highlighted: ['Recent'],
					removedFromGroups: ['Grouped'],
					sortKeys: [{ Grouped: recentKey - 1, Older: recentKey - 2 }],
				});
			});

			test('keeps the display order of dragged sessions from different sections', () => {
				const now = Date.now();
				const pinned = createTestSession('Pinned', { createdAt: new Date(now - 60 * 60_000) }).session;
				const newer = createTestSession('Newer', { createdAt: new Date(now) }).session;
				const member = createTestSession('Member', { createdAt: new Date(now - 2 * DAY_MS) }).session;
				const { container, list, addedToGroups, pinChanges, sortChanges } = renderList([pinned, newer, member], SessionsGrouping.Date, {
					groups: [{ id: 'g', name: 'Group', createdAt: 1 }],
					memberships: new Map([[member.sessionId, 'g']]),
					pinnedSessionIds: new Set([pinned.sessionId]),
				});
				list.setSelectedItems([{ session: newer.resource }, { session: pinned.resource }]);

				drag(sessionRow(container, 'Pinned'), sessionRow(container, 'Member'), container);

				const [keys] = sortKeys(sortChanges);
				assert.deepStrictEqual({ addedToGroups, pinChanges, order: Object.keys(keys), pinnedAboveNewer: keys.Pinned > keys.Newer }, {
					addedToGroups: [{ groupId: 'g', sessionIds: ['Pinned', 'Newer'] }],
					pinChanges: [{ sessionId: 'Pinned', pinned: false }],
					order: ['Pinned', 'Newer'],
					pinnedAboveNewer: true,
				});
			});

			test('moves sessions dropped below the last row to the end of the date sections, except archived ones', () => {
				const now = Date.now();
				// Recently updated sessions would render in Recent regardless of their sort key.
				const grouped = createTestSession('Grouped', { createdAt: new Date(now - 2 * DAY_MS) }).session;
				const pinned = createTestSession('Pinned', { createdAt: new Date(now - 2 * DAY_MS) }).session;
				const recent = createTestSession('Recent', { createdAt: new Date(now) }).session;
				const older = createTestSession('Older', { createdAt: new Date(now - 30 * DAY_MS) }).session;
				const archived = createTestSession('Finished', { isArchived: true }).session;
				const { container, removedFromGroups, pinChanges, managementService, sortChanges } = renderList([grouped, pinned, recent, older, archived], SessionsGrouping.Date, {
					groups: [{ id: 'g', name: 'Group', createdAt: 1 }],
					memberships: new Map([[grouped.sessionId, 'g']]),
					pinnedSessionIds: new Set([pinned.sessionId]),
				});

				const highlighted = ['Grouped', 'Pinned', 'Finished'].map(title => dragToEmptySpace(sessionRow(container, title), container));

				assert.deepStrictEqual({
					highlighted,
					removedFromGroups,
					pinChanges,
					unarchived: managementService.unarchived,
					sortKeys: sortKeys(sortChanges),
				}, {
					highlighted: [['Older'], ['Older'], []],
					removedFromGroups: ['Grouped'],
					pinChanges: [{ sessionId: 'Pinned', pinned: false }],
					unarchived: [],
					sortKeys: [{ Grouped: older.createdAt.getTime() - 60_000 }, { Pinned: older.createdAt.getTime() - 60_000 }],
				});
			});
		});
	});

	suite('session pull request icon', () => {
		test('shows an open pull request while Agent Merge handles CI failures and review comments', () => {
			const stateBySession = new Map<string, AgentMergeSessionState>([['handled', { enabled: true }]]);
			const enablementEmitters = new Map<string, Emitter<void>>();
			const enablementObservables = new Map<string, IObservable<AgentMergeSessionState>>();
			const observerCounts = new Map<string, number>();
			const getEnablementObservable = (sessionId: string) => {
				let observable = enablementObservables.get(sessionId);
				if (!observable) {
					const emitter = disposables.add(new Emitter<void>({
						onDidAddListener: () => observerCounts.set(sessionId, (observerCounts.get(sessionId) ?? 0) + 1),
						onWillRemoveListener: () => observerCounts.set(sessionId, (observerCounts.get(sessionId) ?? 1) - 1),
					}));
					enablementEmitters.set(sessionId, emitter);
					observable = observableFromEvent(disposables, emitter.event, () => stateBySession.get(sessionId) ?? { enabled: false });
					enablementObservables.set(sessionId, observable);
				}
				return observable;
			};
			const setState = (sessionId: string, state: AgentMergeSessionState) => {
				stateBySession.set(sessionId, state);
				enablementEmitters.get(sessionId)?.fire();
			};
			const provider = new class extends mock<IAgentHostSessionsProvider>() {
				override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
				override getAgentMergeClientStateObservable(sessionId: string) { return getEnablementObservable(sessionId); }
			};
			const completedStateIcon = observableValue('completedStateIcon', computePullRequestIcon(GitHubPullRequestState.Open, { hasFailingChecks: true }));
			const base = createTestSession('Agent Merge', { resourceId: 'handled' }).session;
			const session: ISession = {
				...base,
				providerId: provider.id,
				completedStateIcon,
			};
			const healthyBase = createTestSession('Healthy Pull Request', { resourceId: 'healthy' }).session;
			const healthySession: ISession = {
				...healthyBase,
				providerId: provider.id,
				completedStateIcon: constObservable(computePullRequestIcon(GitHubPullRequestState.Open)),
			};
			const harness = createListHarness(disposables, [session, healthySession], instantiationService => {
				instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
					override readonly onDidChangeProviders = Event.None;
					override getProviders() { return [provider]; }
					override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
						return (providerId === provider.id ? provider : undefined) as T | undefined;
					}
				});
			});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const currentIconId = (title: string) => {
				const row = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === title);
				const icon = row?.querySelector<HTMLElement>('.session-icon')?.lastElementChild;
				return icon && [...icon.classList].find(className => className.startsWith('codicon-git-pull-request'));
			};

			const failingCI = currentIconId('Agent Merge');
			setState(session.sessionId, { enabled: true, overrides: { fixCI: false } });
			const unhandledCI = currentIconId('Agent Merge');
			setState(session.sessionId, { enabled: true });
			completedStateIcon.set(computePullRequestIcon(GitHubPullRequestState.Open, { hasUnresolvedComments: true }), undefined);
			const reviewComments = currentIconId('Agent Merge');
			setState(session.sessionId, { enabled: true, overrides: { addressReviews: false } });
			const unhandledComments = currentIconId('Agent Merge');
			setState(session.sessionId, { enabled: false });
			const disabled = currentIconId('Agent Merge');
			setState(session.sessionId, { enabled: true });

			assert.deepStrictEqual({
				observerCounts: Object.fromEntries(observerCounts),
				failingCI,
				unhandledCI,
				reviewComments,
				unhandledComments,
				disabled,
				reEnabled: currentIconId('Agent Merge'),
				healthy: currentIconId('Healthy Pull Request'),
			}, {
				observerCounts: { handled: 1 },
				failingCI: 'codicon-git-pull-request',
				unhandledCI: 'codicon-git-pull-request-error',
				reviewComments: 'codicon-git-pull-request',
				unhandledComments: 'codicon-git-pull-request-comment',
				disabled: 'codicon-git-pull-request-comment',
				reEnabled: 'codicon-git-pull-request',
				healthy: 'codicon-git-pull-request',
			});
		});
	});

	suite('session row spacing', () => {
		for (const status of [SessionStatus.InProgress, SessionStatus.NeedsInput]) {
			test(`flat-list active metadata matches its accessible label when enabled (${status})`, () => {
				const source = createTestSession('Cloud run', { workspaceLabel: 'owner/repo', status });
				const updatedAt = observableValue('historyUpdatedAt', new Date(Date.now() - 60_000));
				const session = { ...source.session, updatedAt };
				const results = [true, false].map(enabled => {
					const harness = createListHarness(disposables, [session]);
					const container = harness.createContainer();
					const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, {
						onSessionOpen: () => { },
						showMetadataWhileActive: () => enabled,
					}));
					list.setSessions([session]);
					list.layout(300, 400);
					const row = container.querySelector<HTMLElement>('.monaco-list-row')!;
					const label = row.getAttribute('aria-label')!;
					const time = row.querySelector('.session-time')?.textContent;
					updatedAt.set(new Date(Date.now() - 3_600_000), undefined);
					const updatedLabel = row.getAttribute('aria-label')!;
					const updatedTime = row.querySelector('.session-time')?.textContent;
					return {
						repository: label.includes('in owner/repo'),
						matchesVisibleTime: !!time && label.includes(`updated ${time}`),
						updatedRepository: updatedLabel.includes('in owner/repo'),
						matchesUpdatedVisibleTime: !!updatedTime && updatedLabel.includes(`updated ${updatedTime}`),
						timeChanged: time !== updatedTime,
					};
				});
				assert.deepStrictEqual(results, [
					{ repository: true, matchesVisibleTime: true, updatedRepository: true, matchesUpdatedVisibleTime: true, timeChanged: true },
					{ repository: false, matchesVisibleTime: status === SessionStatus.NeedsInput, updatedRepository: false, matchesUpdatedVisibleTime: status === SessionStatus.NeedsInput, timeChanged: false },
				]);
			});
		}

		test('reserves spacing only in the main sessions list', () => {
			const sessions = [
				createTestSession('First').session,
				createTestSession('Second').session,
			];

			const mainHarness = createListHarness(disposables, sessions);
			const mainContainer = mainHarness.createContainer();
			const mainList = mainHarness.store.add(mainHarness.instantiationService.createInstance(SessionsList, mainContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			mainList.layout(300, 400);

			const flatHarness = createListHarness(disposables, sessions);
			const flatContainer = flatHarness.createContainer();
			const flatList = flatHarness.store.add(flatHarness.instantiationService.createInstance(SessionsFlatList, flatContainer, {
				showSessionHover: false,
				onSessionOpen: () => { },
			}));
			flatList.setSessions(sessions);
			flatList.layout(300, 400);

			const mainRows = [...mainContainer.querySelectorAll<HTMLElement>('.session-item')]
				.map(item => item.closest<HTMLElement>('.monaco-list-row')!);
			const mainRowsContainer = mainContainer.querySelector<HTMLElement>('.monaco-list-rows');
			assert.ok(mainRowsContainer);
			const flatRows = [...flatContainer.querySelectorAll<HTMLElement>('.session-item')]
				.map(item => item.closest<HTMLElement>('.monaco-list-row')!);
			assert.deepStrictEqual({
				mainHasSpacingClass: mainContainer.querySelector('.sessions-list-control')?.classList.contains('session-list-row-spacing'),
				mainRowsTransform: mainRowsContainer.style.transform,
				mainRowHeight: mainRows[0].style.height,
				mainRowOffset: parseInt(mainRows[1].style.top) - parseInt(mainRows[0].style.top),
				flatHasSpacingClass: flatContainer.querySelector('.sessions-list-control')?.classList.contains('session-list-row-spacing'),
				flatRowHeight: flatRows[0].style.height,
				flatRowOffset: parseInt(flatRows[1].style.top) - parseInt(flatRows[0].style.top),
			}, {
				mainHasSpacingClass: true,
				mainRowsTransform: '',
				mainRowHeight: '56px',
				mainRowOffset: 56,
				flatHasSpacingClass: false,
				flatRowHeight: '54px',
				flatRowOffset: 54,
			});
		});
	});

	suite('session title animations', () => {
		for (const reducedMotion of [false, true]) {
			test(`needs-input rows stay static after running${reducedMotion ? ' with reduced motion' : ''}`, () => {
				const session = createTestSession('Waiting', { status: SessionStatus.InProgress });
				const harness = createListHarness(disposables, [session.session]);
				harness.instantiationService.stub(ISessionsListModelService, 'getStatusIcon', SessionsListModelService.prototype.getStatusIcon);
				harness.instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
					override isMotionReduced(): boolean { return reducedMotion; }
				}());
				const container = harness.createContainer();
				container.classList.toggle('monaco-reduce-motion', reducedMotion);
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
					grouping: () => SessionsGrouping.Date,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
				}));
				list.layout(300, 400);

				session.status.set(SessionStatus.NeedsInput, undefined);

				const item = container.querySelector<HTMLElement>('.session-item.needs-input')!;
				const row = item.closest<HTMLElement>('.monaco-list-row')!;
				const title = item.querySelector<HTMLElement>('.session-title')!;
				const icon = item.querySelector<HTMLElement>('.session-icon > .codicon:not([data-icon-fading-out])')!;
				const titleStyle = mainWindow.getComputedStyle(title);
				assert.deepStrictEqual({
					animations: [row, item, title, icon.parentElement!, icon].map(element => mainWindow.getComputedStyle(element).animationName),
					solidTitle: titleStyle.webkitTextFillColor === titleStyle.color,
					inProgress: item.classList.contains('in-progress'),
					warningIcon: icon.classList.contains('codicon-report-question'),
					color: icon.style.color,
					ariaLabel: row.getAttribute('aria-label'),
				}, {
					animations: ['none', 'none', 'none', 'none', 'none'],
					solidTitle: true,
					inProgress: false,
					warningIcon: true,
					color: 'var(--vscode-list-warningForeground)',
					ariaLabel: 'Waiting, updated now, State: Attention Needed',
				});
			});
		}

		function renderProgressTitles() {
			const sessions = [
				createTestSession('First', { status: SessionStatus.InProgress }).session,
				createTestSession('Second', { status: SessionStatus.NeedsInput }).session,
			];
			const harness = createListHarness(disposables, sessions);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const titles = [...container.querySelectorAll<HTMLElement>('.session-title')];
			assert.strictEqual(titles.length, 2);
			return { container, titles };
		}

		for (const reducedMotion of [false, true]) {
			test(`session titles stay static with reduced motion ${reducedMotion ? 'enabled' : 'disabled'}`, () => {
				const { container, titles } = renderProgressTitles();
				container.classList.toggle('monaco-reduce-motion', reducedMotion);
				assert.deepStrictEqual(titles.map(title => {
					const style = mainWindow.getComputedStyle(title);
					return {
						managed: title.classList.contains('chat-progress-animation'),
						animation: style.animationName,
						background: style.backgroundImage,
						solid: style.webkitTextFillColor === style.color,
					};
				}), [
					{ managed: false, animation: 'none', background: 'none', solid: true },
					{ managed: false, animation: 'none', background: 'none', solid: true },
				]);
			});
		}
	});

	suite('session toolbar keyboard focus', () => {
		for (const pinned of [false, true]) {
			test(`keeps the ${pinned ? 'pinned' : 'unpinned'} archive action visible only for the onboarding lifetime`, () => {
				const session = createTestSession('Onboarding session').session;
				const harness = createListHarness(disposables, [session], {
					pinnedSessionIds: new Set(pinned ? [session.sessionId] : []),
				});
				const actions = [
					harness.instantiationService.createInstance(MenuItemAction, { id: ARCHIVE_SESSION_COMMAND_ID, title: 'Archive', icon: Codicon.archive }, undefined, undefined, undefined, undefined),
				];
				harness.instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
					override createMenu(menuId: MenuId): IMenu {
						return { onDidChange: Event.None, getActions: () => menuId === Menus.SessionItemToolbar ? [['navigation', actions]] : [], dispose: () => { } };
					}
				}());
				harness.instantiationService.stub(ICustomViewService, { hideCustomView: () => { }, activeCustomView: constObservable(undefined) });
				const container = harness.createContainer();
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
					grouping: () => SessionsGrouping.Date,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
				}));
				list.layout(300, 400);
				list.collapseAllSections();
				const target = harness.store.add(list.revealArchiveAction(session));
				list.clearFocus();
				const outside = mainWindow.document.createElement('button');
				container.appendChild(outside);
				outside.focus();
				const action = findOnboardingTarget(mainWindow, target.targetId);
				assert.ok(action);
				const during = action.checkVisibility();
				list.update();
				const afterRerender = findOnboardingTarget(mainWindow, target.targetId)?.checkVisibility();
				target.dispose();
				const after = findOnboardingTarget(mainWindow, target.targetId)?.checkVisibility() ?? false;
				assert.deepStrictEqual({
					during, afterRerender, after,
					archiveVisibleAfter: container.querySelector<HTMLElement>('.codicon-archive')?.checkVisibility(),
					remainingClasses: container.querySelectorAll('.archive-onboarding').length,
				}, { during: true, afterRerender: true, after: false, archiveVisibleAfter: false, remainingClasses: 0 });
			});
		}

		test('scopes New Nested Session visibility to reactive and recycled session rows', () => {
			const supported = createTestSession('Supported');
			supported.capabilities.set({ supportsMultipleChats: true }, undefined);
			const unsupported = createTestSession('Unsupported');
			const quickChat = createTestSession('Quick chat', { isQuickChat: true });
			quickChat.capabilities.set({ supportsMultipleChats: true }, undefined);
			const archived = createTestSession('Archived', { isArchived: true });
			archived.capabilities.set({ supportsMultipleChats: true }, undefined);
			const cloud = createTestSession('Cloud', { environment: 'cloud' });
			cloud.capabilities.set({ supportsMultipleChats: true }, undefined);
			const remote = createTestSession('Remote', { environment: 'remote-host' });
			remote.capabilities.set({ supportsMultipleChats: true }, undefined);
			const sessions = [supported.session, unsupported.session, quickChat.session, archived.session, cloud.session, remote.session];
			const harness = createListHarness(disposables, sessions, instantiationService => {
				const action = instantiationService.createInstance(MenuItemAction, {
					id: 'sessions.test.newChatInSession',
					title: 'New Nested Session',
					icon: Codicon.add,
				}, undefined, undefined, undefined, undefined);
				instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
					override createMenu(menuId: MenuId, contextKeyService: IContextKeyService): IMenu {
						const menuStore = new DisposableStore();
						const onDidChange = menuStore.add(new Emitter<IMenuChangeEvent>());
						const menu: IMenu = {
							onDidChange: onDidChange.event,
							getActions: () => menuId === Menus.SessionItemToolbar
								&& contextKeyService.getContextKeyValue<boolean>(SessionSupportsMultipleChatsContext.key)
								&& !contextKeyService.getContextKeyValue<boolean>(SessionIsArchivedContext.key)
								&& !contextKeyService.getContextKeyValue<boolean>(SessionItemIsCloudContext.key)
								? [['navigation', [action]]]
								: [],
							dispose: () => menuStore.dispose(),
						};
						menuStore.add(contextKeyService.onDidChangeContext(() => onDidChange.fire({
							menu,
							isStructuralChange: true,
							isEnablementChange: false,
							isToggleChange: false,
						})));
						return menu;
					}
				}());
			});
			harness.instantiationService.stub(IContextKeyService, harness.store.add(new ContextKeyService(new TestConfigurationService())));
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, {
				showSessionHover: false,
				onSessionOpen: () => { },
			}));
			list.setSessions(sessions);
			list.layout(600, 400);

			const hasNewChatAction = (title: string) => !![...container.querySelectorAll<HTMLElement>('.session-item')]
				.find(item => item.querySelector('.session-title')?.textContent === title)
				?.querySelector('.codicon-add');
			const initial = sessions.map(session => [session.title.get(), hasNewChatAction(session.title.get())]);

			supported.capabilities.set({ supportsMultipleChats: false }, undefined);
			unsupported.capabilities.set({ supportsMultipleChats: true }, undefined);
			const afterCapabilityChange = sessions.map(session => [session.title.get(), hasNewChatAction(session.title.get())]);

			list.setSessions([unsupported.session]);
			const renderedBeforeRecycle = container.querySelector<HTMLElement>('.session-item');
			list.setSessions([cloud.session]);
			const renderedCloud = container.querySelector<HTMLElement>('.session-item');
			const recycledCloudAction = hasNewChatAction('Cloud');
			list.setSessions([quickChat.session]);
			const renderedAfterRecycle = container.querySelector<HTMLElement>('.session-item');

			assert.deepStrictEqual({
				initial,
				afterCapabilityChange,
				recycledTemplate: renderedBeforeRecycle === renderedCloud && renderedCloud === renderedAfterRecycle,
				recycledCloudAction,
				recycledTitle: renderedAfterRecycle?.querySelector('.session-title')?.textContent,
				recycledAction: renderedAfterRecycle?.querySelector('.codicon-add') !== null,
			}, {
				initial: [['Supported', true], ['Unsupported', false], ['Quick chat', true], ['Archived', false], ['Cloud', false], ['Remote', true]],
				afterCapabilityChange: [['Supported', false], ['Unsupported', true], ['Quick chat', true], ['Archived', false], ['Cloud', false], ['Remote', true]],
				recycledTemplate: true,
				recycledCloudAction: false,
				recycledTitle: 'Quick chat',
				recycledAction: true,
			});
		});

		test('temporarily reveals a filtered session without changing its filters', () => {
			const session = createTestSession('Filtered session').session;
			const harness = createListHarness(disposables, [session]);
			harness.instantiationService.stub(ICustomViewService, { hideCustomView: () => { }, activeCustomView: constObservable(undefined) });
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, harness.createContainer(), {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			list.filters.setExcluded({ kind: 'harness', id: 'copilot' }, true);
			const before = list.reveal(session.resource);
			const target = harness.store.add(list.revealArchiveAction(session));
			const during = list.reveal(session.resource);
			target.dispose();
			assert.deepStrictEqual({
				before, during, after: list.reveal(session.resource),
				filterPreserved: list.filters.isExcluded({ kind: 'harness', id: 'copilot' }),
			}, { before: false, during: true, after: false, filterPreserved: true });
		});

		test('spotlights a filtered session row without revealing its archive action or retaining recycled targets', () => {
			const session = createTestSession('Running session', { status: SessionStatus.InProgress, harness: 'claude' }).session;
			const replacement = createTestSession('Replacement').session;
			const harness = createListHarness(disposables, [session, replacement]);
			harness.instantiationService.stub(ICustomViewService, { hideCustomView: () => { }, activeCustomView: constObservable(undefined) });
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => assert.fail('Revealing onboarding must not open the session'),
			}));
			list.layout(300, 400);
			list.filters.setExcluded({ kind: 'harness', id: 'claude' }, true);
			list.collapseAllSections();
			const before = list.reveal(session.resource);
			const target = harness.store.add(list.revealSessionForOnboarding(session));
			const row = findOnboardingTarget(mainWindow, target.targetId);
			const during = {
				visible: row?.checkVisibility(),
				title: row?.querySelector('.session-title')?.textContent,
				archiveActionForced: container.querySelectorAll('.archive-onboarding').length,
			};
			list.update();
			const afterUpdate = !!findOnboardingTarget(mainWindow, target.targetId);
			harness.managementService.sessions = [replacement];
			list.refresh();
			const afterRecycle = !!findOnboardingTarget(mainWindow, target.targetId);
			harness.managementService.sessions = [session, replacement];
			list.refresh();
			target.dispose();
			assert.deepStrictEqual({
				before, during, afterUpdate, afterRecycle,
				afterRelease: !!findOnboardingTarget(mainWindow, target.targetId),
				filterPreserved: list.filters.isExcluded({ kind: 'harness', id: 'claude' }),
			}, {
				before: false,
				during: { visible: true, title: 'Running session', archiveActionForced: 0 },
				afterUpdate: true,
				afterRecycle: false,
				afterRelease: false,
				filterPreserved: true,
			});
		});

		test('releasing an older onboarding reveal does not clear its replacement', () => {
			const sessions = [createTestSession('First').session, createTestSession('Second').session];
			const harness = createListHarness(disposables, sessions);
			harness.instantiationService.stub(ICustomViewService, { hideCustomView: () => { }, activeCustomView: constObservable(undefined) });
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, harness.createContainer(), {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const first = harness.store.add(list.revealSessionForOnboarding(sessions[0]));
			const second = harness.store.add(list.revealSessionForOnboarding(sessions[1]));
			first.dispose();
			assert.deepStrictEqual({
				first: !!findOnboardingTarget(mainWindow, first.targetId),
				second: !!findOnboardingTarget(mainWindow, second.targetId),
			}, { first: false, second: true });
		});

		test('spotlights the workspace section of a session, or its row when the list is grouped by date', () => {
			const spotlight = (grouping: SessionsGrouping) => {
				const session = createTestSession('Fix login', { workspaceLabel: 'vscode' }).session;
				const other = createTestSession('Update docs', { workspaceLabel: 'vscode-docs' }).session;
				const harness = createListHarness(disposables, [other, session]);
				harness.instantiationService.stub(ICustomViewService, { hideCustomView: () => { }, activeCustomView: constObservable(undefined) });
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, harness.createContainer(), {
					grouping: () => grouping,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
				}));
				list.layout(300, 400);
				list.collapseAllSections();
				const reveal = harness.store.add(list.revealSessionWorkspaceForOnboarding(session));
				const target = findOnboardingTarget(mainWindow, reveal.targetId);
				return {
					targetId: reveal.targetId,
					visible: target?.checkVisibility(),
					label: (target?.querySelector('.session-section-label') ?? target?.querySelector('.session-title'))?.textContent,
				};
			};
			assert.deepStrictEqual({ workspace: spotlight(SessionsGrouping.Workspace), date: spotlight(SessionsGrouping.Date) }, {
				workspace: { targetId: 'sessions.section.workspace:vscode', visible: true, label: 'vscode' },
				date: { targetId: 'sessions.session.Fix login', visible: true, label: 'Fix login' },
			});
		});

		for (const customGroup of [false, true]) {
			test(`reveals only the onboarding target beyond the ${customGroup ? 'custom group' : 'workspace'} cap`, () => {
				const sessions = Array.from({ length: 12 }, (_, index) => ({
					...createTestSession(`Session ${index}`).session,
					createdAt: new Date(2025, 0, 12 - index),
				}));
				const group: ISessionGroup = { id: 'group', name: 'Group', createdAt: 1 };
				const harness = createListHarness(disposables, sessions, {
					groups: customGroup ? [group] : [],
					memberships: customGroup ? new Map(sessions.map(session => [session.sessionId, group.id])) : undefined,
					cappedGroupIds: customGroup ? [group.id] : undefined,
				});
				harness.instantiationService.stub(ICustomViewService, { hideCustomView: () => { }, activeCustomView: constObservable(undefined) });
				const container = harness.createContainer(400, 1000);
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
					grouping: () => SessionsGrouping.Workspace,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
				}));
				list.layout(1000, 400);
				const snapshot = () => ({
					sessions: list.getVisibleSessions().map(session => session.title.get()),
					showMore: [...container.querySelectorAll('.monaco-list-rows .session-show-more-label')].map(label => label.textContent),
				});
				const before = snapshot();
				const target = harness.store.add(list.revealSessionForOnboarding(sessions[9]));
				const during = snapshot();
				target.dispose();

				assert.deepStrictEqual({ before, during, after: snapshot() }, {
					before: { sessions: ['Session 0', 'Session 1', 'Session 2', 'Session 3', 'Session 4'], showMore: ['+7 more'] },
					during: { sessions: ['Session 0', 'Session 1', 'Session 2', 'Session 3', 'Session 4', 'Session 9'], showMore: ['+6 more'] },
					after: { sessions: ['Session 0', 'Session 1', 'Session 2', 'Session 3', 'Session 4'], showMore: ['+7 more'] },
				});
			});
		}

		for (const pinned of [false, true]) {
			test(`tabs into the selected ${pinned ? 'pinned' : 'unpinned'} session toolbar without hover`, () => {
				const session = createTestSession('Session').session;
				const harness = createListHarness(disposables, [session], {
					pinnedSessionIds: new Set(pinned ? [session.sessionId] : []),
				});
				harness.instantiationService.stub(IContextKeyService, harness.store.add(new ContextKeyService(new TestConfigurationService())));
				const action = new class extends mock<MenuItemAction>() {
					override readonly id = 'sessions.test.action';
					override readonly label = 'Session Action';
					override readonly enabled = true;
					override async run(): Promise<void> { }
				}();
				harness.instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
					override createMenu(menuId: MenuId): IMenu {
						return {
							onDidChange: Event.None,
							getActions: () => menuId === Menus.SessionItemToolbar ? [['navigation', [action]]] : [],
							dispose: () => { },
						};
					}
				}());
				const container = harness.createContainer();
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
					grouping: () => SessionsGrouping.Date,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
				}));
				list.layout(300, 400);
				assert.ok(list.reveal(session.resource));

				const tree = container.querySelector<HTMLElement>('.monaco-list');
				const row = container.querySelector('.session-item')?.closest('.monaco-list-row');
				const toolbar = row?.querySelector<HTMLElement>('.session-title-toolbar');
				const button = toolbar?.querySelector<HTMLElement>('[tabindex="0"]');
				assert.ok(tree && row && toolbar && button);

				const outside = mainWindow.document.createElement('button');
				container.appendChild(outside);
				outside.focus();
				const unfocusedDisplay = mainWindow.getComputedStyle(toolbar).display;
				list.focus();
				const focusedDisplay = mainWindow.getComputedStyle(toolbar).display;
				tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
				const toolbarFocused = mainWindow.document.activeElement === button;
				const toolbarFocusedDisplay = mainWindow.getComputedStyle(toolbar).display;
				const tabFromAction = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true });
				button.dispatchEvent(tabFromAction);
				outside.focus();
				const blurredDisplay = mainWindow.getComputedStyle(toolbar).display;
				list.focus();
				const reverseTab = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, shiftKey: true, bubbles: true, cancelable: true });
				tree.dispatchEvent(reverseTab);

				assert.deepStrictEqual({
					selected: row.classList.contains('selected'),
					unfocusedDisplay,
					focusedDisplay,
					toolbarFocused,
					toolbarFocusedDisplay,
					tabFromActionPrevented: tabFromAction.defaultPrevented,
					blurredDisplay,
					reverseTabPrevented: reverseTab.defaultPrevented,
				}, {
					selected: true,
					unfocusedDisplay: 'none',
					focusedDisplay: 'block',
					toolbarFocused: true,
					toolbarFocusedDisplay: 'block',
					tabFromActionPrevented: false,
					blurredDisplay: 'none',
					reverseTabPrevented: false,
				});
			});
		}
	});

	suite('item references', () => {
		const group: ISessionGroup = { id: 'group', name: 'Release work', createdAt: 1 };

		function renderReferencedList(configure?: (harness: ReturnType<typeof createListHarness>) => void) {
			const grouped = buildTestSession({ id: 'grouped', title: 'Grouped', workspace: 'vscode', chats: [{ id: 'peer', title: 'Peer chat' }] });
			const other = buildTestSession({ id: 'other', title: 'Other', workspace: 'vscode' });
			const harness = createListHarness(disposables, [grouped.session, other.session], {
				groups: [group],
				memberships: new Map([[grouped.session.sessionId, group.id]]),
			});
			configure?.(harness);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			return { container, list, grouped, other };
		}

		function rowLabel(row: HTMLElement | null | undefined): string | null | undefined {
			return row?.querySelector('.session-title, .session-chat-title, .session-section-label')?.textContent;
		}

		test('focuses, selects, collapses, and locates rows by model identity', () => {
			const { container, list, grouped, other } = renderReferencedList();
			const peer = { session: grouped.session.resource, chat: grouped.chats.get('peer')!.chat.resource };

			const focused = list.setFocusedItem(peer);
			const selected = list.setSelectedItems([{ session: other.session.resource }]);
			const state = {
				focused,
				selected,
				selectedHeader: list.setSelectedItems([{ group: group.id }]),
				missing: list.setFocusedItem({ session: URI.parse('vscode-session://session/missing') }),
				rows: [{ group: group.id }, { session: grouped.session.resource }, peer, { section: 'workspace:vscode' }].map(item => rowLabel(list.getItemRow(item))),
				focusedRows: [...container.querySelectorAll<HTMLElement>('.monaco-list-row.focused')].map(rowLabel),
				selectedRows: [...container.querySelectorAll<HTMLElement>('.monaco-list-row.selected')].map(rowLabel),
			};
			const collapsed = list.setItemCollapsed({ session: grouped.session.resource }, true);
			const collapsedChatRow = list.getItemRow(peer);
			const revealed = list.revealItem(peer);

			assert.deepStrictEqual({
				...state,
				collapsed,
				collapsedChatRow,
				revealed,
				revealedChatRow: rowLabel(list.getItemRow(peer)),
				collapsedLeaf: list.setItemCollapsed({ session: other.session.resource }, true),
			}, {
				focused: true,
				selected: true,
				selectedHeader: false,
				missing: false,
				rows: ['Release work', 'Grouped', 'Peer chat', 'vscode'],
				focusedRows: ['Peer chat'],
				selectedRows: ['Other'],
				collapsed: true,
				collapsedChatRow: undefined,
				revealed: true,
				revealedChatRow: 'Peer chat',
				collapsedLeaf: false,
			});
		});

		test('reveals row actions for a .hovered row like pointer hover', () => {
			const action = new class extends mock<MenuItemAction>() {
				override readonly id = 'sessions.test.action';
				override readonly label = 'Session Action';
				override readonly enabled = true;
				override async run(): Promise<void> { }
			}();
			const { list, other } = renderReferencedList(harness => {
				harness.instantiationService.stub(IContextKeyService, harness.store.add(new ContextKeyService(new TestConfigurationService())));
				harness.instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
					override createMenu(menuId: MenuId): IMenu {
						return { onDidChange: Event.None, getActions: () => menuId === Menus.SessionItemToolbar ? [['navigation', [action]]] : [], dispose: () => { } };
					}
				}());
			});
			const row = list.getItemRow({ session: other.session.resource });
			const toolbar = row?.querySelector<HTMLElement>('.session-title-toolbar');
			assert.ok(row && toolbar);

			const atRest = mainWindow.getComputedStyle(toolbar).display;
			row.classList.add('hovered');

			assert.deepStrictEqual({ atRest, hovered: mainWindow.getComputedStyle(toolbar).display }, { atRest: 'none', hovered: 'block' });
		});
	});

	suite('session chat rows', () => {

		function createChat(title: string, origin?: ChatOriginKind, interactivity = ChatInteractivity.Full, status = SessionStatus.Completed, updatedAt: IObservable<Date | undefined> = constObservable(new Date())): IChat {
			return upcastPartial<IChat>({
				resource: URI.parse(`test-chat://${title.replaceAll(' ', '-')}`),
				createdAt: updatedAt.get() ?? new Date(0),
				workspace: constObservable(undefined),
				title: constObservable(title),
				updatedAt,
				status: constObservable(status),
				description: constObservable(undefined),
				isArchived: constObservable(false),
				isRead: constObservable(true),
				changes: constObservable([]),
				changesets: constObservable([]),
				interactivity: constObservable(interactivity),
				origin: origin ? { kind: origin } : undefined,
			});
		}

		function setSessionChatsExpanded(container: HTMLElement, expanded: boolean, title?: string): void {
			const sessionItem = title
				? [...container.querySelectorAll<HTMLElement>('.session-item')].find(item => item.querySelector('.session-title')?.textContent === title)
				: container.querySelector<HTMLElement>('.session-item');
			const row = sessionItem?.closest<HTMLElement>('.monaco-list-row');
			if (!row || row.getAttribute('aria-expanded') === String(expanded)) {
				return;
			}
			const twistie = row.querySelector<HTMLElement>('.session-chat-twistie.collapsible');
			if (!twistie) {
				return;
			}
			twistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
		}

		function renderSessionChatsList(
			session: ISession,
			onChatOpen?: (session: ISession, chat: IChat, preserveFocus: boolean, sideBySide: boolean) => void,
			enableMotion = false,
			expandChats = true,
			compact = false,
			configure?: (instantiationService: TestInstantiationService) => void,
			sorting = SessionsSorting.Created,
		): { readonly container: HTMLElement; readonly list: TestSessionsList; readonly managementService: TestSessionsManagementService } {
			const harness = createListHarness(disposables, [session], instantiationService => {
				if (enableMotion) {
					instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
						override isMotionReduced(): boolean { return false; }
					});
				}
				configure?.(instantiationService);
			});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => sorting,
				compact: () => compact,
				onSessionOpen: () => { },
				onChatOpen,
			}));
			list.layout(300, 400);
			setSessionChatsExpanded(container, expandChats);
			return { container, list, managementService: harness.managementService };
		}

		function renderSessionChats(session: ISession, onChatOpen?: (session: ISession, chat: IChat, preserveFocus: boolean, sideBySide: boolean) => void, enableMotion = false): HTMLElement {
			return renderSessionChatsList(session, onChatOpen, enableMotion).container;
		}

		function chatRowTitles(container: HTMLElement): string[] {
			return [...container.querySelectorAll<HTMLElement>('.session-chat-title')].map(element => element.textContent ?? '');
		}

		/** Section, session and chat rows top to bottom, indented by nesting; done sessions and standalone chats are marked. */
		function renderedTreeRows(container: HTMLElement): string[] {
			return [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
				.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top))
				.map(row => {
					const section = row.querySelector('.session-section-label')?.textContent;
					if (section) {
						return section;
					}
					const chat = row.querySelector('.session-chat-item');
					if (chat) {
						const title = chat.querySelector('.session-chat-title')?.textContent;
						return chat.classList.contains('standalone') ? `  ${title} (standalone)` : `    ${title}`;
					}
					const session = row.querySelector('.session-item');
					return `  ${session?.querySelector('.session-title')?.textContent}${session?.classList.contains('archived') ? ' (done)' : ''}`;
				});
		}

		test('orders nested sessions by updated time when updated ordering is selected', async () => {
			const main = createChat('Main chat');
			const firstUpdatedAt = observableValue<Date | undefined>('first-updated-at', new Date('2024-01-01'));
			const first = { ...createChat('First chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.Completed, firstUpdatedAt), createdAt: new Date('2024-01-03') };
			const second = { ...createChat('Second chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.Completed, constObservable(new Date('2024-01-02'))), createdAt: new Date('2024-01-02') };
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, first, second]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const { container } = renderSessionChatsList(session, undefined, false, true, false, undefined, SessionsSorting.Updated);
			const snapshot = () => [...container.querySelectorAll<HTMLElement>('.session-chat-item')].map(item => ({
				title: item.querySelector('.session-chat-title')?.textContent,
				last: item.classList.contains('last-chat'),
			}));
			const initial = snapshot();

			firstUpdatedAt.set(new Date('2024-01-04'), undefined);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));

			assert.deepStrictEqual({
				initial,
				updated: snapshot(),
			}, {
				initial: [
					{ title: 'Second chat', last: false },
					{ title: 'First chat', last: true },
				],
				updated: [
					{ title: 'First chat', last: false },
					{ title: 'Second chat', last: true },
				],
			});
		});

		test('reorders nested chat rows when the session reorders its chats, without a session change event', async () => {
			const main = createChat('Main chat');
			const first = { ...createChat('First chat'), createdAt: new Date('2024-01-01') };
			const second = { ...createChat('Second chat'), createdAt: new Date('2024-01-01') };
			const chats = observableValue<readonly IChat[]>('chats', [main, first, second]);
			const session: ISession = {
				...createTestSession('Session').session,
				chats,
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const { container } = renderSessionChatsList(session);
			const initial = chatRowTitles(container);

			chats.set([main, second, first], undefined);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));

			assert.deepStrictEqual({ initial, reordered: chatRowTitles(container) }, {
				initial: ['First chat', 'Second chat'],
				reordered: ['Second chat', 'First chat'],
			});
		});

		test('observes updated ordering after archived nested sessions are shown', async () => {
			const main = createChat('Main chat');
			const archivedUpdatedAt = observableValue<Date | undefined>('archived-updated-at', new Date('2024-01-01'));
			const archived = {
				...createChat('Archived chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.Completed, archivedUpdatedAt),
				createdAt: new Date('2024-01-01'),
				isArchived: constObservable(true),
			};
			const otherArchived = {
				...createChat('Other archived chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.Completed, constObservable(new Date('2024-01-02'))),
				createdAt: new Date('2024-01-02'),
				isArchived: constObservable(true),
			};
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, archived, otherArchived]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const { container, list } = renderSessionChatsList(session, undefined, false, true, false, undefined, SessionsSorting.Updated);
			const initiallyVisible = chatRowTitles(container);

			list.setExcludeArchived(false);
			list.setItemCollapsed({ section: 'archived' }, false);
			const archivedShown = chatRowTitles(container);
			archivedUpdatedAt.set(new Date('2024-01-03'), undefined);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));

			assert.deepStrictEqual({
				initiallyVisible,
				archivedShown,
				updated: chatRowTitles(container),
			}, {
				initiallyVisible: [],
				archivedShown: ['Other archived chat', 'Archived chat'],
				updated: ['Archived chat', 'Other archived chat'],
			});
		});

		test('renders the exact main chat read state whether collapsed or expanded', () => {
			const built = buildTestSession({
				id: 'chat-read-state',
				title: 'Main chat',
				isRead: false,
				mainChatIsRead: true,
				chats: [{ id: 'peer', title: 'Peer chat', isRead: false }],
			});
			const { container } = renderSessionChatsList(built.session, undefined, false, false);
			const mainItem = container.querySelector<HTMLElement>('.session-item');
			const snapshot = () => ({
				mainUnread: mainItem?.classList.contains('unread'),
				mainAriaLabel: mainItem?.closest('.monaco-list-row')?.getAttribute('aria-label'),
				peerUnread: container.querySelector<HTMLElement>('.session-chat-item')?.classList.contains('unread'),
				peerAriaLabel: container.querySelector<HTMLElement>('.session-chat-item')?.closest('.monaco-list-row')?.getAttribute('aria-label'),
			});

			const collapsed = snapshot();
			setSessionChatsExpanded(container, true);
			const expanded = snapshot();
			setSessionChatsExpanded(container, false);
			const recollapsed = snapshot();
			built.mainChat.isRead.set(false, undefined);
			const mainUnread = snapshot();
			built.chats.get('peer')?.isRead.set(true, undefined);
			const peerRead = snapshot();
			built.isRead.set(true, undefined);
			const sessionRead = snapshot();
			setSessionChatsExpanded(container, true);
			const expandedMainUnread = snapshot();

			assert.deepStrictEqual({ collapsed, expanded, recollapsed, mainUnread, peerRead, sessionRead, expandedMainUnread }, {
				collapsed: {
					mainUnread: false,
					mainAriaLabel: 'Main chat, updated now, State: Completed',
					peerUnread: undefined,
					peerAriaLabel: undefined,
				},
				expanded: {
					mainUnread: false,
					mainAriaLabel: 'Main chat, updated now, State: Completed',
					peerUnread: true,
					peerAriaLabel: 'Peer chat, chat, updated now, State: Completed, unread',
				},
				recollapsed: {
					mainUnread: false,
					mainAriaLabel: 'Main chat, updated now, State: Completed',
					peerUnread: undefined,
					peerAriaLabel: undefined,
				},
				mainUnread: {
					mainUnread: true,
					mainAriaLabel: 'Main chat, updated now, State: Completed, unread',
					peerUnread: undefined,
					peerAriaLabel: undefined,
				},
				peerRead: {
					mainUnread: true,
					mainAriaLabel: 'Main chat, updated now, State: Completed, unread',
					peerUnread: undefined,
					peerAriaLabel: undefined,
				},
				sessionRead: {
					mainUnread: true,
					mainAriaLabel: 'Main chat, updated now, State: Completed, unread',
					peerUnread: undefined,
					peerAriaLabel: undefined,
				},
				expandedMainUnread: {
					mainUnread: true,
					mainAriaLabel: 'Main chat, updated now, State: Completed, unread',
					peerUnread: false,
					peerAriaLabel: 'Peer chat, chat, updated now, State: Completed',
				},
			});
		});

		test('matches the main chat row vertical layout in compact and regular views', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Main chat').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const snapshot = (compact: boolean) => {
				const { container } = renderSessionChatsList(session, undefined, false, true, compact);
				const mainItem = container.querySelector<HTMLElement>('.session-item');
				const peerItem = container.querySelector<HTMLElement>('.session-chat-item');
				const mainRow = mainItem?.closest<HTMLElement>('.monaco-list-row');
				const peerRow = peerItem?.closest<HTMLElement>('.monaco-list-row');
				assert.ok(mainItem);
				assert.ok(peerItem);
				assert.ok(mainRow);
				assert.ok(peerRow);

				const mainTitleStyle = mainWindow.getComputedStyle(mainItem.querySelector<HTMLElement>('.session-title-row')!);
				const peerTitleStyle = mainWindow.getComputedStyle(peerItem.querySelector<HTMLElement>('.session-chat-title-row')!);
				const mainDetailsStyle = mainWindow.getComputedStyle(mainItem.querySelector<HTMLElement>('.session-details-row')!);
				const peerDetailsStyle = mainWindow.getComputedStyle(peerItem.querySelector<HTMLElement>('.session-chat-folder-row')!);

				return {
					mainHeight: mainRow.style.height,
					peerHeight: peerRow.style.height,
					mainTitleLineHeight: mainTitleStyle.lineHeight,
					peerTitleLineHeight: peerTitleStyle.lineHeight,
					mainDetailsLineHeight: mainDetailsStyle.lineHeight,
					peerDetailsLineHeight: peerDetailsStyle.lineHeight,
					peerDetailsDisplay: peerDetailsStyle.display,
				};
			};

			assert.deepStrictEqual({
				regular: snapshot(false),
				compact: snapshot(true),
			}, {
				regular: {
					mainHeight: '56px',
					peerHeight: '56px',
					mainTitleLineHeight: '17px',
					peerTitleLineHeight: '17px',
					mainDetailsLineHeight: '15px',
					peerDetailsLineHeight: '15px',
					peerDetailsDisplay: 'flex',
				},
				compact: {
					mainHeight: '30px',
					peerHeight: '30px',
					mainTitleLineHeight: '16px',
					peerTitleLineHeight: '16px',
					mainDetailsLineHeight: '15px',
					peerDetailsLineHeight: '15px',
					peerDetailsDisplay: 'none',
				},
			});
		});

		test('shows each resolved chat modified time independently and omits unresolved times', () => {
			const built = buildTestSession({
				id: 'chat-times',
				title: 'Main chat',
				minutesAgo: 60,
				mainChatMinutesAgo: 0,
				chats: [{ id: 'peer', title: 'Peer chat', hasModifiedTime: false }],
			});
			const { container } = renderSessionChatsList(built.session, undefined, false, false);
			const sessionRow = container.querySelector<HTMLElement>('.session-item')?.closest<HTMLElement>('.monaco-list-row');
			const collapsedMainTime = sessionRow?.querySelector('.session-time')?.textContent;

			setSessionChatsExpanded(container, true);
			const peerItem = container.querySelector<HTMLElement>('.session-chat-item');
			const peerRow = peerItem?.closest<HTMLElement>('.monaco-list-row');
			const before = {
				mainTime: sessionRow?.querySelector('.session-time')?.textContent,
				mainAriaLabel: sessionRow?.getAttribute('aria-label'),
				peerTime: peerItem?.querySelector('.session-chat-time')?.textContent,
				peerAriaLabel: peerRow?.getAttribute('aria-label'),
				peerHeight: peerRow?.style.height,
			};

			built.chats.get('peer')?.updatedAt.set(new Date(), undefined);
			const after = {
				peerTime: peerItem?.querySelector('.session-chat-time')?.textContent,
				peerAriaLabel: peerRow?.getAttribute('aria-label'),
				peerHeight: peerRow?.style.height,
			};

			assert.deepStrictEqual({
				collapsedMainTime,
				before,
				after,
			}, {
				collapsedMainTime: 'now',
				before: {
					mainTime: 'now',
					mainAriaLabel: 'Main chat, updated now, State: Completed',
					peerTime: undefined,
					peerAriaLabel: 'Peer chat, chat, State: Completed',
					peerHeight: '56px',
				},
				after: {
					peerTime: 'now',
					peerAriaLabel: 'Peer chat, chat, updated now, State: Completed',
					peerHeight: '56px',
				},
			});
		});

		test('renders catalog-backed chat change counts without loading chat details', () => {
			const built = buildTestSession({
				id: 'chat-changes',
				title: 'Main chat',
				chats: [{ id: 'peer', title: 'Peer chat' }],
			});
			const peer = built.chats.get('peer')!;
			const changesSummary = observableValue<ISessionChangesSummary | undefined>('peerChangesSummary', { files: 2, additions: 12, deletions: 3 });
			const peerChat = { ...peer.chat, changesSummary };
			const session: ISession = {
				...built.session,
				chats: constObservable([built.mainChat.chat, peerChat]),
			};
			const { container } = renderSessionChatsList(session);
			const peerItem = container.querySelector<HTMLElement>('.session-chat-item');
			const peerRow = peerItem?.closest<HTMLElement>('.monaco-list-row');
			const snapshot = () => ({
				diff: peerItem?.querySelector('.session-chat-diff')?.textContent,
				ariaIncludesCounts: peerRow?.getAttribute('aria-label')?.includes('12 lines added, 3 lines removed') ?? false,
			});

			const initial = snapshot();
			peer.status.set(SessionStatus.InProgress, undefined);
			const inProgress = snapshot();
			peer.status.set(SessionStatus.Completed, undefined);
			const completed = snapshot();

			assert.deepStrictEqual({ initial, inProgress, completed }, {
				initial: { diff: '+12-3', ariaIncludesCounts: true },
				inProgress: { diff: undefined, ariaIncludesCounts: false },
				completed: { diff: '+12-3', ariaIncludesCounts: true },
			});
		});

		test('hides the main chat modified time while it is in progress', () => {
			const status = observableValue('main-chat-status', SessionStatus.Completed);
			const main = upcastPartial<IChat>({
				resource: URI.parse('test-chat://main'),
				workspace: constObservable(undefined),
				title: constObservable('Main chat'),
				updatedAt: constObservable(new Date()),
				status,
				isArchived: constObservable(false),
				isRead: constObservable(true),
				changes: constObservable([]),
				changesets: constObservable([]),
				interactivity: constObservable(ChatInteractivity.Full),
			});
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				status,
				chats: constObservable([main]),
				mainChat: constObservable(main),
			};
			const { container } = renderSessionChatsList(session);
			const row = container.querySelector<HTMLElement>('.session-item')?.closest<HTMLElement>('.monaco-list-row');
			const snapshot = () => ({
				time: row?.querySelector('.session-time')?.textContent,
				ariaIncludesUpdatedTime: row?.getAttribute('aria-label')?.includes('updated') ?? false,
			});

			const completed = snapshot();
			status.set(SessionStatus.InProgress, undefined);
			const inProgress = snapshot();
			status.set(SessionStatus.Completed, undefined);
			const completedAgain = snapshot();

			assert.deepStrictEqual({ completed, inProgress, completedAgain }, {
				completed: { time: 'now', ariaIncludesUpdatedTime: true },
				inProgress: { time: undefined, ariaIncludesUpdatedTime: false },
				completedAgain: { time: 'now', ariaIncludesUpdatedTime: true },
			});
		});

		test('keeps the sticky session hierarchy opaque and actions trailing aligned while nested chats scroll beneath it', async () => {
			const main = createChat('Main chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.InProgress);
			const peers = Array.from({ length: 12 }, (_, index) => createChat(`Codex ${index}`, ChatOriginKind.User));
			const base = createTestSession('Show ChatGPT rate limits', { status: SessionStatus.InProgress }).session;
			const session: ISession = {
				...base,
				chats: constObservable([main, ...peers]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const { container, list } = renderSessionChatsList(session);
			container.style.setProperty('--vscode-agents-background', 'rgb(1, 2, 3)');
			container.style.setProperty('--vscode-list-hoverBackground', 'rgba(4, 5, 6, 0.1)');
			container.style.setProperty('--vscode-list-activeSelectionBackground', 'rgba(7, 8, 9, 0.1)');
			container.style.setProperty('--vscode-sideBar-background', 'transparent');

			const tree = Reflect.get(list, 'tree') as {
				scrollTop: number;
			};
			tree.scrollTop = 100;
			await timeout(0);

			const stickyContainer = container.querySelector<HTMLElement>('.monaco-tree-sticky-container');
			assert.ok(stickyContainer);
			const stickyList = stickyContainer.closest<HTMLElement>('.monaco-list');
			assert.ok(stickyList);
			const stickyRows = [...stickyContainer.querySelectorAll<HTMLElement>('.monaco-tree-sticky-row')];
			const stickySessionRow = stickyContainer.querySelector<HTMLElement>('.monaco-tree-sticky-row.session-list-inset-row');
			assert.ok(stickySessionRow);
			const titleRow = stickySessionRow.querySelector<HTMLElement>('.session-title-row');
			const toolbar = stickySessionRow.querySelector<HTMLElement>('.session-title-toolbar');
			assert.ok(titleRow && toolbar);
			stickyContainer.focus();
			stickyList.classList.add('sticky-scroll-focused');
			for (const row of stickyRows) {
				row.classList.remove('focused', 'selected');
			}
			stickySessionRow.classList.add('focused', 'selected');
			const stickySessionStyle = mainWindow.getComputedStyle(stickySessionRow);
			assert.deepStrictEqual({
				containerBackground: mainWindow.getComputedStyle(stickyContainer).backgroundColor,
				rows: stickyRows.map(row => ({
					background: mainWindow.getComputedStyle(row).backgroundColor,
				})),
				focusedSelectedSession: {
					focused: stickySessionRow.classList.contains('focused'),
					selected: stickySessionRow.classList.contains('selected'),
					background: stickySessionStyle.backgroundColor,
					overlay: stickySessionStyle.backgroundImage,
				},
				actions: {
					display: mainWindow.getComputedStyle(toolbar).display,
					flexShrink: mainWindow.getComputedStyle(toolbar).flexShrink,
					titleRowRight: titleRow.getBoundingClientRect().right,
					toolbarRight: toolbar.getBoundingClientRect().right,
				},
			}, {
				containerBackground: 'rgb(1, 2, 3)',
				rows: [
					{ background: 'rgb(1, 2, 3)' },
					{ background: 'rgb(1, 2, 3)' },
				],
				focusedSelectedSession: {
					focused: true,
					selected: true,
					background: 'rgb(1, 2, 3)',
					overlay: 'linear-gradient(rgba(7, 8, 9, 0.1), rgba(7, 8, 9, 0.1))',
				},
				actions: {
					display: 'block',
					flexShrink: '0',
					titleRowRight: titleRow.getBoundingClientRect().right,
					toolbarRight: titleRow.getBoundingClientRect().right,
				},
			});
		});

		function createMultiFolderSession(sessionFolders: readonly ISessionFolder[], chatFolders: readonly (readonly ISessionFolder[] | undefined)[]): ISession {
			const base = createTestSession('Session').session;
			const sessionWorkspace = { ...base.workspace.get()!, label: 'Session workspace', folders: [...sessionFolders] };
			const chats = chatFolders.map((folders, index) => upcastPartial<IChat>({
				...createChat(index === 0 ? 'Main chat' : 'Peer chat', index === 0 ? undefined : ChatOriginKind.User),
				workspace: constObservable(folders ? { ...sessionWorkspace, uri: folders[0].root, label: folders[0].name, folders: [...folders] } : sessionWorkspace),
			}));
			return {
				...base,
				workspace: constObservable(sessionWorkspace),
				chats: constObservable(chats),
				mainChat: constObservable(chats[0]),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
		}

		function summarizeFolderLabel(container: HTMLElement) {
			const row = container.querySelector<HTMLElement>('.session-chat-item');
			const folderRow = row?.querySelector<HTMLElement>('.session-chat-folder-row');
			return {
				hasFolderLabel: row?.classList.contains('has-folder-label'),
				folder: row?.querySelector('.session-compact-hover-description')?.textContent,
				folderRow: folderRow?.textContent,
				folderIcon: folderRow?.querySelector(`.codicon-${Codicon.worktreeCompact.id}`) ? 'worktree' : folderRow?.querySelector(`.codicon-${Codicon.folderCompact.id}`) ? 'folder' : undefined,
				ariaLabel: row?.closest('.monaco-list-row')?.getAttribute('aria-label'),
			};
		}

		test('reserves the folder row of a chat row that renders after it was sized offscreen', async () => {
			const first = { root: URI.file('/workspace/first'), workingDirectory: URI.file('/workspace/first'), name: 'first', description: undefined };
			const second = { root: URI.file('/workspace/second'), workingDirectory: URI.file('/workspace/second'), name: 'second', description: undefined };
			const session = createMultiFolderSession([first, second], [undefined, ...Array.from({ length: 24 }, () => [second])]);
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			// Short viewport so the last chat rows are sized while offscreen.
			list.layout(120, 400);
			setSessionChatsExpanded(container, true);

			list.layout(2000, 400);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));

			const peerRowHeights = [...container.querySelectorAll<HTMLElement>('.session-chat-item.has-folder-label')]
				.map(item => parseInt(item.closest<HTMLElement>('.monaco-list-row')?.style.height ?? '0'));
			const baseRowHeight = 30;
			assert.deepStrictEqual({
				rows: peerRowHeights.length,
				shortRows: peerRowHeights.filter(height => height <= baseRowHeight).length,
			}, {
				rows: 24,
				shortRows: 0,
			});
		});

		test('does not resolve timestamps while chat rows are virtualized offscreen', () => {
			let timestampSubscriptions = 0;
			const onDidResolveTimestamp: Event<void> = listener => {
				timestampSubscriptions++;
				return toDisposable(() => timestampSubscriptions--);
			};
			const unresolvedTimestamp = observableFromEvent(disposables, onDidResolveTimestamp, () => undefined);
			const main = createChat('Main chat');
			const chats = [
				main,
				...Array.from({ length: 24 }, (_, index) => index === 23
					? createChat(`Task ${index}`, ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.Completed, unresolvedTimestamp)
					: createChat(`Task ${index}`, ChatOriginKind.User)),
			];
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable(chats),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Updated,
				onSessionOpen: () => { },
			}));
			list.layout(120, 400);
			setSessionChatsExpanded(container, true);

			assert.strictEqual(timestampSubscriptions, 0);

			list.layout(2000, 400);

			assert.strictEqual(timestampSubscriptions, 1);
		});

		test('shows the folder of a chat scoped to one project of a multi-project session', () => {
			const first = { root: URI.file('/workspace/first'), workingDirectory: URI.file('/workspace/first'), name: 'first', description: undefined };
			const second = { root: URI.file('/workspace/second'), workingDirectory: URI.file('/workspace/second'), name: 'second', description: undefined };
			const session = createMultiFolderSession([first, second], [undefined, [second]]);
			const worktreeSecond: ISessionFolder = {
				...second,
				gitRepository: {
					uri: second.root,
					workTreeUri: second.workingDirectory,
					baseBranchName: 'main',
					gitHubInfo: constObservable(undefined),
				},
			};
			const worktreeSession = createMultiFolderSession([first, worktreeSecond], [undefined, [worktreeSecond]]);
			const pendingMainWorktreeSession = {
				...session,
				worktreePending: constObservable(true),
			};

			const compact = renderSessionChatsList(session, undefined, false, true, true).container;
			const regular = renderSessionChatsList(session, undefined, false, true, false).container;
			const worktree = renderSessionChatsList(worktreeSession, undefined, false, true, false).container;
			const pendingMainWorktree = renderSessionChatsList(pendingMainWorktreeSession, undefined, false, true, false).container;

			assert.deepStrictEqual({
				compact: summarizeFolderLabel(compact),
				compactFolderRowDisplay: mainWindow.getComputedStyle(compact.querySelector<HTMLElement>('.session-chat-folder-row')!).display,
				regular: {
					...summarizeFolderLabel(regular),
					height: regular.querySelector<HTMLElement>('.session-chat-item')?.closest<HTMLElement>('.monaco-list-row')?.style.height,
				},
				worktree: summarizeFolderLabel(worktree),
				pendingMainWorktree: summarizeFolderLabel(pendingMainWorktree),
			}, {
				compact: { hasFolderLabel: true, folder: 'second', folderRow: '', folderIcon: undefined, ariaLabel: 'Peer chat, chat in folder second, updated now, State: Completed' },
				compactFolderRowDisplay: 'none',
				regular: {
					hasFolderLabel: true,
					folder: 'second',
					folderRow: 'second·now',
					folderIcon: 'folder',
					ariaLabel: 'Peer chat, chat in folder second, updated now, State: Completed',
					height: '56px',
				},
				worktree: { hasFolderLabel: true, folder: 'second', folderRow: 'second·now', folderIcon: 'worktree', ariaLabel: 'Peer chat, chat in folder second, updated now, State: Completed' },
				pendingMainWorktree: { hasFolderLabel: true, folder: 'second', folderRow: 'second·now', folderIcon: 'folder', ariaLabel: 'Peer chat, chat in folder second, updated now, State: Completed' },
			});
		});

		test('shows the own folder of a chat in a quick chat and no folder for its scratch chats', () => {
			const repo = { root: URI.file('/workspace/repo'), workingDirectory: URI.file('/workspace/repo'), name: 'repo', description: undefined };
			const base = createTestSession('Quick chat', { isQuickChat: true }).session;
			const chats = [undefined, undefined, [repo]].map((folders, index) => upcastPartial<IChat>({
				...createChat(index === 0 ? 'Main chat' : index === 1 ? 'Scratch chat' : 'Foldered chat', index === 0 ? undefined : ChatOriginKind.User),
				workspace: constObservable(folders ? { ...createTestSession('Folder').session.workspace.get()!, uri: folders[0].root, label: folders[0].name, folders: [...folders] } : undefined),
			}));
			const session: ISession = {
				...base,
				workspace: constObservable(undefined),
				chats: constObservable(chats),
				mainChat: constObservable(chats[0]),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const { container } = renderSessionChatsList(session, undefined, false, true, false);

			assert.deepStrictEqual([...container.querySelectorAll<HTMLElement>('.session-chat-item')].map(row => ({
				hasFolderLabel: row.classList.contains('has-folder-label'),
				folder: row.querySelector('.session-compact-hover-description')?.textContent,
				ariaLabel: row.closest('.monaco-list-row')?.getAttribute('aria-label'),
			})), [
				{ hasFolderLabel: false, folder: '', ariaLabel: 'Scratch chat, chat, updated now, State: Completed' },
				{ hasFolderLabel: true, folder: 'repo', ariaLabel: 'Foldered chat, chat in folder repo, updated now, State: Completed' },
			]);
		});

		test('shows each chat pull request from its workspace folder only in multi-folder sessions', () => {
			const createFolder = (name: string, icon: ThemeIcon): ISessionFolder => {
				const root = URI.file(`/workspace/${name}`);
				return {
					root,
					workingDirectory: root,
					name,
					description: undefined,
					gitRepository: {
						uri: root,
						workTreeUri: undefined,
						baseBranchName: 'main',
						gitHubInfo: constObservable({
							owner: 'microsoft',
							repo: name,
							pullRequests: [{
								owner: 'microsoft',
								repo: name,
								number: 1,
								uri: URI.parse(`https://github.com/microsoft/${name}/pull/1`),
								icon,
							}],
						}),
					},
				};
			};
			const mainIcon = computePullRequestIcon(GitHubPullRequestState.Open);
			const peerIcon = computePullRequestIcon(GitHubPullRequestState.Merged);
			const mainFolder = createFolder('main', mainIcon);
			const peerFolder = createFolder('peer', peerIcon);
			const session = createMultiFolderSession([mainFolder, peerFolder], [[mainFolder], [peerFolder]]);
			const container = renderSessionChats(session);
			const singleFolderSession = createMultiFolderSession([mainFolder], [[mainFolder], [mainFolder]]);
			const singleFolderContainer = renderSessionChats(singleFolderSession);
			const getIconClass = (target: HTMLElement, rowSelector: string, iconSelector: string): string | undefined => {
				const icon = target.querySelector<HTMLElement>(rowSelector)?.querySelector<HTMLElement>(iconSelector)?.lastElementChild;
				return icon ? [...icon.classList].find(className => className.startsWith('codicon-git-')) : undefined;
			};

			assert.deepStrictEqual({
				multiFolderMain: getIconClass(container, '.session-item', '.session-icon'),
				multiFolderPeer: getIconClass(container, '.session-chat-item', '.session-chat-icon'),
				singleFolderMain: getIconClass(singleFolderContainer, '.session-item', '.session-icon'),
				singleFolderPeer: getIconClass(singleFolderContainer, '.session-chat-item', '.session-chat-icon'),
			}, {
				multiFolderMain: `codicon-${mainIcon.id}`,
				multiFolderPeer: `codicon-${peerIcon.id}`,
				singleFolderMain: `codicon-${mainIcon.id}`,
				singleFolderPeer: undefined,
			});
		});

		test('shows main chat diff stats on the parent row only in multi-folder sessions', () => {
			const first = { root: URI.file('/workspace/first'), workingDirectory: URI.file('/workspace/first'), name: 'first', description: undefined };
			const second = { root: URI.file('/workspace/second'), workingDirectory: URI.file('/workspace/second'), name: 'second', description: undefined };
			const withChanges = (session: ISession): ISession => {
				const mainChat = {
					...session.mainChat.get(),
					changes: constObservable([
						{ modifiedUri: URI.file('/workspace/first/main.ts'), insertions: 3, deletions: 1 },
					]),
				};
				return {
					...session,
					changesSummary: constObservable({ files: 4, additions: 20, deletions: 10 }),
					chats: constObservable([mainChat, ...session.chats.get().slice(1)]),
					mainChat: constObservable(mainChat),
				};
			};
			const multiFolderSession = withChanges(createMultiFolderSession([first, second], [undefined, [second]]));
			const activeSession = observableValue<IActiveSession | undefined>('active-session', undefined);
			const multiFolderContainer = renderSessionChatsList(multiFolderSession, undefined, false, true, false, instantiationService => {
				instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
					override readonly activeSession = activeSession;
					override readonly visibleSessions = constObservable<readonly IActiveSession[]>([]);
				});
			}).container;
			const singleFolderContainer = renderSessionChats(withChanges(createMultiFolderSession([first], [undefined])));
			const getDiff = (container: HTMLElement) => {
				const row = container.querySelector<HTMLElement>('.session-item');
				return [
					row?.querySelector('.session-diff-added')?.textContent,
					row?.querySelector('.session-diff-removed')?.textContent,
				];
			};

			const beforeOpen = getDiff(multiFolderContainer);
			activeSession.set(upcastPartial<IActiveSession>({
				...multiFolderSession,
				activeChat: multiFolderSession.mainChat,
			}), undefined);
			const afterOpen = getDiff(multiFolderContainer);
			activeSession.set(undefined, undefined);
			const afterSwitch = getDiff(multiFolderContainer);

			assert.deepStrictEqual({
				multiFolder: { beforeOpen, afterOpen, afterSwitch },
				singleFolder: getDiff(singleFolderContainer),
			}, {
				multiFolder: {
					beforeOpen: ['+20', '-10'],
					afterOpen: ['+3', '-1'],
					afterSwitch: ['+20', '-10'],
				},
				singleFolder: ['+20', '-10'],
			});
		});

		for (const compact of [false, true]) {
			test(`the main chat section of a multi-folder session hover matches its row while the main chat is open, reading only what the row observes (compact: ${compact})`, () => {
				const first = { root: URI.file('/workspace/first'), workingDirectory: URI.file('/workspace/first'), name: 'first', description: undefined };
				const second = { root: URI.file('/workspace/second'), workingDirectory: URI.file('/workspace/second'), name: 'second', description: undefined };
				const base = createMultiFolderSession([first, second], [[first], [second]]);
				// Computing the changes stands in for loading them; an observed derived is read from memory.
				const changeReads: string[] = [];
				const mainChat: IChat = {
					...base.mainChat.get(),
					changes: derived(() => {
						changeReads.push('changes');
						return [{ modifiedUri: URI.file('/workspace/first/main.ts'), insertions: 3, deletions: 1 }];
					}),
					changesSummary: constObservable({ files: 2, additions: 5, deletions: 1 }),
				};
				const session: ISession = {
					...base,
					changesSummary: constObservable({ files: 4, additions: 20, deletions: 10 }),
					chats: constObservable([mainChat, ...base.chats.get().slice(1)]),
					mainChat: constObservable(mainChat),
				};
				const activeSession = observableValue<IActiveSession | undefined>('active-session', undefined);
				const hovers = new Map<HTMLElement, () => IDelayedHoverOptions>();
				const { container } = renderSessionChatsList(session, undefined, false, true, compact, instantiationService => {
					instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
						override readonly activeSession = activeSession;
						override readonly visibleSessions = constObservable<readonly IActiveSession[]>([]);
					});
					instantiationService.stub(IHoverService, {
						...NullHoverService,
						setupDelayedHover: (target, options) => {
							hovers.set(target, typeof options === 'function' ? options : () => options);
							return toDisposable(() => hovers.delete(target));
						},
					});
				});
				const read = () => {
					const row = container.querySelector<HTMLElement>('.session-item');
					changeReads.length = 0;
					const content = row ? hovers.get(row)?.().content : undefined;
					const hoverReads = [...changeReads];
					const location = content instanceof HTMLElement ? content.querySelector('.session-summary-hover-location') : undefined;
					return {
						row: [row?.querySelector('.session-diff-added')?.textContent, row?.querySelector('.session-diff-removed')?.textContent],
						hover: [location?.querySelector('.session-summary-hover-insertions')?.textContent, location?.querySelector('.session-summary-hover-deletions')?.textContent],
						hoverReads,
					};
				};

				const beforeOpen = read();
				activeSession.set(upcastPartial<IActiveSession>({ ...session, activeChat: session.mainChat }), undefined);
				const whileOpen = read();
				activeSession.set(undefined, undefined);
				const afterSwitch = read();

				const catalog = { row: compact ? [undefined, undefined] : ['+20', '-10'], hover: ['+5', '-1'], hoverReads: [] };
				assert.deepStrictEqual({ beforeOpen, whileOpen, afterSwitch }, {
					beforeOpen: catalog,
					// A compact row shows no counts, so it observes nothing and the hover keeps the catalog counts.
					whileOpen: compact ? catalog : { row: ['+3', '-1'], hover: ['+3', '-1'], hoverReads: [] },
					afterSwitch: catalog,
				});
			});
		}

		test('shows the rich chat-scoped hover for peer chats', () => {
			const mainRoot = URI.file('/workspace/main');
			const peerRoot = URI.file('/workspace/peer');
			const mainPullRequestUri = URI.parse('https://github.com/microsoft/main/pull/24');
			const peerPullRequestUri = URI.parse('https://github.com/microsoft/peer/pull/42');
			const mainFolder: ISessionFolder = {
				root: mainRoot,
				workingDirectory: mainRoot,
				name: 'main',
				description: undefined,
				gitRepository: {
					uri: mainRoot,
					workTreeUri: undefined,
					baseBranchName: 'main',
					branchName: 'main-work',
					gitHubInfo: constObservable({
						owner: 'microsoft',
						repo: 'main',
						pullRequests: [{
							owner: 'microsoft',
							repo: 'main',
							number: 24,
							uri: mainPullRequestUri,
							title: 'Main pull request',
							createdByThisSession: true,
						}],
					}),
				},
			};
			const peerFolder: ISessionFolder = {
				root: peerRoot,
				workingDirectory: peerRoot,
				name: 'peer',
				description: undefined,
				gitRepository: {
					uri: peerRoot,
					workTreeUri: undefined,
					baseBranchName: 'main',
					branchName: 'peer-work',
					gitHubInfo: constObservable({
						owner: 'microsoft',
						repo: 'peer',
						pullRequests: [{
							owner: 'microsoft',
							repo: 'peer',
							number: 42,
							uri: peerPullRequestUri,
							title: 'Peer pull request',
							createdByThisSession: true,
						}],
					}),
				},
			};
			const peerSessionFolder: ISessionFolder = {
				...peerFolder,
				gitRepository: {
					uri: peerRoot,
					workTreeUri: undefined,
					baseBranchName: 'main',
					branchName: 'peer-work',
					gitHubInfo: constObservable(undefined),
				},
			};
			const duplicateMainFolder: ISessionFolder = {
				...mainFolder,
				workingDirectory: URI.file('/workspace/main-worktree'),
			};
			const baseSession = createMultiFolderSession(
				[mainFolder, peerSessionFolder, duplicateMainFolder],
				[[mainFolder], [peerFolder], [duplicateMainFolder]],
			);
			const createBranchChangeset = (changes: readonly ISessionFileChange[]): ISessionChangeset => upcastPartial<ISessionChangeset>({
				id: BRANCH_CHANGES_CHANGESET_ID,
				isDefault: constObservable(false),
				changes: constObservable(changes),
			});
			const mainChat: IChat = {
				...baseSession.mainChat.get(),
				changesets: constObservable([createBranchChangeset([
					{ modifiedUri: URI.file('/workspace/main/first.ts'), insertions: 3, deletions: 1 },
					{ modifiedUri: URI.file('/workspace/main/second.ts'), insertions: 2, deletions: 0 },
				])]),
			};
			const peerChat: IChat = {
				...baseSession.chats.get()[1],
				changes: constObservable([{ modifiedUri: URI.file('/workspace/peer/fallback.ts'), insertions: 99, deletions: 99 }]),
				changesets: constObservable([createBranchChangeset([
					{ modifiedUri: URI.file('/workspace/peer/file.ts'), insertions: 7, deletions: 2 },
				])]),
			};
			const session: ISession = {
				...baseSession,
				chats: constObservable([mainChat, peerChat]),
				mainChat: constObservable(mainChat),
				changesSummary: constObservable({ files: 4, additions: 20, deletions: 8 }),
			};
			const hovers = new Map<HTMLElement, () => IDelayedHoverOptions>();
			const { container } = renderSessionChatsList(session, undefined, false, true, false, instantiationService => {
				instantiationService.stub(IHoverService, {
					...NullHoverService,
					setupDelayedHover: (target, options) => {
						hovers.set(target, typeof options === 'function' ? options : () => options);
						return toDisposable(() => hovers.delete(target));
					},
				});
				instantiationService.stub(ILabelService, new class extends mock<ILabelService>() {
					override getUriLabel(resource: URI): string { return resource.path; }
				});
			});

			const summarizeHover = (row: HTMLElement | null) => {
				const hover = row ? hovers.get(row)?.() : undefined;
				const content = hover?.content;
				const element = content instanceof HTMLElement ? content : undefined;
				return {
					presentation: hover && {
						additionalClasses: hover.additionalClasses,
						appearance: hover.appearance,
						position: hover.position,
						persistence: hover.persistence,
					},
					title: element?.querySelector('.session-summary-hover-title-text')?.textContent,
					location: element?.querySelector('.session-summary-hover-location')?.textContent,
					pullRequest: element?.querySelector('.session-summary-hover-pull-requests')?.textContent,
					sessionSummary: element?.querySelector('.session-summary-hover-session-summary')?.textContent,
					changes: [
						element?.querySelector('.session-summary-hover-insertions')?.textContent,
						element?.querySelector('.session-summary-hover-deletions')?.textContent,
					],
				};
			};

			assert.deepStrictEqual({
				main: summarizeHover(container.querySelector('.session-item')),
				peer: summarizeHover(container.querySelector('.session-chat-item')),
			}, {
				main: {
					presentation: {
						additionalClasses: ['sessions-list-hover'],
						appearance: { showPointer: true },
						position: { hoverPosition: HoverPosition.RIGHT, forcePosition: true },
						persistence: { hideOnHover: false },
					},
					title: 'Session',
					location: 'Workspace · /workspace/mainBranch · main-work2 files changed+5-1',
					pullRequest: 'Main pull request',
					sessionSummary: 'Session summarymain · /workspacepeer · /workspace4 files changed+20-8Peer pull request',
					changes: ['+5', '-1'],
				},
				peer: {
					presentation: {
						additionalClasses: ['sessions-list-hover'],
						appearance: { showPointer: true },
						position: { hoverPosition: HoverPosition.RIGHT, forcePosition: true },
						persistence: { hideOnHover: false },
					},
					title: 'Peer chat',
					location: 'Workspace · /workspace/peerBranch · peer-work1 file changed+7-2',
					pullRequest: 'Peer pull request',
					sessionSummary: '',
					changes: ['+7', '-2'],
				},
			});
		});

		test('shows no folder when the session folders are checkouts of the same project', () => {
			const project = URI.file('/repos/project');
			const first = { root: project, workingDirectory: URI.file('/worktrees/project-first'), name: 'project (first)', description: undefined };
			const second = { root: project, workingDirectory: URI.file('/worktrees/project-second'), name: 'project (second)', description: undefined };
			const session = createMultiFolderSession([first, second], [[first], [second]]);

			const container = renderSessionChatsList(session, undefined, false, true, true).container;

			assert.deepStrictEqual(summarizeFolderLabel(container), {
				hasFolderLabel: false,
				folder: '',
				folderRow: '',
				folderIcon: undefined,
				ariaLabel: 'Peer chat, chat, updated now, State: Completed',
			});
		});

		test('peer chat hover ignores the session pending worktree flag', () => {
			const first = { root: URI.file('/workspace/first'), workingDirectory: URI.file('/workspace/first'), name: 'first', description: undefined };
			const second: ISessionFolder = {
				root: URI.file('/workspace/second'),
				workingDirectory: URI.file('/workspace/second'),
				name: 'second',
				description: undefined,
				gitRepository: {
					uri: URI.file('/workspace/second'),
					workTreeUri: undefined,
					baseBranchName: 'main',
					branchName: 'peer-work',
					gitHubInfo: constObservable(undefined),
				},
			};
			const session = {
				...createMultiFolderSession([first, second], [undefined, [second]]),
				worktreePending: constObservable(true),
			};
			const peerChat = session.chats.get()[1];
			const data = getChatSummaryHoverData(
				session,
				peerChat,
				upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }),
				upcastPartial<IOpenerService>({ open: () => Promise.resolve(true) }),
				upcastPartial<ILabelService>({ getUriLabel: resource => resource.path }),
			);

			assert.deepStrictEqual({
				worktreePending: data.location?.worktreePending,
				branch: data.location?.branch,
			}, {
				worktreePending: false,
				branch: 'peer-work',
			});
		});

		test('hover counts come from catalog summaries without reading chat changes or changesets', () => {
			const main = { root: URI.file('/workspace/main'), workingDirectory: URI.file('/workspace/main'), name: 'main', description: undefined };
			const peer = { root: URI.file('/workspace/peer'), workingDirectory: URI.file('/workspace/peer'), name: 'peer', description: undefined };
			// Reading changes or changesets subscribes an agent-host chat on its backend.
			const reads: string[] = [];
			const withCatalog = (chat: IChat, name: string, summary: ISessionChangesSummary): IChat => ({
				...chat,
				changes: derived(() => { reads.push(`${name}.changes`); return []; }),
				changesets: derived(() => { reads.push(`${name}.changesets`); return undefined; }),
				changesSummary: constObservable(summary),
			});
			const multiFolder = createMultiFolderSession([main, peer], [[main], [peer]]);
			const mainChat = withCatalog(multiFolder.chats.get()[0], 'main', { files: 2, additions: 5, deletions: 1 });
			const peerChat = withCatalog(multiFolder.chats.get()[1], 'peer', { files: 1, additions: 7, deletions: 2 });
			const session: ISession = {
				...multiFolder,
				chats: constObservable([mainChat, peerChat]),
				mainChat: constObservable(mainChat),
				changesSummary: constObservable({ files: 4, additions: 20, deletions: 8 }),
			};
			const singleFolder: ISession = {
				...createMultiFolderSession([main], [[main]]),
				mainChat: constObservable(mainChat),
				changesSummary: constObservable(undefined),
			};
			const services = [
				upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }),
				upcastPartial<IOpenerService>({ open: () => Promise.resolve(true) }),
				upcastPartial<ILabelService>({ getUriLabel: resource => resource.path }),
			] as const;
			const sessionData = getSessionSummaryHoverData(session, ...services);

			assert.deepStrictEqual({
				mainChat: sessionData.location?.changes,
				session: sessionData.sessionSummary?.changes,
				peerChat: getChatSummaryHoverData(session, peerChat, ...services).location?.changes,
				singleFolderWithoutSessionSummary: getSessionSummaryHoverData(singleFolder, ...services).location?.changes,
				reads,
			}, {
				mainChat: { files: 2, insertions: 5, deletions: 1 },
				session: { files: 4, insertions: 20, deletions: 8 },
				peerChat: { files: 1, insertions: 7, deletions: 2 },
				singleFolderWithoutSessionSummary: { files: 2, insertions: 5, deletions: 1 },
				reads: [],
			});
		});

		test('hover counts of a provider without catalog summaries come from the main chat changes, not its default changeset', () => {
			const main = { root: URI.file('/workspace/main'), workingDirectory: URI.file('/workspace/main'), name: 'main', description: undefined };
			const base = createMultiFolderSession([main], [[main]]);
			// A default changeset can compute a diff when its changes are read, e.g. an archived Copilot Chat session's All Changes.
			const changesetReads: string[] = [];
			const mainChat: IChat = {
				...base.mainChat.get(),
				changes: constObservable([{ modifiedUri: URI.file('/workspace/main/file.ts'), insertions: 3, deletions: 1 }]),
				changesets: constObservable([upcastPartial<ISessionChangeset>({
					id: 'allChanges',
					isDefault: constObservable(true),
					changes: derived(() => { changesetReads.push('allChanges'); return []; }),
				})]),
			};
			const session: ISession = { ...base, mainChat: constObservable(mainChat), changesSummary: constObservable(undefined) };
			const data = getSessionSummaryHoverData(
				session,
				upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }),
				upcastPartial<IOpenerService>({ open: () => Promise.resolve(true) }),
				upcastPartial<ILabelService>({ getUriLabel: resource => resource.path }),
			);

			assert.deepStrictEqual({ changes: data.location?.changes, changesetReads }, {
				changes: { files: 1, insertions: 3, deletions: 1 },
				changesetReads: [],
			});
		});

		suite('session hover pull requests', () => {

			function createPullRequestFolder(name: string, pullRequestNumbers: readonly number[]): ISessionFolder {
				const root = URI.file(`/workspace/${name}`);
				return {
					root,
					workingDirectory: root,
					name,
					description: undefined,
					gitRepository: {
						uri: root,
						workTreeUri: undefined,
						baseBranchName: 'main',
						branchName: `${name}-work`,
						gitHubInfo: constObservable({
							owner: 'microsoft',
							repo: 'vscode',
							pullRequests: pullRequestNumbers.map(number => ({
								owner: 'microsoft',
								repo: 'vscode',
								number,
								uri: URI.parse(`https://github.com/microsoft/vscode/pull/${number}`),
								title: `PR ${number}`,
								createdByThisSession: true,
							})),
						}),
					},
				};
			}

			function summarizePullRequests(session: ISession) {
				const data = getSessionSummaryHoverData(
					session,
					upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }),
					upcastPartial<IOpenerService>({ open: () => Promise.resolve(true) }),
					upcastPartial<ILabelService>({ getUriLabel: resource => resource.path }),
				);
				return {
					pullRequests: data.pullRequests?.map(pullRequest => pullRequest.title),
					sessionSummary: data.sessionSummary && {
						workspaces: data.sessionSummary.workspaces.map(workspace => workspace.name),
						pullRequests: data.sessionSummary.pullRequests?.map(pullRequest => pullRequest.title),
					},
				};
			}

			test('multi-folder session summary lists only pull requests the main chat section does not show', () => {
				const main = createPullRequestFolder('main', [1, 2]);
				const peer = createPullRequestFolder('peer', [2, 3]);

				assert.deepStrictEqual(summarizePullRequests(createMultiFolderSession([main, peer], [[main], [peer]])), {
					pullRequests: ['PR 1', 'PR 2'],
					sessionSummary: {
						workspaces: ['main', 'peer'],
						pullRequests: ['PR 3'],
					},
				});
			});

			test('multi-folder session summary omits its pull request list when the main chat section shows them all', () => {
				const main = createPullRequestFolder('main', [1, 2]);
				const peer = createPullRequestFolder('peer', [2]);

				assert.deepStrictEqual(summarizePullRequests(createMultiFolderSession([main, peer], [[main], [peer]])), {
					pullRequests: ['PR 1', 'PR 2'],
					sessionSummary: {
						workspaces: ['main', 'peer'],
						pullRequests: undefined,
					},
				});
			});

			test('single-folder session lists its pull requests without a session summary', () => {
				const folder = createPullRequestFolder('main', [1, 2]);

				assert.deepStrictEqual(summarizePullRequests(createMultiFolderSession([folder], [undefined])), {
					pullRequests: ['PR 1', 'PR 2'],
					sessionSummary: undefined,
				});
			});
		});

		test('shows non-main chats including side chats and excludes subagents and hidden chats', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const fork = createChat('Forked chat', ChatOriginKind.Fork);
			const subagent = createChat('Subagent chat', ChatOriginKind.Tool);
			const side = createChat('Side chat', ChatOriginKind.SideChat);
			const hidden = createChat('Hidden chat', undefined, ChatInteractivity.Hidden);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer, fork, subagent, side, hidden]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);

			assert.deepStrictEqual(
				[...container.querySelectorAll<HTMLElement>('.session-chat-item')].map(item => ({
					title: item.querySelector('.session-chat-title')?.textContent,
					last: item.classList.contains('last-chat'),
				})),
				[
					{ title: 'Peer chat', last: false },
					{ title: 'Forked chat', last: false },
					{ title: 'Side chat', last: true },
				]
			);
		});

		test('updates nested chat rows when the session chat catalog changes', async () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const chats = observableValue<readonly IChat[]>('session-chats', [main]);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats,
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const container = renderSessionChats(session);
			const before = chatRowTitles(container);

			chats.set([main, peer], undefined);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			const twistie = container.querySelector<HTMLElement>('.session-chat-twistie.collapsible');
			assert.ok(twistie);

			assert.deepStrictEqual({
				before,
				expanded: twistie.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
				after: chatRowTitles(container),
			}, {
				before: [],
				expanded: 'true',
				after: ['Peer chat'],
			});
		});

		test('does not leave overlapping rows when rendering a chat updates the catalog', async () => {
			const main = createChat('Main chat');
			const appended = createChat('Appended chat', ChatOriginKind.User);
			const chats = observableValue<readonly IChat[]>('session-chats', [main]);
			let didUpdateCatalog = false;
			const target = {
				...createChat('Target chat', ChatOriginKind.User),
				title: derived(() => {
					if (!didUpdateCatalog) {
						didUpdateCatalog = true;
						chats.set([...chats.get(), appended], undefined);
					}
					return 'Target chat';
				}),
			};
			const peers = Array.from({ length: 30 }, (_, index) => createChat(`Peer ${index}`, ChatOriginKind.User));
			chats.set([main, ...peers, target], undefined);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats,
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const { container, list } = renderSessionChatsList(session);

			assert.strictEqual(list.revealItem({ session: session.resource, chat: target.resource }), true);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			const hasAppendedChat = list.revealItem({ session: session.resource, chat: appended.resource });

			const rows = [...container.querySelectorAll<HTMLElement>('.monaco-list[aria-label="Sessions"] .monaco-list-rows > .monaco-list-row')];
			const indices = rows.map(row => row.dataset.index);
			assert.deepStrictEqual({
				didUpdateCatalog,
				hasAppendedChat,
				renderedRowCount: rows.length,
				uniqueRenderedRowCount: new Set(indices).size,
			}, {
				didUpdateCatalog: true,
				hasAppendedChat: true,
				renderedRowCount: rows.length,
				uniqueRenderedRowCount: rows.length,
			});
		});

		test('shows archived nested chats when archived items are included', async () => {
			const main = createChat('Main chat');
			const isArchived = observableValue('peer-is-archived', false);
			const peer: IChat = { ...createChat('Peer chat', ChatOriginKind.User), isArchived };
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const { container, list } = renderSessionChatsList(session);
			const before = chatRowTitles(container);

			isArchived.set(true, undefined);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			const hidden = chatRowTitles(container);
			list.setExcludeArchived(false);
			list.setItemCollapsed({ section: 'archived' }, false);
			const archivedRow = container.querySelector<HTMLElement>('.session-chat-item');
			const shown = {
				rows: renderedTreeRows(container),
				archivedClass: archivedRow?.classList.contains('archived'),
				archivedIcon: !!archivedRow?.querySelector('.codicon-pass-filled'),
				ariaLabel: archivedRow?.closest('.monaco-list-row')?.getAttribute('aria-label'),
			};
			isArchived.set(false, undefined);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));

			assert.deepStrictEqual({ before, hidden, shown, restored: renderedTreeRows(container) }, {
				before: ['Peer chat'],
				hidden: [],
				shown: {
					rows: ['Recent', '  Session', 'Archived', '  Peer chat (standalone)'],
					archivedClass: true,
					archivedIcon: true,
					ariaLabel: 'Peer chat, chat, updated now, State: Completed, archived, in session Session',
				},
				restored: ['Recent', '  Session', '    Peer chat'],
			});
		});

		test('shows archived chats for every session through the archived filter', () => {
			const createSessionWithChats = (title: string): ISession => {
				const main = createChat(`${title} main`);
				const active = createChat(`${title} active`, ChatOriginKind.User);
				const archived: IChat = {
					...createChat(`${title} archived`, ChatOriginKind.User),
					isArchived: constObservable(true),
					capabilities: constObservable({ canRename: true, canArchive: true, canDelete: true }),
				};
				return {
					...createTestSession(title).session,
					chats: constObservable([main, active, archived]),
					mainChat: constObservable(main),
					capabilities: constObservable({ supportsMultipleChats: true }),
				};
			};
			const first = createSessionWithChats('First');
			const second = createSessionWithChats('Second');
			const harness = createListHarness(disposables, [first, second]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(500, 400);

			const initial = chatRowTitles(container).sort();
			list.setExcludeArchived(false);
			list.setItemCollapsed({ section: 'archived' }, false);
			const shown = chatRowTitles(container).sort();
			const excludesArchivedWhileShown = list.isExcludeArchived();
			list.setExcludeArchived(true);
			const hidden = chatRowTitles(container).sort();

			assert.deepStrictEqual({ initial, shown, excludesArchivedWhileShown, hidden }, {
				initial: ['First active', 'Second active'],
				shown: ['First active', 'First archived', 'Second active', 'Second archived'],
				excludesArchivedWhileShown: false,
				hidden: ['First active', 'Second active'],
			});
		});

		test('lists done nested chats of a session that is not done as standalone rows in the Done section', async () => {
			const createSessionWithChats = (title: string, options?: { readonly isArchived?: boolean; readonly createdAt?: Date }): ISession => {
				const main = createChat(`${title} main`);
				const active = createChat(`${title} active`, ChatOriginKind.User);
				const done: IChat = { ...createChat(`${title} done`, ChatOriginKind.User), isArchived: constObservable(true) };
				return {
					...createTestSession(title, options).session,
					chats: constObservable([main, active, done]),
					mainChat: constObservable(main),
					capabilities: constObservable({ supportsMultipleChats: true }),
				};
			};
			const now = Date.now();
			const parent = createSessionWithChats('Parent', { createdAt: new Date(now - 2000) });
			const doneSession = createSessionWithChats('Finished', { isArchived: true, createdAt: new Date(now - 1000) });
			const opened: string[] = [];
			const harness = createListHarness(disposables, [parent, doneSession]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: resource => { opened.push(resource.toString()); },
			}));
			list.layout(500, 600);
			list.setExcludeArchived(false);
			list.setItemCollapsed({ section: 'archived' }, false);
			list.setItemCollapsed({ session: parent.resource }, false);
			list.setItemCollapsed({ session: doneSession.resource }, false);
			const rows = renderedTreeRows(container);
			list.openSession(parent);
			await timeout(0);

			assert.deepStrictEqual({ rows, opened }, {
				rows: [
					'Recent',
					'  Parent',
					'    Parent active',
					'Archived',
					'  Parent done (standalone)',
					'  Finished (done)',
					'    Finished active',
					'    Finished done',
				],
				opened: [parent.resource.toString()],
			});
		});

		test('steps in the chat rows of a session in a nested group, but not its done chats listed in the Done section', () => {
			const main = createChat('Patch main');
			const active = createChat('Patch active', ChatOriginKind.User);
			const done: IChat = { ...createChat('Patch done', ChatOriginKind.User), isArchived: constObservable(true) };
			const session: ISession = {
				...createTestSession('Patch CVE').session,
				chats: constObservable([main, active, done]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const release: ISessionGroup = { id: 'release', name: 'Release work', createdAt: 1 };
			const hotfixes: ISessionGroup = { id: 'hotfixes', name: 'Hotfixes', createdAt: 2, parentId: release.id };
			const harness = createListHarness(disposables, [session], { groups: [release, hotfixes], memberships: new Map([[session.sessionId, hotfixes.id]]) });
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(500, 600);
			list.setExcludeArchived(false);
			list.setItemCollapsed({ section: 'archived' }, false);
			list.setItemCollapsed({ session: session.resource }, false);
			const chatRowDepths = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.map(row => `${row.querySelector('.session-chat-title')?.textContent}: ${row.style.getPropertyValue('--session-group-depth') || '0'}`)
				.sort();

			assert.deepStrictEqual(chatRowDepths, ['Patch active: 1', 'Patch done: 0']);
		});

		test('switches the primary action from delete to done when a nested session is committed', async () => {
			const main = createChat('Main chat');
			const isArchived = observableValue('peer-is-archived', false);
			const status = observableValue('peer-status', SessionStatus.Untitled);
			const capabilities = observableValue('peer-capabilities', { canRename: true, canArchive: true, canDelete: true });
			const peer: IChat = { ...createChat('Peer chat', ChatOriginKind.User), status, isArchived, capabilities };
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const invocations: Array<{ readonly action: 'delete' | 'done'; readonly target: ISessionChatItem }> = [];
			const harness = createListHarness(disposables, [session], instantiationService => {
				const deleteAction = instantiationService.createInstance(class extends MenuItemAction {
					override async run(...args: unknown[]): Promise<void> {
						invocations.push({ action: 'delete', target: args[0] as ISessionChatItem });
					}
				}, {
					id: 'sessions.list.deleteChat',
					title: 'Delete...',
					icon: Codicon.trash,
				}, undefined, undefined, undefined, undefined);
				const markAsDoneAction = instantiationService.createInstance(class extends MenuItemAction {
					override async run(...args: unknown[]): Promise<void> {
						invocations.push({ action: 'done', target: args[0] as ISessionChatItem });
					}
				}, {
					id: ARCHIVE_CHAT_COMMAND_ID,
					title: 'Mark as Done',
					icon: Codicon.check,
				}, undefined, undefined, undefined, undefined);
				const restoreAction = instantiationService.createInstance(MenuItemAction, {
					id: UNARCHIVE_CHAT_COMMAND_ID,
					title: 'Restore',
					icon: Codicon.redo,
				}, undefined, undefined, undefined, undefined);
				instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
					override createMenu(menuId: MenuId, contextKeyService: IContextKeyService): IMenu {
						const menuStore = new DisposableStore();
						const onDidChange = menuStore.add(new Emitter<IMenuChangeEvent>());
						const menu: IMenu = {
							onDidChange: onDidChange.event,
							getActions: () => {
								if (menuId !== Menus.SessionChatItemToolbar) {
									return [];
								}
								if (contextKeyService.getContextKeyValue<boolean>(SessionChatItemIsArchivedContext.key)) {
									return contextKeyService.getContextKeyValue<boolean>(SessionChatItemCanArchiveContext.key) ? [['navigation', [restoreAction]]] : [];
								}
								if (contextKeyService.getContextKeyValue<boolean>(SessionChatItemIsUntitledContext.key)) {
									return contextKeyService.getContextKeyValue<boolean>(SessionChatItemCanDeleteContext.key) ? [['navigation', [deleteAction]]] : [];
								}
								return contextKeyService.getContextKeyValue<boolean>(SessionChatItemCanArchiveContext.key) ? [['navigation', [markAsDoneAction]]] : [];
							},
							dispose: () => menuStore.dispose(),
						};
						menuStore.add(contextKeyService.onDidChangeContext(() => onDidChange.fire({
							menu,
							isStructuralChange: true,
							isEnablementChange: false,
							isToggleChange: false,
						})));
						return menu;
					}
				}());
			});
			harness.instantiationService.stub(IContextKeyService, harness.store.add(new ContextKeyService(new TestConfigurationService())));
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.setExcludeArchived(false);
			list.layout(300, 400);
			setSessionChatsExpanded(container, true);
			await timeout(0);

			const chatRow = () => container.querySelector<HTMLElement>('.session-chat-item');
			const actionState = () => ({
				delete: !!chatRow()?.querySelector('.codicon-trash'),
				done: !!chatRow()?.querySelector('.codicon-check'),
				restore: !!chatRow()?.querySelector('.codicon-redo'),
			});

			const untitled = actionState();
			chatRow()?.querySelector<HTMLElement>('.codicon-trash')?.closest<HTMLElement>('.action-label')?.click();
			await timeout(0);
			status.set(SessionStatus.Completed, undefined);
			await timeout(0);
			const committed = actionState();
			chatRow()?.querySelector<HTMLElement>('.codicon-check')?.closest<HTMLElement>('.action-label')?.click();
			await timeout(0);
			// The list moves a done nested session of a session that is not done to its own row
			// in the Done section on its next update, and that section starts collapsed.
			const didMoveToDoneSection = Event.toPromise(list.onDidUpdate);
			isArchived.set(true, undefined);
			await didMoveToDoneSection;
			list.setItemCollapsed({ section: 'archived' }, false);
			const archived = actionState();
			capabilities.set({ canRename: true, canArchive: false, canDelete: false }, undefined);
			await timeout(0);
			const unsupported = actionState();

			assert.deepStrictEqual({
				untitled,
				committed,
				archived,
				unsupported,
				invocations: invocations.map(invocation => ({ action: invocation.action, chat: invocation.target.chat.resource.toString() })),
			}, {
				untitled: { delete: true, done: false, restore: false },
				committed: { delete: false, done: true, restore: false },
				archived: { delete: false, done: false, restore: true },
				unsupported: { delete: false, done: false, restore: false },
				invocations: [
					{ action: 'delete', chat: peer.resource.toString() },
					{ action: 'done', chat: peer.resource.toString() },
				],
			});
		});

		test('shows New Session for an untitled nested session row', () => {
			const main = createChat('Main chat');
			const nested = createChat('New Chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.Untitled);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, nested]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			assert.deepStrictEqual(chatRowTitles(renderSessionChats(session)), ['New Session']);
		});

		test('hides the main chat even when its title matches the session title', () => {
			const main = createChat('Session');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);

			assert.deepStrictEqual({
				chats: chatRowTitles(container),
				hasTwistie: container.querySelector('.session-chat-twistie')?.classList.contains('collapsible'),
			}, {
				chats: ['Peer chat'],
				hasTwistie: true,
			});
		});

		test('shows progress for active chats and a dot for inactive chats', () => {
			const main = createChat('Main chat');
			const active = createChat('Active chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.InProgress);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				status: constObservable(SessionStatus.InProgress),
				chats: constObservable([main, active]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const container = renderSessionChats(session, undefined, true);

			assert.deepStrictEqual(Object.fromEntries(
				[...container.querySelectorAll<HTMLElement>('.session-chat-item')].map(item => [
					item.querySelector('.session-chat-title')?.textContent,
					{
						hasProgress: !!item.querySelector('.session-chat-icon > .monaco-pixel-spinner'),
						hasDot: !!item.querySelector('.session-chat-icon > .codicon-circle-small-filled'),
						hasDiscussion: !!item.querySelector('.session-chat-icon > .codicon-comment-discussion'),
						ariaLabel: item.closest('.monaco-list-row')?.getAttribute('aria-label'),
					},
				])
			), {
				'Active chat': { hasProgress: true, hasDot: false, hasDiscussion: false, ariaLabel: 'Active chat, chat, State: In Progress, Working...' },
			});
		});

		test('shows each chat activity instead of modified time while in progress', () => {
			const firstStatus = observableValue('first-chat-status', SessionStatus.InProgress);
			const firstDescription = observableValue<IMarkdownString | undefined>('first-chat-description', new MarkdownString('Reading files'));
			const firstUpdatedAt = observableValue<Date | undefined>('first-chat-updatedAt', new Date());
			const first = {
				...createChat('First task', ChatOriginKind.User),
				status: firstStatus,
				description: firstDescription,
				updatedAt: firstUpdatedAt,
			};
			const secondStatus = observableValue('second-chat-status', SessionStatus.InProgress);
			const secondDescription = observableValue<IMarkdownString | undefined>('second-chat-description', new MarkdownString('Running tests'));
			const second = {
				...createChat('Second task', ChatOriginKind.User),
				status: secondStatus,
				description: secondDescription,
			};
			const main = createChat('Main chat');
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, first, second]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const hovers = new Map<HTMLElement, () => IDelayedHoverOptions>();
			const { container } = renderSessionChatsList(session, undefined, false, true, false, instantiationService => {
				instantiationService.stub(IHoverService, {
					...NullHoverService,
					setupDelayedHoverAtMouse: (target, options) => {
						hovers.set(target, typeof options === 'function' ? options : () => options);
						return toDisposable(() => hovers.delete(target));
					},
				});
			});
			const snapshot = () => Object.fromEntries(
				[...container.querySelectorAll<HTMLElement>('.session-chat-item')].map(item => {
					const statusElement = item.querySelector<HTMLElement>('.session-chat-folder-row .session-description');
					return [
						item.querySelector('.session-chat-title')?.textContent,
						{
							message: statusElement?.textContent,
							hover: statusElement ? hovers.get(statusElement)?.().content : undefined,
							time: item.querySelector('.session-chat-time')?.textContent,
							ariaLabel: item.closest('.monaco-list-row')?.getAttribute('aria-label'),
						},
					];
				})
			);

			const whileActive = snapshot();
			firstStatus.set(SessionStatus.Completed, undefined);
			const afterFirstCompletes = snapshot();

			assert.deepStrictEqual({ whileActive, afterFirstCompletes }, {
				whileActive: {
					'First task': { message: 'Reading files', hover: 'Reading files', time: undefined, ariaLabel: 'First task, chat, State: In Progress, Reading files' },
					'Second task': { message: 'Running tests', hover: 'Running tests', time: undefined, ariaLabel: 'Second task, chat, State: In Progress, Running tests' },
				},
				afterFirstCompletes: {
					'First task': { message: undefined, hover: undefined, time: 'now', ariaLabel: 'First task, chat, updated now, State: Completed' },
					'Second task': { message: 'Running tests', hover: 'Running tests', time: undefined, ariaLabel: 'Second task, chat, State: In Progress, Running tests' },
				},
			});
		});

		test('shows child progress on the parent row only while the child is collapsed', () => {
			const mainStatus = observableValue('main-status', SessionStatus.Completed);
			const main = upcastPartial<IChat>({
				resource: URI.parse('test-chat://Main-chat'),
				workspace: constObservable(undefined),
				title: constObservable('Main chat'),
				updatedAt: constObservable(new Date()),
				status: mainStatus,
				isArchived: constObservable(false),
				isRead: constObservable(true),
				changes: constObservable([]),
				changesets: constObservable([]),
				interactivity: constObservable(ChatInteractivity.Full),
			});
			const active = createChat('Active chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.InProgress);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				status: constObservable(SessionStatus.InProgress),
				chats: constObservable([main, active]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session, undefined, true);
			const snapshot = () => ({
				parent: sessionRowSnapshot(container),
				parentHasProgress: !!container.querySelector('.session-item .session-icon > .monaco-pixel-spinner:not([data-icon-fading-out])'),
				childHasProgress: !!container.querySelector('.session-chat-item .session-chat-icon > .monaco-pixel-spinner:not([data-icon-fading-out])'),
			});
			const toggle = () => {
				const twistie = container.querySelector<HTMLElement>('.session-chat-twistie.collapsible');
				assert.ok(twistie);
				twistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			};

			const childOnlyExpanded = snapshot();
			toggle();
			const childOnlyCollapsed = snapshot();
			toggle();
			mainStatus.set(SessionStatus.InProgress, undefined);
			const parentAndChildExpanded = snapshot();
			toggle();
			const parentAndChildCollapsed = snapshot();

			assert.deepStrictEqual({ childOnlyExpanded, childOnlyCollapsed, parentAndChildExpanded, parentAndChildCollapsed }, {
				childOnlyExpanded: {
					parent: { inProgress: false, needsInput: false, ariaLabel: 'Session, updated now, State: Completed, in Workspace' },
					parentHasProgress: false,
					childHasProgress: true,
				},
				childOnlyCollapsed: {
					parent: { inProgress: true, needsInput: false, ariaLabel: 'Session, updated now, State: In Progress' },
					parentHasProgress: true,
					childHasProgress: false,
				},
				parentAndChildExpanded: {
					parent: { inProgress: true, needsInput: false, ariaLabel: 'Session, State: In Progress' },
					parentHasProgress: true,
					childHasProgress: true,
				},
				parentAndChildCollapsed: {
					parent: { inProgress: true, needsInput: false, ariaLabel: 'Session, State: In Progress' },
					parentHasProgress: true,
					childHasProgress: false,
				},
			});
		});

		test('collapsed parent progress does not observe child status', () => {
			let childStatusObservers = 0;
			const childStatusEmitter = disposables.add(new Emitter<void>({
				onDidAddListener: () => childStatusObservers++,
				onWillRemoveListener: () => childStatusObservers--,
			}));
			const main = createChat('Main chat');
			const child = upcastPartial<IChat>({
				resource: URI.parse('test-chat://Active-chat'),
				workspace: constObservable(undefined),
				title: constObservable('Active chat'),
				updatedAt: constObservable(new Date()),
				status: observableFromEvent(disposables, childStatusEmitter.event, () => SessionStatus.InProgress),
				description: constObservable(undefined),
				isArchived: constObservable(false),
				isRead: constObservable(true),
				interactivity: constObservable(ChatInteractivity.Full),
				origin: { kind: ChatOriginKind.User },
			});
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				status: constObservable(SessionStatus.InProgress),
				chats: constObservable([main, child]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const { container } = renderSessionChatsList(session, undefined, true, false);
			setSessionChatsExpanded(container, false);
			assert.deepStrictEqual({
				childStatusObservers,
				parentHasProgress: !!container.querySelector('.session-item .session-icon > .monaco-pixel-spinner:not([data-icon-fading-out])'),
				childRendered: !!container.querySelector('.session-chat-item'),
			}, {
				childStatusObservers: 0,
				parentHasProgress: true,
				childRendered: false,
			});
		});

		for (const aggregateStatus of [SessionStatus.InProgress, SessionStatus.NeedsInput, SessionStatus.Error]) {
			test(`collapsed parent uses aggregate status ${aggregateStatus} without inspecting peer status`, () => {
				const main = createChat('Main chat', undefined, ChatInteractivity.Full, SessionStatus.InProgress);
				const peer = createChat('Peer chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.InProgress);
				const status = observableValue('aggregate-status', aggregateStatus);
				const session: ISession = {
					...createTestSession('Session').session,
					status,
					chats: constObservable([main, peer]),
					mainChat: constObservable(main),
					capabilities: constObservable({ supportsMultipleChats: true }),
				};
				const { container } = renderSessionChatsList(session, undefined, true);
				setSessionChatsExpanded(container, false);
				const snapshot = () => ({
					...sessionRowSnapshot(container),
					hasProgress: !!container.querySelector('.session-item .session-icon > .monaco-pixel-spinner:not([data-icon-fading-out])'),
				});
				const collapsed = snapshot();
				setSessionChatsExpanded(container, true);
				const expanded = snapshot();
				setSessionChatsExpanded(container, false);
				status.set(SessionStatus.Completed, undefined);

				assert.deepStrictEqual({ collapsed, expanded, afterComplete: snapshot() }, {
					collapsed: {
						inProgress: aggregateStatus === SessionStatus.InProgress,
						needsInput: aggregateStatus === SessionStatus.NeedsInput,
						ariaLabel: `Session, State: ${aggregateStatus === SessionStatus.InProgress ? 'In Progress' : aggregateStatus === SessionStatus.NeedsInput ? 'Attention Needed' : 'Failed, in Workspace'}`,
						hasProgress: aggregateStatus === SessionStatus.InProgress,
					},
					expanded: { inProgress: true, needsInput: false, ariaLabel: 'Session, State: In Progress', hasProgress: true },
					afterComplete: { inProgress: false, needsInput: false, ariaLabel: 'Session, State: Completed, in Workspace', hasProgress: false },
				});
			});
		}

		test('keeps child progress on the parent when a filtered session is reinserted collapsed', () => {
			const main = createChat('Main chat');
			const active = createChat('Active chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.InProgress);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				status: constObservable(SessionStatus.InProgress),
				chats: constObservable([main, active]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const { container, list } = renderSessionChatsList(session, undefined, true);
			const twistie = container.querySelector<HTMLElement>('.session-chat-twistie.collapsible');
			assert.ok(twistie);
			twistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			const collapsedParentHasProgress = !!container.querySelector('.session-item .session-icon > .monaco-pixel-spinner');

			list.filters.setExcluded({ kind: 'environment', id: 'cloud' }, true);
			list.filters.setExcluded({ kind: 'environment', id: 'cloud' }, false);

			assert.deepStrictEqual({
				collapsedParentHasProgress,
				parent: sessionRowSnapshot(container),
				parentHasProgress: !!container.querySelector('.session-item .session-icon > .monaco-pixel-spinner:not([data-icon-fading-out])'),
				childHasProgress: !!container.querySelector('.session-chat-item .session-chat-icon > .monaco-pixel-spinner'),
			}, {
				collapsedParentHasProgress: true,
				parent: { inProgress: true, needsInput: false, ariaLabel: 'Session, updated now, State: In Progress' },
				parentHasProgress: true,
				childHasProgress: false,
			});
		});

		test('needs-input session and chat rows have static icons and warning backgrounds', () => {
			const main = createChat('Main chat', undefined, ChatInteractivity.Full, SessionStatus.NeedsInput);
			const waiting = createChat('Waiting chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.NeedsInput);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, waiting]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session, undefined, true);
			container.style.setProperty('--vscode-list-warningForeground', 'rgb(255, 0, 0)');
			const parent = container.querySelector<HTMLElement>('.session-item')!;
			const child = container.querySelector<HTMLElement>('.session-chat-item')!;
			assert.deepStrictEqual([parent, child].map(item => {
				const row = item.closest<HTMLElement>('.monaco-list-row')!;
				const background = item === parent ? row : item;
				const icon = item.querySelector<HTMLElement>('.session-icon > .codicon, .session-chat-icon > .codicon')!;
				return {
					needsInput: item.classList.contains('needs-input'),
					pulses: !!item.querySelector('.session-icon-pulse'),
					iconAnimation: mainWindow.getComputedStyle(icon).animationName,
					backgroundAnimation: mainWindow.getComputedStyle(background).animationName,
					hasWarningBackground: ['color(srgb 1 0 0 / 0.08)', 'rgba(255, 0, 0, 0.08)'].includes(mainWindow.getComputedStyle(background).backgroundColor),
				};
			}), [
				{ needsInput: true, pulses: false, iconAnimation: 'none', backgroundAnimation: 'none', hasWarningBackground: true },
				{ needsInput: true, pulses: false, iconAnimation: 'none', backgroundAnimation: 'none', hasWarningBackground: true },
			]);
		});

		test('needs-input chat row keeps its attention indicator without looping animations', () => {
			const main = createChat('Main chat');
			const waiting = createChat('Waiting chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.NeedsInput);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, waiting]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const { container } = renderSessionChatsList(session, undefined, true, true, false, instantiationService => {
				instantiationService.stub(ISessionsListModelService, 'getStatusIcon', SessionsListModelService.prototype.getStatusIcon);
			});

			const waitingRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.textContent?.includes('Waiting chat'));
			assert.ok(waitingRow);

			const icon = waitingRow.querySelector<HTMLElement>('.session-chat-icon > .codicon')!;
			const title = waitingRow.querySelector<HTMLElement>('.session-chat-title')!;
			assert.deepStrictEqual({
				needsInput: waitingRow.classList.contains('needs-input'),
				warningIcon: icon.classList.contains('codicon-report-question'),
				animations: [waitingRow.closest<HTMLElement>('.monaco-list-row')!, waitingRow, title, icon].map(element => mainWindow.getComputedStyle(element).animationName),
			}, {
				needsInput: true,
				warningIcon: true,
				animations: ['none', 'none', 'none', 'none'],
			});
		});

		for (const mainStatus of [SessionStatus.Completed, SessionStatus.InProgress, SessionStatus.NeedsInput]) {
			test(`collapsed parent shows aggregate input and restores its own status when expanded (${mainStatus})`, () => {
				const main = createChat('Main chat', undefined, ChatInteractivity.Full, mainStatus);
				const working = createChat('Working chat', ChatOriginKind.User, ChatInteractivity.ReadOnly, SessionStatus.InProgress);
				const waiting = createChat('Waiting chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.NeedsInput);
				const session: ISession = {
					...createTestSession('Session').session,
					status: constObservable(SessionStatus.NeedsInput),
					chats: constObservable([main, working, waiting]),
					mainChat: constObservable(main),
					capabilities: constObservable({ supportsMultipleChats: true }),
				};
				const { container } = renderSessionChatsList(session, undefined, true);
				const snapshot = () => ({
					...sessionRowSnapshot(container),
					parentHasProgress: !!container.querySelector('.session-item .monaco-pixel-spinner:not([data-icon-fading-out])'),
					children: [...container.querySelectorAll<HTMLElement>('.session-chat-item')].map(item => ({
						needsInput: item.classList.contains('needs-input'),
						hasProgress: !!item.querySelector('.monaco-pixel-spinner:not([data-icon-fading-out])'),
					})),
				});
				const expanded = snapshot();
				setSessionChatsExpanded(container, false);
				const collapsed = snapshot();
				setSessionChatsExpanded(container, true);
				const reexpanded = snapshot();
				const ownStatus = {
					inProgress: mainStatus === SessionStatus.InProgress,
					needsInput: mainStatus === SessionStatus.NeedsInput,
					ariaLabel: mainStatus === SessionStatus.InProgress ? 'Session, State: In Progress'
						: mainStatus === SessionStatus.NeedsInput ? 'Session, updated now, State: Attention Needed'
							: 'Session, updated now, State: Completed, in Workspace',
					parentHasProgress: mainStatus === SessionStatus.InProgress,
					children: [{ needsInput: false, hasProgress: true }, { needsInput: true, hasProgress: false }],
				};
				assert.deepStrictEqual({ expanded, collapsed, reexpanded }, {
					expanded: ownStatus,
					collapsed: {
						inProgress: false, needsInput: true,
						ariaLabel: mainStatus === SessionStatus.InProgress ? 'Session, State: Attention Needed' : 'Session, updated now, State: Attention Needed',
						parentHasProgress: false, children: [],
					},
					reexpanded: ownStatus,
				});
			});
		}

		function sessionRowSnapshot(container: HTMLElement) {
			const row = container.querySelector<HTMLElement>('.session-item');
			assert.ok(row);
			return {
				inProgress: row.classList.contains('in-progress'),
				needsInput: row.classList.contains('needs-input'),
				ariaLabel: row.closest('.monaco-list-row')?.getAttribute('aria-label') ?? null,
			};
		}

		test('parent session row reflects the main chat status, not a non-main chat NeedsInput that drives the aggregate session status', () => {
			const main = createChat('Main chat', undefined, ChatInteractivity.Full, SessionStatus.Completed);
			const peer = createChat('Peer chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.NeedsInput);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				status: constObservable(SessionStatus.NeedsInput),
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);

			const peerRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.textContent?.includes('Peer chat'));
			assert.ok(peerRow);

			assert.deepStrictEqual({
				session: sessionRowSnapshot(container),
				peerChatNeedsInput: peerRow.closest('.monaco-list-row')?.getAttribute('aria-label'),
				aggregateStatus: session.status.get(),
			}, {
				session: { inProgress: false, needsInput: false, ariaLabel: 'Session, updated now, State: Completed, in Workspace' },
				peerChatNeedsInput: 'Peer chat, chat, updated now, State: Attention Needed',
				aggregateStatus: SessionStatus.NeedsInput,
			});
		});

		for (const { expanded, withPeer } of [{ expanded: true, withPeer: true }, { expanded: false, withPeer: true }, { expanded: true, withPeer: false }]) {
			test(`side chat activity has its own row when expanded and aggregates when collapsed ${withPeer ? 'with peers' : 'without peers'} (expanded=${expanded})`, () => {
				const mainStatus = observableValue('main-status', SessionStatus.Completed);
				const main = { ...createChat('Main chat'), status: mainStatus };
				const peers = withPeer ? [createChat('Peer chat', ChatOriginKind.User)] : [];
				const sideStatus = observableValue('side-status', SessionStatus.Completed);
				const sideArchived = observableValue('side-archived', false);
				const sideInteractivity = observableValue('side-interactivity', ChatInteractivity.Full);
				const side = {
					...createChat('Side chat', ChatOriginKind.SideChat),
					status: sideStatus,
					isArchived: sideArchived,
					interactivity: sideInteractivity,
				};
				const chats = observableValue<readonly IChat[]>('chats', [main, ...peers]);
				const session: ISession = {
					...createTestSession('Session').session,
					chats,
					status: derived(reader => {
						const statuses = chats.read(reader).map(chat => chat.status.read(reader));
						return statuses.includes(SessionStatus.NeedsInput) ? SessionStatus.NeedsInput
							: statuses.includes(SessionStatus.InProgress) ? SessionStatus.InProgress : SessionStatus.Completed;
					}),
					mainChat: constObservable(main),
					capabilities: constObservable({ supportsMultipleChats: true }),
				};
				const { container } = renderSessionChatsList(session, undefined, false, expanded);
				setSessionChatsExpanded(container, expanded);
				const snapshots = [sessionRowSnapshot(container)];
				const capture = () => snapshots.push(sessionRowSnapshot(container));

				sideStatus.set(SessionStatus.InProgress, undefined);
				chats.set([main, ...peers, side], undefined);
				capture();
				sideStatus.set(SessionStatus.NeedsInput, undefined);
				capture();
				mainStatus.set(SessionStatus.InProgress, undefined);
				capture();
				sideStatus.set(SessionStatus.Completed, undefined);
				capture();
				mainStatus.set(SessionStatus.Completed, undefined);
				capture();
				sideStatus.set(SessionStatus.InProgress, undefined);
				sideArchived.set(true, undefined);
				capture();
				sideArchived.set(false, undefined);
				capture();
				sideInteractivity.set(ChatInteractivity.Hidden, undefined);
				capture();
				sideInteractivity.set(ChatInteractivity.Full, undefined);
				capture();
				sideStatus.set(SessionStatus.NeedsInput, undefined);
				sideArchived.set(true, undefined);
				capture();
				sideArchived.set(false, undefined);
				capture();
				sideInteractivity.set(ChatInteractivity.Hidden, undefined);
				capture();
				sideInteractivity.set(ChatInteractivity.Full, undefined);
				chats.set([main, ...peers], undefined);
				capture();

				const completed = { inProgress: false, needsInput: false, ariaLabel: 'Session, updated now, State: Completed, in Workspace' };
				const working = { inProgress: true, needsInput: false, ariaLabel: 'Session, updated now, State: In Progress' };
				const waiting = { inProgress: false, needsInput: true, ariaLabel: 'Session, updated now, State: Attention Needed' };
				const workingWithoutTime = { inProgress: true, needsInput: false, ariaLabel: 'Session, State: In Progress' };
				const waitingWithoutTime = { inProgress: false, needsInput: true, ariaLabel: 'Session, State: Attention Needed' };
				assert.deepStrictEqual({ snapshots, chats: chatRowTitles(container) }, {
					snapshots: !expanded
						? [completed, working, waiting, waitingWithoutTime, workingWithoutTime, completed, working, working, working, working, waiting, waiting, waiting, completed]
						: [completed, completed, completed, workingWithoutTime, workingWithoutTime, completed, completed, completed, completed, completed, completed, completed, completed, completed],
					chats: expanded && withPeer ? ['Peer chat'] : [],
				});
			});
		}

		for (const exclusion of ['archived', 'hidden'] as const) {
			test(`collapsed parent uses aggregate progress including an ${exclusion} side chat`, () => {
				const main = createChat('Main chat');
				const peerStatus = observableValue('peer-status', SessionStatus.Completed);
				const peer = { ...createChat('Peer chat', ChatOriginKind.User), status: peerStatus };
				const sideStatus = observableValue('side-status', SessionStatus.InProgress);
				const side = {
					...createChat('Side chat', ChatOriginKind.SideChat),
					status: sideStatus,
					isArchived: constObservable(exclusion === 'archived'),
					interactivity: constObservable(exclusion === 'hidden' ? ChatInteractivity.Hidden : ChatInteractivity.Full),
				};
				const session: ISession = {
					...createTestSession('Session').session,
					chats: constObservable([main, peer, side]),
					status: derived(reader => peerStatus.read(reader) === SessionStatus.InProgress || sideStatus.read(reader) === SessionStatus.InProgress
						? SessionStatus.InProgress : SessionStatus.Completed),
					mainChat: constObservable(main),
					capabilities: constObservable({ supportsMultipleChats: true }),
				};
				const { container } = renderSessionChatsList(session);
				setSessionChatsExpanded(container, false);
				const snapshots = [sessionRowSnapshot(container)];
				peerStatus.set(SessionStatus.InProgress, undefined);
				snapshots.push(sessionRowSnapshot(container));
				peerStatus.set(SessionStatus.Completed, undefined);
				snapshots.push(sessionRowSnapshot(container));
				sideStatus.set(SessionStatus.Completed, undefined);
				snapshots.push(sessionRowSnapshot(container));

				const completed = { inProgress: false, needsInput: false, ariaLabel: 'Session, updated now, State: Completed, in Workspace' };
				const working = { inProgress: true, needsInput: false, ariaLabel: 'Session, updated now, State: In Progress' };
				assert.deepStrictEqual(snapshots, [working, working, working, completed]);
			});
		}

		test('parent session row still shows NeedsInput when the main chat needs input while a hidden child is in progress', () => {
			const main = createChat('Main chat', undefined, ChatInteractivity.Full, SessionStatus.NeedsInput);
			const subagent = createChat('Subagent chat', ChatOriginKind.Tool, ChatInteractivity.ReadOnly, SessionStatus.InProgress);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				status: constObservable(SessionStatus.NeedsInput),
				chats: constObservable([main, subagent]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);

			assert.deepStrictEqual(sessionRowSnapshot(container), {
				inProgress: false,
				needsInput: true,
				ariaLabel: 'Session, updated now, State: Attention Needed',
			});
		});

		test('parent session row updates reactively when the main chat status changes independently of a non-main chat', () => {
			const mainStatus = observableValue('main-status', SessionStatus.Completed);
			const main = upcastPartial<IChat>({
				resource: URI.parse('test-chat://Main-chat'),
				workspace: constObservable(undefined),
				title: constObservable('Main chat'),
				updatedAt: constObservable(new Date()),
				status: mainStatus,
				isArchived: constObservable(false),
				isRead: constObservable(true),
				changes: constObservable([]),
				changesets: constObservable([]),
				interactivity: constObservable(ChatInteractivity.Full),
			});
			const peer = createChat('Peer chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.NeedsInput);
			const aggregateStatus = observableValue('aggregate-status', SessionStatus.NeedsInput);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				status: aggregateStatus,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);
			const before = sessionRowSnapshot(container);

			mainStatus.set(SessionStatus.NeedsInput, undefined);

			assert.deepStrictEqual({ before, after: sessionRowSnapshot(container) }, {
				before: { inProgress: false, needsInput: false, ariaLabel: 'Session, updated now, State: Completed, in Workspace' },
				after: { inProgress: false, needsInput: true, ariaLabel: 'Session, updated now, State: Attention Needed' },
			});
		});

		test('failed non-main chat shows an error icon on its own row', () => {
			const main = createChat('Main chat', undefined, ChatInteractivity.Full, SessionStatus.Completed);
			const peer = createChat('Failed chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.Error);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);
			const peerRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.textContent?.includes('Failed chat'));
			assert.ok(peerRow);

			assert.deepStrictEqual({
				errorIcon: !!peerRow.querySelector('.codicon-error'),
				ariaLabel: peerRow.closest('.monaco-list-row')?.getAttribute('aria-label'),
			}, {
				errorIcon: true,
				ariaLabel: 'Failed chat, chat, updated now, State: Failed',
			});
		});

		test('does not repeat the fallback needs input message in a chat row aria label', () => {
			const main = createChat('Main chat');
			const peer = createChat('Needs input chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.NeedsInput);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);
			const peerRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.textContent?.includes('Needs input chat'));
			assert.ok(peerRow);
			assert.strictEqual(peerRow.closest('.monaco-list-row')?.getAttribute('aria-label'), 'Needs input chat, chat, updated now, State: Attention Needed');
		});

		test('updates rendered chat row heights across phone layout changes', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = { ...base, chats: constObservable([main, peer]), mainChat: constObservable(main) };
			const harness = createListHarness(disposables, [session], instantiationService => {
				instantiationService.stub(IContextKeyService, disposables.add(new ContextKeyService(new TestConfigurationService())));
			});
			const phoneLayout = IsPhoneLayoutContext.bindTo(harness.instantiationService.get(IContextKeyService));
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			setSessionChatsExpanded(container, true);
			const chatRow = container.querySelector<HTMLElement>('.session-chat-item')?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(chatRow);
			const desktopHeight = chatRow.style.height;

			phoneLayout.set(true);
			const phoneChatRow = container.querySelector<HTMLElement>('.session-chat-item')?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(phoneChatRow);

			assert.deepStrictEqual({ desktopHeight, phoneHeight: phoneChatRow.style.height }, {
				desktopHeight: '56px',
				phoneHeight: '62px',
			});
		});

		test('opens the selected nested chat', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const opened: { session: ISession; chat: IChat; preserveFocus: boolean; sideBySide: boolean }[] = [];
			const container = renderSessionChats(session, (openedSession, chat, preserveFocus, sideBySide) => {
				opened.push({ session: openedSession, chat, preserveFocus, sideBySide });
			});
			const peerRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.querySelector('.session-chat-title')?.textContent === 'Peer chat');
			assert.ok(peerRow);

			peerRow.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

			assert.deepStrictEqual(opened, [{
				session,
				chat: peer,
				preserveFocus: false,
				sideBySide: false,
			}]);
		});

		test('reports a focused nested chat only while the Sessions list owns focus', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const second = createChat('Second peer chat', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer, second]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const harness = createListHarness(disposables, [session], instantiationService => {
				instantiationService.stub(IContextKeyService, disposables.add(new ContextKeyService(new TestConfigurationService())));
			});
			const contextKeyService = harness.instantiationService.get(IContextKeyService);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
				onChatOpen: () => { },
			}));
			list.layout(300, 400);
			setSessionChatsExpanded(container, true);
			list.reveal(session.resource);
			list.focus();
			const contextTarget = container.querySelector<HTMLElement>('.monaco-list');
			assert.ok(contextTarget);
			const getFocusedChatItemContext = () => contextKeyService.getContext(contextTarget).getValue<boolean>(SessionsListFocusedChatItemContext.key);
			const sessionRowValue = getFocusedChatItemContext();
			const beforeChatFocus = list.getFocusedChatItem();
			const beforeChatSelection = list.getFocusedChatItems();

			const peerRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.querySelector('.session-chat-title')?.textContent === 'Peer chat');
			assert.ok(peerRow);
			peerRow.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			list.focus();
			const focusedChat = list.getFocusedChatItem();
			const focusedChats = list.getFocusedChatItems().map(item => item.chat.resource.toString());
			const chatRowValue = getFocusedChatItemContext();
			const secondRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.querySelector('.session-chat-title')?.textContent === 'Second peer chat');
			assert.ok(secondRow);
			secondRow.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, shiftKey: true }));
			list.focus();
			const selectedChats = list.getFocusedChatItems().map(item => item.chat.resource.toString()).sort();

			const outside = mainWindow.document.createElement('button');
			mainWindow.document.body.appendChild(outside);
			harness.store.add({ dispose: () => outside.remove() });
			outside.focus();
			contextTarget.dispatchEvent(new FocusEvent('blur'));

			assert.deepStrictEqual({
				sessionRowValue,
				beforeChatFocus,
				beforeChatSelection,
				focusedChat: focusedChat?.chat.resource.toString(),
				focusedChats,
				selectedChats,
				chatRowValue,
				afterBlur: list.getFocusedChatItem(),
				selectionAfterBlur: list.getFocusedChatItems(),
				afterBlurValue: getFocusedChatItemContext(),
			}, {
				sessionRowValue: false,
				beforeChatFocus: undefined,
				beforeChatSelection: [],
				focusedChat: peer.resource.toString(),
				focusedChats: [peer.resource.toString()],
				selectedChats: [peer.resource.toString(), second.resource.toString()].sort(),
				chatRowValue: true,
				afterBlur: undefined,
				selectionAfterBlur: [],
				afterBlurValue: false,
			});
		});

		test('opens a nested chat to the side with the session row modifier gesture', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const opened: { chat: IChat; preserveFocus: boolean; sideBySide: boolean }[] = [];
			const container = renderSessionChats(session, (_session, chat, preserveFocus, sideBySide) => {
				opened.push({ chat, preserveFocus, sideBySide });
			});
			const peerRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.querySelector('.session-chat-title')?.textContent === 'Peer chat');
			assert.ok(peerRow);

			peerRow.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, altKey: true }));

			assert.deepStrictEqual(opened, [{
				chat: peer,
				preserveFocus: false,
				sideBySide: true,
			}]);
		});

		test('coalesces restored active chat selection without flashing the parent session', async () => {
			const main = createChat('Main chat');
			const first = createChat('First chat', ChatOriginKind.User);
			const second = createChat('Second chat', ChatOriginKind.User);
			const side = createChat('Side chat', ChatOriginKind.SideChat);
			const activeChat = observableValue<IChat>('active-chat', first);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, first, second, side]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const activeSession = upcastPartial<IActiveSession>({
				...session,
				activeChat,
				sticky: constObservable(false),
				isCreated: constObservable(true),
				visibleChatTabs: constObservable([main, first, second, side]),
			});
			const harness = createListHarness(disposables, [session], instantiationService => {
				instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
					override readonly activeSession = constObservable(activeSession);
					override readonly visibleSessions = constObservable([activeSession]);
				});
			});

			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const initiallySelected = container.querySelector('.monaco-list-row.selected .session-chat-title')?.textContent;
			const twistie = container.querySelector<HTMLElement>('.session-chat-twistie');
			assert.ok(twistie);
			twistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			const focusTarget = mainWindow.document.createElement('button');
			mainWindow.document.body.appendChild(focusTarget);
			disposables.add({ dispose: () => focusTarget.remove() });
			focusTarget.focus();

			activeChat.set(main, undefined);
			const selectionDuringRestore = container.querySelector('.monaco-list-row.selected .session-chat-title')?.textContent;
			const parentDuringRestore = container.querySelector('.monaco-list-row.selected .session-title')?.textContent;
			activeChat.set(second, undefined);
			const selectionBeforeFrame = container.querySelector('.monaco-list-row.selected .session-chat-title')?.textContent;
			const parentBeforeFrame = container.querySelector('.monaco-list-row.selected .session-title')?.textContent;
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			const selectedChat = container.querySelector('.monaco-list-row.selected .session-chat-title')?.textContent;
			activeChat.set(side, undefined);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			const selectedSideChat = container.querySelector('.monaco-list-row.selected .session-chat-title')?.textContent;
			const parentDuringSideChat = container.querySelector('.monaco-list-row.selected .session-title')?.textContent;
			activeChat.set(main, undefined);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			const mainSelection = container.querySelector('.monaco-list-row.selected .session-title')?.textContent;
			const expanded = twistie.closest('.monaco-list-row')?.getAttribute('aria-expanded');
			const activeElement = mainWindow.document.activeElement;
			list.dispose();

			const restoredContainer = harness.createContainer();
			const restoredList = harness.store.add(harness.instantiationService.createInstance(SessionsList, restoredContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			restoredList.layout(300, 400);

			assert.deepStrictEqual({
				initiallySelected,
				selectionDuringRestore,
				parentDuringRestore,
				selectionBeforeFrame,
				parentBeforeFrame,
				selectedChat,
				selectedSideChat,
				parentDuringSideChat,
				mainSelection,
				expanded,
				activeElement,
				restoredExpanded: restoredContainer.querySelector('.session-chat-twistie')?.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
			}, {
				initiallySelected: 'First chat',
				selectionDuringRestore: undefined,
				parentDuringRestore: undefined,
				selectionBeforeFrame: undefined,
				parentBeforeFrame: undefined,
				selectedChat: 'Second chat',
				selectedSideChat: 'Side chat',
				parentDuringSideChat: undefined,
				mainSelection: 'Session',
				expanded: 'true',
				activeElement: focusTarget,
				restoredExpanded: 'false',
			});
		});

		test('does not reposition an already visible chat when it becomes active', async () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const activeChat = observableValue<IChat>('active-chat', main);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const activeSession = upcastPartial<IActiveSession>({
				...session,
				activeChat,
				sticky: constObservable(false),
				isCreated: constObservable(true),
				visibleChatTabs: constObservable([main, peer]),
			});
			const harness = createListHarness(disposables, [session], instantiationService => {
				instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
					override readonly activeSession = constObservable(activeSession);
					override readonly visibleSessions = constObservable([activeSession]);
				});
			});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const revealSpy = sinon.spy(WorkbenchObjectTree.prototype, 'reveal');
			disposables.add(toDisposable(() => revealSpy.restore()));

			activeChat.set(peer, undefined);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));

			assert.strictEqual(revealSpy.callCount, 0);
		});

		test('ordinary list updates preserve a collapsed active session and user selection', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const activeSessionBase = createTestSession('Session').session;
			const session: ISession = { ...activeSessionBase, chats: constObservable([main, peer]), mainChat: constObservable(main) };
			const activeSession = upcastPartial<IActiveSession>({
				...session,
				activeChat: constObservable(peer),
				sticky: constObservable(false),
				isCreated: constObservable(true),
				visibleChatTabs: constObservable([main, peer]),
			});
			const harness = createListHarness(disposables, [session], instantiationService => {
				instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
					override readonly activeSession = constObservable(activeSession);
					override readonly visibleSessions = constObservable([activeSession]);
				});
			});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			list.reveal(session.resource);
			const twistie = container.querySelector<HTMLElement>('.session-chat-twistie');
			assert.ok(twistie);
			twistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

			list.update();

			assert.deepStrictEqual({
				expanded: twistie.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
				selected: container.querySelector('.monaco-list-row.selected .session-title')?.textContent,
			}, {
				expanded: 'false',
				selected: 'Session',
			});
		});

		test('drags a nested chat with the chat-group payload instead of a session payload', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const container = renderSessionChats(session);
			const peerRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.querySelector('.session-chat-title')?.textContent === 'Peer chat')
				?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(peerRow);
			const dataTransfer = new DataTransfer();
			const dragStart = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer });

			peerRow.dispatchEvent(dragStart);

			assert.deepStrictEqual({
				isChatDrag: isSessionChatDrag(dragStart),
				isSameSessionDrag: isSessionChatDrag(dragStart, session.sessionId),
				sessionPayload: dataTransfer.getData(SessionsDataTransfers.SESSION),
				chatPayload: getSessionChatDragData(dragStart),
			}, {
				isChatDrag: true,
				isSameSessionDrag: true,
				sessionPayload: '',
				chatPayload: { sessionId: session.sessionId, resource: peer.resource.toString() },
			});
		});

		test('drops a session onto a nested chat row below the chat\'s session', () => {
			const now = Date.now();
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Parent', { createdAt: new Date(now) }).session;
			const parent: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const other = createTestSession('Other', { createdAt: new Date(now + 60_000) }).session;
			const harness = createListHarness(disposables, [parent, other]);
			const container = harness.createContainer();
			harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			})).layout(300, 400);
			setSessionChatsExpanded(container, true, 'Parent');
			const otherRow = [...container.querySelectorAll<HTMLElement>('.session-title')]
				.find(element => element.textContent === 'Other')
				?.closest<HTMLElement>('.monaco-list-row');
			const peerRow = container.querySelector<HTMLElement>('.session-chat-item')?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(otherRow && peerRow);

			const dataTransfer = new DataTransfer();
			otherRow.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
			peerRow.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
			peerRow.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
			otherRow.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));

			assert.deepStrictEqual(harness.sortChanges.map(change => Object.fromEntries(change.set)), [{ Other: now - 60_000 }]);
		});

		test('starts nested chats expanded and uses the native twistie only for sessions with nested chats', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const multiChatBase = createTestSession('Multi-chat session').session;
			const multiChatSession: ISession = {
				...multiChatBase,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const singleChatBase = createTestSession('Single-chat session').session;
			const singleChatSession: ISession = {
				...singleChatBase,
				chats: constObservable([main]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const harness = createListHarness(disposables, [multiChatSession, singleChatSession]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const rows = Object.fromEntries([...container.querySelectorAll<HTMLElement>('.session-item')].map(item => {
				const row = item.closest<HTMLElement>('.monaco-list-row');
				const twistie = row?.querySelector<HTMLElement>('.monaco-tl-twistie');
				const icon = item.querySelector<HTMLElement>('.session-icon');
				const twistieStyle = twistie?.classList.contains('session-chat-twistie')
					? mainWindow.getComputedStyle(twistie)
					: undefined;
				return [item.querySelector('.session-title')?.textContent, {
					expanded: row?.getAttribute('aria-expanded'),
					hasSessionChatTwistie: twistie?.classList.contains('session-chat-twistie'),
					hasHiddenTwistie: twistie?.classList.contains('force-no-twistie'),
					hasNativeGlyph: twistie?.classList.contains('codicon-tree-item-expanded'),
					isCollapsible: twistie?.classList.contains('collapsible'),
					isCollapsed: twistie?.classList.contains('collapsed'),
					fontSize: twistieStyle?.fontSize,
					opacity: twistieStyle?.opacity,
					paddingLeft: twistie?.style.paddingLeft,
					pointerEvents: twistieStyle?.pointerEvents,
					iconVisibility: icon ? mainWindow.getComputedStyle(icon).visibility : undefined,
				}];
			}));

			assert.deepStrictEqual(rows, {
				'Multi-chat session': {
					expanded: 'true',
					hasSessionChatTwistie: true,
					hasHiddenTwistie: false,
					hasNativeGlyph: true,
					isCollapsible: true,
					isCollapsed: false,
					fontSize: '11px',
					opacity: '0',
					paddingLeft: '0px',
					pointerEvents: 'none',
					iconVisibility: 'visible',
				},
				'Single-chat session': {
					expanded: null,
					hasSessionChatTwistie: false,
					hasHiddenTwistie: true,
					hasNativeGlyph: false,
					isCollapsible: false,
					isCollapsed: false,
					fontSize: undefined,
					opacity: undefined,
					paddingLeft: '0px',
					pointerEvents: undefined,
					iconVisibility: 'visible',
				},
			});

			const multiChatItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
				.find(item => item.querySelector('.session-title')?.textContent === 'Multi-chat session');
			assert.ok(multiChatItem);
			multiChatItem.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1 }));
			multiChatItem.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 2 }));
			assert.strictEqual(multiChatItem.closest('.monaco-list-row')?.getAttribute('aria-expanded'), 'true');

			const twistie = multiChatItem.closest('.monaco-list-row')?.querySelector<HTMLElement>('.monaco-tl-twistie');
			assert.ok(twistie);
			twistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

			assert.deepStrictEqual({
				expanded: twistie.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
				isCollapsed: twistie.classList.contains('collapsed'),
				visibleChats: chatRowTitles(container),
			}, {
				expanded: 'false',
				isCollapsed: true,
				visibleChats: [],
			});
		});

		test('persists a user-collapsed nested session across list recreation', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const harness = createListHarness(disposables, [session]);
			const createList = () => {
				const container = harness.createContainer();
				const list = harness.instantiationService.createInstance(SessionsList, container, {
					grouping: () => SessionsGrouping.Date,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
				});
				list.layout(300, 400);
				return { container, list };
			};

			const first = createList();
			const firstTwistie = first.container.querySelector<HTMLElement>('.session-chat-twistie');
			assert.ok(firstTwistie);
			firstTwistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			first.list.dispose();

			const second = createList();
			const secondTwistie = second.container.querySelector<HTMLElement>('.session-chat-twistie');
			assert.ok(secondTwistie);
			const restoredCollapsed = secondTwistie.closest('.monaco-list-row')?.getAttribute('aria-expanded');
			secondTwistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			second.list.dispose();

			const third = createList();
			assert.deepStrictEqual({
				restoredCollapsed,
				restoredExpanded: third.container.querySelector('.session-chat-twistie')?.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
			}, {
				restoredCollapsed: 'false',
				restoredExpanded: 'true',
			});
			third.list.dispose();
		});

		test('reveals the twistie only on real pointer hover, never on keyboard focus or selection alone', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Multi-chat session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);

			const item = container.querySelector<HTMLElement>('.session-item');
			assert.ok(item);
			const row = item.closest<HTMLElement>('.monaco-list-row');
			assert.ok(row);
			const twistie = row.querySelector<HTMLElement>('.monaco-tl-twistie');
			assert.ok(twistie);
			const icon = item.querySelector<HTMLElement>('.session-icon');
			assert.ok(icon);

			const snapshot = () => ({
				opacity: mainWindow.getComputedStyle(twistie).opacity,
				pointerEvents: mainWindow.getComputedStyle(twistie).pointerEvents,
				iconVisibility: mainWindow.getComputedStyle(icon).visibility,
			});

			row.classList.add('focused');
			assert.deepStrictEqual(snapshot(), { opacity: '0', pointerEvents: 'none', iconVisibility: 'visible' });
			row.classList.remove('focused');

			row.classList.add('selected');
			assert.deepStrictEqual(snapshot(), { opacity: '0', pointerEvents: 'none', iconVisibility: 'visible' });

			row.classList.add('focused');
			assert.deepStrictEqual(snapshot(), { opacity: '0', pointerEvents: 'none', iconVisibility: 'visible' });
			row.classList.remove('focused', 'selected');
		});

		suite('hierarchy indent/connector guides', () => {

			function twoSessionContainer(activePeer = false): { readonly container: HTMLElement; readonly session: ISession; readonly other: ISession } {
				const main = createChat('Main chat');
				const peer = createChat('Peer chat', ChatOriginKind.User);
				const base = createTestSession('Session').session;
				const session: ISession = {
					...base,
					chats: constObservable([main, peer]),
					mainChat: constObservable(main),
					capabilities: constObservable({ supportsMultipleChats: true }),
				};
				const otherBase = createTestSession('Other session').session;
				const other: ISession = {
					...otherBase,
					chats: constObservable([createChat('Other main chat'), createChat('Other peer chat', ChatOriginKind.User)]),
					mainChat: constObservable(createChat('Other main chat')),
					capabilities: constObservable({ supportsMultipleChats: true }),
				};
				const activeSession = upcastPartial<IActiveSession>({
					...session,
					activeChat: constObservable(peer),
					sticky: constObservable(false),
					isCreated: constObservable(true),
					visibleChatTabs: constObservable([main, peer]),
				});
				const harness = createListHarness(disposables, [session, other], instantiationService => {
					if (activePeer) {
						instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
							override readonly activeSession = constObservable(activeSession);
							override readonly visibleSessions = constObservable([activeSession]);
						});
					}
				});
				const container = harness.createContainer();
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
					grouping: () => SessionsGrouping.Date,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
					onChatOpen: () => { },
				}));
				list.layout(300, 400);
				if (!activePeer) {
					setSessionChatsExpanded(container, true, 'Session');
					setSessionChatsExpanded(container, true, 'Other session');
					list.clearFocus();
				}
				return { container, session, other };
			}

			/** Reads guide visibility for a session row and the run of chat rows immediately following it. */
			function guidesVisible(container: HTMLElement, title: string): { session: boolean; chats: boolean[] } {
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === title);
				const sessionRow = sessionItem?.closest<HTMLElement>('.monaco-list-row');
				const sessionIndex = sessionRow ? Number(sessionRow.getAttribute('data-index')) : -1;

				const ownChats: HTMLElement[] = [];
				for (const row of [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]) {
					if (Number(row.getAttribute('data-index')) <= sessionIndex) {
						continue;
					}
					const chatItem = row.querySelector<HTMLElement>('.session-chat-item');
					if (!chatItem) {
						break;
					}
					ownChats.push(chatItem);
				}

				return {
					session: !!sessionItem?.classList.contains('session-hierarchy-guides-visible'),
					chats: ownChats.map(chatItem => chatItem.classList.contains('session-hierarchy-guides-visible')),
				};
			}

			test('guides are hidden at rest', () => {
				const { container } = twoSessionContainer();
				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: false, chats: [false] });
			});

			test('hovering the parent session row reveals its own guides only', () => {
				const { container } = twoSessionContainer();
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Session');
				assert.ok(sessionItem);

				sessionItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: false, chats: [false] });
			});

			test('hovering a chat child reveals its parent session hierarchy guides only', () => {
				const { container } = twoSessionContainer();
				const chatItem = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
					.find(item => item.querySelector('.session-chat-title')?.textContent === 'Peer chat');
				assert.ok(chatItem);

				chatItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: false, chats: [false] });
			});

			test('moving the pointer away hides the guides again', () => {
				const { container } = twoSessionContainer();
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Session');
				assert.ok(sessionItem);
				const sessionRow = sessionItem.closest<HTMLElement>('.monaco-list-row');
				assert.ok(sessionRow);

				sessionItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });

				sessionRow.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: false, chats: [false] });
			});

			test('selecting the parent session keeps guides visible without hover', () => {
				const { container } = twoSessionContainer();
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Session');
				assert.ok(sessionItem);

				sessionItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
				sessionItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
				sessionItem.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: false, chats: [false] });
			});

			test('selecting a chat child keeps only its parent session guides visible', () => {
				const { container } = twoSessionContainer();
				const chatItem = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
					.find(item => item.querySelector('.session-chat-title')?.textContent === 'Peer chat');
				assert.ok(chatItem);

				chatItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
				chatItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
				chatItem.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: false, chats: [false] });
			});

			test('active chat synchronization focuses and selects the child row', () => {
				const { container } = twoSessionContainer(true);
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Session');
				const chatItem = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
					.find(item => item.querySelector('.session-chat-title')?.textContent === 'Peer chat');
				assert.ok(sessionItem);
				assert.ok(chatItem);
				const sessionRow = sessionItem.closest<HTMLElement>('.monaco-list-row');
				const chatRow = chatItem.closest<HTMLElement>('.monaco-list-row');
				assert.ok(sessionRow);
				assert.ok(chatRow);

				assert.deepStrictEqual({
					parentFocused: sessionRow.classList.contains('focused'),
					parentSelected: sessionRow.classList.contains('selected'),
					childFocused: chatRow.classList.contains('focused'),
					childSelected: chatRow.classList.contains('selected'),
					guides: guidesVisible(container, 'Session'),
				}, {
					parentFocused: false,
					parentSelected: false,
					childFocused: true,
					childSelected: true,
					guides: { session: true, chats: [true] },
				});
			});

			/** Moves tree focus without changing selection, matching keyboard navigation. */
			function focusOnly(element: HTMLElement): void {
				element.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 2 }));
			}

			test('keyboard/focus-only navigation to the parent session row reveals its own guides only', () => {
				const { container } = twoSessionContainer();
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Session');
				assert.ok(sessionItem);
				const sessionRow = sessionItem.closest<HTMLElement>('.monaco-list-row');
				assert.ok(sessionRow);

				focusOnly(sessionItem);

				assert.deepStrictEqual({
					guides: guidesVisible(container, 'Session'),
					// Focus-only navigation must not also select the row.
					isSelected: sessionRow.classList.contains('selected'),
				}, {
					guides: { session: true, chats: [true] },
					isSelected: false,
				});
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: false, chats: [false] });
			});

			test('keyboard/focus-only navigation to a chat child reveals its parent session hierarchy guides only', () => {
				const { container } = twoSessionContainer();
				const chatItem = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
					.find(item => item.querySelector('.session-chat-title')?.textContent === 'Peer chat');
				assert.ok(chatItem);

				focusOnly(chatItem);

				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: false, chats: [false] });
			});

			test('moving focus-only navigation away hides the previous guides', () => {
				const { container } = twoSessionContainer();
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Session');
				const otherItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Other session');
				assert.ok(sessionItem);
				assert.ok(otherItem);

				focusOnly(sessionItem);
				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });

				focusOnly(otherItem);
				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: false, chats: [false] });
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: true, chats: [true] });
			});

			test('blurring the list hides focus-only guides', () => {
				const { container } = twoSessionContainer();
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Session');
				assert.ok(sessionItem);

				focusOnly(sessionItem);
				const tree = container.querySelector<HTMLElement>('.monaco-list');
				assert.ok(tree);
				tree.dispatchEvent(new FocusEvent('blur'));

				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: false, chats: [false] });
			});
		});

		function createApprovalModel(approvals: ReadonlyMap<string, IAgentSessionApprovalInfo>): AgentSessionApprovalModel {
			return new class extends mock<AgentSessionApprovalModel>() {
				override getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
					return constObservable(approvals.get(resource.toString()));
				}
			}();
		}

		function terminalApproval(chat: IChat, command: string): IAgentSessionApprovalInfo {
			return { approvalId: chat.resource.toString(), kind: AgentSessionApprovalKind.Terminal, label: command, languageId: 'shellscript', since: new Date(), confirm: () => { } };
		}

		function renderSessionChatsWithApprovals(session: ISession, approvalModel: AgentSessionApprovalModel): { container: HTMLElement; list: SessionsList } {
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
				approvalModel,
			}));
			list.layout(400, 400);
			setSessionChatsExpanded(container, true);
			return { container, list };
		}

		function approvalRowFor(container: HTMLElement, title: string): HTMLElement | undefined {
			return [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(item => item.querySelector('.session-chat-title')?.textContent === title)
				?.querySelector<HTMLElement>('.session-approval-row') ?? undefined;
		}

		for (const compact of [true, false]) {
			for (const lineCount of [1, 3]) {
				test(`keeps ${lineCount}-line approval height bounded while its ${compact ? 'compact' : 'normal'} session is sticky`, async () => {
					const main = createChat('Main chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.NeedsInput);
					const peers = Array.from({ length: 30 }, (_, index) => createChat(`Chat ${index}`, ChatOriginKind.User));
					const session: ISession = {
						...createTestSession('Pending approval', { status: SessionStatus.NeedsInput }).session,
						chats: constObservable([main, ...peers]),
						mainChat: constObservable(main),
						capabilities: constObservable({ supportsMultipleChats: true }),
					};
					const harness = createListHarness(disposables, [session], instantiationService => {
						void (instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration('editor', { fontFamily: 'monospace' });
						instantiationService.get(IMarkdownRendererService).setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
					});
					const command = Array.from({ length: lineCount }, (_, index) => `echo ${index}`).join('\n');
					const container = harness.createContainer(400, 600);
					const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
						grouping: () => SessionsGrouping.Date,
						sorting: () => SessionsSorting.Created,
						compact: () => compact,
						onSessionOpen: () => { },
						approvalModel: createApprovalModel(new Map([[main.resource.toString(), terminalApproval(main, command)]])),
					}));
					list.layout(600, 400);
					setSessionChatsExpanded(container, true);
					await timeout(0);
					assert.ok(container.querySelector('.session-approval-row .monaco-tokenized-source'));

					const row = () => container.querySelector<HTMLElement>('.monaco-list-rows .session-item')?.closest<HTMLElement>('.monaco-list-row');
					const initialHeight = row()?.offsetHeight;
					assert.ok(initialHeight && initialHeight > 0);
					const tree = Reflect.get(list, 'tree') as { scrollTop: number };
					const heights: number[] = [];
					let sawStickyApproval = false;
					for (let cycle = 0; cycle < 3; cycle++) {
						for (let position = 0; position < 900; position += 75) {
							tree.scrollTop = position;
							sawStickyApproval ||= !!container.querySelector('.monaco-tree-sticky-row .session-approval-row.visible');
							await timeout(0);
						}
						tree.scrollTop = 0;
						await timeout(0);
						heights.push(row()?.offsetHeight ?? 0);
					}
					assert.deepStrictEqual({ sawStickyApproval, heights }, { sawStickyApproval: true, heights: [initialHeight, initialHeight, initialHeight] });
				});
			}
		}

		test('keeps the static warning tint on a sticky needs-input session row', async () => {
			const main = createChat('Main chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.NeedsInput);
			const peers = Array.from({ length: 30 }, (_, index) => createChat(`Chat ${index}`, ChatOriginKind.User));
			const session: ISession = {
				...createTestSession('Pending approval', { status: SessionStatus.NeedsInput }).session,
				chats: constObservable([main, ...peers]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer(400, 600);
			container.style.setProperty('--vscode-list-warningForeground', 'rgb(255, 0, 0)');
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				compact: () => true,
				onSessionOpen: () => { },
			}));
			list.layout(600, 400);
			setSessionChatsExpanded(container, true);
			await timeout(0);
			const tree = Reflect.get(list, 'tree') as { scrollTop: number };
			let stickyImage: string | undefined;
			for (let position = 0; position < 900 && !stickyImage; position += 75) {
				tree.scrollTop = position;
				await timeout(0);
				const sticky = Array.from(container.querySelectorAll<HTMLElement>('.monaco-tree-sticky-row')).find(row => row.querySelector('.session-item.needs-input'));
				stickyImage = sticky ? mainWindow.getComputedStyle(sticky).backgroundImage : undefined;
			}
			assert.ok(stickyImage && stickyImage !== 'none');
		});

		test('renders a pending approval on the owning chat row only, not on its siblings', () => {
			const main = createChat('Main chat');
			const withApproval = createChat('Task A', ChatOriginKind.User);
			const withoutApproval = createChat('Task B', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, withApproval, withoutApproval]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const approvals = new Map([[withApproval.resource.toString(), terminalApproval(withApproval, 'npm run build')]]);
			const { container } = renderSessionChatsWithApprovals(session, createApprovalModel(approvals));

			const taskA = approvalRowFor(container, 'Task A');
			const taskB = approvalRowFor(container, 'Task B');
			assert.deepStrictEqual({
				taskAVisible: taskA?.classList.contains('visible'),
				taskAHasAllow: taskA?.querySelector('.session-approval-button .monaco-button')?.textContent,
				taskBVisible: taskB?.classList.contains('visible'),
				sessionRowApprovalVisible: container.querySelector<HTMLElement>('.session-item .session-approval-row')?.classList.contains('visible'),
			}, {
				taskAVisible: true,
				taskAHasAllow: 'Allow',
				taskBVisible: false,
				sessionRowApprovalVisible: false,
			});
		});

		test('renders the main chat approval on the session row, not on any chat row', () => {
			const main = createChat('Main chat');
			const peer = createChat('Task A', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const approvals = new Map([[main.resource.toString(), terminalApproval(main, 'git push --force')]]);
			const { container } = renderSessionChatsWithApprovals(session, createApprovalModel(approvals));

			assert.deepStrictEqual({
				sessionRowApprovalVisible: container.querySelector<HTMLElement>('.session-item .session-approval-row')?.classList.contains('visible'),
				chatRowApprovalVisible: approvalRowFor(container, 'Task A')?.classList.contains('visible'),
			}, {
				sessionRowApprovalVisible: true,
				chatRowApprovalVisible: false,
			});
		});

		test('renders and confirms out-of-band subagent approvals on the owning session row', () => {
			const { session } = createTestSession('Retained review', { status: SessionStatus.NeedsInput });
			const harness = createListHarness(disposables, [session]);
			const { instantiationService, store } = harness;
			const chatService = new MockChatService();
			instantiationService.stub(IChatService, chatService);
			instantiationService.stub(IChatAgentService, store.add(instantiationService.createInstance(ChatAgentService)));
			const model = store.add(instantiationService.createInstance(ChatModel, undefined, {
				initialLocation: ChatAgentLocation.Chat, canUseTools: true, resource: session.mainChat.get()!.resource,
			}));
			chatService.addSession(model);
			const approvalModel = store.add(instantiationService.createInstance(AgentSessionApprovalModel));
			const container = harness.createContainer();
			const list = store.add(instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
				approvalModel,
			}));
			list.layout(400, 400);

			const original = model.addRequest({ text: 'Launch the review', parts: [] }, { variables: [] }, 0);
			original.response!.complete();
			const latest = model.addRequest({ text: 'Follow-up', parts: [] }, { variables: [] }, 0);
			latest.response!.complete();
			const tools = ['compiler-check', 'helper-tests'].map(command => new ChatToolInvocation({
				invocationMessage: command,
				confirmationMessages: { title: 'Run in terminal?', message: new MarkdownString(command) },
				toolSpecificData: { kind: 'terminal', commandLine: { original: command }, language: 'shellscript', editable: false },
			}, { id: 'bash', displayName: 'Run Shell Command', modelDescription: 'Mock command', source: ToolDataSource.Internal },
				command, 'retained-agent', {}));
			for (const tool of tools) {
				original.response!.updateContent(tool);
			}
			const row = container.querySelector<HTMLElement>('.session-item .session-approval-row');
			assert.ok(row);
			const firstLabel = row.textContent;
			const firstAllow = row.querySelector<HTMLElement>('.session-approval-button .monaco-button');
			assert.ok(firstAllow);
			firstAllow.click();
			const nextLabel = row.textContent;
			const afterFirst = tools.map(tool => tool.state.get().type);
			const nextAllow = row.querySelector<HTMLElement>('.session-approval-button .monaco-button');
			assert.ok(nextAllow);
			nextAllow.click();

			assert.deepStrictEqual({
				latestNeedsInput: model.requestNeedsInput.get(),
				firstCommandShown: firstLabel?.includes('compiler-check'),
				nextCommandShown: nextLabel?.includes('helper-tests'),
				afterFirst,
				afterBoth: tools.map(tool => tool.state.get().type),
				approvalVisibleAfterBoth: row.classList.contains('visible'),
			}, {
				latestNeedsInput: undefined,
				firstCommandShown: true,
				nextCommandShown: true,
				afterFirst: [IChatToolInvocation.StateKind.Executing, IChatToolInvocation.StateKind.WaitingForConfirmation],
				afterBoth: [IChatToolInvocation.StateKind.Executing, IChatToolInvocation.StateKind.Executing],
				approvalVisibleAfterBoth: false,
			});
		});

		test('reserves extra row height for a chat with a pending approval', () => {
			const main = createChat('Main chat');
			const withApproval = createChat('Task A', ChatOriginKind.User);
			const withoutApproval = createChat('Task B', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, withApproval, withoutApproval]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const approvals = new Map([[withApproval.resource.toString(), terminalApproval(withApproval, 'npm run build')]]);
			const { container } = renderSessionChatsWithApprovals(session, createApprovalModel(approvals));

			const rowHeight = (title: string) => [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(item => item.querySelector('.session-chat-title')?.textContent === title)
				?.closest<HTMLElement>('.monaco-list-row')?.style.height;

			const heights = { taskA: rowHeight('Task A'), taskB: rowHeight('Task B') };
			assert.ok(heights.taskA && heights.taskB && parseInt(heights.taskA) > parseInt(heights.taskB), `expected Task A (${heights.taskA}) taller than Task B (${heights.taskB})`);
		});

		test('reserves approval rounding slack in phone chat rows', () => {
			const main = createChat('Main chat');
			const peer = createChat('Task A', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const approvalModel = createApprovalModel(new Map([[peer.resource.toString(), terminalApproval(peer, 'npm run build')]]));
			const harness = createListHarness(disposables, [session], instantiationService => {
				instantiationService.stub(IContextKeyService, disposables.add(new ContextKeyService(new TestConfigurationService())));
			});
			IsPhoneLayoutContext.bindTo(harness.instantiationService.get(IContextKeyService)).set(true);
			const container = harness.createContainer();
			container.classList.add('agent-sessions-workbench', 'phone-layout');
			container.style.setProperty('--vscode-spacing-size60', '6px');
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
				approvalModel,
			}));
			list.layout(400, 400);
			setSessionChatsExpanded(container, true);

			const approvalRow = approvalRowFor(container, 'Task A');
			const chatRow = approvalRow?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(approvalRow);
			assert.ok(chatRow);
			assert.deepStrictEqual({
				height: chatRow.style.height,
				approvalBottomMargin: mainWindow.getComputedStyle(approvalRow).marginBottom,
			}, {
				height: '100px',
				approvalBottomMargin: '6px',
			});
		});

		test('confirms the chat approval when its Allow button is clicked', () => {
			const main = createChat('Main chat');
			const peer = createChat('Task A', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			let confirmed = 0;
			const approval: IAgentSessionApprovalInfo = { ...terminalApproval(peer, 'npm run build'), confirm: () => { confirmed++; } };
			const { container } = renderSessionChatsWithApprovals(session, createApprovalModel(new Map([[peer.resource.toString(), approval]])));

			const allow = approvalRowFor(container, 'Task A')?.querySelector<HTMLElement>('.session-approval-button .monaco-button');
			assert.ok(allow);
			allow.dispatchEvent(new MouseEvent('click', { bubbles: true }));

			assert.strictEqual(confirmed, 1);
		});

		test('grows a chat row height when its approval is replaced with a taller one', () => {
			const main = createChat('Main chat');
			const peer = createChat('Task A', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			// A settable approval so we can swap one pending approval directly for
			// another with a taller (multi-line) label — the row must re-reserve
			// height on that change, not only when an approval appears/clears.
			const pending = observableValue<IAgentSessionApprovalInfo | undefined>('pending', terminalApproval(peer, 'npm run build'));
			const approvalModel = new class extends mock<AgentSessionApprovalModel>() {
				override getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
					return resource.toString() === peer.resource.toString() ? pending : constObservable(undefined);
				}
			}();
			const { container } = renderSessionChatsWithApprovals(session, approvalModel);

			const taskARowHeight = () => [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(item => item.querySelector('.session-chat-title')?.textContent === 'Task A')
				?.closest<HTMLElement>('.monaco-list-row')?.style.height;

			const singleLineHeight = taskARowHeight();
			pending.set(terminalApproval(peer, 'line one\nline two\nline three'), undefined);
			const multiLineHeight = taskARowHeight();

			assert.ok(singleLineHeight && multiLineHeight && parseInt(multiLineHeight) > parseInt(singleLineHeight), `expected taller row after multi-line approval (${singleLineHeight} -> ${multiLineHeight})`);
		});

		test('reconciles a chat row height for an approval that changed while virtualized offscreen', () => {
			const main = createChat('Main chat');
			// Enough chats that, with a short viewport, the target row is
			// virtualized offscreen (its template disposed) after initial render.
			const chats = [main, ...Array.from({ length: 24 }, (_, i) => createChat(`Task ${String(i).padStart(2, '0')}`, ChatOriginKind.User))];
			const targetTitle = 'Task 20';
			const target = chats.find(chat => chat.title.get() === targetTitle)!;
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable(chats),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			// Approval starts absent, so the target's height is cached at its base
			// (title-only) height when it is first spliced into the tree.
			const pending = observableValue<IAgentSessionApprovalInfo | undefined>('pending', undefined);
			const approvalModel = new class extends mock<AgentSessionApprovalModel>() {
				override getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
					return resource.toString() === target.resource.toString() ? pending : constObservable(undefined);
				}
			}();

			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
				approvalModel,
			}));
			// Short viewport so only the top rows render; the target is offscreen.
			list.layout(120, 400);
			setSessionChatsExpanded(container, true);

			const targetRow = () => [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(item => item.querySelector('.session-chat-title')?.textContent === targetTitle)
				?.closest<HTMLElement>('.monaco-list-row');
			assert.strictEqual(targetRow(), undefined, 'target row should start virtualized offscreen');

			// Approval appears while the row is virtualized offscreen (its template
			// disposed). The list-owned reconcile watches the approval model
			// independently of the row template, so it must correct the cached
			// height even while offscreen.
			pending.set(terminalApproval(target, 'line one\nline two\nline three'), undefined);

			// Grow the viewport so the target enters the render range. This renders
			// the newly-visible row from its cached height (no re-splice recomputes
			// it), so the row is only sized correctly if the offscreen reconcile
			// already corrected the cache.
			list.layout(1500, 400);

			const row = targetRow();
			assert.ok(row, 'target row should render after growing the viewport');
			// Base chat rows reserve 30px including spacing; an approval must reserve more.
			assert.ok(parseInt(row.style.height) > 30, `expected reconciled height to reserve the approval row, got ${row.style.height}`);
			assert.ok(row.querySelector('.session-approval-row.visible'), 'approval row should be visible on the re-rendered target');
		});
	});

	suite('SessionsFlatList quick-chat presentation', () => {

		function renderQuickChat(useCompactQuickChatRows: boolean) {
			const quickChat = createTestSession('Investigate failure', { isQuickChat: true, isRead: false }).session;
			const harness = createListHarness(disposables, [quickChat]);
			harness.instantiationService.stub(ISessionsListModelService, 'getStatusIcon', SessionsListModelService.prototype.getStatusIcon);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, {
				showSessionHover: false,
				useCompactQuickChatRows,
				onSessionOpen: () => { },
			}));
			list.setSessions([quickChat]);
			const contentHeight = list.getContentHeight();
			list.layout(contentHeight, 400);

			const item = container.querySelector<HTMLElement>('.session-item');
			assert.ok(item);
			const statusIcon = item.querySelector<HTMLElement>('.session-icon > .codicon');
			return {
				usesStandardRowHeight: contentHeight === list.getRowHeight(),
				isShorterThanStandardRow: contentHeight < list.getRowHeight(),
				hasCompactClass: item.classList.contains('quick-chat'),
				hasUnreadIcon: statusIcon?.classList.contains('codicon-circle-filled') ?? false,
				statusIconFontSize: statusIcon ? mainWindow.getComputedStyle(statusIcon).fontSize : undefined,
				hasChatIcon: item.querySelector('.session-details-icon > .codicon')?.classList.contains('codicon-comment-discussion') ?? false,
				badge: item.querySelector('.session-badge')?.textContent ?? undefined,
				time: item.querySelector('.session-time')?.textContent ?? undefined,
				hasDiff: !!item.querySelector('.session-diff'),
				ariaLabel: item.closest('.monaco-list-row')?.getAttribute('aria-label') ?? null,
			};
		}

		test('renders compact and regular quick-chat rows consistently', () => {
			assert.deepStrictEqual({
				compact: renderQuickChat(true),
				regular: renderQuickChat(false),
			}, {
				compact: {
					usesStandardRowHeight: false,
					isShorterThanStandardRow: true,
					hasCompactClass: true,
					hasUnreadIcon: true,
					statusIconFontSize: '16px',
					hasChatIcon: false,
					badge: undefined,
					time: undefined,
					hasDiff: false,
					ariaLabel: 'Investigate failure, updated now, unread',
				},
				regular: {
					usesStandardRowHeight: true,
					isShorterThanStandardRow: false,
					hasCompactClass: false,
					hasUnreadIcon: true,
					statusIconFontSize: '16px',
					hasChatIcon: true,
					badge: 'No workspace',
					time: 'now',
					hasDiff: false,
					ariaLabel: 'Investigate failure, chat, updated now, unread',
				},
			});
		});

		test('shows the details external application badge next to the title of compact quick-chat rows, which have no details row', () => {
			const results = ([true, false] as const).flatMap(isExternal => ([true, false] as const).map(useCompactQuickChatRows => {
				const quickChat = createTestSession('External chat', { isQuickChat: true, isExternal, application: 'github/cli', environment: 'cloud' }).session;
				const harness = createListHarness(disposables, [quickChat], instantiationService => {
					(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, ExternalSessionApplicationBadgeMode.Details);
				});
				const container = harness.createContainer();
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, {
					showSessionHover: false,
					useCompactQuickChatRows,
					onSessionOpen: () => { },
				}));
				list.setSessions([quickChat]);
				list.layout(list.getContentHeight(), 400);
				return {
					isExternal,
					useCompactQuickChatRows,
					titleBadge: container.querySelector('.session-external-application-badge-title.visible')?.textContent ?? undefined,
					detailsBadge: container.querySelector('.session-external-application-badge-details')?.textContent ?? undefined,
				};
			}));

			assert.deepStrictEqual(results, [
				{ isExternal: true, useCompactQuickChatRows: true, titleBadge: 'Copilot CLI', detailsBadge: undefined },
				{ isExternal: true, useCompactQuickChatRows: false, titleBadge: undefined, detailsBadge: 'Copilot CLI' },
				{ isExternal: false, useCompactQuickChatRows: true, titleBadge: 'Copilot CLI', detailsBadge: undefined },
				{ isExternal: false, useCompactQuickChatRows: false, titleBadge: undefined, detailsBadge: 'Copilot CLI' },
			]);
		});

		test('keeps compact quick-chat rows the same height whether or not the title application badge is shown', () => {
			const quickChat = createTestSession('External chat', { isQuickChat: true, application: 'github/cli', environment: 'cloud' }).session;
			const harness = createListHarness(disposables, [quickChat], instantiationService => {
				(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, ExternalSessionApplicationBadgeMode.Title);
			});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, {
				showSessionHover: false,
				useCompactQuickChatRows: true,
				onSessionOpen: () => { },
			}));
			list.setSessions([quickChat]);
			list.layout(list.getContentHeight(), 400);

			const row = container.querySelector<HTMLElement>('.monaco-list-row');
			const titleRow = container.querySelector<HTMLElement>('.session-title-row');
			const badge = container.querySelector<HTMLElement>('.session-external-application-badge-title.visible');
			assert.ok(row && titleRow && badge);
			const measure = () => ({
				badgeShown: mainWindow.getComputedStyle(badge).display !== 'none',
				titleRowHeight: titleRow.getBoundingClientRect().height,
			});
			const atRest = measure();
			row.classList.add('hovered');
			const hovered = measure();

			assert.deepStrictEqual({ atRest, hovered }, {
				atRest: { badgeShown: true, titleRowHeight: 16 },
				hovered: { badgeShown: false, titleRowHeight: 16 },
			});
		});

		function createChat(id: string): IChat {
			return upcastPartial<IChat>({
				resource: URI.parse(`test-chat://${id}`),
				workspace: constObservable(undefined),
				title: constObservable(id),
				updatedAt: constObservable(new Date()),
				status: constObservable(SessionStatus.Completed),
				isArchived: constObservable(false),
				isRead: constObservable(true),
				changes: constObservable([]),
				changesets: constObservable([]),
				interactivity: constObservable(ChatInteractivity.Full),
			});
		}

		function flatApprovalModel(approvals: ReadonlyMap<string, IAgentSessionApprovalInfo>): AgentSessionApprovalModel {
			return new class extends mock<AgentSessionApprovalModel>() {
				override getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
					return constObservable(approvals.get(resource.toString()));
				}
			}();
		}

		test('aggregates a non-main chat approval onto the flat session row and reserves height', () => {
			// The blocked-sessions / automations flat list renders no nested chat
			// rows, so an approval on any of a session's chats — including a
			// non-main one — must surface on the session row itself.
			const main = createChat('main');
			const worker = createChat('worker');
			const base = createTestSession('Session', { isQuickChat: false }).session;
			const session: ISession = {
				...base,
				chats: constObservable([main, worker]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const approval: IAgentSessionApprovalInfo = { approvalId: worker.resource.toString(), kind: AgentSessionApprovalKind.Terminal, label: 'npm run build', languageId: 'shellscript', since: new Date(), confirm: () => { } };
			const approvalModel = flatApprovalModel(new Map([[worker.resource.toString(), approval]]));

			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, {
				showSessionHover: false,
				onSessionOpen: () => { },
				approvalModel,
			}));
			list.setSessions([session]);
			const contentHeight = list.getContentHeight();
			list.layout(contentHeight, 400);

			const approvalRow = container.querySelector<HTMLElement>('.session-item .session-approval-row');
			assert.deepStrictEqual({
				approvalVisible: approvalRow?.classList.contains('visible'),
				hasAllowButton: !!approvalRow?.querySelector('.session-approval-button .monaco-button'),
				reservesHeight: contentHeight > list.getRowHeight(),
			}, {
				approvalVisible: true,
				hasAllowButton: true,
				reservesHeight: true,
			});
		});
	});

	suite('compact presentation', () => {

		test('uses a title-only row with workspace context on hover and preserves the accessible label', () => {
			const session = createTestSession('Implement compact view', {
				workspaceLabel: 'vscode',
				changesSummary: { files: 2, additions: 12, deletions: 3 },
			}).session;
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			let compact = true;
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				compact: () => compact,
				onSessionOpen: () => { },
			}));
			list.layout(500, 400);

			const readPresentation = () => {
				const item = container.querySelector<HTMLElement>('.session-item');
				const row = item?.closest<HTMLElement>('.monaco-list-row');
				assert.ok(item);
				assert.ok(row);
				return {
					compactClass: list.element.classList.contains('compact'),
					height: row.style.height,
					workspace: item.querySelector('.session-details-row .session-badge')?.textContent,
					hasWorktreeIcon: item.querySelector('.session-details-icon > .codicon')?.classList.contains('codicon-worktree-compact') ?? false,
					hasMetadataSeparator: !!item.querySelector('.session-details-icon + .session-separator.has-separator + .session-diff'),
					hasHoverWorktreeIcon: item.querySelector('.session-compact-hover-description > .codicon')?.classList.contains('codicon-worktree-compact') ?? false,
					hoverDescription: item.querySelector('.session-compact-hover-description')?.textContent,
					diff: item.querySelector('.session-diff')?.textContent,
					time: item.querySelector('.session-time')?.textContent,
					ariaLabel: row.getAttribute('aria-label'),
				};
			};

			const compactPresentation = readPresentation();
			compact = false;
			list.setCompact();
			const defaultPresentation = readPresentation();

			assert.deepStrictEqual({
				compact: compactPresentation,
				default: defaultPresentation,
			}, {
				compact: {
					compactClass: true,
					height: '30px',
					workspace: undefined,
					hasWorktreeIcon: false,
					hasMetadataSeparator: false,
					hasHoverWorktreeIcon: false,
					hoverDescription: 'vscode',
					diff: undefined,
					time: undefined,
					ariaLabel: 'Implement compact view, updated now, State: Completed, in vscode',
				},
				default: {
					compactClass: false,
					height: '56px',
					workspace: 'vscode',
					hasWorktreeIcon: true,
					hasMetadataSeparator: false,
					hasHoverWorktreeIcon: false,
					hoverDescription: '',
					diff: '+12-3',
					time: 'now',
					ariaLabel: 'Implement compact view, updated now, State: Completed, in vscode',
				},
			});
		});

		test('keeps hover context hidden outside active keyboard focus', () => {
			const session = createTestSession('Pinned compact session', { workspaceLabel: 'vscode' }).session;
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				compact: () => true,
				onSessionOpen: () => { },
			}));
			list.layout(500, 400);

			const item = container.querySelector<HTMLElement>('.session-item');
			const description = item?.querySelector<HTMLElement>('.session-compact-hover-description');
			assert.ok(item);
			assert.ok(description);
			item.classList.add('pinned');
			const display = () => mainWindow.getComputedStyle(description).display;
			const pinnedAtRest = display();

			assert.ok(list.reveal(session.resource));
			list.focus();
			const withKeyboardFocus = display();

			const outside = mainWindow.document.createElement('button');
			container.appendChild(outside);
			outside.focus();
			const afterBlur = display();

			assert.deepStrictEqual({ pinnedAtRest, withKeyboardFocus, afterBlur }, {
				pinnedAtRest: 'none',
				withKeyboardFocus: 'flex',
				afterBlur: 'none',
			});
		});

		test('expands a compact row while the session needs input', () => {
			const { session: baseSession, status } = createTestSession('Answer required', { workspaceLabel: 'vscode' });
			const session: ISession = {
				...baseSession,
				description: constObservable(new MarkdownString('Which **strategy** should I use?')),
			};
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				compact: () => true,
				onSessionOpen: () => { },
			}));
			list.layout(500, 400);

			const readPresentation = () => {
				const callout = container.querySelector<HTMLElement>('.session-input-needed-row');
				const row = callout?.closest<HTMLElement>('.monaco-list-row');
				assert.ok(callout);
				assert.ok(row);
				return {
					height: row.style.height,
					visible: callout.classList.contains('visible'),
					label: callout.textContent,
					ariaHidden: callout.getAttribute('aria-hidden'),
					ariaLabel: row.getAttribute('aria-label'),
				};
			};

			const completed = readPresentation();
			status.set(SessionStatus.NeedsInput, undefined);
			const needsInput = readPresentation();
			status.set(SessionStatus.Completed, undefined);
			const completedAgain = readPresentation();

			assert.deepStrictEqual({ completed, needsInput, completedAgain }, {
				completed: { height: '30px', visible: false, label: '', ariaHidden: 'true', ariaLabel: 'Answer required, updated now, State: Completed, in vscode' },
				needsInput: { height: '62px', visible: true, label: 'Which strategy should I use?', ariaHidden: 'true', ariaLabel: 'Answer required, updated now, State: Attention Needed, Which strategy should I use?' },
				completedAgain: { height: '30px', visible: false, label: '', ariaHidden: 'true', ariaLabel: 'Answer required, updated now, State: Completed, in vscode' },
			});
		});

		test('shows an approval instead of the generic input-needed callout', () => {
			const { session } = createTestSession('Approval required', { workspaceLabel: 'vscode', status: SessionStatus.NeedsInput });
			const mainChat = session.mainChat.get();
			const approval: IAgentSessionApprovalInfo = {
				approvalId: mainChat.resource.toString(),
				kind: AgentSessionApprovalKind.Terminal,
				label: 'git push origin main',
				languageId: 'shellscript',
				since: new Date(),
				confirm: () => { },
			};
			const approvalModel = new class extends mock<AgentSessionApprovalModel>() {
				override getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
					return constObservable(resource.toString() === mainChat.resource.toString() ? approval : undefined);
				}
			}();
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				compact: () => true,
				onSessionOpen: () => { },
				approvalModel,
			}));
			list.layout(500, 400);

			const inputNeeded = container.querySelector<HTMLElement>('.session-input-needed-row');
			const approvalRow = container.querySelector<HTMLElement>('.session-item > .session-main > .session-approval-row:not(.session-input-needed-row)');
			assert.deepStrictEqual({
				inputNeededVisible: inputNeeded?.classList.contains('visible'),
				approvalVisible: approvalRow?.classList.contains('visible'),
				approvalLabel: approvalRow?.querySelector('.session-approval-label')?.textContent,
				hasAllowButton: !!approvalRow?.querySelector('.session-approval-button .monaco-button'),
			}, {
				inputNeededVisible: false,
				approvalVisible: true,
				approvalLabel: 'git push origin main',
				hasAllowButton: true,
			});
		});

		test('refreshes compact presentation across phone layout transitions', () => {
			const session = createTestSession('Responsive compact session', {
				workspaceLabel: 'vscode',
				changesSummary: { files: 2, additions: 12, deletions: 3 },
			}).session;
			const harness = createListHarness(disposables, [session], instantiationService => {
				instantiationService.stub(IContextKeyService, disposables.add(new ContextKeyService(new TestConfigurationService())));
			});
			const contextKeyService = harness.instantiationService.get(IContextKeyService);
			const phoneLayout = IsPhoneLayoutContext.bindTo(contextKeyService);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				compact: () => true,
				onSessionOpen: () => { },
			}));
			list.layout(500, 400);

			const readPresentation = () => {
				const item = container.querySelector<HTMLElement>('.session-item');
				const row = item?.closest<HTMLElement>('.monaco-list-row');
				assert.ok(item);
				assert.ok(row);
				return {
					compactClass: list.element.classList.contains('compact'),
					height: row.style.height,
					hasDetails: !!item.querySelector('.session-details-icon'),
					diff: item.querySelector('.session-diff')?.textContent,
				};
			};

			const desktop = readPresentation();
			phoneLayout.set(true);
			const phone = readPresentation();
			phoneLayout.set(false);
			const desktopAgain = readPresentation();

			assert.deepStrictEqual({ desktop, phone, desktopAgain }, {
				desktop: { compactClass: true, height: '30px', hasDetails: false, diff: undefined },
				phone: { compactClass: false, height: '78px', hasDetails: true, diff: '+12-3' },
				desktopAgain: { compactClass: true, height: '30px', hasDetails: false, diff: undefined },
			});
		});
	});

	suite('computeReorderSortChanges', () => {
		const NOW = 1_000_000;
		const STEP = 60_000;

		test('single drop between two neighbours uses the midpoint', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['x'],
				naturalKeys: [10],
				aboveKey: 100,
				belowKey: 50,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual([...set], [['x', 75]]);
			assert.deepStrictEqual(clear, []);
		});

		test('drop above the first session uses the current time', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['x'],
				naturalKeys: [10],
				aboveKey: undefined,
				belowKey: 200,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual(clear, []);
			const value = set.get('x')!;
			assert.ok(value > 200 && value < NOW, `expected ${value} between 200 and ${NOW}`);
		});

		test('drop below the last session steps below the last key', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['x'],
				naturalKeys: [500],
				aboveKey: 100,
				belowKey: undefined,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual(clear, []);
			assert.ok(set.get('x')! < 100);
		});

		test('drops the fake value when the natural key already fits the slot', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['x'],
				naturalKeys: [75],
				aboveKey: 100,
				belowKey: 50,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual([...set], []);
			assert.deepStrictEqual(clear, ['x']);
		});

		test('multi-block gets strictly descending keys inside the gap', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['a', 'b', 'c'],
				naturalKeys: [5, 4, 3],
				aboveKey: 100,
				belowKey: 40,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual(clear, []);
			const values = ['a', 'b', 'c'].map(id => set.get(id)!);
			assert.deepStrictEqual(values, [85, 70, 55]);
			assert.ok(values.every(v => v > 40 && v < 100));
		});

		test('multi-block clears overrides when all natural keys already fit in order', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['a', 'b'],
				naturalKeys: [80, 60],
				aboveKey: 100,
				belowKey: 40,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual([...set], []);
			assert.deepStrictEqual(clear, ['a', 'b']);
		});

		test('multi-block assigns synthetic keys when natural order does not fit', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['a', 'b'],
				naturalKeys: [60, 80], // ascending: does not match descending display order
				aboveKey: 100,
				belowKey: 40,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual(clear, []);
			assert.strictEqual(set.size, 2);
			assert.ok(set.get('a')! > set.get('b')!);
		});
	});

	suite('opening sessions', () => {

		function findSessionRow(container: HTMLElement, title: string): HTMLElement {
			const item = [...container.querySelectorAll<HTMLElement>('.session-item')]
				.find(el => el.querySelector('.session-title')?.textContent === title);
			const row = item?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(row, `expected a rendered row for "${title}"`);
			return row;
		}

		// Drains the microtask queue so the asynchronous open gate settles.
		async function settle(): Promise<void> {
			for (let i = 0; i < 50; i++) {
				await Promise.resolve();
			}
		}

		for (const isExternal of [false, true]) {
			test(`reports the exact session only after a revealed row finishes opening (external: ${isExternal})`, async () => {
				const session = createTestSession('Guided session', { isExternal }).session;
				const harness = createListHarness(disposables, [session]);
				harness.instantiationService.stub(ICustomViewService, { hideCustomView: () => { }, activeCustomView: constObservable(undefined) });
				const completion = new DeferredPromise<void>();
				const container = harness.createContainer();
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
					grouping: () => SessionsGrouping.Date, sorting: () => SessionsSorting.Created,
					onSessionOpen: () => completion.p,
				}));
				const opened: string[] = [];
				harness.store.add(list.onDidOpenSession(resource => opened.push(resource.toString())));
				list.layout(300, 400);
				list.collapseAllSections();
				harness.store.add(list.revealSessionForOnboarding(session));
				clickRow(findSessionRow(container, 'Guided session'));
				await settle();
				assert.deepStrictEqual(opened, []);
				await completion.complete();
				await settle();
				assert.deepStrictEqual(opened, [session.resource.toString()]);
			});
		}

		function renderGatedList(title: string, canOpenSession?: (session: ISession) => Promise<boolean>) {
			const { session } = createTestSession(title);
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const opened: string[] = [];
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: (resource: URI) => {
					opened.push(resource.toString());
				},
				canOpenSession,
			}));
			list.layout(300, 400);
			return { session, harness, container, opened };
		}

		// Control: proves the click gesture actually reaches `onDidOpen`, so the
		// "no side effects" assertions in the gated tests below are meaningful.
		test('opens and marks read when no trust gate is configured', async () => {
			const { session, harness, container, opened } = renderGatedList('Ungated');

			clickRow(findSessionRow(container, 'Ungated'));
			await settle();

			assert.deepStrictEqual({ opened, markedRead: harness.managementService.readSessions.length }, {
				opened: [session.resource.toString()],
				markedRead: 1,
			});
		});

		test('opening an expanded main chat does not mark the parent session read', async () => {
			const base = createTestSession('Unread multi-chat', { isRead: false }).session;
			const main = base.mainChat.get();
			const peer: IChat = {
				...main,
				resource: URI.parse('test-chat://peer'),
				workspace: constObservable(undefined),
				title: constObservable('Peer chat'),
				updatedAt: constObservable(new Date()),
				status: constObservable(SessionStatus.Completed),
				isArchived: constObservable(false),
				isRead: constObservable(true),
				changes: constObservable([]),
				changesets: constObservable([]),
				interactivity: constObservable(ChatInteractivity.Full),
				origin: { kind: ChatOriginKind.User },
			};
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const opened: string[] = [];
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: resource => {
					opened.push(resource.toString());
				},
			}));
			list.layout(300, 400);
			const row = findSessionRow(container, 'Unread multi-chat');
			const twistie = row.querySelector<HTMLElement>('.session-chat-twistie');
			assert.ok(twistie);
			if (row.getAttribute('aria-expanded') !== 'true') {
				twistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			}

			clickRow(row);
			await settle();

			assert.deepStrictEqual({ opened, markedRead: harness.managementService.readSessions.length }, {
				opened: [session.resource.toString()],
				markedRead: 0,
			});
		});

		for (const flat of [false, true]) {
			for (const active of [false, true]) {
				test(`${flat ? 'flat' : 'main'} list ${active ? 'preserves an active session unread mark' : 'marks an inactive session read'} when opening a row`, async () => {
					const { session } = createTestSession('Unread', { isRead: false });
					const activeSession = active ? upcastPartial<IActiveSession>({
						...session,
						activeChat: session.mainChat,
						sticky: constObservable(false),
						isCreated: constObservable(true),
						visibleChatTabs: session.chats,
					}) : undefined;
					const harness = createListHarness(disposables, [session], instantiationService => {
						instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
							override readonly activeSession = constObservable(activeSession);
							override readonly visibleSessions = constObservable(activeSession ? [activeSession] : []);
						});
					});
					const container = harness.createContainer();
					const opened: string[] = [];
					const onSessionOpen = (resource: URI) => { opened.push(resource.toString()); };
					const list = harness.store.add(flat
						? harness.instantiationService.createInstance(SessionsFlatList, container, { onSessionOpen })
						: harness.instantiationService.createInstance(SessionsList, container, {
							grouping: () => SessionsGrouping.Date,
							sorting: () => SessionsSorting.Created,
							onSessionOpen,
						}));
					if (list instanceof SessionsFlatList) {
						list.setSessions([session]);
					}
					list.layout(300, 400);

					clickRow(findSessionRow(container, 'Unread'));
					await settle();

					assert.deepStrictEqual({ opened, markedRead: harness.managementService.readSessions.length }, {
						opened: [session.resource.toString()],
						markedRead: active ? 0 : 1,
					});
				});
			}
		}

		test('refuses to open when the trust gate returns false: no mark-read, no open', async () => {
			const { harness, container, opened } = renderGatedList('Untrusted', async () => false);

			clickRow(findSessionRow(container, 'Untrusted'));
			await settle();

			assert.deepStrictEqual({ opened, markedRead: harness.managementService.readSessions.length }, {
				opened: [],
				markedRead: 0,
			});
		});

		test('marks read and opens only after the trust gate resolves true', async () => {
			let allowOpen: (value: boolean) => void;
			const gate = new Promise<boolean>(resolve => { allowOpen = resolve; });
			const { session, harness, container, opened } = renderGatedList('Deferred', () => gate);

			clickRow(findSessionRow(container, 'Deferred'));
			await settle();

			// Gate still pending — the open must not have produced any side effects.
			assert.deepStrictEqual({ opened, markedRead: harness.managementService.readSessions.length }, {
				opened: [],
				markedRead: 0,
			});

			allowOpen!(true);
			await settle();

			// Gate resolved true — the session is now marked read and opened.
			assert.deepStrictEqual({ opened, markedRead: harness.managementService.readSessions.length }, {
				opened: [session.resource.toString()],
				markedRead: 1,
			});
		});
	});
});
