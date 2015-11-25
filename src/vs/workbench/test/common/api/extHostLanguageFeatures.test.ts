/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {setUnexpectedErrorHandler, errorHandler} from 'vs/base/common/errors';
import {create} from 'vs/base/common/types';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {PluginHostDocument} from 'vs/workbench/api/common/pluginHostDocuments';
import * as phTypes from 'vs/workbench/api/common/pluginHostTypes';
import {Range as CodeEditorRange} from 'vs/editor/common/core/range';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import threadService from './testThreadService'
import {ExtHostLanguageFeatures, MainThreadLanguageFeatures} from 'vs/workbench/api/common/extHostLanguageFeatures';
import {PluginHostCommands, MainThreadCommands} from 'vs/workbench/api/common/pluginHostCommands';
import {PluginHostModelService} from 'vs/workbench/api/common/pluginHostDocuments';
import {SyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';
import {OutlineRegistry, getOutlineEntries} from 'vs/editor/contrib/quickOpen/common/quickOpen';
import {LanguageSelector, ModelLike} from 'vs/editor/common/modes/languageSelector';


let model: ModelLike;
let extHost: ExtHostLanguageFeatures;
let mainThread: MainThreadLanguageFeatures;
let disposables: vscode.Disposable[] = [];
let originalErrorHandler: (e: any) => any;

suite('ExtHostLanguageFeatures', function() {

	suiteSetup(() => {

		originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(() => { });

		model = {
			language: 'far',
			uri: URI.parse('far://testing/file.a')
		};

		threadService.getRemotable(PluginHostModelService)._acceptModelAdd({
			isDirty: false,
			versionId: 1,
			modeId: 'far',
			url: model.uri,
			value: {
				EOL: '\n',
				lines: [
					'This is the first line',
					'This is the second line',
					'This is the third line',
				],
				BOM: '',
				length: -1
			},
		})

		threadService.getRemotable(PluginHostCommands);
		threadService.getRemotable(MainThreadCommands);
		mainThread = threadService.getRemotable(MainThreadLanguageFeatures);
		extHost = threadService.getRemotable(ExtHostLanguageFeatures);
	});

	suiteTeardown(() => {
		setUnexpectedErrorHandler(originalErrorHandler);
	});

	teardown(function(done) {
		while (disposables.length) {
			disposables.pop().dispose();
		}
		threadService.sync()
			.then(() => done(), err => done(err));
	});

	test('DocumentSymbols, register/deregister', function(done) {
		assert.equal(OutlineRegistry.all(model).length, 0);
		let d1 = extHost.registerDocumentSymbolProvider('far', <vscode.DocumentSymbolProvider>{
			provideDocumentSymbols() {
				return [];
			}
		});

		threadService.sync().then(() => {
			assert.equal(OutlineRegistry.all(model).length, 1);
			d1.dispose();
			threadService.sync().then(() => {
				done();
			});
		});

	});

	test('DocumentSymbols, evil provider', function(done) {
		disposables.push(extHost.registerDocumentSymbolProvider('far', <vscode.DocumentSymbolProvider>{
			provideDocumentSymbols(): any {
				throw new Error('evil document symbol provider');
			}
		}));
		disposables.push(extHost.registerDocumentSymbolProvider('far', <vscode.DocumentSymbolProvider>{
			provideDocumentSymbols(): any {
				return [new phTypes.SymbolInformation('test', phTypes.SymbolKind.Field, new phTypes.Range(0, 0, 0, 0))];
			}
		}));

		threadService.sync().then(() => {

			getOutlineEntries(model).then(value => {
				assert.equal(value.entries.length, 1);
				done();
			}, err => {
				done(err);
			});
		});
	});

	test('DocumentSymbols, data conversion', function(done) {
		disposables.push(extHost.registerDocumentSymbolProvider('far', <vscode.DocumentSymbolProvider>{
			provideDocumentSymbols(): any {
				return [new phTypes.SymbolInformation('test', phTypes.SymbolKind.Field, new phTypes.Range(0, 0, 0, 0))];
			}
		}));

		threadService.sync().then(() => {

			getOutlineEntries(model).then(value => {
				assert.equal(value.entries.length, 1);

				let entry = value.entries[0];
				assert.equal(entry.label, 'test');
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
				done();

			}, err => {
				done(err);
			});
		});
	});
});