/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { basename } from '../../../../../base/common/path.js';
import { SimpleCompletionItem } from '../../../../services/suggest/browser/simpleCompletionItem.js';
export var TerminalCompletionItemKind;
(function (TerminalCompletionItemKind) {
    // Extension host kinds
    TerminalCompletionItemKind[TerminalCompletionItemKind["File"] = 0] = "File";
    TerminalCompletionItemKind[TerminalCompletionItemKind["Folder"] = 1] = "Folder";
    TerminalCompletionItemKind[TerminalCompletionItemKind["Method"] = 2] = "Method";
    TerminalCompletionItemKind[TerminalCompletionItemKind["Alias"] = 3] = "Alias";
    TerminalCompletionItemKind[TerminalCompletionItemKind["Argument"] = 4] = "Argument";
    TerminalCompletionItemKind[TerminalCompletionItemKind["Option"] = 5] = "Option";
    TerminalCompletionItemKind[TerminalCompletionItemKind["OptionValue"] = 6] = "OptionValue";
    TerminalCompletionItemKind[TerminalCompletionItemKind["Flag"] = 7] = "Flag";
    TerminalCompletionItemKind[TerminalCompletionItemKind["SymbolicLinkFile"] = 8] = "SymbolicLinkFile";
    TerminalCompletionItemKind[TerminalCompletionItemKind["SymbolicLinkFolder"] = 9] = "SymbolicLinkFolder";
    TerminalCompletionItemKind[TerminalCompletionItemKind["Commit"] = 10] = "Commit";
    TerminalCompletionItemKind[TerminalCompletionItemKind["Branch"] = 11] = "Branch";
    TerminalCompletionItemKind[TerminalCompletionItemKind["Tag"] = 12] = "Tag";
    TerminalCompletionItemKind[TerminalCompletionItemKind["Stash"] = 13] = "Stash";
    TerminalCompletionItemKind[TerminalCompletionItemKind["Remote"] = 14] = "Remote";
    TerminalCompletionItemKind[TerminalCompletionItemKind["PullRequest"] = 15] = "PullRequest";
    TerminalCompletionItemKind[TerminalCompletionItemKind["PullRequestDone"] = 16] = "PullRequestDone";
    // Core-only kinds
    TerminalCompletionItemKind[TerminalCompletionItemKind["InlineSuggestion"] = 100] = "InlineSuggestion";
    TerminalCompletionItemKind[TerminalCompletionItemKind["InlineSuggestionAlwaysOnTop"] = 101] = "InlineSuggestionAlwaysOnTop";
})(TerminalCompletionItemKind || (TerminalCompletionItemKind = {}));
// Maps CompletionItemKind from language server based completion to TerminalCompletionItemKind
export function mapLspKindToTerminalKind(lspKind) {
    // TODO: Add more types for different [LSP providers](https://github.com/microsoft/vscode/issues/249480)
    switch (lspKind) {
        case 20 /* CompletionItemKind.File */:
            return TerminalCompletionItemKind.File;
        case 23 /* CompletionItemKind.Folder */:
            return TerminalCompletionItemKind.Folder;
        case 0 /* CompletionItemKind.Method */:
            return TerminalCompletionItemKind.Method;
        case 18 /* CompletionItemKind.Text */:
            return TerminalCompletionItemKind.Argument; // consider adding new type?
        case 4 /* CompletionItemKind.Variable */:
            return TerminalCompletionItemKind.Argument; // ""
        case 16 /* CompletionItemKind.EnumMember */:
            return TerminalCompletionItemKind.OptionValue; // ""
        case 17 /* CompletionItemKind.Keyword */:
            return TerminalCompletionItemKind.Alias;
        default:
            return TerminalCompletionItemKind.Method;
    }
}
export class TerminalCompletionItem extends SimpleCompletionItem {
    constructor(completion, 
    /**
     * The path separator used by the terminal. When provided, this is used instead of
     * detecting the separator from the label. This is important for remote scenarios
     * (e.g., WSL) where the remote OS may use different path separators than the local OS.
     */
    pathSeparator) {
        super(completion);
        this.completion = completion;
        /**
         * The file extension part from {@link labelLow}.
         */
        this.fileExtLow = '';
        /**
         * A penalty that applies to completions that are comprised of only punctuation characters or
         * that applies to files or folders starting with the underscore character.
         */
        this.punctuationPenalty = 0;
        // Detect path separator from the label if not provided. This ensures correct behavior
        // for all scenarios (local Windows, local Unix, WSL, SSH remotes) by using the actual
        // separator present in the completion rather than assuming based on the local OS.
        const detectedSeparator = pathSeparator ?? (this.labelLow.includes('\\') ? '\\' : undefined);
        const useWindowsStylePath = detectedSeparator === '\\';
        // ensure lower-variants (perf)
        this.labelLowExcludeFileExt = this.labelLow;
        this.labelLowNormalizedPath = this.labelLow;
        // HACK: Treat branch as a path separator, otherwise they get filtered out. Hard code the
        // documentation for now, but this would be better to come in through a `kind`
        // See https://github.com/microsoft/vscode/issues/255864
        if (isFile(completion) || completion.kind === TerminalCompletionItemKind.Branch) {
            if (useWindowsStylePath) {
                this.labelLow = this.labelLow.replaceAll('/', '\\');
            }
        }
        if (isFile(completion)) {
            // Don't include dotfiles as extensions when sorting
            const extIndex = this.labelLow.lastIndexOf('.');
            if (extIndex > 0) {
                this.labelLowExcludeFileExt = this.labelLow.substring(0, extIndex);
                this.fileExtLow = this.labelLow.substring(extIndex + 1);
            }
        }
        if (isFile(completion) || completion.kind === TerminalCompletionItemKind.Folder) {
            if (useWindowsStylePath) {
                this.labelLowNormalizedPath = this.labelLow.replaceAll('\\', '/');
            }
            if (completion.kind === TerminalCompletionItemKind.Folder) {
                this.labelLowNormalizedPath = this.labelLowNormalizedPath.replace(/\/$/, '');
            }
        }
        this.punctuationPenalty = shouldPenalizeForPunctuation(this.labelLowExcludeFileExt) ? 1 : 0;
    }
    /**
     * Resolves the completion item's details lazily when needed.
     */
    async resolve(token) {
        if (this.resolveCache) {
            return this.resolveCache;
        }
        const unresolvedItem = this.completion._unresolvedItem;
        const provider = this.completion._resolveProvider;
        if (!unresolvedItem || !provider || !provider.resolveCompletionItem) {
            return;
        }
        this.resolveCache = (async () => {
            try {
                const resolved = await provider.resolveCompletionItem(unresolvedItem, token);
                if (resolved) {
                    // Update the completion with resolved details
                    if (resolved.detail) {
                        this.completion.detail = resolved.detail;
                    }
                    if (resolved.documentation) {
                        this.completion.documentation = resolved.documentation;
                    }
                }
            }
            catch (error) {
                return;
            }
        })();
        return this.resolveCache;
    }
}
function isFile(completion) {
    return !!(completion.kind === TerminalCompletionItemKind.File || completion.isFileOverride);
}
function shouldPenalizeForPunctuation(label) {
    return basename(label).startsWith('_') || /^[\[\]\{\}\(\)\.,;:!?\/\\\-_@#~*%^=$]+$/.test(label);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb21wbGV0aW9uSXRlbS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvdGVybWluYWxDb21wbGV0aW9uSXRlbS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFOUQsT0FBTyxFQUFxQixvQkFBb0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBRXZILE1BQU0sQ0FBTixJQUFZLDBCQXVCWDtBQXZCRCxXQUFZLDBCQUEwQjtJQUNyQyx1QkFBdUI7SUFDdkIsMkVBQVEsQ0FBQTtJQUNSLCtFQUFVLENBQUE7SUFDViwrRUFBVSxDQUFBO0lBQ1YsNkVBQVMsQ0FBQTtJQUNULG1GQUFZLENBQUE7SUFDWiwrRUFBVSxDQUFBO0lBQ1YseUZBQWUsQ0FBQTtJQUNmLDJFQUFRLENBQUE7SUFDUixtR0FBb0IsQ0FBQTtJQUNwQix1R0FBc0IsQ0FBQTtJQUN0QixnRkFBVyxDQUFBO0lBQ1gsZ0ZBQVcsQ0FBQTtJQUNYLDBFQUFRLENBQUE7SUFDUiw4RUFBVSxDQUFBO0lBQ1YsZ0ZBQVcsQ0FBQTtJQUNYLDBGQUFnQixDQUFBO0lBQ2hCLGtHQUFvQixDQUFBO0lBRXBCLGtCQUFrQjtJQUNsQixxR0FBc0IsQ0FBQTtJQUN0QiwySEFBaUMsQ0FBQTtBQUNsQyxDQUFDLEVBdkJXLDBCQUEwQixLQUExQiwwQkFBMEIsUUF1QnJDO0FBRUQsOEZBQThGO0FBQzlGLE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxPQUEyQjtJQUNuRSx3R0FBd0c7SUFFeEcsUUFBUSxPQUFPLEVBQUUsQ0FBQztRQUNqQjtZQUNDLE9BQU8sMEJBQTBCLENBQUMsSUFBSSxDQUFDO1FBQ3hDO1lBQ0MsT0FBTywwQkFBMEIsQ0FBQyxNQUFNLENBQUM7UUFDMUM7WUFDQyxPQUFPLDBCQUEwQixDQUFDLE1BQU0sQ0FBQztRQUMxQztZQUNDLE9BQU8sMEJBQTBCLENBQUMsUUFBUSxDQUFDLENBQUMsNEJBQTRCO1FBQ3pFO1lBQ0MsT0FBTywwQkFBMEIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxLQUFLO1FBQ2xEO1lBQ0MsT0FBTywwQkFBMEIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxLQUFLO1FBQ3JEO1lBQ0MsT0FBTywwQkFBMEIsQ0FBQyxLQUFLLENBQUM7UUFDekM7WUFDQyxPQUFPLDBCQUEwQixDQUFDLE1BQU0sQ0FBQztJQUMzQyxDQUFDO0FBQ0YsQ0FBQztBQXNDRCxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsb0JBQW9CO0lBNEIvRCxZQUNtQixVQUErQjtJQUNqRDs7OztPQUlHO0lBQ0gsYUFBc0I7UUFFdEIsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBUkEsZUFBVSxHQUFWLFVBQVUsQ0FBcUI7UUFqQmxEOztXQUVHO1FBQ0gsZUFBVSxHQUFXLEVBQUUsQ0FBQztRQUV4Qjs7O1dBR0c7UUFDSCx1QkFBa0IsR0FBVSxDQUFDLENBQUM7UUFrQjdCLHNGQUFzRjtRQUN0RixzRkFBc0Y7UUFDdEYsa0ZBQWtGO1FBQ2xGLE1BQU0saUJBQWlCLEdBQUcsYUFBYSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDN0YsTUFBTSxtQkFBbUIsR0FBRyxpQkFBaUIsS0FBSyxJQUFJLENBQUM7UUFFdkQsK0JBQStCO1FBQy9CLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO1FBQzVDLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO1FBRTVDLHlGQUF5RjtRQUN6Riw4RUFBOEU7UUFDOUUsd0RBQXdEO1FBQ3hELElBQUksTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxJQUFJLEtBQUssMEJBQTBCLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDakYsSUFBSSxtQkFBbUIsRUFBRSxDQUFDO2dCQUN6QixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNyRCxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDeEIsb0RBQW9EO1lBQ3BELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2hELElBQUksUUFBUSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNsQixJQUFJLENBQUMsc0JBQXNCLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUNuRSxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUN6RCxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxJQUFJLEtBQUssMEJBQTBCLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDakYsSUFBSSxtQkFBbUIsRUFBRSxDQUFDO2dCQUN6QixJQUFJLENBQUMsc0JBQXNCLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ25FLENBQUM7WUFDRCxJQUFJLFVBQVUsQ0FBQyxJQUFJLEtBQUssMEJBQTBCLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQzNELElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM5RSxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQyxrQkFBa0IsR0FBRyw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDN0YsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUF3QjtRQUVyQyxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUN2QixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUM7UUFDMUIsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsZUFBZSxDQUFDO1FBQ3ZELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUM7UUFFbEQsSUFBSSxDQUFDLGNBQWMsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQ3JFLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLFlBQVksR0FBRyxDQUFDLEtBQUssSUFBSSxFQUFFO1lBQy9CLElBQUksQ0FBQztnQkFDSixNQUFNLFFBQVEsR0FBRyxNQUFNLFFBQVEsQ0FBQyxxQkFBc0IsQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQzlFLElBQUksUUFBUSxFQUFFLENBQUM7b0JBQ2QsOENBQThDO29CQUM5QyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQzt3QkFDckIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQztvQkFDMUMsQ0FBQztvQkFDRCxJQUFJLFFBQVEsQ0FBQyxhQUFhLEVBQUUsQ0FBQzt3QkFDNUIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxhQUFhLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQztvQkFDeEQsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2hCLE9BQU87WUFDUixDQUFDO1FBQ0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUVMLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQztJQUMxQixDQUFDO0NBRUQ7QUFFRCxTQUFTLE1BQU0sQ0FBQyxVQUErQjtJQUM5QyxPQUFPLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEtBQUssMEJBQTBCLENBQUMsSUFBSSxJQUFJLFVBQVUsQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUM3RixDQUFDO0FBRUQsU0FBUyw0QkFBNEIsQ0FBQyxLQUFhO0lBQ2xELE9BQU8sUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSx5Q0FBeUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDakcsQ0FBQyJ9