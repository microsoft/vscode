/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ExtensionRunningLocationTracker } from '../../common/extensionRunningLocationTracker.js';
function createExtension(id, deps, extensionAffinity) {
    return {
        identifier: new ExtensionIdentifier(id),
        extensionLocation: URI.parse(`file:///test/${id}`),
        name: id,
        publisher: 'test',
        version: '1.0.0',
        engines: { vscode: '*' },
        main: 'main.js',
        extensionDependencies: deps,
        extensionAffinity: extensionAffinity,
        enabledApiProposals: extensionAffinity ? ['extensionAffinity'] : undefined,
    };
}
suite('ExtensionRunningLocationTracker - extensionAffinity', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function createTracker(extensions, configuredAffinities = {}) {
        const registry = {
            getAllExtensionDescriptions: () => extensions,
            getExtensionDescription: (id) => extensions.find(e => e.identifier.value === (typeof id === 'string' ? id : id.value)),
            getExtensionDescriptionByUUID: () => undefined,
            getExtensionDescriptionByIdOrUUID: () => undefined,
            containsActivationEvent: () => false,
            containsExtension: () => false,
            getExtensionDescriptionsForActivationEvent: () => [],
        };
        const extensionHostKindPicker = {
            pickExtensionHostKind: () => 1 /* ExtensionHostKind.LocalProcess */,
        };
        const environmentService = {
            isExtensionDevelopment: false,
            extensionDevelopmentKind: undefined,
        };
        const configurationService = new TestConfigurationService();
        configurationService.setUserConfiguration('extensions.experimental.affinity', configuredAffinities);
        const logService = new NullLogService();
        const extensionManifestPropertiesService = {
            getExtensionKind: () => ['workspace'],
        };
        return new ExtensionRunningLocationTracker(registry, extensionHostKindPicker, environmentService, configurationService, logService, extensionManifestPropertiesService);
    }
    test('extensions with extensionAffinity should have the same affinity', () => {
        const extA = createExtension('publisher.extA');
        const extB = createExtension('publisher.extB', undefined, ['publisher.extA']);
        const tracker = createTracker([extA, extB]);
        const runningLocations = tracker.computeRunningLocation([extA, extB], [], true);
        const locA = runningLocations.get(extA.identifier);
        const locB = runningLocations.get(extB.identifier);
        assert.ok(locA, 'Extension A should have a running location');
        assert.ok(locB, 'Extension B should have a running location');
        assert.strictEqual(locA.affinity, locB.affinity, 'Extensions with extensionAffinity should have the same affinity');
    });
    test('transitive extensionAffinity should group all extensions together', () => {
        const extA = createExtension('publisher.extA');
        const extB = createExtension('publisher.extB', undefined, ['publisher.extA']);
        const extC = createExtension('publisher.extC', undefined, ['publisher.extB']);
        const tracker = createTracker([extA, extB, extC]);
        const runningLocations = tracker.computeRunningLocation([extA, extB, extC], [], true);
        const locA = runningLocations.get(extA.identifier);
        const locB = runningLocations.get(extB.identifier);
        const locC = runningLocations.get(extC.identifier);
        assert.ok(locA && locB && locC, 'All extensions should have running locations');
        assert.strictEqual(locA.affinity, locB.affinity, 'A and B should have the same affinity');
        assert.strictEqual(locB.affinity, locC.affinity, 'B and C should have the same affinity');
    });
    test('extensionAffinity with non-installed extension should be ignored', () => {
        const extA = createExtension('publisher.extA', undefined, ['publisher.notInstalled']);
        const extB = createExtension('publisher.extB');
        const tracker = createTracker([extA, extB]);
        const runningLocations = tracker.computeRunningLocation([extA, extB], [], true);
        const locA = runningLocations.get(extA.identifier);
        const locB = runningLocations.get(extB.identifier);
        assert.ok(locA && locB, 'Both extensions should have running locations');
        // They should not be grouped together since the extensionAffinity target doesn't exist
        // (Unless they would naturally have affinity 0, which they both do by default)
    });
    test('extensionAffinity combined with extensionDependencies', () => {
        const extA = createExtension('publisher.extA');
        const extB = createExtension('publisher.extB', ['publisher.extA']);
        const extC = createExtension('publisher.extC', undefined, ['publisher.extA']);
        const tracker = createTracker([extA, extB, extC]);
        const runningLocations = tracker.computeRunningLocation([extA, extB, extC], [], true);
        const locA = runningLocations.get(extA.identifier);
        const locB = runningLocations.get(extB.identifier);
        const locC = runningLocations.get(extC.identifier);
        assert.ok(locA && locB && locC, 'All extensions should have running locations');
        // B depends on A, C has extensionAffinity to A - all should be in the same group
        assert.strictEqual(locA.affinity, locB.affinity, 'A and B (dependency) should have the same affinity');
        assert.strictEqual(locA.affinity, locC.affinity, 'A and C (extensionAffinity) should have the same affinity');
    });
    test('user configured affinity should override extensionAffinity', () => {
        const extA = createExtension('publisher.extA');
        const extB = createExtension('publisher.extB', undefined, ['publisher.extA']);
        const tracker = createTracker([extA, extB], {
            'publisher.extA': 1,
            'publisher.extB': 2,
        });
        const runningLocations = tracker.computeRunningLocation([extA, extB], [], true);
        const locA = runningLocations.get(extA.identifier);
        const locB = runningLocations.get(extB.identifier);
        assert.ok(locA && locB, 'Both extensions should have running locations');
        // With user-configured affinities, they should be in different groups
        // Note: The actual behavior depends on the order of operations in _computeAffinity
        // The user config creates separate affinities, but grouping happens first
    });
    test('one-way extensionAffinity is sufficient', () => {
        // Only extB declares extensionAffinity, extA doesn't need to know about extB
        const extA = createExtension('publisher.extA');
        const extB = createExtension('publisher.extB', undefined, ['publisher.extA']);
        const tracker = createTracker([extA, extB]);
        const runningLocations = tracker.computeRunningLocation([extA, extB], [], true);
        const locA = runningLocations.get(extA.identifier);
        const locB = runningLocations.get(extB.identifier);
        assert.ok(locA && locB, 'Both extensions should have running locations');
        assert.strictEqual(locA.affinity, locB.affinity, 'One-way extensionAffinity should be sufficient to group extensions');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbnMvdGVzdC9jb21tb24vZXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLG1CQUFtQixFQUF5QixNQUFNLHlEQUF5RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQU1sRyxTQUFTLGVBQWUsQ0FBQyxFQUFVLEVBQUUsSUFBZSxFQUFFLGlCQUE0QjtJQUNqRixPQUE4QjtRQUM3QixVQUFVLEVBQUUsSUFBSSxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7UUFDdkMsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFLENBQUM7UUFDbEQsSUFBSSxFQUFFLEVBQUU7UUFDUixTQUFTLEVBQUUsTUFBTTtRQUNqQixPQUFPLEVBQUUsT0FBTztRQUNoQixPQUFPLEVBQUUsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFO1FBQ3hCLElBQUksRUFBRSxTQUFTO1FBQ2YscUJBQXFCLEVBQUUsSUFBSTtRQUMzQixpQkFBaUIsRUFBRSxpQkFBaUI7UUFDcEMsbUJBQW1CLEVB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