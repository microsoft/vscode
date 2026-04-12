/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { Range } from '../../../../editor/common/core/range.js';
import { isNumber } from '../../../../base/common/types.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { compare } from '../../../../base/common/strings.js';
import { groupBy } from '../../../../base/common/arrays.js';
export var WorkspaceSymbolProviderRegistry;
(function (WorkspaceSymbolProviderRegistry) {
    const _supports = [];
    function register(provider) {
        let support = provider;
        if (support) {
            _supports.push(support);
        }
        return {
            dispose() {
                if (support) {
                    const idx = _supports.indexOf(support);
                    if (idx >= 0) {
                        _supports.splice(idx, 1);
                        support = undefined;
                    }
                }
            }
        };
    }
    WorkspaceSymbolProviderRegistry.register = register;
    function all() {
        return _supports.slice(0);
    }
    WorkspaceSymbolProviderRegistry.all = all;
})(WorkspaceSymbolProviderRegistry || (WorkspaceSymbolProviderRegistry = {}));
export class WorkspaceSymbolItem {
    constructor(symbol, provider) {
        this.symbol = symbol;
        this.provider = provider;
    }
}
export async function getWorkspaceSymbols(query, token = CancellationToken.None) {
    const all = [];
    const promises = WorkspaceSymbolProviderRegistry.all().map(async (provider) => {
        try {
            const value = await provider.provideWorkspaceSymbols(query, token);
            if (!value) {
                return;
            }
            for (const symbol of value) {
                all.push(new WorkspaceSymbolItem(symbol, provider));
            }
        }
        catch (err) {
            onUnexpectedExternalError(err);
        }
    });
    await Promise.all(promises);
    if (token.isCancellationRequested) {
        return [];
    }
    // de-duplicate entries
    function compareItems(a, b) {
        let res = compare(a.symbol.name, b.symbol.name);
        if (res === 0) {
            res = a.symbol.kind - b.symbol.kind;
        }
        if (res === 0) {
            res = compare(a.symbol.location.uri.toString(), b.symbol.location.uri.toString());
        }
        if (res === 0) {
            if (a.symbol.location.range && b.symbol.location.range) {
                if (!Range.areIntersecting(a.symbol.location.range, b.symbol.location.range)) {
                    res = Range.compareRangesUsingStarts(a.symbol.location.range, b.symbol.location.range);
                }
            }
            else if (a.provider.resolveWorkspaceSymbol && !b.provider.resolveWorkspaceSymbol) {
                res = -1;
            }
            else if (!a.provider.resolveWorkspaceSymbol && b.provider.resolveWorkspaceSymbol) {
                res = 1;
            }
        }
        if (res === 0) {
            res = compare(a.symbol.containerName ?? '', b.symbol.containerName ?? '');
        }
        return res;
    }
    return groupBy(all, compareItems).map(group => group[0]).flat();
}
/**
 * Helper to return all opened editors with resources not belonging to the currently opened workspace.
 */
export function getOutOfWorkspaceEditorResources(accessor) {
    const editorService = accessor.get(IEditorService);
    const contextService = accessor.get(IWorkspaceContextService);
    const fileService = accessor.get(IFileService);
    const resources = editorService.editors
        .map(editor => EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }))
        .filter(resource => !!resource && !contextService.isInsideWorkspace(resource) && fileService.hasProvider(resource));
    return resources;
}
// Supports patterns of <path><#|:|(><line><#|:|,><col?><:?>
const LINE_COLON_PATTERN = /\s?[#:\(](?:line )?(\d*)(?:[#:,](\d*))?\)?:?\s*$/;
export function extractRangeFromFilter(filter, unless) {
    // Ignore when the unless character not the first character or is before the line colon pattern
    if (!filter || unless?.some(value => {
        const unlessCharPos = filter.indexOf(value);
        return unlessCharPos === 0 || unlessCharPos > 0 && !LINE_COLON_PATTERN.test(filter.substring(unlessCharPos + 1));
    })) {
        return undefined;
    }
    let range = undefined;
    // Find Line/Column number from search value using RegExp
    const patternMatch = LINE_COLON_PATTERN.exec(filter);
    if (patternMatch) {
        const startLineNumber = parseInt(patternMatch[1] ?? '', 10);
        // Line Number
        if (isNumber(startLineNumber)) {
            range = {
                startLineNumber: startLineNumber,
                startColumn: 1,
                endLineNumber: startLineNumber,
                endColumn: 1
            };
            // Column Number
            const startColumn = parseInt(patternMatch[2] ?? '', 10);
            if (isNumber(startColumn)) {
                range = {
                    startLineNumber: range.startLineNumber,
                    startColumn: startColumn,
                    endLineNumber: range.endLineNumber,
                    endColumn: startColumn
                };
            }
        }
        // User has typed "something:" or "something#" without a line number, in this case treat as start of file
        else if (patternMatch[1] === '') {
            range = {
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: 1,
                endColumn: 1
            };
        }
    }
    if (patternMatch && range) {
        return {
            filter: filter.substr(0, patternMatch.index), // clear range suffix from search value
            range
        };
    }
    return undefined;
}
export var SearchUIState;
(function (SearchUIState) {
    SearchUIState[SearchUIState["Idle"] = 0] = "Idle";
    SearchUIState[SearchUIState["Searching"] = 1] = "Searching";
    SearchUIState[SearchUIState["SlowSearch"] = 2] = "SlowSearch";
})(SearchUIState || (SearchUIState = {}));
export const SearchStateKey = new RawContextKey('searchState', SearchUIState.Idle);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL2NvbW1vbi9zZWFyY2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFJOUUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFOUYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDckYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRTVFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBZTVELE1BQU0sS0FBVywrQkFBK0IsQ0EwQi9DO0FBMUJELFdBQWlCLCtCQUErQjtJQUUvQyxNQUFNLFNBQVMsR0FBK0IsRUFBRSxDQUFDO0lBRWpELFNBQWdCLFFBQVEsQ0FBQyxRQUFrQztRQUMxRCxJQUFJLE9BQU8sR0FBeUMsUUFBUSxDQUFDO1FBQzdELElBQUksT0FBTyxFQUFFLENBQUM7WUFDYixTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3pCLENBQUM7UUFFRCxP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