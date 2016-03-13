/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {setUnexpectedErrorHandler, errorHandler} from 'vs/base/common/errors';
import {create} from 'vs/base/common/types';
import URI from 'vs/base/common/uri';
import * as types from 'vs/workbench/api/node/extHostTypes';
import {Range as CodeEditorRange} from 'vs/editor/common/core/range';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import {Model as EditorModel} from 'vs/editor/common/model/model';
import {TestThreadService} from './testThreadService'
import {createInstantiationService as createInstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {MainProcessMarkerService} from 'vs/platform/markers/common/markerService';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {ExtHostLanguageFeatures, MainThreadLanguageFeatures} from 'vs/workbench/api/node/extHostLanguageFeatures';
import {ExtHostCommands, MainThreadCommands} from 'vs/workbench/api/node/extHostCommands';
import {ExtHostModelService} from 'vs/workbench/api/node/extHostDocuments';
import {OutlineRegistry, getOutlineEntries} from 'vs/editor/contrib/quickOpen/common/quickOpen';
import {getCodeLensData} from 'vs/editor/contrib/codelens/common/codelens';
import {getDeclarationsAtPosition} from 'vs/editor/contrib/goToDeclaration/common/goToDeclaration';
import {getExtraInfoAtPosition} from 'vs/editor/contrib/hover/common/hover';
import {getOccurrencesAtPosition} from 'vs/editor/contrib/wordHighlighter/common/wordHighlighter';
import {findReferences} from 'vs/editor/contrib/referenceSearch/common/referenceSearch';
import {getQuickFixes} from 'vs/editor/contrib/quickFix/common/quickFix';
import {getNavigateToItems} from 'vs/workbench/parts/search/common/search';
import {rename} from 'vs/editor/contrib/rename/common/rename';
import {getParameterHints} from 'vs/editor/contrib/parameterHints/common/parameterHints';
import {suggest} from 'vs/editor/contrib/suggest/common/suggest';
import {formatDocument, formatRange, formatAfterKeystroke} from 'vs/editor/contrib/format/common/format';

const defaultSelector = { scheme: 'far' };
const model: EditorCommon.IModel = new EditorModel(
	[
		'This is the first line',
		'This is the second line',
		'This is the third line',
	].join('\n'),
	EditorModel.DEFAULT_CREATION_OPTIONS,
	undefined,
	URI.parse('far://testing/file.a'));

let extHost: ExtHostLanguageFeatures;
let mainThread: MainThreadLanguageFeatures;
let disposables: vscode.Disposable[] = [];
let threadService: TestThreadService;
let originalErrorHandler: (e: any) => any;

suite('ExtHostLanguageFeatures', function() {

	suiteSetup(() => {

		let instantiationService = createInstantiationService();
		threadService = new TestThreadService(instantiationService);
		instantiationService.addSingleton(IMarkerService, new MainProcessMarkerService(threadService));
		instantiationService.addSingleton(IThreadService, threadService);

		originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(() => { });

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

		threadService.getRemotable(ExtHostCommands);
		threadService.getRemotable(MainThreadCommands);
		mainThread = threadService.getRemotable(MainThreadLanguageFeatures);
		extHost = threadService.getRemotable(ExtHostLanguageFeatures);
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

	// --- outline

	test('DocumentSymbols, register/deregister', function(done) {
		assert.equal(OutlineRegistry.all(model).length, 0);
		let d1 = extHost.registerDocumentSymbolProvider(defaultSelector, <vscode.DocumentSymbolProvider>{
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
		disposables.push(extHost.registerDocumentSymbolProvider(defaultSelector, <vscode.DocumentSymbolProvider>{
			provideDocumentSymbols(): any {
				throw new Error('evil document symbol provider');
			}
		}));
		disposables.push(extHost.registerDocumentSymbolProvider(defaultSelector, <vscode.DocumentSymbolProvider>{
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
		disposables.push(extHost.registerDocumentSymbolProvider(defaultSelector, <vscode.DocumentSymbolProvider>{
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

		disposables.push(extHost.registerCodeLensProvider(defaultSelector, <vscode.CodeLensProvider>{
			provideCodeLenses(): any {
				throw new Error('evil')
			}
		}));
		disposables.push(extHost.registerCodeLensProvider(defaultSelector, <vscode.CodeLensProvider>{
			provideCodeLenses() {
				return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
			}
		}));

		threadService.sync().then(() => {
			getCodeLensData(model).then(value => {
				assert.equal(value.length, 1);
				done();
			});
		});
	});

	test('CodeLens, do not resolve a resolved lens', function(done) {

		disposables.push(extHost.registerCodeLensProvider(defaultSelector, <vscode.CodeLensProvider>{
			provideCodeLenses(): any {
				return [new types.CodeLens(
					new types.Range(0, 0, 0, 0),
					{ command: 'id', title: 'Title' })];
			},
			resolveCodeLens(): any {
				assert.ok(false, 'do not resolve');
			}
		}));

		threadService.sync().then(() => {

			getCodeLensData(model).then(value => {
				assert.equal(value.length, 1);
				let data = value[0];

				data.support.resolveCodeLensSymbol(model.getAssociatedResource(), data.symbol).then(symbol => {
					assert.equal(symbol.command.id, 'id');
					assert.equal(symbol.command.title, 'Title');
					done();
				});
			});
		});
	});

	test('CodeLens, missing command', function(done) {

		disposables.push(extHost.registerCodeLensProvider(defaultSelector, <vscode.CodeLensProvider>{
			provideCodeLenses() {
				return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
			}
		}));

		threadService.sync().then(() => {

			getCodeLensData(model).then(value => {
				assert.equal(value.length, 1);

				let data = value[0];
				data.support.resolveCodeLensSymbol(model.getAssociatedResource(), data.symbol).then(symbol => {

					assert.equal(symbol.command.id, 'missing');
					assert.equal(symbol.command.title, '<<MISSING COMMAND>>');
					done();
				});
			});
		});
	});

	// --- definition

	test('Definition, data conversion', function(done) {

		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return [new types.Location(model.getAssociatedResource(), new types.Range(1, 2, 3, 4))];
			}
		}));

		threadService.sync().then(() => {

			getDeclarationsAtPosition(model, { lineNumber: 1, column: 1 }).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
				assert.equal(entry.resource.toString(), model.getAssociatedResource().toString());
				done();
			}, err => {
				done(err);
			});
		});
	});

	test('Definition, one or many', function(done) {

		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return [new types.Location(model.getAssociatedResource(), new types.Range(1, 1, 1, 1))];
			}
		}));
		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return new types.Location(model.getAssociatedResource(), new types.Range(1, 1, 1, 1));
			}
		}));

		threadService.sync().then(() => {

			getDeclarationsAtPosition(model, { lineNumber: 1, column: 1 }).then(value => {
				assert.equal(value.length, 2);
				done();
			}, err => {
				done(err);
			});
		});
	});

	test('Definition, registration order', function(done) {

		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return [new types.Location(URI.parse('far://first'), new types.Range(2, 3, 4, 5))];
			}
		}));

		setTimeout(function() { // registration time matters
			disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
				provideDefinition(): any {
					return new types.Location(URI.parse('far://second'), new types.Range(1, 2, 3, 4));
				}
			}));

			threadService.sync().then(() => {

				getDeclarationsAtPosition(model, { lineNumber: 1, column: 1 }).then(value => {
					assert.equal(value.length, 2);
					// let [first, second] = value;

					assert.equal(value[0].resource.authority, 'second');
					assert.equal(value[1].resource.authority, 'first');
					done();

				}, err => {
					done(err);
				});
			});
		}, 5);
	});

	test('Definition, evil provider', function(done) {

		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(): any {
				throw new Error('evil provider')
			}
		}));
		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return new types.Location(model.getAssociatedResource(), new types.Range(1, 1, 1, 1));
			}
		}));

		threadService.sync().then(() => {

			getDeclarationsAtPosition(model, { lineNumber: 1, column: 1 }).then(value => {
				assert.equal(value.length, 1);
				done();
			}, err => {
				done(err);
			});
		});
	});

	// --- extra info

	test('ExtraInfo, word range at pos', function(done) {

		disposables.push(extHost.registerHoverProvider(defaultSelector, <vscode.HoverProvider>{
			provideHover(): any {
				return new types.Hover('Hello')
			}
		}));

		threadService.sync().then(() => {

			getExtraInfoAtPosition(model, { lineNumber: 1, column: 1 }).then(value => {

				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
				done();
			});
		});
	});

	test('ExtraInfo, given range', function(done) {

		disposables.push(extHost.registerHoverProvider(defaultSelector, <vscode.HoverProvider>{
			provideHover(): any {
				return new types.Hover('Hello', new types.Range(3, 0, 8, 7));
			}
		}));

		threadService.sync().then(() => {

			getExtraInfoAtPosition(model, { lineNumber: 1, column: 1 }).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 4, startColumn: 1, endLineNumber: 9, endColumn: 8 });
				done();
			});
		});
	});

	test('ExtraInfo, registration order', function(done) {

		disposables.push(extHost.registerHoverProvider(defaultSelector, <vscode.HoverProvider>{
			provideHover(): any {
				return new types.Hover('registered first');
			}
		}));

		setTimeout(function() {
			disposables.push(extHost.registerHoverProvider(defaultSelector, <vscode.HoverProvider>{
				provideHover(): any {
					return new types.Hover('registered second');
				}
			}));

			threadService.sync().then(() => {

				getExtraInfoAtPosition(model, { lineNumber: 1, column: 1 }).then(value => {
					assert.equal(value.length, 2);
					let [first, second] = value;
					assert.equal(first.htmlContent[0].markdown, 'registered second');
					assert.equal(second.htmlContent[0].markdown, 'registered first');
					done();
				});
			});

		}, 5);

	});

	test('ExtraInfo, evil provider', function(done) {

		disposables.push(extHost.registerHoverProvider(defaultSelector, <vscode.HoverProvider>{
			provideHover(): any {
				throw new Error('evil')
			}
		}));
		disposables.push(extHost.registerHoverProvider(defaultSelector, <vscode.HoverProvider>{
			provideHover(): any {
				return new types.Hover('Hello')
			}
		}));

		threadService.sync().then(() => {

			getExtraInfoAtPosition(model, { lineNumber: 1, column: 1 }).then(value => {

				assert.equal(value.length, 1);
				done();
			});
		});
	});

	// --- occurrences

	test('Occurrences, data conversion', function(done) {

		disposables.push(extHost.registerDocumentHighlightProvider(defaultSelector, <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))]
			}
		}));

		threadService.sync().then(() => {

			getOccurrencesAtPosition(model, { lineNumber: 1, column: 2 }).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
				assert.equal(entry.kind, 'text');
				done();
			});
		});
	});

	test('Occurrences, order 1/2', function(done) {

		disposables.push(extHost.registerDocumentHighlightProvider(defaultSelector, <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				return []
			}
		}));
		disposables.push(extHost.registerDocumentHighlightProvider('*', <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))]
			}
		}));

		threadService.sync().then(() => {

			getOccurrencesAtPosition(model, { lineNumber: 1, column: 2 }).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
				assert.equal(entry.kind, 'text');
				done();
			});
		});
	});

	test('Occurrences, order 2/2', function(done) {

		disposables.push(extHost.registerDocumentHighlightProvider(defaultSelector, <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 2))]
			}
		}));
		disposables.push(extHost.registerDocumentHighlightProvider('*', <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))]
			}
		}));

		threadService.sync().then(() => {

			getOccurrencesAtPosition(model, { lineNumber: 1, column: 2 }).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3 });
				assert.equal(entry.kind, 'text');
				done();
			});
		});
	});

	test('Occurrences, evil provider', function(done) {

		disposables.push(extHost.registerDocumentHighlightProvider(defaultSelector, <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				throw new Error('evil');
			}
		}));

		disposables.push(extHost.registerDocumentHighlightProvider(defaultSelector, <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))]
			}
		}));

		threadService.sync().then(() => {

			getOccurrencesAtPosition(model, { lineNumber: 1, column: 2 }).then(value => {
				assert.equal(value.length, 1);
				done();
			});
		});
	});

	// --- references

	test('References, registration order', function(done) {

		disposables.push(extHost.registerReferenceProvider(defaultSelector, <vscode.ReferenceProvider>{
			provideReferences(): any {
				return [new types.Location(URI.parse('far://register/first'), new types.Range(0, 0, 0, 0))];
			}
		}));

		setTimeout(function() {
			disposables.push(extHost.registerReferenceProvider(defaultSelector, <vscode.ReferenceProvider>{
				provideReferences(): any {
					return [new types.Location(URI.parse('far://register/second'), new types.Range(0, 0, 0, 0))];
				}
			}));

			threadService.sync().then(() => {

				findReferences(model, { lineNumber: 1, column: 2 }).then(value => {
					assert.equal(value.length, 2);

					let [first, second] = value;
					assert.equal(first.resource.path, '/second');
					assert.equal(second.resource.path, '/first');
					done();
				});
			});
		}, 5);
	});

	test('References, data conversion', function(done) {

		disposables.push(extHost.registerReferenceProvider(defaultSelector, <vscode.ReferenceProvider>{
			provideReferences(): any {
				return [new types.Location(model.getAssociatedResource(), new types.Position(0, 0))];
			}
		}));

		threadService.sync().then(() => {

			findReferences(model, { lineNumber: 1, column: 2 }).then(value => {
				assert.equal(value.length, 1);

				let [item] = value;
				assert.deepEqual(item.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
				assert.equal(item.resource.toString(), model.getAssociatedResource().toString());
				done();
			});

		});
	});

	test('References, evil provider', function(done) {

		disposables.push(extHost.registerReferenceProvider(defaultSelector, <vscode.ReferenceProvider>{
			provideReferences(): any {
				throw new Error('evil');
			}
		}));
		disposables.push(extHost.registerReferenceProvider(defaultSelector, <vscode.ReferenceProvider>{
			provideReferences(): any {
				return [new types.Location(model.getAssociatedResource(), new types.Range(0, 0, 0, 0))];
			}
		}));

		threadService.sync().then(() => {

			findReferences(model, { lineNumber: 1, column: 2 }).then(value => {
				assert.equal(value.length, 1);
				done();
			});

		});
	});

	// --- quick fix

	test('Quick Fix, data conversion', function(done) {

		disposables.push(extHost.registerCodeActionProvider(defaultSelector, <vscode.CodeActionProvider>{
			provideCodeActions(): any {
				return [
					<vscode.Command>{ command: 'test1', title: 'Testing1' },
					<vscode.Command>{ command: 'test2', title: 'Testing2' }
				];
			}
		}));

		threadService.sync().then(() => {
			getQuickFixes(model, model.getFullModelRange()).then(value => {
				assert.equal(value.length, 2);

				let [first, second] = value;
				assert.equal(first.command.title, 'Testing1');
				assert.equal(first.command.id, 'test1');
				assert.equal(second.command.title, 'Testing2');
				assert.equal(second.command.id, 'test2');
				done();
			});
		});
	});

	test('Quick Fix, invoke command+args', function(done) {
		let actualArgs: any;
		let commands = threadService.getRemotable(ExtHostCommands);
		disposables.push(commands.registerCommand('test1', function(...args: any[]) {
			actualArgs = args;
		}));

		disposables.push(extHost.registerCodeActionProvider(defaultSelector, <vscode.CodeActionProvider>{
			provideCodeActions(): any {
				return [<vscode.Command>{ command: 'test1', title: 'Testing', arguments: [true, 1, { bar: 'boo', foo: 'far' }, null] }];
			}
		}));

		threadService.sync().then(() => {
			getQuickFixes(model, model.getFullModelRange()).then(value => {
				assert.equal(value.length, 1);

				let [entry] = value;
				entry.support.runQuickFixAction(model.getAssociatedResource(), model.getFullModelRange(), entry).then(value => {
					assert.equal(value, undefined);

					assert.equal(actualArgs.length, 4);
					assert.equal(actualArgs[0], true)
					assert.equal(actualArgs[1], 1)
					assert.deepEqual(actualArgs[2], { bar: 'boo', foo: 'far' });
					assert.equal(actualArgs[3], null)
					done();
				});
			});
		});
	});

	test('Quick Fix, evil provider', function(done) {

		disposables.push(extHost.registerCodeActionProvider(defaultSelector, <vscode.CodeActionProvider>{
			provideCodeActions(): any {
				throw new Error('evil');
			}
		}));
		disposables.push(extHost.registerCodeActionProvider(defaultSelector, <vscode.CodeActionProvider>{
			provideCodeActions(): any {
				return [<vscode.Command>{ command: 'test', title: 'Testing' }];
			}
		}));

		threadService.sync().then(() => {
			getQuickFixes(model, model.getFullModelRange()).then(value => {
				assert.equal(value.length, 1);
				done();
			});
		});
	});

	// --- navigate types

	test('Navigate types, evil provider', function(done) {

		disposables.push(extHost.registerWorkspaceSymbolProvider(<vscode.WorkspaceSymbolProvider>{
			provideWorkspaceSymbols(): any {
				throw new Error('evil');
			}
		}));

		disposables.push(extHost.registerWorkspaceSymbolProvider(<vscode.WorkspaceSymbolProvider>{
			provideWorkspaceSymbols(): any {
				return [new types.SymbolInformation('testing', types.SymbolKind.Array, new types.Range(0, 0, 1, 1))]
			}
		}));

		threadService.sync().then(() => {

			getNavigateToItems('').then(value => {
				assert.equal(value.length, 1);
				done();
			});
		});
	});

	// --- rename

	test('Rename, evil provider 1/2', function(done) {

		disposables.push(extHost.registerRenameProvider(defaultSelector, <vscode.RenameProvider>{
			provideRenameEdits(): any {
				throw Error('evil');
			}
		}));

		threadService.sync().then(() => {

			rename(model, { lineNumber: 1, column: 1 }, 'newName').then(value => {
				done(new Error(''));
			}, err => {
				done(); // expected
			});
		});
	});

	test('Rename, evil provider 2/2', function(done) {

		disposables.push(extHost.registerRenameProvider('*', <vscode.RenameProvider>{
			provideRenameEdits(): any {
				throw Error('evil');
			}
		}));

		disposables.push(extHost.registerRenameProvider(defaultSelector, <vscode.RenameProvider>{
			provideRenameEdits(): any {
				let edit = new types.WorkspaceEdit();
				edit.replace(model.getAssociatedResource(), new types.Range(0, 0, 0, 0), 'testing');
				return edit;
			}
		}));

		threadService.sync().then(() => {

			rename(model, { lineNumber: 1, column: 1 }, 'newName').then(value => {
				assert.equal(value.edits.length, 1);
				done();
			});
		});
	});

	test('Rename, ordering', function(done) {

		disposables.push(extHost.registerRenameProvider('*', <vscode.RenameProvider>{
			provideRenameEdits(): any {
				let edit = new types.WorkspaceEdit();
				edit.replace(model.getAssociatedResource(), new types.Range(0, 0, 0, 0), 'testing');
				edit.replace(model.getAssociatedResource(), new types.Range(1, 0, 1, 0), 'testing');
				return edit;
			}
		}));

		disposables.push(extHost.registerRenameProvider(defaultSelector, <vscode.RenameProvider>{
			provideRenameEdits(): any {
				return;
			}
		}));

		threadService.sync().then(() => {

			rename(model, { lineNumber: 1, column: 1 }, 'newName').then(value => {
				assert.equal(value.edits.length, 2); // least relevant renamer
				done();
			});
		});
	});

	// --- parameter hints

	test('Parameter Hints, evil provider', function(done) {

		disposables.push(extHost.registerSignatureHelpProvider(defaultSelector, <vscode.SignatureHelpProvider>{
			provideSignatureHelp(): any {
				throw new Error('evil');
			}
		}, []));

		threadService.sync().then(() => {

			getParameterHints(model, { lineNumber: 1, column: 1 }, '(').then(value => {
				done(new Error('error expeted'));
			}, err => {
				assert.equal(err.message, 'evil');
				done();
			})
		});
	});

	// --- suggestions

	test('Suggest, order 1/3', function(done) {

		disposables.push(extHost.registerCompletionItemProvider('*', <vscode.CompletionItemProvider>{
			provideCompletionItems(): any {
				return [new types.CompletionItem('testing1')];
			}
		}, []));

		disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
			provideCompletionItems(): any {
				return [new types.CompletionItem('testing2')];
			}
		}, []));

		threadService.sync().then(() => {
			suggest(model, { lineNumber: 1, column: 1 }, ',').then(value => {
				assert.equal(value.length, 1);
				let [[first]] = value;
				assert.equal(first.suggestions.length, 1)
				assert.equal(first.suggestions[0].codeSnippet, 'testing2')
				done();
			});
		});
	});

	test('Suggest, order 2/3', function(done) {

		disposables.push(extHost.registerCompletionItemProvider('*', <vscode.CompletionItemProvider>{
			provideCompletionItems(): any {
				return [new types.CompletionItem('weak-selector')]; // weaker selector but result
			}
		}, []));

		disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
			provideCompletionItems(): any {
				return []; // stronger selector but not a good result;
			}
		}, []));

		threadService.sync().then(() => {
			suggest(model, { lineNumber: 1, column: 1 }, ',').then(value => {
				assert.equal(value.length, 1);
				let [[first]] = value;
				assert.equal(first.suggestions.length, 1)
				assert.equal(first.suggestions[0].codeSnippet, 'weak-selector')
				done();
			});
		});
	})

	test('Suggest, order 2/3', function(done) {

		disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
			provideCompletionItems(): any {
				return [new types.CompletionItem('strong-1')];
			}
		}, []));

		setTimeout(function() {
			disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
				provideCompletionItems(): any {
					return [new types.CompletionItem('strong-2')];
				}
			}, []));

			threadService.sync().then(() => {
				suggest(model, { lineNumber: 1, column: 1 }, ',').then(value => {
					assert.equal(value.length, 2);
					let [[first], [second]] = value;
					assert.equal(first.suggestions.length, 1)
					assert.equal(first.suggestions[0].codeSnippet, 'strong-2') // last wins
					assert.equal(second.suggestions[0].codeSnippet, 'strong-1')
					done();
				});
			});
		}, 5);
	})

	test('Suggest, evil provider', function(done) {

		disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
			provideCompletionItems(): any {
				throw new Error('evil');
			}
		}, []));

		disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
			provideCompletionItems(): any {
				return [new types.CompletionItem('testing')];
			}
		}, []));


		threadService.sync().then(() => {

			suggest(model, { lineNumber: 1, column: 1 }, ',').then(value => {
				assert.equal(value.length, 1);
				assert.equal(value[0][0].incomplete, undefined);
				done();
			});
		});
	});

	test('Suggest, CompletionList', function() {

		disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
			provideCompletionItems(): any {
				return new types.CompletionList([<any> new types.CompletionItem('hello')], true);
			}
		}, []));

		return threadService.sync().then(() => {

			suggest(model, { lineNumber: 1, column: 1 }, ',').then(value => {
				assert.equal(value.length, 1);
				assert.equal(value[0][0].incomplete, true);
			});
		});
	});

	// --- format

	test('Format Doc, data conversion', function(done) {
		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultSelector, <vscode.DocumentFormattingEditProvider>{
			provideDocumentFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 1, 1), 'testing')];
			}
		}));

		threadService.sync().then(() => {
			formatDocument(model, { insertSpaces: true, tabSize: 4 }).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;
				assert.equal(first.text, 'testing');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 });
				done();
			});
		});
	});

	test('Format Doc, evil provider', function(done) {
		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultSelector, <vscode.DocumentFormattingEditProvider>{
			provideDocumentFormattingEdits(): any {
				throw new Error('evil');
			}
		}));

		threadService.sync().then(() => {
			formatDocument(model, { insertSpaces: true, tabSize: 4 }).then(undefined, err => done());
		});
	});

	test('Format Range, data conversion', function(done) {
		disposables.push(extHost.registerDocumentRangeFormattingEditProvider(defaultSelector, <vscode.DocumentRangeFormattingEditProvider>{
			provideDocumentRangeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 1, 1), 'testing')];
			}
		}));

		threadService.sync().then(() => {
			formatRange(model, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, { insertSpaces: true, tabSize: 4 }).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;
				assert.equal(first.text, 'testing');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 });
				done();
			});
		});
	})

	test('Format Range, + format_doc', function(done) {
		disposables.push(extHost.registerDocumentRangeFormattingEditProvider(defaultSelector, <vscode.DocumentRangeFormattingEditProvider>{
			provideDocumentRangeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 1, 1), 'range')];
			}
		}));
		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultSelector, <vscode.DocumentFormattingEditProvider>{
			provideDocumentFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 1, 1), 'doc')];
			}
		}));
		threadService.sync().then(() => {
			formatRange(model, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, { insertSpaces: true, tabSize: 4 }).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;
				assert.equal(first.text, 'range');
				done();
			});
		});
	});

	test('Format Range, evil provider', function(done) {
		disposables.push(extHost.registerDocumentRangeFormattingEditProvider(defaultSelector, <vscode.DocumentRangeFormattingEditProvider>{
			provideDocumentRangeFormattingEdits(): any {
				throw new Error('evil');
			}
		}));

		threadService.sync().then(() => {
			formatRange(model, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, { insertSpaces: true, tabSize: 4 }).then(undefined, err => done());
		});
	})

	test('Format on Type, data conversion', function(done) {

		disposables.push(extHost.registerOnTypeFormattingEditProvider(defaultSelector, <vscode.OnTypeFormattingEditProvider>{
			provideOnTypeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), arguments[2])];
			}
		}, [';']));

		threadService.sync().then(() => {
			formatAfterKeystroke(model, { lineNumber: 1, column: 1 }, ';', { insertSpaces: true, tabSize: 2 }).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;

				assert.equal(first.text, ';');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
				done();
			});
		});
	});
});
