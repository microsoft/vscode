/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { getWorkflowProgress } from '../../../../../platform/workflow/common/workflowProgress.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IWorkflowAccessibilityService, WorkflowAccessibilityService } from '../../../../../workbench/contrib/workflows/browser/workflowAccessibility.js';
import { IWorkflowUIService } from '../../../../../workbench/contrib/workflows/browser/workflowUIService.js';
import { IWorkflowService } from '../../../../../workbench/contrib/workflows/common/workflowService.js';
import { testWorkflowRunWithMissingInputs } from '../../../../../workbench/contrib/workflows/test/common/workflowTestData.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IDecorationsService } from '../../../../../workbench/services/decorations/common/decorations.js';
import { DEFAULT_EDITOR_PART_OPTIONS } from '../../../../../workbench/browser/parts/editor/editor.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { INotebookDocumentService } from '../../../../../workbench/services/notebook/common/notebookDocumentService.js';
import { ITextFileEditorModelManager, ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { IUntitledTextEditorModelManager } from '../../../../../workbench/services/untitled/common/untitledTextEditorService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { TestDecorationsService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { Menus } from '../../../../browser/menus.js';
import { AbstractChatView } from '../../../../browser/parts/chatView.js';
import { SessionView } from '../../../../browser/parts/sessionView.js';
import { IChatViewFactory } from '../../../../services/chatView/browser/chatViewFactory.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { INewSessionComposerService } from '../../../chat/browser/newSessionComposerService.js';
import { createTestSession, TestSessionsManagementService } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { ISessionWorkflowService, SessionWorkflowService } from '../../browser/sessionWorkflowService.js';
import { WorkflowActionViewItem } from '../../browser/workflowActionViewItem.js';
import '../../../../browser/parts/media/sessionsPart.css';
import '../../browser/media/sessionWorkflows.css';

async function renderSession(ctx: ComponentFixtureContext, options: { open?: boolean; width?: number; compact?: boolean; tabs?: boolean } = {}): Promise<void> {
	const width = options.width ?? 1100;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = '640px';
	ctx.container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	ctx.container.classList.toggle('editor-tabs-compact-height', !!options.compact);
	const part = dom.append(ctx.container, dom.$('.part.sessionspart'));
	const base = createTestSession('Deliver keyboard navigation').session;
	const chat = upcastPartial<IChat>({
		...base.mainChat.get(), title: constObservable('Keyboard navigation'),
		isRead: constObservable(true),
		interactivity: constObservable(ChatInteractivity.Full),
	});
	const run = { ...testWorkflowRunWithMissingInputs(), session: base.resource.toString(), chat: chat.resource.toString() };
	const session = upcastPartial<IActiveSession>({
		...base, status: constObservable(SessionStatus.NeedsInput), workflow: constObservable(getWorkflowProgress(run)),
		isCreated: constObservable(true), sticky: constObservable(false),
		mainChat: constObservable(chat), activeChat: constObservable(chat),
		chats: constObservable([chat]), openChats: constObservable([chat]), closedChats: constObservable([]),
		visibleChatTabs: constObservable([chat]), shouldShowChatTabs: constObservable(!!options.tabs),
	});

	class FixtureChatView extends AbstractChatView {
		readonly kind = 'chat';
		private readonly input: HTMLTextAreaElement;

		constructor() {
			super();
			this.element.style.display = 'flex';
			this.element.style.flexDirection = 'column';
			this.element.style.boxSizing = 'border-box';
			this.element.style.padding = 'var(--vscode-spacing-size320)';
			dom.append(this.element, dom.$('h3', undefined, 'Keyboard navigation'));
			dom.append(this.element, dom.$('p', undefined, 'The plan is ready. Review its proof in the checkpoint sidebar while keeping this conversation visible.'));
			dom.append(this.element, dom.$('p', undefined, 'Implementation needs the repository and release channel before continuing. Choosing these values does not extend the workflow stopping point.'));
			this.input = dom.append(this.element, dom.$('textarea', { placeholder: 'Send a message', 'aria-label': 'Chat input' }));
			this.input.style.marginTop = 'auto';
			this.input.style.resize = 'none';
			this.input.style.background = 'var(--vscode-input-background)';
			this.input.style.color = 'var(--vscode-input-foreground)';
			this.input.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-widget-border)';
			this.input.style.borderRadius = 'var(--vscode-cornerRadius-small)';
			this.input.style.padding = 'var(--vscode-spacing-size80)';
		}
		protected override doLayout(): void { }
		override focus(): void { this.input.focus(); }
		override toJSON(): object { return {}; }
	}

	const toggleId = 'fixture.workflow.toggle';
	ctx.disposableStore.add(MenuRegistry.appendMenuItem(Menus.SessionBarToolbar, { command: { id: 'fixture.session.settings', title: 'Session Settings', icon: Codicon.gear }, group: 'navigation' }));
	ctx.disposableStore.add(MenuRegistry.appendMenuItem(Menus.SessionBarToolbar, { command: { id: 'fixture.session.archive', title: 'Archive Session' }, group: 'manage' }));
	ctx.disposableStore.add(MenuRegistry.appendMenuItem(Menus.SessionBarToolbarTrailing, { command: { id: toggleId, title: 'Toggle Workflow' }, group: 'navigation' }));
	const configuration = new TestConfigurationService({ 'chat.workflows.enabled': true });
	ctx.disposableStore.add(configuration.onDidChangeConfigurationEmitter);
	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme, fileIconTheme: ctx.fileIconTheme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IConfigurationService, configuration);
			reg.define(IContextKeyService, ContextKeyService);
			reg.defineInstance(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
				override readonly partOptions = { ...DEFAULT_EDITOR_PART_OPTIONS, tabHeight: options.compact ? 'compact' : 'default' } as const;
				override readonly onDidChangeEditorPartOptions = Event.None;
			}());
			reg.defineInstance(IEditorService, new class extends mock<IEditorService>() { }());
			reg.defineInstance(IQuickInputService, new class extends mock<IQuickInputService>() { }());
			reg.define(IDecorationsService, TestDecorationsService);
			reg.defineInstance(ITextFileService, new class extends mock<ITextFileService>() {
				override readonly untitled = new class extends mock<IUntitledTextEditorModelManager>() {
					override readonly onDidChangeLabel = Event.None;
					override get() { return undefined; }
				}();
				override readonly files = new class extends mock<ITextFileEditorModelManager>() {
					override readonly onDidChangeDirty = Event.None;
					override readonly onDidChangeReadonly = Event.None;
					override get() { return undefined; }
				}();
			}());
			reg.define(IMenuService, MenuService);
			reg.defineInstance(IActionViewItemService, new class extends mock<IActionViewItemService>() {
				override readonly onDidChange = Event.None;
				override lookUp(menu: MenuId, id: string | MenuId): IActionViewItemFactory | undefined {
					return menu === Menus.SessionBarToolbarTrailing && id === toggleId
						? (action, options, scoped) => scoped.createInstance(WorkflowActionViewItem, action, options)
						: undefined;
				}
			}());
			reg.defineInstance(ICommandService, new class extends mock<ICommandService>() {
				override async executeCommand<T>(id: string): Promise<T | undefined> {
					if (id === toggleId) {
						const focused = dom.getActiveElement();
						await workflows.show(session, dom.isHTMLElement(focused) ? focused : undefined);
					}
					return undefined;
				}
			}());
			reg.defineInstance(IChatViewFactory, new class extends mock<IChatViewFactory>() {
				override createChatView() { return new FixtureChatView(); }
				override createNewChatView() { return new FixtureChatView(); }
			}());
			reg.defineInstance(ISessionsManagementService, new class extends TestSessionsManagementService {
				override readonly onDidDeleteSession = Event.None;
			}([session]));
			reg.defineInstance(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
				override getStatusIcon() { return Codicon.circleFilled; }
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProvider() { return undefined; }
			}());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() { override readonly activeSession = constObservable(session); }());
			reg.defineInstance(ISessionsPartService, new class extends mock<ISessionsPartService>() { override getSessionView() { return view; } }());
			reg.defineInstance(ISessionChangesStatsCache, new class extends mock<ISessionChangesStatsCache>() { }());
			reg.defineInstance(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
				override readonly sentiment = upcastPartial<IChatEntitlementService['sentiment']>({ hidden: false });
				override readonly onDidChangeSentiment = Event.None;
			}());
			reg.defineInstance(INewSessionComposerService, new class extends mock<INewSessionComposerService>() { }());
			reg.defineInstance(IWorkflowUIService, new class extends mock<IWorkflowUIService>() { }());
			reg.defineInstance(IWorkflowService, new class extends mock<IWorkflowService>() {
				override readonly onDidChangeRun = Event.None;
				override watchSession() { return toDisposable(() => { }); }
				override async getSessionRun() { return run; }
			}());
			reg.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() { }());
			reg.defineInstance(INotebookDocumentService, new class extends mock<INotebookDocumentService>() { }());
			reg.define(IWorkflowAccessibilityService, WorkflowAccessibilityService);
			reg.define(ISessionWorkflowService, SessionWorkflowService);
		},
	});
	const view = ctx.disposableStore.add(instantiationService.createInstance(SessionView));
	part.appendChild(view.element);
	view.openSession(session, {});
	view.layout(width, 640, 0, 0);
	const workflows = instantiationService.get(ISessionWorkflowService);
	if (options.open) {
		await workflows.show(session);
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/workflows/' }, {
	HeaderToggle: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: ctx => renderSession(ctx) }),
	Sidebar: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: ctx => renderSession(ctx, { open: true }) }),
	CompactHeader: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: ctx => renderSession(ctx, { open: true, compact: true }) }),
	NarrowSidebar: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: ctx => renderSession(ctx, { open: true, width: 420 }) }),
	ChatTabsSidebar: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: ctx => renderSession(ctx, { open: true, tabs: true }) }),
	NarrowChatTabsSidebar: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: ctx => renderSession(ctx, { open: true, tabs: true, width: 420 }) }),
});
