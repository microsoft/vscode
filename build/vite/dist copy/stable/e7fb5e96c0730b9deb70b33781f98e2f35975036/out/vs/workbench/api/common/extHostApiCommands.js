/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isFalsyOrEmpty } from '../../../base/common/arrays.js';
import { Schemas, matchesSomeScheme } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import * as languages from '../../../editor/common/languages.js';
import { decodeSemanticTokensDto } from '../../../editor/common/services/semanticTokensDto.js';
import { validateWhenClauses } from '../../../platform/contextkey/common/contextkey.js';
import { ApiCommand, ApiCommandArgument, ApiCommandResult } from './extHostCommands.js';
import * as typeConverters from './extHostTypeConverters.js';
import * as types from './extHostTypes.js';
//#region --- NEW world
const newCommands = [
    // -- document highlights
    new ApiCommand('vscode.executeDocumentHighlights', '_executeDocumentHighlights', 'Execute document highlight provider.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of DocumentHighlight-instances.', tryMapWith(typeConverters.DocumentHighlight.to))),
    // -- document symbols
    new ApiCommand('vscode.executeDocumentSymbolProvider', '_executeDocumentSymbolProvider', 'Execute document symbol provider.', [ApiCommandArgument.Uri], new ApiCommandResult('A promise that resolves to an array of SymbolInformation and DocumentSymbol instances.', (value, apiArgs) => {
        if (isFalsyOrEmpty(value)) {
            return undefined;
        }
        class MergedInfo extends types.SymbolInformation {
            constructor() {
                super(...arguments);
                this.containerName = '';
            }
            static to(symbol) {
                const res = new MergedInfo(symbol.name, typeConverters.SymbolKind.to(symbol.kind), symbol.containerName || '', new types.Location(apiArgs[0], typeConverters.Range.to(symbol.range)));
                res.detail = symbol.detail;
                res.range = res.location.range;
                res.selectionRange = typeConverters.Range.to(symbol.selectionRange);
                res.children = symbol.children ? symbol.children.map(MergedInfo.to) : [];
                return res;
            }
        }
        return value.map(MergedInfo.to);
    })),
    // -- formatting
    new ApiCommand('vscode.executeFormatDocumentProvider', '_executeFormatDocumentProvider', 'Execute document format provider.', [ApiCommandArgument.Uri, new ApiCommandArgument('options', 'Formatting options', _ => true, v => v)], new ApiCommandResult('A promise that resolves to an array of TextEdits.', tryMapWith(typeConverters.TextEdit.to))),
    new ApiCommand('vscode.executeFormatRangeProvider', '_executeFormatRangeProvider', 'Execute range format provider.', [ApiCommandArgument.Uri, ApiCommandArgument.Range, new ApiCommandArgument('options', 'Formatting options', _ => true, v => v)], new ApiCommandResult('A promise that resolves to an array of TextEdits.', tryMapWith(typeConverters.TextEdit.to))),
    new ApiCommand('vscode.executeFormatOnTypeProvider', '_executeFormatOnTypeProvider', 'Execute format on type provider.', [ApiCommandArgument.Uri, ApiCommandArgument.Position, new ApiCommandArgument('ch', 'Trigger character', v => typeof v === 'string', v => v), new ApiCommandArgument('options', 'Formatting options', _ => true, v => v)], new ApiCommandResult('A promise that resolves to an array of TextEdits.', tryMapWith(typeConverters.TextEdit.to))),
    // -- go to symbol (definition, type definition, declaration, impl, references)
    new ApiCommand('vscode.executeDefinitionProvider', '_executeDefinitionProvider', 'Execute all definition providers.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)),
    new ApiCommand('vscode.experimental.executeDefinitionProvider_recursive', '_executeDefinitionProvider_recursive', 'Execute all definition providers.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)),
    new ApiCommand('vscode.executeTypeDefinitionProvider', '_executeTypeDefinitionProvider', 'Execute all type definition providers.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)),
    new ApiCommand('vscode.experimental.executeTypeDefinitionProvider_recursive', '_executeTypeDefinitionProvider_recursive', 'Execute all type definition providers.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)),
    new ApiCommand('vscode.executeDeclarationProvider', '_executeDeclarationProvider', 'Execute all declaration providers.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)),
    new ApiCommand('vscode.experimental.executeDeclarationProvider_recursive', '_executeDeclarationProvider_recursive', 'Execute all declaration providers.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)),
    new ApiCommand('vscode.executeImplementationProvider', '_executeImplementationProvider', 'Execute all implementation providers.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)),
    new ApiCommand('vscode.experimental.executeImplementationProvider_recursive', '_executeImplementationProvider_recursive', 'Execute all implementation providers.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)),
    new ApiCommand('vscode.executeReferenceProvider', '_executeReferenceProvider', 'Execute all reference providers.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of Location-instances.', tryMapWith(typeConverters.location.to))),
    new ApiCommand('vscode.experimental.executeReferenceProvider', '_executeReferenceProvider_recursive', 'Execute all reference providers.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of Location-instances.', tryMapWith(typeConverters.location.to))),
    // -- hover
    new ApiCommand('vscode.executeHoverProvider', '_executeHoverProvider', 'Execute all hover providers.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of Hover-instances.', tryMapWith(typeConverters.Hover.to))),
    new ApiCommand('vscode.experimental.executeHoverProvider_recursive', '_executeHoverProvider_recursive', 'Execute all hover providers.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of Hover-instances.', tryMapWith(typeConverters.Hover.to))),
    // -- selection range
    new ApiCommand('vscode.executeSelectionRangeProvider', '_executeSelectionRangeProvider', 'Execute selection range provider.', [ApiCommandArgument.Uri, new ApiCommandArgument('position', 'A position in a text document', v => Array.isArray(v) && v.every(v => types.Position.isPosition(v)), v => v.map(typeConverters.Position.from))], new ApiCommandResult('A promise that resolves to an array of ranges.', result => {
        return result.map(ranges => {
            let node;
            for (const range of ranges.reverse()) {
                node = new types.SelectionRange(typeConverters.Range.to(range), node);
            }
            return node;
        });
    })),
    // -- symbol search
    new ApiCommand('vscode.executeWorkspaceSymbolProvider', '_executeWorkspaceSymbolProvider', 'Execute all workspace symbol providers.', [ApiCommandArgument.String.with('query', 'Search string')], new ApiCommandResult('A promise that resolves to an array of SymbolInformation-instances.', value => {
        return value.map(typeConverters.WorkspaceSymbol.to);
    })),
    // --- call hierarchy
    new ApiCommand('vscode.prepareCallHierarchy', '_executePrepareCallHierarchy', 'Prepare call hierarchy at a position inside a document', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of CallHierarchyItem-instances', v => v.map(typeConverters.CallHierarchyItem.to))),
    new ApiCommand('vscode.provideIncomingCalls', '_executeProvideIncomingCalls', 'Compute incoming calls for an item', [ApiCommandArgument.CallHierarchyItem], new ApiCommandResult('A promise that resolves to an array of CallHierarchyIncomingCall-instances', v => v.map(typeConverters.CallHierarchyIncomingCall.to))),
    new ApiCommand('vscode.provideOutgoingCalls', '_executeProvideOutgoingCalls', 'Compute outgoing calls for an item', [ApiCommandArgument.CallHierarchyItem], new ApiCommandResult('A promise that resolves to an array of CallHierarchyOutgoingCall-instances', v => v.map(typeConverters.CallHierarchyOutgoingCall.to))),
    // --- rename
    new ApiCommand('vscode.prepareRename', '_executePrepareRename', 'Execute the prepareRename of rename provider.', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to a range and placeholder text.', value => {
        if (!value) {
            return undefined;
        }
        return {
            range: typeConverters.Range.to(value.range),
            placeholder: value.text
        };
    })),
    new ApiCommand('vscode.executeDocumentRenameProvider', '_executeDocumentRenameProvider', 'Execute rename provider.', [ApiCommandArgument.Uri, ApiCommandArgument.Position, ApiCommandArgument.String.with('newName', 'The new symbol name')], new ApiCommandResult('A promise that resolves to a WorkspaceEdit.', value => {
        if (!value) {
            return undefined;
        }
        if (value.rejectReason) {
            throw new Error(value.rejectReason);
        }
        return typeConverters.WorkspaceEdit.to(value);
    })),
    // --- links
    new ApiCommand('vscode.executeLinkProvider', '_executeLinkProvider', 'Execute document link provider.', [ApiCommandArgument.Uri, ApiCommandArgument.Number.with('linkResolveCount', 'Number of links that should be resolved, only when links are unresolved.').optional()], new ApiCommandResult('A promise that resolves to an array of DocumentLink-instances.', value => value.map(typeConverters.DocumentLink.to))),
    // --- semantic tokens
    new ApiCommand('vscode.provideDocumentSemanticTokensLegend', '_provideDocumentSemanticTokensLegend', 'Provide semantic tokens legend for a document', [ApiCommandArgument.Uri], new ApiCommandResult('A promise that resolves to SemanticTokensLegend.', value => {
        if (!value) {
            return undefined;
        }
        return new types.SemanticTokensLegend(value.tokenTypes, value.tokenModifiers);
    })),
    new ApiCommand('vscode.provideDocumentSemanticTokens', '_provideDocumentSemanticTokens', 'Provide semantic tokens for a document', [ApiCommandArgument.Uri], new ApiCommandResult('A promise that resolves to SemanticTokens.', value => {
        if (!value) {
            return undefined;
        }
        const semanticTokensDto = decodeSemanticTokensDto(value);
        if (semanticTokensDto.type !== 'full') {
            // only accepting full semantic tokens from provideDocumentSemanticTokens
            return undefined;
        }
        return new types.SemanticTokens(semanticTokensDto.data, undefined);
    })),
    new ApiCommand('vscode.provideDocumentRangeSemanticTokensLegend', '_provideDocumentRangeSemanticTokensLegend', 'Provide semantic tokens legend for a document range', [ApiCommandArgument.Uri, ApiCommandArgument.Range.optional()], new ApiCommandResult('A promise that resolves to SemanticTokensLegend.', value => {
        if (!value) {
            return undefined;
        }
        return new types.SemanticTokensLegend(value.tokenTypes, value.tokenModifiers);
    })),
    new ApiCommand('vscode.provideDocumentRangeSemanticTokens', '_provideDocumentRangeSemanticTokens', 'Provide semantic tokens for a document range', [ApiCommandArgument.Uri, ApiCommandArgument.Range], new ApiCommandResult('A promise that resolves to SemanticTokens.', value => {
        if (!value) {
            return undefined;
        }
        const semanticTokensDto = decodeSemanticTokensDto(value);
        if (semanticTokensDto.type !== 'full') {
            // only accepting full semantic tokens from provideDocumentRangeSemanticTokens
            return undefined;
        }
        return new types.SemanticTokens(semanticTokensDto.data, undefined);
    })),
    // --- completions
    new ApiCommand('vscode.executeCompletionItemProvider', '_executeCompletionItemProvider', 'Execute completion item provider.', [
        ApiCommandArgument.Uri,
        ApiCommandArgument.Position,
        ApiCommandArgument.String.with('triggerCharacter', 'Trigger completion when the user types the character, like `,` or `(`').optional(),
        ApiCommandArgument.Number.with('itemResolveCount', 'Number of completions to resolve (too large numbers slow down completions)').optional()
    ], new ApiCommandResult('A promise that resolves to a CompletionList-instance.', (value, _args, converter) => {
        if (!value) {
            return new types.CompletionList([]);
        }
        const items = value.suggestions.map(suggestion => typeConverters.CompletionItem.to(suggestion, converter));
        return new types.CompletionList(items, value.incomplete);
    })),
    // --- signature help
    new ApiCommand('vscode.executeSignatureHelpProvider', '_executeSignatureHelpProvider', 'Execute signature help provider.', [ApiCommandArgument.Uri, ApiCommandArgument.Position, ApiCommandArgument.String.with('triggerCharacter', 'Trigger signature help when the user types the character, like `,` or `(`').optional()], new ApiCommandResult('A promise that resolves to SignatureHelp.', value => {
        if (value) {
            return typeConverters.SignatureHelp.to(value);
        }
        return undefined;
    })),
    // --- code lens
    new ApiCommand('vscode.executeCodeLensProvider', '_executeCodeLensProvider', 'Execute code lens provider.', [ApiCommandArgument.Uri, ApiCommandArgument.Number.with('itemResolveCount', 'Number of lenses that should be resolved and returned. Will only return resolved lenses, will impact performance)').optional()], new ApiCommandResult('A promise that resolves to an array of CodeLens-instances.', (value, _args, converter) => {
        return tryMapWith(item => {
            return new types.CodeLens(typeConverters.Range.to(item.range), item.command && converter.fromInternal(item.command));
        })(value);
    })),
    // --- code actions
    new ApiCommand('vscode.executeCodeActionProvider', '_executeCodeActionProvider', 'Execute code action provider.', [
        ApiCommandArgument.Uri,
        new ApiCommandArgument('rangeOrSelection', 'Range in a text document. Some refactoring provider requires Selection object.', v => types.Range.isRange(v), v => types.Selection.isSelection(v) ? typeConverters.Selection.from(v) : typeConverters.Range.from(v)),
        ApiCommandArgument.String.with('kind', 'Code action kind to return code actions for').optional(),
        ApiCommandArgument.Number.with('itemResolveCount', 'Number of code actions to resolve (too large numbers slow down code actions)').optional()
    ], new ApiCommandResult('A promise that resolves to an array of Command-instances.', (value, _args, converter) => {
        return tryMapWith((codeAction) => {
            if (codeAction._isSynthetic) {
                if (!codeAction.command) {
                    throw new Error('Synthetic code actions must have a command');
                }
                return converter.fromInternal(codeAction.command);
            }
            else {
                const ret = new types.CodeAction(codeAction.title, codeAction.kind ? new types.CodeActionKind(codeAction.kind) : undefined);
                if (codeAction.edit) {
                    ret.edit = typeConverters.WorkspaceEdit.to(codeAction.edit);
                }
                if (codeAction.command) {
                    ret.command = converter.fromInternal(codeAction.command);
                }
                ret.isPreferred = codeAction.isPreferred;
                return ret;
            }
        })(value);
    })),
    // --- colors
    new ApiCommand('vscode.executeDocumentColorProvider', '_executeDocumentColorProvider', 'Execute document color provider.', [ApiCommandArgument.Uri], new ApiCommandResult('A promise that resolves to an array of ColorInformation objects.', result => {
        if (result) {
            return result.map(ci => new types.ColorInformation(typeConverters.Range.to(ci.range), typeConverters.Color.to(ci.color)));
        }
        return [];
    })),
    new ApiCommand('vscode.executeColorPresentationProvider', '_executeColorPresentationProvider', 'Execute color presentation provider.', [
        new ApiCommandArgument('color', 'The color to show and insert', v => v instanceof types.Color, typeConverters.Color.from),
        new ApiCommandArgument('context', 'Context object with uri and range', _v => true, v => ({ uri: v.uri, range: typeConverters.Range.from(v.range) })),
    ], new ApiCommandResult('A promise that resolves to an array of ColorPresentation objects.', result => {
        if (result) {
            return result.map(typeConverters.ColorPresentation.to);
        }
        return [];
    })),
    // --- inline hints
    new ApiCommand('vscode.executeInlayHintProvider', '_executeInlayHintProvider', 'Execute inlay hints provider', [ApiCommandArgument.Uri, ApiCommandArgument.Range], new ApiCommandResult('A promise that resolves to an array of Inlay objects', (result, args, converter) => {
        return result.map(typeConverters.InlayHint.to.bind(undefined, converter));
    })),
    // --- folding
    new ApiCommand('vscode.executeFoldingRangeProvider', '_executeFoldingRangeProvider', 'Execute folding range provider', [ApiCommandArgument.Uri], new ApiCommandResult('A promise that resolves to an array of FoldingRange objects', (result, args) => {
        if (result) {
            return result.map(typeConverters.FoldingRange.to);
        }
        return undefined;
    })),
    // --- notebooks
    new ApiCommand('vscode.resolveNotebookContentProviders', '_resolveNotebookContentProvider', 'Resolve Notebook Content Providers', [
    // new ApiCommandArgument<string, string>('viewType', '', v => typeof v === 'string', v => v),
    // new ApiCommandArgument<string, string>('displayName', '', v => typeof v === 'string', v => v),
    // new ApiCommandArgument<object, object>('options', '', v => typeof v === 'object', v => v),
    ], new ApiCommandResult('A promise that resolves to an array of NotebookContentProvider static info objects.', tryMapWith(item => {
        return {
            viewType: item.viewType,
            displayName: item.displayName,
            options: {
                transientOutputs: item.options.transientOutputs,
                transientCellMetadata: item.options.transientCellMetadata,
                transientDocumentMetadata: item.options.transientDocumentMetadata
            },
            filenamePattern: item.filenamePattern.map(pattern => typeConverters.NotebookExclusiveDocumentPattern.to(pattern))
        };
    }))),
    // --- debug support
    new ApiCommand('vscode.executeInlineValueProvider', '_executeInlineValueProvider', 'Execute inline value provider', [
        ApiCommandArgument.Uri,
        ApiCommandArgument.Range,
        new ApiCommandArgument('context', 'An InlineValueContext', v => v && typeof v.frameId === 'number' && v.stoppedLocation instanceof types.Range, v => typeConverters.InlineValueContext.from(v))
    ], new ApiCommandResult('A promise that resolves to an array of InlineValue objects', result => {
        return result.map(typeConverters.InlineValue.to);
    })),
    // --- open'ish commands
    new ApiCommand('vscode.open', '_workbench.open', 'Opens the provided resource in the editor. Can be a text or binary file, or an http(s) URL. If you need more control over the options for opening a text file, use vscode.window.showTextDocument instead.', [
        new ApiCommandArgument('uriOrString', 'Uri-instance or string (only http/https)', v => URI.isUri(v) || (typeof v === 'string' && matchesSomeScheme(v, Schemas.http, Schemas.https)), v => v),
        new ApiCommandArgument('columnOrOptions', 'Either the column in which to open or editor options, see vscode.TextDocumentShowOptions', v => v === undefined || typeof v === 'number' || typeof v === 'object', v => !v ? v : typeof v === 'number' ? [typeConverters.ViewColumn.from(v), undefined] : [typeConverters.ViewColumn.from(v.viewColumn), typeConverters.TextEditorOpenOptions.from(v)]).optional(),
        ApiCommandArgument.String.with('label', '').optional()
    ], ApiCommandResult.Void),
    new ApiCommand('vscode.openWith', '_workbench.openWith', 'Opens the provided resource with a specific editor.', [
        ApiCommandArgument.Uri.with('resource', 'Resource to open'),
        ApiCommandArgument.String.with('viewId', 'Custom editor view id. This should be the viewType string for custom editors or the notebookType string for notebooks. Use \'default\' to use VS Code\'s default text editor'),
        new ApiCommandArgument('columnOrOptions', 'Either the column in which to open or editor options, see vscode.TextDocumentShowOptions', v => v === undefined || typeof v === 'number' || typeof v === 'object', v => !v ? v : typeof v === 'number' ? [typeConverters.ViewColumn.from(v), undefined] : [typeConverters.ViewColumn.from(v.viewColumn), typeConverters.TextEditorOpenOptions.from(v)]).optional()
    ], ApiCommandResult.Void),
    new ApiCommand('vscode.diff', '_workbench.diff', 'Opens the provided resources in the diff editor to compare their contents.', [
        ApiCommandArgument.Uri.with('left', 'Left-hand side resource of the diff editor'),
        ApiCommandArgument.Uri.with('right', 'Right-hand side resource of the diff editor'),
        ApiCommandArgument.String.with('title', 'Human readable title for the diff editor').optional(),
        new ApiCommandArgument('columnOrOptions', 'Either the column in which to open or editor options, see vscode.TextDocumentShowOptions', v => v === undefined || typeof v === 'object', v => v && [typeConverters.ViewColumn.from(v.viewColumn), typeConverters.TextEditorOpenOptions.from(v)]).optional(),
    ], ApiCommandResult.Void),
    new ApiCommand('vscode.changes', '_workbench.changes', 'Opens a list of resources in the changes editor to compare their contents.', [
        ApiCommandArgument.String.with('title', 'Human readable title for the changes editor'),
        new ApiCommandArgument('resourceList', 'List of resources to compare', resources => {
            for (const resource of resources) {
                if (resource.length !== 3) {
                    return false;
                }
                const [label, left, right] = resource;
                if (!URI.isUri(label) ||
                    (!URI.isUri(left) && left !== undefined && left !== null) ||
                    (!URI.isUri(right) && right !== undefined && right !== null)) {
                    return false;
                }
            }
            return true;
        }, v => v)
    ], ApiCommandResult.Void),
    // --- type hierarchy
    new ApiCommand('vscode.prepareTypeHierarchy', '_executePrepareTypeHierarchy', 'Prepare type hierarchy at a position inside a document', [ApiCommandArgument.Uri, ApiCommandArgument.Position], new ApiCommandResult('A promise that resolves to an array of TypeHierarchyItem-instances', v => v.map(typeConverters.TypeHierarchyItem.to))),
    new ApiCommand('vscode.provideSupertypes', '_executeProvideSupertypes', 'Compute supertypes for an item', [ApiCommandArgument.TypeHierarchyItem], new ApiCommandResult('A promise that resolves to an array of TypeHierarchyItem-instances', v => v.map(typeConverters.TypeHierarchyItem.to))),
    new ApiCommand('vscode.provideSubtypes', '_executeProvideSubtypes', 'Compute subtypes for an item', [ApiCommandArgument.TypeHierarchyItem], new ApiCommandResult('A promise that resolves to an array of TypeHierarchyItem-instances', v => v.map(typeConverters.TypeHierarchyItem.to))),
    // --- testing
    new ApiCommand('vscode.revealTestInExplorer', '_revealTestInExplorer', 'Reveals a test instance in the explorer', [ApiCommandArgument.TestItem], ApiCommandResult.Void),
    new ApiCommand('vscode.startContinuousTestRun', 'testing.startContinuousRunFromExtension', 'Starts running the given tests with continuous run mode.', [ApiCommandArgument.TestProfile, ApiCommandArgument.Arr(ApiCommandArgument.TestItem)], ApiCommandResult.Void),
    new ApiCommand('vscode.stopContinuousTestRun', 'testing.stopContinuousRunFromExtension', 'Stops running the given tests with continuous run mode.', [ApiCommandArgument.Arr(ApiCommandArgument.TestItem)], ApiCommandResult.Void),
    // --- continue edit session
    new ApiCommand('vscode.experimental.editSession.continue', '_workbench.editSessions.actions.continueEditSession', 'Continue the current edit session in a different workspace', [ApiCommandArgument.Uri.with('workspaceUri', 'The target workspace to continue the current edit session in')], ApiCommandResult.Void),
    // --- context keys
    new ApiCommand('setContext', '_setContext', 'Set a custom context key value that can be used in when clauses.', [
        ApiCommandArgument.String.with('name', 'The context key name'),
        new ApiCommandArgument('value', 'The context key value', () => true, v => v),
    ], ApiCommandResult.Void),
    // --- inline chat
    new ApiCommand('vscode.editorChat.start', 'inlineChat.start', 'Invoke a new editor chat session', [new ApiCommandArgument('Run arguments', '', _v => true, v => {
            if (!v) {
                return undefined;
            }
            return {
                initialRange: v.initialRange ? typeConverters.Range.from(v.initialRange) : undefined,
                initialSelection: types.Selection.isSelection(v.initialSelection) ? typeConverters.Selection.from(v.initialSelection) : undefined,
                message: v.message,
                attachments: v.attachments,
                autoSend: v.autoSend,
                position: v.position ? typeConverters.Position.from(v.position) : undefined,
                resolveOnResponse: v.resolveOnResponse
            };
        })], ApiCommandResult.Void),
    // --- extension prompt files
    new ApiCommand('vscode.extensionPromptFileProvider', '_listExtensionPromptFiles', 'Get all extension-contributed prompt files (custom agents, instructions, and prompt files).', [], new ApiCommandResult('A promise that resolves to an array of objects containing uri, type, and extensionId.', (value) => {
        if (!value) {
            return [];
        }
        return value.map(item => ({
            uri: URI.revive(item.uri),
            type: item.type,
            extensionId: item.extensionId
        }));
    }))
];
//#endregion
//#region OLD world
export class ExtHostApiCommands {
    static register(commands) {
        newCommands.forEach(commands.registerApiCommand, commands);
        this._registerValidateWhenClausesCommand(commands);
    }
    static _registerValidateWhenClausesCommand(commands) {
        commands.registerCommand(false, '_validateWhenClauses', validateWhenClauses);
    }
}
function tryMapWith(f) {
    return (value) => {
        if (Array.isArray(value)) {
            return value.map(f);
        }
        return undefined;
    };
}
function mapLocationOrLocationLink(values) {
    if (!Array.isArray(values)) {
        return undefined;
    }
    const result = [];
    for (const item of values) {
        if (languages.isLocationLink(item)) {
            result.push(typeConverters.DefinitionLink.to(item));
        }
        else {
            result.push(typeConverters.location.to(item));
        }
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEFwaUNvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdEFwaUNvbW1hbmRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0UsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBSWxELE9BQU8sS0FBSyxTQUFTLE1BQU0scUNBQXFDLENBQUM7QUFDakUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDL0YsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFHeEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxnQkFBZ0IsRUFBbUIsTUFBTSxzQkFBc0IsQ0FBQztBQUV6RyxPQUFPLEtBQUssY0FBYyxNQUFNLDRCQUE0QixDQUFDO0FBQzdELE9BQU8sS0FBSyxLQUFLLE1BQU0sbUJBQW1CLENBQUM7QUFPM0MsdUJBQXVCO0FBRXZCLE1BQU0sV0FBVyxHQUFpQjtJQUNqQyx5QkFBeUI7SUFDekIsSUFBSSxVQUFVLENBQ2Isa0NBQWtDLEVBQUUsNEJBQTRCLEVBQUUsc0NBQXNDLEVBQ3hHLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxFQUNyRCxJQUFJLGdCQUFnQixDQUF1RSxxRUFBcUUsRUFBRSxVQUFVLENBQUMsY0FBYyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQ2xOO0lBQ0Qsc0JBQXNCO0lBQ3RCLElBQUksVUFBVSxDQUNiLHNDQUFzQyxFQUFFLGdD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