/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {setUnexpectedErrorHandler, errorHandler} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import * as types from 'vs/workbench/api/node/extHostTypes';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import {Model as EditorModel} from 'vs/editor/common/model/model';
import {TestThreadService} from './testThreadService';
import {createInstantiationService as createInstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {MainProcessMarkerService} from 'vs/platform/markers/common/markerService';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ExtHostLanguageFeatures, MainThreadLanguageFeatures} from 'vs/workbench/api/node/extHostLanguageFeatures';
import {registerApiCommands} from 'vs/workbench/api/node/extHostApiCommands';
import {ExtHostCommands, MainThreadCommands} from 'vs/workbench/api/node/extHostCommands';
import {ExtHostModelService} from 'vs/workbench/api/node/extHostDocuments';

const defaultSelector = { scheme: 'far' };
const model: EditorCommon.IModel = new EditorModel(
	[
		'This is the first line',
		'This is the second line',
		'This is the third line',
	].join('\n'),
	EditorModel.DEFAULT_CREATION_OPTIONS,
	undefined,
	URI.parse('far://testing/file.b'));

let threadService: TestThreadService;
let extHost: ExtHostLanguageFeatures;
let mainThread: MainThreadLanguageFeatures;
let commands: ExtHostCommands;
let disposables: vscode.Disposable[] = [];
let originalErrorHandler: (e: any) => any;

suite('ExtHostLanguageFeatureCommands', function() {

	suiteSetup((done) => {

		originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(() => { });

		let instantiationService = createInstantiationService();
		threadService = new TestThreadService(instantiationService);

		instantiationService.addSingleton(IKeybindingService, <IKeybindingService>{
			executeCommand(id, args): any {
				let handler = KeybindingsRegistry.getCommands()[id];
				return TPromise.as(instantiationService.invokeFunction(handler, args));
			}
		});
		instantiationService.addSingleton(IMarkerService, new MainProcessMarkerService(threadService));
		instantiationService.addSingleton(IThreadService, threadService);
		instantiationService.addSingleton(IModelService, <IModelService>{
			serviceId: IModelService,
			getModel(): any { return model; },
			createModel(): any { throw new Error(); },
			destroyModel(): any { throw new Error(); },
			getModels(): any { throw new Error(); },
			onModelAdded: undefined,
			onModelModeChanged: undefined,
			onModelRemoved: undefined,
			getCreationOptions(): any { throw new Error(); }
		});

		threadService.getRemotable(ExtHostModelService)._acceptModelAdd({
			isDirty: false,
			versionId: model.getVersionId(),
			modeId: model.getModeId(),
			url: model.getAssociatedResource(),
			value: {
				EOL: model.getEOL(),
				lines: model.getValue().split(model.getEOL()),
				BOM: '',
				length: -1,
				options: {
					tabSize: 4,
					insertSpaces: true,
					defaultEOL: EditorCommon.DefaultEndOfLine.LF
				}
			},
		});

		threadService.getRemotable(MainThreadCommands);
		commands = threadService.getRemotable(ExtHostCommands);
		registerApiCommands(threadService);
		mainThread = threadService.getRemotable(MainThreadLanguageFeatures);
		extHost = threadService.getRemotable(ExtHostLanguageFeatures);

		threadService.sync().then(done, done);
	});

	suiteTeardown(() => {
		setUnexpectedErrorHandler(originalErrorHandler);
		model.dispose();
	});

	teardown(function(done) {
		while (disposables.length) {
			disposables.pop().dispose();
		}
		threadService.sync()
			.then(() => done(), err => done(err));
	});

	// --- workspace symbols

	test('WorkspaceSymbols, invalid arguments', function(done) {
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

	test('WorkspaceSymbols, back and forth', function(done) {

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

	test('Definition, invalid arguments', function(done) {
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

	test('Definition, back and forth', function(done) {

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

		threadService.sync().then(() => {
			commands.executeCommand<vscode.Location[]>('vscode.executeDefinitionProvider', model.getAssociatedResource(), new types.Position(0, 0)).then(values => {
				assert.equal(values.length, 4);
				done();
			}, done);
		}, done);
	});

	// --- outline

	test('Outline, back and forth', function(done) {
		disposables.push(extHost.registerDocumentSymbolProvider(defaultSelector, <vscode.DocumentSymbolProvider>{
			provideDocumentSymbols(): any {
				return [
					new types.SymbolInformation('testing1', types.SymbolKind.Enum, new types.Range(1, 0, 1, 0)),
					new types.SymbolInformation('testing2', types.SymbolKind.Enum, new types.Range(0, 1, 0, 3)),
				];
			}
		}));

		threadService.sync().then(() => {
			commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeDocumentSymbolProvider', model.getAssociatedResource()).then(values => {
				assert.equal(values.length, 2);
				let [first, second] = values;
				assert.equal(first.name, 'testing2');
				assert.equal(second.name, 'testing1');
				done();
			}, done);
		}, done);
	});

	// --- suggest

	test('Suggest, back and forth', function(done) {
		disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
			provideCompletionItems(doc, pos): any {
				let a = new types.CompletionItem('item1');
				let b = new types.CompletionItem('item2');
				b.textEdit = types.TextEdit.replace(new types.Range(0, 4, 0, 8), 'foo'); // overwite after
				let c = new types.CompletionItem('item3');
				c.textEdit = types.TextEdit.replace(new types.Range(0, 1, 0, 6), 'foobar'); // overwite before & after
				let d = new types.CompletionItem('item4');
				d.textEdit = types.TextEdit.replace(new types.Range(0, 1, 0, 4), ''); // overwite before
				return [a, b, c, d];
			}
		}, []));

		threadService.sync().then(() => {
			commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', model.getAssociatedResource(), new types.Position(0, 4)).then(list => {
				try {
					assert.ok(list instanceof types.CompletionList);
					let values = list.items;
					assert.ok(Array.isArray(values));
					assert.equal(values.length, 4);
					let [first, second, third, forth] = values;
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

					assert.equal(forth.label, 'item4');
					assert.equal(forth.textEdit.newText, '');
					assert.equal(forth.textEdit.range.start.line, 0);
					assert.equal(forth.textEdit.range.start.character, 1);
					assert.equal(forth.textEdit.range.end.line, 0);
					assert.equal(forth.textEdit.range.end.character, 4);
					done();
				} catch (e) {
					done(e);
				}
			}, done);
		}, done);
	});

	test('Suggest, return CompletionList !array', function(done) {
		disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
			provideCompletionItems(): any {
				let a = new types.CompletionItem('item1');
				let b = new types.CompletionItem('item2');
				return new types.CompletionList(<any> [a,b], true);
			}
		}, []));

		threadService.sync().then(() => {
			return commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', model.getAssociatedResource(), new types.Position(0, 4)).then(list => {
				assert.ok(list instanceof types.CompletionList);
				assert.equal(list.isIncomplete, true);
				done();
			});
		});
	});

	// --- quickfix

	test('QuickFix, back and forth', function(done) {
		disposables.push(extHost.registerCodeActionProvider(defaultSelector, <vscode.CodeActionProvider>{
			provideCodeActions(): any {
				return [{ command: 'testing', title: 'Title', arguments: [1, 2, true] }];
			}
		}));

		threadService.sync().then(() => {
			commands.executeCommand<vscode.Command[]>('vscode.executeCodeActionProvider', model.getAssociatedResource(), new types.Range(0, 0, 1, 1)).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;
				assert.equal(first.title, 'Title');
				assert.equal(first.command, 'testing');
				assert.deepEqual(first.arguments, [1, 2, true]);
				done();
			}, done);
		});
	});

	// --- code lens

	test('CodeLens, back and forth', function(done) {

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

		threadService.sync().then(() => {
			commands.executeCommand<vscode.CodeLens[]>('vscode.executeCodeLensProvider', model.getAssociatedResource()).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;

				assert.equal(first.command.title, 'Title');
				assert.equal(first.command.command, 'cmd');
				assert.equal(first.command.arguments[0], 1);
				assert.equal(first.command.arguments[1], true);
				assert.equal(first.command.arguments[2], complexArg);
				done();
			}, done);
		});
	});
});
