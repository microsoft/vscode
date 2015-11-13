/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {TextResourceEditorModel} from 'vs/workbench/browser/parts/editor/resourceEditorModel';
import {MockRequestService, TestWorkspace, TestMessageService, TestEventService} from 'vs/workbench/test/browser/servicesTestUtils';
import Severity from 'vs/base/common/severity';
import {IEventService} from 'vs/platform/event/common/event';
import * as Html from 'vs/languages/html/common/html.contribution';
import {IMessageService, IConfirmation} from 'vs/platform/message/common/message';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {createMockModelService, createMockModeService} from 'vs/editor/test/common/servicesTestUtils';

suite('Workbench - ResourceEditorModel', () => {
	let file = function(name, mime) {
		return {
			"isDirectory": false,
			"size": 16192,
			"mtime": new Date().getTime(),
			"name": name,
			"mime": mime
		};
	};

	let requestService: MockRequestService;
	let eventService: TestEventService;
	let messageService: IMessageService;
	let modeService: IModeService;
	let modelService: IModelService;
	let counter;

	setup(() => {
		eventService = new TestEventService();
		messageService = new TestMessageService();
		modeService = createMockModeService();
		modelService = createMockModelService();
		counter = 0;

		requestService = new MockRequestService(TestWorkspace, (url) => {
			counter++;

			if (/index\.html$/.test(url)) {
				return {
					responseText: 'Hello Html',
					getResponseHeader: key => ({
						'last-modified': counter === 1 ? new Date().toUTCString() : new Date(new Date().getTime() + 1000).toUTCString(),
						'content-type': 'text/html'
					})[key.toLowerCase()]
				};
			} else if (/index_changes\.html$/.test(url)) {
				return {
					responseText: counter === 1 ? 'Hello Html' : 'Hello Changed Html',
					getResponseHeader: key => ({
						'last-modified': counter === 1 ? new Date().toUTCString() : new Date(new Date().getTime() + 1000).toUTCString(),
						'content-type': 'text/html'
					})[key.toLowerCase()]
				};
			}

			return null;
		});
	});

	teardown(() => {
		eventService.dispose();
	});

	test('TextResourceEditorModel - Load takes mime from server', function(done) {
		let m1 = new TextResourceEditorModel("/files/index.html", "text/plain", null, null, null, modeService, modelService, requestService, null);

		return m1.load().then(() => {
			assert(m1.isResolved());

			return m1.textEditorModel.whenModeIsReady().then(() => {
				assert.strictEqual("html", m1.textEditorModel.getMode().getId());
			});
		}).done(() => {
			m1.dispose();
			done();
		});
	});

	test('TextResourceEditorModel - Enforce mime', function(done) {
		let m1 = new TextResourceEditorModel("/files/index.html", "text/plain", null, null, null, modeService, modelService, requestService, null);
		m1.setMimeEnforced();

		return m1.load().then(() => {
			assert(m1.isResolved());

			return m1.textEditorModel.whenModeIsReady().then(() => {
				assert.strictEqual('plaintext', m1.textEditorModel.getMode().getId());
			});
		}).done(() => {
			m1.dispose();
			done();
		});
	});

	test('TextResourceEditorModel - Load keeps text editor model if already present', function(done) {
		let m1 = new TextResourceEditorModel("/files/index.html", "text/plain", null, null, null, modeService, modelService, requestService, null);

		return m1.load().then(() => {
			assert(m1.isResolved());
			let model = m1.textEditorModel;

			return m1.load().then(() => {
				assert.strictEqual(m1.textEditorModel, model);
			});
		}).done(() => {
			m1.dispose();
			done();
		});
	});

	test('TextResourceEditorModel - Load updates properly and provides mtime', function(done) {
		let m1 = new TextResourceEditorModel("/files/index_changes.html", "text/plain", null, null, null, modeService, modelService, requestService, null);

		return m1.load().then(() => {
			let mtime = m1.getLastModified();
			assert(mtime > 0);
			assert.equal(m1.getValue(), 'Hello Html');

			return m1.load().then(() => {
				assert(mtime < m1.getLastModified());
				assert.equal(m1.getValue(), 'Hello Changed Html');
			});
		}).done(() => {
			m1.dispose();
			done();
		});
	});
});