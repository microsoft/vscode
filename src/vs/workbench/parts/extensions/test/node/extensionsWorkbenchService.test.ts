/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as fs from 'fs';
import { assign } from 'vs/base/common/objects';
import { generateUuid } from 'vs/base/common/uuid';
import { IExtensionsWorkbenchService, ExtensionState } from 'vs/workbench/parts/extensions/common/extensions';
import { ExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/node/extensionsWorkbenchService';
import {
	IExtensionManagementService, IExtensionGalleryService, IExtensionEnablementService, ILocalExtension, LocalExtensionType, IGalleryExtension,
	DidInstallExtensionEvent, DidUninstallExtensionEvent, InstallExtensionEvent
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { IURLService } from 'vs/platform/url/common/url';
import { TestInstantiationService } from 'vs/test/utils/instantiationTestUtils';
import Event, { Emitter } from 'vs/base/common/event';
import { IPager } from 'vs/base/common/paging';
import { ITelemetryService, NullTelemetryService } from 'vs/platform/telemetry/common/telemetry';

suite('ExtensionsWorkbenchService Test', () => {

	let instantiationService;
	let testObject: IExtensionsWorkbenchService;

	const installEvent: Emitter<InstallExtensionEvent> = new Emitter(),
		didInstallEvent: Emitter<DidInstallExtensionEvent> = new Emitter(),
		uninstallEvent: Emitter<string> = new Emitter(),
		didUninstallEvent: Emitter<DidUninstallExtensionEvent> = new Emitter();

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IURLService, { onOpenURL: new Emitter().event });
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage());

		instantiationService.stub(IExtensionManagementService, ExtensionManagementService);
		instantiationService.stub(IExtensionManagementService, 'onInstallExtension', installEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onDidInstallExtension', didInstallEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onUninstallExtension', uninstallEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onDidUninstallExtension', didUninstallEvent.event);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', []);

		instantiationService.stub(IExtensionEnablementService, ExtensionEnablementService);
		instantiationService.stub(IExtensionEnablementService, 'onEnablementChanged', new Emitter().event);
		instantiationService.stub(IExtensionEnablementService, 'getGloballyDisabledExtensions', []);
		instantiationService.stub(IExtensionEnablementService, 'getWorkspaceDisabledExtensions', []);
	});

	teardown(() => {
		(<ExtensionsWorkbenchService>testObject).dispose();
	});

	test('test gallery extension', (done) => {
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
				manifest: 'expectedMainfest',
				readme: 'expectedReadme',
				changeLog: 'expectedChangelog',
				download: 'expectedDownload',
				icon: 'expectedIcon',
				iconFallback: 'expectedIconFallback',
				license: 'expectedLicense'
			});
		testObject = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(expected));
		testObject.queryGallery().done(pagedResponse => {
			assert.equal(1, pagedResponse.firstPage.length);
			const actual = pagedResponse.firstPage[0];

			assert.equal(null, actual.type);
			assert.equal('expectedName', actual.name);
			assert.equal('expectedDisplayName', actual.displayName);
			assert.equal('expectedPublisher.expectedName', actual.identifier);
			assert.equal('expectedPublisher', actual.publisher);
			assert.equal('expectedPublisherDisplayName', actual.publisherDisplayName);
			assert.equal('1.5', actual.version);
			assert.equal('1.5', actual.latestVersion);
			assert.equal('expectedDescription', actual.description);
			assert.equal('expectedIcon', actual.iconUrl);
			assert.equal('expectedIconFallback', actual.iconUrlFallback);
			assert.equal('expectedLicense', actual.licenseUrl);
			assert.equal(ExtensionState.Uninstalled, actual.state);
			assert.equal(1000, actual.installCount);
			assert.equal(4, actual.rating);
			assert.equal(100, actual.ratingCount);
			assert.equal(false, actual.outdated);
			assert.deepEqual(['pub.1', 'pub.2'], actual.dependencies);
			done();
		});
	});

	test('test for empty installed extensions', () => {
		testObject = instantiationService.createInstance(ExtensionsWorkbenchService);

		assert.deepEqual([], testObject.local);
	});

	test('test for installed extensions', () => {
		const expected1 = aLocalExtension('local1', {
			publisher: 'localPublisher1',
			version: '1.1',
			displayName: 'localDisplayName1',
			description: 'localDescription1',
			icon: 'localIcon1',
			extensionDependencies: ['pub.1', 'pub.2'],
		}, {
				type: LocalExtensionType.User,
				readmeUrl: 'localReadmeUrl1',
				changelogUrl: 'localChangelogUrl1',
				path: 'localPath1'
			});
		const expected2 = aLocalExtension('local2', {
			publisher: 'localPublisher2',
			version: '1.2',
			displayName: 'localDisplayName2',
			description: 'localDescription2',
		}, {
				type: LocalExtensionType.System,
				readmeUrl: 'localReadmeUrl2',
				changelogUrl: 'localChangelogUrl2',
			});
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [expected1, expected2]);
		testObject = instantiationService.createInstance(ExtensionsWorkbenchService);

		const actuals = testObject.local;
		assert.equal(2, actuals.length);

		let actual = actuals[0];
		assert.equal(LocalExtensionType.User, actual.type);
		assert.equal('local1', actual.name);
		assert.equal('localDisplayName1', actual.displayName);
		assert.equal('localPublisher1.local1', actual.identifier);
		assert.equal('localPublisher1', actual.publisher);
		assert.equal('1.1', actual.version);
		assert.equal('1.1', actual.latestVersion);
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
		assert.equal('localPublisher2.local2', actual.identifier);
		assert.equal('localPublisher2', actual.publisher);
		assert.equal('1.2', actual.version);
		assert.equal('1.2', actual.latestVersion);
		assert.equal('localDescription2', actual.description);
		assert.ok(fs.existsSync(actual.iconUrl));
		assert.equal(null, actual.licenseUrl);
		assert.equal(ExtensionState.Installed, actual.state);
		assert.equal(null, actual.installCount);
		assert.equal(null, actual.rating);
		assert.equal(null, actual.ratingCount);
		assert.equal(false, actual.outdated);
		assert.deepEqual([], actual.dependencies);
	});

	test('test installed extensions get syncs with gallery', (done) => {
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
				path: 'localPath1'
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
		const gallery1 = aGalleryExtension('expectedName', {
			id: local1.id,
			displayName: 'expectedDisplayName',
			version: '1.5.0',
			publisherId: 'expectedPublisherId',
			publisher: 'expectedPublisher',
			publisherDisplayName: 'expectedPublisherDisplayName',
			description: 'expectedDescription',
			installCount: 1000,
			rating: 4,
			ratingCount: 100
		}, {
				dependencies: ['pub.1'],
			}, {
				manifest: 'expectedMainfest',
				readme: 'expectedReadme',
				changeLog: 'expectedChangelog',
				download: 'expectedDownload',
				icon: 'expectedIcon',
				iconFallback: 'expectedIconFallback',
				license: 'expectedLicense'
			});
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local1, local2]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery1));
		testObject = instantiationService.createInstance(ExtensionsWorkbenchService);

		listenAfter(testObject.onChange)(() => {
			const actuals = testObject.local;
			assert.equal(2, actuals.length);

			let actual = actuals[0];
			assert.equal(LocalExtensionType.User, actual.type);
			assert.equal('local1', actual.name);
			assert.equal('localDisplayName1', actual.displayName);
			assert.equal('localPublisher1.local1', actual.identifier);
			assert.equal('localPublisher1', actual.publisher);
			assert.equal('1.1.0', actual.version);
			assert.equal('1.5.0', actual.latestVersion);
			assert.equal('localDescription1', actual.description);
			assert.equal('file:///localPath1/localIcon1', actual.iconUrl);
			assert.equal('file:///localPath1/localIcon1', actual.iconUrlFallback);
			assert.equal(ExtensionState.Installed, actual.state);
			assert.equal('expectedLicense', actual.licenseUrl);
			assert.equal(1000, actual.installCount);
			assert.equal(4, actual.rating);
			assert.equal(100, actual.ratingCount);
			assert.equal(true, actual.outdated);
			assert.deepEqual(['pub.1', 'pub.2'], actual.dependencies);

			actual = actuals[1];
			assert.equal(LocalExtensionType.System, actual.type);
			assert.equal('local2', actual.name);
			assert.equal('localDisplayName2', actual.displayName);
			assert.equal('localPublisher2.local2', actual.identifier);
			assert.equal('localPublisher2', actual.publisher);
			assert.equal('1.2.0', actual.version);
			assert.equal('1.2.0', actual.latestVersion);
			assert.equal('localDescription2', actual.description);
			assert.ok(fs.existsSync(actual.iconUrl));
			assert.equal(null, actual.licenseUrl);
			assert.equal(ExtensionState.Installed, actual.state);
			assert.equal(null, actual.installCount);
			assert.equal(null, actual.rating);
			assert.equal(null, actual.ratingCount);
			assert.equal(false, actual.outdated);
			assert.deepEqual([], actual.dependencies);
			done();
		});
	});

	test('test extension state computation', (done) => {
		const gallery = aGalleryExtension('gallery1');
		testObject = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		testObject.queryGallery().done(page => {
			const extension = page.firstPage[0];
			assert.equal(ExtensionState.Uninstalled, extension.state);

			testObject.install(extension);

			// Installing
			installEvent.fire({ id: gallery.id, gallery });
			let local = testObject.local;
			assert.equal(1, local.length);
			const actual = local[0];
			assert.equal(`${gallery.publisher}.${gallery.name}`, actual.identifier);
			assert.equal(ExtensionState.Installing, actual.state);

			// Installed
			didInstallEvent.fire({ id: gallery.id, gallery, local: aLocalExtension(gallery.name, gallery, gallery) });
			assert.equal(ExtensionState.Installed, actual.state);
			assert.equal(1, testObject.local.length);

			testObject.uninstall(actual);

			// Uninstalling
			uninstallEvent.fire(gallery.id);
			assert.equal(ExtensionState.Uninstalling, actual.state);

			// Uninstalled
			didUninstallEvent.fire({ id: gallery.id });
			assert.equal(ExtensionState.Uninstalled, actual.state);

			assert.equal(0, testObject.local.length);
			done();
		});
	});

	test('test extension doesnot show outdated for system extensions', () => {
		const local = aLocalExtension('a', { version: '1.0.1' }, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension(local.manifest.name, { version: '1.0.2' })));
		testObject = instantiationService.createInstance(ExtensionsWorkbenchService);

		assert.ok(!testObject.local[0].outdated);
	});


	function aLocalExtension(name: string = 'someext', manifest: any = {}, properties: any = {}): ILocalExtension {
		const localExtension = <ILocalExtension>Object.create({ manifest: {} });
		assign(localExtension, { type: LocalExtensionType.User, id: generateUuid() }, properties);
		assign(localExtension.manifest, { name, publisher: 'pub' }, manifest);
		localExtension.metadata = { id: localExtension.id, publisherId: localExtension.manifest.publisher, publisherDisplayName: 'somename' };
		return localExtension;
	}

	function aGalleryExtension(name: string, properties: any = {}, galleryExtensionProperties: any = {}, assets: any = {}): IGalleryExtension {
		const galleryExtension = <IGalleryExtension>Object.create({});
		assign(galleryExtension, { name, publisher: 'pub', id: generateUuid(), properties: {}, assets: {} }, properties);
		assign(galleryExtension.properties, { dependencies: [] }, galleryExtensionProperties);
		assign(galleryExtension.assets, assets);
		return <IGalleryExtension>galleryExtension;
	}

	function aPage<T>(...objects: T[]): IPager<T> {
		return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null };
	}

	function listenAfter(event: Event<any>, count: number = 1): Event<any> {
		let counter = 0;
		const emitter = new Emitter<any>();
		event(() => {
			if (++counter === count) {
				emitter.fire();
				emitter.dispose();
			}
		});
		return emitter.event;
	}
});