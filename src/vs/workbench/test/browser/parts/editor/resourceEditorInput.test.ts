/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {create} from 'vs/platform/instantiation/common/instantiationService';
import {ResourceEditorInput} from 'vs/workbench/browser/parts/editor/resourceEditorInput';
import {BinaryEditorModel} from 'vs/workbench/browser/parts/editor/binaryEditorModel';
import {BaseTextEditorModel} from 'vs/workbench/browser/parts/editor/textEditorModel';
import {MockRequestService, TestWorkspace, TestEditorService, TestContextService, TestMessageService, TestEventService} from 'vs/workbench/test/browser/servicesTestUtils';
import Severity from 'vs/base/common/severity';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import * as Html from 'vs/languages/html/common/html.contribution';
import {IMessageService, IConfirmation} from 'vs/platform/message/common/message';
import {createMockModelService, createMockModeService} from 'vs/editor/test/common/servicesTestUtils';

let jsContent = "console.log('Hello World');";
let cssContent = "body { background-color: red; }";

suite('Workbench - ResourceEditorInput', () => {
	let file = function(name, mime) {
		return {
			"isDirectory": false,
			"size": 16192,
			"mtime": new Date().getTime(),
			"name": name,
			"mime": mime
		};
	};

	let baseInstantiationService: IInstantiationService;
	let eventService: TestEventService;
	let messageService: IMessageService;
	let saveAttempt: number;

	setup(() => {
		eventService = new TestEventService();
		messageService = new TestMessageService();
		saveAttempt = 0;
		let services = {
			eventService: eventService,
			messageService: messageService,
			requestService: new MockRequestService(TestWorkspace, (url) => {
				if (/index\.html$/.test(url)) {
					return {
						responseText: 'Hello Html',
						getResponseHeader: key => ({
							'content-length': '1000',
							'last-modified': new Date().toUTCString(),
							'content-type': 'text/html'
						})[key.toLowerCase()]
					};
				}

				return null;
			}),
			contextService: new TestContextService(TestWorkspace, null, { autoSaveDelay: 0 }),
			modeService: createMockModeService(),
			modelService: createMockModelService()
		};

		baseInstantiationService = create(services);
	});

	teardown(() => {
		eventService.dispose();
	});

	test('ResourceEditorInput - Load takes mime from server', (done) => {
		let c1 = baseInstantiationService.createInstance(ResourceEditorInput, "name", "description", "/files/index.html", "text/plain", void 0, void 0, void 0);

		return c1.resolve().then((m1: BaseTextEditorModel) => {
			assert(m1.isResolved());

			return m1.textEditorModel.whenModeIsReady().then(() => {
				assert.strictEqual("html", m1.textEditorModel.getMode().getId());
				done();
			}).then(() => {
				m1.dispose();
			});
		});
	});

	test('ResourceEditorInput - Enforce mime', (done) => {
		let c1 = baseInstantiationService.createInstance(ResourceEditorInput, "name", "description", "/files/index.html", "text/plain", void 0, void 0, void 0);
		c1.setMimeEnforced();

		return c1.resolve().then((m1: BaseTextEditorModel) => {
			assert(m1.isResolved());

			return m1.textEditorModel.whenModeIsReady().then(() => {
				assert.strictEqual('plaintext', m1.textEditorModel.getMode().getId());
				done();
			}).then(() => {
				m1.dispose();
			});
		});
	});

	test('ResourceEditorInput - Binary', (done) => {
		let c1 = baseInstantiationService.createInstance(ResourceEditorInput, "name", "description", "/files/index.foo", "application/octet-stream", void 0, void 0, void 0);

		return c1.resolve().then((m1) => {
			assert(m1.isResolved());
			assert(m1 instanceof BinaryEditorModel);
			done();
		});
	});

	test("ResourceEditorInput", function(done) {
		let editorService = new TestEditorService(function() { });
		let requestService = new MockRequestService(TestWorkspace, (url) => {
			switch (true) {
				case /\.json$/.test(url): return jsContent;
				case /\.css$/.test(url): return cssContent;
			}

			return null;
		});

		let inst = create({
			requestService: requestService,
			editorService: editorService,
			modeService: createMockModeService(),
			modelService: createMockModelService()
		});

		let input = inst.createInstance(ResourceEditorInput, "name", "description", "/monaco.jsrules.json", "application/json", "GET", { Accept: "application/json" }, false);
		let otherInput = inst.createInstance(ResourceEditorInput, "name", "description", "/site.css", "application/json", "GET", { Accept: "application/json" }, false);
		let otherInputSame = inst.createInstance(ResourceEditorInput, "name", "description", "/monaco.jsrules.json", "application/json", "GET", { Accept: "application/json" }, false);

		assert(input.matches(input));
		assert(input.matches(otherInputSame));
		assert(!input.matches(otherInput));
		assert(!input.matches(null));
		assert(input.getName());

		input = inst.createInstance(ResourceEditorInput, "name", "description", "/monaco.jsrules.json", "mime", "GET", { Accept: "application/json" }, false);

		let url = "/site.css";
		let method = "GET";
		let headers = {
			"Accept": "application/octet-stream"
		};

		input = inst.createInstance(ResourceEditorInput, "name", "description", url, "text/plain", method, headers, false);

		editorService.resolveEditorModel(input, true).then(function(resolved) {
			let resolvedModelA = resolved;
			return editorService.resolveEditorModel(input, true).then(function(resolved) {
				assert(resolvedModelA === resolved); // assert: Resolved Model cached per instance

				input.dispose();

				return editorService.resolveEditorModel(input, true).then(function(resolved) {
					assert(resolvedModelA !== resolved); // Different instance, because input got disposed

					let model = (<any>resolved).textEditorModel;
					return editorService.resolveEditorModel(input, true).then(function(againResolved) {
						assert(model === (<any>againResolved).textEditorModel); // Same models from each resolve
						model = (<any>againResolved).textEditorModel;

						return editorService.resolveEditorModel(input, false).then(function(againResolved) {
							assert(model === (<any>againResolved).textEditorModel); // Same models if not refreshing
						});
					});
				});
			});
		}).done(() => {
			input.dispose();
			done();
		});
	});
});