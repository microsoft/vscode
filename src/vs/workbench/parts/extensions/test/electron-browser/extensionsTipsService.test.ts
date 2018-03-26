/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TPromise } from 'vs/base/common/winjs.base';
import * as uuid from 'vs/base/common/uuid';
import { mkdirp } from 'vs/base/node/pfs';
import {
	IExtensionGalleryService, IGalleryExtensionAssets, IGalleryExtension, IExtensionManagementService, LocalExtensionType,
	IExtensionEnablementService, DidInstallExtensionEvent, DidUninstallExtensionEvent, InstallExtensionEvent, IExtensionIdentifier
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionTipsService } from 'vs/workbench/parts/extensions/electron-browser/extensionTipsService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Emitter } from 'vs/base/common/event';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TestTextResourceConfigurationService, TestContextService, TestLifecycleService, TestEnvironmentService, TestNotificationService } from 'vs/workbench/test/workbenchTestServices';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import URI from 'vs/base/common/uri';
import { testWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/workbench/services/files/node/fileService';
import * as extfs from 'vs/base/node/extfs';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IPager } from 'vs/base/common/paging';
import { assign } from 'vs/base/common/objects';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IExtensionsWorkbenchService, ConfigurationKey } from 'vs/workbench/parts/extensions/common/extensions';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/node/extensionsWorkbenchService';
import { TestExtensionEnablementService } from 'vs/platform/extensionManagement/test/common/extensionEnablementService.test';
import { IURLService } from 'vs/platform/url/common/url';
import product from 'vs/platform/node/product';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { URLService } from 'vs/platform/url/common/urlService';

const mockExtensionGallery: IGalleryExtension[] = [
	aGalleryExtension('MockExtension1', {
		displayName: 'Mock Extension 1',
		version: '1.5',
		publisherId: 'mockPublisher1Id',
		publisher: 'mockPublisher1',
		publisherDisplayName: 'Mock Publisher 1',
		description: 'Mock Description',
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
		}),
	aGalleryExtension('MockExtension2', {
		displayName: 'Mock Extension 2',
		version: '1.5',
		publisherId: 'mockPublisher2Id',
		publisher: 'mockPublisher2',
		publisherDisplayName: 'Mock Publisher 2',
		description: 'Mock Description',
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
		})
];

const mockExtensionLocal = [
	{
		type: LocalExtensionType.User,
		identifier: mockExtensionGallery[0].identifier,
		manifest: {
			name: mockExtensionGallery[0].name,
			publisher: mockExtensionGallery[0].publisher,
			version: mockExtensionGallery[0].version
		},
		metadata: null,
		path: 'somepath',
		readmeUrl: 'some readmeUrl',
		changelogUrl: 'some changelogUrl'
	},
	{
		type: LocalExtensionType.User,
		identifier: mockExtensionGallery[1].identifier,
		manifest: {
			name: mockExtensionGallery[1].name,
			publisher: mockExtensionGallery[1].publisher,
			version: mockExtensionGallery[1].version
		},
		metadata: null,
		path: 'somepath',
		readmeUrl: 'some readmeUrl',
		changelogUrl: 'some changelogUrl'
	}
];

const mockTestData = {
	recommendedExtensions: [
		'mockPublisher1.mockExtension1',
		'MOCKPUBLISHER2.mockextension2',
		'badlyformattedextension',
		'MOCKPUBLISHER2.mockextension2',
		'unknown.extension'
	],
	validRecommendedExtensions: [
		'mockPublisher1.mockExtension1',
		'MOCKPUBLISHER2.mockextension2'
	]
};

function aPage<T>(...objects: T[]): IPager<T> {
	return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null };
}

const noAssets: IGalleryExtensionAssets = {
	changelog: null,
	download: null,
	icon: null,
	license: null,
	manifest: null,
	readme: null,
	repository: null
};

function aGalleryExtension(name: string, properties: any = {}, galleryExtensionProperties: any = {}, assets: IGalleryExtensionAssets = noAssets): IGalleryExtension {
	const galleryExtension = <IGalleryExtension>Object.create({});
	assign(galleryExtension, { name, publisher: 'pub', version: '1.0.0', properties: {}, assets: {} }, properties);
	assign(galleryExtension.properties, { dependencies: [] }, galleryExtensionProperties);
	assign(galleryExtension.assets, assets);
	galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: uuid.generateUuid() };
	return <IGalleryExtension>galleryExtension;
}

suite('ExtensionsTipsService Test', () => {
	let workspaceService: IWorkspaceContextService;
	let instantiationService: TestInstantiationService;
	let extensionsWorkbenchService: IExtensionsWorkbenchService;
	let testConfigurationService: TestConfigurationService;
	let testObject: ExtensionTipsService;
	let parentResource: string;
	let installEvent: Emitter<InstallExtensionEvent>,
		didInstallEvent: Emitter<DidInstallExtensionEvent>,
		uninstallEvent: Emitter<IExtensionIdentifier>,
		didUninstallEvent: Emitter<DidUninstallExtensionEvent>;
	let prompted: boolean;
	let onModelAddedEvent: Emitter<ITextModel>;

	suiteSetup(() => {
		instantiationService = new TestInstantiationService();
		installEvent = new Emitter<InstallExtensionEvent>();
		didInstallEvent = new Emitter<DidInstallExtensionEvent>();
		uninstallEvent = new Emitter<IExtensionIdentifier>();
		didUninstallEvent = new Emitter<DidUninstallExtensionEvent>();
		instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
		instantiationService.stub(ILifecycleService, new TestLifecycleService());
		testConfigurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, testConfigurationService);
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(IExtensionManagementService, ExtensionManagementService);
		instantiationService.stub(IExtensionManagementService, 'onInstallExtension', installEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onDidInstallExtension', didInstallEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onUninstallExtension', uninstallEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onDidUninstallExtension', didUninstallEvent.event);
		instantiationService.stub(IExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IURLService, URLService);

		onModelAddedEvent = new Emitter<ITextModel>();

		product.extensionTips = {
			'ms-vscode.csharp': '{**/*.cs,**/project.json,**/global.json,**/*.csproj,**/*.sln,**/appsettings.json}',
			'msjsdiag.debugger-for-chrome': '{**/*.ts,**/*.tsx**/*.js,**/*.jsx,**/*.es6,**/.babelrc}',
			'lukehoban.Go': '**/*.go'
		};
		product.extensionImportantTips = {
			'ms-python.python': {
				'name': 'Python',
				'pattern': '{**/*.py}'
			},
			'ms-vscode.PowerShell': {
				'name': 'PowerShell',
				'pattern': '{**/*.ps,**/*.ps1}'
			}
		};
	});

	setup(() => {
		instantiationService.stub(IEnvironmentService, { extensionDevelopmentPath: false });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', []);
		instantiationService.stub(IExtensionGalleryService, 'isEnabled', true);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage<IGalleryExtension>(...mockExtensionGallery));
		extensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.stub(IExtensionsWorkbenchService, extensionsWorkbenchService);

		prompted = false;

		class TestNotificationService2 extends TestNotificationService {
			public prompt() {
				prompted = true;
				return TPromise.as(3);
			}
		}

		instantiationService.stub(INotificationService, new TestNotificationService2());

		testConfigurationService.setUserConfiguration(ConfigurationKey, { ignoreRecommendations: false, showRecommendationsOnlyOnDemand: false });
		instantiationService.stub(IStorageService, { get: (a, b, c) => c, getBoolean: (a, b, c) => c, store: () => { } });
		instantiationService.stub(IModelService, <IModelService>{
			getModels(): any { return []; },
			onModelAdded: onModelAddedEvent.event
		});
	});

	teardown((done) => {
		(<ExtensionTipsService>testObject).dispose();
		(<ExtensionsWorkbenchService>extensionsWorkbenchService).dispose();
		if (parentResource) {
			extfs.del(parentResource, os.tmpdir(), () => { }, done);
		}
	});

	function setUpFolderWorkspace(folderName: string, recommendedExtensions: string[]): TPromise<void> {
		const id = uuid.generateUuid();
		parentResource = path.join(os.tmpdir(), 'vsctests', id);
		return setUpFolder(folderName, parentResource, recommendedExtensions);
	}

	function setUpFolder(folderName: string, parentDir: string, recommendedExtensions: string[]): TPromise<void> {
		const folderDir = path.join(parentDir, folderName);
		const workspaceSettingsDir = path.join(folderDir, '.vscode');
		return mkdirp(workspaceSettingsDir, 493).then(() => {
			const configPath = path.join(workspaceSettingsDir, 'extensions.json');
			fs.writeFileSync(configPath, JSON.stringify({
				'recommendations': recommendedExtensions
			}, null, '\t'));

			const myWorkspace = testWorkspace(URI.from({ scheme: 'file', path: folderDir }));
			workspaceService = new TestContextService(myWorkspace);
			instantiationService.stub(IWorkspaceContextService, workspaceService);
			instantiationService.stub(IFileService, new FileService(workspaceService, TestEnvironmentService, new TestTextResourceConfigurationService(), new TestConfigurationService(), new TestLifecycleService(), { disableWatcher: true }));
		});
	}

	function testNoPromptForValidRecommendations(recommendations: string[]) {
		return setUpFolderWorkspace('myFolder', recommendations).then(() => {
			testObject = instantiationService.createInstance(ExtensionTipsService);
			return testObject.promptWorkspaceRecommendationsPromise.then(() => {
				assert.equal(Object.keys(testObject.getAllRecommendationsWithReason()).length, recommendations.length);
				assert.ok(!prompted);
			});
		});
	}

	function testNoPromptOrRecommendationsForValidRecommendations(recommendations: string[]) {
		return setUpFolderWorkspace('myFolder', mockTestData.validRecommendedExtensions).then(() => {
			testObject = instantiationService.createInstance(ExtensionTipsService);
			assert.equal(!testObject.promptWorkspaceRecommendationsPromise, true);
			assert.ok(!prompted);

			return testObject.getWorkspaceRecommendations().then(() => {
				assert.equal(Object.keys(testObject.getAllRecommendationsWithReason()).length, 0);
				assert.ok(!prompted);
			});
		});
	}

	test('ExtensionTipsService: No Prompt for valid workspace recommendations when galleryService is absent', () => {
		instantiationService.stub(IExtensionGalleryService, 'isEnabled', false);
		return testNoPromptOrRecommendationsForValidRecommendations(mockTestData.validRecommendedExtensions);
	});

	test('ExtensionTipsService: No Prompt for valid workspace recommendations during extension development', () => {
		instantiationService.stub(IEnvironmentService, { extensionDevelopmentPath: true });
		return testNoPromptOrRecommendationsForValidRecommendations(mockTestData.validRecommendedExtensions);
	});

	test('ExtensionTipsService: No workspace recommendations or prompts when extensions.json has empty array', () => {
		return testNoPromptForValidRecommendations([]);
	});

	test('ExtensionTipsService: Prompt for valid workspace recommendations', () => {
		return setUpFolderWorkspace('myFolder', mockTestData.recommendedExtensions).then(() => {
			testObject = instantiationService.createInstance(ExtensionTipsService);
			return testObject.promptWorkspaceRecommendationsPromise.then(() => {
				const recommendations = Object.keys(testObject.getAllRecommendationsWithReason());

				assert.equal(recommendations.length, mockTestData.validRecommendedExtensions.length);
				mockTestData.validRecommendedExtensions.forEach(x => {
					assert.equal(recommendations.indexOf(x.toLowerCase()) > -1, true);
				});

				assert.ok(prompted);
			});
		});
	});

	test('ExtensionTipsService: No Prompt for valid workspace recommendations if they are already installed', () => {
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', mockExtensionLocal);
		return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions);
	});

	test('ExtensionTipsService: No Prompt for valid workspace recommendations with casing mismatch if they are already installed', () => {
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', mockExtensionLocal);
		return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions.map(x => x.toUpperCase()));
	});

	test('ExtensionTipsService: No Prompt for valid workspace recommendations if ignoreRecommendations is set', () => {
		testConfigurationService.setUserConfiguration(ConfigurationKey, { ignoreRecommendations: true });
		return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions);
	});

	test('ExtensionTipsService: No Prompt for valid workspace recommendations if showRecommendationsOnlyOnDemand is set', () => {
		testConfigurationService.setUserConfiguration(ConfigurationKey, { showRecommendationsOnlyOnDemand: true });
		return setUpFolderWorkspace('myFolder', mockTestData.validRecommendedExtensions).then(() => {
			testObject = instantiationService.createInstance(ExtensionTipsService);
			return testObject.promptWorkspaceRecommendationsPromise.then(() => {
				assert.equal(Object.keys(testObject.getAllRecommendationsWithReason()).length, 0);
				assert.ok(!prompted);
			});
		});
	});

	test('ExtensionTipsService: No Prompt for valid workspace recommendations if ignoreRecommendations is set for current workspace', () => {
		instantiationService.stub(IStorageService, { get: (a, b, c) => c, getBoolean: (a, b, c) => a === 'extensionsAssistant/workspaceRecommendationsIgnore' || c });
		return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions);
	});

	test('ExtensionTipsService: Get file based recommendations from storage (old format)', () => {
		const storedRecommendations = '["ms-vscode.csharp", "ms-python.python", "eg2.tslint"]';
		instantiationService.stub(IStorageService, { get: (a, b, c) => a === 'extensionsAssistant/recommendations' ? storedRecommendations : c });

		return setUpFolderWorkspace('myFolder', []).then(() => {
			testObject = instantiationService.createInstance(ExtensionTipsService);
			const recommendations = testObject.getFileBasedRecommendations();
			assert.equal(recommendations.length, 2);
			assert.ok(recommendations.indexOf('ms-vscode.csharp') > -1); // stored recommendation that exists in product.extensionTips
			assert.ok(recommendations.indexOf('ms-python.python') > -1); // stored recommendation that exists in product.extensionImportantTips
			assert.ok(recommendations.indexOf('eg2.tslint') === -1); // stored recommendation that is no longer in neither product.extensionTips nor product.extensionImportantTips
		});
	});

	test('ExtensionTipsService: Get file based recommendations from storage (new format)', () => {
		const milliSecondsInADay = 1000 * 60 * 60 * 24;
		const now = Date.now();
		const tenDaysOld = 10 * milliSecondsInADay;
		const storedRecommendations = `{"ms-vscode.csharp": ${now}, "ms-python.python": ${now}, "eg2.tslint": ${now}, "lukehoban.Go": ${tenDaysOld}}`;
		instantiationService.stub(IStorageService, { get: (a, b, c) => a === 'extensionsAssistant/recommendations' ? storedRecommendations : c });

		return setUpFolderWorkspace('myFolder', []).then(() => {
			testObject = instantiationService.createInstance(ExtensionTipsService);
			const recommendations = testObject.getFileBasedRecommendations();
			assert.equal(recommendations.length, 2);
			assert.ok(recommendations.indexOf('ms-vscode.csharp') > -1); // stored recommendation that exists in product.extensionTips
			assert.ok(recommendations.indexOf('ms-python.python') > -1); // stored recommendation that exists in product.extensionImportantTips
			assert.ok(recommendations.indexOf('eg2.tslint') === -1); // stored recommendation that is no longer in neither product.extensionTips nor product.extensionImportantTips
			assert.ok(recommendations.indexOf('lukehoban.Go') === -1); //stored recommendation that is older than a week
		});
	});
});
