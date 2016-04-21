/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ITelemetryService, NullTelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IEventService} from 'vs/platform/event/common/event';
import {IMessageService} from 'vs/platform/message/common/message';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ILifecycleService, NullLifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IFileService} from 'vs/platform/files/common/files';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {TestFileService, TestPartService, TestEditorService, TestConfigurationService, TestUntitledEditorService, TestStorageService, TestContextService, TestMessageService, TestEventService} from 'vs/workbench/test/browser/servicesTestUtils';
import {WorkingFileEntry, WorkingFilesModel} from 'vs/workbench/parts/files/common/workingFilesModel';
import {TextFileService} from 'vs/workbench/parts/files/browser/textFileServices';
import {createMockModelService, createMockModeService} from 'vs/editor/test/common/servicesTestUtils';
import {EditorInput} from 'vs/workbench/common/editor';
import {FileEditorInput} from 'vs/workbench/parts/files/browser/editors/fileEditorInput';

let baseInstantiationService: IInstantiationService;
let editorService: TestEditorService;
let eventService: TestEventService;
let textFileService: TextFileService;

suite('Files - WorkingFilesModel', () => {

	setup(() => {
		editorService = new TestEditorService();
		eventService = new TestEventService();

		let services = new ServiceCollection();

		services.set(IEventService, eventService);
		services.set(IMessageService, new TestMessageService());
		services.set(IFileService, <any> TestFileService);
		services.set(IWorkspaceContextService, new TestContextService());
		services.set(ITelemetryService, NullTelemetryService);
		services.set(IStorageService, new TestStorageService());
		services.set(IUntitledEditorService, new TestUntitledEditorService());
		services.set(IWorkbenchEditorService, editorService);
		services.set(IPartService, new TestPartService());
		services.set(IModeService, createMockModeService());
		services.set(IModelService, createMockModelService());
		services.set(ILifecycleService, NullLifecycleService);
		services.set(IConfigurationService, new TestConfigurationService());

		baseInstantiationService = new InstantiationService(services);
	});

	teardown(() => {
		eventService.dispose();
	});

	test("Removed files are added to the closed entries stack", function () {
		let model = baseInstantiationService.createInstance(WorkingFilesModel);
		let file1: URI = URI.create('file', null, '/file1');
		let file2: URI = URI.create('file', null, '/file2');
		let file3: URI = URI.create('file', null, '/file3');
		model.addEntry(file1);
		model.addEntry(file2);
		model.addEntry(file3);

		model.removeEntry(file2);
		model.removeEntry(file3);
		model.removeEntry(file1);

		let lastClosedEntry1: WorkingFileEntry = model.popLastClosedEntry();
		let lastClosedEntry2: WorkingFileEntry = model.popLastClosedEntry();
		let lastClosedEntry3: WorkingFileEntry = model.popLastClosedEntry();
		assert.equal(model.popLastClosedEntry(), null);

		assert.equal(lastClosedEntry1.resource, file1);
		assert.equal(lastClosedEntry2.resource, file3);
		assert.equal(lastClosedEntry3.resource, file2);
	});

	test("Untitled entries are not added to the closed entries stack", function () {
		let model = baseInstantiationService.createInstance(WorkingFilesModel);
		let fileUri: URI = URI.create('file', null, '/test');
		let untitledUri: URI = URI.create('untitled', null);
		model.addEntry(fileUri);
		model.addEntry(untitledUri);

		model.removeEntry(fileUri);
		let lastClosedEntry: WorkingFileEntry = model.popLastClosedEntry();
		assert.equal(lastClosedEntry.resource, fileUri);

		model.removeEntry(untitledUri);
		assert.equal(model.popLastClosedEntry(), null);
	});

	test("Clearing the model adds all entries to the closed entries stack", function() {
		let model = baseInstantiationService.createInstance(WorkingFilesModel);
		model.addEntry(URI.create('file', null, '/foo'));
		model.addEntry(URI.create('file', null, '/bar'));

		assert.equal(model.popLastClosedEntry(), null);
		model.clear();

		assert.ok(model.popLastClosedEntry().isFile);
		assert.ok(model.popLastClosedEntry().isFile);
		assert.equal(model.popLastClosedEntry(), null);
	});

	test("Reopening multiple files will open the editor in the previously opened file", function() {
		let model = baseInstantiationService.createInstance(WorkingFilesModel);

		// Open /foo then /bar, set /foo as active input
		let fooEntry = model.addEntry(URI.create('file', null, '/foo'));
		editorService.getActiveEditorInput = () => {
			return baseInstantiationService.createInstance(FileEditorInput, fooEntry.resource, 'text/javascript', void 0);
		};
		model.addEntry(URI.create('file', null, '/bar'));
		model.clear();

		assert.equal(model.popLastClosedEntry().resource.path, '/foo');
		assert.equal(model.popLastClosedEntry().resource.path, '/bar');
		assert.equal(model.popLastClosedEntry(), null);

		// Open /bar then /foo, set /foo as active input
		model.addEntry(URI.create('file', null, '/bar'));
		fooEntry = model.addEntry(URI.create('file', null, '/foo'));
		editorService.getActiveEditorInput = () => {
			return baseInstantiationService.createInstance(FileEditorInput, fooEntry.resource, 'text/javascript', void 0);
		};
		model.clear();

		assert.equal(model.popLastClosedEntry().resource.path, '/foo');
		assert.equal(model.popLastClosedEntry().resource.path, '/bar');
		assert.equal(model.popLastClosedEntry(), null);
	});
});