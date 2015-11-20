/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {create} from 'vs/base/common/types';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {PluginHostDocument} from 'vs/workbench/api/common/pluginHostDocuments';
import * as phTypes from 'vs/workbench/api/common/pluginHostTypes';
import {Range as CodeEditorRange} from 'vs/editor/common/core/range';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import {NullThreadService} from 'vs/platform/test/common/nullThreadService'
import * as LF from 'vs/workbench/api/common/languageFeatures';
import {PluginHostCommands, MainThreadCommands} from 'vs/workbench/api/common/pluginHostCommands';
import {PluginHostModelService} from 'vs/workbench/api/common/pluginHostDocuments';
import {SyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';
import QuickOutlineRegistry from 'vs/editor/contrib/quickOpen/common/quickOpen';
import {LanguageSelector, ModelLike} from 'vs/editor/common/modes/languageSelector';

class ThreadService extends NullThreadService {

	protected _registerAndInstantiateMainProcessActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {

		let instance: any;

		return this._getOrCreateProxyInstance({
			callOnRemote: (proxyId: string, path: string, args: any[]): TPromise<any> => {
				if (!instance) {
					instance = create(descriptor.ctor, this);
				}
				try {
					let result = (<Function>instance[path]).apply(instance, args);
					return TPromise.is(result) ? result : TPromise.as(result);
				} catch (err) {
					return TPromise.wrapError(err);
				}
			}
		}, id, descriptor)
	}

	protected _registerAndInstantiatePluginHostActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		return this._getOrCreateLocalInstance(id, descriptor);
	}
}

let threadService: ThreadService;
let model: ModelLike = { language: 'far', uri: URI.parse('far://testing/file.a') };

let extHost: LF.ExtensionHostDocumentSymbols;
let mainHost: LF.MainThreadDocumentSymbols;

suite('ExtHostLanguageFeatures', function() {

	suiteSetup(() => {
		threadService = new ThreadService();
		let documents = threadService.getRemotable(PluginHostModelService);
		documents._acceptModelAdd({
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
		threadService.getRemotable(LF.MainThreadDocumentSymbols);
		extHost = new LF.ExtensionHostDocumentSymbols(threadService);
		mainHost = threadService.getRemotable(LF.MainThreadDocumentSymbols);
	});

	test('DocumentSymbols, register/deregister', function() {


		// register
		assert.equal(QuickOutlineRegistry.all(model).length, 0);
		let disposable = extHost.register('far', {
			provideDocumentSymbols() {
				return [];
			}
		});
		assert.equal(QuickOutlineRegistry.all(model).length, 1);

		// deregister
		disposable.dispose();
		assert.equal(QuickOutlineRegistry.all(model).length, 0);

		// all extension host provider appear as one
		disposable = extHost.register('far', {
			provideDocumentSymbols() {
				return [];
			}
		});
		let disposable2 = extHost.register('far', {
			provideDocumentSymbols() {
				return [];
			}
		});
		assert.equal(QuickOutlineRegistry.all(model).length, 1);

		disposable.dispose();
		assert.equal(QuickOutlineRegistry.all(model).length, 1);
		disposable2.dispose();
		assert.equal(QuickOutlineRegistry.all(model).length, 0);
	});

	test('DocumentSymbols, evil provider', function(done) {


		let disposable = extHost.register('far', {
			provideDocumentSymbols():any {
				throw new Error('ddd');
			}
		});
		let disposable2 = extHost.register('far', {
			provideDocumentSymbols():any {
				return [
					new phTypes.SymbolInformation('boo', phTypes.SymbolKind.Field, new phTypes.Range(0, 0, 0, 0))
				];
			}
		});

		mainHost.getOutline(model.uri).then(result => {
			assert.equal(result.length, 1);
			done();

			disposable.dispose();
			disposable2.dispose();

		}, err => {
			done(err);
		});
	});

	test('DocumentSymbols, data conversion', function(done) {

		let d = extHost.register('far', {
			provideDocumentSymbols():any {
				return [
					new phTypes.SymbolInformation('boo',
						phTypes.SymbolKind.Field,
						new phTypes.Range(0, 0, 0, 0),
						model.uri,
						'far')
				];
			}
		});

		mainHost.getOutline(model.uri).then(result => {
			assert.equal(result.length, 1);
			let entry = result[0];

			assert.equal(entry.label, 'boo');
			assert.equal(entry.containerLabel, 'far');
			assert.equal(entry.children, undefined);
			assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
			d.dispose();
			done();

		}, err => {
			done(err);
		});

	});
});