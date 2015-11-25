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
import * as types from 'vs/workbench/api/common/pluginHostTypes';
import {Range as CodeEditorRange} from 'vs/editor/common/core/range';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import threadService from './testThreadService'
import {ExtHostLanguageFeatures, MainThreadLanguageFeatures} from 'vs/workbench/api/common/extHostLanguageFeatures';
import {PluginHostCommands, MainThreadCommands} from 'vs/workbench/api/common/pluginHostCommands';
import {PluginHostModelService} from 'vs/workbench/api/common/pluginHostDocuments';
import {SyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';
import {LanguageSelector, ModelLike} from 'vs/editor/common/modes/languageSelector';
import {OutlineRegistry, getOutlineEntries} from 'vs/editor/contrib/quickOpen/common/quickOpen';
import {CodeLensRegistry, getCodeLensData} from 'vs/editor/contrib/codelens/common/codelens';
import {DeclarationRegistry, getDeclarationsAtPosition} from 'vs/editor/contrib/goToDeclaration/common/goToDeclaration';

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

	// --- outline

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
				return [new types.SymbolInformation('test', types.SymbolKind.Field, new types.Range(0, 0, 0, 0))];
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
				return [new types.SymbolInformation('test', types.SymbolKind.Field, new types.Range(0, 0, 0, 0))];
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

	// --- code lens

	test('CodeLens, evil provider', function(done) {

		disposables.push(extHost.registerCodeLensProvider('far', <vscode.CodeLensProvider>{
			provideCodeLenses():any {
				throw new Error('evil')
			}
		}));
		disposables.push(extHost.registerCodeLensProvider('far', <vscode.CodeLensProvider>{
			provideCodeLenses() {
				return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
			}
		}));

		threadService.sync().then(() => {
			getCodeLensData(model.uri, model.language).then(value => {
				assert.equal(value.length, 1);
				done();
			});
		});
	});

	test('CodeLens, do not resolve a resolved lens', function(done) {

		disposables.push(extHost.registerCodeLensProvider('far', <vscode.CodeLensProvider>{
			provideCodeLenses():any {
				return [new types.CodeLens(
					new types.Range(0, 0, 0, 0),
					{ command: 'id', title: 'Title' })];
			},
			resolveCodeLens():any {
				assert.ok(false, 'do not resolve');
			}
		}));

		threadService.sync().then(() => {

			getCodeLensData(model.uri, model.language).then(value => {
				assert.equal(value.length, 1);
				let data = value[0];

				data.support.resolveCodeLensSymbol(model.uri, data.symbol).then(command => {
					assert.equal(command.id, 'id');
					assert.equal(command.title, 'Title');
					done();
				});
			});
		});
	});

	test('CodeLens, missing command', function(done) {

		disposables.push(extHost.registerCodeLensProvider('far', <vscode.CodeLensProvider>{
			provideCodeLenses() {
				return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
			}
		}));

		threadService.sync().then(() => {

			getCodeLensData(model.uri, model.language).then(value => {
				assert.equal(value.length, 1);

				let data = value[0];
				data.support.resolveCodeLensSymbol(model.uri, data.symbol).then(command => {

					assert.equal(command.id, 'missing');
					assert.equal(command.title, '<<MISSING COMMAND>>');
					done();
				});
			});
		});
	});

	// --- definition

	test('Definition, data conversion', function(done) {

		disposables.push(extHost.registerDefinitionProvider('far', <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
			}
		}));

		threadService.sync().then(() => {

			getDeclarationsAtPosition(model.uri, 'far', { lineNumber: 1, column: 1 }).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
				assert.equal(entry.resource.toString(), model.uri.toString());
				done();
			}, err => {
				done(err);
			});
		});
	});

	test('Definition, one or many', function(done) {

		disposables.push(extHost.registerDefinitionProvider('far', <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return [new types.Location(model.uri, new types.Range(1, 1, 1, 1))];
			}
		}));
		disposables.push(extHost.registerDefinitionProvider('far', <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return new types.Location(model.uri, new types.Range(1, 1, 1, 1));
			}
		}));

		threadService.sync().then(() => {

			getDeclarationsAtPosition(model.uri, 'far', { lineNumber: 1, column: 1 }).then(value => {
				assert.equal(value.length, 2);
				done();
			}, err => {
				done(err);
			});
		});
	});

	test('Definition, registration order', function(done) {

		disposables.push(extHost.registerDefinitionProvider('far', <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return [new types.Location(URI.parse('far://first'), new types.Range(2, 3, 4, 5))];
			}
		}));

		setTimeout(function() { // registration time matters
			disposables.push(extHost.registerDefinitionProvider('far', <vscode.DefinitionProvider>{
				provideDefinition(): any {
					return new types.Location(URI.parse('far://second'), new types.Range(1, 2, 3, 4));
				}
			}));

			threadService.sync().then(() => {

				getDeclarationsAtPosition(model.uri, 'far', { lineNumber: 1, column: 1 }).then(value => {
					assert.equal(value.length, 2);
					// let [first, second] = value;

					assert.equal(value[0].resource.authority, 'second');
					assert.equal(value[1].resource.authority, 'first');
					done();

				}, err => {
					done(err);
				});
			});
		}, 10);
	});

	test('Definition, evil provider', function(done) {

		disposables.push(extHost.registerDefinitionProvider('far', <vscode.DefinitionProvider>{
			provideDefinition(): any {
				throw new Error('evil provider')
			}
		}));
		disposables.push(extHost.registerDefinitionProvider('far', <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return new types.Location(model.uri, new types.Range(1, 1, 1, 1));
			}
		}));

		threadService.sync().then(() => {

			getDeclarationsAtPosition(model.uri, 'far', { lineNumber: 1, column: 1 }).then(value => {
				assert.equal(value.length, 1);
				done();
			}, err => {
				done(err);
			});
		});
	});
});