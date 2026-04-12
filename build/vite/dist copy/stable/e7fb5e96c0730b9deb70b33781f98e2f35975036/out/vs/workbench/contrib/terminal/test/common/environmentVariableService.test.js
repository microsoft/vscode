/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual } from 'assert';
import { TestExtensionService, TestHistoryService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { EnvironmentVariableService } from '../../common/environmentVariableService.js';
import { EnvironmentVariableMutatorType } from '../../../../../platform/terminal/common/environmentVariable.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
class TestEnvironmentVariableService extends EnvironmentVariableService {
    persistCollections() { this._persistCollections(); }
    notifyCollectionUpdates() { this._notifyCollectionUpdates(); }
}
suite('EnvironmentVariable - EnvironmentVariableService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let environmentVariableService;
    let changeExtensionsEvent;
    setup(() => {
        changeExtensionsEvent = store.add(new Emitter());
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
        const collection = new Map();
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
        const service2 = store.add(instantiationService.createInstance(TestEnvironmentVariableService));
        deepStrictEqual([...service2.mergedCollection.getVariableMap(undefined).entries()], [
            ['A', [{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Replace, value: 'a', variable: 'A', options: undefined }]],
            ['B', [{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Append, value: 'b', variable: 'B', options: undefined }]],
            ['C', [{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Prepend, value: 'c', variable: 'C', options: { applyAtProcessCreation: true, applyAtShellIntegration: true } }]]
        ]);
    });
    suite('mergedCollection', () => {
        test('should overwrite any other variable with the first extension that replaces', () => {
            const collection1 = new Map();
            const collection2 = new Map();
            const collection3 = new Map();
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
            const collection1 = new Map();
            const collection2 = new Map();
            const collection3 = new Map();
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
            const env = { A: 'foo' };
            await environmentVariableService.mergedCollection.applyToProcessEnvironment(env, undefined);
            deepStrictEqual(env, { A: 'a2:a3:a1' });
        });
        test('should correctly apply the workspace specific environment values from multiple extension contributions in the correct order', async () => {
            const scope1 = { workspaceFolder: { uri: URI.file('workspace1'), name: 'workspace1', index: 0 } };
            const scope2 = { workspaceFolder: { uri: URI.file('workspace2'), name: 'workspace2', index: 3 } };
            const collection1 = new Map();
            const collection2 = new Map();
            const collection3 = new Map();
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
            const env = { A: 'foo' };
            await environmentVariableService.mergedCollection.applyToProcessEnvironment(env, scope1);
            deepStrictEqual(env, { A: 'a2:foo:a1' });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN6QyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNoSSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RixPQUFPLEVBQUUsOEJBQThCLEVBQStCLE1BQU0sZ0VBQWdFLENBQUM7QUFDN0ksT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUU5RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLE1BQU0sOEJBQStCLFNBQVEsMEJBQTBCO0lBQ3RFLGtCQUFrQixLQUFXLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxRCx1QkFBdUIsS0FBVyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDLENBQUM7Q0FDcEU7QUFFRCxL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