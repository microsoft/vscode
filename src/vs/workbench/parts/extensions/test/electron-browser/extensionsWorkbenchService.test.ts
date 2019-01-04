/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';
import * as assert from 'assert';
import * as fs from 'fs';
import { assign } from 'vs/base/common/objects';
import { generateUuid } from 'vs/base/common/uuid';
import { IExtensionsWorkbenchService, ExtensionState, AutoCheckUpdatesConfigurationKey, AutoUpdateConfigurationKey } from 'vs/workbench/parts/extensions/common/extensions';
import { ExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/node/extensionsWorkbenchService';
import {
	IExtensionManagementService, IExtensionGalleryService, IExtensionEnablementService, IExtensionTipsService, ILocalExtension, LocalExtensionType, IGalleryExtension,
	DidInstallExtensionEvent, DidUninstallExtensionEvent, InstallExtensionEvent, IGalleryExtensionAssets, IExtensionIdentifier, EnablementState, InstallOperation
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionId, getGalleryExtensionIdFromLocal } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionManagementService, getLocalExtensionIdFromGallery, getLocalExtensionIdFromManifest } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionTipsService } from 'vs/workbench/parts/extensions/electron-browser/extensionTipsService';
import { TestExtensionEnablementService } from 'vs/platform/extensionManagement/test/electron-browser/extensionEnablementService.test';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { IURLService } from 'vs/platform/url/common/url';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Event, Emitter } from 'vs/base/common/event';
import { IPager } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TestContextService, TestWindowService } from 'vs/workbench/test/workbenchTestServices';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IProgressService2 } from 'vs/platform/progress/common/progress';
import { ProgressService2 } from 'vs/workbench/services/progress/browser/progressService2';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { URLService } from 'vs/platform/url/common/urlService';
import { URI } from 'vs/base/common/uri';
import { CancellationToken } from 'vs/base/common/cancellation';

suite('ExtensionsWorkbenchServiceTest', () => {

	let instantiationService: TestInstantiationService;
	let testObject: IExtensionsWorkbenchService;

	let installEvent: Emitter<InstallExtensionEvent>,
		didInstallEvent: Emitter<DidInstallExtensionEvent>,
		uninstallEvent: Emitter<IExtensionIdentifier>,
		didUninstallEvent: Emitter<DidUninstallExtensionEvent>;

	suiteSetup(() => {
		installEvent = new Emitter<InstallExtensionEvent>();
		didInstallEvent = new Emitter<DidInstallExtensionEvent>();
		uninstallEvent = new Emitter<IExtensionIdentifier>();
		didUninstallEvent = new Emitter<DidUninstallExtensionEvent>();

		instantiationService = new TestInstantiationService();
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(ILogService, NullLogService);
		instantiationService.stub(IWindowService, TestWindowService);
		instantiationService.stub(IProgressService2, ProgressService2);

		instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
		instantiationService.stub(IURLService, URLService);

		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IConfigurationService, {
			onDidUpdateConfiguration: () => { },
			onDidChangeConfiguration: () => { },
			getConfiguration: () => ({}),
			getValue: (key) => {
				return (key === AutoCheckUpdatesConfigurationKey || key === AutoUpdateConfigurationKey) ? true : undefined;
			}
		});

		instantiationService.stub(IExtensionManagementService, ExtensionManagementService);
		instantiationService.stub(IExtensionManagementService, 'onInstallExtension', installEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onDidInstallExtension', didInstallEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onUninstallExtension', uninstallEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onDidUninstallExtension', didUninstallEvent.event);

		instantiationService.stub(IExtensionEnablementService, new TestExtensionEnablementService(instantiationService));

		instantiationService.set(IExtensionTipsService, instantiationService.createInstance(ExtensionTipsService));

		instantiationService.stub(INotificationService, { prompt: () => null });
	});

	setup(async () => {
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', []);
		instantiationService.stubPromise(IExtensionManagementService, 'getExtensionsReport', []);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage());
		instantiationService.stubPromise(INotificationService, 'prompt', 0);
		await (<TestExtensionEnablementService>instantiationService.get(IExtensionEnablementService)).reset();
	});

	teardown(() => {
		(<ExtensionsWorkbenchService>testObject).dispose();
	});

	test('test gallery extension', async () => {
		const expected = aGalleryExtension('expectedName', {
			displayName: 'expectedDisplayName',
			version: '1.5',
			publisherId: 'expectedPublisherId',
			publisher: 'expectedPublisher',
			publisherDisplayName: 'expectedPublisherDisplayName',
			description: 'expectedDescription',
			installCount: 1000,
			rating: 4,
			ratingCount: 100
		}, {
				dependencies: ['pub.1', 'pub.2'],
			}, {
				manifest: { uri: 'uri:manifest', fallbackUri: 'fallback:manifest' },
				readme: { uri: 'uri:readme', fallbackUri: 'fallback:readme' },
				changelog: { uri: 'uri:changelog', fallbackUri: 'fallback:changlog' },
				download: { uri: 'uri:download', fallbackUri: 'fallback:download' },
				icon: { uri: 'uri:icon', fallbackUri: 'fallback:icon' },
				license: { uri: 'uri:license', fallbackUri: 'fallback:license' },
				repository: { uri: 'uri:repository', fallbackUri: 'fallback:repository' },
				coreTranslations: {}
			});

		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(expected));

		return testObject.queryGallery().then(pagedResponse => {
			assert.equal(1, pagedResponse.firstPage.length);
			const actual = pagedResponse.firstPage[0];

			assert.equal(null, actual.type);
			assert.equal('expectedName', actual.name);
			assert.equal('expectedDisplayName', actual.displayName);
			assert.equal('expectedpublisher.expectedname', actual.identifier.id);
			assert.equal('expectedPublisher', actual.publisher);
			assert.equal('expectedPublisherDisplayName', actual.publisherDisplayName);
			assert.equal('1.5', actual.version);
			assert.equal('1.5', actual.latestVersion);
			assert.equal('expectedDescription', actual.description);
			assert.equal('uri:icon', actual.iconUrl);
			assert.equal('fallback:icon', actual.iconUrlFallback);
			assert.equal('uri:license', actual.licenseUrl);
			assert.equal(ExtensionState.Uninstalled, actual.state);
			assert.equal(1000, actual.installCount);
			assert.equal(4, actual.rating);
			assert.equal(100, actual.ratingCount);
			assert.equal(false, actual.outdated);
			assert.deepEqual(['pub.1', 'pub.2'], actual.dependencies);
		});
	});

	test('test for empty installed extensions', async () => {
		testObject = await aWorkbenchService();

		assert.deepEqual([], testObject.local);
	});

	test('test for installed extensions', async () => {
		const expected1 = aLocalExtension('local1', {
			publisher: 'localPublisher1',
			version: '1.1.0',
			displayName: 'localDisplayName1',
			description: 'localDescription1',
			icon: 'localIcon1',
			extensionDependencies: ['pub.1', 'pub.2'],
		}, {
				type: LocalExtensionType.User,
				readmeUrl: 'localReadmeUrl1',
				changelogUrl: 'localChangelogUrl1',
				location: URI.file('localPath1')
			});
		const expected2 = aLocalExtension('local2', {
			publisher: 'localPublisher2',
			version: '1.2.0',
			displayName: 'localDisplayName2',
			description: 'localDescription2',
		}, {
				type: LocalExtensionType.System,
				readmeUrl: 'localReadmeUrl2',
				changelogUrl: 'localChangelogUrl2',
			});
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [expected1, expected2]);
		testObject = await aWorkbenchService();

		const actuals = testObject.local;
		assert.equal(2, actuals.length);

		let actual = actuals[0];
		assert.equal(LocalExtensionType.User, actual.type);
		assert.equal('local1', actual.name);
		assert.equal('localDisplayName1', actual.displayName);
		assert.equal('localpublisher1.local1', actual.identifier.id);
		assert.equal('localPublisher1', actual.publisher);
		assert.equal('1.1.0', actual.version);
		assert.equal('1.1.0', actual.latestVersion);
		assert.equal('localDescription1', actual.description);
		assert.equal('file:///localPath1/localIcon1', actual.iconUrl);
		assert.equal('file:///localPath1/localIcon1', actual.iconUrlFallback);
		assert.equal(null, actual.licenseUrl);
		assert.equal(ExtensionState.Installed, actual.state);
		assert.equal(null, actual.installCount);
		assert.equal(null, actual.rating);
		assert.equal(null, actual.ratingCount);
		assert.equal(false, actual.outdated);
		assert.deepEqual(['pub.1', 'pub.2'], actual.dependencies);

		actual = actuals[1];
		assert.equal(LocalExtensionType.System, actual.type);
		assert.equal('local2', actual.name);
		assert.equal('localDisplayName2', actual.displayName);
		assert.equal('localpublisher2.local2', actual.identifier.id);
		assert.equal('localPublisher2', actual.publisher);
		assert.equal('1.2.0', actual.version);
		assert.equal('1.2.0', actual.latestVersion);
		assert.equal('localDescription2', actual.description);
		assert.ok(fs.existsSync(URI.parse(actual.iconUrl).fsPath));
		assert.equal(null, actual.licenseUrl);
		assert.equal(ExtensionState.Installed, actual.state);
		assert.equal(null, actual.installCount);
		assert.equal(null, actual.rating);
		assert.equal(null, actual.ratingCount);
		assert.equal(false, actual.outdated);
		assert.deepEqual([], actual.dependencies);
	});

	test('test installed extensions get syncs with gallery', async () => {
		const local1 = aLocalExtension('local1', {
			publisher: 'localPublisher1',
			version: '1.1.0',
			displayName: 'localDisplayName1',
			description: 'localDescription1',
			icon: 'localIcon1',
			extensionDependencies: ['pub.1', 'pub.2'],
		}, {
				type: LocalExtensionType.User,
				readmeUrl: 'localReadmeUrl1',
				changelogUrl: 'localChangelogUrl1',
				location: URI.file('localPath1')
			});
		const local2 = aLocalExtension('local2', {
			publisher: 'localPublisher2',
			version: '1.2.0',
			displayName: 'localDisplayName2',
			description: 'localDescription2',
		}, {
				type: LocalExtensionType.System,
				readmeUrl: 'localReadmeUrl2',
				changelogUrl: 'localChangelogUrl2',
			});
		const gallery1 = aGalleryExtension(local1.manifest.name, {
			identifier: local1.identifier,
			displayName: 'expectedDisplayName',
			version: '1.5.0',
			publisherId: 'expectedPublisherId',
			publisher: local1.manifest.publisher,
			publisherDisplayName: 'expectedPublisherDisplayName',
			description: 'expectedDescription',
			installCount: 1000,
			rating: 4,
			ratingCount: 100
		}, {
				dependencies: ['pub.1'],
			}, {
				manifest: { uri: 'uri:manifest', fallbackUri: 'fallback:manifest' },
				readme: { uri: 'uri:readme', fallbackUri: 'fallback:readme' },
				changelog: { uri: 'uri:changelog', fallbackUri: 'fallback:changlog' },
				download: { uri: 'uri:download', fallbackUri: 'fallback:download' },
				icon: { uri: 'uri:icon', fallbackUri: 'fallback:icon' },
				license: { uri: 'uri:license', fallbackUri: 'fallback:license' },
				repository: { uri: 'uri:repository', fallbackUri: 'fallback:repository' },
				coreTranslations: {}
			});
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local1, local2]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery1));
		testObject = await aWorkbenchService();
		await testObject.queryLocal();

		return eventToPromise(testObject.onChange).then(() => {
			const actuals = testObject.local;
			assert.equal(2, actuals.length);

			let actual = actuals[0];
			assert.equal(LocalExtensionType.User, actual.type);
			assert.equal('local1', actual.name);
			assert.equal('expectedDisplayName', actual.displayName);
			assert.equal('localpublisher1.local1', actual.identifier.id);
			assert.equal('localPublisher1', actual.publisher);
			assert.equal('1.1.0', actual.version);
			assert.equal('1.5.0', actual.latestVersion);
			assert.equal('expectedDescription', actual.description);
			assert.equal('uri:icon', actual.iconUrl);
			assert.equal('fallback:icon', actual.iconUrlFallback);
			assert.equal(ExtensionState.Installed, actual.state);
			assert.equal('uri:license', actual.licenseUrl);
			assert.equal(1000, actual.installCount);
			assert.equal(4, actual.rating);
			assert.equal(100, actual.ratingCount);
			assert.equal(true, actual.outdated);
			assert.deepEqual(['pub.1'], actual.dependencies);

			actual = actuals[1];
			assert.equal(LocalExtensionType.System, actual.type);
			assert.equal('local2', actual.name);
			assert.equal('localDisplayName2', actual.displayName);
			assert.equal('localpublisher2.local2', actual.identifier.id);
			assert.equal('localPublisher2', actual.publisher);
			assert.equal('1.2.0', actual.version);
			assert.equal('1.2.0', actual.latestVersion);
			assert.equal('localDescription2', actual.description);
			assert.ok(fs.existsSync(URI.parse(actual.iconUrl).fsPath));
			assert.equal(null, actual.licenseUrl);
			assert.equal(ExtensionState.Installed, actual.state);
			assert.equal(null, actual.installCount);
			assert.equal(null, actual.rating);
			assert.equal(null, actual.ratingCount);
			assert.equal(false, actual.outdated);
			assert.deepEqual([], actual.dependencies);
		});
	});

	test('test extension state computation', async () => {
		const gallery = aGalleryExtension('gallery1');
		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return testObject.queryGallery().then(page => {
			const extension = page.firstPage[0];
			assert.equal(ExtensionState.Uninstalled, extension.state);

			testObject.install(extension);
			const identifier = { id: getLocalExtensionIdFromGallery(gallery, gallery.version) };

			// Installing
			installEvent.fire({ identifier, gallery });
			let local = testObject.local;
			assert.equal(1, local.length);
			const actual = local[0];
			assert.equal(`${gallery.publisher}.${gallery.name}`, actual.identifier.id);
			assert.equal(ExtensionState.Installing, actual.state);

			// Installed
			didInstallEvent.fire({ identifier, gallery, operation: InstallOperation.Install, local: aLocalExtension(gallery.name, gallery, { identifier }) });
			assert.equal(ExtensionState.Installed, actual.state);
			assert.equal(1, testObject.local.length);

			testObject.uninstall(actual);

			// Uninstalling
			uninstallEvent.fire(identifier);
			assert.equal(ExtensionState.Uninstalling, actual.state);

			// Uninstalled
			didUninstallEvent.fire({ identifier });
			assert.equal(ExtensionState.Uninstalled, actual.state);

			assert.equal(0, testObject.local.length);
		});
	});

	test('test extension doesnot show outdated for system extensions', async () => {
		const local = aLocalExtension('a', { version: '1.0.1' }, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension(local.manifest.name, { identifier: local.identifier, version: '1.0.2' })));
		testObject = await aWorkbenchService();
		await testObject.queryLocal();

		assert.ok(!testObject.local[0].outdated);
	});

	test('test canInstall returns false for extensions with out gallery', async () => {
		const local = aLocalExtension('a', { version: '1.0.1' }, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		testObject = await aWorkbenchService();
		const target = testObject.local[0];
		testObject.uninstall(target);
		uninstallEvent.fire(local.identifier);
		didUninstallEvent.fire({ identifier: local.identifier });

		assert.ok(!testObject.canInstall(target));
	});

	test('test canInstall returns false for a system extension', async () => {
		const local = aLocalExtension('a', { version: '1.0.1' }, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension(local.manifest.name, { identifier: local.identifier })));
		testObject = await aWorkbenchService();
		const target = testObject.local[0];

		assert.ok(!testObject.canInstall(target));
	});

	test('test canInstall returns true for extensions with gallery', async () => {
		const local = aLocalExtension('a', { version: '1.0.1' }, { type: LocalExtensionType.User });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension(local.manifest.name, { identifier: local.identifier })));
		testObject = await aWorkbenchService();
		const target = testObject.local[0];

		return eventToPromise(testObject.onChange).then(() => {
			assert.ok(testObject.canInstall(target));
		});
	});

	test('test onchange event is triggered while installing', async () => {
		const gallery = aGalleryExtension('gallery1');
		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const target = sinon.spy();

		return testObject.queryGallery().then(page => {
			const extension = page.firstPage[0];
			assert.equal(ExtensionState.Uninstalled, extension.state);

			testObject.install(extension);
			installEvent.fire({ identifier: gallery.identifier, gallery });
			testObject.onChange(target);

			// Installed
			didInstallEvent.fire({ identifier: gallery.identifier, gallery, operation: InstallOperation.Install, local: aLocalExtension(gallery.name, gallery, gallery) });

			assert.ok(target.calledOnce);
		});
	});

	test('test onchange event is triggered when installation is finished', async () => {
		const gallery = aGalleryExtension('gallery1');
		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const target = sinon.spy();

		return testObject.queryGallery().then(page => {
			const extension = page.firstPage[0];
			assert.equal(ExtensionState.Uninstalled, extension.state);

			testObject.install(extension);
			testObject.onChange(target);

			// Installing
			installEvent.fire({ identifier: gallery.identifier, gallery });

			assert.ok(target.calledOnce);
		});
	});

	test('test onchange event is triggered while uninstalling', async () => {
		const local = aLocalExtension('a', {}, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		testObject = await aWorkbenchService();
		const target = sinon.spy();

		testObject.uninstall(testObject.local[0]);
		testObject.onChange(target);
		uninstallEvent.fire(local.identifier);

		assert.ok(target.calledOnce);
	});

	test('test onchange event is triggered when uninstalling is finished', async () => {
		const local = aLocalExtension('a', {}, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		testObject = await aWorkbenchService();
		const target = sinon.spy();

		testObject.uninstall(testObject.local[0]);
		uninstallEvent.fire(local.identifier);
		testObject.onChange(target);
		didUninstallEvent.fire({ identifier: local.identifier });

		assert.ok(target.calledOnce);
	});

	test('test extension dependencies when empty', async () => {
		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a')));

		return testObject.queryGallery().then(page => {
			return testObject.loadDependencies(page.firstPage[0], CancellationToken.None).then(dependencies => {
				assert.equal(null, dependencies);
			});
		});
	});

	test('test one level extension dependencies without cycle', async () => {
		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', {}, { dependencies: ['pub.b', 'pub.c', 'pub.d'] })));
		instantiationService.stubPromise(IExtensionGalleryService, 'loadAllDependencies', [aGalleryExtension('b'), aGalleryExtension('c'), aGalleryExtension('d')]);

		return testObject.queryGallery().then(page => {
			const extension = page.firstPage[0];
			return testObject.loadDependencies(extension, CancellationToken.None).then(actual => {
				assert.ok(actual!.hasDependencies);
				assert.equal(extension, actual!.extension);
				assert.equal(null, actual!.dependent);
				assert.equal(3, actual!.dependencies.length);
				assert.equal('pub.a', actual!.identifier);
				let dependent = actual;

				actual = dependent!.dependencies[0];
				assert.ok(!actual.hasDependencies);
				assert.equal('pub.b', actual.extension.identifier.id);
				assert.equal('pub.b', actual.identifier);
				assert.equal(dependent, actual.dependent);
				assert.equal(0, actual.dependencies.length);

				actual = dependent!.dependencies[1];
				assert.ok(!actual.hasDependencies);
				assert.equal('pub.c', actual.extension.identifier.id);
				assert.equal('pub.c', actual.identifier);
				assert.equal(dependent, actual.dependent);
				assert.equal(0, actual.dependencies.length);

				actual = dependent!.dependencies[2];
				assert.ok(!actual.hasDependencies);
				assert.equal('pub.d', actual.extension.identifier.id);
				assert.equal('pub.d', actual.identifier);
				assert.equal(dependent, actual.dependent);
				assert.equal(0, actual.dependencies.length);
			});
		});
	});

	test('test one level extension dependencies with cycle', async () => {
		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', {}, { dependencies: ['pub.b', 'pub.a'] })));
		instantiationService.stubPromise(IExtensionGalleryService, 'loadAllDependencies', [aGalleryExtension('b'), aGalleryExtension('a')]);

		return testObject.queryGallery().then(page => {
			const extension = page.firstPage[0];
			return testObject.loadDependencies(extension, CancellationToken.None).then(actual => {
				assert.ok(actual!.hasDependencies);
				assert.equal(extension, actual!.extension);
				assert.equal(null, actual!.dependent);
				assert.equal(2, actual!.dependencies.length);
				assert.equal('pub.a', actual!.identifier);
				let dependent = actual;

				actual = dependent!.dependencies[0]!;
				assert.ok(!actual.hasDependencies);
				assert.equal('pub.b', actual.extension.identifier.id);
				assert.equal('pub.b', actual.identifier);
				assert.equal(dependent, actual.dependent);
				assert.equal(0, actual.dependencies.length);

				actual = dependent!.dependencies[1]!;
				assert.ok(!actual.hasDependencies);
				assert.equal('pub.a', actual.extension.identifier.id);
				assert.equal('pub.a', actual.identifier);
				assert.equal(dependent, actual.dependent);
				assert.equal(0, actual.dependencies.length);
			});
		});
	});

	test('test one level extension dependencies with missing dependencies', async () => {
		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', {}, { dependencies: ['pub.b', 'pub.a'] })));
		instantiationService.stubPromise(IExtensionGalleryService, 'loadAllDependencies', [aGalleryExtension('a')]);

		return testObject.queryGallery().then(page => {
			const extension = page.firstPage[0];
			return testObject.loadDependencies(extension, CancellationToken.None).then(actual => {
				assert.ok(actual!.hasDependencies);
				assert.equal(extension, actual!.extension);
				assert.equal(null, actual!.dependent);
				assert.equal(2, actual!.dependencies.length);
				assert.equal('pub.a', actual!.identifier);
				let dependent = actual;

				actual = dependent!.dependencies[0]!;
				assert.ok(!actual.hasDependencies);
				assert.equal(null, actual.extension);
				assert.equal('pub.b', actual.identifier);
				assert.equal(dependent, actual.dependent);
				assert.equal(0, actual.dependencies.length);

				actual = dependent!.dependencies[1]!;
				assert.ok(!actual.hasDependencies);
				assert.equal('pub.a', actual.extension.identifier.id);
				assert.equal('pub.a', actual.identifier);
				assert.equal(dependent, actual.dependent);
				assert.equal(0, actual.dependencies.length);
			});
		});
	});

	test('test one level extension dependencies with in built dependencies', async () => {
		const local = aLocalExtension('inbuilt', {}, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', {}, { dependencies: ['pub.inbuilt', 'pub.a'] })));
		instantiationService.stubPromise(IExtensionGalleryService, 'loadAllDependencies', [aGalleryExtension('a')]);

		return testObject.queryGallery().then(page => {
			const extension = page.firstPage[0];
			return testObject.loadDependencies(extension, CancellationToken.None).then(actual => {
				assert.ok(actual!.hasDependencies);
				assert.equal(extension, actual!.extension);
				assert.equal(null, actual!.dependent);
				assert.equal(2, actual!.dependencies.length);
				assert.equal('pub.a', actual!.identifier);
				let dependent = actual;

				actual = dependent!.dependencies[0]!;
				assert.ok(!actual.hasDependencies);
				assert.equal('pub.inbuilt', actual.extension.identifier.id);
				assert.equal('pub.inbuilt', actual.identifier);
				assert.equal(dependent, actual.dependent);
				assert.equal(0, actual.dependencies.length);


				actual = dependent!.dependencies[1]!;
				assert.ok(!actual.hasDependencies);
				assert.equal('pub.a', actual.extension.identifier.id);
				assert.equal('pub.a', actual.identifier);
				assert.equal(dependent, actual.dependent);
				assert.equal(0, actual.dependencies.length);
			});
		});
	});

	test('test more than one level of extension dependencies', async () => {
		const local = aLocalExtension('c', { extensionDependencies: ['pub.d'] }, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', {}, { dependencies: ['pub.b', 'pub.c'] })));
		instantiationService.stubPromise(IExtensionGalleryService, 'loadAllDependencies', [
			aGalleryExtension('b', {}, { dependencies: ['pub.d', 'pub.e'] }),
			aGalleryExtension('d', {}, { dependencies: ['pub.f', 'pub.c'] }),
			aGalleryExtension('e')]);

		return testObject.queryGallery().then(page => {
			const extension = page.firstPage[0];
			return testObject.loadDependencies(extension, CancellationToken.None).then(a => {
				assert.ok(a!.hasDependencies);
				assert.equal(extension, a!.extension);
				assert.equal(null, a!.dependent);
				assert.equal(2, a!.dependencies.length);
				assert.equal('pub.a', a!.identifier);

				let b = a!.dependencies[0];
				assert.ok(b.hasDependencies);
				assert.equal('pub.b', b.extension.identifier.id);
				assert.equal('pub.b', b.identifier);
				assert.equal(a, b.dependent);
				assert.equal(2, b.dependencies.length);

				let c = a!.dependencies[1];
				assert.ok(c.hasDependencies);
				assert.equal('pub.c', c.extension.identifier.id);
				assert.equal('pub.c', c.identifier);
				assert.equal(a, c.dependent);
				assert.equal(1, c.dependencies.length);

				let d = b.dependencies[0];
				assert.ok(d.hasDependencies);
				assert.equal('pub.d', d.extension.identifier.id);
				assert.equal('pub.d', d.identifier);
				assert.equal(b, d.dependent);
				assert.equal(2, d.dependencies.length);

				let e = b.dependencies[1];
				assert.ok(!e.hasDependencies);
				assert.equal('pub.e', e.extension.identifier.id);
				assert.equal('pub.e', e.identifier);
				assert.equal(b, e.dependent);
				assert.equal(0, e.dependencies.length);

				let f = d.dependencies[0];
				assert.ok(!f.hasDependencies);
				assert.equal(null, f.extension);
				assert.equal('pub.f', f.identifier);
				assert.equal(d, f.dependent);
				assert.equal(0, f.dependencies.length);

				c = d.dependencies[1];
				assert.ok(c.hasDependencies);
				assert.equal('pub.c', c.extension.identifier.id);
				assert.equal('pub.c', c.identifier);
				assert.equal(d, c.dependent);
				assert.equal(1, c.dependencies.length);

				d = c.dependencies[0];
				assert.ok(!d.hasDependencies);
				assert.equal('pub.d', d.extension.identifier.id);
				assert.equal('pub.d', d.identifier);
				assert.equal(c, d.dependent);
				assert.equal(0, d.dependencies.length);

				c = a!.dependencies[1];
				d = c.dependencies[0];
				assert.ok(d.hasDependencies);
				assert.equal('pub.d', d.extension.identifier.id);
				assert.equal('pub.d', d.identifier);
				assert.equal(c, d.dependent);
				assert.equal(2, d.dependencies.length);

				f = d.dependencies[0];
				assert.ok(!f.hasDependencies);
				assert.equal(null, f.extension);
				assert.equal('pub.f', f.identifier);
				assert.equal(d, f.dependent);
				assert.equal(0, f.dependencies.length);

				c = d.dependencies[1];
				assert.ok(!c.hasDependencies);
				assert.equal('pub.c', c.extension.identifier.id);
				assert.equal('pub.c', c.identifier);
				assert.equal(d, c.dependent);
				assert.equal(0, c.dependencies.length);
			});
		});
	});

	test('test uninstalled extensions are always enabled', async () => {
		return instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('b'), EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('c'), EnablementState.WorkspaceDisabled))
			.then(async () => {
				testObject = await aWorkbenchService();
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a')));
				return testObject.queryGallery().then(pagedResponse => {
					const actual = pagedResponse.firstPage[0];
					assert.equal(actual.enablementState, EnablementState.Enabled);
				});
			});
	});

	test('test enablement state installed enabled extension', async () => {
		return instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('b'), EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('c'), EnablementState.WorkspaceDisabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a')]);
				testObject = await aWorkbenchService();

				const actual = testObject.local[0];

				assert.equal(actual.enablementState, EnablementState.Enabled);
			});
	});

	test('test workspace disabled extension', async () => {
		const extensionA = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('b'), EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('d'), EnablementState.Disabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.WorkspaceDisabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('e'), EnablementState.WorkspaceDisabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA]);
				testObject = await aWorkbenchService();

				const actual = testObject.local[0];

				assert.equal(actual.enablementState, EnablementState.WorkspaceDisabled);
			});
	});

	test('test globally disabled extension', async () => {
		const localExtension = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(localExtension, EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('d'), EnablementState.Disabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('c'), EnablementState.WorkspaceDisabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localExtension]);
				testObject = await aWorkbenchService();

				const actual = testObject.local[0];

				assert.equal(actual.enablementState, EnablementState.Disabled);
			});
	});

	test('test enablement state is updated for user extensions', async () => {
		return instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('c'), EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('b'), EnablementState.WorkspaceDisabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a')]);
				testObject = await aWorkbenchService();
				return testObject.setEnablement(testObject.local[0], EnablementState.WorkspaceDisabled)
					.then(() => {
						const actual = testObject.local[0];
						assert.equal(actual.enablementState, EnablementState.WorkspaceDisabled);
					});
			});
	});

	test('test enable extension globally when extension is disabled for workspace', async () => {
		const localExtension = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(localExtension, EnablementState.WorkspaceDisabled)
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localExtension]);
				testObject = await aWorkbenchService();
				return testObject.setEnablement(testObject.local[0], EnablementState.Enabled)
					.then(() => {
						const actual = testObject.local[0];
						assert.equal(actual.enablementState, EnablementState.Enabled);
					});
			});
	});

	test('test disable extension globally', async () => {
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a')]);
		testObject = await aWorkbenchService();

		return testObject.setEnablement(testObject.local[0], EnablementState.Disabled)
			.then(() => {
				const actual = testObject.local[0];
				assert.equal(actual.enablementState, EnablementState.Disabled);
			});
	});

	test('test system extensions can be disabled', async () => {
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a', {}, { type: LocalExtensionType.System })]);
		testObject = await aWorkbenchService();

		return testObject.setEnablement(testObject.local[0], EnablementState.Disabled)
			.then(() => {
				const actual = testObject.local[0];
				assert.equal(actual.enablementState, EnablementState.Disabled);
			});
	});

	test('test enablement state is updated on change from outside', async () => {
		const localExtension = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('c'), EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('b'), EnablementState.WorkspaceDisabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localExtension]);
				testObject = await aWorkbenchService();

				return instantiationService.get(IExtensionEnablementService).setEnablement(localExtension, EnablementState.Disabled)
					.then(() => {
						const actual = testObject.local[0];
						assert.equal(actual.enablementState, EnablementState.Disabled);
					});
			});
	});

	test('test disable extension with dependencies disable only itself', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Enabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Enabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Enabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.Disabled)
					.then(() => {
						assert.equal(testObject.local[0].enablementState, EnablementState.Disabled);
						assert.equal(testObject.local[1].enablementState, EnablementState.Enabled);
					});
			});
	});

	test('test disable extension pack disables the pack', async () => {
		const extensionA = aLocalExtension('a', { extensionPack: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Enabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Enabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Enabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.Disabled)
					.then(() => {
						assert.equal(testObject.local[0].enablementState, EnablementState.Disabled);
						assert.equal(testObject.local[1].enablementState, EnablementState.Disabled);
					});
			});
	});

	test('test disable extension pack disable all', async () => {
		const extensionA = aLocalExtension('a', { extensionPack: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Enabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Enabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Enabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.Disabled)
					.then(() => {
						assert.equal(testObject.local[0].enablementState, EnablementState.Disabled);
						assert.equal(testObject.local[1].enablementState, EnablementState.Disabled);
					});
			});
	});

	test('test disable extension fails if extension is a dependent of other', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Enabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Enabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Enabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();
				return testObject.setEnablement(testObject.local[1], EnablementState.Disabled).then(() => assert.fail('Should fail'), error => assert.ok(true));
			});
	});

	test('test disable extension when extension is part of a pack', async () => {
		const extensionA = aLocalExtension('a', { extensionPack: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Enabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Enabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Enabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();
				return testObject.setEnablement(testObject.local[1], EnablementState.Disabled)
					.then(() => {
						assert.equal(testObject.local[1].enablementState, EnablementState.Disabled);
					});
			});
	});

	test('test disable both dependency and dependent do not promot and do not fail', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Enabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Enabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Enabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				const target = sinon.spy();
				testObject = await aWorkbenchService();

				return testObject.setEnablement([testObject.local[1], testObject.local[0]], EnablementState.Disabled)
					.then(() => {
						assert.ok(!target.called);
						assert.equal(testObject.local[0].enablementState, EnablementState.Disabled);
						assert.equal(testObject.local[1].enablementState, EnablementState.Disabled);
					});
			});
	});

	test('test enable both dependency and dependent do not promot and do not fail', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Disabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Disabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				const target = sinon.spy();
				testObject = await aWorkbenchService();

				return testObject.setEnablement([testObject.local[1], testObject.local[0]], EnablementState.Enabled)
					.then(() => {
						assert.ok(!target.called);
						assert.equal(testObject.local[0].enablementState, EnablementState.Enabled);
						assert.equal(testObject.local[1].enablementState, EnablementState.Enabled);
					});
			});
	});

	test('test disable extension does not fail if its dependency is a dependent of other but chosen to disable only itself', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.b'] });

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Enabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Enabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Enabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.Disabled)
					.then(() => {
						assert.equal(testObject.local[0].enablementState, EnablementState.Disabled);
					});
			});
	});

	test('test disable extension if its dependency is a dependent of other disabled extension', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.b'] });

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Enabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Enabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Disabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.Disabled)
					.then(() => {
						assert.equal(testObject.local[0].enablementState, EnablementState.Disabled);
					});
			});
	});

	test('test disable extension if its dependencys dependency is itself', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b', { extensionDependencies: ['pub.a'] });
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Enabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Enabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Enabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.Disabled)
					.then(() => assert.fail('An extension with dependent should not be disabled'), () => null);
			});
	});

	test('test disable extension if its dependency is dependent and is disabled', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.b'] });

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Enabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Disabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Enabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);

				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.Disabled)
					.then(() => assert.equal(testObject.local[0].enablementState, EnablementState.Disabled));
			});
	});

	test('test disable extension with cyclic dependencies', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b', { extensionDependencies: ['pub.c'] });
		const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.a'] });

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Enabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Enabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Enabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();
				return testObject.setEnablement(testObject.local[0], EnablementState.Disabled)
					.then(() => assert.fail('An extension with dependent should not be disabled'), () => null);
			});
	});

	test('test enable extension with dependencies enable all', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Disabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Disabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.Enabled)
					.then(() => {
						assert.equal(testObject.local[0].enablementState, EnablementState.Enabled);
						assert.equal(testObject.local[1].enablementState, EnablementState.Enabled);
					});
			});
	});

	test('test enable extension with dependencies does not prompt if dependency is enabled already', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Enabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Disabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				const target = sinon.spy();
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.Enabled)
					.then(() => {
						assert.ok(!target.called);
						assert.equal(testObject.local[0].enablementState, EnablementState.Enabled);
					});
			});
	});

	test('test enable extension with dependency does not prompt if both are enabled', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Disabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Disabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				const target = sinon.spy();
				testObject = await aWorkbenchService();

				return testObject.setEnablement([testObject.local[1], testObject.local[0]], EnablementState.Enabled)
					.then(() => {
						assert.ok(!target.called);
						assert.equal(testObject.local[0].enablementState, EnablementState.Enabled);
						assert.equal(testObject.local[1].enablementState, EnablementState.Enabled);
					});
			});
	});

	test('test enable extension with cyclic dependencies', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b', { extensionDependencies: ['pub.c'] });
		const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.a'] });

		return instantiationService.get(IExtensionEnablementService).setEnablement(extensionA, EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionB, EnablementState.Disabled))
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(extensionC, EnablementState.Disabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);

				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.Enabled)
					.then(() => {
						assert.equal(testObject.local[0].enablementState, EnablementState.Enabled);
						assert.equal(testObject.local[1].enablementState, EnablementState.Enabled);
						assert.equal(testObject.local[2].enablementState, EnablementState.Enabled);
					});
			});
	});

	test('test change event is fired when disablement flags are changed', async () => {
		return instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('c'), EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('b'), EnablementState.WorkspaceDisabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a')]);
				testObject = await aWorkbenchService();
				const target = sinon.spy();
				testObject.onChange(target);

				return testObject.setEnablement(testObject.local[0], EnablementState.Disabled)
					.then(() => assert.ok(target.calledOnce));
			});
	});

	test('test change event is fired when disablement flags are changed from outside', async () => {
		const localExtension = aLocalExtension('a');
		return instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('c'), EnablementState.Disabled)
			.then(() => instantiationService.get(IExtensionEnablementService).setEnablement(aLocalExtension('b'), EnablementState.WorkspaceDisabled))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localExtension]);
				testObject = await aWorkbenchService();
				const target = sinon.spy();
				testObject.onChange(target);

				return instantiationService.get(IExtensionEnablementService).setEnablement(localExtension, EnablementState.Disabled)
					.then(() => assert.ok(target.calledOnce));
			});
	});

	async function aWorkbenchService(): Promise<ExtensionsWorkbenchService> {
		const workbenchService: ExtensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		await workbenchService.queryLocal();
		return workbenchService;
	}

	function aLocalExtension(name: string = 'someext', manifest: any = {}, properties: any = {}): ILocalExtension {
		const localExtension = <ILocalExtension>Object.create({ manifest: {} });
		assign(localExtension, { type: LocalExtensionType.User, manifest: {} }, properties);
		assign(localExtension.manifest, { name, publisher: 'pub', version: '1.0.0' }, manifest);
		localExtension.identifier = { id: getLocalExtensionIdFromManifest(localExtension.manifest) };
		localExtension.metadata = { id: localExtension.identifier.id, publisherId: localExtension.manifest.publisher, publisherDisplayName: 'somename' };
		localExtension.galleryIdentifier = { id: getGalleryExtensionIdFromLocal(localExtension), uuid: undefined };
		return localExtension;
	}

	const noAssets: IGalleryExtensionAssets = {
		changelog: null,
		download: null!,
		icon: null!,
		license: null,
		manifest: null,
		readme: null,
		repository: null,
		coreTranslations: null!
	};

	function aGalleryExtension(name: string, properties: any = {}, galleryExtensionProperties: any = {}, assets: IGalleryExtensionAssets = noAssets): IGalleryExtension {
		const galleryExtension = <IGalleryExtension>Object.create({});
		assign(galleryExtension, { name, publisher: 'pub', version: '1.0.0', properties: {}, assets: {} }, properties);
		assign(galleryExtension.properties, { dependencies: [] }, galleryExtensionProperties);
		assign(galleryExtension.assets, assets);
		galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
		return <IGalleryExtension>galleryExtension;
	}

	function aPage<T>(...objects: T[]): IPager<T> {
		return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null! };
	}

	function eventToPromise(event: Event<any>, count: number = 1): Promise<void> {
		return new Promise<void>(c => {
			let counter = 0;
			event(() => {
				if (++counter === count) {
					c(undefined);
				}
			});
		});
	}
});
