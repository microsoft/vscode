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
import { NullLogService } from '../../../../platform/log/common/log.js';
import { getColors } from '../../../../editor/contrib/colorPicker/browser/color.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { nullExtensionDescription as defaultExtension } from '../../../services/extensions/common/extensions.js';
import { provideSelectionRanges } from '../../../../editor/contrib/smartSelect/browser/smartSelect.js';
import { mock } from '../../../../base/test/common/mock.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { Progress } from '../../../../platform/progress/common/progress.js';
import { URITransformerService } from '../../common/extHostUriTransformerService.js';
import { OutlineModel } from '../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../editor/common/services/languageFeaturesService.js';
import { CodeActionTriggerSource } from '../../../../editor/contrib/codeAction/common/types.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
suite('ExtHostLanguageFeatures', function () {
    const defaultSelector = { scheme: 'far' };
    let model;
    let extHost;
    let mainThread;
    const disposables = new DisposableStore();
    let rpcProtocol;
    let languageFeaturesService;
    let originalErrorHandler;
    let instantiationService;
    setup(() => {
        model = createTextModel([
            'This is the first line',
            'This is the second line',
            'This is the third line',
        ].join('\n'), undefined, undefined, URI.parse('far://testing/file.a'));
        rpcProtocol = new TestRPCProtocol();
        languageFeaturesService = new LanguageFeaturesService();
        // Use IInstantiationService to get typechecking when instantiating
        let inst;
        {
            instantiationService = new TestInstantiationService();
            instantiationService.stub(IMarkerService, MarkerService);
            instantiationService.set(ILanguageFeaturesService, languageFeaturesService);
            instantiationService.set(IUriIdentityService, new class extends mock() {
                asCanonicalUri(uri) {
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
        const commands = new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
            onExtensionError() {
                return true;
            }
        });
        rpcProtocol.set(ExtHostContext.ExtHostCommands, commands);
        rpcProtocol.set(MainContext.MainThreadCommands, disposables.add(inst.createInstance(MainThreadCommands, rpcProtocol)));
        const diagnostics = new ExtHostDiagnostics(rpcProtocol, new NullLogService(), new class extends mock() {
        }, extHostDocumentsAndEditors);
        rpcProtocol.set(ExtHostContext.ExtHostDiagnostics, diagnostics);
        extHost = new ExtHostLanguageFeatures(rpcProtocol, new URITransformerService(null), extHostDocuments, commands, diagnostics, new NullLogService(), NullApiDeprecationService, new class extends mock() {
            onExtensionError() {
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
        const d1 = extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class {
            provideDocumentSymbols() {
                return [];
            }
        });
        await rpcProtocol.sync();
        assert.strictEqual(languageFeaturesService.documentSymbolProvider.all(model).length, 1);
        d1.dispose();
        return rpcProtocol.sync();
    });
    test('DocumentSymbols, evil provider', async () => {
        disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class {
            provideDocumentSymbols() {
                throw new Error('evil document symbol provider');
            }
        }));
        disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class {
            provideDocumentSymbols() {
                return [new types.SymbolInformation('test', types.SymbolKind.Field, new types.Range(0, 0, 0, 0))];
            }
        }));
        await rpcProtocol.sync();
        const value = (await OutlineModel.create(languageFeaturesService.documentSymbolProvider, model, CancellationToken.None)).asListOfDocumentSymbols();
        assert.strictEqual(value.length, 1);
    });
    test('DocumentSymbols, data conversion', async () => {
        disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class {
            provideDocumentSymbols() {
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
            provideDocumentSymbols: (doc, token) => {
                return symbols.map(s => {
                    return new types.SymbolInformation(s.name, types.SymbolKind.Object, new types.Range(s.range.startLineNumber - 1, s.range.startColumn - 1, s.range.endLineNumber - 1, s.range.endColumn - 1));
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
            disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class {
                provideCodeLenses() {
                    throw new Error('evil');
                }
            }));
            disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class {
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
            disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class {
                provideCodeLenses() {
                    return [new types.CodeLens(new types.Range(0, 0, 0, 0), { command: 'id', title: 'Title' })];
                }
                resolveCodeLens() {
                    assert.ok(false, 'do not resolve');
                }
            }));
            await rpcProtocol.sync();
            const value = await getCodeLensModel(languageFeaturesService.codeLensProvider, model, CancellationToken.None);
            assert.strictEqual(value.lenses.length, 1);
            const [data] = value.lenses;
            const symbol = await Promise.resolve(data.provider.resolveCodeLens(model, data.symbol, CancellationToken.None));
            assert.strictEqual(symbol.command.id, 'id');
            assert.strictEqual(symbol.command.title, 'Title');
            value.dispose();
        });
    });
    test('CodeLens, missing command', async () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class {
                provideCodeLenses() {
                    return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
                }
            }));
            await rpcProtocol.sync();
            const value = await getCodeLensModel(languageFeaturesService.codeLensProvider, model, CancellationToken.None);
            assert.strictEqual(value.lenses.length, 1);
            const [data] = value.lenses;
            const symbol = await Promise.resolve(data.provider.resolveCodeLens(model, data.symbol, CancellationToken.None));
            assert.strictEqual(symbol, undefined);
            value.dispose();
        });
    });
    // --- definition
    test('Definition, data conversion', async () => {
        disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
            provideDefinition() {
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
        disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
            provideDefinition() {
                return [new types.Location(model.uri, new types.Range(1, 1, 1, 1))];
            }
        }));
        disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
            provideDefinition() {
                return new types.Location(model.uri, new types.Range(2, 1, 1, 1));
            }
        }));
        await rpcProtocol.sync();
        const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
        assert.strictEqual(value.length, 2);
    });
    test('Definition, registration order', async () => {
        disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
            provideDefinition() {
                return [new types.Location(URI.parse('far://first'), new types.Range(2, 3, 4, 5))];
            }
        }));
        disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
            provideDefinition() {
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
        disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
            provideDefinition() {
                throw new Error('evil provider');
            }
        }));
        disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
            provideDefinition() {
                return new types.Location(model.uri, new types.Range(1, 1, 1, 1));
            }
        }));
        await rpcProtocol.sync();
        const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
        assert.strictEqual(value.length, 1);
    });
    // -- declaration
    test('Declaration, data conversion', async () => {
        disposables.add(extHost.registerDeclarationProvider(defaultExtension, defaultSelector, new class {
            provideDeclaration() {
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
        disposables.add(extHost.registerImplementationProvider(defaultExtension, defaultSelector, new class {
            provideImplementation() {
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
        disposables.add(extHost.registerTypeDefinitionProvider(defaultExtension, defaultSelector, new class {
            provideTypeDefinition() {
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
        disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
            provideHover() {
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
        disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
            provideHover() {
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
        disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
            provideHover() {
                return new types.Hover('registered first');
            }
        }));
        disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
            provideHover() {
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
        disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
            provideHover() {
                throw new Error('evil');
            }
        }));
        disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
            provideHover() {
                return new types.Hover('Hello');
            }
        }));
        await rpcProtocol.sync();
        const hovers = await getHoversPromise(languageFeaturesService.hoverProvider, model, new EditorPosition(1, 1), CancellationToken.None);
        assert.strictEqual(hovers.length, 1);
    });
    // --- occurrences
    test('Occurrences, data conversion', async () => {
        disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
            provideDocumentHighlights() {
                return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
            }
        }));
        await rpcProtocol.sync();
        const value = (await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None));
        assert.strictEqual(value.size, 1);
        const [entry] = Array.from(value.values())[0];
        assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
        assert.strictEqual(entry.kind, languages.DocumentHighlightKind.Text);
    });
    test('Occurrences, order 1/2', async () => {
        disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
            provideDocumentHighlights() {
                return undefined;
            }
        }));
        disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, '*', new class {
            provideDocumentHighlights() {
                return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
            }
        }));
        await rpcProtocol.sync();
        const value = (await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None));
        assert.strictEqual(value.size, 1);
        const [entry] = Array.from(value.values())[0];
        assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
        assert.strictEqual(entry.kind, languages.DocumentHighlightKind.Text);
    });
    test('Occurrences, order 2/2', async () => {
        disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
            provideDocumentHighlights() {
                return [new types.DocumentHighlight(new types.Range(0, 0, 0, 2))];
            }
        }));
        disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, '*', new class {
            provideDocumentHighlights() {
                return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
            }
        }));
        await rpcProtocol.sync();
        const value = (await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None));
        assert.strictEqual(value.size, 1);
        const [entry] = Array.from(value.values())[0];
        assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3 });
        assert.strictEqual(entry.kind, languages.DocumentHighlightKind.Text);
    });
    test('Occurrences, evil provider', async () => {
        disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
            provideDocumentHighlights() {
                throw new Error('evil');
            }
        }));
        disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
            provideDocumentHighlights() {
                return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
            }
        }));
        await rpcProtocol.sync();
        const value = await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None);
        assert.strictEqual(value.size, 1);
    });
    // --- references
    test('References, registration order', async () => {
        disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
            provideReferences() {
                return [new types.Location(URI.parse('far://register/first'), new types.Range(0, 0, 0, 0))];
            }
        }));
        disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
            provideReferences() {
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
        disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
            provideReferences() {
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
        disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
            provideReferences() {
                throw new Error('evil');
            }
        }));
        disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
            provideReferences() {
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
                provideCodeActions() {
                    return [
                        { command: 'test1', title: 'Testing1' },
                        { command: 'test2', title: 'Testing2' }
                    ];
                }
            }));
            await rpcProtocol.sync();
            const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: 1 /* languages.CodeActionTriggerType.Invoke */, triggerAction: CodeActionTriggerSource.QuickFix }, Progress.None, CancellationToken.None);
            const { validActions: actions } = value;
            assert.strictEqual(actions.length, 2);
            const [first, second] = actions;
            assert.strictEqual(first.action.title, 'Testing1');
            assert.strictEqual(first.action.command.id, 'test1');
            assert.strictEqual(second.action.title, 'Testing2');
            assert.strictEqual(second.action.command.id, 'test2');
            value.dispose();
        });
    });
    test('Quick Fix, code action data conversion', async () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, {
                provideCodeActions() {
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
            const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: 1 /* languages.CodeActionTriggerType.Invoke */, triggerAction: CodeActionTriggerSource.Default }, Progress.None, CancellationToken.None);
            const { validActions: actions } = value;
            assert.strictEqual(actions.length, 1);
            const [first] = actions;
            assert.strictEqual(first.action.title, 'Testing1');
            assert.strictEqual(first.action.command.title, 'Testing1Command');
            assert.strictEqual(first.action.command.id, 'test1');
            assert.strictEqual(first.action.kind, 'test.scope');
            value.dispose();
        });
    });
    test('Cannot read property \'id\' of undefined, #29469', async () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class {
                provideCodeActions() {
                    return [
                        undefined,
                        null,
                        { command: 'test', title: 'Testing' }
                    ];
                }
            }));
            await rpcProtocol.sync();
            const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: 1 /* languages.CodeActionTriggerType.Invoke */, triggerAction: CodeActionTriggerSource.Default }, Progress.None, CancellationToken.None);
            const { validActions: actions } = value;
            assert.strictEqual(actions.length, 1);
            value.dispose();
        });
    });
    test('Quick Fix, evil provider', async () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class {
                provideCodeActions() {
                    throw new Error('evil');
                }
            }));
            disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class {
                provideCodeActions() {
                    return [{ command: 'test', title: 'Testing' }];
                }
            }));
            await rpcProtocol.sync();
            const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: 1 /* languages.CodeActionTriggerType.Invoke */, triggerAction: CodeActionTriggerSource.QuickFix }, Progress.None, CancellationToken.None);
            const { validActions: actions } = value;
            assert.strictEqual(actions.length, 1);
            value.dispose();
        });
    });
    // --- navigate types
    test('Navigate types, evil provider', async () => {
        disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
            provideWorkspaceSymbols() {
                throw new Error('evil');
            }
        }));
        disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
            provideWorkspaceSymbols() {
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
        disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
            provideWorkspaceSymbols() {
                return [new types.SymbolInformation('ONE', types.SymbolKind.Array, undefined, new types.Location(uri, new types.Range(0, 0, 1, 1)))];
            }
        }));
        disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
            provideWorkspaceSymbols() {
                return [new types.SymbolInformation('ONE', types.SymbolKind.Array, undefined, new types.Location(uri, new types.Range(0, 0, 1, 1)))]; // get de-duped
            }
        }));
        disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
            provideWorkspaceSymbols() {
                return [new types.SymbolInformation('ONE', types.SymbolKind.Array, undefined, new types.Location(uri, undefined))]; // NO dedupe because of resolve
            }
            resolveWorkspaceSymbol(a) {
                return a;
            }
        }));
        disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
            provideWorkspaceSymbols() {
                return [new types.SymbolInformation('ONE', types.SymbolKind.Struct, undefined, new types.Location(uri, new types.Range(0, 0, 1, 1)))]; // NO dedupe because of kind
            }
        }));
        await rpcProtocol.sync();
        const value = await getWorkspaceSymbols('');
        assert.strictEqual(value.length, 3);
    });
    // --- rename
    test('Rename, evil provider 0/2', async () => {
        disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
            provideRenameEdits() {
                throw new class Foo {
                };
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
        disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
            provideRenameEdits() {
                throw Error('evil');
            }
        }));
        await rpcProtocol.sync();
        const value = await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), 'newName');
        assert.strictEqual(value.rejectReason, 'evil');
    });
    test('Rename, evil provider 2/2', async () => {
        disposables.add(extHost.registerRenameProvider(defaultExtension, '*', new class {
            provideRenameEdits() {
                throw Error('evil');
            }
        }));
        disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
            provideRenameEdits() {
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
        disposables.add(extHost.registerRenameProvider(defaultExtension, '*', new class {
            provideRenameEdits() {
                const edit = new types.WorkspaceEdit();
                edit.replace(model.uri, new types.Range(0, 0, 0, 0), 'testing');
                edit.replace(model.uri, new types.Range(1, 0, 1, 0), 'testing');
                return edit;
            }
        }));
        disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
            provideRenameEdits() {
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
        disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
            prepareRename(document, position) {
                called[0] = true;
                const range = document.getWordRangeAtPosition(position);
                return range;
            }
            provideRenameEdits() {
                called[1] = true;
                return undefined;
            }
        }));
        disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
            prepareRename(document, position) {
                called[2] = true;
                return Promise.reject('Cannot rename this symbol2.');
            }
            provideRenameEdits() {
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
        disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
            prepareRename(document, position) {
                called[0] = true;
                const range = document.getWordRangeAtPosition(position);
                return range;
            }
            provideRenameEdits() {
                called[1] = true;
                return undefined;
            }
        }));
        disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
            provideRenameEdits(document, position, newName) {
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
        disposables.add(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class {
            provideSignatureHelp() {
                return undefined;
            }
        }, []));
        disposables.add(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class {
            provideSignatureHelp() {
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
        disposables.add(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class {
            provideSignatureHelp() {
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
            disposables.add(extHost.registerCompletionItemProvider(defaultExtension, '*', new class {
                provideCompletionItems() {
                    return [new types.CompletionItem('testing1')];
                }
            }, []));
            disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
                provideCompletionItems() {
                    return [new types.CompletionItem('testing2')];
                }
            }, []));
            await rpcProtocol.sync();
            const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(undefined, new Set().add(28 /* languages.CompletionItemKind.Snippet */)));
            assert.strictEqual(value.items.length, 1);
            assert.strictEqual(value.items[0].completion.insertText, 'testing2');
            value.disposable.dispose();
        });
    });
    test('Suggest, order 2/3', async () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            disposables.add(extHost.registerCompletionItemProvider(defaultExtension, '*', new class {
                provideCompletionItems() {
                    return [new types.CompletionItem('weak-selector')]; // weaker selector but result
                }
            }, []));
            disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
                provideCompletionItems() {
                    return []; // stronger selector but not a good result;
                }
            }, []));
            await rpcProtocol.sync();
            const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(undefined, new Set().add(28 /* languages.CompletionItemKind.Snippet */)));
            assert.strictEqual(value.items.length, 1);
            assert.strictEqual(value.items[0].completion.insertText, 'weak-selector');
            value.disposable.dispose();
        });
    });
    test('Suggest, order 3/3', async () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
                provideCompletionItems() {
                    return [new types.CompletionItem('strong-1')];
                }
            }, []));
            disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
                provideCompletionItems() {
                    return [new types.CompletionItem('strong-2')];
                }
            }, []));
            await rpcProtocol.sync();
            const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(undefined, new Set().add(28 /* languages.CompletionItemKind.Snippet */)));
            assert.strictEqual(value.items.length, 2);
            assert.strictEqual(value.items[0].completion.insertText, 'strong-1'); // sort by label
            assert.strictEqual(value.items[1].completion.insertText, 'strong-2');
            value.disposable.dispose();
        });
    });
    test('Suggest, evil provider', async () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
                provideCompletionItems() {
                    throw new Error('evil');
                }
            }, []));
            disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
                provideCompletionItems() {
                    return [new types.CompletionItem('testing')];
                }
            }, []));
            await rpcProtocol.sync();
            const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(undefined, new Set().add(28 /* languages.CompletionItemKind.Snippet */)));
            assert.strictEqual(value.items[0].container.incomplete, false);
            value.disposable.dispose();
        });
    });
    test('Suggest, CompletionList', async () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
                provideCompletionItems() {
                    // eslint-disable-next-line local/code-no-any-casts
                    return new types.CompletionList([new types.CompletionItem('hello')], true);
                }
            }, []));
            await rpcProtocol.sync();
            await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(undefined, new Set().add(28 /* languages.CompletionItemKind.Snippet */))).then(model => {
                assert.strictEqual(model.items[0].container.incomplete, true);
                model.disposable.dispose();
            });
        });
    });
    // --- format
    const NullWorkerService = new class extends mock() {
        computeMoreMinimalEdits(resource, edits) {
            return Promise.resolve(edits ?? undefined);
        }
    };
    test('Format Doc, data conversion', async () => {
        disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
            provideDocumentFormattingEdits() {
                return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'testing'), types.TextEdit.setEndOfLine(types.EndOfLine.LF)];
            }
        }));
        await rpcProtocol.sync();
        const value = (await getDocumentFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None));
        assert.strictEqual(value.length, 2);
        const [first, second] = value;
        assert.strictEqual(first.text, 'testing');
        assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
        assert.strictEqual(second.eol, 0 /* EndOfLineSequence.LF */);
        assert.strictEqual(second.text, '');
        assert.deepStrictEqual(second.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
    });
    test('Format Doc, evil provider', async () => {
        disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
            provideDocumentFormattingEdits() {
                throw new Error('evil');
            }
        }));
        await rpcProtocol.sync();
        return getDocumentFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
    });
    test('Format Doc, order', async () => {
        disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
            provideDocumentFormattingEdits() {
                return undefined;
            }
        }));
        disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
            provideDocumentFormattingEdits() {
                return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'testing')];
            }
        }));
        disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
            provideDocumentFormattingEdits() {
                return undefined;
            }
        }));
        await rpcProtocol.sync();
        const value = (await getDocumentFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None));
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.text, 'testing');
        assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
    });
    test('Format Range, data conversion', async () => {
        disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class {
            provideDocumentRangeFormattingEdits() {
                return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'testing')];
            }
        }));
        await rpcProtocol.sync();
        const value = (await getDocumentRangeFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None));
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.text, 'testing');
        assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
    });
    test('Format Range, + format_doc', async () => {
        disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class {
            provideDocumentRangeFormattingEdits() {
                return [new types.TextEdit(new types.Range(0, 0, 0, 0), 'range')];
            }
        }));
        disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class {
            provideDocumentRangeFormattingEdits() {
                return [new types.TextEdit(new types.Range(2, 3, 4, 5), 'range2')];
            }
        }));
        disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
            provideDocumentFormattingEdits() {
                return [new types.TextEdit(new types.Range(0, 0, 1, 1), 'doc')];
            }
        }));
        await rpcProtocol.sync();
        const value = (await getDocumentRangeFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None));
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.text, 'range2');
        assert.strictEqual(first.range.startLineNumber, 3);
        assert.strictEqual(first.range.startColumn, 4);
        assert.strictEqual(first.range.endLineNumber, 5);
        assert.strictEqual(first.range.endColumn, 6);
    });
    test('Format Range, evil provider', async () => {
        disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class {
            provideDocumentRangeFormattingEdits() {
                throw new Error('evil');
            }
        }));
        await rpcProtocol.sync();
        return getDocumentRangeFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
    });
    test('Format on Type, data conversion', async () => {
        disposables.add(extHost.registerOnTypeFormattingEditProvider(defaultExtension, defaultSelector, new class {
            provideOnTypeFormattingEdits() {
                return [new types.TextEdit(new types.Range(0, 0, 0, 0), arguments[2])];
            }
        }, [';']));
        await rpcProtocol.sync();
        const value = (await getOnTypeFormattingEdits(NullWorkerService, languageFeaturesService, model, new EditorPosition(1, 1), ';', { insertSpaces: true, tabSize: 2 }, CancellationToken.None));
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.text, ';');
        assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
    });
    test('Links, data conversion', async () => {
        disposables.add(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class {
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
        disposables.add(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class {
            provideDocumentLinks() {
                return [new types.DocumentLink(new types.Range(0, 0, 1, 1), URI.parse('foo:bar#3'))];
            }
        }));
        disposables.add(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class {
            provideDocumentLinks() {
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
        disposables.add(extHost.registerColorProvider(defaultExtension, defaultSelector, new class {
            provideDocumentColors() {
                return [new types.ColorInformation(new types.Range(0, 0, 0, 20), new types.Color(0.1, 0.2, 0.3, 0.4))];
            }
            provideColorPresentations(color, context) {
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
        disposables.add(extHost.registerSelectionRangeProvider(defaultExtension, defaultSelector, new class {
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
            const _a = new types.SelectionRange(new types.Range(0, 10, 0, 18), new types.SelectionRange(new types.Range(0, 11, 0, 18)));
            assert.ok(false, String(_a));
        }
        catch (err) {
            assert.ok(true);
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdExhbmd1YWdlRmVhdHVyZXMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBQ3RILE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM1RixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxLQUFLLEtBQUssTUFBTSw4QkFBOEIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbEYsT0FBTyxFQUFFLFFBQVEsSUFBSSxjQUFjLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDbEcsT0FBTyxFQUFFLEtBQUssSUFBSSxXQUFXLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDL0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN6RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scUNBQXFDLENBQUM7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