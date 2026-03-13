/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { setUnexpectedErrorHandler, errorHandler } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import * as types from '../../common/extHostTypes.js';
import { createTextModel } from '../../../../editor/test/common/testTextModel.js';
import { Position as EditorPosition, Position } from '../../../../editor/common/core/position.js';
import { Range as EditorRange } from '../../../../editor/common/core/range.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { IMarkerService } from '../../../../platform/markers/common/markers.js';
import { MarkerService } from '../../../../platform/markers/common/markerService.js';
import { ExtHostLanguageFeatures } from '../../common/extHostLanguageFeatures.js';
import { MainThreadLanguageFeatures } from '../../browser/mainThreadLanguageFeatures.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { MainThreadCommands } from '../../browser/mainThreadCommands.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import * as languages from '../../../../editor/common/languages.js';
import { getCodeLensModel } from '../../../../editor/contrib/codelens/browser/codelens.js';
import { getDefinitionsAtPosition, getImplementationsAtPosition, getTypeDefinitionsAtPosition, getDeclarationsAtPosition, getReferencesAtPosition } from '../../../../editor/contrib/gotoSymbol/browser/goToSymbol.js';
import { getHoversPromise } from '../../../../editor/contrib/hover/browser/getHover.js';
import { getOccurrencesAtPosition } from '../../../../editor/contrib/wordHighlighter/browser/wordHighlighter.js';
import { getCodeActions } from '../../../../editor/contrib/codeAction/browser/codeAction.js';
import { getWorkspaceSymbols } from '../../../contrib/search/common/search.js';
import { rename } from '../../../../editor/contrib/rename/browser/rename.js';
import { provideSignatureHelp } from '../../../../editor/contrib/parameterHints/browser/provideSignatureHelp.js';
import { provideSuggestionItems, CompletionOptions } from '../../../../editor/contrib/suggest/browser/suggest.js';
import { getDocumentFormattingEditsUntilResult, getDocumentRangeFormattingEditsUntilResult, getOnTypeFormattingEdits } from '../../../../editor/contrib/format/browser/format.js';
import { getLinks } from '../../../../editor/contrib/links/browser/getLinks.js';
import { MainContext, ExtHostContext } from '../../common/extHost.protocol.js';
import { ExtHostDiagnostics } from '../../common/extHostDiagnostics.js';
import type * as vscode from 'vscode';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ITextModel, EndOfLineSequence } from '../../../../editor/common/model.js';
import { getColors } from '../../../../editor/contrib/colorPicker/browser/color.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { nullExtensionDescription as defaultExtension } from '../../../services/extensions/common/extensions.js';
import { provideSelectionRanges } from '../../../../editor/contrib/smartSelect/browser/smartSelect.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { Progress } from '../../../../platform/progress/common/progress.js';
import { IExtHostFileSystemInfo } from '../../common/extHostFileSystemInfo.js';
import { URITransformerService } from '../../common/extHostUriTransformerService.js';
import { OutlineModel } from '../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../editor/common/services/languageFeaturesService.js';
import { CodeActionTriggerSource } from '../../../../editor/contrib/codeAction/common/types.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';

suite('ExtHostLanguageFeatures', function () {

	const defaultSelector = { scheme: 'far' };
	let model: ITextModel;
	let extHost: ExtHostLanguageFeatures;
	let mainThread: MainThreadLanguageFeatures;
	const disposables = new DisposableStore();
	let rpcProtocol: TestRPCProtocol;
	let languageFeaturesService: ILanguageFeaturesService;
	let originalErrorHandler: (e: any) => any;
	let instantiationService: TestInstantiationService;

	setup(() => {

		model = createTextModel(
			[
				'This is the first line',
				'This is the second line',
				'This is the third line',
			].join('\n'),
			undefined,
			undefined,
			URI.parse('far://testing/file.a'));

		rpcProtocol = new TestRPCProtocol();

		languageFeaturesService = new LanguageFeaturesService();

		// Use IInstantiationService to get typechecking when instantiating
		let inst: IInstantiationService;
		{
			instantiationService = new TestInstantiationService();
			instantiationService.stub(IMarkerService, MarkerService);
			instantiationService.set(ILanguageFeaturesService, languageFeaturesService);
			instantiationService.set(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				override asCanonicalUri(uri: URI): URI {
					return uri;
				}
			});
			inst = instantiationService;
		}

		originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(() => { });

		const extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService());
		extHostDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [{
				isDirty: false,
				versionId: model.getVersionId(),
				languageId: model.getLanguageId(),
				uri: model.uri,
				lines: model.getValue().split(model.getEOL()),
				EOL: model.getEOL(),
				encoding: 'utf8'
			}]
		});
		const extHostDocuments = new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors);
		rpcProtocol.set(ExtHostContext.ExtHostDocuments, extHostDocuments);

		const commands = new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock<IExtHostTelemetry>() {
			override onExtensionError(): boolean {
				return true;
			}
		});
		rpcProtocol.set(ExtHostContext.ExtHostCommands, commands);
		rpcProtocol.set(MainContext.MainThreadCommands, disposables.add(inst.createInstance(MainThreadCommands, rpcProtocol)));

		const diagnostics = new ExtHostDiagnostics(rpcProtocol, new NullLogService(), new class extends mock<IExtHostFileSystemInfo>() { }, extHostDocumentsAndEditors);
		rpcProtocol.set(ExtHostContext.ExtHostDiagnostics, diagnostics);

		extHost = new ExtHostLanguageFeatures(rpcProtocol, new URITransformerService(null), extHostDocuments, commands, diagnostics, new NullLogService(), NullApiDeprecationService, new class extends mock<IExtHostTelemetry>() {
			override onExtensionError(): boolean {
				return true;
			}
		});
		rpcProtocol.set(ExtHostContext.ExtHostLanguageFeatures, extHost);

		mainThread = rpcProtocol.set(MainContext.MainThreadLanguageFeatures, disposables.add(inst.createInstance(MainThreadLanguageFeatures, rpcProtocol)));
	});

	teardown(() => {
		disposables.clear();

		setUnexpectedErrorHandler(originalErrorHandler);
		model.dispose();
		mainThread.dispose();
		instantiationService.dispose();

		return rpcProtocol.sync();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// --- outline

	test('DocumentSymbols, register/deregister', async () => {
		assert.strictEqual(languageFeaturesService.documentSymbolProvider.all(model).length, 0);
		const d1 = extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentSymbolProvider {
			provideDocumentSymbols() {
				return <vscode.SymbolInformation[]>[];
			}
		});

		await rpcProtocol.sync();
		assert.strictEqual(languageFeaturesService.documentSymbolProvider.all(model).length, 1);
		d1.dispose();
		return rpcProtocol.sync();

	});

	test('DocumentSymbols, evil provider', async () => {
		disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentSymbolProvider {
			provideDocumentSymbols(): any {
				throw new Error('evil document symbol provider');
			}
		}));
		disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentSymbolProvider {
			provideDocumentSymbols(): any {
				return [new types.SymbolInformation('test', types.SymbolKind.Field, new types.Range(0, 0, 0, 0))];
			}
		}));

		await rpcProtocol.sync();
		const value = (await OutlineModel.create(languageFeaturesService.documentSymbolProvider, model, CancellationToken.None)).asListOfDocumentSymbols();
		assert.strictEqual(value.length, 1);
	});

	test('DocumentSymbols, data conversion', async () => {
		disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentSymbolProvider {
			provideDocumentSymbols(): any {
				return [new types.SymbolInformation('test', types.SymbolKind.Field, new types.Range(0, 0, 0, 0))];
			}
		}));

		await rpcProtocol.sync();
		const value = (await OutlineModel.create(languageFeaturesService.documentSymbolProvider, model, CancellationToken.None)).asListOfDocumentSymbols();
		assert.strictEqual(value.length, 1);
		const entry = value[0];
		assert.strictEqual(entry.name, 'test');
		assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
	});

	test('Quick Outline uses a not ideal sorting, #138502', async function () {
		const symbols = [
			{ name: 'containers', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 26 } },
			{ name: 'container 0', range: { startLineNumber: 2, startColumn: 5, endLineNumber: 5, endColumn: 1 } },
			{ name: 'name', range: { startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 16 } },
			{ name: 'ports', range: { startLineNumber: 3, startColumn: 5, endLineNumber: 5, endColumn: 1 } },
			{ name: 'ports 0', range: { startLineNumber: 4, startColumn: 9, endLineNumber: 4, endColumn: 26 } },
			{ name: 'containerPort', range: { startLineNumber: 4, startColumn: 9, endLineNumber: 4, endColumn: 26 } }
		];

		disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, {
			provideDocumentSymbols: (doc, token): any => {
				return symbols.map(s => {
					return new types.SymbolInformation(
						s.name,
						types.SymbolKind.Object,
						new types.Range(s.range.startLineNumber - 1, s.range.startColumn - 1, s.range.endLineNumber - 1, s.range.endColumn - 1)
					);
				});
			}
		}));

		await rpcProtocol.sync();

		const value = (await OutlineModel.create(languageFeaturesService.documentSymbolProvider, model, CancellationToken.None)).asListOfDocumentSymbols();

		assert.strictEqual(value.length, 6);
		assert.deepStrictEqual(value.map(s => s.name), ['containers', 'container 0', 'name', 'ports', 'ports 0', 'containerPort']);
	});

	// --- code lens

	test('CodeLens, evil provider', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class implements vscode.CodeLensProvider {
				provideCodeLenses(): any {
					throw new Error('evil');
				}
			}));
			disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class implements vscode.CodeLensProvider {
				provideCodeLenses() {
					return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
				}
			}));

			await rpcProtocol.sync();
			const value = await getCodeLensModel(languageFeaturesService.codeLensProvider, model, CancellationToken.None);
			assert.strictEqual(value.lenses.length, 1);
			value.dispose();
		});
	});

	test('CodeLens, do not resolve a resolved lens', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class implements vscode.CodeLensProvider {
				provideCodeLenses(): any {
					return [new types.CodeLens(
						new types.Range(0, 0, 0, 0),
						{ command: 'id', title: 'Title' })];
				}
				resolveCodeLens(): any {
					assert.ok(false, 'do not resolve');
				}
			}));

			await rpcProtocol.sync();
			const value = await getCodeLensModel(languageFeaturesService.codeLensProvider, model, CancellationToken.None);
			assert.strictEqual(value.lenses.length, 1);
			const [data] = value.lenses;
			const symbol = await Promise.resolve(data.provider.resolveCodeLens!(model, data.symbol, CancellationToken.None));
			assert.strictEqual(symbol!.command!.id, 'id');
			assert.strictEqual(symbol!.command!.title, 'Title');
			value.dispose();
		});
	});

	test('CodeLens, missing command', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class implements vscode.CodeLensProvider {
				provideCodeLenses() {
					return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
				}
			}));

			await rpcProtocol.sync();
			const value = await getCodeLensModel(languageFeaturesService.codeLensProvider, model, CancellationToken.None);
			assert.strictEqual(value.lenses.length, 1);
			const [data] = value.lenses;
			const symbol = await Promise.resolve(data.provider.resolveCodeLens!(model, data.symbol, CancellationToken.None));
			assert.strictEqual(symbol, undefined);
			value.dispose();
		});
	});

	// --- definition

	test('Definition, data conversion', async () => {

		disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
			}
		}));

		await rpcProtocol.sync();
		const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
		assert.strictEqual(value.length, 1);
		const [entry] = value;
		assert.deepStrictEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
		assert.strictEqual(entry.uri.toString(), model.uri.toString());
	});

	test('Definition, one or many', async () => {

		disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				return [new types.Location(model.uri, new types.Range(1, 1, 1, 1))];
			}
		}));
		disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				return new types.Location(model.uri, new types.Range(2, 1, 1, 1));
			}
		}));

		await rpcProtocol.sync();
		const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
		assert.strictEqual(value.length, 2);
	});

	test('Definition, registration order', async () => {

		disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				return [new types.Location(URI.parse('far://first'), new types.Range(2, 3, 4, 5))];
			}
		}));

		disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				return new types.Location(URI.parse('far://second'), new types.Range(1, 2, 3, 4));
			}
		}));

		await rpcProtocol.sync();
		const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
		assert.strictEqual(value.length, 2);
		// let [first, second] = value;
		assert.strictEqual(value[0].uri.authority, 'second');
		assert.strictEqual(value[1].uri.authority, 'first');
	});

	test('Definition, evil provider', async () => {

		disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				throw new Error('evil provider');
			}
		}));
		disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.DefinitionProvider {
			provideDefinition(): any {
				return new types.Location(model.uri, new types.Range(1, 1, 1, 1));
			}
		}));

		await rpcProtocol.sync();
		const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
		assert.strictEqual(value.length, 1);
	});

	// -- declaration

	test('Declaration, data conversion', async () => {

		disposables.add(extHost.registerDeclarationProvider(defaultExtension, defaultSelector, new class implements vscode.DeclarationProvider {
			provideDeclaration(): any {
				return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
			}
		}));

		await rpcProtocol.sync();
		const value = await getDeclarationsAtPosition(languageFeaturesService.declarationProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
		assert.strictEqual(value.length, 1);
		const [entry] = value;
		assert.deepStrictEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
		assert.strictEqual(entry.uri.toString(), model.uri.toString());
	});

	// --- implementation

	test('Implementation, data conversion', async () => {

		disposables.add(extHost.registerImplementationProvider(defaultExtension, defaultSelector, new class implements vscode.ImplementationProvider {
			provideImplementation(): any {
				return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
			}
		}));

		await rpcProtocol.sync();
		const value = await getImplementationsAtPosition(languageFeaturesService.implementationProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
		assert.strictEqual(value.length, 1);
		const [entry] = value;
		assert.deepStrictEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
		assert.strictEqual(entry.uri.toString(), model.uri.toString());
	});

	// --- type definition

	test('Type Definition, data conversion', async () => {

		disposables.add(extHost.registerTypeDefinitionProvider(defaultExtension, defaultSelector, new class implements vscode.TypeDefinitionProvider {
			provideTypeDefinition(): any {
				return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
			}
		}));

		await rpcProtocol.sync();
		const value = await getTypeDefinitionsAtPosition(languageFeaturesService.typeDefinitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
		assert.strictEqual(value.length, 1);
		const [entry] = value;
		assert.deepStrictEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
		assert.strictEqual(entry.uri.toString(), model.uri.toString());
	});

	// --- extra info

	test('HoverProvider, word range at pos', async () => {

		disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class implements vscode.HoverProvider {
			provideHover(): any {
				return new types.Hover('Hello');
			}
		}));

		await rpcProtocol.sync();
		const hovers = await getHoversPromise(languageFeaturesService.hoverProvider, model, new EditorPosition(1, 1), CancellationToken.None);
		assert.strictEqual(hovers.length, 1);
		const [entry] = hovers;
		assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
	});


	test('HoverProvider, given range', async () => {

		disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class implements vscode.HoverProvider {
			provideHover(): any {
				return new types.Hover('Hello', new types.Range(3, 0, 8, 7));
			}
		}));

		await rpcProtocol.sync();
		const hovers = await getHoversPromise(languageFeaturesService.hoverProvider, model, new EditorPosition(1, 1), CancellationToken.None);
		assert.strictEqual(hovers.length, 1);
		const [entry] = hovers;
		assert.deepStrictEqual(entry.range, { startLineNumber: 4, startColumn: 1, endLineNumber: 9, endColumn: 8 });
	});


	test('HoverProvider, registration order', async () => {
		disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class implements vscode.HoverProvider {
			provideHover(): any {
				return new types.Hover('registered first');
			}
		}));


		disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class implements vscode.HoverProvider {
			provideHover(): any {
				return new types.Hover('registered second');
			}
		}));

		await rpcProtocol.sync();
		const value = await getHoversPromise(languageFeaturesService.hoverProvider, model, new EditorPosition(1, 1), CancellationToken.None);
		assert.strictEqual(value.length, 2);
		const [first, second] = value;
		assert.strictEqual(first.contents[0].value, 'registered second');
		assert.strictEqual(second.contents[0].value, 'registered first');
	});


	test('HoverProvider, evil provider', async () => {

		disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class implements vscode.HoverProvider {
			provideHover(): any {
				throw new Error('evil');
			}
		}));
		disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class implements vscode.HoverProvider {
			provideHover(): any {
				return new types.Hover('Hello');
			}
		}));

		await rpcProtocol.sync();
		const hovers = await getHoversPromise(languageFeaturesService.hoverProvider, model, new EditorPosition(1, 1), CancellationToken.None);
		assert.strictEqual(hovers.length, 1);
	});

	// --- occurrences

	test('Occurrences, data conversion', async () => {

		disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
			}
		}));

		await rpcProtocol.sync();
		const value = (await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None))!;
		assert.strictEqual(value.size, 1);
		const [entry] = Array.from(value.values())[0];
		assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
		assert.strictEqual(entry.kind, languages.DocumentHighlightKind.Text);
	});

	test('Occurrences, order 1/2', async () => {

		disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				return undefined;
			}
		}));
		disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, '*', new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
			}
		}));

		await rpcProtocol.sync();
		const value = (await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None))!;
		assert.strictEqual(value.size, 1);
		const [entry] = Array.from(value.values())[0];
		assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
		assert.strictEqual(entry.kind, languages.DocumentHighlightKind.Text);
	});

	test('Occurrences, order 2/2', async () => {

		disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 2))];
			}
		}));
		disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, '*', new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
			}
		}));

		await rpcProtocol.sync();
		const value = (await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None))!;
		assert.strictEqual(value.size, 1);
		const [entry] = Array.from(value.values())[0];
		assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3 });
		assert.strictEqual(entry.kind, languages.DocumentHighlightKind.Text);
	});

	test('Occurrences, evil provider', async () => {

		disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				throw new Error('evil');
			}
		}));

		disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentHighlightProvider {
			provideDocumentHighlights(): any {
				return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
			}
		}));

		await rpcProtocol.sync();
		const value = await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None);
		assert.strictEqual(value!.size, 1);
	});

	// --- references

	test('References, registration order', async () => {

		disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class implements vscode.ReferenceProvider {
			provideReferences(): any {
				return [new types.Location(URI.parse('far://register/first'), new types.Range(0, 0, 0, 0))];
			}
		}));

		disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class implements vscode.ReferenceProvider {
			provideReferences(): any {
				return [new types.Location(URI.parse('far://register/second'), new types.Range(0, 0, 0, 0))];
			}
		}));

		await rpcProtocol.sync();
		const value = await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, new EditorPosition(1, 2), false, false, CancellationToken.None);
		assert.strictEqual(value.length, 2);
		const [first, second] = value;
		assert.strictEqual(first.uri.path, '/second');
		assert.strictEqual(second.uri.path, '/first');
	});

	test('References, data conversion', async () => {

		disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class implements vscode.ReferenceProvider {
			provideReferences(): any {
				return [new types.Location(model.uri, new types.Position(0, 0))];
			}
		}));

		await rpcProtocol.sync();
		const value = await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, new EditorPosition(1, 2), false, false, CancellationToken.None);
		assert.strictEqual(value.length, 1);
		const [item] = value;
		assert.deepStrictEqual(item.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
		assert.strictEqual(item.uri.toString(), model.uri.toString());
	});

	test('References, evil provider', async () => {

		disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class implements vscode.ReferenceProvider {
			provideReferences(): any {
				throw new Error('evil');
			}
		}));
		disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class implements vscode.ReferenceProvider {
			provideReferences(): any {
				return [new types.Location(model.uri, new types.Range(0, 0, 0, 0))];
			}
		}));

		await rpcProtocol.sync();
		const value = await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, new EditorPosition(1, 2), false, false, CancellationToken.None);
		assert.strictEqual(value.length, 1);
	});

	// --- quick fix

	test('Quick Fix, command data conversion', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, {
				provideCodeActions(): vscode.Command[] {
					return [
						{ command: 'test1', title: 'Testing1' },
						{ command: 'test2', title: 'Testing2' }
					];
				}
			}));

			await rpcProtocol.sync();
			const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.QuickFix }, Progress.None, CancellationToken.None);
			const { validActions: actions } = value;
			assert.strictEqual(actions.length, 2);
			const [first, second] = actions;
			assert.strictEqual(first.action.title, 'Testing1');
			assert.strictEqual(first.action.command!.id, 'test1');
			assert.strictEqual(second.action.title, 'Testing2');
			assert.strictEqual(second.action.command!.id, 'test2');
			value.dispose();
		});
	});

	test('Quick Fix, code action data conversion', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, {
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

			await rpcProtocol.sync();
			const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.Default }, Progress.None, CancellationToken.None);
			const { validActions: actions } = value;
			assert.strictEqual(actions.length, 1);
			const [first] = actions;
			assert.strictEqual(first.action.title, 'Testing1');
			assert.strictEqual(first.action.command!.title, 'Testing1Command');
			assert.strictEqual(first.action.command!.id, 'test1');
			assert.strictEqual(first.action.kind, 'test.scope');
			value.dispose();
		});
	});


	test('Cannot read property \'id\' of undefined, #29469', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class implements vscode.CodeActionProvider {
				provideCodeActions(): any {
					return [
						undefined,
						null,
						{ command: 'test', title: 'Testing' }
					];
				}
			}));

			await rpcProtocol.sync();
			const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.Default }, Progress.None, CancellationToken.None);
			const { validActions: actions } = value;
			assert.strictEqual(actions.length, 1);
			value.dispose();
		});
	});

	test('Quick Fix, evil provider', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class implements vscode.CodeActionProvider {
				provideCodeActions(): any {
					throw new Error('evil');
				}
			}));
			disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class implements vscode.CodeActionProvider {
				provideCodeActions(): any {
					return [{ command: 'test', title: 'Testing' }];
				}
			}));

			await rpcProtocol.sync();
			const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.QuickFix }, Progress.None, CancellationToken.None);
			const { validActions: actions } = value;
			assert.strictEqual(actions.length, 1);
			value.dispose();
		});
	});

	// --- navigate types

	test('Navigate types, evil provider', async () => {

		disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class implements vscode.WorkspaceSymbolProvider {
			provideWorkspaceSymbols(): any {
				throw new Error('evil');
			}
		}));

		disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class implements vscode.WorkspaceSymbolProvider {
			provideWorkspaceSymbols(): any {
				return [new types.SymbolInformation('testing', types.SymbolKind.Array, new types.Range(0, 0, 1, 1))];
			}
		}));

		await rpcProtocol.sync();
		const value = await getWorkspaceSymbols('');
		assert.strictEqual(value.length, 1);
		const [first] = value;
		assert.strictEqual(first.symbol.name, 'testing');
	});

	test('Navigate types, de-duplicate results', async () => {
		const uri = URI.from({ scheme: 'foo', path: '/some/path' });
		disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class implements vscode.WorkspaceSymbolProvider {
			provideWorkspaceSymbols(): any {
				return [new types.SymbolInformation('ONE', types.SymbolKind.Array, undefined, new types.Location(uri, new types.Range(0, 0, 1, 1)))];
			}
		}));

		disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class implements vscode.WorkspaceSymbolProvider {
			provideWorkspaceSymbols(): any {
				return [new types.SymbolInformation('ONE', types.SymbolKind.Array, undefined, new types.Location(uri, new types.Range(0, 0, 1, 1)))]; // get de-duped
			}
		}));

		disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class implements vscode.WorkspaceSymbolProvider {
			provideWorkspaceSymbols(): any {
				return [new types.SymbolInformation('ONE', types.SymbolKind.Array, undefined, new types.Location(uri, undefined!))]; // NO dedupe because of resolve
			}
			resolveWorkspaceSymbol(a: vscode.SymbolInformation) {
				return a;
			}
		}));

		disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class implements vscode.WorkspaceSymbolProvider {
			provideWorkspaceSymbols(): any {
				return [new types.SymbolInformation('ONE', types.SymbolKind.Struct, undefined, new types.Location(uri, new types.Range(0, 0, 1, 1)))]; // NO dedupe because of kind
			}
		}));

		await rpcProtocol.sync();
		const value = await getWorkspaceSymbols('');
		assert.strictEqual(value.length, 3);
	});

	// --- rename

	test('Rename, evil provider 0/2', async () => {

		disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class implements vscode.RenameProvider {
			provideRenameEdits(): any {
				throw new class Foo { };
			}
		}));

		await rpcProtocol.sync();
		try {
			await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), 'newName');
			throw Error();
		}
		catch (err) {
			// expected
		}
	});

	test('Rename, evil provider 1/2', async () => {

		disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class implements vscode.RenameProvider {
			provideRenameEdits(): any {
				throw Error('evil');
			}
		}));

		await rpcProtocol.sync();
		const value = await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), 'newName');
		assert.strictEqual(value.rejectReason, 'evil');
	});

	test('Rename, evil provider 2/2', async () => {

		disposables.add(extHost.registerRenameProvider(defaultExtension, '*', new class implements vscode.RenameProvider {
			provideRenameEdits(): any {
				throw Error('evil');
			}
		}));

		disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class implements vscode.RenameProvider {
			provideRenameEdits(): any {
				const edit = new types.WorkspaceEdit();
				edit.replace(model.uri, new types.Range(0, 0, 0, 0), 'testing');
				return edit;
			}
		}));

		await rpcProtocol.sync();
		const value = await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), 'newName');
		assert.strictEqual(value.edits.length, 1);
	});

	test('Rename, ordering', async () => {

		disposables.add(extHost.registerRenameProvider(defaultExtension, '*', new class implements vscode.RenameProvider {
			provideRenameEdits(): any {
				const edit = new types.WorkspaceEdit();
				edit.replace(model.uri, new types.Range(0, 0, 0, 0), 'testing');
				edit.replace(model.uri, new types.Range(1, 0, 1, 0), 'testing');
				return edit;
			}
		}));

		disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class implements vscode.RenameProvider {
			provideRenameEdits(): any {
				return;
			}
		}));

		await rpcProtocol.sync();
		const value = await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), 'newName');
		// least relevant rename provider
		assert.strictEqual(value.edits.length, 2);
	});

	test('Multiple RenameProviders don\'t respect all possible PrepareRename handlers 1/2, #98352', async function () {

		const called = [false, false, false, false];

		disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class implements vscode.RenameProvider {
			prepareRename(document: vscode.TextDocument, position: vscode.Position,): vscode.ProviderResult<vscode.Range> {
				called[0] = true;
				const range = document.getWordRangeAtPosition(position);
				return range;
			}

			provideRenameEdits(): vscode.ProviderResult<vscode.WorkspaceEdit> {
				called[1] = true;
				return undefined;
			}
		}));

		disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class implements vscode.RenameProvider {
			prepareRename(document: vscode.TextDocument, position: vscode.Position,): vscode.ProviderResult<vscode.Range> {
				called[2] = true;
				return Promise.reject('Cannot rename this symbol2.');
			}
			provideRenameEdits(): vscode.ProviderResult<vscode.WorkspaceEdit> {
				called[3] = true;
				return undefined;
			}
		}));

		await rpcProtocol.sync();
		await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), 'newName');

		assert.deepStrictEqual(called, [true, true, true, false]);
	});

	test('Multiple RenameProviders don\'t respect all possible PrepareRename handlers 2/2, #98352', async function () {

		const called = [false, false, false];

		disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class implements vscode.RenameProvider {
			prepareRename(document: vscode.TextDocument, position: vscode.Position,): vscode.ProviderResult<vscode.Range> {
				called[0] = true;
				const range = document.getWordRangeAtPosition(position);
				return range;
			}

			provideRenameEdits(): vscode.ProviderResult<vscode.WorkspaceEdit> {
				called[1] = true;
				return undefined;
			}
		}));

		disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class implements vscode.RenameProvider {

			provideRenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: string,): vscode.ProviderResult<vscode.WorkspaceEdit> {
				called[2] = true;
				return new types.WorkspaceEdit();
			}
		}));

		await rpcProtocol.sync();
		await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), 'newName');

		// first provider has NO prepare which means it is taken by default
		assert.deepStrictEqual(called, [false, false, true]);
	});

	// --- parameter hints

	test('Parameter Hints, order', async () => {

		disposables.add(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class implements vscode.SignatureHelpProvider {
			provideSignatureHelp(): any {
				return undefined;
			}
		}, []));

		disposables.add(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class implements vscode.SignatureHelpProvider {
			provideSignatureHelp(): vscode.SignatureHelp {
				return {
					signatures: [],
					activeParameter: 0,
					activeSignature: 0
				};
			}
		}, []));

		await rpcProtocol.sync();
		const value = await provideSignatureHelp(languageFeaturesService.signatureHelpProvider, model, new EditorPosition(1, 1), { triggerKind: languages.SignatureHelpTriggerKind.Invoke, isRetrigger: false }, CancellationToken.None);
		assert.ok(value);
	});

	test('Parameter Hints, evil provider', async () => {

		disposables.add(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class implements vscode.SignatureHelpProvider {
			provideSignatureHelp(): any {
				throw new Error('evil');
			}
		}, []));

		await rpcProtocol.sync();
		const value = await provideSignatureHelp(languageFeaturesService.signatureHelpProvider, model, new EditorPosition(1, 1), { triggerKind: languages.SignatureHelpTriggerKind.Invoke, isRetrigger: false }, CancellationToken.None);
		assert.strictEqual(value, undefined);
	});

	// --- suggestions

	test('Suggest, order 1/3', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			disposables.add(extHost.registerCompletionItemProvider(defaultExtension, '*', new class implements vscode.CompletionItemProvider {
				provideCompletionItems(): any {
					return [new types.CompletionItem('testing1')];
				}
			}, []));

			disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
				provideCompletionItems(): any {
					return [new types.CompletionItem('testing2')];
				}
			}, []));

			await rpcProtocol.sync();
			const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(undefined, new Set<languages.CompletionItemKind>().add(languages.CompletionItemKind.Snippet)));
			assert.strictEqual(value.items.length, 1);
			assert.strictEqual(value.items[0].completion.insertText, 'testing2');
			value.disposable.dispose();
		});
	});

	test('Suggest, order 2/3', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			disposables.add(extHost.registerCompletionItemProvider(defaultExtension, '*', new class implements vscode.CompletionItemProvider {
				provideCompletionItems(): any {
					return [new types.CompletionItem('weak-selector')]; // weaker selector but result
				}
			}, []));

			disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
				provideCompletionItems(): any {
					return []; // stronger selector but not a good result;
				}
			}, []));

			await rpcProtocol.sync();
			const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(undefined, new Set<languages.CompletionItemKind>().add(languages.CompletionItemKind.Snippet)));
			assert.strictEqual(value.items.length, 1);
			assert.strictEqual(value.items[0].completion.insertText, 'weak-selector');
			value.disposable.dispose();
		});
	});

	test('Suggest, order 3/3', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
				provideCompletionItems(): any {
					return [new types.CompletionItem('strong-1')];
				}
			}, []));

			disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
				provideCompletionItems(): any {
					return [new types.CompletionItem('strong-2')];
				}
			}, []));

			await rpcProtocol.sync();
			const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(undefined, new Set<languages.CompletionItemKind>().add(languages.CompletionItemKind.Snippet)));
			assert.strictEqual(value.items.length, 2);
			assert.strictEqual(value.items[0].completion.insertText, 'strong-1'); // sort by label
			assert.strictEqual(value.items[1].completion.insertText, 'strong-2');
			value.disposable.dispose();
		});
	});

	test('Suggest, evil provider', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
				provideCompletionItems(): any {
					throw new Error('evil');
				}
			}, []));

			disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
				provideCompletionItems(): any {
					return [new types.CompletionItem('testing')];
				}
			}, []));


			await rpcProtocol.sync();
			const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(undefined, new Set<languages.CompletionItemKind>().add(languages.CompletionItemKind.Snippet)));
			assert.strictEqual(value.items[0].container.incomplete, false);
			value.disposable.dispose();
		});
	});

	test('Suggest, CompletionList', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class implements vscode.CompletionItemProvider {
				provideCompletionItems(): any {
					// eslint-disable-next-line local/code-no-any-casts
					return new types.CompletionList([<any>new types.CompletionItem('hello')], true);
				}
			}, []));

			await rpcProtocol.sync();
			await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(undefined, new Set<languages.CompletionItemKind>().add(languages.CompletionItemKind.Snippet))).then(model => {
				assert.strictEqual(model.items[0].container.incomplete, true);
				model.disposable.dispose();
			});
		});
	});

	// --- format

	const NullWorkerService = new class extends mock<IEditorWorkerService>() {
		override computeMoreMinimalEdits(resource: URI, edits: languages.TextEdit[] | null | undefined): Promise<languages.TextEdit[] | undefined> {
			return Promise.resolve(edits ?? undefined);
		}
	};

	test('Format Doc, data conversion', async () => {
		disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentFormattingEditProvider {
			provideDocumentFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'testing'), types.TextEdit.setEndOfLine(types.EndOfLine.LF)];
			}
		}));

		await rpcProtocol.sync();
		const value = (await getDocumentFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None))!;
		assert.strictEqual(value.length, 2);
		const [first, second] = value;
		assert.strictEqual(first.text, 'testing');
		assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
		assert.strictEqual(second.eol, EndOfLineSequence.LF);
		assert.strictEqual(second.text, '');
		assert.deepStrictEqual(second.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
	});

	test('Format Doc, evil provider', async () => {
		disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentFormattingEditProvider {
			provideDocumentFormattingEdits(): any {
				throw new Error('evil');
			}
		}));

		await rpcProtocol.sync();
		return getDocumentFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
	});

	test('Format Doc, order', async () => {

		disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentFormattingEditProvider {
			provideDocumentFormattingEdits(): any {
				return undefined;
			}
		}));

		disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentFormattingEditProvider {
			provideDocumentFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'testing')];
			}
		}));

		disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentFormattingEditProvider {
			provideDocumentFormattingEdits(): any {
				return undefined;
			}
		}));

		await rpcProtocol.sync();
		const value = (await getDocumentFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None))!;
		assert.strictEqual(value.length, 1);
		const [first] = value;
		assert.strictEqual(first.text, 'testing');
		assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
	});

	test('Format Range, data conversion', async () => {
		disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentRangeFormattingEditProvider {
			provideDocumentRangeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'testing')];
			}
		}));

		await rpcProtocol.sync();
		const value = (await getDocumentRangeFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None))!;
		assert.strictEqual(value.length, 1);
		const [first] = value;
		assert.strictEqual(first.text, 'testing');
		assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
	});

	test('Format Range, + format_doc', async () => {
		disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentRangeFormattingEditProvider {
			provideDocumentRangeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'range')];
			}
		}));
		disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentRangeFormattingEditProvider {
			provideDocumentRangeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(2, 3, 4, 5), 'range2')];
			}
		}));
		disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentFormattingEditProvider {
			provideDocumentFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 1, 1), 'doc')];
			}
		}));
		await rpcProtocol.sync();
		const value = (await getDocumentRangeFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None))!;
		assert.strictEqual(value.length, 1);
		const [first] = value;
		assert.strictEqual(first.text, 'range2');
		assert.strictEqual(first.range.startLineNumber, 3);
		assert.strictEqual(first.range.startColumn, 4);
		assert.strictEqual(first.range.endLineNumber, 5);
		assert.strictEqual(first.range.endColumn, 6);
	});

	test('Format Range, evil provider', async () => {
		disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentRangeFormattingEditProvider {
			provideDocumentRangeFormattingEdits(): any {
				throw new Error('evil');
			}
		}));

		await rpcProtocol.sync();
		return getDocumentRangeFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
	});

	test('Format on Type, data conversion', async () => {

		disposables.add(extHost.registerOnTypeFormattingEditProvider(defaultExtension, defaultSelector, new class implements vscode.OnTypeFormattingEditProvider {
			provideOnTypeFormattingEdits(): any {
				return [new types.TextEdit(new types.Range(0, 0, 0, 0), arguments[2])];
			}
		}, [';']));

		await rpcProtocol.sync();
		const value = (await getOnTypeFormattingEdits(NullWorkerService, languageFeaturesService, model, new EditorPosition(1, 1), ';', { insertSpaces: true, tabSize: 2 }, CancellationToken.None))!;
		assert.strictEqual(value.length, 1);
		const [first] = value;
		assert.strictEqual(first.text, ';');
		assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
	});

	test('Links, data conversion', async () => {

		disposables.add(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentLinkProvider {
			provideDocumentLinks() {
				const link = new types.DocumentLink(new types.Range(0, 0, 1, 1), URI.parse('foo:bar#3'));
				link.tooltip = 'tooltip';
				return [link];
			}
		}));

		await rpcProtocol.sync();
		const { links } = disposables.add(await getLinks(languageFeaturesService.linkProvider, model, CancellationToken.None));
		assert.strictEqual(links.length, 1);
		const [first] = links;
		assert.strictEqual(first.url?.toString(), 'foo:bar#3');
		assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 });
		assert.strictEqual(first.tooltip, 'tooltip');
	});

	test('Links, evil provider', async () => {

		disposables.add(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentLinkProvider {
			provideDocumentLinks() {
				return [new types.DocumentLink(new types.Range(0, 0, 1, 1), URI.parse('foo:bar#3'))];
			}
		}));

		disposables.add(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentLinkProvider {
			provideDocumentLinks(): any {
				throw new Error();
			}
		}));

		await rpcProtocol.sync();
		const { links } = disposables.add(await getLinks(languageFeaturesService.linkProvider, model, CancellationToken.None));
		assert.strictEqual(links.length, 1);
		const [first] = links;
		assert.strictEqual(first.url?.toString(), 'foo:bar#3');
		assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 });
	});

	test('Document colors, data conversion', async () => {

		disposables.add(extHost.registerColorProvider(defaultExtension, defaultSelector, new class implements vscode.DocumentColorProvider {
			provideDocumentColors(): vscode.ColorInformation[] {
				return [new types.ColorInformation(new types.Range(0, 0, 0, 20), new types.Color(0.1, 0.2, 0.3, 0.4))];
			}
			provideColorPresentations(color: vscode.Color, context: { range: vscode.Range; document: vscode.TextDocument }): vscode.ColorPresentation[] {
				return [];
			}
		}));

		await rpcProtocol.sync();
		const value = await getColors(languageFeaturesService.colorProvider, model, CancellationToken.None);
		assert.strictEqual(value.length, 1);
		const [first] = value;
		assert.deepStrictEqual(first.colorInfo.color, { red: 0.1, green: 0.2, blue: 0.3, alpha: 0.4 });
		assert.deepStrictEqual(first.colorInfo.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 21 });
	});

	// -- selection ranges

	test('Selection Ranges, data conversion', async () => {
		disposables.add(extHost.registerSelectionRangeProvider(defaultExtension, defaultSelector, new class implements vscode.SelectionRangeProvider {
			provideSelectionRanges() {
				return [
					new types.SelectionRange(new types.Range(0, 10, 0, 18), new types.SelectionRange(new types.Range(0, 2, 0, 20))),
				];
			}
		}));

		await rpcProtocol.sync();

		provideSelectionRanges(languageFeaturesService.selectionRangeProvider, model, [new Position(1, 17)], { selectLeadingAndTrailingWhitespace: true, selectSubwords: true }, CancellationToken.None).then(ranges => {
			assert.strictEqual(ranges.length, 1);
			assert.ok(ranges[0].length >= 2);
		});
	});

	test('Selection Ranges, bad data', async () => {

		try {
			const _a = new types.SelectionRange(new types.Range(0, 10, 0, 18),
				new types.SelectionRange(new types.Range(0, 11, 0, 18))
			);
			assert.ok(false, String(_a));
		} catch (err) {
			assert.ok(true);
		}

	});
});
