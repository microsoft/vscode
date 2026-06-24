/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { TestExtensionService, TestHistoryService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { EnvironmentVariableService } from '../../common/environmentVariableService.js';
import { EnvironmentVariableMutatorType, IEnvironmentVariableMutator } from '../../../../../platform/terminal/common/environmentVariable.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IProcessEnvironment } from '../../../../../base/common/platform.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

class TestEnvironmentVariableService extends EnvironmentVariableService {
	persistCollections(): void { this._persistCollections(); }
	notifyCollectionUpdates(): void { this._notifyCollectionUpdates(); }
}

suite('EnvironmentVariable - EnvironmentVariableService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let environmentVariableService: TestEnvironmentVariableService;
	let changeExtensionsEvent: Emitter<void>;

	setup(() => {
		changeExtensionsEvent = store.add(new Emitter<void>());

		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IExtensionService, TestExtensionService);
		instantiationService.stub(IStorageService, store.add(new TestStorageService()));
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
	});
});
