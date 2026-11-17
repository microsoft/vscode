/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns, local/code-amd-node-module -- Fixture schemas run in Component Explorer's bundler.
import { z } from 'zod';
import { $, addDisposableListener, append, EventType } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextMenuService } from '../../../../../platform/contextview/browser/contextMenuService.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../platform/opener/test/common/nullOpenerService.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationDialogResult, IAutomationDialogService, IShowAutomationDialogOptions } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import type { IInlineAutomationDialogOptions } from '../../../automations/browser/automationDialogService.js';
import { IFormState, IValidationState, renderForm } from '../../../automations/browser/automationDialog.js';
import '../../../automations/browser/media/automationDialog.css';
import { ButtonBar } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { ISessionsRecentWorkspacesService } from '../../../../../workbench/contrib/sessions/browser/sessionsRecentWorkspacesService.js';
import { IAgentHostFilterService } from '../../../../../workbench/contrib/sessions/common/agentHostFilter.js';
import { ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IAutomationRunner } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { AutomationCatalogueState, IAutomationProviderDescriptor, IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IAgentPluginService } from '../../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { IPromptsService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IVoicePlaybackService } from '../../../../../workbench/contrib/chat/common/voicePlaybackService.js';
import { IOnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { stubSessionHosts, testGridPanes } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { registerChatFixtureServices } from '../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { CustomViewNode } from '../../../../browser/parts/customViewNode.js';
import { CustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { ICustomViewService } from '../../../../../workbench/contrib/sessions/browser/customView.js';
import { ISessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { INewSessionDraftSlot, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IChatViewFactory } from '../../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { AbstractChatView } from '../../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ISession, ISessionArtifact, SessionArtifactKind, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { AutomationsCustomViewContribution } from '../../browser/views/automationsView.js';
import { AutomationsLayoutWidget } from '../../browser/views/automationsLayoutWidget.js';
import { AutomationsNavId } from '../../browser/views/automationsLayoutModel.js';

class FixtureAutomationService extends mock<IAutomationService>() {
	override readonly automations: IObservable<readonly IAutomationDescriptor[]>;
	override readonly runs: IObservable<readonly IAutomationRun[]>;
	override readonly catalogueState: IObservable<AutomationCatalogueState> = constObservable('ready');
	override readonly unavailableProviders = constObservable<readonly IAutomationProviderDescriptor[]>([]);
	override readonly availableProviders = constObservable<readonly IAutomationProviderDescriptor[]>([]);
	override historyState: IObservable<AutomationCatalogueState> = constObservable('ready');

	constructor(automations: readonly IAutomationDescriptor[] = [], runs: readonly IAutomationRun[] = []) {
		super();
		this.automations = constObservable(automations);
		this.runs = constObservable(runs);
	}

	override async refresh(): Promise<void> { }
	override getAutomation(id: string): IAutomationDescriptor | undefined { return this.automations.get().find(automation => automation.id === id); }
	override canRunAutomation(): boolean { return true; }
	override canUpdateAutomation(): boolean { return true; }
	override canDeleteAutomation(): boolean { return true; }
}

/** Opens an automation's details without a click, the way a click on its row does. */
class FixtureAutomationsLayoutWidget extends AutomationsLayoutWidget {
	showDetails(rowId: string): void {
		this.openDetails(rowId, { focus: false });
	}
}

/** Real automations, with runs whose sessions recorded what they produced, for the details outside sample data. */
interface ILiveFixtureData {
	readonly automations: readonly IAutomationDescriptor[];
	readonly runs: readonly IAutomationRun[];
	readonly sessions: ReadonlyMap<string, ISession>;
}

function nextTime(now: number, hour: number, onDay: (day: number) => boolean): number {
	const date = new Date(now);
	date.setHours(hour, 0, 0, 0);
	while (date.getTime() <= now || !onDay(date.getDay())) {
		date.setDate(date.getDate() + 1);
	}
	return date.getTime();
}

function fixtureSession(title: string, status: SessionStatus, options: { readonly description?: string; readonly artifacts?: readonly ISessionArtifact[]; readonly changes?: { files: number; additions: number; deletions: number } } = {}): ISession {
	return new class extends mock<ISession>() {
		override readonly title = constObservable(title);
		override readonly status = constObservable(status);
		override readonly isRead = constObservable(status !== SessionStatus.Error);
		override readonly description = constObservable(options.description ? new MarkdownString(options.description) : undefined);
		override readonly artifacts = constObservable(options.artifacts ?? []);
		override readonly changesSummary = constObservable(options.changes);
	}();
}

function getLiveFixtureData(now: number): ILiveFixtureData {
	const minute = 60_000;
	const day = 24 * 60 * minute;
	const iso = (time: number) => new Date(time).toISOString();
	const target = { kind: 'workspace', folderUri: URI.file('/Users/eli/code/vscode'), providerId: LOCAL_AGENT_HOST_PROVIDER_ID, isolation: { kind: 'default' } } as const;
	const flakyTests: IAutomationDescriptor = {
		id: 'fixture.flakyTests',
		name: 'Find flaky tests',
		prompt: 'Run the unit tests three times, list the tests that fail only some of the time, and open a pull request that skips them with a link to a tracking issue.',
		schedule: { interval: 'weekdays', scheduleDay: 0, scheduleHour: 9, scheduleMinute: 0 },
		target,
		enabled: true,
		createdAt: iso(now - 30 * day),
		updatedAt: iso(now - 30 * day),
		nextRunAt: iso(nextTime(now, 9, weekday => weekday >= 1 && weekday <= 5)),
	};
	const dependencyCheck: IAutomationDescriptor = {
		id: 'fixture.dependencyCheck',
		name: 'Weekly dependency check',
		prompt: 'Check for outdated npm dependencies, read their changelogs, and list the updates that are safe to take.',
		schedule: { interval: 'weekly', scheduleDay: 1, scheduleHour: 9, scheduleMinute: 0 },
		target,
		enabled: true,
		createdAt: iso(now - 2 * day),
		updatedAt: iso(now - 2 * day),
		nextRunAt: iso(nextTime(now, 9, weekday => weekday === 1)),
	};
	const session = (run: number) => URI.parse(`agent-host-copilotcli:/fixture-run-${run}`);
	const runs: IAutomationRun[] = [
		{ id: 'fixture.run.4', automationId: flakyTests.id, status: 'running', trigger: 'manual', sessionResource: session(4), startedAt: iso(now - 4 * minute), updatedAt: iso(now - minute) },
		{ id: 'fixture.run.3', automationId: flakyTests.id, status: 'failed', trigger: 'schedule', sessionResource: session(3), startedAt: iso(now - day - 30 * minute), completedAt: iso(now - day), errorMessage: 'The test run timed out after 30 minutes.' },
		{ id: 'fixture.run.2', automationId: flakyTests.id, status: 'completed', trigger: 'schedule', sessionResource: session(2), startedAt: iso(now - 2 * day - 20 * minute), completedAt: iso(now - 2 * day) },
		// A run whose host never linked a session.
		{ id: 'fixture.run.1', automationId: flakyTests.id, status: 'completed', trigger: 'catch_up', startedAt: iso(now - 5 * day - 10 * minute), completedAt: iso(now - 5 * day) },
	];
	const sessions = new Map<string, ISession>([
		[session(4).toString(), fixtureSession(flakyTests.name, SessionStatus.InProgress, { description: 'Running the unit tests, second of three passes' })],
		[session(3).toString(), fixtureSession(flakyTests.name, SessionStatus.Error)],
		[session(2).toString(), fixtureSession('Skip 2 flaky sessions list tests', SessionStatus.Completed, {
			artifacts: [
				{ id: 'pr', kind: SessionArtifactKind.PullRequest, label: '#4127 Skip 2 flaky sessions list tests', isArtifact: true, link: URI.parse('https://github.com/eli-w-king/eli-vscode/pull/4127') },
				// A reference the session only pointed at, not something it produced.
				{ id: 'issue', kind: SessionArtifactKind.Issue, label: '#4100 Sessions list tests are flaky', isArtifact: false, link: URI.parse('https://github.com/eli-w-king/eli-vscode/issues/4100') },
			],
			changes: { files: 2, additions: 14, deletions: 3 },
		})],
	]);
	return { automations: [flakyTests, dependencyCheck], runs, sessions };
}

/**
 * Shows what a click in the fixture asked for, since nothing here can open a session or a link: the exact session or
 * link a run would open, or the notification a sample shows. Also kept on the container for probes.
 */
function acknowledge(container: HTMLElement, kind: 'session' | 'external' | 'notification', text: string): void {
	container.dataset[kind === 'session' ? 'requestedSession' : kind === 'external' ? 'requestedExternal' : 'notification'] = text;
	let element = container.querySelector<HTMLElement>(':scope > .automations-layout-fixture-acknowledgement');
	if (!element) {
		if (container.style.position === '') {
			container.style.position = 'relative';
		}
		element = append(container, $('.automations-layout-fixture-acknowledgement', { role: 'status' }));
		element.style.cssText = 'position: absolute; left: 12px; bottom: 12px; z-index: 10; padding: 4px 8px; border-radius: var(--vscode-cornerRadius-small); border: 1px solid var(--vscode-widget-border, var(--vscode-contrastBorder)); background: var(--vscode-editorWidget-background); color: var(--vscode-foreground); font-size: 12px;';
	}
	element.textContent = kind === 'session' ? `Fixture: would open session ${text}` : kind === 'external' ? `Fixture: would open ${text}` : `Fixture notification: ${text}`;
}

/**
 * Stands in for the New Session composer that Design B hosts: the composer needs the whole Agents window (sessions,
 * providers, models), so its own fixtures live under `sessions/chat/newWidget/`, and Code OSS shows it in place.
 */
class ComposerStandInView extends AbstractChatView {
	override readonly kind = 'newSession';
	private readonly content: HTMLElement;

	constructor() {
		super();
		const container = this.element.appendChild($('.new-chat-widget-container'));
		this.content = container.appendChild($('.new-chat-widget-content'));
		const box = this.content.appendChild($('div', undefined, 'New Session composer (shown in Code OSS)'));
		box.style.cssText = 'height: 116px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; border: 1px dashed var(--vscode-widget-border, var(--vscode-contrastBorder)); border-radius: var(--vscode-cornerRadius-large); color: var(--vscode-descriptionForeground);';
	}

	override get inputContentElement(): HTMLElement {
		return this.content;
	}

	protected override doLayout(): void { }

	override toJSON(): object {
		return {};
	}

	override focus(): void { }
}
interface ILayoutFixtureOptions {
	readonly variant: 'modal' | 'chatInput';
	readonly width: number;
	readonly height: number;
	readonly sampleData: boolean;
	readonly nav?: AutomationsNavId;
	/** Real automations and runs instead of none. */
	readonly live?: boolean;
	/** The automation whose details are open. */
	readonly details?: string;
}

// The widget dates sample runs from the clock it starts with and labels them with fromNow on every
// later render, so the clicked-through fixtures must stay on real time.
const realTime = { enabled: false };
const highContrastThemes = ['darkHighContrast', 'lightHighContrast'] as const;

export default defineThemedFixtureGroup({ path: 'sessions/automations/' }, {
	DesignAHome: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 760, sampleData: true, nav: 'all' }),
	}),
	DesignADetailsSuccess: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		additionalThemes: highContrastThemes,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 760, sampleData: true, nav: 'all', details: 'sample.inboxTriage' }),
	}),
	DesignADetailsInteractive: defineComponentFixture({
		virtualTime: realTime,
		inputSchema: z.object({
			enableAnimations: z.boolean().default(true),
			overrideFocus: z.boolean().default(false),
		}),
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 760, sampleData: true, nav: 'all', details: 'sample.inboxTriage' }),
	}),
	DesignADetailsFailure: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		additionalThemes: highContrastThemes,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 760, sampleData: true, nav: 'all', details: 'sample.variationLab' }),
	}),
	DesignADetailsEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 760, sampleData: false, live: true, nav: 'all', details: 'fixture.dependencyCheck' }),
	}),
	DesignADetailsLive: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 760, sampleData: false, live: true, nav: 'all', details: 'fixture.flakyTests' }),
	}),
	DesignADetailsNarrow: defineComponentFixture({
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 760, height: 760, sampleData: true, nav: 'all', details: 'sample.variationLab' }),
	}),
	DesignAPersonal: defineComponentFixture({
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 640, sampleData: true, nav: 'personal' }),
	}),
	DesignARuns: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 640, sampleData: true, nav: 'runs' }),
	}),
	DesignAExamples: defineComponentFixture({
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 520, sampleData: true, nav: 'examples' }),
	}),
	DesignAEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 560, sampleData: false, nav: 'all' }),
	}),
	DesignBHome: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'chatInput', width: 1200, height: 880, sampleData: true, nav: 'all' }),
	}),
	DesignBNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'chatInput', width: 560, height: 880, sampleData: true, nav: 'all' }),
	}),
	DesignBRuns: defineComponentFixture({
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'chatInput', width: 1200, height: 760, sampleData: true, nav: 'runs' }),
	}),
	DesignBEmpty: defineComponentFixture({
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'chatInput', width: 1200, height: 560, sampleData: false, nav: 'all' }),
	}),
});

/**
 * Create manually in the modal, inline like the real service's inline mode. The real service imports the
 * Sessions prompts service, which needs a file root the Component Explorer doesn't set, so the fixture renders
 * the same form and footer itself. Create and Cancel both return to the list here.
 */
class FixtureInlineAutomationDialogService extends mock<IAutomationDialogService>() {
	instantiationService: IInstantiationService | undefined;

	constructor(private readonly contextKeyService: IContextKeyService) {
		super();
	}

	override async showAutomationDialog(options: IShowAutomationDialogOptions & IInlineAutomationDialogOptions): Promise<IAutomationDialogResult | undefined> {
		const inline = options.inline;
		const instantiationService = this.instantiationService;
		if (!inline || !instantiationService) {
			return undefined;
		}
		const store = new DisposableStore();
		const done = new DeferredPromise<undefined>();
		const element = append(inline.container, $('.automation-dialog.automation-dialog-inline', { role: 'region', 'aria-label': 'New automation' }));
		const close = () => {
			if (!done.isSettled) {
				store.dispose();
				element.remove();
				void done.complete(undefined);
			}
		};
		const body = append(element, $('.automation-dialog-inline-body.automation-dialog-body'));
		append(body, $('.automation-titlebar', undefined, 'New automation'));
		const form = append(append(append(body, $('.automation-dialog-scrollable')), $('.automation-form-pane')), $('.automation-form'));
		const state: IFormState = {
			name: '', interval: 'daily', cronExpression: '', timezoneOffset: new Date().getTimezoneOffset(), hour: 9, minute: 0, day: 1,
			isQuickChat: false, folderUri: undefined, providerId: undefined, sessionTypeId: undefined, isolationMode: undefined, branch: undefined, enabled: true,
		};
		const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined, sessionTypeError: undefined, branchError: undefined };
		renderForm(
			form, state, store, validation, () => { }, instantiationService, this.contextKeyService,
			instantiationService.invokeFunction(accessor => accessor.get(IContextViewService)), instantiationService.invokeFunction(accessor => accessor.get(IConfigurationService)),
			instantiationService.invokeFunction(accessor => accessor.get(IWorkbenchLayoutService)), instantiationService.invokeFunction(accessor => accessor.get(ILogService)),
			instantiationService.invokeFunction(accessor => accessor.get(ISessionsManagementService)), instantiationService.invokeFunction(accessor => accessor.get(IWorkspaceTrustRequestService)),
			options.initialValues?.prompt ?? '', undefined, undefined, constObservable([]),
		);
		const promptHost = form.querySelector<HTMLElement>('.automation-form-prompt-host');
		if (promptHost) {
			promptHost.style.width = '100%';
		}
		form.querySelector<HTMLElement>('input')?.focus();
		const footer = append(append(element, $('.automation-dialog-inline-footer.dialog-buttons-row.automation-dialog-footer-row')), $('.dialog-buttons.automation-dialog-footer-actions'));
		const buttons = store.add(new ButtonBar(footer));
		const cancel = buttons.addButton({ ...defaultButtonStyles, secondary: true });
		cancel.label = 'Cancel';
		const create = buttons.addButton(defaultButtonStyles);
		create.label = 'Create';
		store.add(cancel.onDidClick(close));
		store.add(create.onDidClick(close));
		store.add(addDisposableListener(element, EventType.KEY_DOWN, (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !event.defaultPrevented) {
				event.preventDefault();
				event.stopPropagation();
				close();
			}
		}));
		store.add(inline.token.onCancellationRequested(close));
		return done.p;
	}
}

function renderLayout(ctx: ComponentFixtureContext, options: ILayoutFixtureOptions): void {
	ctx.container.classList.add('monaco-enable-motion');
	const configurationService = new TestConfigurationService({
		chat: { automations: { enabled: true, layout: options.variant, sampleData: options.sampleData } },
		[RemoteAgentHostsEnabledSettingId]: true,
		[ENVIRONMENT_PICKER_SETTING]: true,
		[ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING]: true,
	});
	const live = options.live ? getLiveFixtureData(Date.now()) : undefined;
	const contextKeyService = new ContextKeyService(configurationService);
	const storageService = ctx.disposableStore.add(new InMemoryStorageService());
	if (options.nav) {
		storageService.store('sessions.automations.layout.selectedNav', options.nav, StorageScope.PROFILE, StorageTarget.USER);
	}
	const customViewService = ctx.disposableStore.add(new CustomViewService(new NullLogService(), ctx.disposableStore.add(new InMemoryStorageService())));
	ChatAutomationsEnabledContext.bindTo(contextKeyService).set(true);
	ChatContextKeys.enabled.bindTo(contextKeyService).set(true);

	ctx.container.classList.add('monaco-workbench');
	ctx.container.style.width = `${options.width}px`;
	ctx.container.style.height = `${options.height}px`;

	const inlineDialogService = new FixtureInlineAutomationDialogService(contextKeyService);
	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			registerWorkbenchServices(reg);
			// The real menus, for the page header.
			reg.define(IMenuService, MenuService);
			// Real context menus and hovers, so the filter menu, row menus and warning hovers open when clicked.
			reg.define(IContextViewService, ContextViewService);
			reg.define(IContextMenuService, ContextMenuService);
			reg.define(IHoverService, HoverService);
			reg.defineInstance(IConfigurationService, configurationService);
			reg.defineInstance(IContextKeyService, contextKeyService);
			reg.defineInstance(IStorageService, storageService);
			reg.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
				override readonly mainContainer = ctx.container;
				override readonly activeContainer = ctx.container;
				override readonly mainContainerDimension = { width: options.width, height: options.height };
				override readonly onDidLayoutContainer = Event.None;
				override readonly onDidChangePartVisibility = Event.None;
				override readonly onDidChangeWindowMaximized = Event.None;
				override getContainer() { return ctx.container; }
				override isVisible() { return true; }
			}());
			reg.defineInstance(IAutomationService, new FixtureAutomationService(live?.automations, live?.runs));
			reg.defineInstance(IAutomationRunner, new class extends mock<IAutomationRunner>() { }());
			// Opening a run, a link or a notification only says what it asked for.
			reg.defineInstance(IOpenerService, { ...NullOpenerService, open: async (resource: URI | string) => { acknowledge(ctx.container, 'external', resource.toString()); return true; } });
			reg.defineInstance(INotificationService, new class extends TestNotificationService {
				override info(message: NotificationMessage) {
					acknowledge(ctx.container, 'notification', typeof message === 'string' ? message : message instanceof Error ? message.message : message.toString());
					return super.info(message);
				}
			}());
			// Create manually shows the real form inline in the modal.
			reg.defineInstance(IAutomationDialogService, inlineDialogService);
			reg.defineInstance(IQuickInputService, new class extends mock<IQuickInputService>() {
				override readonly onShow = Event.None;
				override readonly onHide = Event.None;
			}());
			reg.defineInstance(IGitService, new class extends mock<IGitService>() {
				override async openRepository() { return undefined; }
			}());
			reg.defineInstance(ISessionsRecentWorkspacesService, new class extends mock<ISessionsRecentWorkspacesService>() {
				override readonly onDidChangeRecentWorkspaces = Event.None;
				override readonly historyLoadState = constObservable('loaded' as const);
				override getRecentWorkspaces() { return []; }
				override isNoWorkspaceChecked() { return false; }
				override clearCheckedWorkspace() { }
			}());
			reg.defineInstance(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
				override readonly onDidChange = Event.None;
				override readonly onDidChangeDiscovering = Event.None;
				override readonly hosts = [];
				override readonly isDiscovering = false;
				override async rediscover() { return false; }
			}());
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = constObservable([]);
			}());
			reg.defineInstance(IPromptsService, new class extends mock<IPromptsService>() { }());
			reg.defineInstance(IOnboardingScenarioService, new class extends mock<IOnboardingScenarioService>() { }());
			reg.defineInstance(ICustomViewService, customViewService);
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly onDidDeleteSession = Event.None;
				override readonly onDidChangeSessions = Event.None;
				override getSession(resource: URI) { return live?.sessions.get(resource.toString()); }
				override getSessions() { return []; }
				override isQuickChatTargetAvailable() { return false; }
				override readonly automationSession = constObservable(undefined);
				override readonly onDidChangeSessionTypes = Event.None;
				override getAllProviderSessionTypes() { return []; }
				override getQuickChatSessionTypes() { return []; }
				override getSessionTypesForFolder() { return []; }
				override isNewSessionTargetAvailable() { return false; }
				override discardAutomationSession() { }
				override readonly onDidEndNewSessionRequest = Event.None;
				override readonly onDidAcceptNewSessionRequest = Event.None;
				override createNewSessionSlot(): INewSessionDraftSlot & { dispose(): void } {
					return { id: 'fixture', newSession: constObservable(undefined), createNewSession: () => { throw new Error('not in fixtures'); }, createQuickChat: () => { throw new Error('not in fixtures'); }, discardNewSession: () => { }, dispose: () => { } };
				}
			}());
			reg.defineInstance(IChatViewFactory, new class extends mock<IChatViewFactory>() {
				override createNewChatView(): AbstractChatView { return new ComposerStandInView(); }
			}());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				readonly gridShown = constObservable([]);
				override readonly slotPanes = testGridPanes(this.gridShown);
				readonly activeSession = constObservable(undefined);
				// Records the exact session a run asked for, instead of opening one.
				override async openSession(resource: URI): Promise<void> {
					acknowledge(ctx.container, 'session', resource.toString());
				}
			}());
			reg.defineInstance(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
				override readonly onDidChange = Event.None;
				override isSessionPinned(): boolean { return false; }
				override getStatusIcon() { return Codicon.circleSmallFilled; }
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return []; }
				override getProvider() { return undefined; }
			}());
			reg.defineInstance(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() {
				override readonly pendingResponseVersion = constObservable(0);
				override hasPendingResponse() { return false; }
			}());
		},
	});
	stubSessionHosts(instantiationService, ctx.disposableStore);
	inlineDialogService.instantiationService = instantiationService;

	if (options.variant === 'modal') {
		ctx.container.style.backgroundColor = 'var(--vscode-editor-background)';
		const widget = ctx.disposableStore.add(instantiationService.createInstance(FixtureAutomationsLayoutWidget, { variant: 'modal' }));
		ctx.container.appendChild(widget.element);
		widget.layout(options.width, options.height);
		if (options.details) {
			widget.showDetails(options.details);
		}
		return;
	}

	ctx.container.style.setProperty('--session-view-background', 'var(--vscode-agentsPanel-background, var(--vscode-sideBar-background))');
	ctx.container.style.setProperty('--session-view-foreground', 'var(--vscode-agentsPanel-foreground, var(--vscode-sideBar-foreground))');
	ctx.container.style.backgroundColor = 'var(--session-view-background)';
	ctx.disposableStore.add(instantiationService.createInstance(AutomationsCustomViewContribution));
	customViewService.showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
	const descriptor = customViewService.activeCustomView.get();
	if (!descriptor) {
		throw new Error('Automations custom view was not registered');
	}
	const node = ctx.disposableStore.add(instantiationService.createInstance(CustomViewNode, descriptor));
	node.element.style.height = '100%';
	ctx.container.appendChild(node.element);
	node.layout(options.width, options.height);
}
