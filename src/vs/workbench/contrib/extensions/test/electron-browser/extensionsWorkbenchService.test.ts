/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';
import assert from 'assert';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ExtensionState, AutoCheckUpdatesConfigurationKey, AutoUpdateConfigurationKey } from '../../common/extensions.js';
import { ExtensionsWorkbenchService } from '../../browser/extensionsWorkbenchService.js';
import {
	IExtensionManagementService, IExtensionGalleryService, ILocalExtension, IGalleryExtension,
	DidUninstallExtensionEvent, InstallExtensionEvent, IGalleryExtensionAssets, InstallOperation, IExtensionTipsService, InstallExtensionResult, getTargetPlatform, IExtensionsControlManifest, UninstallExtensionEvent, Metadata
} from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IExtensionManagementServer, IProfileAwareExtensionManagementService, IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionRecommendationsService } from '../../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { getGalleryExtensionId } from '../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { anExtensionManagementServerService, TestExtensionEnablementService } from '../../../../services/extensionManagement/test/browser/extensionEnablementService.test.js';
import { ExtensionGalleryService } from '../../../../../platform/extensionManagement/common/extensionGalleryService.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { IPager } from '../../../../../base/common/paging.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { TestExtensionTipsService, TestSharedProcessService } from '../../../../test/electron-browser/workbenchTestServices.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { ProgressService } from '../../../../services/progress/browser/progressService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { NativeURLService } from '../../../../../platform/url/common/urlService.js';
import { URI } from '../../../../../base/common/uri.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ExtensionType } from '../../../../../platform/extensions/common/extensions.js';
import { ExtensionKind } from '../../../../../platform/environment/common/environment.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { RemoteAgentService } from '../../../../services/remote/electron-browser/remoteAgentService.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../../test/browser/workbenchTestServices.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { platform } from '../../../../../base/common/platform.js';
import { arch } from '../../../../../base/common/process.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Mutable } from '../../../../../base/common/types.js';
import { IUpdateService, State } from '../../../../../platform/update/common/update.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { UserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfileService.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';

suite('ExtensionsWorkbenchServiceTest', () => {

	let instantiationService: TestInstantiationService;
	let testObject: ExtensionsWorkbenchService;
	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	let installEvent: Emitter<InstallExtensionEvent>,
		didInstallEvent: Emitter<readonly InstallExtensionResult[]>,
		uninstallEvent: Emitter<UninstallExtensionEvent>,
		didUninstallEvent: Emitter<DidUninstallExtensionEvent>;

	setup(async () => {
		disposableStore.add(toDisposable(() => sinon.restore()));
		installEvent = disposableStore.add(new Emitter<InstallExtensionEvent>());
		didInstallEvent = disposableStore.add(new Emitter<readonly InstallExtensionResult[]>());
		uninstallEvent = disposableStore.add(new Emitter<UninstallExtensionEvent>());
		didUninstallEvent = disposableStore.add(new Emitter<DidUninstallExtensionEvent>());

		instantiationService = disposableStore.add(new TestInstantiationService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(ILogService, NullLogService);
		instantiationService.stub(IFileService, disposableStore.add(new FileService(new NullLogService())));
		instantiationService.stub(IProgressService, ProgressService);
		instantiationService.stub(IProductService, {});

		instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
		instantiationService.stub(IURLService, NativeURLService);
		instantiationService.stub(ISharedProcessService, TestSharedProcessService);
		instantiationService.stub(IContextKeyService, new MockContextKeyService());

		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		stubConfiguration();

		instantiationService.stub(IRemoteAgentService, RemoteAgentService);
		instantiationService.stub(IUserDataProfileService, disposableStore.add(new UserDataProfileService(toUserDataProfile('test', 'test', URI.file('foo'), URI.file('cache')))));

		instantiationService.stub(IWorkbenchExtensionManagementService, {
			onDidInstallExtensions: didInstallEvent.event,
			// eslint-disable-next-line local/code-no-any-casts
			onInstallExtension: installEvent.event as any,
			// eslint-disable-next-line local/code-no-any-casts
			onUninstallExtension: uninstallEvent.event as any,
			// eslint-disable-next-line local/code-no-any-casts
			onDidUninstallExtension: didUninstallEvent.event as any,
			onDidUpdateExtensionMetadata: Event.None,
			onDidChangeProfile: Event.None,
			onProfileAwareDidInstallExtensions: Event.None,
			async getInstalled() { return []; },
			async getInstalledWorkspaceExtensions() { return []; },
			async getExtensionsControlManifest() { return { malicious: [], deprecated: {}, search: [], publisherMapping: {} }; },
			async updateMetadata(local: Mutable<ILocalExtension>, metadata: Partial<Metadata>) {
				local.identifier.uuid = metadata.id;
				local.publisherDisplayName = metadata.publisherDisplayName!;
				local.publisherId = metadata.publisherId!;
				return local;
			},
			async canInstall() { return true; },
			getTargetPlatform: async () => getTargetPlatform(platform, arch),
			async resetPinnedStateForAllUserExtensions(pinned: boolean) { }
		});

		instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService({
			id: 'local',
			label: 'local',
			extensionManagementService: instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService,
		}, null, null));

		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));

		instantiationService.stub(ILifecycleService, disposableStore.add(new TestLifecycleService()));
		instantiationService.stub(IExtensionTipsService, disposableStore.add(instantiationService.createInstance(TestExtensionTipsService)));
		instantiationService.stub(IExtensionRecommendationsService, {});

		instantiationService.stub(INotificationService, { prompt: () => null! });

		instantiationService.stub(IExtensionService, {
			onDidChangeExtensions: Event.None,
			extensions: [],
			async whenInstalledExtensionsRegistered() { return true; }
		});

		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', []);
		instantiationService.stub(IExtensionGalleryService, 'isEnabled', true);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage());
		instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', []);
		instantiationService.stubPromise(INotificationService, 'prompt', 0);
		(<TestExtensionEnablementService>instantiationService.get(IWorkbenchExtensionEnablementService)).reset();
		instantiationService.stub(IUpdateService, { onStateChange: Event.None, state: State.Uninitialized });
	});

	test('test gallery extension', async () => {
		const expected = aGalleryExtension('expectedName', {
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
			dependencies: ['pub.1', 'pub.2'],
		}, {
			manifest: { uri: 'uri:manifest', fallbackUri: 'fallback:manifest' },
			readme: { uri: 'uri:readme', fallbackUri: 'fallback:readme' },
			changelog: { uri: 'uri:changelog', fallbackUri: 'fallback:changlog' },
			download: { uri: 'uri:download', fallbackUri: 'fallback:download' },
			icon: { uri: 'uri:icon', fallbackUri: 'fallback:icon' },
			license: { uri: 'uri:license', fallbackUri: 'fallback:license' },
			repository: { uri: 'uri:repository', fallbackUri: 'fallback:repository' },
			signature: { uri: 'uri:signature', fallbackUri: 'fallback:signature' },
			coreTranslations: []
		});

		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(expected));

		return testObject.queryGallery(CancellationToken.None).then(pagedResponse => {
			assert.strictEqual(1, pagedResponse.firstPage.length);
			const actual = pagedResponse.firstPage[0];

			assert.strictEqual(ExtensionType.User, actual.type);
			assert.strictEqual('expectedName', actual.name);
			assert.strictEqual('expectedDisplayName', actual.displayName);
			assert.strictEqual('expectedpublisher.expectedname', actual.identifier.id);
			assert.strictEqual('expectedPublisher', actual.publisher);
			assert.strictEqual('expectedPublisherDisplayName', actual.publisherDisplayName);
			assert.strictEqual('1.5.0', actual.version);
			assert.strictEqual('1.5.0', actual.latestVersion);
			assert.strictEqual('expectedDescription', actual.description);
			assert.strictEqual('uri:icon', actual.iconUrl);
			assert.strictEqual('fallback:icon', actual.iconUrlFallback);
			assert.strictEqual('uri:license', actual.licenseUrl);
			assert.strictEqual(ExtensionState.Uninstalled, actual.state);
			assert.strictEqual(1000, actual.installCount);
			assert.strictEqual(4, actual.rating);
			assert.strictEqual(100, actual.ratingCount);
			assert.strictEqual(false, actual.outdated);
			assert.deepStrictEqual(['pub.1', 'pub.2'], actual.dependencies);
		});
	});

	test('test for empty installed extensions', async () => {
		testObject = await aWorkbenchService();

		assert.deepStrictEqual([], testObject.local);
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
			type: ExtensionType.User,
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
			type: ExtensionType.System,
			readmeUrl: 'localReadmeUrl2',
			changelogUrl: 'localChangelogUrl2',
		});
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [expected1, expected2]);
		testObject = await aWorkbenchService();

		const actuals = testObject.local;
		assert.strictEqual(2, actuals.length);

		let actual = actuals[0];
		assert.strictEqual(ExtensionType.User, actual.type);
		assert.strictEqual('local1', actual.name);
		assert.strictEqual('localDisplayName1', actual.displayName);
		assert.strictEqual('localpublisher1.local1', actual.identifier.id);
		assert.strictEqual('localPublisher1', actual.publisher);
		assert.strictEqual('1.1.0', actual.version);
		assert.strictEqual('1.1.0', actual.latestVersion);
		assert.strictEqual('localDescription1', actual.description);
		assert.ok(actual.iconUrl === 'file:///localPath1/localIcon1' || actual.iconUrl === 'vscode-file://vscode-app/localPath1/localIcon1');
		assert.ok(actual.iconUrlFallback === undefined);
		assert.strictEqual(undefined, actual.licenseUrl);
		assert.strictEqual(ExtensionState.Installed, actual.state);
		assert.strictEqual(undefined, actual.installCount);
		assert.strictEqual(undefined, actual.rating);
		assert.strictEqual(undefined, actual.ratingCount);
		assert.strictEqual(false, actual.outdated);
		assert.deepStrictEqual(['pub.1', 'pub.2'], actual.dependencies);

		actual = actuals[1];
		assert.strictEqual(ExtensionType.System, actual.type);
		assert.strictEqual('local2', actual.name);
		assert.strictEqual('localDisplayName2', actual.displayName);
		assert.strictEqual('localpublisher2.local2', actual.identifier.id);
		assert.strictEqual('localPublisher2', actual.publisher);
		assert.strictEqual('1.2.0', actual.version);
		assert.strictEqual('1.2.0', actual.latestVersion);
		assert.strictEqual('localDescription2', actual.description);
		assert.strictEqual(undefined, actual.licenseUrl);
		assert.strictEqual(ExtensionState.Installed, actual.state);
		assert.strictEqual(undefined, actual.installCount);
		assert.strictEqual(undefined, actual.rating);
		assert.strictEqual(undefined, actual.ratingCount);
		assert.strictEqual(false, actual.outdated);
		assert.deepStrictEqual([], actual.dependencies);
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
			type: ExtensionType.User,
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
			type: ExtensionType.System,
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
			signature: { uri: 'uri:signature', fallbackUri: 'fallback:signature' },
			coreTranslations: []
		});
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local1, local2]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery1));
		instantiationService.stubPromise(IExtensionGalleryService, 'getCompatibleExtension', gallery1);
		instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', [gallery1]);
		testObject = await aWorkbenchService();
		await testObject.queryLocal();

		return Event.toPromise(testObject.onChange).then(() => {
			const actuals = testObject.local;
			assert.strictEqual(2, actuals.length);

			let actual = actuals[0];
			assert.strictEqual(ExtensionType.User, actual.type);
			assert.strictEqual('local1', actual.name);
			assert.strictEqual('expectedDisplayName', actual.displayName);
			assert.strictEqual('localpublisher1.local1', actual.identifier.id);
			assert.strictEqual('localPublisher1', actual.publisher);
			assert.strictEqual('1.1.0', actual.version);
			assert.strictEqual('1.5.0', actual.latestVersion);
			assert.strictEqual('expectedDescription', actual.description);
			assert.strictEqual('uri:icon', actual.iconUrl);
			assert.strictEqual('fallback:icon', actual.iconUrlFallback);
			assert.strictEqual(ExtensionState.Installed, actual.state);
			assert.strictEqual('uri:license', actual.licenseUrl);
			assert.strictEqual(1000, actual.installCount);
			assert.strictEqual(4, actual.rating);
			assert.strictEqual(100, actual.ratingCount);
			assert.strictEqual(true, actual.outdated);
			assert.deepStrictEqual(['pub.1'], actual.dependencies);

			actual = actuals[1];
			assert.strictEqual(ExtensionType.System, actual.type);
			assert.strictEqual('local2', actual.name);
			assert.strictEqual('localDisplayName2', actual.displayName);
			assert.strictEqual('localpublisher2.local2', actual.identifier.id);
			assert.strictEqual('localPublisher2', actual.publisher);
			assert.strictEqual('1.2.0', actual.version);
			assert.strictEqual('1.2.0', actual.latestVersion);
			assert.strictEqual('localDescription2', actual.description);
			assert.strictEqual(undefined, actual.licenseUrl);
			assert.strictEqual(ExtensionState.Installed, actual.state);
			assert.strictEqual(undefined, actual.installCount);
			assert.strictEqual(undefined, actual.rating);
			assert.strictEqual(undefined, actual.ratingCount);
			assert.strictEqual(false, actual.outdated);
			assert.deepStrictEqual([], actual.dependencies);
		});
	});

	test('test extension state computation', async () => {
		const gallery = aGalleryExtension('gallery1');
		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return testObject.queryGallery(CancellationToken.None).then(page => {
			const extension = page.firstPage[0];
			assert.strictEqual(ExtensionState.Uninstalled, extension.state);

			const identifier = gallery.identifier;

			// Installing
			installEvent.fire({ identifier, source: gallery, profileLocation: null! });
			const local = testObject.local;
			assert.strictEqual(1, local.length);
			const actual = local[0];
			assert.strictEqual(`${gallery.publisher}.${gallery.name}`, actual.identifier.id);
			assert.strictEqual(ExtensionState.Installing, actual.state);

			// Installed
			didInstallEvent.fire([{ identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension(gallery.name, gallery, { identifier }), profileLocation: null! }]);
			assert.strictEqual(ExtensionState.Installed, actual.state);
			assert.strictEqual(1, testObject.local.length);

			testObject.uninstall(actual);

			// Uninstalling
			uninstallEvent.fire({ identifier, profileLocation: null! });
			assert.strictEqual(ExtensionState.Uninstalling, actual.state);

			// Uninstalled
			didUninstallEvent.fire({ identifier, profileLocation: null! });
			assert.strictEqual(ExtensionState.Uninstalled, actual.state);

			assert.strictEqual(0, testObject.local.length);
		});
	});

	test('test extension doesnot show outdated for system extensions', async () => {
		const local = aLocalExtension('a', { version: '1.0.1' }, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension(local.manifest.name, { identifier: local.identifier, version: '1.0.2' })));
		testObject = await aWorkbenchService();
		await testObject.queryLocal();

		assert.ok(!testObject.local[0].outdated);
	});

	test('test canInstall returns false for extensions with out gallery', async () => {
		const local = aLocalExtension('a', { version: '1.0.1' }, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		testObject = await aWorkbenchService();
		const target = testObject.local[0];
		testObject.uninstall(target);
		uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });

		assert.ok(await testObject.canInstall(target) !== true);
	});

	test('test canInstall returns false for a system extension', async () => {
		const local = aLocalExtension('a', { version: '1.0.1' }, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension(local.manifest.name, { identifier: local.identifier })));
		testObject = await aWorkbenchService();
		const target = testObject.local[0];

		assert.ok(await testObject.canInstall(target) !== true);
	});

	test('test canInstall returns true for extensions with gallery', async () => {
		const local = aLocalExtension('a', { version: '1.0.1' }, { type: ExtensionType.User });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const gallery = aGalleryExtension(local.manifest.name, { identifier: local.identifier });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		instantiationService.stubPromise(IExtensionGalleryService, 'getCompatibleExtension', gallery);
		instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', [gallery]);
		testObject = await aWorkbenchService();
		const target = testObject.local[0];

		await Event.toPromise(Event.filter(testObject.onChange, e => !!e?.gallery));
		assert.equal(await testObject.canInstall(target), true);
	});

	test('test onchange event is triggered while installing', async () => {
		const gallery = aGalleryExtension('gallery1');
		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const page = await testObject.queryGallery(CancellationToken.None);
		const extension = page.firstPage[0];
		assert.strictEqual(ExtensionState.Uninstalled, extension.state);

		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		const promise = Event.toPromise(testObject.onChange);

		// Installed
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension(gallery.name, gallery, gallery), profileLocation: null! }]);

		await promise;
	});

	test('test onchange event is triggered when installation is finished', async () => {
		const gallery = aGalleryExtension('gallery1');
		testObject = await aWorkbenchService();
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const target = sinon.spy();

		return testObject.queryGallery(CancellationToken.None).then(page => {
			const extension = page.firstPage[0];
			assert.strictEqual(ExtensionState.Uninstalled, extension.state);

			disposableStore.add(testObject.onChange(target));

			// Installing
			installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });

			assert.ok(target.calledOnce);
		});
	});

	test('test onchange event is triggered while uninstalling', async () => {
		const local = aLocalExtension('a', {}, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		testObject = await aWorkbenchService();
		const target = sinon.spy();

		testObject.uninstall(testObject.local[0]);
		disposableStore.add(testObject.onChange(target));
		uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });

		assert.ok(target.calledOnce);
	});

	test('test onchange event is triggered when uninstalling is finished', async () => {
		const local = aLocalExtension('a', {}, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		testObject = await aWorkbenchService();
		const target = sinon.spy();

		testObject.uninstall(testObject.local[0]);
		uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		disposableStore.add(testObject.onChange(target));
		didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });

		assert.ok(target.calledOnce);
	});

	test('test uninstalled extensions are always enabled', async () => {
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], EnablementState.DisabledWorkspace))
			.then(async () => {
				testObject = await aWorkbenchService();
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a')));
				return testObject.queryGallery(CancellationToken.None).then(pagedResponse => {
					const actual = pagedResponse.firstPage[0];
					assert.strictEqual(actual.enablementState, EnablementState.EnabledGlobally);
				});
			});
	});

	test('test enablement state installed enabled extension', async () => {
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], EnablementState.DisabledWorkspace))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a')]);
				testObject = await aWorkbenchService();

				const actual = testObject.local[0];

				assert.strictEqual(actual.enablementState, EnablementState.EnabledGlobally);
			});
	});

	test('test workspace disabled extension', async () => {
		const extensionA = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('d')], EnablementState.DisabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.DisabledWorkspace))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('e')], EnablementState.DisabledWorkspace))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA]);
				testObject = await aWorkbenchService();

				const actual = testObject.local[0];

				assert.strictEqual(actual.enablementState, EnablementState.DisabledWorkspace);
			});
	});

	test('test globally disabled extension', async () => {
		const localExtension = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localExtension], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('d')], EnablementState.DisabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], EnablementState.DisabledWorkspace))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localExtension]);
				testObject = await aWorkbenchService();

				const actual = testObject.local[0];

				assert.strictEqual(actual.enablementState, EnablementState.DisabledGlobally);
			});
	});

	test('test enablement state is updated for user extensions', async () => {
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], EnablementState.DisabledWorkspace))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a')]);
				testObject = await aWorkbenchService();
				return testObject.setEnablement(testObject.local[0], EnablementState.DisabledWorkspace)
					.then(() => {
						const actual = testObject.local[0];
						assert.strictEqual(actual.enablementState, EnablementState.DisabledWorkspace);
					});
			});
	});

	test('test enable extension globally when extension is disabled for workspace', async () => {
		const localExtension = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localExtension], EnablementState.DisabledWorkspace)
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localExtension]);
				testObject = await aWorkbenchService();
				return testObject.setEnablement(testObject.local[0], EnablementState.EnabledGlobally)
					.then(() => {
						const actual = testObject.local[0];
						assert.strictEqual(actual.enablementState, EnablementState.EnabledGlobally);
					});
			});
	});

	test('test disable extension globally', async () => {
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a')]);
		testObject = await aWorkbenchService();

		return testObject.setEnablement(testObject.local[0], EnablementState.DisabledGlobally)
			.then(() => {
				const actual = testObject.local[0];
				assert.strictEqual(actual.enablementState, EnablementState.DisabledGlobally);
			});
	});

	test('test system extensions can be disabled', async () => {
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a', {}, { type: ExtensionType.System })]);
		testObject = await aWorkbenchService();

		return testObject.setEnablement(testObject.local[0], EnablementState.DisabledGlobally)
			.then(() => {
				const actual = testObject.local[0];
				assert.strictEqual(actual.enablementState, EnablementState.DisabledGlobally);
			});
	});

	test('test enablement state is updated on change from outside', async () => {
		const localExtension = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], EnablementState.DisabledWorkspace))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localExtension]);
				testObject = await aWorkbenchService();

				return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localExtension], EnablementState.DisabledGlobally)
					.then(() => {
						const actual = testObject.local[0];
						assert.strictEqual(actual.enablementState, EnablementState.DisabledGlobally);
					});
			});
	});

	test('test disable extension with dependencies disable only itself', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.EnabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.EnabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.EnabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.DisabledGlobally)
					.then(() => {
						assert.strictEqual(testObject.local[0].enablementState, EnablementState.DisabledGlobally);
						assert.strictEqual(testObject.local[1].enablementState, EnablementState.EnabledGlobally);
					});
			});
	});

	test('test disable extension pack disables the pack', async () => {
		const extensionA = aLocalExtension('a', { extensionPack: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.EnabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.EnabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.EnabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.DisabledGlobally)
					.then(() => {
						assert.strictEqual(testObject.local[0].enablementState, EnablementState.DisabledGlobally);
						assert.strictEqual(testObject.local[1].enablementState, EnablementState.DisabledGlobally);
					});
			});
	});

	test('test disable extension pack disable all', async () => {
		const extensionA = aLocalExtension('a', { extensionPack: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.EnabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.EnabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.EnabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.DisabledGlobally)
					.then(() => {
						assert.strictEqual(testObject.local[0].enablementState, EnablementState.DisabledGlobally);
						assert.strictEqual(testObject.local[1].enablementState, EnablementState.DisabledGlobally);
					});
			});
	});

	test('test disable extension fails if extension is a dependent of other', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		instantiationService.stub(INotificationService, {
			prompt(severity, message, choices, options) {
				options!.onCancel!();
				return null!;
			}
		});
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.EnabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.EnabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.EnabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();
				return testObject.setEnablement(testObject.local[1], EnablementState.DisabledGlobally).then(() => assert.fail('Should fail'), error => assert.ok(true));
			});
	});

	test('test disable extension disables all dependents when chosen to disable all', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		instantiationService.stub(IDialogService, {
			prompt() {
				return Promise.resolve({ result: true });
			}
		});
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.EnabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.EnabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.EnabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();
				await testObject.setEnablement(testObject.local[1], EnablementState.DisabledGlobally);
				assert.strictEqual(testObject.local[0].enablementState, EnablementState.DisabledGlobally);
				assert.strictEqual(testObject.local[1].enablementState, EnablementState.DisabledGlobally);
			});
	});

	test('test disable extension when extension is part of a pack', async () => {
		const extensionA = aLocalExtension('a', { extensionPack: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.EnabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.EnabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.EnabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();
				return testObject.setEnablement(testObject.local[1], EnablementState.DisabledGlobally)
					.then(() => {
						assert.strictEqual(testObject.local[1].enablementState, EnablementState.DisabledGlobally);
					});
			});
	});

	test('test disable both dependency and dependent do not promot and do not fail', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.EnabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.EnabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.EnabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				const target = sinon.spy();
				testObject = await aWorkbenchService();

				return testObject.setEnablement([testObject.local[1], testObject.local[0]], EnablementState.DisabledGlobally)
					.then(() => {
						assert.ok(!target.called);
						assert.strictEqual(testObject.local[0].enablementState, EnablementState.DisabledGlobally);
						assert.strictEqual(testObject.local[1].enablementState, EnablementState.DisabledGlobally);
					});
			});
	});

	test('test enable both dependency and dependent do not promot and do not fail', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.DisabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.DisabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				const target = sinon.spy();
				testObject = await aWorkbenchService();

				return testObject.setEnablement([testObject.local[1], testObject.local[0]], EnablementState.EnabledGlobally)
					.then(() => {
						assert.ok(!target.called);
						assert.strictEqual(testObject.local[0].enablementState, EnablementState.EnabledGlobally);
						assert.strictEqual(testObject.local[1].enablementState, EnablementState.EnabledGlobally);
					});
			});
	});

	test('test disable extension does not fail if its dependency is a dependent of other but chosen to disable only itself', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.b'] });

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.EnabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.EnabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.EnabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.DisabledGlobally)
					.then(() => {
						assert.strictEqual(testObject.local[0].enablementState, EnablementState.DisabledGlobally);
					});
			});
	});

	test('test disable extension if its dependency is a dependent of other disabled extension', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.b'] });

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.EnabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.EnabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.DisabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.DisabledGlobally)
					.then(() => {
						assert.strictEqual(testObject.local[0].enablementState, EnablementState.DisabledGlobally);
					});
			});
	});

	test('test disable extension if its dependencys dependency is itself', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b', { extensionDependencies: ['pub.a'] });
		const extensionC = aLocalExtension('c');

		instantiationService.stub(INotificationService, {
			prompt(severity, message, choices, options) {
				options!.onCancel!();
				return null!;
			}
		});
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.EnabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.EnabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.EnabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.DisabledGlobally)
					.then(() => assert.fail('An extension with dependent should not be disabled'), () => null);
			});
	});

	test('test disable extension if its dependency is dependent and is disabled', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.b'] });

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.EnabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.DisabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.EnabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);

				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.DisabledGlobally)
					.then(() => assert.strictEqual(testObject.local[0].enablementState, EnablementState.DisabledGlobally));
			});
	});

	test('test disable extension with cyclic dependencies', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b', { extensionDependencies: ['pub.c'] });
		const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.a'] });

		instantiationService.stub(INotificationService, {
			prompt(severity, message, choices, options) {
				options!.onCancel!();
				return null!;
			}
		});
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.EnabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.EnabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.EnabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();
				return testObject.setEnablement(testObject.local[0], EnablementState.DisabledGlobally)
					.then(() => assert.fail('An extension with dependent should not be disabled'), () => null);
			});
	});

	test('test enable extension with dependencies enable all', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.DisabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.DisabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.EnabledGlobally)
					.then(() => {
						assert.strictEqual(testObject.local[0].enablementState, EnablementState.EnabledGlobally);
						assert.strictEqual(testObject.local[1].enablementState, EnablementState.EnabledGlobally);
					});
			});
	});

	test('test enable extension with dependencies does not prompt if dependency is enabled already', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.EnabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.DisabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				const target = sinon.spy();
				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.EnabledGlobally)
					.then(() => {
						assert.ok(!target.called);
						assert.strictEqual(testObject.local[0].enablementState, EnablementState.EnabledGlobally);
					});
			});
	});

	test('test enable extension with dependency does not prompt if both are enabled', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b');
		const extensionC = aLocalExtension('c');

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.DisabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.DisabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
				const target = sinon.spy();
				testObject = await aWorkbenchService();

				return testObject.setEnablement([testObject.local[1], testObject.local[0]], EnablementState.EnabledGlobally)
					.then(() => {
						assert.ok(!target.called);
						assert.strictEqual(testObject.local[0].enablementState, EnablementState.EnabledGlobally);
						assert.strictEqual(testObject.local[1].enablementState, EnablementState.EnabledGlobally);
					});
			});
	});

	test('test enable extension with cyclic dependencies', async () => {
		const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aLocalExtension('b', { extensionDependencies: ['pub.c'] });
		const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.a'] });

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], EnablementState.DisabledGlobally))
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], EnablementState.DisabledGlobally))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);

				testObject = await aWorkbenchService();

				return testObject.setEnablement(testObject.local[0], EnablementState.EnabledGlobally)
					.then(() => {
						assert.strictEqual(testObject.local[0].enablementState, EnablementState.EnabledGlobally);
						assert.strictEqual(testObject.local[1].enablementState, EnablementState.EnabledGlobally);
						assert.strictEqual(testObject.local[2].enablementState, EnablementState.EnabledGlobally);
					});
			});
	});

	test('test change event is fired when disablement flags are changed', async () => {
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], EnablementState.DisabledWorkspace))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a')]);
				testObject = await aWorkbenchService();
				const target = sinon.spy();
				disposableStore.add(testObject.onChange(target));

				return testObject.setEnablement(testObject.local[0], EnablementState.DisabledGlobally)
					.then(() => assert.ok(target.calledOnce));
			});
	});

	test('test change event is fired when disablement flags are changed from outside', async () => {
		const localExtension = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], EnablementState.DisabledWorkspace))
			.then(async () => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localExtension]);
				testObject = await aWorkbenchService();
				const target = sinon.spy();
				disposableStore.add(testObject.onChange(target));

				return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localExtension], EnablementState.DisabledGlobally)
					.then(() => assert.ok(target.calledOnce));
			});
	});

	test('test updating an extension does not re-eanbles it when disabled globally', async () => {
		testObject = await aWorkbenchService();
		const local = aLocalExtension('pub.a');
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally);
		didInstallEvent.fire([{ local, identifier: local.identifier, operation: InstallOperation.Update, profileLocation: null! }]);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const actual = await testObject.queryLocal();
		assert.strictEqual(actual[0].enablementState, EnablementState.DisabledGlobally);
	});

	test('test updating an extension does not re-eanbles it when workspace disabled', async () => {
		testObject = await aWorkbenchService();
		const local = aLocalExtension('pub.a');
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace);
		didInstallEvent.fire([{ local, identifier: local.identifier, operation: InstallOperation.Update, profileLocation: null! }]);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const actual = await testObject.queryLocal();
		assert.strictEqual(actual[0].enablementState, EnablementState.DisabledWorkspace);
	});

	test('test user extension is preferred when the same extension exists as system and user extension', async () => {
		testObject = await aWorkbenchService();
		const userExtension = aLocalExtension('pub.a');
		const systemExtension = aLocalExtension('pub.a', {}, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [systemExtension, userExtension]);

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, userExtension);
	});

	test('test user extension is disabled when the same extension exists as system and user extension and system extension is disabled', async () => {
		testObject = await aWorkbenchService();
		const systemExtension = aLocalExtension('pub.a', {}, { type: ExtensionType.System });
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([systemExtension], EnablementState.DisabledGlobally);
		const userExtension = aLocalExtension('pub.a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [systemExtension, userExtension]);

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, userExtension);
		assert.strictEqual(actual[0].enablementState, EnablementState.DisabledGlobally);
	});

	test('Test local ui extension is chosen if it exists only in local server', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['ui'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test local workspace extension is chosen if it exists only in local server', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['workspace'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test local web extension is chosen if it exists only in local server', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['web'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test local ui,workspace extension is chosen if it exists only in local server', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['ui', 'workspace'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test local workspace,ui extension is chosen if it exists only in local server', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['workspace', 'ui'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test local ui,workspace,web extension is chosen if it exists only in local server', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['ui', 'workspace', 'web'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test local ui,web,workspace extension is chosen if it exists only in local server', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['ui', 'web', 'workspace'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test local web,ui,workspace extension is chosen if it exists only in local server', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['web', 'ui', 'workspace'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test local web,workspace,ui extension is chosen if it exists only in local server', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['web', 'workspace', 'ui'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test local workspace,web,ui extension is chosen if it exists only in local server', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['workspace', 'web', 'ui'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test local workspace,ui,web extension is chosen if it exists only in local server', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['workspace', 'ui', 'web'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test local UI extension is chosen if it exists in both servers', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['ui'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
		const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test local ui,workspace extension is chosen if it exists in both servers', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['ui', 'workspace'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
		const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test remote workspace extension is chosen if it exists in remote server', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['workspace'];
		const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, remoteExtension);
	});

	test('Test remote workspace extension is chosen if it exists in both servers', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['workspace'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
		const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, remoteExtension);
	});

	test('Test remote workspace extension is chosen if it exists in both servers and local is disabled', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['workspace'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
		const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([remoteExtension], EnablementState.DisabledGlobally);
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, remoteExtension);
		assert.strictEqual(actual[0].enablementState, EnablementState.DisabledGlobally);
	});

	test('Test remote workspace extension is chosen if it exists in both servers and remote is disabled in workspace', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['workspace'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
		const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([remoteExtension], EnablementState.DisabledWorkspace);
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, remoteExtension);
		assert.strictEqual(actual[0].enablementState, EnablementState.DisabledWorkspace);
	});

	test('Test local ui, workspace extension is chosen if it exists in both servers and local is disabled', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['ui', 'workspace'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
		const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localExtension], EnablementState.DisabledGlobally);
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
		assert.strictEqual(actual[0].enablementState, EnablementState.DisabledGlobally);
	});

	test('Test local ui, workspace extension is chosen if it exists in both servers and local is disabled in workspace', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['ui', 'workspace'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
		const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localExtension], EnablementState.DisabledWorkspace);
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
		assert.strictEqual(actual[0].enablementState, EnablementState.DisabledWorkspace);
	});

	test('Test local web extension is chosen if it exists in both servers', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['web'];
		const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
		const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, localExtension);
	});

	test('Test remote web extension is chosen if it exists only in remote', async () => {
		// multi server setup
		const extensionKind: ExtensionKind[] = ['web'];
		const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });

		const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([]), createExtensionManagementService([remoteExtension]));
		instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		testObject = await aWorkbenchService();

		const actual = await testObject.queryLocal();

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(actual[0].local, remoteExtension);
	});

	test('Test disable autoupdate for extension when auto update is enabled for all', async () => {
		const extension1 = aLocalExtension('a');
		const extension2 = aLocalExtension('b');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
		instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local: Mutable<ILocalExtension>, metadata: Partial<Metadata>) => {
			local.pinned = !!metadata.pinned;
			return local;
		});
		testObject = await aWorkbenchService();

		assert.strictEqual(testObject.local[0].local?.pinned, undefined);
		assert.strictEqual(testObject.local[1].local?.pinned, undefined);

		await testObject.updateAutoUpdateEnablementFor(testObject.local[0], false);

		assert.strictEqual(testObject.local[0].local?.pinned, undefined);
		assert.strictEqual(testObject.local[1].local?.pinned, undefined);

		assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
		assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), ['pub.a']);
	});

	test('Test disable autoupdate for extension when auto update is enabled for enabled extensions', async () => {
		stubConfiguration('onlyEnabledExtensions');

		const extension1 = aLocalExtension('a');
		const extension2 = aLocalExtension('b');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
		instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local: Mutable<ILocalExtension>, metadata: Partial<Metadata>) => {
			local.pinned = !!metadata.pinned;
			return local;
		});
		testObject = await aWorkbenchService();

		assert.strictEqual(testObject.local[0].local?.pinned, undefined);
		assert.strictEqual(testObject.local[1].local?.pinned, undefined);

		await testObject.updateAutoUpdateEnablementFor(testObject.local[0], false);

		assert.strictEqual(testObject.local[0].local?.pinned, undefined);
		assert.strictEqual(testObject.local[1].local?.pinned, undefined);

		assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
		assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), ['pub.a']);
	});

	test('Test enable autoupdate for extension when auto update is enabled for all', async () => {
		const extension1 = aLocalExtension('a');
		const extension2 = aLocalExtension('b');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
		instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local: Mutable<ILocalExtension>, metadata: Partial<Metadata>) => {
			local.pinned = !!metadata.pinned;
			return local;
		});
		testObject = await aWorkbenchService();

		assert.strictEqual(testObject.local[0].local?.pinned, undefined);
		assert.strictEqual(testObject.local[1].local?.pinned, undefined);

		await testObject.updateAutoUpdateEnablementFor(testObject.local[0], false);
		await testObject.updateAutoUpdateEnablementFor(testObject.local[0], true);

		assert.strictEqual(testObject.local[0].local?.pinned, undefined);
		assert.strictEqual(testObject.local[1].local?.pinned, undefined);

		assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
		assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), []);
	});

	test('Test enable autoupdate for pinned extension when auto update is enabled', async () => {
		const extension1 = aLocalExtension('a', undefined, { pinned: true });
		const extension2 = aLocalExtension('b');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
		instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local: Mutable<ILocalExtension>, metadata: Partial<Metadata>) => {
			local.pinned = !!metadata.pinned;
			return local;
		});
		testObject = await aWorkbenchService();

		assert.strictEqual(testObject.local[0].local?.pinned, true);
		assert.strictEqual(testObject.local[1].local?.pinned, undefined);

		await testObject.updateAutoUpdateEnablementFor(testObject.local[0], true);

		assert.strictEqual(testObject.local[0].local?.pinned, false);
		assert.strictEqual(testObject.local[1].local?.pinned, undefined);

		assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
		assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), []);
	});

	test('Test updateAutoUpdateEnablementFor throws error when auto update is disabled', async () => {
		stubConfiguration(false);

		const extension1 = aLocalExtension('a');
		const extension2 = aLocalExtension('b');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
		testObject = await aWorkbenchService();

		try {
			await testObject.updateAutoUpdateEnablementFor(testObject.local[0], true);
			assert.fail('error expected');
		} catch (error) {
			// expected
		}
	});

	test('Test updateAutoUpdateEnablementFor throws error for publisher when auto update is enabled', async () => {
		const extension1 = aLocalExtension('a');
		const extension2 = aLocalExtension('b');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
		testObject = await aWorkbenchService();

		try {
			await testObject.updateAutoUpdateEnablementFor(testObject.local[0].publisher, true);
			assert.fail('error expected');
		} catch (error) {
			// expected
		}
	});

	test('Test enable autoupdate for extension when auto update is disabled', async () => {
		stubConfiguration(false);

		const extension1 = aLocalExtension('a', undefined, { pinned: true });
		const extension2 = aLocalExtension('b', undefined, { pinned: true });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
		instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local: Mutable<ILocalExtension>, metadata: Partial<Metadata>) => {
			local.pinned = !!metadata.pinned;
			return local;
		});
		testObject = await aWorkbenchService();

		assert.strictEqual(testObject.local[0].local?.pinned, true);
		assert.strictEqual(testObject.local[1].local?.pinned, true);

		await testObject.updateAutoUpdateEnablementFor(testObject.local[0], true);

		assert.strictEqual(testObject.local[0].local?.pinned, true);
		assert.strictEqual(testObject.local[1].local?.pinned, true);

		assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), ['pub.a']);
		assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), []);
	});

	test('Test reset autoupdate extensions state when auto update is disabled', async () => {
		instantiationService.stub(IDialogService, {
			confirm: () => Promise.resolve({ confirmed: true })
		});

		const extension1 = aLocalExtension('a', undefined, { pinned: true });
		const extension2 = aLocalExtension('b', undefined, { pinned: true });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
		instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local: Mutable<ILocalExtension>, metadata: Partial<Metadata>) => {
			local.pinned = !!metadata.pinned;
			return local;
		});
		testObject = await aWorkbenchService();

		await testObject.updateAutoUpdateEnablementFor(testObject.local[0], false);

		assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
		assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), ['pub.a']);

		await testObject.updateAutoUpdateForAllExtensions(false);

		assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
		assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), []);
	});

	test('Test reset autoupdate extensions state when auto update is enabled', async () => {
		stubConfiguration(false);
		instantiationService.stub(IDialogService, {
			confirm: () => Promise.resolve({ confirmed: true })
		});

		const extension1 = aLocalExtension('a', undefined, { pinned: true });
		const extension2 = aLocalExtension('b', undefined, { pinned: true });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
		instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local: Mutable<ILocalExtension>, metadata: Partial<Metadata>) => {
			local.pinned = !!metadata.pinned;
			return local;
		});
		testObject = await aWorkbenchService();

		await testObject.updateAutoUpdateEnablementFor(testObject.local[0], true);

		assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), ['pub.a']);
		assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), []);

		await testObject.updateAutoUpdateForAllExtensions(true);

		assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
		assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), []);
	});

	async function aWorkbenchService(): Promise<ExtensionsWorkbenchService> {
		const workbenchService: ExtensionsWorkbenchService = disposableStore.add(instantiationService.createInstance(ExtensionsWorkbenchService));
		await workbenchService.queryLocal();
		return workbenchService;
	}

	function stubConfiguration(autoUpdateValue?: any, autoCheckUpdatesValue?: any): void {
		const values: any = {
			[AutoUpdateConfigurationKey]: autoUpdateValue ?? true,
			[AutoCheckUpdatesConfigurationKey]: autoCheckUpdatesValue ?? true
		};
		const emitter = disposableStore.add(new Emitter<IConfigurationChangeEvent>());
		instantiationService.stub(IConfigurationService, {
			onDidChangeConfiguration: emitter.event,
			getValue: (key?: any) => {
				return key ? values[key] : undefined;
			},
			updateValue: async (key: string, value: any) => {
				values[key] = value;
				emitter.fire({
					affectedKeys: new Set([key]),
					source: ConfigurationTarget.USER,
					change: { keys: [], overrides: [] },
					affectsConfiguration(configuration, overrides) {
						return true;
					},
				});
			},
			inspect: (key: string) => {
				return {};
			}
		});
	}

	function aLocalExtension(name: string = 'someext', manifest: any = {}, properties: any = {}): ILocalExtension {
		manifest = { name, publisher: 'pub', version: '1.0.0', ...manifest };
		properties = {
			type: ExtensionType.User,
			location: URI.file(`pub.${name}`),
			identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name) },
			...properties,
			isValid: properties.isValid ?? true,
		};
		return <ILocalExtension>Object.create({ manifest, ...properties });
	}

	const noAssets: IGalleryExtensionAssets = {
		changelog: null,
		download: null!,
		icon: null!,
		license: null,
		manifest: null,
		readme: null,
		repository: null,
		signature: null,
		coreTranslations: []
	};

	function aGalleryExtension(name: string, properties: any = {}, galleryExtensionProperties: any = {}, assets: IGalleryExtensionAssets = noAssets): IGalleryExtension {
		const targetPlatform = getTargetPlatform(platform, arch);
		const galleryExtension = <IGalleryExtension>Object.create({ name, publisher: 'pub', version: '1.0.0', allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, isSigned: true, ...properties });
		galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
		galleryExtension.assets = { ...galleryExtension.assets, ...assets };
		galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
		return <IGalleryExtension>galleryExtension;
	}

	function aPage<T>(...objects: T[]): IPager<T> {
		return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null! };
	}

	function aMultiExtensionManagementServerService(instantiationService: TestInstantiationService, localExtensionManagementService?: IProfileAwareExtensionManagementService, remoteExtensionManagementService?: IProfileAwareExtensionManagementService): IExtensionManagementServerService {
		const localExtensionManagementServer: IExtensionManagementServer = {
			id: 'vscode-local',
			label: 'local',
			extensionManagementService: localExtensionManagementService || createExtensionManagementService(),
		};
		const remoteExtensionManagementServer: IExtensionManagementServer = {
			id: 'vscode-remote',
			label: 'remote',
			extensionManagementService: remoteExtensionManagementService || createExtensionManagementService(),
		};
		return anExtensionManagementServerService(localExtensionManagementServer, remoteExtensionManagementServer, null);
	}

	function createExtensionManagementService(installed: ILocalExtension[] = []): IProfileAwareExtensionManagementService {
		return <IProfileAwareExtensionManagementService>{
			onInstallExtension: Event.None,
			onDidInstallExtensions: Event.None,
			onUninstallExtension: Event.None,
			onDidUninstallExtension: Event.None,
			onDidChangeProfile: Event.None,
			onDidUpdateExtensionMetadata: Event.None,
			onProfileAwareDidInstallExtensions: Event.None,
			getInstalled: () => Promise.resolve<ILocalExtension[]>(installed),
			installFromGallery: (extension: IGalleryExtension) => Promise.reject(new Error('not supported')),
			updateMetadata: async (local: Mutable<ILocalExtension>, metadata: Partial<Metadata>, profileLocation: URI) => {
				local.identifier.uuid = metadata.id;
				local.publisherDisplayName = metadata.publisherDisplayName!;
				local.publisherId = metadata.publisherId!;
				return local;
			},
			getTargetPlatform: async () => getTargetPlatform(platform, arch),
			async getExtensionsControlManifest() { return <IExtensionsControlManifest>{ malicious: [], deprecated: {}, search: [], publisherMapping: {} }; },
			async resetPinnedStateForAllUserExtensions(pinned: boolean) { }
		};
	}
});
