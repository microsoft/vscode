/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { IModelService } from '../../../common/services/model.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { assertType } from '../../../../base/common/types.js';
import { encodeSemanticTokensDto } from '../../../common/services/semanticTokensDto.js';
import { Range } from '../../../common/core/range.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
export function isSemanticTokens(v) {
    return v && !!(v.data);
}
export function isSemanticTokensEdits(v) {
    return v && Array.isArray(v.edits);
}
export class DocumentSemanticTokensResult {
    constructor(provider, tokens, error) {
        this.provider = provider;
        this.tokens = tokens;
        this.error = error;
    }
}
export function hasDocumentSemanticTokensProvider(registry, model) {
    return registry.has(model);
}
function getDocumentSemanticTokensProviders(registry, model) {
    const groups = registry.orderedGroups(model);
    return (groups.length > 0 ? groups[0] : []);
}
export async function getDocumentSemanticTokens(registry, model, lastProvider, lastResultId, token) {
    const providers = getDocumentSemanticTokensProviders(registry, model);
    // Get tokens from all providers at the same time.
    const results = await Promise.all(providers.map(async (provider) => {
        let result;
        let error = null;
        try {
            result = await provider.provideDocumentSemanticTokens(model, (provider === lastProvider ? lastResultId : null), token);
        }
        catch (err) {
            error = err;
            result = null;
        }
        if (!result || (!isSemanticTokens(result) && !isSemanticTokensEdits(result))) {
            result = null;
        }
        return new DocumentSemanticTokensResult(provider, result, error);
    }));
    // Try to return the first result with actual tokens or
    // the first result which threw an error (!!)
    for (const result of results) {
        if (result.error) {
            throw result.error;
        }
        if (result.tokens) {
            return result;
        }
    }
    // Return the first result, even if it doesn't have tokens
    if (results.length > 0) {
        return results[0];
    }
    return null;
}
function _getDocumentSemanticTokensProviderHighestGroup(registry, model) {
    const result = registry.orderedGroups(model);
    return (result.length > 0 ? result[0] : null);
}
class DocumentRangeSemanticTokensResult {
    constructor(provider, tokens) {
        this.provider = provider;
        this.tokens = tokens;
    }
}
export function hasDocumentRangeSemanticTokensProvider(providers, model) {
    return providers.has(model);
}
function getDocumentRangeSemanticTokensProviders(providers, model) {
    const groups = providers.orderedGroups(model);
    return (groups.length > 0 ? groups[0] : []);
}
export async function getDocumentRangeSemanticTokens(registry, model, range, token) {
    const providers = getDocumentRangeSemanticTokensProviders(registry, model);
    // Get tokens from all providers at the same time.
    const results = await Promise.all(providers.map(async (provider) => {
        let result;
        try {
            result = await provider.provideDocumentRangeSemanticTokens(model, range, token);
        }
        catch (err) {
            onUnexpectedExternalError(err);
            result = null;
        }
        if (!result || !isSemanticTokens(result)) {
            result = null;
        }
        return new DocumentRangeSemanticTokensResult(provider, result);
    }));
    // Try to return the first result with actual tokens
    for (const result of results) {
        if (result.tokens) {
            return result;
        }
    }
    // Return the first result, even if it doesn't have tokens
    if (results.length > 0) {
        return results[0];
    }
    return null;
}
CommandsRegistry.registerCommand('_provideDocumentSemanticTokensLegend', async (accessor, ...args) => {
    const [uri] = args;
    assertType(uri instanceof URI);
    const model = accessor.get(IModelService).getModel(uri);
    if (!model) {
        return undefined;
    }
    const { documentSemanticTokensProvider } = accessor.get(ILanguageFeaturesService);
    const providers = _getDocumentSemanticTokensProviderHighestGroup(documentSemanticTokensProvider, model);
    if (!providers) {
        // there is no provider => fall back to a document range semantic tokens provider
        return accessor.get(ICommandService).executeCommand('_provideDocumentRangeSemanticTokensLegend', uri);
    }
    return providers[0].getLegend();
});
CommandsRegistry.registerCommand('_provideDocumentSemanticTokens', async (accessor, ...args) => {
    const [uri] = args;
    assertType(uri instanceof URI);
    const model = accessor.get(IModelService).getModel(uri);
    if (!model) {
        return undefined;
    }
    const { documentSemanticTokensProvider } = accessor.get(ILanguageFeaturesService);
    if (!hasDocumentSemanticTokensProvider(documentSemanticTokensProvider, model)) {
        // there is no provider => fall back to a document range semantic tokens provider
        return accessor.get(ICommandService).executeCommand('_provideDocumentRangeSemanticTokens', uri, model.getFullModelRange());
    }
    const r = await getDocumentSemanticTokens(documentSemanticTokensProvider, model, null, null, CancellationToken.None);
    if (!r) {
        return undefined;
    }
    const { provider, tokens } = r;
    if (!tokens || !isSemanticTokens(tokens)) {
        return undefined;
    }
    const buff = encodeSemanticTokensDto({
        id: 0,
        type: 'full',
        data: tokens.data
    });
    if (tokens.resultId) {
        provider.releaseDocumentSemanticTokens(tokens.resultId);
    }
    return buff;
});
CommandsRegistry.registerCommand('_provideDocumentRangeSemanticTokensLegend', async (accessor, ...args) => {
    const [uri, range] = args;
    assertType(uri instanceof URI);
    const model = accessor.get(IModelService).getModel(uri);
    if (!model) {
        return undefined;
    }
    const { documentRangeSemanticTokensProvider } = accessor.get(ILanguageFeaturesService);
    const providers = getDocumentRangeSemanticTokensProviders(documentRangeSemanticTokensProvider, model);
    if (providers.length === 0) {
        // no providers
        return undefined;
    }
    if (providers.length === 1) {
        // straight forward case, just a single provider
        return providers[0].getLegend();
    }
    if (!range || !Range.isIRange(range)) {
        // if no range is provided, we cannot support multiple providers
        // as we cannot fall back to the one which would give results
        // => return the first legend for backwards compatibility and print a warning
        console.warn(`provideDocumentRangeSemanticTokensLegend might be out-of-sync with provideDocumentRangeSemanticTokens unless a range argument is passed in`);
        return providers[0].getLegend();
    }
    const result = await getDocumentRangeSemanticTokens(documentRangeSemanticTokensProvider, model, Range.lift(range), CancellationToken.None);
    if (!result) {
        return undefined;
    }
    return result.provider.getLegend();
});
CommandsRegistry.registerCommand('_provideDocumentRangeSemanticTokens', async (accessor, ...args) => {
    const [uri, range] = args;
    assertType(uri instanceof URI);
    assertType(Range.isIRange(range));
    const model = accessor.get(IModelService).getModel(uri);
    if (!model) {
        return undefined;
    }
    const { documentRangeSemanticTokensProvider } = accessor.get(ILanguageFeaturesService);
    const result = await getDocumentRangeSemanticTokens(documentRangeSemanticTokensProvider, model, Range.lift(range), CancellationToken.None);
    if (!result || !result.tokens) {
        // there is no provider or it didn't return tokens
        return undefined;
    }
    return encodeSemanticTokensDto({
        id: 0,
        type: 'full',
        data: result.tokens.data
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0U2VtYW50aWNUb2tlbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9zZW1hbnRpY1Rva2Vucy9jb21tb24vZ2V0U2VtYW50aWNUb2tlbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBR3JELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDckcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTlELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV0RCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUV4RixNQUFNLFVBQVUsZ0JBQWdCLENBQUMsQ0FBdUM7SUFDdkUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQWtCLENBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMxQyxDQUFDO0FBRUQsTUFBTSxVQUFVLHFCQUFxQixDQUFDLENBQXVDO0lBQzVFLE9BQU8sQ0FBQyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQXVCLENBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUMzRCxDQUFDO0FBRUQsTUFBTSxPQUFPLDRCQUE0QjtJQUN4QyxZQUNpQixRQUF3QyxFQUN4QyxNQUFtRCxFQUNuRCxLQUFjO1FB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