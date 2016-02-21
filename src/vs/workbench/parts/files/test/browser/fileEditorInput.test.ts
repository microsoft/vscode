/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/workbench/parts/files/browser/files.contribution'; // load our contribution into the test
import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import {join} from 'vs/base/common/paths';
import {FileEditorInput} from 'vs/workbench/parts/files/browser/editors/fileEditorInput';
import {createInstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {TextFileService} from 'vs/workbench/parts/files/browser/textFileServices';
import {MainTelemetryService} from 'vs/platform/telemetry/browser/mainTelemetryService';
import {FileTracker} from 'vs/workbench/parts/files/browser/fileTracker';
import {TestFileService, TestLifecycleService, TestEditorService, TestPartService, TestConfigurationService, TestEventService, TestContextService, TestStorageService} from 'vs/workbench/test/browser/servicesTestUtils';
import {createMockModelService, createMockModeService} from 'vs/editor/test/common/servicesTestUtils';

function toResource(path) {
	return URI.file(join('C:\\', path));
}

suite('Files - FileEditorInput', () => {

	test('FileEditorInput', function(done) {
		let editorService = new TestEditorService(function() { });
		let eventService = new TestEventService();
		let telemetryService = new MainTelemetryService();
		let contextService = new TestContextService();

		let instantiationService = createInstantiationService({
			eventService: eventService,
			contextService: contextService,
			fileService: TestFileService,
			storageService: new TestStorageService(),
			editorService: editorService,
			partService: new TestPartService(),
			modeService: createMockModeService(),
			modelService: createMockModelService(),
			telemetryService: telemetryService,
			lifecycleService: new TestLifecycleService(),
			configurationService: new TestConfigurationService()
		});

		let textFileServices = instantiationService.createInstance(<any>TextFileService);
		instantiationService.registerService('textFileService', textFileServices);

		let input = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/file.js'), 'text/javascript', void 0);
		let otherInput = instantiationService.createInstance(FileEditorInput, toResource('foo/bar/otherfile.js'), 'text/javascript', void 0);
		let otherInputSame = instantiationService.createInstance(FileEditorInput, toResource('foo/bar/file.js'), 'text/javascript', void 0);

		assert(input.matches(input));
		assert(input.matches(otherInputSame));
		assert(!input.matches(otherInput));
		assert(!input.matches(null));
		assert(input.getName());

		assert.strictEqual('file.js', input.getName());

		assert.strictEqual(toResource('/foo/bar/file.js').fsPath, input.getResource().fsPath);
		assert(input.getResource() instanceof URI);

		input = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar.html'), 'text/html', void 0);

		let inputToResolve = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/file.js'), 'text/javascript', void 0);
		let sameOtherInput = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/file.js'), 'text/javascript', void 0);

		return editorService.resolveEditorModel(inputToResolve, true).then(function(resolved) {
			let resolvedModelA = resolved;
			return editorService.resolveEditorModel(inputToResolve, true).then(function(resolved) {
				assert(resolvedModelA === resolved); // OK: Resolved Model cached globally per input
				assert(inputToResolve.getStatus());

				return editorService.resolveEditorModel(sameOtherInput, true).then(function(otherResolved) {
					assert(otherResolved === resolvedModelA); // OK: Resolved Model cached globally per input

					inputToResolve.dispose(false);

					return editorService.resolveEditorModel(inputToResolve, true).then(function(resolved) {
						assert(resolvedModelA === resolved); // Model is still the same because we had 2 clients

						inputToResolve.dispose(true);
						sameOtherInput.dispose(true);

						return editorService.resolveEditorModel(inputToResolve, true).then(function(resolved) {
							assert(resolvedModelA !== resolved); // Different instance, because input got disposed

							let stat = (<any>resolved).versionOnDiskStat;
							return editorService.resolveEditorModel(inputToResolve, true).then(function(resolved) {
								assert(stat !== (<any>resolved).versionOnDiskStat); // Different stat, because resolve always goes to the server for refresh

								stat = (<any>resolved).versionOnDiskStat;
								return editorService.resolveEditorModel(inputToResolve, false).then(function(resolved) {
									assert(stat === (<any>resolved).versionOnDiskStat); // Same stat, because not refreshed

									done();
								});
							});
						});
					});
				});
			});
		});
	});

	test('Input.matches() - FileEditorInput', function() {
		let fileEditorInput = new FileEditorInput(toResource('/foo/bar/updatefile.js'), 'text/javascript', void 0, void 0, void 0, void 0);
		let contentEditorInput2 = new FileEditorInput(toResource('/foo/bar/updatefile.js'), 'text/javascript', void 0, void 0, void 0, void 0);

		assert.strictEqual(fileEditorInput.matches(null), false);
		assert.strictEqual(fileEditorInput.matches(fileEditorInput), true);
		assert.strictEqual(fileEditorInput.matches(contentEditorInput2), true);
	});

	test('FileTracker - disposeAll()', function(done) {
		let editorService = new TestEditorService(function() { });
		let telemetryService = new MainTelemetryService();
		let contextService = new TestContextService();

		let eventService = new TestEventService();

		let instantiationService = createInstantiationService({
			eventService: eventService,
			contextService: contextService,
			fileService: TestFileService,
			storageService: new TestStorageService(),
			editorService: editorService,
			partService: new TestPartService(),
			modeService: createMockModeService(),
			modelService: createMockModelService(),
			telemetryService: telemetryService,
			lifecycleService: new TestLifecycleService(),
			configurationService: new TestConfigurationService()
		});

		let textFileServices = instantiationService.createInstance(<any>TextFileService);
		instantiationService.registerService('textFileService', textFileServices);

		let tracker = instantiationService.createInstance(FileTracker);

		let inputToResolve = instantiationService.createInstance(FileEditorInput, toResource('/fooss5/bar/file2.js'), 'text/javascript', void 0);
		let sameOtherInput = instantiationService.createInstance(FileEditorInput, toResource('/fooss5/bar/file2.js'), 'text/javascript', void 0);
		return editorService.resolveEditorModel(inputToResolve).then(function(resolved) {
			return editorService.resolveEditorModel(sameOtherInput).then(function(resolved) {
				(<any>tracker).disposeAll(toResource('/bar'), []);
				assert(!inputToResolve.isDisposed());
				assert(!sameOtherInput.isDisposed());

				(<any>tracker).disposeAll(toResource('/fooss5/bar/file2.js'), []);

				assert(inputToResolve.isDisposed());
				assert(sameOtherInput.isDisposed());

				done();
			});
		});
	});

	test('FileEditorInput - disposeAll() also works for folders', function(done) {
		let editorService = new TestEditorService(function() { });
		let telemetryService = new MainTelemetryService();
		let contextService = new TestContextService();

		let eventService = new TestEventService();

		let instantiationService = createInstantiationService({
			eventService: eventService,
			contextService: contextService,
			fileService: TestFileService,
			storageService: new TestStorageService(),
			editorService: editorService,
			partService: new TestPartService(),
			modeService: createMockModeService(),
			modelService: createMockModelService(),
			telemetryService: telemetryService,
			lifecycleService: new TestLifecycleService(),
			configurationService: new TestConfigurationService()
		});

		let textFileServices = instantiationService.createInstance(<any>TextFileService);
		instantiationService.registerService('textFileService', textFileServices);

		let tracker = instantiationService.createInstance(FileTracker);

		let inputToResolve = instantiationService.createInstance(FileEditorInput, toResource('/foo6/bar/file.js'), 'text/javascript', void 0);
		let sameOtherInput = instantiationService.createInstance(FileEditorInput, toResource('/foo6/bar/file.js'), 'text/javascript', void 0);
		return editorService.resolveEditorModel(inputToResolve, true).then(function(resolved) {
			return editorService.resolveEditorModel(sameOtherInput, true).then(function(resolved) {
				(<any>tracker).disposeAll(toResource('/bar'), []);
				assert(!inputToResolve.isDisposed());
				assert(!sameOtherInput.isDisposed());

				(<any>tracker).disposeAll(toResource('/foo6'), []);

				assert(inputToResolve.isDisposed());
				assert(sameOtherInput.isDisposed());

				done();
			});
		});
	});
});