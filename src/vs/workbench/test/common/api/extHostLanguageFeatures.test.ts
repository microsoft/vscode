/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {create} from 'vs/base/common/types';
import URI from 'vs/base/common/uri';
import * as LF from 'vs/workbench/api/common/extHostLanguageFeatures';
import {PluginHostModelService, BaseTextDocument} from 'vs/workbench/api/common/pluginHostDocuments';
import * as pluginHostTypes from 'vs/workbench/api/common/pluginHostTypes';
import {Range as CodeEditorRange} from 'vs/editor/common/core/range';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import QuickOutlineRegistry from 'vs/editor/contrib/quickOpen/common/quickOpen';
import {AbstractThreadService} from 'vs/platform/thread/common/abstractThreadService'
import {SyncDescriptor, SyncDescriptor0, createSyncDescriptor, AsyncDescriptor0, AsyncDescriptor1, AsyncDescriptor2, AsyncDescriptor3} from 'vs/platform/instantiation/common/descriptors';

const threadService = <any>{
	getRemotable() {
		return {};
	}
};

class Documents extends PluginHostModelService {

	private _document: BaseTextDocument;

	constructor() {
		super(threadService);

		this._document = new BaseTextDocument(URI.parse('fake://tests/a.file'),
			[
				'this is line one',
				'this is line two',
				'this is line three',
			],
			'\n', 'testing', 1, false);
	}

	public getDocument(resource: vscode.Uri): BaseTextDocument {
		return this._document;
	}
}

const documents = new Documents();

class ExtHostLF extends LF.ExtHostLanguageFeatures {
	constructor() {
		super(threadService);
		this._documents = documents;
	}
	set proxy(p:LF.MainThreadLanguageFeatures) {
		this._proxy = p;
	}
}


class MainThreadLF extends LF.MainThreadLanguageFeatures {
	constructor() {
		super(threadService);
	}
	set proxy(p: LF.ExtHostLanguageFeatures) {
		this._proxy = p;
	}
}

const extHostLanguageFeatures = new ExtHostLF();
const mainThreadLanguageFeatures = new MainThreadLF();
extHostLanguageFeatures.proxy = mainThreadLanguageFeatures;
mainThreadLanguageFeatures.proxy = extHostLanguageFeatures;

let model = { language: 'testing', uri: URI.parse('fake://tests/a.file') };

suite('ExtHostLanguageFeatures', function() {

	test('outline, register & unregister', function() {

		let count = QuickOutlineRegistry.all(model).length;

		let sub1 = extHostLanguageFeatures.registerDocumentSymbolProvider('testing', <vscode.DocumentSymbolProvider>{
			provideDocumentSymbols(document: vscode.TextDocument) {
				let info = <any>new pluginHostTypes.SymbolInformation('test',
					pluginHostTypes.SymbolKind.File,
					<any>document.lineAt(1).range);
				return [info];
			}
		});

		let sub2 = extHostLanguageFeatures.registerDocumentSymbolProvider('testing', <vscode.DocumentSymbolProvider>{
			provideDocumentSymbols(document: vscode.TextDocument) {
				let info = <any>new pluginHostTypes.SymbolInformation('test',
					pluginHostTypes.SymbolKind.File,
					<any>document.lineAt(1).range);
				return [info];
			}
		});

		let count2 = QuickOutlineRegistry.all(model).length;
		assert.equal(count2, count + 2);

		sub1.dispose();
		assert.equal(QuickOutlineRegistry.all(model).length, count2 - 1);
		sub2.dispose();
	});

	test('outline, get data', function(done) {

		let disposable = extHostLanguageFeatures.registerDocumentSymbolProvider('testing', <vscode.DocumentSymbolProvider>{
			provideDocumentSymbols(document: vscode.TextDocument) {
				let info = <any>new pluginHostTypes.SymbolInformation('test',
					pluginHostTypes.SymbolKind.File,
					<any>document.lineAt(1).range);
				return [info];
			}
		});

		let promise = QuickOutlineRegistry.all(model)[0].getOutline(<any>model.uri);
		promise.then(entries => {
			assert.equal(1, entries.length);
			disposable.dispose();
			done();
		}, done);
	});

	test('outline, bad provider', function(done) {

		let disposable = extHostLanguageFeatures.registerDocumentSymbolProvider('testing', {
			provideDocumentSymbols():any {
				throw new Error('dddd');
			}
		});

		let promise = QuickOutlineRegistry.all(model)[0].getOutline(<any>model.uri);
		promise.then(() => done(new Error('should have failed')), err => done());

	});
});