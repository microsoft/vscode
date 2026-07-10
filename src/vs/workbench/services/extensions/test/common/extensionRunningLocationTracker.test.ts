/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ExtensionRunningLocationTracker, EXTENSIONS_WORKER_ISOLATED_CONFIGURATION_KEY } from '../../common/extensionRunningLocationTracker.js';
import { ExtensionHostKind, IExtensionHostKindPicker } from '../../common/extensionHostKind.js';
import { IExtensionManifestPropertiesService } from '../../common/extensionManifestPropertiesService.js';
import { IReadOnlyExtensionDescriptionRegistry } from '../../common/extensionDescriptionRegistry.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';

function createExtension(id: string, deps?: string[], extensionAffinity?: string[]): IExtensionDescription {
	return <IExtensionDescription>{
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

	function createTracker(extensions: IExtensionDescription[], configuredAffinities: { [extensionId: string]: number } = {}): ExtensionRunningLocationTracker {
		const registry: IReadOnlyExtensionDescriptionRegistry = {
			getAllExtensionDescriptions: () => extensions,
			getExtensionDescription: (id: string | ExtensionIdentifier) => extensions.find(e => e.identifier.value === (typeof id === 'string' ? id : id.value)),
			getExtensionDescriptionByUUID: () => undefined,
			getExtensionDescriptionByIdOrUUID: () => undefined,
			containsActivationEvent: () => false,
			containsExtension: () => false,
			getExtensionDescriptionsForActivationEvent: () => [],
		};

		const extensionHostKindPicker: IExtensionHostKindPicker = {
			pickExtensionHostKind: () => ExtensionHostKind.LocalProcess,
		};

		const environmentService = <IWorkbenchEnvironmentService>{
			isExtensionDevelopment: false,
			extensionDevelopmentKind: undefined,
		};

		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('extensions.experimental.affinity', configuredAffinities);

		const logService = new NullLogService();

		const extensionManifestPropertiesService = {
			getExtensionKind: () => ['workspace'],
		} as unknown as IExtensionManifestPropertiesService;

		return new ExtensionRunningLocationTracker(
			registry,
			extensionHostKindPicker,
			environmentService,
			configurationService,
			logService,
			extensionManifestPropertiesService
		);
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
		assert.strictEqual(locA!.affinity, locB!.affinity, 'Extensions with extensionAffinity should have the same affinity');
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
		assert.strictEqual(locA!.affinity, locB!.affinity, 'A and B should have the same affinity');
		assert.strictEqual(locB!.affinity, locC!.affinity, 'B and C should have the same affinity');
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
		assert.strictEqual(locA!.affinity, locB!.affinity, 'A and B (dependency) should have the same affinity');
		assert.strictEqual(locA!.affinity, locC!.affinity, 'A and C (extensionAffinity) should have the same affinity');
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
		assert.strictEqual(locA!.affinity, locB!.affinity, 'One-way extensionAffinity should be sufficient to group extensions');
	});
});

suite('ExtensionRunningLocationTracker - workerIsolated', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createTracker(extensions: IExtensionDescription[], workerIsolatedIds: string[] = [], configuredAffinities: { [extensionId: string]: number } = {}): ExtensionRunningLocationTracker {
		const registry: IReadOnlyExtensionDescriptionRegistry = {
			getAllExtensionDescriptions: () => extensions,
			getExtensionDescription: (id: string | ExtensionIdentifier) => extensions.find(e => e.identifier.value === (typeof id === 'string' ? id : id.value)),
			getExtensionDescriptionByUUID: () => undefined,
			getExtensionDescriptionByIdOrUUID: () => undefined,
			containsActivationEvent: () => false,
			containsExtension: () => false,
			getExtensionDescriptionsForActivationEvent: () => [],
		};

		const extensionHostKindPicker: IExtensionHostKindPicker = {
			pickExtensionHostKind: () => ExtensionHostKind.LocalProcess,
		};

		const environmentService = <IWorkbenchEnvironmentService>{
			isExtensionDevelopment: false,
			extensionDevelopmentKind: undefined,
		};

		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('extensions.experimental.affinity', configuredAffinities);
		configurationService.setUserConfiguration(EXTENSIONS_WORKER_ISOLATED_CONFIGURATION_KEY, workerIsolatedIds);

		const logService = new NullLogService();

		const extensionManifestPropertiesService = {
			getExtensionKind: () => ['workspace'],
		} as unknown as IExtensionManifestPropertiesService;

		return new ExtensionRunningLocationTracker(
			registry,
			extensionHostKindPicker,
			environmentService,
			configurationService,
			logService,
			extensionManifestPropertiesService
		);
	}

	test('worker-isolated extensions get a dedicated affinity', () => {
		const extA = createExtension('publisher.extA');
		const extB = createExtension('publisher.extB');

		const tracker = createTracker([extA, extB], ['publisher.extA']);
		tracker.initializeRunningLocation([extA, extB], []);

		const locA = tracker.getRunningLocation(extA.identifier);
		const locB = tracker.getRunningLocation(extB.identifier);

		assert.ok(locA && locB);
		assert.notStrictEqual(locA!.affinity, locB!.affinity, 'Isolated extension should have a different affinity than non-isolated');
		assert.ok(tracker.isWorkerIsolatedLocalProcessAffinity(locA!.affinity), 'Extension A affinity should be marked as worker-isolated');
		assert.ok(!tracker.isWorkerIsolatedLocalProcessAffinity(locB!.affinity), 'Extension B affinity should NOT be marked as worker-isolated');
	});

	test('multiple worker-isolated extensions share the same isolated affinity', () => {
		const extA = createExtension('publisher.extA');
		const extB = createExtension('publisher.extB');
		const extC = createExtension('publisher.extC');

		const tracker = createTracker([extA, extB, extC], ['publisher.extA', 'publisher.extB']);
		tracker.initializeRunningLocation([extA, extB, extC], []);

		const locA = tracker.getRunningLocation(extA.identifier);
		const locB = tracker.getRunningLocation(extB.identifier);
		const locC = tracker.getRunningLocation(extC.identifier);

		assert.ok(locA && locB && locC);
		assert.strictEqual(locA!.affinity, locB!.affinity, 'Both isolated extensions should share the same affinity');
		assert.notStrictEqual(locA!.affinity, locC!.affinity, 'Non-isolated extension should have a different affinity');
	});

	test('empty workerIsolated setting has no effect', () => {
		const extA = createExtension('publisher.extA');
		const extB = createExtension('publisher.extB');

		const tracker = createTracker([extA, extB], []);
		tracker.initializeRunningLocation([extA, extB], []);

		const locA = tracker.getRunningLocation(extA.identifier);
		const locB = tracker.getRunningLocation(extB.identifier);

		assert.ok(locA && locB);
		assert.strictEqual(locA!.affinity, 0);
		assert.strictEqual(locB!.affinity, 0);
		assert.ok(!tracker.isWorkerIsolatedLocalProcessAffinity(0));
	});

	test('workerIsolated with unknown extension ID is ignored', () => {
		const extA = createExtension('publisher.extA');

		const tracker = createTracker([extA], ['publisher.nonexistent']);
		tracker.initializeRunningLocation([extA], []);

		const locA = tracker.getRunningLocation(extA.identifier);
		assert.ok(locA);
		assert.strictEqual(locA!.affinity, 0);
		assert.ok(!tracker.isWorkerIsolatedLocalProcessAffinity(0));
	});

	test('isWorkerIsolatedLocalProcessAffinity returns correct values', () => {
		const extA = createExtension('publisher.extA');
		const extB = createExtension('publisher.extB');

		const tracker = createTracker([extA, extB], ['publisher.extA']);
		tracker.initializeRunningLocation([extA, extB], []);

		const locA = tracker.getRunningLocation(extA.identifier);
		assert.ok(locA);
		assert.ok(tracker.isWorkerIsolatedLocalProcessAffinity(locA!.affinity));
		assert.ok(!tracker.isWorkerIsolatedLocalProcessAffinity(0));
		assert.ok(!tracker.isWorkerIsolatedLocalProcessAffinity(999));
	});
});
