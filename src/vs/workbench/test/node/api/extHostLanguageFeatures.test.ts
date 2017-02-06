/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { setUnexpectedErrorHandler, errorHandler } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import * as types from 'vs/workbench/api/node/extHostTypes';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import { Model as EditorModel } from 'vs/editor/common/model/model';
import { Position as EditorPosition } from 'vs/editor/common/core/position';
import { Range as EditorRange } from 'vs/editor/common/core/range';
import { TestThreadService } from './testThreadService';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostLanguageFeatures } from 'vs/workbench/api/node/extHostLanguageFeatures';
import { MainThreadLanguageFeatures } from 'vs/workbench/api/node/mainThreadLanguageFeatures';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { MainThreadCommands } from 'vs/workbench/api/node/mainThreadCommands';
import { IHeapService } from 'vs/workbench/api/node/mainThreadHeapService';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import { getDocumentSymbols } from 'vs/editor/contrib/quickOpen/common/quickOpen';
import { DocumentSymbolProviderRegistry, DocumentHighlightKind } from 'vs/editor/common/modes';
import { getCodeLensData } from 'vs/editor/contrib/codelens/common/codelens';
import { getDefinitionsAtPosition, getImplementationsAtPosition, getTypeDefinitionsAtPosition } from 'vs/editor/contrib/goToDeclaration/common/goToDeclaration';
import { getHover } from 'vs/editor/contrib/hover/common/hover';
import { getOccurrencesAtPosition } from 'vs/editor/contrib/wordHighlighter/common/wordHighlighter';
import { provideReferences } from 'vs/editor/contrib/referenceSearch/common/referenceSearch';
import { getCodeActions } from 'vs/editor/contrib/quickFix/common/quickFix';
import { getWorkspaceSymbols } from 'vs/workbench/parts/search/common/search';
import { rename } from 'vs/editor/contrib/rename/common/rename';
import { provideSignatureHelp } from 'vs/editor/contrib/parameterHints/common/parameterHints';
import { provideSuggestionItems } from 'vs/editor/contrib/suggest/common/suggest';
import { getDocumentFormattingEdits, getDocumentRangeFormattingEdits, getOnTypeFormattingEdits } from 'vs/editor/contrib/format/common/format';
import { getLinks } from 'vs/editor/contrib/links/common/links';
import { asWinJsPromise } from 'vs/base/common/async';
import { MainContext, ExtHostContext } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostDiagnostics } from 'vs/workbench/api/node/extHostDiagnostics';
import { ExtHostHeapService } from 'vs/workbench/api/node/extHostHeapService';
import * as vscode from 'vscode';

const defaultSelector = { scheme: 'far' };
const model: EditorCommon.IModel = EditorModel.createFromString(
	[
		'This is the first line',
		'This is the second line',
		'This is the third line',
	].join('\n'),
	undefined,
	undefined,
	URI.parse('far://testing/file.a'));

let extHost: ExtHostLanguageFeatures;
let mainThread: MainThreadLanguageFeatures;
let disposables: vscode.Disposable[] = [];
let threadService: TestThreadService;
let originalErrorHandler: (e: any) => any;

suite('ExtHostLanguageFeatures', function () {

	suiteSetup(() => {

		threadService = new TestThreadService();
		let instantiationService = new TestInstantiationService();
		instantiationService.stub(IThreadService, threadService);
		instantiationService.stub(IMarkerService, MarkerService);
		instantiationService.stub(IHeapService, {
			_serviceBrand: undefined,
			trackRecursive(args) {
				// nothing
				return args;
			}
		});

		originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(() => { });

		const extHostDocuments = new ExtHostDocuments(threadService);
		threadService.set(ExtHostContext.ExtHostDocuments, extHostDocuments);
		extHostDocuments.$acceptModelAdd({
			isDirty: false,
			versionId: model.getVersionId(),
			modeId: model.getLanguageIdentifier().language,
			url: model.uri,
			value: {
				EOL: model.getEOL(),
				lines: model.getValue().split(model.getEOL()),
				BOM: '',
				length: -1,
				containsRTL: false,
				isBasicASCII: false,
				options: {
					tabSize: 4,
					insertSpaces: true,
					trimAutoWhitespace: true,
					defaultEOL: EditorCommon.DefaultEndOfLine.LF
				}
			},
		});

		const heapService = new ExtHostHeapService();

		const commands = new ExtHostCommands(threadService, null, heapService);
		threadService.set(ExtHostContext.ExtHostCommands, commands);
		threadService.setTestInstance(MainContext.MainThreadCommands, instantiationService.createInstance(MainThreadCommands));

		const diagnostics = new ExtHostDiagnostics(threadService);
		threadService.set(ExtHostContext.ExtHostDiagnostics, diagnostics);

		extHost = new ExtHostLanguageFeatures(threadService, extHostDocuments, commands, heapService, diagnostics);
		threadService.set(ExtHostContext.ExtHostLanguageFeatures, extHost);

		mainThread = <MainThreadLanguageFeatures>threadService.setTestInstance(MainContext.MainThreadLanguageFeatures, instantiationService.createInstance(MainThreadLanguageFeatures));
	});

	suiteTeardown(() => {
		setUnexpectedErrorHandler(originalErrorHandler);
		model.dispose();
	});

	teardown(function () {
		while (disposables.length) {
			disposables.pop().dispose();
		}
		return threadService.sync();
	});

	// --- outline

	test('DocumentSymbols, register/deregister', function () {
		assert.equal(DocumentSymbolProviderRegistry.all(model).length, 0);
		let d1 = extHost.registerDocumentSymbolProvider(defaultSelector, <vscode.DocumentSymbolProvider>{
			provideDocumentSymbols() {
				return [];
			}
		});

		return threadService.sync().then(() => {
			assert.equal(DocumentSymbolProviderRegistry.all(model).length, 1);
			d1.dispose();
			return threadService.sync();
		});

	});

	test('DocumentSymbols, evil provider', function () {
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

		return threadService.sync().then(() => {

			return getDocumentSymbols(model).then(value => {
				assert.equal(value.entries.length, 1);
			});
		});
	});

	test('DocumentSymbols, data conversion', function () {
		disposables.push(extHost.registerDocumentSymbolProvider(defaultSelector, <vscode.DocumentSymbolProvider>{
			provideDocumentSymbols(): any {
				return [new types.SymbolInformation('test', types.SymbolKind.Field, new types.Range(0, 0, 0, 0))];
			}
		}));

		return threadService.sync().then(() => {

			return getDocumentSymbols(model).then(value => {
				assert.equal(value.entries.length, 1);

				let entry = value.entries[0];
				assert.equal(entry.name, 'test');
				assert.deepEqual(entry.location.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
			});
		});
	});

	// --- code lens

	test('CodeLens, evil provider', function () {

		disposables.push(extHost.registerCodeLensProvider(defaultSelector, <vscode.CodeLensProvider>{
			provideCodeLenses(): any {
				throw new Error('evil');
			}
		}));
		disposables.push(extHost.registerCodeLensProvider(defaultSelector, <vscode.CodeLensProvider>{
			provideCodeLenses() {
				return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
			}
		}));

		return threadService.sync().then(() => {
			return getCodeLensData(model).then(value => {
				assert.equal(value.length, 1);
			});
		});
	});

	test('CodeLens, do not resolve a resolved lens', function () {

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

		return threadService.sync().then(() => {

			return getCodeLensData(model).then(value => {
				assert.equal(value.length, 1);
				let data = value[0];

				return asWinJsPromise((token) => {
					return data.provider.resolveCodeLens(model, data.symbol, token);
				}).then(symbol => {
					assert.equal(symbol.command.id, 'id');
					assert.equal(symbol.command.title, 'Title');
				});
			});
		});
	});

	test('CodeLens, missing command', function () {

		disposables.push(extHost.registerCodeLensProvider(defaultSelector, <vscode.CodeLensProvider>{
			provideCodeLenses() {
				return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
			}
		}));

		return threadService.sync().then(() => {

			return getCodeLensData(model).then(value => {
				assert.equal(value.length, 1);

				let data = value[0];
				return asWinJsPromise((token) => {
					return data.provider.resolveCodeLens(model, data.symbol, token);
				}).then(symbol => {

					assert.equal(symbol.command.id, 'missing');
					assert.equal(symbol.command.title, '<<MISSING COMMAND>>');
				});
			});
		});
	});

	// --- definition

	test('Definition, data conversion', function () {

		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
			}
		}));

		return threadService.sync().then(() => {

			return getDefinitionsAtPosition(model, new EditorPosition(1, 1)).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
				assert.equal(entry.uri.toString(), model.uri.toString());
			});
		});
	});

	test('Definition, one or many', function () {

		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return [new types.Location(model.uri, new types.Range(1, 1, 1, 1))];
			}
		}));
		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return new types.Location(model.uri, new types.Range(1, 1, 1, 1));
			}
		}));

		return threadService.sync().then(() => {

			return getDefinitionsAtPosition(model, new EditorPosition(1, 1)).then(value => {
				assert.equal(value.length, 2);
			});
		});
	});

	test('Definition, registration order', function () {

		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return [new types.Location(URI.parse('far://first'), new types.Range(2, 3, 4, 5))];
			}
		}));

		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return new types.Location(URI.parse('far://second'), new types.Range(1, 2, 3, 4));
			}
		}));

		return threadService.sync().then(() => {

			return getDefinitionsAtPosition(model, new EditorPosition(1, 1)).then(value => {
				assert.equal(value.length, 2);
				// let [first, second] = value;

				assert.equal(value[0].uri.authority, 'second');
				assert.equal(value[1].uri.authority, 'first');
			});
		});
	});

	test('Definition, evil provider', function () {

		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(): any {
				throw new Error('evil provider');
			}
		}));
		disposables.push(extHost.registerDefinitionProvider(defaultSelector, <vscode.DefinitionProvider>{
			provideDefinition(): any {
				return new types.Location(model.uri, new types.Range(1, 1, 1, 1));
			}
		}));

		return threadService.sync().then(() => {

			return getDefinitionsAtPosition(model, new EditorPosition(1, 1)).then(value => {
				assert.equal(value.length, 1);
			});
		});
	});

	// --- implementation

	test('Implementation, data conversion', function () {

		disposables.push(extHost.registerImplementationProvider(defaultSelector, <vscode.ImplementationProvider>{
			provideImplementation(): any {
				return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
			}
		}));

		return threadService.sync().then(() => {
			return getImplementationsAtPosition(model, new EditorPosition(1, 1)).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
				assert.equal(entry.uri.toString(), model.uri.toString());
			});
		});
	});

	// --- type definition

	test('Type Definition, data conversion', function () {

		disposables.push(extHost.registerTypeDefinitionProvider(defaultSelector, <vscode.TypeDefinitionProvider>{
			provideTypeDefinition(): any {
				return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
			}
		}));

		return threadService.sync().then(() => {
			return getTypeDefinitionsAtPosition(model, new EditorPosition(1, 1)).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
				assert.equal(entry.uri.toString(), model.uri.toString());
			});
		});
	});

	// --- extra info

	test('HoverProvider, word range at pos', function () {

		disposables.push(extHost.registerHoverProvider(defaultSelector, <vscode.HoverProvider>{
			provideHover(): any {
				return new types.Hover('Hello');
			}
		}));

		return threadService.sync().then(() => {
			getHover(model, new EditorPosition(1, 1)).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
			});
		});
	});


	test('HoverProvider, given range', function () {

		disposables.push(extHost.registerHoverProvider(defaultSelector, <vscode.HoverProvider>{
			provideHover(): any {
				return new types.Hover('Hello', new types.Range(3, 0, 8, 7));
			}
		}));

		return threadService.sync().then(() => {

			getHover(model, new EditorPosition(1, 1)).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 4, startColumn: 1, endLineNumber: 9, endColumn: 8 });
			});
		});
	});


	test('HoverProvider, registration order', function () {
		disposables.push(extHost.registerHoverProvider(defaultSelector, <vscode.HoverProvider>{
			provideHover(): any {
				return new types.Hover('registered first');
			}
		}));


		disposables.push(extHost.registerHoverProvider(defaultSelector, <vscode.HoverProvider>{
			provideHover(): any {
				return new types.Hover('registered second');
			}
		}));

		return threadService.sync().then(() => {
			return getHover(model, new EditorPosition(1, 1)).then(value => {
				assert.equal(value.length, 2);
				let [first, second] = value;
				assert.equal(first.contents[0], 'registered second');
				assert.equal(second.contents[0], 'registered first');
			});
		});
	});


	test('HoverProvider, evil provider', function () {

		disposables.push(extHost.registerHoverProvider(defaultSelector, <vscode.HoverProvider>{
			provideHover(): any {
				throw new Error('evil');
			}
		}));
		disposables.push(extHost.registerHoverProvider(defaultSelector, <vscode.HoverProvider>{
			provideHover(): any {
				return new types.Hover('Hello');
			}
		}));

		return threadService.sync().then(() => {

			getHover(model, new EditorPosition(1, 1)).then(value => {

				assert.equal(value.length, 1);
			});
		});
	});

	// --- occurrences

	test('Occurrences, data conversion', function () {

		disposables.push(extHost.registerDocumentHighlightProvider(defaultSelector, <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
			}
		}));

		return threadService.sync().then(() => {

			return getOccurrencesAtPosition(model, new EditorPosition(1, 2)).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
				assert.equal(entry.kind, DocumentHighlightKind.Text);
			});
		});
	});

	test('Occurrences, order 1/2', function () {

		disposables.push(extHost.registerDocumentHighlightProvider(defaultSelector, <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				return [];
			}
		}));
		disposables.push(extHost.registerDocumentHighlightProvider('*', <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
			}
		}));

		return threadService.sync().then(() => {

			return getOccurrencesAtPosition(model, new EditorPosition(1, 2)).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
				assert.equal(entry.kind, DocumentHighlightKind.Text);
			});
		});
	});

	test('Occurrences, order 2/2', function () {

		disposables.push(extHost.registerDocumentHighlightProvider(defaultSelector, <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 2))];
			}
		}));
		disposables.push(extHost.registerDocumentHighlightProvider('*', <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
			}
		}));

		return threadService.sync().then(() => {

			return getOccurrencesAtPosition(model, new EditorPosition(1, 2)).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3 });
				assert.equal(entry.kind, DocumentHighlightKind.Text);
			});
		});
	});

	test('Occurrences, evil provider', function () {

		disposables.push(extHost.registerDocumentHighlightProvider(defaultSelector, <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				throw new Error('evil');
			}
		}));

		disposables.push(extHost.registerDocumentHighlightProvider(defaultSelector, <vscode.DocumentHighlightProvider>{
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
			}
		}));

		return threadService.sync().then(() => {

			return getOccurrencesAtPosition(model, new EditorPosition(1, 2)).then(value => {
				assert.equal(value.length, 1);
			});
		});
	});

	// --- references

	test('References, registration order', function () {

		disposables.push(extHost.registerReferenceProvider(defaultSelector, <vscode.ReferenceProvider>{
			provideReferences(): any {
				return [new types.Location(URI.parse('far://register/first'), new types.Range(0, 0, 0, 0))];
			}
		}));

		disposables.push(extHost.registerReferenceProvider(defaultSelector, <vscode.ReferenceProvider>{
			provideReferences(): any {
				return [new types.Location(URI.parse('far://register/second'), new types.Range(0, 0, 0, 0))];
			}
		}));

		return threadService.sync().then(() => {

			return provideReferences(model, new EditorPosition(1, 2)).then(value => {
				assert.equal(value.length, 2);

				let [first, second] = value;
				assert.equal(first.uri.path, '/second');
				assert.equal(second.uri.path, '/first');
			});
		});
	});

	test('References, data conversion', function () {

		disposables.push(extHost.registerReferenceProvider(defaultSelector, <vscode.ReferenceProvider>{
			provideReferences(): any {
				return [new types.Location(model.uri, new types.Position(0, 0))];
			}
		}));

		return threadService.sync().then(() => {

			return provideReferences(model, new EditorPosition(1, 2)).then(value => {
				assert.equal(value.length, 1);

				let [item] = value;
				assert.deepEqual(item.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
				assert.equal(item.uri.toString(), model.uri.toString());
			});

		});
	});

	test('References, evil provider', function () {

		disposables.push(extHost.registerReferenceProvider(defaultSelector, <vscode.ReferenceProvider>{
			provideReferences(): any {
				throw new Error('evil');
			}
		}));
		disposables.push(extHost.registerReferenceProvider(defaultSelector, <vscode.ReferenceProvider>{
			provideReferences(): any {
				return [new types.Location(model.uri, new types.Range(0, 0, 0, 0))];
			}
		}));

		return threadService.sync().then(() => {

			return provideReferences(model, new EditorPosition(1, 2)).then(value => {
				assert.equal(value.length, 1);
			});

		});
	});

	// --- quick fix

	test('Quick Fix, data conversion', function () {

		disposables.push(extHost.registerCodeActionProvider(defaultSelector, <vscode.CodeActionProvider>{
			provideCodeActions(): any {
				return [
					<vscode.Command>{ command: 'test1', title: 'Testing1' },
					<vscode.Command>{ command: 'test2', title: 'Testing2' }
				];
			}
		}));

		return threadService.sync().then(() => {
			return getCodeActions(model, model.getFullModelRange()).then(value => {
				assert.equal(value.length, 2);

				let [first, second] = value;
				assert.equal(first.command.title, 'Testing1');
				assert.equal(first.command.id, 'test1');
				assert.equal(second.command.title, 'Testing2');
				assert.equal(second.command.id, 'test2');
			});
		});
	});

	test('Quick Fix, evil provider', function () {

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

		return threadService.sync().then(() => {
			return getCodeActions(model, model.getFullModelRange()).then(value => {
				assert.equal(value.length, 1);
			});
		});
	});

	// --- navigate types

	test('Navigate types, evil provider', function () {

		disposables.push(extHost.registerWorkspaceSymbolProvider(<vscode.WorkspaceSymbolProvider>{
			provideWorkspaceSymbols(): any {
				throw new Error('evil');
			}
		}));

		disposables.push(extHost.registerWorkspaceSymbolProvider(<vscode.WorkspaceSymbolProvider>{
			provideWorkspaceSymbols(): any {
				return [new types.SymbolInformation('testing', types.SymbolKind.Array, new types.Range(0, 0, 1, 1))];
			}
		}));

		return threadService.sync().then(() => {

			return getWorkspaceSymbols('').then(value => {
				assert.equal(value.length, 1);
				const [first] = value;
				const [, symbols] = first;
				assert.equal(symbols.length, 1);
				assert.equal(symbols[0].name, 'testing');
			});
		});
	});

	// --- rename

	test('Rename, evil provider 1/2', function () {

		disposables.push(extHost.registerRenameProvider(defaultSelector, <vscode.RenameProvider>{
			provideRenameEdits(): any {
				throw Error('evil');
			}
		}));

		return threadService.sync().then(() => {

			return rename(model, new EditorPosition(1, 1), 'newName').then(value => {
				throw new Error('');
			}, err => {
				// expected
			});
		});
	});

	test('Rename, evil provider 2/2', function () {

		disposables.push(extHost.registerRenameProvider('*', <vscode.RenameProvider>{
			provideRenameEdits(): any {
				throw Error('evil');
			}
		}));

		disposables.push(extHost.registerRenameProvider(defaultSelector, <vscode.RenameProvider>{
			provideRenameEdits(): any {
				let edit = new types.WorkspaceEdit();
				edit.replace(model.uri, new types.Range(0, 0, 0, 0), 'testing');
				return edit;
			}
		}));

		return threadService.sync().then(() => {

			return rename(model, new EditorPosition(1, 1), 'newName').then(value => {
				assert.equal(value.edits.length, 1);
			});
		});
	});

	test('Rename, ordering', function () {

		disposables.push(extHost.registerRenameProvider('*', <vscode.RenameProvider>{
			provideRenameEdits(): any {
				let edit = new types.WorkspaceEdit();
				edit.replace(model.uri, new types.Range(0, 0, 0, 0), 'testing');
				edit.replace(model.uri, new types.Range(1, 0, 1, 0), 'testing');
				return edit;
			}
		}));

		disposables.push(extHost.registerRenameProvider(defaultSelector, <vscode.RenameProvider>{
			provideRenameEdits(): any {
				return;
			}
		}));

		return threadService.sync().then(() => {

			return rename(model, new EditorPosition(1, 1), 'newName').then(value => {
				assert.equal(value.edits.length, 2); // least relevant renamer
			});
		});
	});

	// --- parameter hints

	test('Parameter Hints, order', function () {

		disposables.push(extHost.registerSignatureHelpProvider(defaultSelector, <vscode.SignatureHelpProvider>{
			provideSignatureHelp(): any {
				return undefined;
			}
		}, []));

		disposables.push(extHost.registerSignatureHelpProvider(defaultSelector, <vscode.SignatureHelpProvider>{
			provideSignatureHelp(): vscode.SignatureHelp {
				return new types.SignatureHelp();
			}
		}, []));

		return threadService.sync().then(() => {

			return provideSignatureHelp(model, new EditorPosition(1, 1)).then(value => {
				assert.ok(value);
			});
		});
	});
	test('Parameter Hints, evil provider', function () {

		disposables.push(extHost.registerSignatureHelpProvider(defaultSelector, <vscode.SignatureHelpProvider>{
			provideSignatureHelp(): any {
				throw new Error('evil');
			}
		}, []));

		return threadService.sync().then(() => {

			return provideSignatureHelp(model, new EditorPosition(1, 1)).then(value => {
				assert.equal(value, undefined);
			});
		});
	});

	// --- suggestions

	test('Suggest, order 1/3', function () {

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

		return threadService.sync().then(() => {
			return provideSuggestionItems(model, new EditorPosition(1, 1), 'none').then(value => {
				assert.equal(value.length, 1);
				assert.equal(value[0].suggestion.insertText, 'testing2');
			});
		});
	});

	test('Suggest, order 2/3', function () {

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

		return threadService.sync().then(() => {
			return provideSuggestionItems(model, new EditorPosition(1, 1), 'none').then(value => {
				assert.equal(value.length, 1);
				assert.equal(value[0].suggestion.insertText, 'weak-selector');
			});
		});
	});

	test('Suggest, order 2/3', function () {

		disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
			provideCompletionItems(): any {
				return [new types.CompletionItem('strong-1')];
			}
		}, []));

		disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
			provideCompletionItems(): any {
				return [new types.CompletionItem('strong-2')];
			}
		}, []));

		return threadService.sync().then(() => {
			return provideSuggestionItems(model, new EditorPosition(1, 1), 'none').then(value => {
				assert.equal(value.length, 2);
				assert.equal(value[0].suggestion.insertText, 'strong-1'); // sort by label
				assert.equal(value[1].suggestion.insertText, 'strong-2');
			});
		});
	});

	test('Suggest, evil provider', function () {

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


		return threadService.sync().then(() => {

			return provideSuggestionItems(model, new EditorPosition(1, 1), 'none').then(value => {
				assert.equal(value[0].container.incomplete, undefined);
			});
		});
	});

	test('Suggest, CompletionList', function () {

		disposables.push(extHost.registerCompletionItemProvider(defaultSelector, <vscode.CompletionItemProvider>{
			provideCompletionItems(): any {
				return new types.CompletionList([<any>new types.CompletionItem('hello')], true);
			}
		}, []));

		return threadService.sync().then(() => {

			provideSuggestionItems(model, new EditorPosition(1, 1), 'none').then(value => {
				assert.equal(value[0].container.incomplete, true);
			});
		});
	});

	// --- format

	test('Format Doc, data conversion', function () {
		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultSelector, <vscode.DocumentFormattingEditProvider>{
			provideDocumentFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'testing')];
			}
		}));

		return threadService.sync().then(() => {
			return getDocumentFormattingEdits(model, { insertSpaces: true, tabSize: 4 }).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;
				assert.equal(first.text, 'testing');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
			});
		});
	});

	test('Format Doc, evil provider', function () {
		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultSelector, <vscode.DocumentFormattingEditProvider>{
			provideDocumentFormattingEdits(): any {
				throw new Error('evil');
			}
		}));

		return threadService.sync().then(() => {
			return getDocumentFormattingEdits(model, { insertSpaces: true, tabSize: 4 });
		});
	});

	test('Format Doc, order', function () {
		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultSelector, <vscode.DocumentFormattingEditProvider>{
			provideDocumentFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'testing')];
			}
		}));

		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultSelector, <vscode.DocumentFormattingEditProvider>{
			provideDocumentFormattingEdits(): any {
				return undefined;
			}
		}));

		return threadService.sync().then(() => {
			return getDocumentFormattingEdits(model, { insertSpaces: true, tabSize: 4 }).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;
				assert.equal(first.text, 'testing');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
			});
		});
	});

	test('Format Range, data conversion', function () {
		disposables.push(extHost.registerDocumentRangeFormattingEditProvider(defaultSelector, <vscode.DocumentRangeFormattingEditProvider>{
			provideDocumentRangeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'testing')];
			}
		}));

		return threadService.sync().then(() => {
			return getDocumentRangeFormattingEdits(model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;
				assert.equal(first.text, 'testing');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
			});
		});
	});

	test('Format Range, + format_doc', function () {
		disposables.push(extHost.registerDocumentRangeFormattingEditProvider(defaultSelector, <vscode.DocumentRangeFormattingEditProvider>{
			provideDocumentRangeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'range')];
			}
		}));
		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultSelector, <vscode.DocumentFormattingEditProvider>{
			provideDocumentFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 1, 1), 'doc')];
			}
		}));
		return threadService.sync().then(() => {
			return getDocumentRangeFormattingEdits(model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;
				assert.equal(first.text, 'range');
			});
		});
	});

	test('Format Range, evil provider', function () {
		disposables.push(extHost.registerDocumentRangeFormattingEditProvider(defaultSelector, <vscode.DocumentRangeFormattingEditProvider>{
			provideDocumentRangeFormattingEdits(): any {
				throw new Error('evil');
			}
		}));

		return threadService.sync().then(() => {
			return getDocumentRangeFormattingEdits(model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 });
		});
	});

	test('Format on Type, data conversion', function () {

		disposables.push(extHost.registerOnTypeFormattingEditProvider(defaultSelector, <vscode.OnTypeFormattingEditProvider>{
			provideOnTypeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), arguments[2])];
			}
		}, [';']));

		return threadService.sync().then(() => {
			return getOnTypeFormattingEdits(model, new EditorPosition(1, 1), ';', { insertSpaces: true, tabSize: 2 }).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;

				assert.equal(first.text, ';');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
			});
		});
	});

	test('Links, data conversion', function () {

		disposables.push(extHost.registerDocumentLinkProvider(defaultSelector, <vscode.DocumentLinkProvider>{
			provideDocumentLinks() {
				return [new types.DocumentLink(new types.Range(0, 0, 1, 1), types.Uri.parse('foo:bar#3'))];
			}
		}));

		return threadService.sync().then(() => {
			return getLinks(model).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;

				assert.equal(first.url, 'foo:bar#3');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 });
			});
		});
	});

	test('Links, evil provider', function () {

		disposables.push(extHost.registerDocumentLinkProvider(defaultSelector, <vscode.DocumentLinkProvider>{
			provideDocumentLinks() {
				return [new types.DocumentLink(new types.Range(0, 0, 1, 1), types.Uri.parse('foo:bar#3'))];
			}
		}));

		disposables.push(extHost.registerDocumentLinkProvider(defaultSelector, <vscode.DocumentLinkProvider>{
			provideDocumentLinks(): any {
				throw new Error();
			}
		}));

		return threadService.sync().then(() => {
			return getLinks(model).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;

				assert.equal(first.url, 'foo:bar#3');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 });
			});
		});
	});
});
