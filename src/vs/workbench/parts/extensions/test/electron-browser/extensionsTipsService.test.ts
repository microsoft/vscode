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
import uuid = require('vs/base/common/uuid');
import { mkdirp } from 'vs/base/node/pfs';
import { IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService, IGalleryExtensionAssets, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionTipsService } from 'vs/workbench/parts/extensions/electron-browser/extensionTipsService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Emitter } from 'vs/base/common/event';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TestTextResourceConfigurationService, TestContextService, TestLifecycleService } from 'vs/workbench/test/workbenchTestServices';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IModel } from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Model as EditorModel } from 'vs/editor/common/model/model';
import URI from 'vs/base/common/uri';
import { testWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/workbench/services/files/node/fileService';
import extfs = require('vs/base/node/extfs');
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IPager } from 'vs/base/common/paging';
import { assign } from 'vs/base/common/objects';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { generateUuid } from 'vs/base/common/uuid';

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

const mockTestFull = {
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

const mockTestEmpty = {
	recommendedExtensions: [],
	validRecommendedExtensions: []
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
	galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
	return <IGalleryExtension>galleryExtension;
}

function setUpFolderWorkspace(folderName: string, recommendedExtensions: string[]): TPromise<{ parentDir: string, folderDir: string }> {
	const id = uuid.generateUuid();
	const parentDir = path.join(os.tmpdir(), 'vsctests', id);
	return setUpFolder(folderName, parentDir, recommendedExtensions).then(folderDir => ({ parentDir, folderDir }));
}

function setUpFolder(folderName: string, parentDir: string, recommendedExtensions: string[]): TPromise<string> {
	const folderDir = path.join(parentDir, folderName);
	const workspaceSettingsDir = path.join(folderDir, '.vscode');
	return mkdirp(workspaceSettingsDir, 493).then(() => {
		const configPath = path.join(workspaceSettingsDir, 'extensions.json');
		fs.writeFileSync(configPath, JSON.stringify({
			'recommendations': recommendedExtensions
		}, null, '\t'));
		return folderDir;
	});
}

suite('ExtensionsTipsService Test', () => {
	let workspaceService: IWorkspaceContextService;
	let instantiationService: TestInstantiationService;
	let testObject: IExtensionTipsService;
	let parentResource: string;
	let onModelAddedEvent: Emitter<IModel>;
	const model: IModel = EditorModel.createFromString(
		[
			'This is the first line',
			'This is the second line',
			'This is the third line',
		].join('\n'),
		undefined,
		undefined,
		URI.parse('far://testing/file.b'));

	suiteSetup(() => {

		onModelAddedEvent = new Emitter<IModel>();
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IModelService, <IModelService>{
			_serviceBrand: IModelService,
			getModel(): any { return model; },
			createModel(): any { throw new Error(); },
			updateModel(): any { throw new Error(); },
			setMode(): any { throw new Error(); },
			destroyModel(): any { throw new Error(); },
			getModels(): any { throw new Error(); },
			onModelAdded: onModelAddedEvent.event,
			onModelModeChanged: undefined,
			onModelRemoved: undefined,
			getCreationOptions(): any { throw new Error(); }
		});
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
		instantiationService.stub(IConfigurationService, { onDidUpdateConfiguration: () => { }, onDidChangeConfiguration: () => { }, getConfiguration: () => ({}) });
		instantiationService.stub(IExtensionManagementService, ExtensionManagementService);

	});

	setup(() => {
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage<IGalleryExtension>(...mockExtensionGallery));
	});

	teardown((done) => {
		(<ExtensionTipsService>testObject).dispose();

		if (parentResource) {
			extfs.del(parentResource, os.tmpdir(), () => { }, done);
		}
	});

	function runTestCase(testCase): TPromise<void> {
		return setUpFolderWorkspace('myFolder', testCase.recommendedExtensions).then(({ parentDir, folderDir }) => {
			parentResource = parentDir;
			const myWorkspace = testWorkspace(URI.from({ scheme: 'file', path: folderDir }));
			workspaceService = new TestContextService(myWorkspace);
			instantiationService.stub(IWorkspaceContextService, workspaceService);
			instantiationService.stub(IFileService, new FileService(workspaceService, new TestTextResourceConfigurationService(), new TestConfigurationService(), new TestLifecycleService(), { disableWatcher: true }));
			testObject = instantiationService.createInstance(ExtensionTipsService);
		}).then(() => {
			return testObject.getWorkspaceRecommendations();
		}).then(recommendations => {
			assert.equal(recommendations.length, testCase.validRecommendedExtensions.length);
			let lowerRecommendations = recommendations.map(x => x.toLowerCase());
			let lowerValidRecommendations = testCase.validRecommendedExtensions.map(x => x.toLowerCase());

			lowerRecommendations.forEach(x => {
				assert.equal(lowerValidRecommendations.indexOf(x) > -1, true);
			});
		});
	}

	test('test workspace folder recommendations', () => {
		return runTestCase(mockTestFull);
	});

	test('test workspace folder recommendations with empty array', () => {
		return runTestCase(mockTestEmpty);
	});
});