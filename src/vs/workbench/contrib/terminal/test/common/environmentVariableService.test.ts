/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, notStrictEqual, strictEqual } from 'assert';
import { TestExtensionService, TestHistoryService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { EnvironmentVariableService } from '../../common/environmentVariableService.js';
import { EnvironmentVariableMutatorType, IEnvironmentVariableMutator } from '../../../../../platform/terminal/common/environmentVariable.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IProcessEnvironment, OperatingSystem } from '../../../../../base/common/platform.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IEnvironmentVariableCollectionWithPersistence } from '../../common/environmentVariable.js';

class TestEnvironmentVariableService extends EnvironmentVariableService {
	persistCollections(): void { this._persistCollections(); }
	notifyCollectionUpdates(): void { this._notifyCollectionUpdates(); }
}

suite('EnvironmentVariable - EnvironmentVariableService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let environmentVariableService: TestEnvironmentVariableService;
	let changeExtensionsEvent: Emitter<void>;
	let warnings: string[];

	setup(() => {
		changeExtensionsEvent = store.add(new Emitter<void>());
		warnings = [];

		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IExtensionService, TestExtensionService);
		instantiationService.stub(IStorageService, store.add(new TestStorageService()));
		instantiationService.stub(ILogService, { warn(message: string) { warnings.push(message); } });
		instantiationService.stub(IHistoryService, new TestHistoryService());
		instantiationService.stub(IExtensionService, TestExtensionService);
		instantiationService.stub(IExtensionService, 'onDidChangeExtensions', changeExtensionsEvent.event);
		instantiationService.stub(IExtensionService, 'extensions', [
			{ identifier: { value: 'ext1' } },
			{ identifier: { value: 'ext2' } },
			{ identifier: { value: 'ext3' } }
		]);

		environmentVariableService = store.add(instantiationService.createInstance(TestEnvironmentVariableService));
	});

	test('should persist collections to the storage service and be able to restore from them', () => {
		const collection = new Map<string, IEnvironmentVariableMutator>();
		collection.set('A-key', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' });
		collection.set('B-key', { value: 'b', type: EnvironmentVariableMutatorType.Append, variable: 'B' });
		collection.set('C-key', { value: 'c', type: EnvironmentVariableMutatorType.Prepend, variable: 'C', options: { applyAtProcessCreation: true, applyAtShellIntegration: true } });
		environmentVariableService.set('ext1', { map: collection, persistent: true });
		deepStrictEqual([...environmentVariableService.mergedCollection.getVariableMap(undefined).entries()], [
			['A', [{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Replace, value: 'a', variable: 'A', options: undefined }]],
			['B', [{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Append, value: 'b', variable: 'B', options: undefined }]],
			['C', [{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Prepend, value: 'c', variable: 'C', options: { applyAtProcessCreation: true, applyAtShellIntegration: true } }]]
		]);

		// Persist with old service, create a new service with the same storage service to verify restore
		environmentVariableService.persistCollections();
		const service2: TestEnvironmentVariableService = store.add(instantiationService.createInstance(TestEnvironmentVariableService));
		deepStrictEqual([...service2.mergedCollection.getVariableMap(undefined).entries()], [
			['A', [{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Replace, value: 'a', variable: 'A', options: undefined }]],
			['B', [{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Append, value: 'b', variable: 'B', options: undefined }]],
			['C', [{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Prepend, value: 'c', variable: 'C', options: { applyAtProcessCreation: true, applyAtShellIntegration: true } }]]
		]);
	});

	test('preserves a known local origin distinctly from a legacy unknown origin', () => {
		environmentVariableService.set('local', {
			persistent: true,
			remoteAuthority: null,
			map: new Map([['PATH', { value: ':/local', type: EnvironmentVariableMutatorType.Append, variable: 'PATH' }]])
		});
		environmentVariableService.set('legacy', {
			persistent: true,
			map: new Map([['PATH', { value: ':/legacy', type: EnvironmentVariableMutatorType.Append, variable: 'PATH' }]])
		});
		environmentVariableService.persistCollections();

		const restored = store.add(instantiationService.createInstance(TestEnvironmentVariableService));
		deepStrictEqual(restored.collections.get('local')!.remoteAuthority, null);
		deepStrictEqual(restored.collections.get('legacy')!.remoteAuthority, undefined);
	});

	suite('mergedCollection', () => {
		test('should overwrite any other variable with the first extension that replaces', () => {
			const collection1 = new Map<string, IEnvironmentVariableMutator>();
			const collection2 = new Map<string, IEnvironmentVariableMutator>();
			const collection3 = new Map<string, IEnvironmentVariableMutator>();
			collection1.set('A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Append, variable: 'A' });
			collection1.set('B-key', { value: 'b1', type: EnvironmentVariableMutatorType.Replace, variable: 'B' });
			collection2.set('A-key', { value: 'a2', type: EnvironmentVariableMutatorType.Replace, variable: 'A' });
			collection2.set('B-key', { value: 'b2', type: EnvironmentVariableMutatorType.Append, variable: 'B' });
			collection3.set('A-key', { value: 'a3', type: EnvironmentVariableMutatorType.Prepend, variable: 'A' });
			collection3.set('B-key', { value: 'b3', type: EnvironmentVariableMutatorType.Replace, variable: 'B' });
			environmentVariableService.set('ext1', { map: collection1, persistent: true });
			environmentVariableService.set('ext2', { map: collection2, persistent: true });
			environmentVariableService.set('ext3', { map: collection3, persistent: true });
			deepStrictEqual([...environmentVariableService.mergedCollection.getVariableMap(undefined).entries()], [
				['A', [
					{ extensionIdentifier: 'ext2', type: EnvironmentVariableMutatorType.Replace, value: 'a2', variable: 'A', options: undefined },
					{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Append, value: 'a1', variable: 'A', options: undefined }
				]],
				['B', [{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Replace, value: 'b1', variable: 'B', options: undefined }]]
			]);
		});

		test('should correctly apply the environment values from multiple extension contributions in the correct order', async () => {
			const collection1 = new Map<string, IEnvironmentVariableMutator>();
			const collection2 = new Map<string, IEnvironmentVariableMutator>();
			const collection3 = new Map<string, IEnvironmentVariableMutator>();
			collection1.set('A-key', { value: ':a1', type: EnvironmentVariableMutatorType.Append, variable: 'A' });
			collection2.set('A-key', { value: 'a2:', type: EnvironmentVariableMutatorType.Prepend, variable: 'A' });
			collection3.set('A-key', { value: 'a3', type: EnvironmentVariableMutatorType.Replace, variable: 'A' });
			environmentVariableService.set('ext1', { map: collection1, persistent: true });
			environmentVariableService.set('ext2', { map: collection2, persistent: true });
			environmentVariableService.set('ext3', { map: collection3, persistent: true });

			// The entries should be ordered in the order they are applied
			deepStrictEqual([...environmentVariableService.mergedCollection.getVariableMap(undefined).entries()], [
				['A', [
					{ extensionIdentifier: 'ext3', type: EnvironmentVariableMutatorType.Replace, value: 'a3', variable: 'A', options: undefined },
					{ extensionIdentifier: 'ext2', type: EnvironmentVariableMutatorType.Prepend, value: 'a2:', variable: 'A', options: undefined },
					{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Append, value: ':a1', variable: 'A', options: undefined }
				]]
			]);

			// Verify the entries get applied to the environment as expected
			const env: IProcessEnvironment = { A: 'foo' };
			await environmentVariableService.mergedCollection.applyToProcessEnvironment(env, undefined);
			deepStrictEqual(env, { A: 'a2:a3:a1' });
		});

		test('should correctly apply the workspace specific environment values from multiple extension contributions in the correct order', async () => {
			const scope1 = { workspaceFolder: { uri: URI.file('workspace1'), name: 'workspace1', index: 0 } };
			const scope2 = { workspaceFolder: { uri: URI.file('workspace2'), name: 'workspace2', index: 3 } };
			const collection1 = new Map<string, IEnvironmentVariableMutator>();
			const collection2 = new Map<string, IEnvironmentVariableMutator>();
			const collection3 = new Map<string, IEnvironmentVariableMutator>();
			collection1.set('A-key', { value: ':a1', type: EnvironmentVariableMutatorType.Append, scope: scope1, variable: 'A' });
			collection2.set('A-key', { value: 'a2:', type: EnvironmentVariableMutatorType.Prepend, variable: 'A' });
			collection3.set('A-key', { value: 'a3', type: EnvironmentVariableMutatorType.Replace, scope: scope2, variable: 'A' });
			environmentVariableService.set('ext1', { map: collection1, persistent: true });
			environmentVariableService.set('ext2', { map: collection2, persistent: true });
			environmentVariableService.set('ext3', { map: collection3, persistent: true });

			// The entries should be ordered in the order they are applied
			deepStrictEqual([...environmentVariableService.mergedCollection.getVariableMap(scope1).entries()], [
				['A', [
					{ extensionIdentifier: 'ext2', type: EnvironmentVariableMutatorType.Prepend, value: 'a2:', variable: 'A', options: undefined },
					{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Append, value: ':a1', scope: scope1, variable: 'A', options: undefined }
				]]
			]);

			// Verify the entries get applied to the environment as expected
			const env: IProcessEnvironment = { A: 'foo' };
			await environmentVariableService.mergedCollection.applyToProcessEnvironment(env, scope1);
			deepStrictEqual(env, { A: 'a2:foo:a1' });
		});

		suite('getMergedCollection', () => {
			test('shares a cached view across authority casing, including restored origins', () => {
				environmentVariableService.set('ext1', {
					persistent: true,
					remoteAuthority: 'wsl+Ubuntu',
					map: new Map([['PATH', { variable: 'PATH', value: '/tools:', type: EnvironmentVariableMutatorType.Prepend }]])
				});
				environmentVariableService.persistCollections();
				const restored = store.add(instantiationService.createInstance(TestEnvironmentVariableService));
				const lower = restored.getMergedCollection('wsl+ubuntu', OperatingSystem.Linux);
				const mixed = restored.getMergedCollection('wsl+Ubuntu', OperatingSystem.Linux);
				deepStrictEqual([...lower.getVariableMap(undefined).keys()], ['PATH']);
				strictEqual(lower, mixed);
				deepStrictEqual([...restored.getMergedCollection('wsl+other', OperatingSystem.Linux).getVariableMap(undefined).keys()], []);
			});

			test('preserves foreign POSIX Path and path variables independently of PATH', () => {
				environmentVariableService.set('ext1', {
					persistent: true,
					remoteAuthority: null,
					map: new Map(['PATH', 'Path', 'path'].map(variable => [variable, {
						variable, value: 'value', type: EnvironmentVariableMutatorType.Replace
					}]))
				});
				const collection = environmentVariableService.getMergedCollection('ssh-remote+linux', OperatingSystem.Linux);
				deepStrictEqual([...collection.getVariableMap(undefined).keys()], ['Path', 'path']);
				const mac = environmentVariableService.getMergedCollection('ssh-remote+linux', OperatingSystem.Macintosh);
				deepStrictEqual([...mac.getVariableMap(undefined).keys()], ['Path', 'path']);
				const windows = environmentVariableService.getMergedCollection('ssh-remote+linux', OperatingSystem.Windows);
				deepStrictEqual([...windows.getVariableMap(undefined).keys()], []);
				notStrictEqual(windows, collection);
				strictEqual(environmentVariableService.getMergedCollection('SSH-REMOTE+LINUX', OperatingSystem.Linux), collection);
			});

			test('filters PATH by producer authority before merging and preserves non-PATH mutations', () => {
				environmentVariableService.set('foreignReplace', {
					persistent: true,
					remoteAuthority: 'ssh-remote+windows',
					map: new Map([
						['opaque-path-key', { variable: 'Path', value: 'C:\\copilot;', type: EnvironmentVariableMutatorType.Replace }],
						['editor-key', { variable: 'EDITOR', value: 'code', type: EnvironmentVariableMutatorType.Replace }]
					]),
					descriptionMap: new Map([['description', { description: 'Copilot command' }]])
				});
				environmentVariableService.set('localAppend', {
					persistent: true,
					remoteAuthority: null,
					map: new Map([['scoped-path-key', {
						variable: 'PATH',
						value: ':/copilot',
						type: EnvironmentVariableMutatorType.Append,
						scope: { workspaceFolder: { uri: URI.file('workspace'), name: 'workspace', index: 0 } },
						options: { applyAtProcessCreation: true, applyAtShellIntegration: true }
					}]]),
					descriptionMap: new Map()
				});

				const local = environmentVariableService.getMergedCollection(undefined, OperatingSystem.Windows);
				deepStrictEqual([...local.getVariableMap(undefined).entries()], [
					['EDITOR', [{ extensionIdentifier: 'foreignReplace', type: EnvironmentVariableMutatorType.Replace, value: 'code', variable: 'EDITOR', options: undefined }]]
				]);
				deepStrictEqual([...local.getVariableMap({ workspaceFolder: { uri: URI.file('workspace'), name: 'workspace', index: 0 } }).entries()], [
					['EDITOR', [{ extensionIdentifier: 'foreignReplace', type: EnvironmentVariableMutatorType.Replace, value: 'code', variable: 'EDITOR', options: undefined }]],
					['PATH', [{ extensionIdentifier: 'localAppend', type: EnvironmentVariableMutatorType.Append, value: ':/copilot', variable: 'PATH', scope: { workspaceFolder: { uri: URI.file('workspace'), name: 'workspace', index: 0 } }, options: { applyAtProcessCreation: true, applyAtShellIntegration: true } }]]
				]);
				deepStrictEqual([...local.getDescriptionMap(undefined).entries()], []);
				deepStrictEqual([...environmentVariableService.getMergedCollection('ssh-remote+windows', OperatingSystem.Windows).getVariableMap(undefined).entries()], [
					['Path', [{ extensionIdentifier: 'foreignReplace', type: EnvironmentVariableMutatorType.Replace, value: 'C:\\copilot;', variable: 'Path', options: undefined }]],
					['EDITOR', [{ extensionIdentifier: 'foreignReplace', type: EnvironmentVariableMutatorType.Replace, value: 'code', variable: 'EDITOR', options: undefined }]]
				]);
			});

			test('withholds unknown origins and caches target views until collections change', () => {
				environmentVariableService.set('legacy', {
					persistent: true,
					map: new Map([['PATH', { variable: 'PATH', value: 'C:\\copilot;', type: EnvironmentVariableMutatorType.Prepend }]])
				});
				const local = environmentVariableService.getMergedCollection(null, OperatingSystem.Linux);
				deepStrictEqual([...local.getVariableMap(undefined).entries()], []);
				strictEqual(environmentVariableService.getMergedCollection(undefined, OperatingSystem.Linux), local);

				environmentVariableService.set('local', {
					persistent: true,
					remoteAuthority: null,
					map: new Map([['PATH', { variable: 'PATH', value: ':/copilot', type: EnvironmentVariableMutatorType.Append }]])
				});
				const updated = environmentVariableService.getMergedCollection(null, OperatingSystem.Linux);
				notStrictEqual(updated, local);
				deepStrictEqual([...updated.getVariableMap(undefined).keys()], ['PATH']);
			});

			test('filters a foreign PATH Replace before it can suppress a local PATH Append', async () => {
				environmentVariableService.set('foreignReplace', {
					persistent: true,
					remoteAuthority: 'ssh-remote+windows',
					map: new Map([['PATH', { variable: 'PATH', value: 'C:\\copilot;', type: EnvironmentVariableMutatorType.Replace }]])
				});
				environmentVariableService.set('localAppend', {
					persistent: true,
					remoteAuthority: null,
					map: new Map([['PATH', { variable: 'PATH', value: ':/copilot', type: EnvironmentVariableMutatorType.Append }]])
				});

				const local = environmentVariableService.getMergedCollection(null, OperatingSystem.Linux);
				deepStrictEqual([...local.getVariableMap(undefined).entries()], [
					['PATH', [{ extensionIdentifier: 'localAppend', type: EnvironmentVariableMutatorType.Append, value: ':/copilot', variable: 'PATH', options: undefined }]]
				]);
				const env: IProcessEnvironment = { PATH: '/base' };
				await local.applyToProcessEnvironment(env, undefined);
				deepStrictEqual(env, { PATH: '/base:/copilot' });
			});

			test('withholds malformed origins and logs without exposing environment values', () => {
				environmentVariableService.set('invalid', {
					persistent: true,
					remoteAuthority: '',
					map: new Map([['PATH', { variable: 'PATH', value: '/secret/path', type: EnvironmentVariableMutatorType.Append }]])
				} satisfies IEnvironmentVariableCollectionWithPersistence);

				deepStrictEqual([...environmentVariableService.getMergedCollection(null, OperatingSystem.Linux).getVariableMap(undefined).entries()], []);
				deepStrictEqual(warnings, ['Ignoring terminal PATH contributions with an invalid origin for extension \'invalid\'.']);
			});
		});
	});
});
