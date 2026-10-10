/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { PagedModel } from '../../../../../base/common/paging.js';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';
import { platform } from '../../../../../base/common/platform.js';
import { arch } from '../../../../../base/common/process.js';
import { timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import * as sinon from 'sinon';
import { ExtensionsListView } from '../../browser/extensionsViews.js';
import { ExtensionsViewPaneContainer } from '../../browser/extensionsViewlet.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IExtensionsWorkbenchService, VIEWLET_ID } from '../../common/extensions.js';
import { ExtensionsWorkbenchService } from '../../browser/extensionsWorkbenchService.js';
import {
	getTargetPlatform, IExtensionGalleryService, IExtensionManagementService, ILocalExtension, InstallExtensionResult, InstallOperation
} from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionGalleryService } from '../../../../../platform/extensionManagement/common/extensionGalleryService.js';
import {
	IWorkbenchExtensionEnablementService, IExtensionManagementServerService, IExtensionManagementServer,
	IProfileAwareExtensionManagementService, IWorkbenchExtensionManagementService
} from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionRecommendationsService } from '../../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { getGalleryExtensionId } from '../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { TestExtensionEnablementService } from '../../../../services/extensionManagement/test/browser/extensionEnablementService.test.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IExtensionService, toExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { TestMenuService } from '../../../../test/browser/workbenchTestServices.js';
import { TestSharedProcessService } from '../../../../test/electron-browser/workbenchTestServices.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { NativeURLService } from '../../../../../platform/url/common/urlService.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { RemoteAgentService } from '../../../../services/remote/electron-browser/remoteAgentService.js';
import { ExtensionType, IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { TestContextService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IViewDescriptorService, ViewContainerLocation, IViewDescriptor, ViewContainer, IViewContainerModel } from '../../../../common/views.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUpdateService, State } from '../../../../../platform/update/common/update.js';
import { IMeteredConnectionService } from '../../../../../platform/meteredConnection/common/meteredConnection.js';
import { ExtensionGalleryManifestStatus, IExtensionGalleryManifestService } from '../../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfileService.js';
import { toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';

suite('Extensions restart-required view (#321178)', () => {

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let testableView: ExtensionsListView;
	let installed: ILocalExtension[];
	let running: IExtensionDescription[];
	let onDidInstallExtensionsEmitter: Emitter<readonly InstallExtensionResult[]>;
	let onRunningExtensionsChangedEmitter: Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>;

	function aLocalExtension(name: string, version: string): ILocalExtension {
		return <ILocalExtension>Object.create({
			manifest: { name, publisher: 'pub', version },
			type: ExtensionType.User,
			location: URI.file(`pub.${name}`),
			identifier: { id: getGalleryExtensionId('pub', name) },
			metadata: { id: getGalleryExtensionId('pub', name), publisherId: 'pub', publisherDisplayName: 'pub' },
			isValid: true,
			isBuiltin: false,
		});
	}

	function installResult(local: ILocalExtension): InstallExtensionResult {
		return {
			identifier: local.identifier,
			operation: InstallOperation.Update,
			local,
			profileLocation: local.location
		};
	}

	/** Simulates an extension update being installed while the previous version is still running. */
	function simulateUpdate(name: string): void {
		installed.push(aLocalExtension(name, '2.0.0'));
		running.push(toExtensionDescription(aLocalExtension(name, '1.0.0')));
		onRunningExtensionsChangedEmitter.fire({ added: [running[running.length - 1]], removed: [] });
		onDidInstallExtensionsEmitter.fire([installResult(installed[installed.length - 1])]);
	}

	setup(async () => {
		instantiationService = disposableStore.add(new TestInstantiationService());
		installed = [];
		running = [];
		onDidInstallExtensionsEmitter = new Emitter<readonly InstallExtensionResult[]>();
		onRunningExtensionsChangedEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();

		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(ILogService, NullLogService);
		instantiationService.stub(IFileService, disposableStore.add(new FileService(new NullLogService())));
		instantiationService.stub(IProductService, {});
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(ISharedProcessService, TestSharedProcessService);

		instantiationService.stub(IExtensionManagementService, {
			onInstallExtension: Event.None,
			onDidInstallExtensions: onDidInstallExtensionsEmitter.event,
			onUninstallExtension: Event.None,
			onDidUninstallExtension: Event.None,
			onDidUpdateExtensionMetadata: Event.None,
			onDidChangeProfile: Event.None,
			onProfileAwareDidInstallExtensions: Event.None,
			async getInstalled() { return installed; },
			async getExtensibilityReport() { return { allowListedApi: [], experimentalApi: [] }; },
			async getExtensionsControlManifest() { return { malicious: [], deprecated: {}, search: [], publisherMapping: {} }; },
			async getTargetPlatform() { return getTargetPlatform(platform, arch); },
			async updateMetadata(local: ILocalExtension) { return local; }
		} as unknown as IProfileAwareExtensionManagementService);

		const localExtensionManagementServer: IExtensionManagementServer = { extensionManagementService: instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService, label: 'local', id: 'vscode-local' };
		instantiationService.stub(IExtensionManagementServerService, {
			get localExtensionManagementServer(): IExtensionManagementServer {
				return localExtensionManagementServer;
			},
			getExtensionManagementServer(extension: { location: URI }): IExtensionManagementServer | null {
				if (extension.location.scheme === Schemas.file) {
					return localExtensionManagementServer;
				}
				throw new Error(`Invalid Extension ${extension.location}`);
			}
		});

		instantiationService.stub(IWorkbenchExtensionManagementService, {
			onInstallExtension: Event.None,
			onDidInstallExtensions: Event.None,
			onUninstallExtension: Event.None,
			onDidUninstallExtension: Event.None,
			onDidUpdateExtensionMetadata: Event.None,
			onDidChangeProfile: Event.None,
			onProfileAwareDidInstallExtensions: Event.None,
			async getInstalled() { return []; },
			async getInstalledWorkspaceExtensions() { return []; },
			async canInstall() { return true; },
			async getExtensionsControlManifest() { return { malicious: [], deprecated: {}, search: [], publisherMapping: {} }; },
			async getTargetPlatform() { return getTargetPlatform(platform, arch); },
			async updateMetadata(local: ILocalExtension) { return local; }
		});
		instantiationService.stub(IRemoteAgentService, RemoteAgentService);
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IMenuService, new TestMenuService());
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		instantiationService.stub(IUserDataProfileService, disposableStore.add(new UserDataProfileService(toUserDataProfile('test', 'test', URI.file('foo'), URI.file('cache')))));
		instantiationService.stub(IExtensionRecommendationsService, {
			getWorkspaceRecommendations: () => Promise.resolve([]),
			getConfigBasedRecommendations: () => Promise.resolve({ important: [], others: [] }),
			getImportantRecommendations: () => Promise.resolve([]),
			getFileBasedRecommendations: () => [],
			getOtherRecommendations: () => Promise.resolve([]),
			getAllRecommendationsWithReason: () => ({})
		});
		instantiationService.stub(IURLService, NativeURLService);
		instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
		instantiationService.stub(IExtensionGalleryManifestService, {
			onDidChangeExtensionGalleryManifest: Event.None,
			onDidChangeExtensionGalleryManifestStatus: Event.None,
			extensionGalleryManifestStatus: ExtensionGalleryManifestStatus.Unavailable,
			async getExtensionGalleryManifest() { return null; }
		});
		instantiationService.stub(IViewDescriptorService, {
			getViewLocationById(): ViewContainerLocation {
				return ViewContainerLocation.Sidebar;
			},
			onDidChangeLocation: Event.None,
			getViewDescriptorById(): IViewDescriptor | null { return null; },
			getViewContainerById: (id: string): ViewContainer | null => id === VIEWLET_ID ? { id, title: { value: 'Extensions', original: 'Extensions' }, ctorDescriptor: new SyncDescriptor(ExtensionsViewPaneContainer) } : null,
			getViewContainerModel: (_viewContainer: ViewContainer): IViewContainerModel => ({ onDidChangeContainerInfo: Event.None, visibleViewDescriptors: [] }) as unknown as IViewContainerModel,
			getViewContainerByViewId: () => null,
			getDefaultContainerById: () => null
		});
		instantiationService.stub(IWorkbenchLayoutService, {});
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({ withProgress: (_options, task) => task({ report() { } }) }));
		instantiationService.stub(IEditorGroupsService, {});
		instantiationService.stub(INotificationService, {});
		instantiationService.stub(IPaneCompositePartService, { onDidPaneCompositeOpen: Event.None });
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IStorageService, disposableStore.add(new TestStorageService()));
		instantiationService.stub(IContextMenuService, {});
		instantiationService.stub(IPreferencesService, {});
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(IOpenerService, {});
		instantiationService.stub(IExtensionService, {
			onDidChangeExtensions: onRunningExtensionsChangedEmitter.event,
			get extensions(): IExtensionDescription[] { return running; },
			canAddExtension: (extension: IExtensionDescription) => extension.identifier.value !== 'pub.restart-a' && extension.identifier.value !== 'pub.restart-b',
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.stub(IUpdateService, { onStateChange: Event.None, state: State.Uninitialized });
		instantiationService.stub(IMeteredConnectionService, { isConnectionMetered: false, onDidChangeIsConnectionMetered: Event.None });
		instantiationService.set(IExtensionsWorkbenchService, disposableStore.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		testableView = disposableStore.add(instantiationService.createInstance(ExtensionsListView, {}, { id: '', title: '' }));
	});

	test('the @restartrequired list updates when more extensions require a restart', async () => {
		// An update for `restart-a` was installed while version 1.0.0 is still running.
		simulateUpdate('restart-a');
		await timeout(200); // let the workbench service settle

		const model = await testableView.show('@restartrequired');
		assert.strictEqual(model.length, 1);
		assert.strictEqual(model.get(0).identifier.id, 'pub.restart-a');

		// Another update (`restart-b`) is installed, its previous version is still running as well.
		simulateUpdate('restart-b');
		await timeout(400); // the view debounces change events before re-filtering

		assert.strictEqual(testableView.count(), 2);
	});

	test('re-running the same query with refresh picks up newly restart-required extensions', async () => {
		simulateUpdate('restart-a');
		await timeout(200); // let the workbench service settle

		const first = await testableView.show('@restartrequired');
		assert.strictEqual(first.length, 1);

		// Another update is installed; re-running the same query with refresh re-queries.
		simulateUpdate('restart-b');
		await timeout(200);

		const refreshed = await testableView.show('@restartrequired', true);
		assert.strictEqual(refreshed.length, 2);
		assert.strictEqual(testableView.count(), 2);
	});

	test('search() with refresh re-runs an already active query (#321178)', () => {
		const viewlet = disposableStore.add(instantiationService.createInstance(ExtensionsViewPaneContainer));
		// The viewlet is not rendered in this test — provide the search box state the "Show" link operates on.
		let searchValue = '@restartrequired';
		const viewletAny = viewlet as unknown as { searchBox: { getValue(): string; setValue(value: string): void } };
		viewletAny.searchBox = {
			getValue: () => searchValue,
			setValue: (value: string) => { searchValue = value; }
		};

		const doSearchStub = sinon.stub(viewlet as unknown as { doSearch: (refresh?: boolean) => Promise<void> }, 'doSearch');
		try {
			// Clicking "Show" while the same query is active must re-run the search...
			viewlet.search('@restartrequired', true);
			assert.ok(doSearchStub.calledOnceWith(true));

			// ...while requesting the same query without refresh stays a no-op.
			doSearchStub.resetHistory();
			viewlet.search('@restartrequired');
			assert.ok(doSearchStub.notCalled);
		} finally {
			doSearchStub.restore();
		}
	});

	test('doSearch forwards the refresh flag to the list views (#321178)', async () => {
		const viewlet = disposableStore.add(instantiationService.createInstance(ExtensionsViewPaneContainer));
		const viewletAny = viewlet as unknown as {
			searchBox: { getValue(): string; setValue(value: string): void };
			paneItems: { pane: ExtensionsListView; disposable: unknown }[];
			doSearch: (refresh?: boolean) => Promise<void>;
		};
		viewletAny.searchBox = { getValue: () => '@restartrequired', setValue: () => { } };
		// Provide a list view so the doSearch -> showExtensionsViews -> view.show chain has a target.
		viewletAny.paneItems.push({ pane: testableView, disposable: toDisposable(() => { }) });

		const showStub = sinon.stub(testableView, 'show').resolves(new PagedModel([]));
		try {
			await viewletAny.doSearch(true);
			assert.ok(showStub.calledOnce);
			assert.strictEqual(showStub.firstCall.args[0], '@restartrequired');
			assert.strictEqual(showStub.firstCall.args[1], true);
		} finally {
			showStub.restore();
		}
	});
});
