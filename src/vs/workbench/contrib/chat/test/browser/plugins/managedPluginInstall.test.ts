/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ManagedPluginInstall } from '../../../browser/managedPluginInstall.js';
import { IChatInputNotification, IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { getMarketplacePluginPolicyId } from '../../../common/plugins/agentPluginEnablement.js';
import { IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
import { IMarketplaceInstalledPlugin, IMarketplacePlugin, IPluginMarketplaceService, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';

suite('ManagedPluginInstall', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createPlugin(name: string, marketplace: string, source: string): IMarketplacePlugin {
		const marketplaceReference = parseMarketplaceReference(source);
		assert.ok(marketplaceReference);
		return {
			name,
			description: '',
			version: '1.0.0',
			source: `plugins/${name}`,
			sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: `plugins/${name}` },
			marketplace,
			marketplaceReference,
			marketplaceType: MarketplaceType.OpenPlugin,
		};
	}

	function managedReference(plugin: IMarketplacePlugin): IMarketplacePlugin['marketplaceReference'] {
		return { ...plugin.marketplaceReference, displayLabel: plugin.marketplace };
	}

	interface MockState {
		readonly installedPlugins: ReturnType<typeof observableValue<readonly IMarketplaceInstalledPlugin[]>>;
		readonly sentiment: ReturnType<typeof observableValue<{ hidden: boolean }>>;
		readonly installedPluginIds: Set<string>;
		readonly installCalls: string[];
		readonly fetchCalls: number[];
		readonly notifications: Map<string, IChatInputNotification>;
		readonly notificationHistory: IChatInputNotification[];
		readonly configurationChanges: Emitter<IConfigurationChangeEvent>;
		catalog: IMarketplacePlugin[];
		fetchImplementation?: () => Promise<IMarketplacePlugin[]>;
		installImplementation?: (plugin: IMarketplacePlugin) => Promise<void>;
		getPluginInstallUri: (plugin: IMarketplacePlugin) => URI;
		managedMarketplaces: Map<string, IMarketplacePlugin['marketplaceReference']>;
		enabledPluginsPolicy: Record<string, boolean> | undefined;
		pluginsEnabled: boolean;
		whenInstalledPluginsReady: Promise<void>;
	}

	function createContribution(overrides?: Partial<MockState>): { contribution: ManagedPluginInstall; state: MockState } {
		const instantiationService = store.add(new TestInstantiationService());
		const installedPlugins = observableValue<readonly IMarketplaceInstalledPlugin[]>('test.installedPlugins', []);
		const sentiment = observableValue('test.sentiment', { hidden: false });
		const state: MockState = {
			installedPlugins,
			sentiment,
			installedPluginIds: new Set(),
			installCalls: [],
			fetchCalls: [],
			notifications: new Map(),
			notificationHistory: [],
			configurationChanges: store.add(new Emitter<IConfigurationChangeEvent>()),
			catalog: [],
			fetchImplementation: undefined,
			installImplementation: undefined,
			getPluginInstallUri: plugin => joinPath(plugin.marketplaceReference.localRepositoryUri ?? URI.file('/marketplace'), plugin.source),
			managedMarketplaces: new Map(),
			enabledPluginsPolicy: undefined,
			pluginsEnabled: true,
			whenInstalledPluginsReady: Promise.resolve(),
			...overrides,
		};

		instantiationService.stub(IConfigurationService, {
			onDidChangeConfiguration: state.configurationChanges.event,
			getValue: (key: string) => key === ChatConfiguration.PluginsEnabled ? state.pluginsEnabled : undefined,
			inspect: (key: string) => ({
				policyValue: key === ChatConfiguration.EnabledPlugins ? state.enabledPluginsPolicy : undefined,
			}),
		} as Partial<IConfigurationService> as IConfigurationService);
		instantiationService.stub(IPluginMarketplaceService, {
			installedPlugins: state.installedPlugins,
			whenInstalledPluginsReady: () => state.whenInstalledPluginsReady,
			fetchMarketplacePlugins: async () => {
				state.fetchCalls.push(state.catalog.length);
				return state.fetchImplementation ? state.fetchImplementation() : state.catalog;
			},
			isPluginInstalled: plugin => state.installedPluginIds.has(getMarketplacePluginPolicyId(plugin)),
			getManagedMarketplace: reference => state.managedMarketplaces.get(reference.canonicalId),
		} as Partial<IPluginMarketplaceService> as IPluginMarketplaceService);
		instantiationService.stub(IPluginInstallService, {
			getPluginInstallUri: plugin => state.getPluginInstallUri(plugin),
			installPlugin: async plugin => {
				const pluginId = getMarketplacePluginPolicyId(plugin);
				state.installCalls.push(pluginId);
				await state.installImplementation?.(plugin);
				state.installedPluginIds.add(pluginId);
			},
		} as Partial<IPluginInstallService> as IPluginInstallService);
		instantiationService.stub(IChatEntitlementService, {
			get sentiment() {
				return state.sentiment.get();
			},
			sentimentObs: state.sentiment,
		} as Partial<IChatEntitlementService> as IChatEntitlementService);
		instantiationService.stub(IChatInputNotificationService, {
			setNotification: notification => {
				state.notifications.set(notification.id, notification);
				state.notificationHistory.push(notification);
			},
			deleteNotification: id => state.notifications.delete(id),
		} as Partial<IChatInputNotificationService> as IChatInputNotificationService);
		instantiationService.stub(ILogService, new NullLogService());

		return {
			contribution: store.add(instantiationService.createInstance(ManagedPluginInstall)),
			state,
		};
	}

	async function waitFor(predicate: () => boolean): Promise<void> {
		for (let attempt = 0; attempt < 20; attempt++) {
			if (predicate()) {
				return;
			}
			await timeout(0);
		}
		assert.fail('Timed out waiting for managed plugin reconciliation.');
	}

	function blockingNotification(state: MockState): IChatInputNotification | undefined {
		return [...state.notifications.values()].find(notification => notification.blocksSubmission);
	}

	function fireConfigurationChange(state: MockState, key: string): void {
		state.configurationChanges.fire({
			source: ConfigurationTarget.DEFAULT,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: configuration => configuration === key,
		});
	}

	test('installs only managed plugins explicitly required by policy', async () => {
		const required = createPlugin('required', 'managed-marketplace', 'file:///managed-marketplace');
		const blocked = createPlugin('blocked', 'managed-marketplace', 'file:///managed-marketplace');
		const unmanaged = createPlugin('unmanaged', 'managed-marketplace', 'file:///managed-marketplace');
		const userSource = createPlugin('required', 'managed-marketplace', 'file:///user-marketplace');
		const { state } = createContribution({
			catalog: [required, blocked, unmanaged, userSource],
			getPluginInstallUri: () => URI.file('/shared-plugin'),
			managedMarketplaces: new Map([[required.marketplaceReference.canonicalId, managedReference(required)]]),
			enabledPluginsPolicy: {
				[getMarketplacePluginPolicyId(required)]: true,
				[getMarketplacePluginPolicyId(blocked)]: false,
			},
		});

		await waitFor(() => state.fetchCalls.length === 1);

		assert.deepStrictEqual({
			installCalls: state.installCalls,
			blockingNotification: blockingNotification(state),
		}, {
			installCalls: ['required@managed-marketplace'],
			blockingNotification: undefined,
		});
	});

	test('waits for the installed-plugin manifest before reconciling', async () => {
		let markReady!: () => void;
		const ready = new Promise<void>(resolve => {
			markReady = resolve;
		});
		const required = createPlugin('required', 'managed-marketplace', 'file:///managed-marketplace');
		const { state } = createContribution({
			catalog: [required],
			managedMarketplaces: new Map([[required.marketplaceReference.canonicalId, managedReference(required)]]),
			enabledPluginsPolicy: { [getMarketplacePluginPolicyId(required)]: true },
			whenInstalledPluginsReady: ready,
		});

		await timeout(0);
		assert.deepStrictEqual({
			fetchCalls: state.fetchCalls,
			installCalls: state.installCalls,
			blockingNotification: blockingNotification(state)?.message,
		}, {
			fetchCalls: [],
			installCalls: [],
			blockingNotification: 'Installing required organization plugins',
		});

		markReady();
		await waitFor(() => state.installCalls.length === 1);
	});

	for (const alreadyInstalled of [false, true]) {
		test(`blocks required plugins sharing an install URI without ${alreadyInstalled ? 'replacing the installed identity' : 'starting a reinstall loop'}`, async () => {
			const first = createPlugin('first', 'managed-marketplace', 'file:///managed-marketplace');
			const second = createPlugin('second', 'managed-marketplace', 'file:///managed-marketplace');
			const firstId = getMarketplacePluginPolicyId(first);
			const secondId = getMarketplacePluginPolicyId(second);
			const sharedUri = URI.file('/shared-plugin');
			const initialEntries: readonly IMarketplaceInstalledPlugin[] = alreadyInstalled ? [{ pluginUri: sharedUri, plugin: first }] : [];
			const initialIds = alreadyInstalled ? [firstId] : [];
			const { state } = createContribution({
				catalog: [first, second],
				getPluginInstallUri: () => sharedUri,
				installedPlugins: observableValue('test.installedPlugins', initialEntries),
				installedPluginIds: new Set(initialIds),
				managedMarketplaces: new Map([[first.marketplaceReference.canonicalId, managedReference(first)]]),
				enabledPluginsPolicy: { [firstId]: true, [secondId]: true },
			});

			await waitFor(() => state.fetchCalls.length === 1);

			assert.deepStrictEqual({
				installCalls: state.installCalls,
				installedPluginIds: [...state.installedPluginIds],
				notification: blockingNotification(state)?.message,
				description: blockingNotification(state)?.description,
			}, {
				installCalls: [],
				installedPluginIds: initialIds,
				notification: 'Required organization plugins are unavailable',
				description: `Chat is unavailable because these required plugins could not be installed: ${alreadyInstalled ? secondId : `${firstId}, ${secondId}`}. Check your connection or contact your administrator.`,
			});
		});
	}

	test('blocks chat when a required plugin cannot be resolved', async () => {
		const { state } = createContribution({
			enabledPluginsPolicy: { 'missing@managed-marketplace': true },
		});

		await waitFor(() => state.fetchCalls.length === 1);

		const notification = blockingNotification(state);
		assert.deepStrictEqual({
			message: notification?.message,
			description: notification?.description,
			dismissible: notification?.dismissible,
			blocksSubmission: notification?.blocksSubmission,
		}, {
			message: 'Required organization plugins are unavailable',
			description: 'Chat is unavailable because these required plugins could not be installed: missing@managed-marketplace. Check your connection or contact your administrator.',
			dismissible: false,
			blocksSubmission: true,
		});
	});

	test('restores a required plugin after its installed entry is removed', async () => {
		const required = createPlugin('required', 'managed-marketplace', 'file:///managed-marketplace');
		const pluginId = getMarketplacePluginPolicyId(required);
		const installedPluginIds = new Set([pluginId]);
		const installedPlugins = observableValue<readonly IMarketplaceInstalledPlugin[]>('test.installedPlugins', [{ pluginUri: required.marketplaceReference.localRepositoryUri!, plugin: required }]);
		const { state } = createContribution({
			catalog: [required],
			installedPlugins,
			installedPluginIds,
			managedMarketplaces: new Map([[required.marketplaceReference.canonicalId, managedReference(required)]]),
			enabledPluginsPolicy: { [pluginId]: true },
		});

		await timeout(0);
		assert.deepStrictEqual({
			fetchCalls: state.fetchCalls,
			installCalls: state.installCalls,
			blockingNotification: blockingNotification(state),
		}, {
			fetchCalls: [],
			installCalls: [],
			blockingNotification: undefined,
		});

		state.installedPluginIds.delete(pluginId);
		state.installedPlugins.set([], undefined);
		await waitFor(() => state.installCalls.length === 1);
	});

	test('does not install while AI features are hidden', async () => {
		const required = createPlugin('required', 'managed-marketplace', 'file:///managed-marketplace');
		const sentiment = observableValue('test.sentiment', { hidden: true });
		const { state } = createContribution({
			catalog: [required],
			sentiment,
			managedMarketplaces: new Map([[required.marketplaceReference.canonicalId, managedReference(required)]]),
			enabledPluginsPolicy: { [getMarketplacePluginPolicyId(required)]: true },
		});

		await timeout(0);
		assert.deepStrictEqual({ fetchCalls: state.fetchCalls, installCalls: state.installCalls }, { fetchCalls: [], installCalls: [] });

		state.sentiment.set({ hidden: false }, undefined);
		await waitFor(() => state.installCalls.length === 1);
	});

	test('does not install after disposal while a marketplace fetch is in flight', async () => {
		let resolveFetch!: (plugins: IMarketplacePlugin[]) => void;
		const fetch = new Promise<IMarketplacePlugin[]>(resolve => {
			resolveFetch = resolve;
		});
		const required = createPlugin('required', 'managed-marketplace', 'file:///managed-marketplace');
		const { contribution, state } = createContribution({
			managedMarketplaces: new Map([[required.marketplaceReference.canonicalId, managedReference(required)]]),
			enabledPluginsPolicy: { [getMarketplacePluginPolicyId(required)]: true },
			fetchImplementation: () => fetch,
		});

		await waitFor(() => state.fetchCalls.length === 1);
		contribution.dispose();
		const blockingNotificationAfterDispose = blockingNotification(state);
		resolveFetch([required]);
		await fetch;
		await timeout(0);

		assert.deepStrictEqual({
			installCalls: state.installCalls,
			blockingNotificationAfterDispose,
			blockingNotificationAfterFetch: blockingNotification(state),
		}, {
			installCalls: [],
			blockingNotificationAfterDispose: undefined,
			blockingNotificationAfterFetch: undefined,
		});
	});

	test('abandons stale requirements while the installed-plugin manifest initializes', async () => {
		const ready = new DeferredPromise<void>();
		const required = createPlugin('required', 'managed-marketplace', 'file:///managed-marketplace');
		const { state } = createContribution({
			catalog: [required],
			managedMarketplaces: new Map([[required.marketplaceReference.canonicalId, managedReference(required)]]),
			enabledPluginsPolicy: { [getMarketplacePluginPolicyId(required)]: true },
			whenInstalledPluginsReady: ready.p,
		});

		await timeout(0);
		state.enabledPluginsPolicy = undefined;
		fireConfigurationChange(state, ChatConfiguration.EnabledPlugins);
		await ready.complete();
		await timeout(0);

		assert.deepStrictEqual({
			fetchCalls: state.fetchCalls,
			installCalls: state.installCalls,
			notification: blockingNotification(state),
		}, {
			fetchCalls: [],
			installCalls: [],
			notification: undefined,
		});
	});

	for (const change of ['requirement removed', 'plugins disabled', 'AI hidden']) {
		test(`abandons a stale marketplace fetch after ${change}`, async () => {
			const fetch = new DeferredPromise<IMarketplacePlugin[]>();
			const required = createPlugin('required', 'managed-marketplace', 'file:///managed-marketplace');
			const { state } = createContribution({
				managedMarketplaces: new Map([[required.marketplaceReference.canonicalId, managedReference(required)]]),
				enabledPluginsPolicy: { [getMarketplacePluginPolicyId(required)]: true },
				fetchImplementation: () => fetch.p,
			});

			await waitFor(() => state.fetchCalls.length === 1);
			if (change === 'requirement removed') {
				state.enabledPluginsPolicy = undefined;
				fireConfigurationChange(state, ChatConfiguration.EnabledPlugins);
			} else if (change === 'plugins disabled') {
				state.pluginsEnabled = false;
				fireConfigurationChange(state, ChatConfiguration.PluginsEnabled);
			} else {
				state.sentiment.set({ hidden: true }, undefined);
			}
			state.notificationHistory.length = 0;
			await fetch.complete([required]);
			await timeout(0);

			assert.deepStrictEqual({
				installCalls: state.installCalls,
				notificationsAfterChange: state.notificationHistory,
				notification: blockingNotification(state),
			}, {
				installCalls: [],
				notificationsAfterChange: [],
				notification: undefined,
			});
		});
	}

	test('does not republish a stale fetch failure after AI is hidden', async () => {
		const fetch = new DeferredPromise<IMarketplacePlugin[]>();
		const { state } = createContribution({
			enabledPluginsPolicy: { 'required@managed-marketplace': true },
			fetchImplementation: () => fetch.p,
		});

		await waitFor(() => state.fetchCalls.length === 1);
		state.sentiment.set({ hidden: true }, undefined);
		state.notificationHistory.length = 0;
		await fetch.error(new Error('Marketplace unavailable'));
		await timeout(0);

		assert.deepStrictEqual({
			notificationsAfterChange: state.notificationHistory,
			notification: blockingNotification(state),
		}, {
			notificationsAfterChange: [],
			notification: undefined,
		});
	});

	test('reconciles current requirements after a stale fetch fails', async () => {
		const fetch = new DeferredPromise<IMarketplacePlugin[]>();
		const previous = createPlugin('previous', 'managed-marketplace', 'file:///managed-marketplace');
		const current = createPlugin('current', 'managed-marketplace', 'file:///managed-marketplace');
		let fetchCount = 0;
		const { state } = createContribution({
			managedMarketplaces: new Map([[previous.marketplaceReference.canonicalId, managedReference(previous)]]),
			enabledPluginsPolicy: { [getMarketplacePluginPolicyId(previous)]: true },
			fetchImplementation: () => ++fetchCount === 1 ? fetch.p : Promise.resolve([current]),
		});

		await waitFor(() => state.fetchCalls.length === 1);
		state.enabledPluginsPolicy = { [getMarketplacePluginPolicyId(current)]: true };
		fireConfigurationChange(state, ChatConfiguration.EnabledPlugins);
		await fetch.error(new Error('Old marketplace request failed'));
		await timeout(0);

		assert.deepStrictEqual({
			fetchCount,
			installCalls: state.installCalls,
			notification: blockingNotification(state),
		}, {
			fetchCount: 2,
			installCalls: ['current@managed-marketplace'],
			notification: undefined,
		});
	});

	test('continues installing distinct required plugins when installation queues another pass', async () => {
		const first = createPlugin('first', 'managed-marketplace', 'file:///managed-marketplace');
		const second = createPlugin('second', 'managed-marketplace', 'file:///managed-marketplace');
		const { state } = createContribution({
			catalog: [first, second],
			managedMarketplaces: new Map([[first.marketplaceReference.canonicalId, managedReference(first)]]),
			enabledPluginsPolicy: {
				[getMarketplacePluginPolicyId(first)]: true,
				[getMarketplacePluginPolicyId(second)]: true,
			},
		});
		state.installImplementation = async plugin => {
			state.installedPlugins.set([
				...state.installedPlugins.get(),
				{ pluginUri: state.getPluginInstallUri(plugin), plugin },
			], undefined);
		};

		await waitFor(() => state.installedPluginIds.size === 2);

		assert.deepStrictEqual({
			installCalls: state.installCalls,
			fetchCalls: state.fetchCalls.length,
			notification: blockingNotification(state),
		}, {
			installCalls: ['first@managed-marketplace', 'second@managed-marketplace'],
			fetchCalls: 2,
			notification: undefined,
		});
	});

	for (const installFails of [false, true]) {
		test(`abandons a stale pass after an in-flight install ${installFails ? 'fails' : 'finishes'}`, async () => {
			const installing = new DeferredPromise<void>();
			const first = createPlugin('first', 'managed-marketplace', 'file:///managed-marketplace');
			const second = createPlugin('second', 'managed-marketplace', 'file:///managed-marketplace');
			const { state } = createContribution({
				catalog: [first, second],
				managedMarketplaces: new Map([[first.marketplaceReference.canonicalId, managedReference(first)]]),
				enabledPluginsPolicy: {
					[getMarketplacePluginPolicyId(first)]: true,
					[getMarketplacePluginPolicyId(second)]: true,
				},
				installImplementation: () => installing.p,
			});

			await waitFor(() => state.installCalls.length === 1);
			state.sentiment.set({ hidden: true }, undefined);
			state.notificationHistory.length = 0;
			if (installFails) {
				await installing.error(new Error('Install failed'));
			} else {
				await installing.complete();
			}
			await timeout(0);

			assert.deepStrictEqual({
				installCalls: state.installCalls,
				notificationsAfterChange: state.notificationHistory,
				notification: blockingNotification(state),
			}, {
				installCalls: ['first@managed-marketplace'],
				notificationsAfterChange: [],
				notification: undefined,
			});
		});
	}

	test('does not republish an in-flight install failure after disposal', async () => {
		const installing = new DeferredPromise<void>();
		const required = createPlugin('required', 'managed-marketplace', 'file:///managed-marketplace');
		const { contribution, state } = createContribution({
			catalog: [required],
			managedMarketplaces: new Map([[required.marketplaceReference.canonicalId, managedReference(required)]]),
			enabledPluginsPolicy: { [getMarketplacePluginPolicyId(required)]: true },
			installImplementation: () => installing.p,
		});

		await waitFor(() => state.installCalls.length === 1);
		contribution.dispose();
		state.notificationHistory.length = 0;
		await installing.error(new Error('Install failed'));
		await timeout(0);

		assert.deepStrictEqual({
			notificationsAfterDispose: state.notificationHistory,
			notification: blockingNotification(state),
		}, {
			notificationsAfterDispose: [],
			notification: undefined,
		});
	});

	test('uses the managed marketplace name for a duplicate user marketplace source', async () => {
		const fetched = createPlugin('required', 'owner/repository', 'https://github.com/owner/repository.git');
		const managedMarketplace = { ...fetched.marketplaceReference, displayLabel: 'managed-marketplace' };
		const { state } = createContribution({
			catalog: [fetched],
			managedMarketplaces: new Map([[fetched.marketplaceReference.canonicalId, managedMarketplace]]),
			enabledPluginsPolicy: { 'required@managed-marketplace': true },
		});

		await waitFor(() => state.installCalls.length === 1);

		assert.deepStrictEqual(state.installCalls, ['required@managed-marketplace']);
	});
});
