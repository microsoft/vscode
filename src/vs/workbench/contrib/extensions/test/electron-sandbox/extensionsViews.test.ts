/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ExtensionsListView } from '../../browser/extensionsViews.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IExtensionsWorkbenchService } from '../../common/extensions.js';
import { ExtensionsWorkbenchService } from '../../browser/extensionsWorkbenchService.js';
import {
	IExtensionManagementService, IExtensionGalleryService, ILocalExtension, IGalleryExtension, IQueryOptions,
	getTargetPlatform, IExtensionInfo, SortBy
} from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IExtensionManagementServer, IProfileAwareExtensionManagementService, IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionRecommendationsService, ExtensionRecommendationReason } from '../../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { getGalleryExtensionId } from '../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { TestExtensionEnablementService } from '../../../../services/extensionManagement/test/browser/extensionEnablementService.test.js';
import { ExtensionGalleryService } from '../../../../../platform/extensionManagement/common/extensionGalleryService.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { Event } from '../../../../../base/common/event.js';
import { IPager } from '../../../../../base/common/paging.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IExtensionService, toExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { TestMenuService } from '../../../../test/browser/workbenchTestServices.js';
import { TestSharedProcessService } from '../../../../test/electron-sandbox/workbenchTestServices.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { NativeURLService } from '../../../../../platform/url/common/urlService.js';
import { URI } from '../../../../../base/common/uri.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SinonStub } from 'sinon';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { RemoteAgentService } from '../../../../services/remote/electron-sandbox/remoteAgentService.js';
import { ExtensionType, IExtension } from '../../../../../platform/extensions/common/extensions.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-sandbox/services.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { Schemas } from '../../../../../base/common/network.js';
import { platform } from '../../../../../base/common/platform.js';
import { arch } from '../../../../../base/common/process.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUpdateService, State } from '../../../../../platform/update/common/update.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfileService.js';
import { toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';

suite('ExtensionsViews Tests', () => {

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let testableView: ExtensionsListView;

	const localEnabledTheme = aLocalExtension('first-enabled-extension', { categories: ['Themes', 'random'] }, { installedTimestamp: 123456 });
	const localEnabledLanguage = aLocalExtension('second-enabled-extension', { categories: ['Programming languages'], version: '1.0.0' }, { installedTimestamp: Date.now(), updated: false });
	const localDisabledTheme = aLocalExtension('first-disabled-extension', { categories: ['themes'] }, { installedTimestamp: 234567 });
	const localDisabledLanguage = aLocalExtension('second-disabled-extension', { categories: ['programming languages'] }, { installedTimestamp: Date.now() - 50000, updated: true });
	const localRandom = aLocalExtension('random-enabled-extension', { categories: ['random'] }, { installedTimestamp: 345678 });
	const builtInTheme = aLocalExtension('my-theme', { categories: ['Themes'], contributes: { themes: ['my-theme'] } }, { type: ExtensionType.System, installedTimestamp: 222 });
	const builtInBasic = aLocalExtension('my-lang', { categories: ['Programming Languages'], contributes: { grammars: [{ language: 'my-language' }] } }, { type: ExtensionType.System, installedTimestamp: 666666 });

	const galleryEnabledLanguage = aGalleryExtension(localEnabledLanguage.manifest.name, { ...localEnabledLanguage.manifest, version: '1.0.1', identifier: localDisabledLanguage.identifier });

	const workspaceRecommendationA = aGalleryExtension('workspace-recommendation-A');
	const workspaceRecommendationB = aGalleryExtension('workspace-recommendation-B');
	const configBasedRecommendationA = aGalleryExtension('configbased-recommendation-A');
	const configBasedRecommendationB = aGalleryExtension('configbased-recommendation-B');
	const fileBasedRecommendationA = aGalleryExtension('filebased-recommendation-A');
	const fileBasedRecommendationB = aGalleryExtension('filebased-recommendation-B');
	const otherRecommendationA = aGalleryExtension('other-recommendation-A');

	setup(async () => {
		instantiationService = disposableStore.add(new TestInstantiationService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(ILogService, NullLogService);
		instantiationService.stub(IFileService, disposableStore.add(new FileService(new NullLogService())));
		instantiationService.stub(IProductService, {});

		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());

		instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
		instantiationService.stub(ISharedProcessService, TestSharedProcessService);

		instantiationService.stub(IWorkbenchExtensionManagementService, {
			onInstallExtension: Event.None,
			onDidInstallExtensions: Event.None,
			onUninstallExtension: Event.None,
			onDidUninstallExtension: Event.None,
			onDidUpdateExtensionMetadata: Event.None,
			onDidChangeProfile: Event.None,
			async getInstalled() { return []; },
			async getInstalledWorkspaceExtensions() { return []; },
			async canInstall() { return true; },
			async getExtensionsControlManifest() { return { malicious: [], deprecated: {}, search: [] }; },
			async getTargetPlatform() { return getTargetPlatform(platform, arch); },
			async updateMetadata(local) { return local; }
		});
		instantiationService.stub(IRemoteAgentService, RemoteAgentService);
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IMenuService, new TestMenuService());

		const localExtensionManagementServer = { extensionManagementService: instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService, label: 'local', id: 'vscode-local' };
		instantiationService.stub(IExtensionManagementServerService, {
			get localExtensionManagementServer(): IExtensionManagementServer {
				return localExtensionManagementServer;
			},
			getExtensionManagementServer(extension: IExtension): IExtensionManagementServer | null {
				if (extension.location.scheme === Schemas.file) {
					return localExtensionManagementServer;
				}
				throw new Error(`Invalid Extension ${extension.location}`);
			}
		});

		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		instantiationService.stub(IUserDataProfileService, disposableStore.add(new UserDataProfileService(toUserDataProfile('test', 'test', URI.file('foo'), URI.file('cache')))));

		const reasons: { [key: string]: any } = {};
		reasons[workspaceRecommendationA.identifier.id] = { reasonId: ExtensionRecommendationReason.Workspace };
		reasons[workspaceRecommendationB.identifier.id] = { reasonId: ExtensionRecommendationReason.Workspace };
		reasons[fileBasedRecommendationA.identifier.id] = { reasonId: ExtensionRecommendationReason.File };
		reasons[fileBasedRecommendationB.identifier.id] = { reasonId: ExtensionRecommendationReason.File };
		reasons[otherRecommendationA.identifier.id] = { reasonId: ExtensionRecommendationReason.Executable };
		reasons[configBasedRecommendationA.identifier.id] = { reasonId: ExtensionRecommendationReason.WorkspaceConfig };
		instantiationService.stub(IExtensionRecommendationsService, {
			getWorkspaceRecommendations() {
				return Promise.resolve([
					workspaceRecommendationA.identifier.id,
					workspaceRecommendationB.identifier.id]);
			},
			getConfigBasedRecommendations() {
				return Promise.resolve({
					important: [configBasedRecommendationA.identifier.id],
					others: [configBasedRecommendationB.identifier.id],
				});
			},
			getImportantRecommendations(): Promise<string[]> {
				return Promise.resolve([]);
			},
			getFileBasedRecommendations() {
				return [
					fileBasedRecommendationA.identifier.id,
					fileBasedRecommendationB.identifier.id
				];
			},
			getOtherRecommendations() {
				return Promise.resolve([
					configBasedRecommendationB.identifier.id,
					otherRecommendationA.identifier.id
				]);
			},
			getAllRecommendationsWithReason() {
				return reasons;
			}
		});
		instantiationService.stub(IURLService, NativeURLService);

		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localEnabledTheme, localEnabledLanguage, localRandom, localDisabledTheme, localDisabledLanguage, builtInTheme, builtInBasic]);
		instantiationService.stubPromise(IExtensionManagementService, 'getExtensgetExtensionsControlManifestionsReport', {});
		instantiationService.stub(IExtensionGalleryService, 'isEnabled', true);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(galleryEnabledLanguage));
		instantiationService.stubPromise(IExtensionGalleryService, 'getCompatibleExtension', galleryEnabledLanguage);
		instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', [galleryEnabledLanguage]);

		instantiationService.stub(IViewDescriptorService, {
			getViewLocationById(): ViewContainerLocation {
				return ViewContainerLocation.Sidebar;
			},
			onDidChangeLocation: Event.None
		});

		instantiationService.stub(IExtensionService, {
			onDidChangeExtensions: Event.None,
			extensions: [
				toExtensionDescription(localEnabledTheme),
				toExtensionDescription(localEnabledLanguage),
				toExtensionDescription(localRandom),
				toExtensionDescription(builtInTheme),
				toExtensionDescription(builtInBasic)
			],
			canAddExtension: (extension) => true,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		await (<TestExtensionEnablementService>instantiationService.get(IWorkbenchExtensionEnablementService)).setEnablement([localDisabledTheme], EnablementState.DisabledGlobally);
		await (<TestExtensionEnablementService>instantiationService.get(IWorkbenchExtensionEnablementService)).setEnablement([localDisabledLanguage], EnablementState.DisabledGlobally);

		instantiationService.stub(IUpdateService, { onStateChange: Event.None, state: State.Uninitialized });
		instantiationService.set(IExtensionsWorkbenchService, disposableStore.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		testableView = disposableStore.add(instantiationService.createInstance(ExtensionsListView, {}, { id: '', title: '' }));
	});

	test('Test query types', () => {
		assert.strictEqual(ExtensionsListView.isBuiltInExtensionsQuery('@builtin'), true);
		assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery('@installed'), true);
		assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery('@enabled'), true);
		assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery('@disabled'), true);
		assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery('@outdated'), true);
		assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery('@updates'), true);
		assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery('@sort:name'), true);
		assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery('@sort:updateDate'), true);
		assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery('@installed searchText'), true);
		assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery('@enabled searchText'), true);
		assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery('@disabled searchText'), true);
		assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery('@outdated searchText'), true);
		assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery('@updates searchText'), true);
	});

	test('Test empty query equates to sort by install count', () => {
		const target = <SinonStub>instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage());
		return testableView.show('').then(() => {
			assert.ok(target.calledOnce);
			const options: IQueryOptions = target.args[0][0];
			assert.strictEqual(options.sortBy, SortBy.InstallCount);
		});
	});

	test('Test non empty query without sort doesnt use sortBy', () => {
		const target = <SinonStub>instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage());
		return testableView.show('some extension').then(() => {
			assert.ok(target.calledOnce);
			const options: IQueryOptions = target.args[0][0];
			assert.strictEqual(options.sortBy, undefined);
		});
	});

	test('Test query with sort uses sortBy', () => {
		const target = <SinonStub>instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage());
		return testableView.show('some extension @sort:rating').then(() => {
			assert.ok(target.calledOnce);
			const options: IQueryOptions = target.args[0][0];
			assert.strictEqual(options.sortBy, SortBy.WeightedRating);
		});
	});

	test('Test default view actions required sorting', async () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const extension = (await workbenchService.queryLocal()).find(ex => ex.identifier === localEnabledLanguage.identifier);

		await new Promise<void>(c => {
			const disposable = workbenchService.onChange(() => {
				if (extension?.outdated) {
					disposable.dispose();
					c();
				}
			});
			instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		});

		const result = await testableView.show('@installed');
		assert.strictEqual(result.length, 5, 'Unexpected number of results for @installed query');
		const actual = [result.get(0).name, result.get(1).name, result.get(2).name, result.get(3).name, result.get(4).name];
		const expected = [localEnabledLanguage.manifest.name, localEnabledTheme.manifest.name, localRandom.manifest.name, localDisabledTheme.manifest.name, localDisabledLanguage.manifest.name];
		for (let i = 0; i < result.length; i++) {
			assert.strictEqual(actual[i], expected[i], 'Unexpected extension for @installed query with outadted extension.');
		}
	});

	test('Test installed query results', async () => {
		await testableView.show('@installed').then(result => {
			assert.strictEqual(result.length, 5, 'Unexpected number of results for @installed query');
			const actual = [result.get(0).name, result.get(1).name, result.get(2).name, result.get(3).name, result.get(4).name].sort();
			const expected = [localDisabledTheme.manifest.name, localEnabledTheme.manifest.name, localRandom.manifest.name, localDisabledLanguage.manifest.name, localEnabledLanguage.manifest.name];
			for (let i = 0; i < result.length; i++) {
				assert.strictEqual(actual[i], expected[i], 'Unexpected extension for @installed query.');
			}
		});

		await testableView.show('@installed first').then(result => {
			assert.strictEqual(result.length, 2, 'Unexpected number of results for @installed query');
			assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, 'Unexpected extension for @installed query with search text.');
			assert.strictEqual(result.get(1).name, localDisabledTheme.manifest.name, 'Unexpected extension for @installed query with search text.');
		});

		await testableView.show('@disabled').then(result => {
			assert.strictEqual(result.length, 2, 'Unexpected number of results for @disabled query');
			assert.strictEqual(result.get(0).name, localDisabledTheme.manifest.name, 'Unexpected extension for @disabled query.');
			assert.strictEqual(result.get(1).name, localDisabledLanguage.manifest.name, 'Unexpected extension for @disabled query.');
		});

		await testableView.show('@enabled').then(result => {
			assert.strictEqual(result.length, 3, 'Unexpected number of results for @enabled query');
			assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, 'Unexpected extension for @enabled query.');
			assert.strictEqual(result.get(1).name, localRandom.manifest.name, 'Unexpected extension for @enabled query.');
			assert.strictEqual(result.get(2).name, localEnabledLanguage.manifest.name, 'Unexpected extension for @enabled query.');
		});

		await testableView.show('@builtin category:themes').then(result => {
			assert.strictEqual(result.length, 1, 'Unexpected number of results for @builtin category:themes query');
			assert.strictEqual(result.get(0).name, builtInTheme.manifest.name, 'Unexpected extension for @builtin:themes query.');
		});

		await testableView.show('@builtin category:"programming languages"').then(result => {
			assert.strictEqual(result.length, 1, 'Unexpected number of results for @builtin:basics query');
			assert.strictEqual(result.get(0).name, builtInBasic.manifest.name, 'Unexpected extension for @builtin:basics query.');
		});

		await testableView.show('@builtin').then(result => {
			assert.strictEqual(result.length, 2, 'Unexpected number of results for @builtin query');
			assert.strictEqual(result.get(0).name, builtInBasic.manifest.name, 'Unexpected extension for @builtin query.');
			assert.strictEqual(result.get(1).name, builtInTheme.manifest.name, 'Unexpected extension for @builtin query.');
		});

		await testableView.show('@builtin my-theme').then(result => {
			assert.strictEqual(result.length, 1, 'Unexpected number of results for @builtin query');
			assert.strictEqual(result.get(0).name, builtInTheme.manifest.name, 'Unexpected extension for @builtin query.');
		});
	});

	test('Test installed query with category', async () => {
		await testableView.show('@installed category:themes').then(result => {
			assert.strictEqual(result.length, 2, 'Unexpected number of results for @installed query with category');
			assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, 'Unexpected extension for @installed query with category.');
			assert.strictEqual(result.get(1).name, localDisabledTheme.manifest.name, 'Unexpected extension for @installed query with category.');
		});

		await testableView.show('@installed category:"themes"').then(result => {
			assert.strictEqual(result.length, 2, 'Unexpected number of results for @installed query with quoted category');
			assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, 'Unexpected extension for @installed query with quoted category.');
			assert.strictEqual(result.get(1).name, localDisabledTheme.manifest.name, 'Unexpected extension for @installed query with quoted category.');
		});

		await testableView.show('@installed category:"programming languages"').then(result => {
			assert.strictEqual(result.length, 2, 'Unexpected number of results for @installed query with quoted category including space');
			assert.strictEqual(result.get(0).name, localEnabledLanguage.manifest.name, 'Unexpected extension for @installed query with quoted category including space.');
			assert.strictEqual(result.get(1).name, localDisabledLanguage.manifest.name, 'Unexpected extension for @installed query with quoted category inlcuding space.');
		});

		await testableView.show('@installed category:themes category:random').then(result => {
			assert.strictEqual(result.length, 3, 'Unexpected number of results for @installed query with multiple category');
			assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, 'Unexpected extension for @installed query with multiple category.');
			assert.strictEqual(result.get(1).name, localRandom.manifest.name, 'Unexpected extension for @installed query with multiple category.');
			assert.strictEqual(result.get(2).name, localDisabledTheme.manifest.name, 'Unexpected extension for @installed query with multiple category.');
		});

		await testableView.show('@enabled category:themes').then(result => {
			assert.strictEqual(result.length, 1, 'Unexpected number of results for @enabled query with category');
			assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, 'Unexpected extension for @enabled query with category.');
		});

		await testableView.show('@enabled category:"themes"').then(result => {
			assert.strictEqual(result.length, 1, 'Unexpected number of results for @enabled query with quoted category');
			assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, 'Unexpected extension for @enabled query with quoted category.');
		});

		await testableView.show('@enabled category:"programming languages"').then(result => {
			assert.strictEqual(result.length, 1, 'Unexpected number of results for @enabled query with quoted category inlcuding space');
			assert.strictEqual(result.get(0).name, localEnabledLanguage.manifest.name, 'Unexpected extension for @enabled query with quoted category including space.');
		});

		await testableView.show('@disabled category:themes').then(result => {
			assert.strictEqual(result.length, 1, 'Unexpected number of results for @disabled query with category');
			assert.strictEqual(result.get(0).name, localDisabledTheme.manifest.name, 'Unexpected extension for @disabled query with category.');
		});

		await testableView.show('@disabled category:"themes"').then(result => {
			assert.strictEqual(result.length, 1, 'Unexpected number of results for @disabled query with quoted category');
			assert.strictEqual(result.get(0).name, localDisabledTheme.manifest.name, 'Unexpected extension for @disabled query with quoted category.');
		});

		await testableView.show('@disabled category:"programming languages"').then(result => {
			assert.strictEqual(result.length, 1, 'Unexpected number of results for @disabled query with quoted category inlcuding space');
			assert.strictEqual(result.get(0).name, localDisabledLanguage.manifest.name, 'Unexpected extension for @disabled query with quoted category including space.');
		});
	});

	test('Test local query with sorting order', async () => {
		await testableView.show('@recentlyUpdated').then(result => {
			assert.strictEqual(result.length, 1, 'Unexpected number of results for @recentlyUpdated');
			assert.strictEqual(result.get(0).name, localDisabledLanguage.manifest.name, 'Unexpected default sort order of extensions for @recentlyUpdate query');
		});

		await testableView.show('@installed @sort:updateDate').then(result => {
			assert.strictEqual(result.length, 5, 'Unexpected number of results for @sort:updateDate. Expected all localy installed Extension which are not builtin');
			const actual = [result.get(0).local?.installedTimestamp, result.get(1).local?.installedTimestamp, result.get(2).local?.installedTimestamp, result.get(3).local?.installedTimestamp, result.get(4).local?.installedTimestamp];
			const expected = [localEnabledLanguage.installedTimestamp, localDisabledLanguage.installedTimestamp, localRandom.installedTimestamp, localDisabledTheme.installedTimestamp, localEnabledTheme.installedTimestamp];
			for (let i = 0; i < result.length; i++) {
				assert.strictEqual(actual[i], expected[i], 'Unexpected extension sorting for @sort:updateDate query.');
			}
		});
	});

	test('Test @recommended:workspace query', () => {
		const workspaceRecommendedExtensions = [
			workspaceRecommendationA,
			workspaceRecommendationB,
			configBasedRecommendationA,
		];
		const target = <SinonStub>instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', workspaceRecommendedExtensions);

		return testableView.show('@recommended:workspace').then(result => {
			const extensionInfos: IExtensionInfo[] = target.args[0][0];
			assert.strictEqual(extensionInfos.length, workspaceRecommendedExtensions.length);
			assert.strictEqual(result.length, workspaceRecommendedExtensions.length);
			for (let i = 0; i < workspaceRecommendedExtensions.length; i++) {
				assert.strictEqual(extensionInfos[i].id, workspaceRecommendedExtensions[i].identifier.id);
				assert.strictEqual(result.get(i).identifier.id, workspaceRecommendedExtensions[i].identifier.id);
			}
		});
	});

	test('Test @recommended query', () => {
		const allRecommendedExtensions = [
			fileBasedRecommendationA,
			fileBasedRecommendationB,
			configBasedRecommendationB,
			otherRecommendationA
		];
		const target = <SinonStub>instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', allRecommendedExtensions);

		return testableView.show('@recommended').then(result => {
			const extensionInfos: IExtensionInfo[] = target.args[0][0];

			assert.strictEqual(extensionInfos.length, allRecommendedExtensions.length);
			assert.strictEqual(result.length, allRecommendedExtensions.length);
			for (let i = 0; i < allRecommendedExtensions.length; i++) {
				assert.strictEqual(extensionInfos[i].id, allRecommendedExtensions[i].identifier.id);
				assert.strictEqual(result.get(i).identifier.id, allRecommendedExtensions[i].identifier.id);
			}
		});
	});


	test('Test @recommended:all query', () => {
		const allRecommendedExtensions = [
			workspaceRecommendationA,
			workspaceRecommendationB,
			configBasedRecommendationA,
			fileBasedRecommendationA,
			fileBasedRecommendationB,
			configBasedRecommendationB,
			otherRecommendationA,
		];
		const target = <SinonStub>instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', allRecommendedExtensions);

		return testableView.show('@recommended:all').then(result => {
			const extensionInfos: IExtensionInfo[] = target.args[0][0];

			assert.strictEqual(extensionInfos.length, allRecommendedExtensions.length);
			assert.strictEqual(result.length, allRecommendedExtensions.length);
			for (let i = 0; i < allRecommendedExtensions.length; i++) {
				assert.strictEqual(extensionInfos[i].id, allRecommendedExtensions[i].identifier.id);
				assert.strictEqual(result.get(i).identifier.id, allRecommendedExtensions[i].identifier.id);
			}
		});
	});

	test('Test search', () => {
		const searchText = 'search-me';
		const results = [
			fileBasedRecommendationA,
			workspaceRecommendationA,
			otherRecommendationA,
			workspaceRecommendationB
		];
		const queryTarget = <SinonStub>instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(...results));
		return testableView.show('search-me').then(result => {
			const options: IQueryOptions = queryTarget.args[0][0];

			assert.ok(queryTarget.calledOnce);
			assert.strictEqual(options.text, searchText);
			assert.strictEqual(result.length, results.length);
			for (let i = 0; i < results.length; i++) {
				assert.strictEqual(result.get(i).identifier.id, results[i].identifier.id);
			}
		});
	});

	test('Test preferred search experiment', () => {
		const searchText = 'search-me';
		const actual = [
			fileBasedRecommendationA,
			workspaceRecommendationA,
			otherRecommendationA,
			workspaceRecommendationB
		];
		const expected = [
			workspaceRecommendationA,
			workspaceRecommendationB,
			fileBasedRecommendationA,
			otherRecommendationA
		];

		const queryTarget = <SinonStub>instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(...actual));
		const experimentTarget = <SinonStub>instantiationService.stubPromise(IWorkbenchExtensionManagementService, 'getExtensionsControlManifest', {
			malicious: [], deprecated: {},
			search: [{
				query: 'search-me',
				preferredResults: [
					workspaceRecommendationA.identifier.id,
					'something-that-wasnt-in-first-page',
					workspaceRecommendationB.identifier.id
				]
			}]
		});

		return testableView.show('search-me').then(result => {
			const options: IQueryOptions = queryTarget.args[0][0];

			assert.ok(experimentTarget.calledTwice);
			assert.ok(queryTarget.calledOnce);
			assert.strictEqual(options.text, searchText);
			assert.strictEqual(result.length, expected.length);
			for (let i = 0; i < expected.length; i++) {
				assert.strictEqual(result.get(i).identifier.id, expected[i].identifier.id);
			}
		});
	});

	test('Skip preferred search experiment when user defines sort order', () => {
		const searchText = 'search-me';
		const realResults = [
			fileBasedRecommendationA,
			workspaceRecommendationA,
			otherRecommendationA,
			workspaceRecommendationB
		];

		const queryTarget = <SinonStub>instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(...realResults));

		return testableView.show('search-me @sort:installs').then(result => {
			const options: IQueryOptions = queryTarget.args[0][0];

			assert.ok(queryTarget.calledOnce);
			assert.strictEqual(options.text, searchText);
			assert.strictEqual(result.length, realResults.length);
			for (let i = 0; i < realResults.length; i++) {
				assert.strictEqual(result.get(i).identifier.id, realResults[i].identifier.id);
			}
		});
	});

	function aLocalExtension(name: string = 'someext', manifest: any = {}, properties: any = {}): ILocalExtension {
		manifest = { name, publisher: 'pub', version: '1.0.0', ...manifest };
		properties = {
			type: ExtensionType.User,
			location: URI.file(`pub.${name}`),
			identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name) },
			metadata: { id: getGalleryExtensionId(manifest.publisher, manifest.name), publisherId: manifest.publisher, publisherDisplayName: 'somename' },
			...properties,
			isValid: properties.isValid ?? true,
		};
		properties.isBuiltin = properties.type === ExtensionType.System;
		return <ILocalExtension>Object.create({ manifest, ...properties });
	}

	function aGalleryExtension(name: string, properties: any = {}, galleryExtensionProperties: any = {}, assets: any = {}): IGalleryExtension {
		const targetPlatform = getTargetPlatform(platform, arch);
		const galleryExtension = <IGalleryExtension>Object.create({ name, publisher: 'pub', version: '1.0.0', allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, ...properties });
		galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
		galleryExtension.assets = { ...galleryExtension.assets, ...assets };
		galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
		return <IGalleryExtension>galleryExtension;
	}

	function aPage<T>(...objects: T[]): IPager<T> {
		return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null! };
	}

});
