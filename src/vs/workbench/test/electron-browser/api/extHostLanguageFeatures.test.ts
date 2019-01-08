/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { setUnexpectedErrorHandler, errorHandler } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import * as types from 'vs/workbench/api/node/extHostTypes';
import { TextModel as EditorModel } from 'vs/editor/common/model/textModel';
import { Position as EditorPosition, Position } from 'vs/editor/common/core/position';
import { Range as EditorRange } from 'vs/editor/common/core/range';
import { TestRPCProtocol } from './testRPCProtocol';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { ExtHostLanguageFeatures } from 'vs/workbench/api/node/extHostLanguageFeatures';
import { MainThreadLanguageFeatures } from 'vs/workbench/api/electron-browser/mainThreadLanguageFeatures';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { MainThreadCommands } from 'vs/workbench/api/electron-browser/mainThreadCommands';
import { IHeapService } from 'vs/workbench/api/electron-browser/mainThreadHeapService';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import { getDocumentSymbols } from 'vs/editor/contrib/quickOpen/quickOpen';
import * as modes from 'vs/editor/common/modes';
import { getCodeLensData } from 'vs/editor/contrib/codelens/codelens';
import { getDefinitionsAtPosition, getImplementationsAtPosition, getTypeDefinitionsAtPosition, getDeclarationsAtPosition } from 'vs/editor/contrib/goToDefinition/goToDefinition';
import { getHover } from 'vs/editor/contrib/hover/getHover';
import { getOccurrencesAtPosition } from 'vs/editor/contrib/wordHighlighter/wordHighlighter';
import { provideReferences } from 'vs/editor/contrib/referenceSearch/referenceSearch';
import { getCodeActions } from 'vs/editor/contrib/codeAction/codeAction';
import { getWorkspaceSymbols } from 'vs/workbench/parts/search/common/search';
import { rename } from 'vs/editor/contrib/rename/rename';
import { provideSignatureHelp } from 'vs/editor/contrib/parameterHints/provideSignatureHelp';
import { provideSuggestionItems } from 'vs/editor/contrib/suggest/suggest';
import { getDocumentFormattingEdits, getDocumentRangeFormattingEdits, getOnTypeFormattingEdits } from 'vs/editor/contrib/format/format';
import { getLinks } from 'vs/editor/contrib/links/getLinks';
import { MainContext, ExtHostContext } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostDiagnostics } from 'vs/workbench/api/node/extHostDiagnostics';
import { ExtHostHeapService } from 'vs/workbench/api/node/extHostHeapService';
import * as vscode from 'vscode';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { NullLogService } from 'vs/platform/log/common/log';
import { ITextModel, EndOfLineSequence } from 'vs/editor/common/model';
import { getColors } from 'vs/editor/contrib/colorPicker/color';
import { CancellationToken } from 'vs/base/common/cancellation';
import { nullExtensionDescription as defaultExtension } from 'vs/workbench/services/extensions/common/extensions';
import { provideSelectionRanges } from 'vs/editor/contrib/smartSelect/smartSelect';

const defaultSelector = { scheme: 'far' };
const model: ITextModel = EditorModel.createFromString(
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
let rpcProtocol: TestRPCProtocol;
let originalErrorHandler: (e: any) => any;

suite('ExtHostLanguageFeatures', function () {

	suiteSetup(() => {

		rpcProtocol = new TestRPCProtocol();

		// Use IInstantiationService to get typechecking when instantiating
		let inst: IInstantiationService;
		{
			let instantiationService = new TestInstantiationService();
			instantiationService.stub(IMarkerService, MarkerService);
			instantiationService.stub(IHeapService, {
				_serviceBrand: undefined,
				trackRecursive(args: any) {
					// nothing
					return args;
				}
			});
			inst = instantiationService;
		}

		originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(() => { });

		const extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol);
		extHostDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [{
				isDirty: false,
				versionId: model.getVersionId(),
				modeId: model.getLanguageIdentifier().language,
				uri: model.uri,
				lines: model.getValue().split(model.getEOL()),
				EOL: model.getEOL(),
			}]
		});
		const extHostDocuments = new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors);
		rpcProtocol.set(ExtHostContext.ExtHostDocuments, extHostDocuments);

		const heapService = new ExtHostHeapService();

		const commands = new ExtHostCommands(rpcProtocol, heapService, new NullLogService());
		rpcProtocol.set(ExtHostContext.ExtHostCommands, commands);
		rpcProtocol.set(MainContext.MainThreadCommands, inst.createInstance(MainThreadCommands, rpcProtocol));

		const diagnostics = new ExtHostDiagnostics(rpcProtocol);
		rpcProtocol.set(ExtHostContext.ExtHostDiagnostics, diagnostics);

		extHost = new ExtHostLanguageFeatures(rpcProtocol, null, extHostDocuments, commands, heapService, diagnostics, new NullLogService());
		rpcProtocol.set(ExtHostContext.ExtHostLanguageFeatures, extHost);

		mainThread = rpcProtocol.set(MainContext.MainThreadLanguageFeatures, inst.createInstance(MainThreadLanguageFeatures, rpcProtocol));
	});

	suiteTeardown(() => {
		setUnexpectedErrorHandler(originalErrorHandler);
		model.dispose();
		mainThread.dispose();
	});

	teardown(function () {
		while (disposables.length) {
			disposables.pop().dispose();
		}
		return rpcProtocol.sync();
	});

	// --- outline

	test('DocumentSymbols, register/deregister', function () {
		assert.equal(modes.DocumentSymbolProviderRegistry.all(model).length, 0);
		let d1 = extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentSymbolProvider {
			provideDocumentSymbols() {
				return <vscode.SymbolInformation[]>[];
			}
		});

		return rpcProtocol.sync().then(() => {
			assert.equal(modes.DocumentSymbolProviderRegistry.all(model).length, 1);
			d1.dispose();
			return rpcProtocol.sync();
		});

	});

	test('DocumentSymbols, evil provider', function () {
		disposables.push(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentSymbolProvider {
			provideDocumentSymbols(): any {
				throw new Error('evil document symbol provider');
			}
		}));
		disposables.push(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentSymbolProvider {
			provideDocumentSymbols(): any {
				return [new types.SymbolInformation('test', types.SymbolKind.Field, new types.Range(0, 0, 0, 0))];
			}
		}));

		return rpcProtocol.sync().then(() => {

			return getDocumentSymbols(model, true, CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
			});
		});
	});

	test('DocumentSymbols, data conversion', function () {
		disposables.push(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentSymbolProvider {
			provideDocumentSymbols(): any {
				return [new types.SymbolInformation('test', types.SymbolKind.Field, new types.Range(0, 0, 0, 0))];
			}
		}));

		return rpcProtocol.sync().then(() => {

			return getDocumentSymbols(model, true, CancellationToken.None).then(value => {
				assert.equal(value.length, 1);

				let entry = value[0];
				assert.equal(entry.name, 'test');
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
			});
		});
	});

	// --- code lens

	test('CodeLens, evil provider', function () {

		disposables.push(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class implements vscode.CodeLensProvider {
			provideCodeLenses(): any {
				throw new Error('evil');
			}
		}));
		disposables.push(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class implements vscode.CodeLensProvider {
			provideCodeLenses() {
				return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getCodeLensData(model, CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
			});
		});
	});

	test('CodeLens, do not resolve a resolved lens', function () {

		disposables.push(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class implements vscode.CodeLensProvider {
			provideCodeLenses(): any {
				return [new types.CodeLens(
					new types.Range(0, 0, 0, 0),
					{ command: 'id', title: 'Title' })];
			}
			resolveCodeLens(): any {
				assert.ok(false, 'do not resolve');
			}
		}));

		return rpcProtocol.sync().then(() => {

			return getCodeLensData(model, CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let data = value[0];
				return Promise.resolve(data.provider.resolveCodeLens(model, data.symbol, CancellationToken.None)).then(symbol => {
					assert.equal(symbol.command.id, 'id');
					assert.equal(symbol.command.title, 'Title');
				});
			});
		});
	});

	test('CodeLens, missing command', function () {

		disposables.push(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class implements vscode.CodeLensProvider {
			provideCodeLenses() {
				return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
			}
		}));

		return rpcProtocol.sync().then(() => {

			return getCodeLensData(model, CancellationToken.None).then(value => {
				assert.equal(value.length, 1);

				let data = value[0];
				return Promise.resolve(data.provider.resolveCodeLens(model, data.symbol, CancellationToken.None)).then(symbol => {

					assert.equal(symbol.command.id, 'missing');
					assert.equal(symbol.command.title, '!!MISSING: command!!');
				});
			});
		});
	});

	// --- definition

	test('Definition, data conversion', function () {

		disposables.push(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
			}
		}));

		return rpcProtocol.sync().then(() => {

			return getDefinitionsAtPosition(model, new EditorPosition(1, 1), CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
				assert.equal(entry.uri.toString(), model.uri.toString());
			});
		});
	});

	test('Definition, one or many', function () {

		disposables.push(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				return [new types.Location(model.uri, new types.Range(1, 1, 1, 1))];
			}
		}));
		disposables.push(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				return new types.Location(model.uri, new types.Range(1, 1, 1, 1));
			}
		}));

		return rpcProtocol.sync().then(() => {

			return getDefinitionsAtPosition(model, new EditorPosition(1, 1), CancellationToken.None).then(value => {
				assert.equal(value.length, 2);
			});
		});
	});

	test('Definition, registration order', function () {

		disposables.push(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				return [new types.Location(URI.parse('far://first'), new types.Range(2, 3, 4, 5))];
			}
		}));

		disposables.push(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				return new types.Location(URI.parse('far://second'), new types.Range(1, 2, 3, 4));
			}
		}));

		return rpcProtocol.sync().then(() => {

			return getDefinitionsAtPosition(model, new EditorPosition(1, 1), CancellationToken.None).then(value => {
				assert.equal(value.length, 2);
				// let [first, second] = value;

				assert.equal(value[0].uri.authority, 'second');
				assert.equal(value[1].uri.authority, 'first');
			});
		});
	});

	test('Definition, evil provider', function () {

		disposables.push(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				throw new Error('evil provider');
			}
		}));
		disposables.push(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				return new types.Location(model.uri, new types.Range(1, 1, 1, 1));
			}
		}));

		return rpcProtocol.sync().then(() => {

			return getDefinitionsAtPosition(model, new EditorPosition(1, 1), CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
			});
		});
	});

	// -- declaration

	test('Declaration, data conversion', function () {

		disposables.push(extHost.registerDeclarationProvider(defaultExtension, defaultSelector, new class implements vscode.DeclarationProvider {
			provideDeclaration(): any {
				return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
			}
		}));

		return rpcProtocol.sync().then(() => {

			return getDeclarationsAtPosition(model, new EditorPosition(1, 1), CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
				assert.equal(entry.uri.toString(), model.uri.toString());
			});
		});
	});

	// --- implementation

	test('Implementation, data conversion', function () {

		disposables.push(extHost.registerImplementationProvider(defaultExtension, defaultSelector, new class implements vscode.ImplementationProvider {
			provideImplementation(): any {
				return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getImplementationsAtPosition(model, new EditorPosition(1, 1), CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
				assert.equal(entry.uri.toString(), model.uri.toString());
			});
		});
	});

	// --- type definition

	test('Type Definition, data conversion', function () {

		disposables.push(extHost.registerTypeDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.TypeDefinitionProvider {
			provideTypeDefinition(): any {
				return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getTypeDefinitionsAtPosition(model, new EditorPosition(1, 1), CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
				assert.equal(entry.uri.toString(), model.uri.toString());
			});
		});
	});

	// --- extra info

	test('HoverProvider, word range at pos', function () {

		disposables.push(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class implements vscode.HoverProvider {
			provideHover(): any {
				return new types.Hover('Hello');
			}
		}));

		return rpcProtocol.sync().then(() => {
			getHover(model, new EditorPosition(1, 1), CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
			});
		});
	});


	test('HoverProvider, given range', function () {

		disposables.push(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class implements vscode.HoverProvider {
			provideHover(): any {
				return new types.Hover('Hello', new types.Range(3, 0, 8, 7));
			}
		}));

		return rpcProtocol.sync().then(() => {

			getHover(model, new EditorPosition(1, 1), CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 4, startColumn: 1, endLineNumber: 9, endColumn: 8 });
			});
		});
	});


	test('HoverProvider, registration order', function () {
		disposables.push(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class implements vscode.HoverProvider {
			provideHover(): any {
				return new types.Hover('registered first');
			}
		}));


		disposables.push(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class implements vscode.HoverProvider {
			provideHover(): any {
				return new types.Hover('registered second');
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getHover(model, new EditorPosition(1, 1), CancellationToken.None).then(value => {
				assert.equal(value.length, 2);
				let [first, second] = value as modes.Hover[];
				assert.equal(first.contents[0].value, 'registered second');
				assert.equal(second.contents[0].value, 'registered first');
			});
		});
	});


	test('HoverProvider, evil provider', function () {

		disposables.push(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class implements vscode.HoverProvider {
			provideHover(): any {
				throw new Error('evil');
			}
		}));
		disposables.push(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class implements vscode.HoverProvider {
			provideHover(): any {
				return new types.Hover('Hello');
			}
		}));

		return rpcProtocol.sync().then(() => {

			getHover(model, new EditorPosition(1, 1), CancellationToken.None).then(value => {

				assert.equal(value.length, 1);
			});
		});
	});

	// --- occurrences

	test('Occurrences, data conversion', function () {

		disposables.push(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
			}
		}));

		return rpcProtocol.sync().then(() => {

			return getOccurrencesAtPosition(model, new EditorPosition(1, 2), CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
				assert.equal(entry.kind, modes.DocumentHighlightKind.Text);
			});
		});
	});

	test('Occurrences, order 1/2', function () {

		disposables.push(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				return [];
			}
		}));
		disposables.push(extHost.registerDocumentHighlightProvider(defaultExtension, '*', new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
			}
		}));

		return rpcProtocol.sync().then(() => {

			return getOccurrencesAtPosition(model, new EditorPosition(1, 2), CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
				assert.equal(entry.kind, modes.DocumentHighlightKind.Text);
			});
		});
	});

	test('Occurrences, order 2/2', function () {

		disposables.push(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 2))];
			}
		}));
		disposables.push(extHost.registerDocumentHighlightProvider(defaultExtension, '*', new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
			}
		}));

		return rpcProtocol.sync().then(() => {

			return getOccurrencesAtPosition(model, new EditorPosition(1, 2), CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [entry] = value;
				assert.deepEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3 });
				assert.equal(entry.kind, modes.DocumentHighlightKind.Text);
			});
		});
	});

	test('Occurrences, evil provider', function () {

		disposables.push(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				throw new Error('evil');
			}
		}));

		disposables.push(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
			}
		}));

		return rpcProtocol.sync().then(() => {

			return getOccurrencesAtPosition(model, new EditorPosition(1, 2), CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
			});
		});
	});

	// --- references

	test('References, registration order', function () {

		disposables.push(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class implements vscode.ReferenceProvider {
			provideReferences(): any {
				return [new types.Location(URI.parse('far://register/first'), new types.Range(0, 0, 0, 0))];
			}
		}));

		disposables.push(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class implements vscode.ReferenceProvider {
			provideReferences(): any {
				return [new types.Location(URI.parse('far://register/second'), new types.Range(0, 0, 0, 0))];
			}
		}));

		return rpcProtocol.sync().then(() => {

			return provideReferences(model, new EditorPosition(1, 2), CancellationToken.None).then(value => {
				assert.equal(value.length, 2);

				let [first, second] = value;
				assert.equal(first.uri.path, '/second');
				assert.equal(second.uri.path, '/first');
			});
		});
	});

	test('References, data conversion', function () {

		disposables.push(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class implements vscode.ReferenceProvider {
			provideReferences(): any {
				return [new types.Location(model.uri, new types.Position(0, 0))];
			}
		}));

		return rpcProtocol.sync().then(() => {

			return provideReferences(model, new EditorPosition(1, 2), CancellationToken.None).then(value => {
				assert.equal(value.length, 1);

				let [item] = value;
				assert.deepEqual(item.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
				assert.equal(item.uri.toString(), model.uri.toString());
			});

		});
	});

	test('References, evil provider', function () {

		disposables.push(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class implements vscode.ReferenceProvider {
			provideReferences(): any {
				throw new Error('evil');
			}
		}));
		disposables.push(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class implements vscode.ReferenceProvider {
			provideReferences(): any {
				return [new types.Location(model.uri, new types.Range(0, 0, 0, 0))];
			}
		}));

		return rpcProtocol.sync().then(() => {

			return provideReferences(model, new EditorPosition(1, 2), CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
			});

		});
	});

	// --- quick fix

	test('Quick Fix, command data conversion', function () {

		disposables.push(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, {
			provideCodeActions(): vscode.Command[] {
				return [
					{ command: 'test1', title: 'Testing1' },
					{ command: 'test2', title: 'Testing2' }
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getCodeActions(model, model.getFullModelRange(), undefined).then(value => {
				assert.equal(value.length, 2);

				const [first, second] = value;
				assert.equal(first.title, 'Testing1');
				assert.equal(first.command.id, 'test1');
				assert.equal(second.title, 'Testing2');
				assert.equal(second.command.id, 'test2');
			});
		});
	});

	test('Quick Fix, code action data conversion', function () {

		disposables.push(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, {
			provideCodeActions(): vscode.CodeAction[] {
				return [
					{
						title: 'Testing1',
						command: { title: 'Testing1Command', command: 'test1' },
						kind: types.CodeActionKind.Empty.append('test.scope')
					}
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getCodeActions(model, model.getFullModelRange(), undefined).then(value => {
				assert.equal(value.length, 1);

				const [first] = value;
				assert.equal(first.title, 'Testing1');
				assert.equal(first.command.title, 'Testing1Command');
				assert.equal(first.command.id, 'test1');
				assert.equal(first.kind, 'test.scope');
			});
		});
	});


	test('Cannot read property \'id\' of undefined, #29469', function () {

		disposables.push(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class implements vscode.CodeActionProvider {
			provideCodeActions(): any {
				return [
					undefined,
					null,
					{ command: 'test', title: 'Testing' }
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getCodeActions(model, model.getFullModelRange(), undefined).then(value => {
				assert.equal(value.length, 1);
			});
		});
	});

	test('Quick Fix, evil provider', function () {

		disposables.push(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class implements vscode.CodeActionProvider {
			provideCodeActions(): any {
				throw new Error('evil');
			}
		}));
		disposables.push(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class implements vscode.CodeActionProvider {
			provideCodeActions(): any {
				return [{ command: 'test', title: 'Testing' }];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getCodeActions(model, model.getFullModelRange(), undefined).then(value => {
				assert.equal(value.length, 1);
			});
		});
	});

	// --- navigate types

	test('Navigate types, evil provider', function () {

		disposables.push(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class implements vscode.WorkspaceSymbolProvider {
			provideWorkspaceSymbols(): any {
				throw new Error('evil');
			}
		}));

		disposables.push(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class implements vscode.WorkspaceSymbolProvider {
			provideWorkspaceSymbols(): any {
				return [new types.SymbolInformation('testing', types.SymbolKind.Array, new types.Range(0, 0, 1, 1))];
			}
		}));

		return rpcProtocol.sync().then(() => {

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

	test('Rename, evil provider 0/2', function () {

		disposables.push(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class implements vscode.RenameProvider {
			provideRenameEdits(): any {
				throw new class Foo { };
			}
		}));

		return rpcProtocol.sync().then(() => {

			return rename(model, new EditorPosition(1, 1), 'newName').then(value => {
				throw Error();
			}, err => {
				// expected
			});
		});
	});

	test('Rename, evil provider 1/2', function () {

		disposables.push(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class implements vscode.RenameProvider {
			provideRenameEdits(): any {
				throw Error('evil');
			}
		}));

		return rpcProtocol.sync().then(() => {

			return rename(model, new EditorPosition(1, 1), 'newName').then(value => {
				assert.equal(value.rejectReason, 'evil');
			});
		});
	});

	test('Rename, evil provider 2/2', function () {

		disposables.push(extHost.registerRenameProvider(defaultExtension, '*', new class implements vscode.RenameProvider {
			provideRenameEdits(): any {
				throw Error('evil');
			}
		}));

		disposables.push(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class implements vscode.RenameProvider {
			provideRenameEdits(): any {
				let edit = new types.WorkspaceEdit();
				edit.replace(model.uri, new types.Range(0, 0, 0, 0), 'testing');
				return edit;
			}
		}));

		return rpcProtocol.sync().then(() => {

			return rename(model, new EditorPosition(1, 1), 'newName').then(value => {
				assert.equal(value.edits.length, 1);
			});
		});
	});

	test('Rename, ordering', function () {

		disposables.push(extHost.registerRenameProvider(defaultExtension, '*', new class implements vscode.RenameProvider {
			provideRenameEdits(): any {
				let edit = new types.WorkspaceEdit();
				edit.replace(model.uri, new types.Range(0, 0, 0, 0), 'testing');
				edit.replace(model.uri, new types.Range(1, 0, 1, 0), 'testing');
				return edit;
			}
		}));

		disposables.push(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class implements vscode.RenameProvider {
			provideRenameEdits(): any {
				return;
			}
		}));

		return rpcProtocol.sync().then(() => {

			return rename(model, new EditorPosition(1, 1), 'newName').then(value => {
				// least relevant rename provider
				assert.equal(value.edits.length, 2);
				assert.equal((<modes.ResourceTextEdit>value.edits[0]).edits.length, 1);
				assert.equal((<modes.ResourceTextEdit>value.edits[1]).edits.length, 1);
			});
		});
	});

	// --- parameter hints

	test('Parameter Hints, order', function () {

		disposables.push(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class implements vscode.SignatureHelpProvider {
			provideSignatureHelp(): any {
				return undefined;
			}
		}, []));

		disposables.push(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class implements vscode.SignatureHelpProvider {
			provideSignatureHelp(): vscode.SignatureHelp {
				return {
					signatures: [],
					activeParameter: 0,
					activeSignature: 0
				};
			}
		}, []));

		return rpcProtocol.sync().then(() => {

			return provideSignatureHelp(model, new EditorPosition(1, 1), { triggerKind: modes.SignatureHelpTriggerKind.Invoke, isRetrigger: false }, CancellationToken.None).then(value => {
				assert.ok(value);
			});
		});
	});

	test('Parameter Hints, evil provider', function () {

		disposables.push(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class implements vscode.SignatureHelpProvider {
			provideSignatureHelp(): any {
				throw new Error('evil');
			}
		}, []));

		return rpcProtocol.sync().then(() => {

			return provideSignatureHelp(model, new EditorPosition(1, 1), { triggerKind: modes.SignatureHelpTriggerKind.Invoke, isRetrigger: false }, CancellationToken.None).then(value => {
				assert.equal(value, undefined);
			});
		});
	});

	// --- suggestions

	test('Suggest, order 1/3', function () {

		disposables.push(extHost.registerCompletionItemProvider(defaultExtension, '*', new class implements vscode.CompletionItemProvider {
			provideCompletionItems(): any {
				return [new types.CompletionItem('testing1')];
			}
		}, []));

		disposables.push(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
			provideCompletionItems(): any {
				return [new types.CompletionItem('testing2')];
			}
		}, []));

		return rpcProtocol.sync().then(() => {
			return provideSuggestionItems(model, new EditorPosition(1, 1), 'none').then(value => {
				assert.equal(value.length, 1);
				assert.equal(value[0].completion.insertText, 'testing2');
			});
		});
	});

	test('Suggest, order 2/3', function () {

		disposables.push(extHost.registerCompletionItemProvider(defaultExtension, '*', new class implements vscode.CompletionItemProvider {
			provideCompletionItems(): any {
				return [new types.CompletionItem('weak-selector')]; // weaker selector but result
			}
		}, []));

		disposables.push(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
			provideCompletionItems(): any {
				return []; // stronger selector but not a good result;
			}
		}, []));

		return rpcProtocol.sync().then(() => {
			return provideSuggestionItems(model, new EditorPosition(1, 1), 'none').then(value => {
				assert.equal(value.length, 1);
				assert.equal(value[0].completion.insertText, 'weak-selector');
			});
		});
	});

	test('Suggest, order 2/3', function () {

		disposables.push(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
			provideCompletionItems(): any {
				return [new types.CompletionItem('strong-1')];
			}
		}, []));

		disposables.push(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
			provideCompletionItems(): any {
				return [new types.CompletionItem('strong-2')];
			}
		}, []));

		return rpcProtocol.sync().then(() => {
			return provideSuggestionItems(model, new EditorPosition(1, 1), 'none').then(value => {
				assert.equal(value.length, 2);
				assert.equal(value[0].completion.insertText, 'strong-1'); // sort by label
				assert.equal(value[1].completion.insertText, 'strong-2');
			});
		});
	});

	test('Suggest, evil provider', function () {

		disposables.push(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
			provideCompletionItems(): any {
				throw new Error('evil');
			}
		}, []));

		disposables.push(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
			provideCompletionItems(): any {
				return [new types.CompletionItem('testing')];
			}
		}, []));


		return rpcProtocol.sync().then(() => {

			return provideSuggestionItems(model, new EditorPosition(1, 1), 'none').then(value => {
				assert.equal(value[0].container.incomplete, undefined);
			});
		});
	});

	test('Suggest, CompletionList', function () {

		disposables.push(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
			provideCompletionItems(): any {
				return new types.CompletionList([<any>new types.CompletionItem('hello')], true);
			}
		}, []));

		return rpcProtocol.sync().then(() => {

			provideSuggestionItems(model, new EditorPosition(1, 1), 'none').then(value => {
				assert.equal(value[0].container.incomplete, true);
			});
		});
	});

	// --- format

	test('Format Doc, data conversion', function () {
		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentFormattingEditProvider {
			provideDocumentFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'testing'), types.TextEdit.setEndOfLine(types.EndOfLine.LF)];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getDocumentFormattingEdits(model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None).then(value => {
				assert.equal(value.length, 2);
				let [first, second] = value;
				assert.equal(first.text, 'testing');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });

				assert.equal(second.eol, EndOfLineSequence.LF);
				assert.equal(second.text, '');
				assert.deepEqual(second.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
			});
		});
	});

	test('Format Doc, evil provider', function () {
		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentFormattingEditProvider {
			provideDocumentFormattingEdits(): any {
				throw new Error('evil');
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getDocumentFormattingEdits(model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
		});
	});

	test('Format Doc, order', function () {

		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentFormattingEditProvider {
			provideDocumentFormattingEdits(): any {
				return undefined;
			}
		}));

		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentFormattingEditProvider {
			provideDocumentFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'testing')];
			}
		}));

		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentFormattingEditProvider {
			provideDocumentFormattingEdits(): any {
				return undefined;
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getDocumentFormattingEdits(model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;
				assert.equal(first.text, 'testing');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
			});
		});
	});

	test('Format Range, data conversion', function () {
		disposables.push(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentRangeFormattingEditProvider {
			provideDocumentRangeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'testing')];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getDocumentRangeFormattingEdits(model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;
				assert.equal(first.text, 'testing');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
			});
		});
	});

	test('Format Range, + format_doc', function () {
		disposables.push(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentRangeFormattingEditProvider {
			provideDocumentRangeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'range')];
			}
		}));
		disposables.push(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentRangeFormattingEditProvider {
			provideDocumentRangeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(2, 3, 4, 5), 'range2')];
			}
		}));
		disposables.push(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentFormattingEditProvider {
			provideDocumentFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 1, 1), 'doc')];
			}
		}));
		return rpcProtocol.sync().then(() => {
			return getDocumentRangeFormattingEdits(model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;
				assert.equal(first.text, 'range2');
				assert.equal(first.range.startLineNumber, 3);
				assert.equal(first.range.startColumn, 4);
				assert.equal(first.range.endLineNumber, 5);
				assert.equal(first.range.endColumn, 6);
			});
		});
	});

	test('Format Range, evil provider', function () {
		disposables.push(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentRangeFormattingEditProvider {
			provideDocumentRangeFormattingEdits(): any {
				throw new Error('evil');
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getDocumentRangeFormattingEdits(model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
		});
	});

	test('Format on Type, data conversion', function () {

		disposables.push(extHost.registerOnTypeFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.OnTypeFormattingEditProvider {
			provideOnTypeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), arguments[2])];
			}
		}, [';']));

		return rpcProtocol.sync().then(() => {
			return getOnTypeFormattingEdits(model, new EditorPosition(1, 1), ';', { insertSpaces: true, tabSize: 2 }).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;

				assert.equal(first.text, ';');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
			});
		});
	});

	test('Links, data conversion', function () {

		disposables.push(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentLinkProvider {
			provideDocumentLinks() {
				return [new types.DocumentLink(new types.Range(0, 0, 1, 1), URI.parse('foo:bar#3'))];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getLinks(model, CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;

				assert.equal(first.url, 'foo:bar#3');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 });
			});
		});
	});

	test('Links, evil provider', function () {

		disposables.push(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentLinkProvider {
			provideDocumentLinks() {
				return [new types.DocumentLink(new types.Range(0, 0, 1, 1), URI.parse('foo:bar#3'))];
			}
		}));

		disposables.push(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentLinkProvider {
			provideDocumentLinks(): any {
				throw new Error();
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getLinks(model, CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;

				assert.equal(first.url, 'foo:bar#3');
				assert.deepEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 });
			});
		});
	});

	test('Document colors, data conversion', function () {

		disposables.push(extHost.registerColorProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentColorProvider {
			provideDocumentColors(): vscode.ColorInformation[] {
				return [new types.ColorInformation(new types.Range(0, 0, 0, 20), new types.Color(0.1, 0.2, 0.3, 0.4))];
			}
			provideColorPresentations(color: vscode.Color, context: { range: vscode.Range, document: vscode.TextDocument }): vscode.ColorPresentation[] {
				return [];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return getColors(model, CancellationToken.None).then(value => {
				assert.equal(value.length, 1);
				let [first] = value;

				assert.deepEqual(first.colorInfo.color, { red: 0.1, green: 0.2, blue: 0.3, alpha: 0.4 });
				assert.deepEqual(first.colorInfo.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 21 });
			});
		});
	});

	// -- selection ranges

	test('Selection Ranges, data conversion', async function () {
		disposables.push(extHost.registerSelectionRangeProvider(defaultExtension, defaultSelector, new class implements vscode.SelectionRangeProvider {
			provideSelectionRanges() {
				return [
					new types.SelectionRange(new types.Range(0, 10, 0, 18), types.SelectionRangeKind.Empty),
					new types.SelectionRange(new types.Range(0, 2, 0, 20), types.SelectionRangeKind.Empty)
				];
			}
		}));

		await rpcProtocol.sync();

		provideSelectionRanges(model, new Position(1, 17), CancellationToken.None).then(ranges => {
			assert.ok(ranges.length >= 2);
		});
	});
});
