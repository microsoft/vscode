/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { SessionConfigKey } from '../../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult } from '../../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkbenchLayoutService } from '../../../../../../../workbench/services/layout/browser/layoutService.js';
import { Menus } from '../../../../../../browser/menus.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../../../services/sessions/common/sessionsProvider.js';

import { AgentHostSessionConfigPicker } from '../../../browser/agentHostSessionConfigPicker.js';

const SESSION_ID = 'local-agent-host:s1';

/** A config exposing the two shared repo-config chips (isolation + branch). */
function makeRepoConfig(branchValue?: string): ResolveSessionConfigResult {
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
		values: { [SessionConfigKey.Isolation]: 'worktree', ...(branchValue ? { [SessionConfigKey.Branch]: branchValue } : {}) },
	} as ResolveSessionConfigResult;
}

/**
 * Fake provider whose `getSessionConfig` returns whatever config is set. The
 * provider (not the picker) owns the seeded schema, so a picker recreated by a
 * toolbar rebuild still reads the seeded chips from here.
 */
class FakeProvider implements Pick<IAgentHostSessionsProvider, 'id' | 'onDidChangeSessionConfig' | 'getSessionConfig' | 'getCreateSessionConfig' | 'isSessionConfigResolving' | 'setSessionConfigValue'> {
	readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
	readonly onDidChangeSessionConfig: Event<string>;
	config: ResolveSessionConfigResult = makeRepoConfig('main');
	readonly resolving = observableValue<boolean>('resolving', false);
	isNew = true;

	constructor(private readonly _emitter: Emitter<string>) {
		this.onDidChangeSessionConfig = _emitter.event;
	}

	getSessionConfig(): ResolveSessionConfigResult | undefined { return this.config; }
	getCreateSessionConfig(): Record<string, unknown> | undefined { return this.isNew ? {} : undefined; }
	isSessionConfigResolving() { return this.resolving; }
	async setSessionConfigValue(): Promise<void> { }

	/** Swap the config + resolving flag and pulse, as the real provider does. */
	set(config: ResolveSessionConfigResult, resolving: boolean): void {
		this.config = config;
		this.resolving.set(resolving, undefined);
		this._emitter.fire(SESSION_ID);
	}
}

function isolationSlot(container: HTMLElement): HTMLElement | null {
	return container.querySelector<HTMLElement>('.sessions-chat-isolation-checkbox');
}

function branchSlot(container: HTMLElement): HTMLElement | undefined {
	return Array.from(container.querySelectorAll<HTMLElement>('.sessions-chat-picker-slot'))
		.find(slot => !slot.classList.contains('sessions-chat-isolation-checkbox'));
}

function branchLabel(container: HTMLElement): string | undefined {
	return branchSlot(container)?.querySelector<HTMLElement>('.sessions-chat-dropdown-label')?.textContent ?? undefined;
}

function setupServices(store: Pick<ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, 'add'>) {
	const emitter = store.add(new Emitter<string>());
	const provider = new FakeProvider(emitter);

	const instantiationService = store.add(new TestInstantiationService());
	instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => { }, show: () => { } } as Partial<IActionWidgetService> as IActionWidgetService);
	instantiationService.stub(IHoverService, { setupDelayedHover: () => ({ dispose: () => { } }) } as Partial<IHoverService> as IHoverService);
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(IConfigurationService, new (class extends mock<IConfigurationService>() { })());
	instantiationService.stub(IDialogService, new (class extends mock<IDialogService>() { })());
	instantiationService.stub(IStorageService, new (class extends mock<IStorageService>() { })());
	instantiationService.stub(IContextKeyService, new (class extends mock<IContextKeyService>() {
		override readonly onDidChangeContext = Event.None;
	})());
	instantiationService.stub(IWorkbenchLayoutService, new (class extends mock<IWorkbenchLayoutService>() {
		// No `phone-layout` class → `isPhoneLayout` is false → isolation renders as a checkbox.
		override readonly mainContainer = document.createElement('div');
	})());
	instantiationService.set(ISessionsProvidersService, new (class extends mock<ISessionsProvidersService>() {
		override readonly onDidChangeProviders = Event.None;
		override getProviders(): ISessionsProvider[] { return [provider as unknown as ISessionsProvider]; }
		override getProvider<T extends ISessionsProvider>(id: string): T | undefined {
			return id === provider.id ? provider as unknown as T : undefined;
		}
	})());

	const sessionObs = observableValue<IActiveSession | undefined>('activeSession', { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionId: SESSION_ID } as IActiveSession);
	return { instantiationService, provider, sessionObs };
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
		assert.strictEqual(isolationSlot(second.container)!.classList.contains('disabled'), true, 'isolation disabled while resolving');
		assert.strictEqual(branchSlot(second.container)!.classList.contains('disabled'), true, 'branch disabled while resolving');
		assert.strictEqual(branchSlot(second.container)!.querySelector('a.action-label')?.getAttribute('aria-disabled'), 'true');

		// Resolve lands → chips re-enable and reflect the resolved value.
		provider.set(makeRepoConfig('dev'), false);
		assert.strictEqual(isolationSlot(second.container)!.classList.contains('disabled'), false, 'isolation re-enables after resolve');
		assert.strictEqual(branchSlot(second.container)!.classList.contains('disabled'), false, 'branch re-enables after resolve');
		assert.strictEqual(branchLabel(second.container), 'dev', 'branch label reflects the resolved value');
	});
});
