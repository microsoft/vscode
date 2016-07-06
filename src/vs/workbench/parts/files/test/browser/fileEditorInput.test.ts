/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/workbench/parts/files/browser/files.contribution'; // load our contribution into the test
import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import {join} from 'vs/base/common/paths';
import {FileEditorInput} from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import {ITelemetryService, NullTelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IEventService} from 'vs/platform/event/common/event';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ILifecycleService, NullLifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IFileService} from 'vs/platform/files/common/files';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {ITextFileService} from 'vs/workbench/parts/files/common/files';
import {FileTracker} from 'vs/workbench/parts/files/browser/fileTracker';
import {TestTextFileService, TestEditorGroupService, TestHistoryService, TestFileService, TestEditorService, TestPartService, TestConfigurationService, TestEventService, TestContextService, TestQuickOpenService, TestStorageService} from 'vs/workbench/test/common/servicesTestUtils';
import {createMockModelService, createMockModeService} from 'vs/editor/test/common/servicesTestUtils';
import {IHistoryService} from 'vs/workbench/services/history/common/history';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';

function toResource(path) {
	return URI.file(join('C:\\', path));
}

suite('Files - FileEditorInput', () => {

	test('FileEditorInput', function (done) {
		let editorService = new TestEditorService(function () { });
		let eventService = new TestEventService();
		let telemetryService = NullTelemetryService;
		let contextService = new TestContextService();

		let services = new ServiceCollection();
		let instantiationService = new InstantiationService(services);

		services.set(IEventService, eventService);
		services.set(IWorkspaceContextService, contextService);
		services.set(IFileService, <any>TestFileService);
		services.set(IStorageService, new TestStorageService());
		services.set(IWorkbenchEditorService, editorService);
		services.set(IPartService, new TestPartService());
		services.set(IModeService, createMockModeService());
		services.set(IModelService, createMockModelService());
		services.set(ITelemetryService, telemetryService);
		services.set(IEditorGroupService, new TestEditorGroupService());
		services.set(ILifecycleService, NullLifecycleService);
		services.set(IConfigurationService, new TestConfigurationService());
		services.set(ITextFileService, <ITextFileService> instantiationService.createInstance(<any> TestTextFileService));

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

		return editorService.resolveEditorModel(inputToResolve, true).then(function (resolved) {
			let resolvedModelA = resolved;
			return editorService.resolveEditorModel(inputToResolve, true).then(function (resolved) {
				assert(resolvedModelA === resolved); // OK: Resolved Model cached globally per input

				return editorService.resolveEditorModel(sameOtherInput, true).then(function (otherResolved) {
					assert(otherResolved === resolvedModelA); // OK: Resolved Model cached globally per input

					inputToResolve.dispose(false);

					return editorService.resolveEditorModel(inputToResolve, true).then(function (resolved) {
						assert(resolvedModelA === resolved); // Model is still the same because we had 2 clients

						inputToResolve.dispose();
						sameOtherInput.dispose();

						resolvedModelA.dispose();

						return editorService.resolveEditorModel(inputToResolve, true).then(function (resolved) {
							assert(resolvedModelA !== resolved); // Different instance, because input got disposed

							let stat = (<any>resolved).versionOnDiskStat;
							return editorService.resolveEditorModel(inputToResolve, true).then(function (resolved) {
								assert(stat !== (<any>resolved).versionOnDiskStat); // Different stat, because resolve always goes to the server for refresh

								stat = (<any>resolved).versionOnDiskStat;
								return editorService.resolveEditorModel(inputToResolve, false).then(function (resolved) {
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

	test('Input.matches() - FileEditorInput', function () {
		let eventService = new TestEventService();
		let contextService = new TestContextService();

		let services = new ServiceCollection();
		let instantiationService = new InstantiationService(services);

		services.set(IEventService, eventService);
		services.set(IWorkspaceContextService, contextService);
		services.set(ITextFileService, <ITextFileService> instantiationService.createInstance(<any> TestTextFileService));

		let fileEditorInput = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/updatefile.js'), 'text/javascript', void 0);
		let contentEditorInput2 = instantiationService.createInstance(FileEditorInput, toResource('/foo/bar/updatefile.js'), 'text/javascript', void 0);

		assert.strictEqual(fileEditorInput.matches(null), false);
		assert.strictEqual(fileEditorInput.matches(fileEditorInput), true);
		assert.strictEqual(fileEditorInput.matches(contentEditorInput2), true);
	});

	test('FileTracker - dispose()', function (done) {
		let editorService = new TestEditorService(function () { });
		let telemetryService = NullTelemetryService;
		let contextService = new TestContextService();

		let eventService = new TestEventService();

		let services = new ServiceCollection();
		let instantiationService = new InstantiationService(services);

		services.set(IEventService, eventService);
		services.set(IWorkspaceContextService, contextService);
		services.set(IFileService, <any>TestFileService);
		services.set(IStorageService, new TestStorageService());
		services.set(IWorkbenchEditorService, editorService);
		services.set(IHistoryService, new TestHistoryService());
		services.set(IQuickOpenService, new TestQuickOpenService());
		services.set(IPartService, new TestPartService());
		services.set(IModeService, createMockModeService());
		services.set(IEditorGroupService, new TestEditorGroupService());
		services.set(IModelService, createMockModelService());
		services.set(ITelemetryService, telemetryService);
		services.set(ILifecycleService, NullLifecycleService);
		services.set(IConfigurationService, new TestConfigurationService());
		services.set(ITextFileService, <ITextFileService> instantiationService.createInstance(<any> TestTextFileService));

		let tracker = instantiationService.createInstance(FileTracker);

		let inputToResolve = instantiationService.createInstance(FileEditorInput, toResource('/fooss5/bar/file2.js'), 'text/javascript', void 0);
		let sameOtherInput = instantiationService.createInstance(FileEditorInput, toResource('/fooss5/bar/file2.js'), 'text/javascript', void 0);
		return editorService.resolveEditorModel(inputToResolve).then(function (resolved) {
			return editorService.resolveEditorModel(sameOtherInput).then(function (resolved) {
				(<any>tracker).handleDelete(toResource('/bar'), []);
				assert(!inputToResolve.isDisposed());
				assert(!sameOtherInput.isDisposed());

				(<any>tracker).handleDelete(toResource('/fooss5/bar/file2.js'), []);

				assert(inputToResolve.isDisposed());
				assert(sameOtherInput.isDisposed());

				done();
			});
		});
	});

	test('FileEditorInput - dispose() also works for folders', function (done) {
		let editorService = new TestEditorService(function () { });
		let telemetryService = NullTelemetryService;
		let contextService = new TestContextService();

		let eventService = new TestEventService();

		let services = new ServiceCollection();
		let instantiationService = new InstantiationService(services);

		services.set(IEventService, eventService);
		services.set(IWorkspaceContextService, contextService);
		services.set(IFileService, <any>TestFileService);
		services.set(IStorageService, new TestStorageService());
		services.set(IWorkbenchEditorService, editorService);
		services.set(IPartService, new TestPartService());
		services.set(IModeService, createMockModeService());
		services.set(IEditorGroupService, new TestEditorGroupService());
		services.set(IQuickOpenService, new TestQuickOpenService());
		services.set(IModelService, createMockModelService());
		services.set(ITelemetryService, telemetryService);
		services.set(ILifecycleService, NullLifecycleService);
		services.set(IConfigurationService, new TestConfigurationService());
		services.set(IHistoryService, new TestHistoryService());
		services.set(ITextFileService, <ITextFileService> instantiationService.createInstance(<any> TestTextFileService));

		let tracker = instantiationService.createInstance(FileTracker);

		let inputToResolve = instantiationService.createInstance(FileEditorInput, toResource('/foo6/bar/file.js'), 'text/javascript', void 0);
		let sameOtherInput = instantiationService.createInstance(FileEditorInput, toResource('/foo6/bar/file.js'), 'text/javascript', void 0);
		return editorService.resolveEditorModel(inputToResolve, true).then(function (resolved) {
			return editorService.resolveEditorModel(sameOtherInput, true).then(function (resolved) {
				(<any>tracker).handleDelete(toResource('/bar'), []);
				assert(!inputToResolve.isDisposed());
				assert(!sameOtherInput.isDisposed());

				(<any>tracker).handleDelete(toResource('/foo6'), []);

				assert(inputToResolve.isDisposed());
				assert(sameOtherInput.isDisposed());

				done();
			});
		});
	});
});