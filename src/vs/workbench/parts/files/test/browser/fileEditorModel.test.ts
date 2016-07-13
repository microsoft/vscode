/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TestInstantiationService } from 'vs/test/utils/instantiationTestUtils';
import {TPromise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import {FileEditorInput} from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import {TextFileEditorModel, CACHE} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
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
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import PartService = require('vs/workbench/services/part/common/partService');
import {ITextFileService, EventType} from 'vs/workbench/parts/files/common/files';
import {createMockModelService, TestTextFileService, TestFileService, TestPartService, TestEditorService, TestConfigurationService, TestUntitledEditorService, TestStorageService, TestContextService, TestMessageService, TestEventService} from 'vs/test/utils/servicesTestUtils';

function toResource(path) {
	return URI.file(paths.join('C:\\', path));
}

let eventService: IEventService;
let textFileService: TestTextFileService;

suite('Files - TextFileEditorModel', () => {

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService= new TestInstantiationService();
		eventService = new TestEventService();
		eventService= <IEventService> instantiationService.stub(IEventService, new TestEventService());
		instantiationService.stub(IMessageService, new TestMessageService());
		instantiationService.stub(IFileService, <any> TestFileService);
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(ITelemetryService);
		instantiationService.stub(IStorageService, new TestStorageService());
		instantiationService.stub(IUntitledEditorService, new TestUntitledEditorService());
		instantiationService.stub(IWorkbenchEditorService, new TestEditorService());
		instantiationService.stub(PartService.IPartService, new TestPartService());
		instantiationService.stub(IModeService);
		instantiationService.stub(IModelService, createMockModelService(instantiationService));
		instantiationService.stub(ILifecycleService, NullLifecycleService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());

		textFileService = <any>instantiationService.createInstance(<any>TestTextFileService);
		instantiationService.stub(ITextFileService, textFileService);
	});

	teardown(() => {
		CACHE.clear();
	});

	test('Load does not trigger save', function (done) {
		let m1 = instantiationService.createInstance(TextFileEditorModel, toResource('/path/index.txt'), 'utf8');

		eventService.addListener2('files:internalFileChanged', () => {
			assert.ok(false);
		});

		eventService.addListener2(EventType.FILE_DIRTY, () => {
			assert.ok(false);
		});

		eventService.addListener2(EventType.FILE_SAVED, () => {
			assert.ok(false);
		});

		m1.load().then(() => {
			assert.ok(m1.isResolved());

			m1.dispose();

			done();
		});
	});

	test('Load returns dirty model as long as model is dirty', function (done) {
		let m1 = instantiationService.createInstance(TextFileEditorModel, toResource('/path/index_async.txt'), 'utf8');

		m1.load().then(() => {
			m1.textEditorModel.setValue('foo');

			assert.ok(m1.isDirty());
			m1.load().then(() => {
				assert.ok(m1.isDirty());

				m1.dispose();

				done();
			});
		});
	});

	test('Revert', function (done) {
		let eventCounter = 0;

		eventService.addListener2(EventType.FILE_REVERTED, () => {
			eventCounter++;
		});

		let m1 = instantiationService.createInstance(TextFileEditorModel, toResource('/path/index_async.txt'), 'utf8');

		m1.load().then(() => {
			m1.textEditorModel.setValue('foo');

			assert.ok(m1.isDirty());

			m1.revert().then(() => {
				assert.ok(!m1.isDirty());
				assert.equal(m1.textEditorModel.getValue(), 'Hello Html');
				assert.equal(eventCounter, 1);

				m1.dispose();

				done();
			});
		});
	});

	test('Conflict Resolution Mode', function (done) {
		let m1 = instantiationService.createInstance(TextFileEditorModel, toResource('/path/index_async.txt'), 'utf8');

		m1.load().then(() => {
			m1.setConflictResolutionMode();
			m1.textEditorModel.setValue('foo');

			assert.ok(m1.isDirty());
			assert.ok(m1.isInConflictResolutionMode());

			m1.revert().then(() => {
				m1.textEditorModel.setValue('bar');
				assert.ok(m1.isDirty());

				return m1.save().then(() => {
					assert.ok(!m1.isDirty());

					m1.dispose();

					done();
				});
			});
		});
	});

	test('Auto Save triggered when model changes', function (done) {
		let eventCounter = 0;
		let m1 = instantiationService.createInstance(TextFileEditorModel, toResource('/path/index.txt'), 'utf8');

		(<any>m1).autoSaveAfterMillies = 10;
		(<any>m1).autoSaveAfterMilliesEnabled = true;

		eventService.addListener2(EventType.FILE_DIRTY, () => {
			eventCounter++;
		});

		eventService.addListener2(EventType.FILE_SAVED, () => {
			eventCounter++;
		});

		m1.load().then(() => {
			m1.textEditorModel.setValue('foo');

			return TPromise.timeout(50).then(() => {
				assert.ok(!m1.isDirty());
				assert.equal(eventCounter, 2);

				m1.dispose();

				done();
			});
		});
	});

	test('Dirty tracking', function (done) {
		let resource = toResource('/path/index_async.txt');
		let i1 = instantiationService.createInstance(FileEditorInput, resource, 'text/plain', 'utf8');

		i1.resolve().then((m1: TextFileEditorModel) => {
			let dirty = m1.getLastDirtyTime();
			assert.ok(!dirty);

			m1.textEditorModel.setValue('foo');

			assert.ok(m1.isDirty());
			assert.ok(m1.getLastDirtyTime() > dirty);

			assert.ok(textFileService.isDirty(resource));
			assert.equal(textFileService.getDirty().length, 1);

			m1.dispose();

			done();
		});
	});

	test('save() and isDirty() - proper with check for mtimes', function (done) {
		let c1 = instantiationService.createInstance(FileEditorInput, toResource('/path/index_async2.txt'), 'text/plain', 'utf8');
		let c2 = instantiationService.createInstance(FileEditorInput, toResource('/path/index_async.txt'), 'text/plain', 'utf8');

		c1.resolve().then((m1: TextFileEditorModel) => {
			c2.resolve().then((m2: TextFileEditorModel) => {
				m1.textEditorModel.setValue('foo');

				let m1Mtime = m1.getLastModifiedTime();
				let m2Mtime = m2.getLastModifiedTime();
				assert.ok(m1Mtime > 0);
				assert.ok(m2Mtime > 0);

				assert.ok(textFileService.isDirty());
				assert.ok(textFileService.isDirty(toResource('/path/index_async2.txt')));
				assert.ok(!textFileService.isDirty(toResource('/path/index_async.txt')));

				m2.textEditorModel.setValue('foo');
				assert.ok(textFileService.isDirty(toResource('/path/index_async.txt')));

				return TPromise.timeout(10).then(() => {
					textFileService.saveAll().then(() => {
						assert.ok(!textFileService.isDirty(toResource('/path/index_async.txt')));
						assert.ok(!textFileService.isDirty(toResource('/path/index_async2.txt')));
						assert.ok(m1.getLastModifiedTime() > m1Mtime);
						assert.ok(m2.getLastModifiedTime() > m2Mtime);

						m1.dispose();
						m2.dispose();

						done();
					});
				});
			});
		});
	});

	test('Save Participant', function (done) {
		let eventCounter = 0;
		let m1 = instantiationService.createInstance(TextFileEditorModel, toResource('/path/index_async.txt'), 'utf8');

		eventService.addListener2(EventType.FILE_SAVED, (e) => {
			assert.equal(m1.getValue(), 'bar');
			assert.ok(!m1.isDirty());
			eventCounter++;
		});

		eventService.addListener2(EventType.FILE_SAVING, (e) => {
			assert.ok(m1.isDirty());
			m1.textEditorModel.setValue('bar');
			assert.ok(m1.isDirty());
			eventCounter++;
		});

		m1.load().then(() => {
			m1.textEditorModel.setValue('foo');

			m1.save().then(() => {
				m1.dispose();

				assert.equal(eventCounter, 2);

				done();
			});
		});
	});
});