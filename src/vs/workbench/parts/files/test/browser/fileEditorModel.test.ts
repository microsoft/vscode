/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {TPromise} from 'vs/base/common/winjs.base';
import {TestInstantiationService} from 'vs/test/utils/instantiationTestUtils';
import URI from 'vs/base/common/uri';
import {FileEditorInput} from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import paths = require('vs/base/common/paths');
import {TextFileEditorModel, CACHE} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {IEventService} from 'vs/platform/event/common/event';
import {EventType, ITextFileService} from 'vs/workbench/parts/files/common/files';
import {textFileServiceInstantiationService} from 'vs/test/utils/servicesTestUtils';

function toResource(path) {
	return URI.file(paths.join('C:\\', path));
}

class ServiceAccessor {
	constructor(@IEventService public eventService: IEventService, @ITextFileService public textFileService: ITextFileService) {
	}
}

let accessor: ServiceAccessor;

suite('Files - TextFileEditorModel', () => {

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = textFileServiceInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	teardown(() => {
		CACHE.clear();
	});

	test('Load does not trigger save', function (done) {
		const m1 = instantiationService.createInstance(TextFileEditorModel, toResource('/path/index.txt'), 'utf8');

		accessor.eventService.addListener2('files:internalFileChanged', () => {
			assert.ok(false);
		});

		accessor.eventService.addListener2(EventType.FILE_DIRTY, () => {
			assert.ok(false);
		});

		accessor.eventService.addListener2(EventType.FILE_SAVED, () => {
			assert.ok(false);
		});

		m1.load().then(() => {
			assert.ok(m1.isResolved());

			m1.dispose();

			done();
		});
	});

	test('Load returns dirty model as long as model is dirty', function (done) {
		const m1 = instantiationService.createInstance(TextFileEditorModel, toResource('/path/index_async.txt'), 'utf8');

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

		accessor.eventService.addListener2(EventType.FILE_REVERTED, () => {
			eventCounter++;
		});

		const m1 = instantiationService.createInstance(TextFileEditorModel, toResource('/path/index_async.txt'), 'utf8');

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
		const m1 = instantiationService.createInstance(TextFileEditorModel, toResource('/path/index_async.txt'), 'utf8');

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
		const m1 = instantiationService.createInstance(TextFileEditorModel, toResource('/path/index.txt'), 'utf8');

		(<any>m1).autoSaveAfterMillies = 10;
		(<any>m1).autoSaveAfterMilliesEnabled = true;

		accessor.eventService.addListener2(EventType.FILE_DIRTY, () => {
			eventCounter++;
		});

		accessor.eventService.addListener2(EventType.FILE_SAVED, () => {
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

	test('save() and isDirty() - proper with check for mtimes', function (done) {
		const c1 = instantiationService.createInstance(FileEditorInput, toResource('/path/index_async2.txt'), 'text/plain', 'utf8');
		const c2 = instantiationService.createInstance(FileEditorInput, toResource('/path/index_async.txt'), 'text/plain', 'utf8');

		c1.resolve().then((m1: TextFileEditorModel) => {
			c2.resolve().then((m2: TextFileEditorModel) => {
				m1.textEditorModel.setValue('foo');

				const m1Mtime = m1.getLastModifiedTime();
				const m2Mtime = m2.getLastModifiedTime();
				assert.ok(m1Mtime > 0);
				assert.ok(m2Mtime > 0);

				assert.ok(accessor.textFileService.isDirty());
				assert.ok(accessor.textFileService.isDirty(toResource('/path/index_async2.txt')));
				assert.ok(!accessor.textFileService.isDirty(toResource('/path/index_async.txt')));

				m2.textEditorModel.setValue('foo');
				assert.ok(accessor.textFileService.isDirty(toResource('/path/index_async.txt')));

				return TPromise.timeout(10).then(() => {
					accessor.textFileService.saveAll().then(() => {
						assert.ok(!accessor.textFileService.isDirty(toResource('/path/index_async.txt')));
						assert.ok(!accessor.textFileService.isDirty(toResource('/path/index_async2.txt')));
						assert.ok(m1.getLastModifiedTime() > m1Mtime);
						assert.ok(m2.getLastModifiedTime() > m2Mtime);
						assert.ok(m1.getLastSaveAttemptTime() > m1Mtime);
						assert.ok(m2.getLastSaveAttemptTime() > m2Mtime);

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
		const m1 = instantiationService.createInstance(TextFileEditorModel, toResource('/path/index_async.txt'), 'utf8');

		accessor.eventService.addListener2(EventType.FILE_SAVED, (e) => {
			assert.equal(m1.getValue(), 'bar');
			assert.ok(!m1.isDirty());
			eventCounter++;
		});

		accessor.eventService.addListener2(EventType.FILE_SAVING, (e) => {
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