/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { setUnexpectedErrorHandler, errorHandler } from 'vs/base/common/errors';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as types from 'vs/workbench/api/node/extHostTypes';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import { Model as EditorModel } from 'vs/editor/common/model/model';
import { TestThreadService } from './testThreadService';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ICommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ExtHostLanguageFeatures } from 'vs/workbench/api/node/extHostLanguageFeatures';
import { MainThreadLanguageFeatures } from 'vs/workbench/api/electron-browser/mainThreadLanguageFeatures';
import { IHeapService } from 'vs/workbench/api/electron-browser/mainThreadHeapService';
import { ExtHostApiCommands } from 'vs/workbench/api/node/extHostApiCommands';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { ExtHostHeapService } from 'vs/workbench/api/node/extHostHeapService';
import { MainThreadCommands } from 'vs/workbench/api/electron-browser/mainThreadCommands';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import { MainContext, ExtHostContext } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostDiagnostics } from 'vs/workbench/api/node/extHostDiagnostics';
import * as vscode from 'vscode';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

const defaultSelector = { scheme: 'far' };
const model: EditorCommon.IModel = EditorModel.createFromString(
	[
		'This is the first line',
		'This is the second line',
		'This is the third line',
	].join('\n'),
	undefined,
	undefined,
	URI.parse('far://testing/file.b'));

let threadService: TestThreadService;
let extHost: ExtHostLanguageFeatures;
let mainThread: MainThreadLanguageFeatures;
let commands: ExtHostCommands;
let disposables: vscode.Disposable[] = [];
let originalErrorHandler: (e: any) => any;

suite('ExtHostLanguageFeatureCommands', function () {

	suiteSetup((done) => {

		originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(() => { });

		// Use IInstantiationService to get typechecking when instantiating
		let inst: IInstantiationService;
		{
			let instantiationService = new TestInstantiationService();
			threadService = new TestThreadService();
			instantiationService.stub(IHeapService, {
				_serviceBrand: undefined,
				trackRecursive(args) {
					// nothing
					return args;
				}
			});
			instantiationService.stub(ICommandService, {
				_serviceBrand: undefined,
				executeCommand(id, args): any {
					if (!CommandsRegistry.getCommands()[id]) {
						return TPromise.wrapError(new Error(id + ' NOT known'));
					}
					let { handler } = CommandsRegistry.getCommands()[id];
					return TPromise.as(instantiationService.invokeFunction(handler, args));
				}
			});
			instantiationService.stub(IMarkerService, new MarkerService());
			instantiationService.stub(IModelService, <IModelService>{
				_serviceBrand: IModelService,
				getModel(): any { return model; },
				createModel(): any { throw new Error(); },
				updateModel(): any { throw new Error(); },
				setMode(): any { throw new Error(); },
				destroyModel(): any { throw new Error(); },
				getModels(): any { throw new Error(); },
				onModelAdded: undefined,
				onModelModeChanged: undefined,
				onModelRemoved: undefined,
				getCreationOptions(): any { throw new Error(); }
			});
			inst = instantiationService;
		}

		const extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(threadService);
		extHostDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [{
				isDirty: false,
				versionId: model.getVersionId(),
				modeId: model.getLanguageIdentifier().language,
				url: model.uri,
				lines: model.getValue().split(model.getEOL()),
				EOL: model.getEOL(),
			}]
		});
		const extHostDocuments = new ExtHostDocuments(threadService, extHostDocumentsAndEditors);
		threadService.set(ExtHostContext.ExtHostDocuments, extHostDocuments);

		const heapService = new ExtHostHeapService();

		commands = new ExtHostCommands(threadService, heapService);
		threadService.set(ExtHostContext.ExtHostCommands, commands);
		threadService.setTestInstance(MainContext.MainThreadCommands, inst.createInstance(MainThreadCommands, threadService));
		ExtHostApiCommands.register(commands);

		const diagnostics = new ExtHostDiagnostics(threadService);
		threadService.set(ExtHostContext.ExtHostDiagnostics, diagnostics);

		extHost = new ExtHostLanguageFeatures(threadService, extHostDocuments, commands, heapService, diagnostics);
		threadService.set(ExtHostContext.ExtHostLanguageFeatures, extHost);

		mainThread = <MainThreadLanguageFeatures>threadService.setTestInstance(MainContext.MainThreadLanguageFeatures, inst.createInstance(MainThreadLanguageFeatures, threadService));

		threadService.sync().then(done, done);
	});

	suiteTeardown(() => {
		setUnexpectedErrorHandler(originalErrorHandler);
		model.dispose();
	});

	teardown(function (done) {
		while (disposables.length) {
			disposables.pop().dispose();
		}
		threadService.sync()
			.then(() => done(), err => done(err));
	});

	// --- workspace symbols

	test('WorkspaceSymbols, invalid arguments', function (done) {
		let promises = [
			commands.executeCommand('vscode.executeWorkspaceSymbolProvider'),
			commands.executeCommand('vscode.executeWorkspaceSymbolProvider', null),
			commands.executeCommand('vscode.executeWorkspaceSymbolProvider', undefined),
			commands.executeCommand('vscode.executeWorkspaceSymbolProvider', true)
		];

		// threadService.sync().then(() => {
		TPromise.join(<any[]>promises).then(undefined, (err: any[]) => {
			assert.equal(err.length, 4);
			done();
			return [];
		});
		// });
	});

	test('WorkspaceSymbols, back and forth', function (done) {

		disposables.push(extHost.registerWorkspaceSymbolProvider(<vscode.WorkspaceSymbolProvider>{
			provideWorkspaceSymbols(query): any {
				return [
					new types.SymbolInformation(query, types.SymbolKind.Array, new types.Range(0, 0, 1, 1), URI.parse('far://testing/first')),
					new types.SymbolInformation(query, types.SymbolKind.Array, new types.Range(0, 0, 1, 1), URI.parse('far://testing/second'))
				];
			}
		}));

		disposables.push(extHost.registerWorkspaceSymbolProvider(<vscode.WorkspaceSymbolProvider>{
			provideWorkspaceSymbols(query): any {
				return [
					new types.SymbolInformation(query, types.SymbolKind.Array, new types.Range(0, 0, 1, 1), URI.parse('far://testing/first'))
				];
			}
		}));

		threadService.sync().then(() => {
			commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', 'testing').then(value => {

				for (let info of value) {
					assert.ok(info instanceof types.SymbolInformation);
					assert.equal(info.name, 'testing');
					assert.equal(info.kind, types.SymbolKind.Array);
				}
				assert.equal(value.length, 3);
				done();
			}, done);
		}, done);
	});


	// --- definition

	test('Definition, invalid arguments', function (done) {
		let promises = [
			commands.executeCommand('vscode.executeDefinitionProvider'),
			commands.executeCommand('vscode.executeDefinitionProvider', null),
			commands.executeCommand('vscode.executeDefinitionProvider', undefined),
			commands.executeCommand('vscode.executeDefinitionProvider', true, false)
		];

		// threadService.sync().then(() => {
		TPromise.join(<any[]>promises).then(undefined, (err: any[]) => {
			assert.equal(err.length, 4);
			done();
			return [];
		});
		// });
	});

	test('Definition, back and forth', function () {

		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(doc: any): any {
				return new types.Location(doc.uri, new types.Range(0, 0, 0, 0));
			}
		}));
		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(doc: any): any {
				return [
					new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
					new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
					new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
				];
			}
		}));

		return threadService.sync().then(() => {
			return commands.executeCommand<vscode.Location[]>('vscode.executeDefinitionProvider', model.uri, new types.Position(0, 0)).then(values => {
				assert.equal(values.length, 4);
				for (let v of values) {
					assert.ok(v.uri instanceof URI);
					assert.ok(v.range instanceof types.Range);
				}
			});
		});
	});

	// --- references

	test('reference search, back and forth', function () {

		disposables.push(extHost.registerReferenceProvider(defaultSelector, <vscode.ReferenceProvider>{
			provideReferences(doc: any) {
				return [
					new types.Location(URI.parse('some:uri/path'), new types.Range(0, 1, 0, 5))
				];
			}
		}));

		return commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', model.uri, new types.Position(0, 0)).then(values => {
			assert.equal(values.length, 1);
			let [first] = values;
			assert.equal(first.uri.toString(), 'some:uri/path');
			assert.equal(first.range.start.line, 0);
			assert.equal(first.range.start.character, 1);
			assert.equal(first.range.end.line, 0);
			assert.equal(first.range.end.character, 5);
		});
	});

	// --- outline

	test('Outline, back and forth', function (done) {
		disposables.push(extHost.registerDocumentSymbolProvider(defaultSelector, <vscode.DocumentSymbolProvider>{
			provideDocumentSymbols(): any {
				return [
					new types.SymbolInformation('testing1', types.SymbolKind.Enum, new types.Range(1, 0, 1, 0)),
					new types.SymbolInformation('testing2', types.SymbolKind.Enum, new types.Range(0, 1, 0, 3)),
				];
			}
		}));

		threadService.sync().then(() => {
			commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeDocumentSymbolProvider', model.uri).then(values => {
				assert.equal(values.length, 2);
				let [first, second] = values;
				assert.equal(first.name, 'testing2');
				assert.equal(second.name, 'testing1');
				done();
			}, done);
		}, done);
	});

	// --- suggest

	test('Suggest, back and forth', function () {
		disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
			provideCompletionItems(doc, pos): any {
				let a = new types.CompletionItem('item1');
				let b = new types.CompletionItem('item2');
				b.textEdit = types.TextEdit.replace(new types.Range(0, 4, 0, 8), 'foo'); // overwite after
				let c = new types.CompletionItem('item3');
				c.textEdit = types.TextEdit.replace(new types.Range(0, 1, 0, 6), 'foobar'); // overwite before & after

				// snippet string!
				let d = new types.CompletionItem('item4');
				d.range = new types.Range(0, 1, 0, 4);// overwite before
				d.insertText = new types.SnippetString('foo$0bar');
				return [a, b, c, d];
			}
		}, []));

		return threadService.sync().then(() => {
			return commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', model.uri, new types.Position(0, 4)).then(list => {

				assert.ok(list instanceof types.CompletionList);
				let values = list.items;
				assert.ok(Array.isArray(values));
				assert.equal(values.length, 4);
				let [first, second, third, fourth] = values;
				assert.equal(first.label, 'item1');
				assert.equal(first.textEdit.newText, 'item1');
				assert.equal(first.textEdit.range.start.line, 0);
				assert.equal(first.textEdit.range.start.character, 0);
				assert.equal(first.textEdit.range.end.line, 0);
				assert.equal(first.textEdit.range.end.character, 4);

				assert.equal(second.label, 'item2');
				assert.equal(second.textEdit.newText, 'foo');
				assert.equal(second.textEdit.range.start.line, 0);
				assert.equal(second.textEdit.range.start.character, 4);
				assert.equal(second.textEdit.range.end.line, 0);
				assert.equal(second.textEdit.range.end.character, 8);

				assert.equal(third.label, 'item3');
				assert.equal(third.textEdit.newText, 'foobar');
				assert.equal(third.textEdit.range.start.line, 0);
				assert.equal(third.textEdit.range.start.character, 1);
				assert.equal(third.textEdit.range.end.line, 0);
				assert.equal(third.textEdit.range.end.character, 6);

				assert.equal(fourth.label, 'item4');
				assert.equal(fourth.textEdit, undefined);
				assert.equal(fourth.range.start.line, 0);
				assert.equal(fourth.range.start.character, 1);
				assert.equal(fourth.range.end.line, 0);
				assert.equal(fourth.range.end.character, 4);
				assert.ok(fourth.insertText instanceof types.SnippetString);
				assert.equal((<types.SnippetString>fourth.insertText).value, 'foo$0bar');
			});
		});
	});

	test('Suggest, return CompletionList !array', function (done) {
		disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
			provideCompletionItems(): any {
				let a = new types.CompletionItem('item1');
				let b = new types.CompletionItem('item2');
				return new types.CompletionList(<any>[a, b], true);
			}
		}, []));

		threadService.sync().then(() => {
			return commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', model.uri, new types.Position(0, 4)).then(list => {
				assert.ok(list instanceof types.CompletionList);
				assert.equal(list.isIncomplete, true);
				done();
			});
		});
	});

	// --- quickfix

	test('QuickFix, back and forth', function () {
		disposables.push(extHost.registerCodeActionProvider(defaultSelector, <vscode.CodeActionProvider>{
			provideCodeActions(): any {
				return [{ command: 'testing', title: 'Title', arguments: [1, 2, true] }];
			}
		}));

		return threadService.sync().then(() => {
			return commands.executeCommand<vscode.Command[]>('vscode.executeCodeActionProvider', model.uri, new types.Range(0, 0, 1, 1)).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;
				assert.equal(first.title, 'Title');
				assert.equal(first.command, 'testing');
				assert.deepEqual(first.arguments, [1, 2, true]);
			});
		});
	});

	// --- code lens

	test('CodeLens, back and forth', function () {

		const complexArg = {
			foo() { },
			bar() { },
			big: extHost
		};

		disposables.push(extHost.registerCodeLensProvider(defaultSelector, <vscode.CodeLensProvider>{
			provideCodeLenses(): any {
				return [new types.CodeLens(new types.Range(0, 0, 1, 1), { title: 'Title', command: 'cmd', arguments: [1, true, complexArg] })];
			}
		}));

		return threadService.sync().then(() => {
			return commands.executeCommand<vscode.CodeLens[]>('vscode.executeCodeLensProvider', model.uri).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;

				assert.equal(first.command.title, 'Title');
				assert.equal(first.command.command, 'cmd');
				assert.equal(first.command.arguments[0], 1);
				assert.equal(first.command.arguments[1], true);
				assert.equal(first.command.arguments[2], complexArg);
			});
		});
	});

	test('Links, back and forth', function () {

		disposables.push(extHost.registerDocumentLinkProvider(defaultSelector, <vscode.DocumentLinkProvider>{
			provideDocumentLinks(): any {
				return [new types.DocumentLink(new types.Range(0, 0, 0, 20), URI.parse('foo:bar'))];
			}
		}));

		return threadService.sync().then(() => {
			return commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', model.uri).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;

				assert.equal(first.target.toString(), 'foo:bar');
				assert.equal(first.range.start.line, 0);
				assert.equal(first.range.start.character, 0);
				assert.equal(first.range.end.line, 0);
				assert.equal(first.range.end.character, 20);
			});
		});
	});
});
