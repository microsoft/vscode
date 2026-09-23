/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { autorun, derived, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationCatalogueState, AutomationMutationGuard, AutomationUnavailableError, ICreateAutomationOptions, IUpdateAutomationOptions, serializeAutomationEditableState } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider, ISessionsProviderAutomations } from '../../../../services/sessions/common/sessionsProvider.js';
import { ProviderAutomationService } from '../../browser/providerAutomationService.js';

function automation(providerId: string): IAutomationDescriptor {
	return {
		id: `${providerId}-automation`,
		name: 'Review',
		prompt: 'Review changes',
		schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
		target: { kind: 'workspace', folderUri: URI.file('/workspace'), providerId, sessionTypeId: 'copilotcli', isolation: { kind: 'default' } },
		enabled: true,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		nextRunAt: '2026-01-02T09:00:00.000Z',
	};
}

class TestAuthority extends mock<ISessionsProviderAutomations>() {
	override readonly catalogueState = observableValue<AutomationCatalogueState>(this, 'ready');
	override readonly canCreateAutomation = this.catalogueState.map(state => state === 'ready');
	override readonly unavailableReason = observableValue<string | undefined>(this, undefined);
	override readonly automations;
	override readonly runs = observableValue<readonly IAutomationRun[]>(this, []);
	readonly calls: string[] = [];

	constructor(readonly providerId: string) {
		super();
		this.automations = observableValue<readonly IAutomationDescriptor[]>(this, [automation(providerId)]);
	}

	override getAutomation(id: string) {
		return this.automations.get().find(automation => automation.id === id);
	}

	override runsFor(id: string) {
		return derived(reader => this.runs.read(reader).filter(run => run.automationId === id));
	}

	override canRunAutomation(id: string): boolean { return this.canCreateAutomation.get() && !!this.getAutomation(id); }
	override canUpdateAutomation(id: string): boolean { return this.canRunAutomation(id); }
	override canDeleteAutomation(id: string): boolean { return this.canRunAutomation(id); }
	override getActiveRunFor(id: string) { return this.runs.get().find(run => run.automationId === id && run.status === 'running'); }

	override async createAutomation(options: ICreateAutomationOptions, guard?: AutomationMutationGuard) {
		guard?.();
		this.calls.push('create');
		return { ...automation(this.providerId), ...options, enabled: options.enabled ?? true };
	}

	override async updateAutomation(id: string, patch: IUpdateAutomationOptions) {
		this.calls.push('update');
		const current = this.getAutomation(id)!;
		return { ...current, name: patch.name ?? current.name, target: patch.target ?? current.target, enabled: patch.enabled ?? current.enabled };
	}

	override async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, guard?: AutomationMutationGuard) {
		const current = this.getAutomation(id);
		if (!current || serializeAutomationEditableState(current) !== serializeAutomationEditableState(expected)) {
			return { kind: 'conflict', current } as const;
		}
		guard?.();
		return { kind: 'updated', automation: await this.updateAutomation(id, patch) } as const;
	}

	override async deleteAutomation(_id: string, guard?: AutomationMutationGuard) {
		guard?.();
		this.calls.push('delete');
	}

	override async runAutomation(id: string) {
		this.calls.push('run');
		return { kind: 'alreadyRunning', run: this.getActiveRunFor(id)! } as const;
	}
}

suite('ProviderAutomationService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(providers: ISessionsProvider[] = [], settled = true) {
		const changed = disposables.add(new Emitter<ISessionsProvidersChangeEvent>());
		const initialProvidersSettled = observableValue('settled', settled);
		const providerService = upcastPartial<ISessionsProvidersService>({
			onDidChangeProviders: changed.event,
			getProviders: () => providers,
			getProvider: <T extends ISessionsProvider>(id: string) => providers.find(provider => provider.id === id) as T | undefined,
		});
		return {
			service: disposables.add(new ProviderAutomationService(initialProvidersSettled, providerService)),
			initialProvidersSettled,
			addProvider: (provider: ISessionsProvider) => {
				providers.push(provider);
				changed.fire({ added: [provider], removed: [] });
			},
		};
	}

	function provider(store: TestAuthority): ISessionsProvider {
		return upcastPartial<ISessionsProvider>({ id: store.providerId, label: store.providerId, automations: store });
	}

	test('settles a provider-less window as unavailable, not empty-ready or perpetually loading', () => {
		const { service, initialProvidersSettled } = setup([], false);
		const states: AutomationCatalogueState[] = [];
		disposables.add(autorun(reader => states.push(service.catalogueState.read(reader))));
		initialProvidersSettled.set(true, undefined);
		assert.deepStrictEqual(states, ['loading', 'unavailable']);
	});

	test('aggregates availability while retaining independent multi-host operations', async () => {
		const local = new TestAuthority('local');
		const remote = new TestAuthority('remote');
		remote.catalogueState.set('unavailable', undefined);
		const { service } = setup([provider(local), provider(remote)]);
		await service.createAutomation(automation('local'));
		assert.deepStrictEqual({
			state: service.catalogueState.get(),
			available: service.availableProviders.get(),
			unavailable: service.unavailableProviders.get(),
			local: service.canRunAutomation('local-automation'),
			remote: service.canRunAutomation('remote-automation'),
			calls: [local.calls, remote.calls],
		}, {
			state: 'unavailable',
			available: [{ id: 'local', label: 'local' }],
			unavailable: [{ id: 'remote', label: 'remote' }],
			local: true,
			remote: false,
			calls: [['create'], []],
		});
	});

	test('provider registration and capability changes update creation availability', () => {
		const { service, addProvider } = setup();
		const store = new TestAuthority('local');
		const available: string[][] = [];
		disposables.add(autorun(reader => available.push(service.availableProviders.read(reader).map(provider => provider.id))));
		addProvider(provider(store));
		store.catalogueState.set('unavailable', undefined);
		assert.deepStrictEqual(available, [[], ['local'], []]);
	});

	test('preserves incompatible host upgrade guidance in the unavailable catalogue', () => {
		const host = new TestAuthority('remote');
		host.catalogueState.set('unavailable', undefined);
		host.unavailableReason.set('Update the remote Agent Host.', undefined);
		const { service } = setup([provider(host)]);
		assert.deepStrictEqual(service.unavailableProviders.get(), [{
			id: 'remote', label: 'remote', unavailableReason: 'Update the remote Agent Host.',
		}]);
	});

	test('catalogue errors and loading are not hidden by ready providers', () => {
		const first = new TestAuthority('first');
		const second = new TestAuthority('second');
		const { service } = setup([provider(first), provider(second)]);
		const states: AutomationCatalogueState[] = [];
		disposables.add(autorun(reader => states.push(service.catalogueState.read(reader))));
		first.catalogueState.set('loading', undefined);
		second.catalogueState.set('error', undefined);
		first.catalogueState.set('unavailable', undefined);
		second.catalogueState.set('ready', undefined);
		assert.deepStrictEqual(states, ['ready', 'loading', 'error', 'unavailable']);
	});

	test('missing, unsupported and disconnected providers cannot recreate browser automations', () => {
		const disconnected = new TestAuthority('disconnected');
		disconnected.catalogueState.set('unavailable', undefined);
		const { service } = setup([provider(disconnected), upcastPartial<ISessionsProvider>({ id: 'non-ahp', label: 'Non-AHP' })]);
		for (const id of [undefined, 'missing', 'non-ahp', 'disconnected']) {
			const options = automation(id ?? 'missing');
			assert.throws(() => service.createAutomation({ ...options, target: { kind: 'workspace', folderUri: URI.file('/workspace'), providerId: id, isolation: { kind: 'default' } } }), AutomationUnavailableError);
		}
		assert.deepStrictEqual(disconnected.calls, []);
	});

	test('routes manual dispatch, edits and deletion only to the owning host', async () => {
		const local = new TestAuthority('local');
		const remote = new TestAuthority('remote');
		const { service } = setup([provider(local), provider(remote)]);
		const run: IAutomationRun = { id: 'remote-run', automationId: 'remote-automation', status: 'running', trigger: 'manual', startedAt: '2026-01-02T00:00:00Z' };
		remote.runs.set([run], undefined);
		await service.updateAutomation('remote-automation', { name: 'Changed' });
		const result = await service.runAutomation('remote-automation');
		await service.deleteAutomation('remote-automation');
		assert.deepStrictEqual({ result, history: service.runsFor('remote-automation').get(), calls: [local.calls, remote.calls] }, {
			result: { kind: 'alreadyRunning', run }, history: [run], calls: [[], ['update', 'run', 'delete']],
		});
	});

	test('rejects cross-host retargeting before ordinary or guarded mutation', async () => {
		const local = new TestAuthority('local');
		const remote = new TestAuthority('remote');
		const { service } = setup([provider(local), provider(remote)]);
		const original = automation('local');
		const patch = { name: 'Changed', target: automation('remote').target };
		assert.throws(() => service.updateAutomation(original.id, patch), /Duplicate/);
		await assert.rejects(service.updateAutomationIfUnchanged(original.id, patch, original), /Duplicate/);
		assert.deepStrictEqual({ original: service.getAutomation(original.id), calls: [local.calls, remote.calls] }, { original, calls: [[], []] });
	});

	test('stale guarded updates conflict before cross-host eligibility is checked', async () => {
		const local = new TestAuthority('local');
		const { service } = setup([provider(local)]);
		const current = automation('local');
		const result = await service.updateAutomationIfUnchanged(current.id, { target: automation('remote').target }, { ...current, name: 'Stale' });
		assert.deepStrictEqual({ result, calls: local.calls }, { result: { kind: 'conflict', current }, calls: [] });
	});

	test('preserves same-host workspace and agent edits', async () => {
		const local = new TestAuthority('local');
		const { service } = setup([provider(local)]);
		const current = automation('local');
		const target = { kind: 'quickChat', providerId: 'local', sessionTypeId: 'claude' } as const;
		const result = await service.updateAutomationIfUnchanged(current.id, { target }, current);
		assert.deepStrictEqual({ result, calls: local.calls }, { result: { kind: 'updated', automation: { ...current, target } }, calls: ['update'] });
	});

	test('window startup and elapsed schedules never dispatch runs', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const local = new TestAuthority('local');
		const { service } = setup([provider(local)]);
		await timeout(24 * 60 * 60 * 1000);
		assert.deepStrictEqual({ calls: local.calls, runs: service.runs.get(), definitions: service.automations.get() }, {
			calls: [], runs: [], definitions: [automation('local')],
		});
	}));
});
