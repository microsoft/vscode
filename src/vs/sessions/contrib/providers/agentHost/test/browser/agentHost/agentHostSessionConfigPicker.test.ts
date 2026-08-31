/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { constObservable, IObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../../platform/actions/common/actions.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { SessionConfigKey } from '../../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult, SessionConfigPropertySchema, SessionConfigValueItem } from '../../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IView } from '../../../../../../../workbench/common/views.js';
import { IViewsService } from '../../../../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../../../../browser/workbench.js';
import { Menus } from '../../../../../../browser/menus.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../../common/agentHostSessionsProvider.js';
import { ISessionChangesService } from '../../../../../../contrib/changes/browser/sessionChangesService.js';
import { CHANGES_VIEW_ID } from '../../../../../../contrib/changes/common/changes.js';
import { ISessionsProvidersService } from '../../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionWorkspace } from '../../../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../../../../services/sessions/common/sessionsProvider.js';
import { AgentHostSessionConfigPicker, IConfigPickerItem, PickerActionViewItem } from '../../../browser/agentHostSessionConfigPicker.js';

const SESSION_ID = 'local-agent-host:s1';
const SESSION_RESOURCE = URI.parse('agent-session:/s1');

function makeWorkspace(uncommittedChanges: number | undefined, branchName = 'main'): ISessionWorkspace {
	const root = URI.file('/repo');
	return {
		uri: root,
		label: 'repo',
		icon: Codicon.repo,
		folders: [{
			root,
			workingDirectory: root,
			name: 'repo',
			description: undefined,
			gitRepository: {
				uri: root,
				workTreeUri: undefined,
				branchName,
				baseBranchName: undefined,
				uncommittedChanges,
				gitHubInfo: constObservable(undefined),
			},
		}],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
}

/** A config exposing the two shared repo-config chips (isolation + branch). */
function makeRepoConfig(branchValue?: string, isolation: 'folder' | 'worktree' = 'worktree'): ResolveSessionConfigResult {
	return {
		schema: {
			type: 'object',
			properties: {
				[SessionConfigKey.Isolation]: {
					title: 'Isolation', description: '', type: 'string',
					enum: ['folder', 'worktree'], enumLabels: ['Folder', 'Worktree'],
					default: 'worktree',
				},
				[SessionConfigKey.Branch]: {
					title: 'Base Branch', description: '', type: 'string',
					enum: ['main', 'dev'],
				},
			},
		},
		values: { [SessionConfigKey.Isolation]: isolation, ...(branchValue ? { [SessionConfigKey.Branch]: branchValue } : {}) },
	} as ResolveSessionConfigResult;
}

/** A config whose Branch property is resolved dynamically (no static `enum`), as the real branch picker is. */
function makeDynamicBranchConfig(branchValue: string): ResolveSessionConfigResult {
	return {
		schema: {
			type: 'object',
			properties: {
				[SessionConfigKey.Isolation]: {
					title: 'Isolation', description: '', type: 'string',
					enum: ['folder', 'worktree'], enumLabels: ['Folder', 'Worktree'],
					default: 'worktree',
				},
				[SessionConfigKey.Branch]: {
					title: 'Base Branch', description: '', type: 'string',
					enumDynamic: true,
				},
			},
		},
		values: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: branchValue },
	} as ResolveSessionConfigResult;
}

function makeNoGitConfig(): ResolveSessionConfigResult {
	return {
		schema: {
			type: 'object',
			properties: {
				[SessionConfigKey.Isolation]: {
					title: 'Isolation', description: '', type: 'string',
					enum: ['folder'], enumLabels: ['Folder'],
					default: 'folder', readOnly: true,
				},
			},
		},
		values: { [SessionConfigKey.Isolation]: 'folder' },
	} as ResolveSessionConfigResult;
}

/**
 * Fake provider whose `getSessionConfig` returns whatever config is set. The
 * provider (not the picker) owns the seeded schema, so a picker recreated by a
 * toolbar rebuild still reads the seeded chips from here.
 */
class FakeProvider implements Pick<IAgentHostSessionsProvider, 'id' | 'onDidChangeSessionConfig' | 'getSessionConfig' | 'getCreateSessionConfig' | 'isSessionConfigResolving' | 'setSessionConfigValue' | 'getSessionConfigCompletions' | 'isDevContainerAvailable' | 'isDevContainerEnabled' | 'setDevContainerEnabled'> {
	readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
	readonly onDidChangeSessionConfig: Event<string>;
	config: ResolveSessionConfigResult = makeRepoConfig('main');
	readonly resolving = observableValue<boolean>('resolving', false);
	isNew = true;
	setSessionConfigValueCalls = 0;
	devContainerEnabled = false;
	devContainerAvailable = true;
	/** Completions returned by `getSessionConfigCompletions`, e.g. for the dynamic branch picker. */
	completions: readonly SessionConfigValueItem[] = [];

	constructor(private readonly _emitter: Emitter<string>) {
		this.onDidChangeSessionConfig = _emitter.event;
	}

	getSessionConfig(): ResolveSessionConfigResult | undefined { return this.config; }
	getCreateSessionConfig(): Record<string, unknown> | undefined { return this.isNew ? {} : undefined; }
	isSessionConfigResolving() { return this.resolving; }
	async setSessionConfigValue(): Promise<void> { this.setSessionConfigValueCalls++; }
	async getSessionConfigCompletions(): Promise<readonly SessionConfigValueItem[]> { return this.completions; }
	isDevContainerAvailable(): boolean { return this.devContainerAvailable; }
	isDevContainerEnabled(): boolean { return this.devContainerEnabled; }
	setDevContainerEnabled(_sessionId: string, enabled: boolean): void { this.devContainerEnabled = enabled; }

	/** Swap the config + resolving flag and pulse, as the real provider does. */
	set(config: ResolveSessionConfigResult, resolving: boolean): void {
		this.config = config;
		this.resolving.set(resolving, undefined);
		this._emitter.fire(SESSION_ID);
	}
}

class AlwaysRenderConfigPicker extends AgentHostSessionConfigPicker {
	protected override _shouldRenderProperty(_property: string, _schema: SessionConfigPropertySchema, _isNewSession: boolean): boolean {
		return true;
	}

	renderTriggerForTest(trigger: HTMLElement, property: string, schema: SessionConfigPropertySchema, value: unknown, isReadOnly: boolean): void {
		this._renderTrigger(trigger, SESSION_ID, property, schema, value, isReadOnly);
	}
}

function isolationSlot(container: HTMLElement): HTMLElement | null {
	return container.querySelector<HTMLElement>('.sessions-chat-isolation-checkbox');
}

function devContainerSlot(container: HTMLElement): HTMLElement | null {
	return container.querySelector<HTMLElement>('.sessions-chat-dev-container-checkbox');
}

function branchSlot(container: HTMLElement): HTMLElement | undefined {
	return Array.from(container.querySelectorAll<HTMLElement>('.sessions-chat-picker-slot'))
		.find(slot => !slot.classList.contains('sessions-chat-config-checkbox'));
}

function branchLabel(container: HTMLElement): string | undefined {
	return branchSlot(container)?.querySelector<HTMLElement>('.sessions-chat-dropdown-label')?.textContent ?? undefined;
}

function branchState(container: HTMLElement): { icon: string | undefined; ariaLabel: string | null | undefined } {
	const trigger = branchSlot(container)?.querySelector<HTMLElement>('.action-label');
	const icon = trigger?.querySelector<HTMLElement>('.codicon');
	return {
		icon: Array.from(icon?.classList ?? []).find(name => name.startsWith('codicon-')),
		ariaLabel: trigger?.getAttribute('aria-label'),
	};
}

/** Captures the delegate passed to the last `IActionWidgetService.show` call, so tests can drive a selection. */
class CapturingActionWidgetHolder {
	delegate: IActionListDelegate<IConfigPickerItem> | undefined;
	items: readonly IActionListItem<IConfigPickerItem>[] = [];
	readonly events: string[] = [];
}

function setupServices(store: Pick<ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, 'add'>) {
	const emitter = store.add(new Emitter<string>());
	const provider = new FakeProvider(emitter);
	const actionWidget = new CapturingActionWidgetHolder();

	const instantiationService = store.add(new TestInstantiationService());
	instantiationService.stub(IActionWidgetService, {
		isVisible: false,
		hide: () => actionWidget.events.push('hide'),
		show: (_user, _supportsPreview, items: readonly IActionListItem<IConfigPickerItem>[], delegate: IActionListDelegate<IConfigPickerItem>) => {
			actionWidget.items = items;
			actionWidget.delegate = delegate;
		},
	} as Partial<IActionWidgetService> as IActionWidgetService);
	instantiationService.stub(IHoverService, { setupDelayedHover: () => ({ dispose: () => { } }) } as Partial<IHoverService> as IHoverService);
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(IConfigurationService, new (class extends mock<IConfigurationService>() { })());
	instantiationService.stub(IDialogService, new (class extends mock<IDialogService>() { })());
	instantiationService.stub(IStorageService, new (class extends mock<IStorageService>() { })());
	instantiationService.stub(IContextKeyService, new (class extends mock<IContextKeyService>() {
		override readonly onDidChangeContext = Event.None;
	})());
	instantiationService.stub(IAgentWorkbenchLayoutService, new (class extends mock<IAgentWorkbenchLayoutService>() {
		// No `phone-layout` class → `isPhoneLayout` is false → isolation renders as a checkbox.
		override readonly mainContainer = document.createElement('div');
		override readonly isSinglePaneLayoutEnabled = true;
		override suppressEditorPartAutoVisibility() {
			actionWidget.events.push('suppressEditorPartAutoVisibility');
			return { dispose: () => actionWidget.events.push('releaseEditorPartAutoVisibility') };
		}
	})());
	instantiationService.stub(ISessionChangesService, new (class extends mock<ISessionChangesService>() {
		override async openChangesEditor(sessionResource: URI): Promise<undefined> {
			actionWidget.events.push(`openChangesEditor:${sessionResource.toString()}`);
			return undefined;
		}
	})());
	instantiationService.stub(IViewsService, new (class extends mock<IViewsService>() {
		override async openView<T extends IView>(id: string, focus?: boolean): Promise<T | null> {
			actionWidget.events.push(`openView:${id}:${focus}`);
			return null;
		}
	})());
	instantiationService.set(ISessionsProvidersService, new (class extends mock<ISessionsProvidersService>() {
		override readonly onDidChangeProviders = Event.None;
		override getProviders(): ISessionsProvider[] { return [provider as unknown as ISessionsProvider]; }
		override getProvider<T extends ISessionsProvider>(id: string): T | undefined {
			return id === provider.id ? provider as unknown as T : undefined;
		}
	})());

	const workspaceObs = observableValue<ISessionWorkspace | undefined>('workspace', makeWorkspace(undefined));
	const workspace: IObservable<ISessionWorkspace | undefined> = workspaceObs;
	const sessionObs = observableValue<IActiveSession | undefined>('activeSession', {
		providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
		sessionId: SESSION_ID,
		resource: SESSION_RESOURCE,
		workspace,
	} as IActiveSession);
	return { instantiationService, provider, sessionObs, workspaceObs, actionWidget };
}

/** Create and render a fresh picker instance, as the toolbar does on a rebuild. */
function renderPicker(store: Pick<ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, 'add'>, services: ReturnType<typeof setupServices>) {
	const picker = store.add(services.instantiationService.createInstance(AgentHostSessionConfigPicker, services.sessionObs));
	const container = document.createElement('div');
	picker.render(container);
	return { picker, container };
}

suite('Agent Host Session Config Picker', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('places mode immediately before approvals in secondary toolbars', () => {
		const summarize = (menu: MenuId, ids: readonly string[]) => MenuRegistry.getMenuItems(menu)
			.filter(isIMenuItem)
			.filter(item => ids.includes(item.command.id))
			.map(item => ({ id: item.command.id, order: item.order }))
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

		const newSessionIds = [
			'sessions.agentHost.newSessionModePicker',
			'sessions.agentHost.newSessionApprovePicker',
			'sessions.agentHost.newSessionPermissionModePicker',
		];
		const runningSessionIds = [
			'sessions.agentHost.runningSessionModePicker',
			'sessions.agentHost.runningSessionConfigPicker',
			'sessions.agentHost.runningSessionPermissionModePicker',
		];

		assert.deepStrictEqual({
			newSessionPrimary: summarize(Menus.NewSessionConfig, newSessionIds),
			newSessionSecondary: summarize(Menus.NewSessionControl, newSessionIds),
			runningSessionPrimary: summarize(MenuId.ChatInput, runningSessionIds),
			runningSessionSecondary: summarize(MenuId.ChatInputSecondary, runningSessionIds),
		}, {
			newSessionPrimary: [],
			newSessionSecondary: [
				{ id: 'sessions.agentHost.newSessionModePicker', order: 0 },
				{ id: 'sessions.agentHost.newSessionApprovePicker', order: 1 },
				{ id: 'sessions.agentHost.newSessionPermissionModePicker', order: 2 },
			],
			runningSessionPrimary: [],
			runningSessionSecondary: [
				{ id: 'sessions.agentHost.runningSessionModePicker', order: 9 },
				{ id: 'sessions.agentHost.runningSessionConfigPicker', order: 10 },
				{ id: 'sessions.agentHost.runningSessionPermissionModePicker', order: 11 },
			],
		});
	});

	test('picker action view items expose responsive compact state', () => {
		let pickerAnchor: HTMLElement | undefined;
		const item = store.add(new PickerActionViewItem({
			render: () => { },
			showPicker: anchor => {
				pickerAnchor = anchor;
				return true;
			},
			dispose: () => { },
		}));
		const container = document.createElement('div');
		const overflowAnchor = document.createElement('button');
		item.render(container);
		const expanded = {
			compact: item.isCompact(),
			className: container.classList.contains('compact-picker'),
		};

		item.setCompact(true);
		item.show(overflowAnchor);
		const compact = {
			compact: item.isCompact(),
			className: container.classList.contains('compact-picker'),
			usesOverflowAnchor: pickerAnchor === overflowAnchor,
		};

		assert.deepStrictEqual({ expanded, compact }, {
			expanded: { compact: false, className: false },
			compact: { compact: true, className: true, usesOverflowAnchor: true },
		});
	});

	test('generic auto-approve chips retain their contextual accessible name', () => {
		const services = setupServices(store);
		const picker = store.add(services.instantiationService.createInstance(AlwaysRenderConfigPicker, services.sessionObs));
		const trigger = document.createElement('span');
		picker.renderTriggerForTest(trigger, SessionConfigKey.AutoApprove, {
			title: 'Approval Mode',
			type: 'string',
			enum: ['assisted'],
			enumLabels: ['Assisted'],
			readOnly: true,
		}, 'assisted', true);

		assert.deepStrictEqual({
			ariaLabel: trigger.getAttribute('aria-label'),
			warning: trigger.classList.contains('warning'),
		}, {
			ariaLabel: 'Approval Mode: Assisted, Read-Only',
			warning: true,
		});
	});

	test('branch chip tracks host-reported uncommitted changes', () => {
		const services = setupServices(store);
		services.provider.config = makeDynamicBranchConfig('main');
		services.workspaceObs.set(makeWorkspace(3), undefined);
		const { container } = renderPicker(store, services);

		const initiallyDirty = branchState(container);
		services.workspaceObs.set(makeWorkspace(0), undefined);
		const clean = branchState(container);
		services.workspaceObs.set(makeWorkspace(2), undefined);
		const dirtyAfterUpdate = branchState(container);
		services.workspaceObs.set(makeWorkspace(2, 'dev'), undefined);
		const differentBranch = branchState(container);

		assert.deepStrictEqual({ initiallyDirty, clean, dirtyAfterUpdate, differentBranch }, {
			initiallyDirty: {
				icon: 'codicon-git-branch-changes',
				ariaLabel: 'Base Branch: main, Uncommitted Files',
			},
			clean: {
				icon: 'codicon-git-branch',
				ariaLabel: 'Base Branch: main',
			},
			dirtyAfterUpdate: {
				icon: 'codicon-git-branch-changes',
				ariaLabel: 'Base Branch: main, Uncommitted Files',
			},
			differentBranch: {
				icon: 'codicon-git-branch',
				ariaLabel: 'Base Branch: main',
			},
		});
	});

	test('expanded branch picker marks only the checked-out branch as having uncommitted files', async () => {
		const services = setupServices(store);
		services.provider.config = makeDynamicBranchConfig('main');
		services.provider.completions = [
			{ value: 'dev', label: 'dev' },
			{ value: 'main', label: 'main' },
		];
		services.workspaceObs.set(makeWorkspace(2, 'dev'), undefined);
		const { container } = renderPicker(store, services);

		branchSlot(container)!.querySelector<HTMLElement>('a.action-label')!
			.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		await new Promise(resolve => setTimeout(resolve));

		const plural = services.actionWidget.items.map(item => ({
			kind: item.kind,
			label: item.label,
			icon: item.group?.icon?.id,
			checked: item.item?.checked,
			detail: item.detail,
			ariaDescription: item.ariaDescription,
			toolbarActions: item.toolbarActions?.map(action => ({ id: action.id, label: action.label })),
		}));

		services.workspaceObs.set(makeWorkspace(1, 'dev'), undefined);
		branchSlot(container)!.querySelector<HTMLElement>('a.action-label')!
			.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		await new Promise(resolve => setTimeout(resolve));
		const singularItem = services.actionWidget.items.find(item => item.label === 'dev');
		const singular = {
			detail: singularItem?.detail,
			ariaDescription: singularItem?.ariaDescription,
		};

		services.workspaceObs.set(makeWorkspace(0, 'dev'), undefined);
		branchSlot(container)!.querySelector<HTMLElement>('a.action-label')!
			.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		await new Promise(resolve => setTimeout(resolve));
		const cleanToolbarActions = services.actionWidget.items.find(item => item.label === 'dev')?.toolbarActions;

		services.provider.completions = [{ value: 'main', label: 'main' }];
		branchSlot(container)!.querySelector<HTMLElement>('a.action-label')!
			.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		await new Promise(resolve => setTimeout(resolve));
		const singleResultKinds = services.actionWidget.items.map(item => item.kind);

		assert.deepStrictEqual({ plural, singular, cleanToolbarActions, singleResultKinds }, {
			plural: [
				{
					kind: ActionListItemKind.Action,
					label: 'main',
					icon: Codicon.gitBranch.id,
					checked: true,
					detail: undefined,
					ariaDescription: undefined,
					toolbarActions: undefined,
				},
				{
					kind: ActionListItemKind.Separator,
					label: '',
					icon: undefined,
					checked: undefined,
					detail: undefined,
					ariaDescription: undefined,
					toolbarActions: undefined,
				},
				{
					kind: ActionListItemKind.Action,
					label: 'dev',
					icon: Codicon.gitBranchChanges.id,
					checked: false,
					detail: '2 uncommitted files',
					ariaDescription: '2 uncommitted files',
					toolbarActions: [{
						id: 'sessions.agentHost.showBranchChanges',
						label: 'Show Changes',
					}],
				},
			],
			singular: {
				detail: '1 uncommitted file',
				ariaDescription: '1 uncommitted file',
			},
			cleanToolbarActions: undefined,
			singleResultKinds: [ActionListItemKind.Action],
		});
	});

	test('dirty branch action selects the Changes tab before focusing the Changes view', async () => {
		const services = setupServices(store);
		services.provider.config = makeDynamicBranchConfig('main');
		services.provider.completions = [
			{ value: 'main', label: 'main' },
			{ value: 'dev', label: 'dev' },
		];
		services.workspaceObs.set(makeWorkspace(1, 'dev'), undefined);
		const { container } = renderPicker(store, services);

		branchSlot(container)!.querySelector<HTMLElement>('a.action-label')!.click();
		await new Promise(resolve => setTimeout(resolve));
		const action = services.actionWidget.items.find(item => item.label === 'dev')?.toolbarActions?.[0];
		await action?.run();

		assert.deepStrictEqual(services.actionWidget.events, [
			'hide',
			'suppressEditorPartAutoVisibility',
			`openChangesEditor:${SESSION_RESOURCE.toString()}`,
			'releaseEditorPartAutoVisibility',
			`openView:${CHANGES_VIEW_ID}:true`,
		]);
	});

	test('a picker recreated on a session switch still renders the provider-seeded chips (disabled) while resolving', () => {
		const services = setupServices(store);
		const { provider } = services;

		// Draft resolved → chips present and enabled.
		provider.set(makeRepoConfig('main'), false);
		const first = renderPicker(store, services);
		assert.ok(isolationSlot(first.container), 'isolation checkbox renders for a resolved schema');
		assert.ok(branchSlot(first.container), 'branch chip renders for a resolved schema');
		assert.strictEqual(isolationSlot(first.container)!.classList.contains('disabled'), false);

		// A session-type switch disposes the toolbar's picker; the provider seeds the
		// new (still-resolving) draft's config with the cached chips.
		first.picker.dispose();
		provider.set(makeRepoConfig(), true);

		// The freshly created picker still shows the chips (disabled) — the cache
		// lives on the provider, not the disposed picker instance.
		const second = renderPicker(store, services);
		assert.ok(isolationSlot(second.container), 'isolation visible on a freshly created picker');
		assert.ok(branchSlot(second.container), 'branch visible on a freshly created picker');
		assert.strictEqual(isolationSlot(second.container)!.classList.contains('resolving'), true, 'isolation blocks interaction without dimming while resolving');
		assert.strictEqual(isolationSlot(second.container)!.classList.contains('disabled'), false, 'isolation keeps its normal presentation while resolving');
		assert.strictEqual(branchSlot(second.container)!.classList.contains('resolving'), true, 'branch blocks interaction without dimming while resolving');
		assert.strictEqual(branchSlot(second.container)!.classList.contains('disabled'), false, 'branch keeps its normal presentation while resolving');
		assert.strictEqual(isolationSlot(second.container)!.querySelector('.monaco-checkbox')?.getAttribute('aria-disabled'), 'true');
		assert.strictEqual(branchSlot(second.container)!.querySelector('a.action-label')?.getAttribute('aria-disabled'), 'true');

		// Resolve lands → chips re-enable and reflect the resolved value.
		provider.set(makeRepoConfig('dev'), false);
		assert.strictEqual(isolationSlot(second.container)!.classList.contains('resolving'), false, 'isolation re-enables after resolve');
		assert.strictEqual(branchSlot(second.container)!.classList.contains('resolving'), false, 'branch re-enables after resolve');
		assert.strictEqual(branchLabel(second.container), 'dev', 'branch label reflects the resolved value');
	});

	test('renders Dev Container before the Worktree and Branch controls and updates the draft', () => {
		const services = setupServices(store);
		const { provider } = services;
		const { container } = renderPicker(store, services);

		const devContainer = devContainerSlot(container)!;
		const worktree = isolationSlot(container)!;
		devContainer.querySelector<HTMLElement>('.action-label')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		assert.deepStrictEqual({
			labels: Array.from(container.querySelectorAll<HTMLElement>('.sessions-chat-config-checkbox .sessions-chat-dropdown-label')).map(label => label.textContent),
			devContainerImmediatelyPrecedesWorktree: devContainer.nextElementSibling === worktree,
			worktreeImmediatelyPrecedesBranch: worktree.nextElementSibling === branchSlot(container),
			devContainerChecked: devContainer.querySelector('.monaco-checkbox')?.getAttribute('aria-checked'),
			devContainerEnabled: provider.devContainerEnabled,
			setSessionConfigValueCalls: provider.setSessionConfigValueCalls,
		}, {
			labels: ['Dev Container', 'New Worktree'],
			devContainerImmediatelyPrecedesWorktree: true,
			worktreeImmediatelyPrecedesBranch: true,
			devContainerChecked: 'true',
			devContainerEnabled: true,
			setSessionConfigValueCalls: 0,
		});
	});

	test('does not render Dev Container when the draft workspace is unavailable', () => {
		const services = setupServices(store);
		services.provider.devContainerAvailable = false;
		const { container } = renderPicker(store, services);

		assert.strictEqual(devContainerSlot(container), null);
	});

	test('keeps Dev Container left of Worktree when availability resolves later', () => {
		const services = setupServices(store);
		services.provider.devContainerAvailable = false;
		const { container } = renderPicker(store, services);

		services.provider.devContainerAvailable = true;
		services.provider.set(makeRepoConfig('main'), false);
		services.provider.set(makeRepoConfig('dev'), false);

		const worktree = isolationSlot(container)!;
		const devContainer = devContainerSlot(container)!;
		assert.deepStrictEqual({
			labels: Array.from(container.querySelectorAll<HTMLElement>('.sessions-chat-config-checkbox .sessions-chat-dropdown-label')).map(label => label.textContent),
			devContainerImmediatelyPrecedesWorktree: devContainer.nextElementSibling === worktree,
			worktreeImmediatelyPrecedesBranch: worktree.nextElementSibling === branchSlot(container),
		}, {
			labels: ['Dev Container', 'New Worktree'],
			devContainerImmediatelyPrecedesWorktree: true,
			worktreeImmediatelyPrecedesBranch: true,
		});
	});

	test('keeps the isolation checkbox node and focus stable while config resolves', () => {
		const services = setupServices(store);
		const { provider } = services;
		provider.set(makeRepoConfig('main'), false);
		const { container } = renderPicker(store, services);
		document.body.appendChild(container);
		store.add({ dispose: () => container.remove() });

		const checkbox = isolationSlot(container)!.querySelector<HTMLElement>('.monaco-checkbox')!;
		checkbox.focus();
		provider.set(makeRepoConfig('main', 'folder'), true);
		const resolvingCheckbox = isolationSlot(container)!.querySelector<HTMLElement>('.monaco-checkbox')!;
		const resolvingState = {
			sameNode: resolvingCheckbox === checkbox,
			focused: document.activeElement === checkbox,
			checked: resolvingCheckbox.getAttribute('aria-checked'),
			disabled: resolvingCheckbox.getAttribute('aria-disabled'),
			disabledPalette: resolvingCheckbox.classList.contains('disabled'),
			resolving: isolationSlot(container)!.classList.contains('resolving'),
			dimmed: isolationSlot(container)!.classList.contains('disabled'),
		};

		provider.set(makeRepoConfig('main', 'folder'), false);
		const resolvedCheckbox = isolationSlot(container)!.querySelector<HTMLElement>('.monaco-checkbox')!;
		assert.deepStrictEqual({
			resolving: resolvingState,
			resolved: {
				sameNode: resolvedCheckbox === checkbox,
				focused: document.activeElement === checkbox,
				checked: resolvedCheckbox.getAttribute('aria-checked'),
				disabled: resolvedCheckbox.getAttribute('aria-disabled'),
				resolving: isolationSlot(container)!.classList.contains('resolving'),
				count: container.querySelectorAll('.sessions-chat-isolation-checkbox').length,
			},
		}, {
			resolving: {
				sameNode: true,
				focused: true,
				checked: 'false',
				disabled: 'true',
				disabledPalette: false,
				resolving: true,
				dimmed: false,
			},
			resolved: {
				sameNode: true,
				focused: true,
				checked: 'false',
				disabled: 'false',
				resolving: false,
				count: 1,
			},
		});
	});

	test('branch picker keeps the display label for a dynamic (enumDynamic) selection, not just the persisted value', async () => {
		const services = setupServices(store);
		const { provider, actionWidget } = services;

		provider.config = makeDynamicBranchConfig('main');
		const { picker, container } = renderPicker(store, services);

		// Only `value` gets persisted server-side for enumDynamic properties, so the
		// display label for a freshly selected branch must come from the picker's
		// own cache of the last-fetched completions, not from the schema (there is
		// no static `enum`/`enumLabels` for a dynamic property) or the raw value.
		provider.completions = [{ value: 'feature/x', label: 'Feature X' }];

		const trigger = branchSlot(container)!.querySelector<HTMLElement>('a.action-label')!;
		trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		await new Promise(resolve => setTimeout(resolve));

		assert.ok(actionWidget.delegate, 'opening the picker fetches completions and shows the action widget');
		actionWidget.delegate!.onSelect({ value: 'feature/x', label: 'Feature X' });
		await new Promise(resolve => setTimeout(resolve));

		// Simulate the provider persisting the new value and notifying listeners,
		// as the real provider does once `setSessionConfigValue` resolves.
		provider.set(makeDynamicBranchConfig('feature/x'), false);

		assert.strictEqual(branchLabel(container), 'Feature X', 'branch label uses the cached completion label, not the raw value');
		picker.dispose();
	});

	test('evicts dynamic-value label cache entries once the picker moves to a different session', async () => {
		const services = setupServices(store);
		const { provider, actionWidget, sessionObs } = services;

		// The new-session composer's `_session` observable tracks the globally
		// active session, so the *same* picker instance can be shown a sequence of
		// different draft sessions over its lifetime (see `NewChatWidget._session`).
		// Simulate that here by mutating `sessionObs` in place instead of disposing.
		provider.config = makeDynamicBranchConfig('main');
		const { picker, container } = renderPicker(store, services);

		provider.completions = [{ value: 'feature/x', label: 'Feature X' }];
		const trigger = branchSlot(container)!.querySelector<HTMLElement>('a.action-label')!;
		trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		await new Promise(resolve => setTimeout(resolve));
		actionWidget.delegate!.onSelect({ value: 'feature/x', label: 'Feature X' });
		await new Promise(resolve => setTimeout(resolve));
		provider.set(makeDynamicBranchConfig('feature/x'), false);

		const cache = (picker as unknown as { _dynamicValueLabels: Map<string, Map<string, string>> })._dynamicValueLabels;
		assert.ok(Array.from(cache.keys()).some(key => key.startsWith(`${SESSION_ID}\0`)), 'cache holds an entry for the first session');

		// Move the picker to a different session, as would happen when the
		// composer's active session changes without the picker being recreated.
		const OTHER_SESSION_ID = 'local-agent-host:s2';
		provider.config = makeDynamicBranchConfig('main');
		sessionObs.set({
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			sessionId: OTHER_SESSION_ID,
			workspace: constObservable(makeWorkspace(undefined)),
		} as IActiveSession, undefined);

		assert.strictEqual(Array.from(cache.keys()).some(key => key.startsWith(`${SESSION_ID}\0`)), false, 'stale entries for the previous session are evicted');
		picker.dispose();
	});

	test('renders Dev Container independently when the workspace has no Git repository', () => {
		const services = setupServices(store);
		services.provider.config = makeNoGitConfig();
		const picker = store.add(services.instantiationService.createInstance(AlwaysRenderConfigPicker, services.sessionObs));
		const container = document.createElement('div');
		picker.render(container);

		assert.deepStrictEqual({
			devContainer: devContainerSlot(container)?.querySelector('.sessions-chat-dropdown-label')?.textContent,
			isolation: isolationSlot(container),
		}, {
			devContainer: 'Dev Container',
			isolation: null,
		});
	});

	test('never renders chips for hidden worktree branch carrier properties', () => {
		const services = setupServices(store);
		services.provider.config = {
			schema: {
				type: 'object',
				properties: {
					[SessionConfigKey.Isolation]: {
						title: 'Isolation', description: '', type: 'string',
						enum: ['folder', 'worktree'], enumLabels: ['Folder', 'Worktree'],
						default: 'worktree',
					},
					[SessionConfigKey.WorktreeBranchTrack]: {
						title: 'Track Branch', description: '', type: 'boolean',
						default: false, readOnly: true, sessionMutable: false,
					},
					[SessionConfigKey.WorktreeCreateNewBranch]: {
						title: 'Create New Branch', description: '', type: 'boolean',
						default: true, readOnly: true, sessionMutable: false,
					},
				},
			},
			values: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.WorktreeBranchTrack]: false, [SessionConfigKey.WorktreeCreateNewBranch]: true },
		} as ResolveSessionConfigResult;
		const picker = store.add(services.instantiationService.createInstance(AlwaysRenderConfigPicker, services.sessionObs));
		const container = document.createElement('div');
		picker.render(container);

		assert.strictEqual(container.querySelectorAll('.sessions-chat-picker-slot').length, 2, 'only the Dev Container and isolation checkboxes render, not a worktreeBranchTrack chip');
	});
});
