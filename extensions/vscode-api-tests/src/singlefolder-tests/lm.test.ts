/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { assertNoRpc, closeAllEditors, DeferredPromise, disposeAll } from '../utils';


suite('lm', function () {

	let disposables: vscode.Disposable[] = [];

	const testProviderOptions: vscode.LanguageModelChatInformation = {
		id: 'test-lm',
		name: 'test-lm',
		version: '1.0.0',
		family: 'test',
		maxInputTokens: 100,
		maxOutputTokens: 100,
		capabilities: {}
	};

	setup(function () {
		disposables = [];
	});

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
		disposeAll(disposables);
	});


	test('lm request and stream', async function () {

		let p: vscode.Progress<vscode.LanguageModelResponsePart> | undefined;
		const defer = new DeferredPromise<void>();

		try {
			disposables.push(vscode.lm.registerLanguageModelChatProvider('test-lm-vendor', {
				async provideLanguageModelChatInformation(_options, _token) {
					return [testProviderOptions];
				},
				async provideLanguageModelChatResponse(_model, _messages, _options, progress, _token) {
					p = progress;
					return defer.p;
				},
				async provideTokenCount(_model, _text, _token) {
					return 1;
				},
			}));
		} catch (e) {
			assert.fail(`Failed to register chat model provider: ${e}`);
		}


		const models = await vscode.lm.selectChatModels({ id: 'test-lm' });
		assert.strictEqual(models.length, 1);

		const request = await models[0].sendRequest([vscode.LanguageModelChatMessage.User('Hello')]);

		// assert we have a request immediately
		assert.ok(request);
		assert.ok(p);
		assert.strictEqual(defer.isSettled, false);

		let streamDone = false;
		let responseText = '';

		const pp = (async () => {
			for await (const chunk of request.text) {
				responseText += chunk;
			}
			streamDone = true;
		})();

		assert.strictEqual(responseText, '');
		assert.strictEqual(streamDone, false);

		p.report(new vscode.LanguageModelTextPart('Hello'));
		defer.complete();

		await pp;
		await new Promise(r => setTimeout(r, 1000));

		assert.strictEqual(streamDone, true);
		assert.strictEqual(responseText, 'Hello');
	});

	test('lm request fail', async function () {

		disposables.push(vscode.lm.registerLanguageModelChatProvider('test-lm-vendor', {
			async provideLanguageModelChatInformation(_options, _token) {
				return [testProviderOptions];
			},
			async provideLanguageModelChatResponse(_model, _messages, _options, _progress, _token) {
				throw new Error('BAD');
			},
			async provideTokenCount(_model, _text, _token) {
				return 1;
			},
		}));

		const models = await vscode.lm.selectChatModels({ id: 'test-lm' });
		assert.strictEqual(models.length, 1);

		try {
			await models[0].sendRequest([vscode.LanguageModelChatMessage.User('Hello')]);
			assert.ok(false, 'EXPECTED error');
		} catch (error) {
			assert.ok(error instanceof Error);
		}
	});

	test('lm stream fail', async function () {

		const defer = new DeferredPromise<void>();

		disposables.push(vscode.lm.registerLanguageModelChatProvider('test-lm-vendor', {
			async provideLanguageModelChatInformation(_options, _token) {
				return [testProviderOptions];
			},
			async provideLanguageModelChatResponse(_model, _messages, _options, _progress, _token) {
				return defer.p;
			},
			async provideTokenCount(_model, _text, _token) {
				return 1;
			}
		}));

		const models = await vscode.lm.selectChatModels({ id: 'test-lm' });
		assert.strictEqual(models.length, 1);

		const res = await models[0].sendRequest([vscode.LanguageModelChatMessage.User('Hello')]);
		assert.ok(res);

		const result = (async () => {
			for await (const _chunk of res.text) {

			}
		})();

		defer.error(new Error('STREAM FAIL'));

		try {
			await result;
			assert.ok(false, 'EXPECTED error');
		} catch (error) {
			assert.ok(error);
			assert.ok(error instanceof Error);
		}
	});


	test('LanguageModelError instance is not thrown to extensions#235322 (SYNC)', async function () {

		disposables.push(vscode.lm.registerLanguageModelChatProvider('test-lm-vendor', {
			async provideLanguageModelChatInformation(_options, _token) {
				return [testProviderOptions];
			},
			provideLanguageModelChatResponse(_model, _messages, _options, _progress, _token) {
				throw vscode.LanguageModelError.Blocked('You have been blocked SYNC');
			},
			async provideTokenCount(_model, _text, _token) {
				return 1;
			}
		}));

		const models = await vscode.lm.selectChatModels({ id: 'test-lm' });
		assert.strictEqual(models.length, 1);

		try {
			await models[0].sendRequest([vscode.LanguageModelChatMessage.User('Hello')]);
			assert.ok(false, 'EXPECTED error');
		} catch (error) {
			assert.ok(error instanceof vscode.LanguageModelError);
			assert.strictEqual(error.message, 'You have been blocked SYNC');
		}
	});

	test('LanguageModelError instance is not thrown to extensions#235322 (ASYNC)', async function () {

		disposables.push(vscode.lm.registerLanguageModelChatProvider('test-lm-vendor', {
			async provideLanguageModelChatInformation(_options, _token) {
				return [testProviderOptions];
			},
			async provideLanguageModelChatResponse(_model, _messages, _options, _progress, _token) {
				throw vscode.LanguageModelError.Blocked('You have been blocked ASYNC');
			},
			async provideTokenCount(_model, _text, _token) {
				return 1;
			}
		}));

		const models = await vscode.lm.selectChatModels({ id: 'test-lm' });
		assert.strictEqual(models.length, 1);


		const response = await models[0].sendRequest([vscode.LanguageModelChatMessage.User('Hello')]);
		assert.ok(response);

		let output = '';
		try {
			for await (const thing of response.text) {
				output += thing;
			}
		} catch (error) {
			assert.ok(error instanceof vscode.LanguageModelError);
			assert.strictEqual(error.message, 'You have been blocked ASYNC');
		}
		assert.strictEqual(output, '');
	});
});
