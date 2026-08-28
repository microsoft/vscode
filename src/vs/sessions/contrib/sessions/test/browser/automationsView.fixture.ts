/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ExtUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationDialogService } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IAutomationRunner } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IVoicePlaybackService } from '../../../../../workbench/contrib/chat/common/voicePlaybackService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { CustomViewNode } from '../../../../browser/parts/customViewNode.js';
import { CustomViewService, ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../browser/automationsConstants.js';
import { AutomationsCustomViewContribution } from '../../browser/views/automationsView.js';

const WORKSPACE = URI.parse('file:///workspaces/vscode');
const ITestAgentSessionsService = createDecorator<object>('agentSessions');

class FixtureActionViewItemService extends Disposable implements IActionViewItemService {

	declare _serviceBrand: undefined;

	private readonly providers = new Map<string, IActionViewItemFactory>();
	private readonly changeEmitter = this._register(new Emitter<MenuId>());
	readonly onDidChange = this.changeEmitter.event;

	register(menu: MenuId, commandId: string | MenuId, provider: IActionViewItemFactory, event?: Event<unknown>): IDisposable {
		const key = this.getKey(menu, commandId);
		if (this.providers.has(key)) {
			throw new Error(`Duplicate action view item provider for ${key}`);
		}
		this.providers.set(key, provider);
		const listener = event?.(() => this.changeEmitter.fire(menu));
		return toDisposable(() => {
			listener?.dispose();
			this.providers.delete(key);
		});
	}

	lookUp(menu: MenuId, commandId: string | MenuId): IActionViewItemFactory | undefined {
		return this.providers.get(this.getKey(menu, commandId));
	}

	private getKey(menu: MenuId, commandId: string | MenuId): string {
		return `${menu.id}/${commandId instanceof MenuId ? commandId.id : commandId}`;
	}
}

class FixtureAutomationService extends mock<IAutomationService>() {

	override readonly automations: IObservable<readonly IAutomationDescriptor[]>;
	override readonly runs: IObservable<readonly IAutomationRun[]>;

	constructor(automations: readonly IAutomationDescriptor[], runs: readonly IAutomationRun[]) {
		super();
		this.automations = constObservable(automations);
		this.runs = constObservable(runs);
	}

	override async deleteRun(): Promise<void> { }
}

class FixtureSessionsManagementService extends mock<ISessionsManagementService>() {

	private readonly sessions = new Map<string, ISession>();
	override readonly onDidDeleteSession = Event.None;
	override readonly onDidChangeSessions = Event.None;

	constructor(runs: readonly IAutomationRun[]) {
		super();
		for (const [index, run] of runs.entries()) {
			if (!run.sessionResource) {
				continue;
			}
			const resource = run.sessionResource;
			this.sessions.set(run.sessionResource.toString(), upcastPartial<ISession>({
				resource,
				sessionId: `fixture-session-${index + 1}`,
				providerId: 'fixture',
				sessionType: 'fixture',
				icon: Codicon.account,
				createdAt: new Date(run.startedAt),
				workspace: constObservable({
					uri: WORKSPACE,
					label: 'vscode',
					icon: Codicon.folder,
					folders: [],
					requiresWorkspaceTrust: false,
					isVirtualWorkspace: false,
				}),
				isQuickChat: constObservable(false),
				title: constObservable(`Run ${index + 1}`),
				updatedAt: constObservable(new Date(run.completedAt ?? run.startedAt)),
				isRead: constObservable(index !== 0),
				capabilities: constObservable({ supportsMultipleChats: false, supportsDelete: true }),
				status: constObservable(run.status === 'failed'
					? SessionStatus.Error
					: run.status === 'completed'
						? SessionStatus.Completed
						: SessionStatus.InProgress),
				changesets: constObservable([]),
				changes: constObservable([]),
				modelId: constObservable(undefined),
				mode: constObservable(undefined),
				loading: constObservable(false),
				isArchived: constObservable(false),
				description: constObservable(undefined),
				lastTurnEnd: constObservable(undefined),
				chats: constObservable<readonly IChat[]>([]),
				mainChat: constObservable(new class extends mock<IChat>() { }()),
			}));
		}
	}

	override getSession(resource: URI): ISession | undefined {
		return this.sessions.get(resource.toString());
	}

	override getSessions(): ISession[] {
		return [...this.sessions.values()];
	}

	override async markAllRead(): Promise<void> { }
}

interface IAutomationsFixtureData {
	readonly automations: readonly IAutomationDescriptor[];
	readonly runs: readonly IAutomationRun[];
}

interface IAutomationsFixtureOptions {
	readonly width: number;
	readonly height: number;
	readonly populated: boolean;
}

export default defineThemedFixtureGroup({ path: 'sessions/automations/' }, {
	Populated: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderAutomations(ctx, { width: 1000, height: 720, populated: true }),
	}),
	Empty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderAutomations(ctx, { width: 1000, height: 520, populated: false }),
	}),
	Narrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderAutomations(ctx, { width: 520, height: 720, populated: true }),
	}),
});

function renderAutomations(ctx: ComponentFixtureContext, options: IAutomationsFixtureOptions): void {
	const data = options.populated ? createPopulatedData() : { automations: [], runs: [] };
	const configurationService = new TestConfigurationService({
		chat: { automations: { enabled: true } },
	});
	const contextKeyService = new ContextKeyService(configurationService);
	const actionViewItemService = new FixtureActionViewItemService();
	const customViewService = ctx.disposableStore.add(new CustomViewService(new NullLogService(), ctx.disposableStore.add(new InMemoryStorageService())));
	const automationService = new FixtureAutomationService(data.automations, data.runs);
	const sessionsManagementService = new FixtureSessionsManagementService(data.runs);
	ChatAutomationsEnabledContext.bindTo(contextKeyService).set(true);

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IActionViewItemService, actionViewItemService);
			reg.define(IListService, ListService);
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() { }());
			reg.define(IMenuService, MenuService);
			reg.defineInstance(IConfigurationService, configurationService);
			reg.defineInstance(IContextKeyService, contextKeyService);
			reg.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				override readonly extUri = new ExtUri(() => true);
			}());
			reg.defineInstance(IAutomationService, automationService);
			reg.defineInstance(IAutomationRunner, new class extends mock<IAutomationRunner>() { }());
			reg.defineInstance(IAutomationDialogService, new class extends mock<IAutomationDialogService>() { }());
			reg.defineInstance(ICustomViewService, customViewService);
			reg.defineInstance(ISessionsManagementService, sessionsManagementService);
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly visibleSessions = constObservable([]);
				override readonly activeSession = constObservable(undefined);
				override async openSession(): Promise<void> { }
			}());
			reg.defineInstance(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
				override readonly onDidChange = Event.None;
				override isSessionPinned(): boolean { return false; }
				override getStatusIcon() { return Codicon.circleSmallFilled; }
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return []; }
			}());
			reg.defineInstance(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() {
				override readonly pendingResponseVersion = constObservable(0);
				override hasPendingResponse() { return false; }
			}());
			reg.defineInstance(IChatService, new class extends mock<IChatService>() {
				override readonly chatModels = constObservable([]);
			}());
			reg.defineInstance(ITestAgentSessionsService, {
				model: {
					observeSession: () => constObservable(undefined),
				},
			});
		},
	});

	ctx.disposableStore.add(instantiationService.createInstance(AutomationsCustomViewContribution));
	customViewService.showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
	const descriptor = customViewService.activeCustomView.get();
	if (!descriptor) {
		throw new Error('Automations custom view was not registered');
	}

	ctx.container.classList.add('monaco-workbench');
	ctx.container.style.width = `${options.width}px`;
	ctx.container.style.height = `${options.height}px`;
	ctx.container.style.setProperty('--session-view-background', 'var(--vscode-agentsPanel-background, var(--vscode-sideBar-background))');
	ctx.container.style.setProperty('--session-view-foreground', 'var(--vscode-agentsPanel-foreground, var(--vscode-sideBar-foreground))');
	ctx.container.style.backgroundColor = 'var(--session-view-background)';

	const node = ctx.disposableStore.add(instantiationService.createInstance(CustomViewNode, descriptor));
	node.element.style.height = '100%';
	ctx.container.appendChild(node.element);
	node.layout(options.width, options.height);
}

function createPopulatedData(): IAutomationsFixtureData {
	const today = new Date();
	today.setHours(9, 15, 0, 0);
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	yesterday.setHours(15, 30, 0, 0);

	const automations: readonly IAutomationDescriptor[] = [
		createAutomation({
			id: 'daily-review',
			name: 'Daily code review',
			prompt: 'Review recent changes for correctness, missing tests, and regressions.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 },
		}),
		createAutomation({
			id: 'dependency-audit',
			name: 'Dependency audit',
			prompt: 'Check dependencies for available security updates and summarize recommended changes.',
			schedule: { interval: 'weekly', scheduleHour: 10, scheduleMinute: 30, scheduleDay: 1 },
			enabled: false,
		}),
		createAutomation({
			id: 'issue-triage',
			name: 'Issue triage',
			prompt: 'Review new issues, group duplicates, and suggest labels for the maintainers.',
			schedule: { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'fixture', sessionTypeId: 'fixture' },
		}),
	];

	const runs: readonly IAutomationRun[] = [
		createRun('daily-review-starting', 'daily-review', 'pending', today, undefined, false),
		createRun('daily-review-run', 'daily-review', 'completed', today),
		createRun('dependency-audit-run', 'dependency-audit', 'running', today),
		createRun('issue-triage-run', 'issue-triage', 'failed', yesterday, 'The repository could not be reached.', false),
	];

	return { automations, runs };
}

function createAutomation(overrides: Partial<IAutomationDescriptor>): IAutomationDescriptor {
	const now = new Date().toISOString();
	return {
		id: 'automation',
		name: 'Automation',
		prompt: 'Run the automation.',
		schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
		target: { kind: 'workspace', folderUri: WORKSPACE, isolation: { kind: 'default' } },
		enabled: true,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

function createRun(id: string, automationId: string, status: IAutomationRun['status'], startedAt: Date, errorMessage?: string, hasSession = true): IAutomationRun {
	return {
		id,
		automationId,
		status,
		trigger: 'schedule',
		sessionResource: hasSession ? URI.parse(`vscode-chat-session://fixture/${id}`) : undefined,
		startedAt: startedAt.toISOString(),
		completedAt: status === 'completed' || status === 'failed' ? startedAt.toISOString() : undefined,
		errorMessage,
		leaderWindowId: 1,
	};
}
