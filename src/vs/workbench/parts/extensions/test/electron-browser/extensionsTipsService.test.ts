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
import { IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
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

const expectedWorkspaceRecommendations = [
	'eg2.tslint',
	'dbaeumer.vscode-eslint',
	'msjsdiag.debugger-for-chrome'
];

function setUpFolderWorkspace(folderName: string): TPromise<{ parentDir: string, folderDir: string }> {
	const id = uuid.generateUuid();
	const parentDir = path.join(os.tmpdir(), 'vsctests', id);
	return setUpFolder(folderName, parentDir).then(folderDir => ({ parentDir, folderDir }));
}

function setUpFolder(folderName: string, parentDir: string): TPromise<string> {
	const folderDir = path.join(parentDir, folderName);
	const workspaceSettingsDir = path.join(folderDir, '.vscode');
	return mkdirp(workspaceSettingsDir, 493).then(() => {
		const configPath = path.join(workspaceSettingsDir, 'extensions.json');
		fs.writeFileSync(configPath, JSON.stringify({
			'recommendations': expectedWorkspaceRecommendations
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
		return setUpFolderWorkspace('myFolder').then(({ parentDir, folderDir }) => {
			parentResource = parentDir;
			const myWorkspace = testWorkspace(URI.from({ scheme: 'file', path: folderDir }));
			workspaceService = new TestContextService(myWorkspace);
			instantiationService.stub(IWorkspaceContextService, workspaceService);
			instantiationService.stub(IFileService, new FileService(workspaceService, new TestTextResourceConfigurationService(), new TestConfigurationService(), new TestLifecycleService(), { disableWatcher: true }));

			testObject = instantiationService.createInstance(ExtensionTipsService);

		});
	});

	teardown((done) => {
		(<ExtensionTipsService>testObject).dispose();

		if (parentResource) {
			extfs.del(parentResource, os.tmpdir(), () => { }, done);
		}
	});

	test('test workspace folder recommendations', () => {
		return testObject.getWorkspaceRecommendations().then(recommendations => {
			assert.equal(recommendations.length, expectedWorkspaceRecommendations.length);
			recommendations.forEach(x => assert.equal(expectedWorkspaceRecommendations.indexOf(x) > -1, true));
		});
	});
});