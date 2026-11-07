/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier, type IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { EnvironmentVariableMutatorType, type ISerializableEnvironmentVariableCollections } from '../../../../../platform/terminal/common/environmentVariable.js';
import { ILocalPtyService, ITerminalChildProcess, ITerminalLogService, type ISerializedTerminalState } from '../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { IEnvironmentVariableService } from '../../common/environmentVariable.js';
import { EnvironmentVariableService } from '../../common/environmentVariableService.js';
import { ITerminalProfileResolverService } from '../../common/terminal.js';
import { TerminalStorageKeys } from '../../common/terminalStorageKeys.js';
import { TestContextService, TestHistoryService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { LocalPty } from '../../electron-browser/localPty.js';
import { LocalTerminalBackend } from '../../electron-browser/localTerminalBackend.js';

class RecordingLogService extends NullLogService {
	readonly warnings: { message: string; args: unknown[] }[] = [];

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push({ message, args });
	}
}

suite('LocalTerminalBackend', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('attachToRevivedProcess only falls back to the original process when it still has the saved pid', async () => {
		const livePids = new Map([[1, 101], [2, 202], [3, 303]]);
		const revivedIds = new Map([[7, 1], [2, 2], [8, 5]]);
		const attachRequests: [id: number, pid: number | undefined][] = [];

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(ITerminalLogService, new NullLogService());
		instantiationService.stub(ILocalPtyService, upcastPartial<ILocalPtyService>({
			onPtyHostExit: Event.None,
			onPtyHostStart: Event.None,
			onPtyHostUnresponsive: Event.None,
			onPtyHostResponsive: Event.None,
			onPtyHostRequestResolveVariables: Event.None,
			getRevivedPtyNewId: async (_workspaceId: string, id: number) => revivedIds.get(id),
			attachToProcess: async (id: number, pid?: number) => {
				attachRequests.push([id, pid]);
				const livePid = livePids.get(id);
				if (livePid === undefined) {
					throw new Error(`Could not find pty ${id} on pty host`);
				}
				if (pid !== undefined && pid !== livePid) {
					throw new Error(`Pty ${id} has pid ${livePid}, expected ${pid}`);
				}
			}
		}));
		const backend = store.add(instantiationService.createInstance(LocalTerminalBackend));
		// Treat the pty host as connected so requests go to the local pty service stub
		const connected = new DeferredPromise<void>();
		await connected.complete();
		Reflect.set(backend, '_directProxyClientEventually', connected);

		async function attach(attachToProcess: () => Promise<ITerminalChildProcess | undefined>) {
			attachRequests.length = 0;
			const pty = await attachToProcess();
			if (pty instanceof LocalPty) {
				store.add(pty);
			}
			return { attachedId: pty?.id, requests: [...attachRequests] };
		}

		deepStrictEqual({
			revivedWithNewId: await attach(() => backend.attachToRevivedProcess(7, 7007)),
			revivedWithSameId: await attach(() => backend.attachToRevivedProcess(2, 2002)),
			revivedButMissing: await attach(() => backend.attachToRevivedProcess(8, 8008)),
			originalWithSavedPid: await attach(() => backend.attachToRevivedProcess(3, 303)),
			originalWithOtherPid: await attach(() => backend.attachToRevivedProcess(3, 9009)),
			originalWithUnknownPid: await attach(() => backend.attachToRevivedProcess(3, 0)),
			originalWithNegativePid: await attach(() => backend.attachToRevivedProcess(3, -1)),
			originalMissing: await attach(() => backend.attachToRevivedProcess(4, 404)),
			attachById: await attach(() => backend.attachToProcess(3)),
		}, {
			revivedWithNewId: { attachedId: 1, requests: [[1, undefined]] },
			revivedWithSameId: { attachedId: 2, requests: [[2, undefined]] },
			revivedButMissing: { attachedId: undefined, requests: [[5, undefined]] },
			originalWithSavedPid: { attachedId: 3, requests: [[3, 303]] },
			originalWithOtherPid: { attachedId: undefined, requests: [[3, 9009]] },
			originalWithUnknownPid: { attachedId: 3, requests: [[3, undefined]] },
			originalWithNegativePid: { attachedId: 3, requests: [[3, undefined]] },
			originalMissing: { attachedId: undefined, requests: [[4, 404]] },
			attachById: { attachedId: 3, requests: [[3, undefined]] },
		});
	});

	test('revival refreshes both the environment and collection options before sending persisted state to the pty host', async () => {
		let revivedState: ISerializedTerminalState[] | undefined;
		const instantiationService = store.add(new TestInstantiationService());
		const storageService = store.add(new TestStorageService());
		const logService = new RecordingLogService();
		const registeredExtensions: readonly IExtensionDescription[] = [
			upcastPartial<IExtensionDescription>({
				identifier: new ExtensionIdentifier('foreign.extension')
			})
		];
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(ITerminalLogService, logService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IExtensionService, upcastPartial<IExtensionService>({
			whenInstalledExtensionsRegistered: async () => true,
			onDidChangeExtensions: Event.None,
			extensions: registeredExtensions
		}));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IConfigurationResolverService, upcastPartial<IConfigurationResolverService>({
			resolveWithEnvironment: async (_environment, _folder, value) => value
		}));
		instantiationService.stub(IHistoryService, new TestHistoryService());
		instantiationService.stub(IProductService, upcastPartial<IProductService>({ version: 'test' }));
		instantiationService.stub(ITerminalProfileResolverService, upcastPartial<ITerminalProfileResolverService>({
			getEnvironment: async () => ({ PATH: '/base/bin' })
		}));
		const environmentVariableService = store.add(instantiationService.createInstance(EnvironmentVariableService));
		const foreignCollection = {
			remoteAuthority: 'ssh-remote+foreign-host',
			map: new Map([
				['foreign-path', { variable: 'PATH', value: '/foreign/bin:', type: EnvironmentVariableMutatorType.Prepend }],
				['shared-value', { variable: 'SHARED_VALUE', value: 'available', type: EnvironmentVariableMutatorType.Replace }]
			])
		};
		environmentVariableService.set('foreign.extension', { ...foreignCollection, persistent: false });
		instantiationService.stub(IEnvironmentVariableService, environmentVariableService);
		instantiationService.stub(ILocalPtyService, upcastPartial<ILocalPtyService>({
			onPtyHostExit: Event.None,
			onPtyHostStart: Event.None,
			onPtyHostUnresponsive: Event.None,
			onPtyHostResponsive: Event.None,
			onPtyHostRequestResolveVariables: Event.None,
			getEnvironment: async () => ({ PATH: '/base/bin' }),
			reviveTerminalProcesses: async (_workspaceId, state) => {
				revivedState = state;
			},
			getTerminalLayoutInfo: async () => undefined
		}));

		const staleOptions: ISerializableEnvironmentVariableCollections = [[
			'foreign.extension',
			[['foreign-path', { variable: 'PATH', value: '/foreign/bin:', type: EnvironmentVariableMutatorType.Prepend }]],
			[]
		]];
		storageService.store(TerminalStorageKeys.TerminalBufferState, JSON.stringify({
			version: 1,
			state: [{
				id: 1,
				shellLaunchConfig: {},
				processLaunchConfig: {
					env: { PATH: '/stale/bin:/foreign/bin' },
					executableEnv: {},
					options: {
						shellIntegration: { enabled: false, suggestEnabled: false, nonce: '' },
						windowsUseConptyDll: false,
						environmentVariableCollections: staleOptions,
						isScreenReaderOptimized: false
					}
				}
			}]
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const backend = store.add(instantiationService.createInstance(LocalTerminalBackend));
		await backend.getTerminalLayoutInfo();
		deepStrictEqual({
			revivedStateLength: revivedState?.length,
			warnings: logService.warnings
		}, {
			revivedStateLength: 1,
			warnings: []
		});
		if (!revivedState) {
			throw new Error('Expected persisted terminal state to be revived');
		}

		deepStrictEqual({
			env: {
				PATH: revivedState[0].processLaunchConfig.env.PATH,
				SHARED_VALUE: revivedState[0].processLaunchConfig.env.SHARED_VALUE
			},
			collections: revivedState[0].processLaunchConfig.options.environmentVariableCollections
		}, {
			env: { PATH: '/base/bin', SHARED_VALUE: 'available' },
			collections: [[
				'foreign.extension',
				[['shared-value', { variable: 'SHARED_VALUE', value: 'available', type: EnvironmentVariableMutatorType.Replace }]],
				[]
			]]
		});
	});
});
