/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchLocalMcpServer, LocalMcpServerScope } from '../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { InstalledMcpServersDiscovery } from '../../common/discovery/installedMcpServersDiscovery.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { IMcpConfigPath, IMcpWorkbenchService, IWorkbenchMcpServer, McpLocalDiscoveryState, McpServerEnablementState } from '../../common/mcpTypes.js';

suite('InstalledMcpServersDiscovery telemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFailedReconciliationFixture(initiallyInstalled: boolean) {
		const local: IWorkbenchLocalMcpServer = {
			id: 'mcp.config.usrlocal.server',
			name: 'server',
			config: { type: McpServerType.LOCAL, command: 'server' },
			mcpResource: URI.file('/profile/mcp.json'),
			scope: LocalMcpServerScope.User,
			source: 'local',
		};
		const server = upcastPartial<IWorkbenchMcpServer>({ id: local.id, name: local.name, local });
		const localServers = initiallyInstalled ? [local] : [];
		const workbenchServers = initiallyInstalled ? [server] : [];
		const changeEmitter = store.add(new Emitter<IWorkbenchMcpServer | undefined>());
		const registered = new DeferredPromise<void>();
		const unregistered = new DeferredPromise<void>();
		let registrationCount = 0;
		let unregistrationCount = 0;
		const configPath: IMcpConfigPath = {
			id: 'usrlocal',
			key: 'userLocalValue',
			label: 'User',
			scope: StorageScope.PROFILE,
			target: ConfigurationTarget.USER_LOCAL,
			order: 0,
			uri: undefined,
		};
		const getMcpConfigPath = ((arg: URI | IWorkbenchLocalMcpServer) => arg instanceof URI ? Promise.resolve(configPath) : configPath) as IMcpWorkbenchService['getMcpConfigPath'];
		const workbenchService = upcastPartial<IMcpWorkbenchService>({
			onChange: changeEmitter.event,
			get local() { return workbenchServers; },
			localDiscoveryState: constObservable(McpLocalDiscoveryState.Failed),
			getEnabledLocalMcpServers: () => localServers,
			getMcpConfigPath,
		});
		const registry = upcastPartial<IMcpRegistry>({
			registerCollection: () => {
				registrationCount++;
				registered.complete();
				return toDisposable(() => {
					unregistrationCount++;
					unregistered.complete();
				});
			},
		});
		const discovery = store.add(new InstalledMcpServersDiscovery(workbenchService, registry, upcastPartial<ITextModelService>({}), new NullLogService()));
		return {
			discovery,
			install: () => {
				localServers.push(local);
				workbenchServers.push(server);
				changeEmitter.fire(server);
			},
			uninstall: () => {
				localServers.length = 0;
				workbenchServers.length = 0;
				changeEmitter.fire(server);
			},
			registered,
			unregistered,
			get registrationCount() { return registrationCount; },
			get unregistrationCount() { return unregistrationCount; },
		};
	}

	test('publishes the first snapshot after collection planning without transitional disablement', async () => {
		const local: IWorkbenchLocalMcpServer = {
			id: 'mcp.config.usrlocal.server',
			name: 'server',
			config: { type: McpServerType.LOCAL, command: 'server' },
			mcpResource: URI.file('/profile/mcp.json'),
			scope: LocalMcpServerScope.User,
			source: 'local',
		};
		const server = upcastPartial<IWorkbenchMcpServer>({
			id: local.id,
			name: local.name,
			local,
			runtimeStatus: { state: McpServerEnablementState.Disabled },
		});
		const configPath: IMcpConfigPath = {
			id: 'usrlocal',
			key: 'userLocalValue',
			label: 'User',
			scope: StorageScope.PROFILE,
			target: ConfigurationTarget.USER_LOCAL,
			order: 0,
			uri: undefined,
		};
		let registeredCollections = 0;
		const registry = upcastPartial<IMcpRegistry>({
			registerCollection: () => {
				registeredCollections++;
				return Disposable.None;
			},
		});
		const getMcpConfigPath = ((arg: URI | IWorkbenchLocalMcpServer) => arg instanceof URI ? Promise.resolve(configPath) : configPath) as IMcpWorkbenchService['getMcpConfigPath'];
		const workbenchService = upcastPartial<IMcpWorkbenchService>({
			onChange: Event.None,
			local: [server],
			localDiscoveryState: constObservable(McpLocalDiscoveryState.Complete),
			getEnabledLocalMcpServers: () => [local],
			getLocalMcpServerDiscoveryOutcome: () => {
				assert.strictEqual(registeredCollections, 1);
				return 'loaded';
			},
			getMcpConfigPath,
		});
		const discovery = store.add(new InstalledMcpServersDiscovery(
			workbenchService,
			registry,
			upcastPartial<ITextModelService>({}),
			new NullLogService(),
		));

		discovery.start();
		const snapshot = await waitForState(discovery.telemetrySnapshot, value => value !== undefined);

		assert.deepStrictEqual(snapshot?.candidates.map(candidate => ({
			source: candidate.source,
			outcome: candidate.outcome,
		})), [{ source: 'vscodeUserConfig', outcome: 'loaded' }]);
	});

	test('publishes an empty fallback snapshot when local discovery failed', async () => {
		const discovery = store.add(new InstalledMcpServersDiscovery(
			upcastPartial<IMcpWorkbenchService>({
				onChange: Event.None,
				local: [],
				localDiscoveryState: constObservable(McpLocalDiscoveryState.Failed),
				getEnabledLocalMcpServers: () => [],
			}),
			upcastPartial<IMcpRegistry>({}),
			upcastPartial<ITextModelService>({}),
			new NullLogService(),
		));

		discovery.start();
		const snapshot = await waitForState(discovery.telemetrySnapshot, value => value !== undefined);

		assert.deepStrictEqual(snapshot, { candidates: [], configurations: [] });
	});

	test('reconciles installs after failure while candidate telemetry remains suppressed', async () => {
		const fixture = createFailedReconciliationFixture(false);
		fixture.discovery.start();

		fixture.install();
		await fixture.registered.p;

		assert.deepStrictEqual({
			registrationCount: fixture.registrationCount,
			snapshot: fixture.discovery.telemetrySnapshot.get(),
		}, {
			registrationCount: 1,
			snapshot: { candidates: [], configurations: [] },
		});
	});

	test('reconciles uninstalls after failure while candidate telemetry remains suppressed', async () => {
		const fixture = createFailedReconciliationFixture(true);
		fixture.discovery.start();
		await fixture.registered.p;

		fixture.uninstall();
		await fixture.unregistered.p;

		assert.deepStrictEqual({
			unregistrationCount: fixture.unregistrationCount,
			snapshot: fixture.discovery.telemetrySnapshot.get(),
		}, {
			unregistrationCount: 1,
			snapshot: { candidates: [], configurations: [] },
		});
	});
});
