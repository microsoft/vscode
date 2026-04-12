/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { dirname, extUri } from '../../../../../../base/common/resources.js';
import { getPromptsTypeForLanguageId, PromptsType } from '../promptTypes.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { getWordAtText } from '../../../../../../editor/common/core/wordHelper.js';
import { chatVariableLeader } from '../../requestParser/chatParserTypes.js';
import { ILanguageModelToolsService } from '../../tools/languageModelToolsService.js';
/**
 * Provides autocompletion for the variables inside prompt bodies.
 * - #file: paths to files and folders in the workspace
 * - # tool names
 */
let PromptBodyAutocompletion = class PromptBodyAutocompletion {
    constructor(fileService, languageModelToolsService) {
        this.fileService = fileService;
        this.languageModelToolsService = languageModelToolsService;
        /**
         * Debug display name for this provider.
         */
        this._debugDisplayName = 'PromptBodyAutocompletion';
        /**
         * List of trigger characters handled by this provider.
         */
        this.triggerCharacters = [':', '.', '/', '\\'];
    }
    /**
     * The main function of this provider that calculates
     * completion items based on the provided arguments.
     */
    async provideCompletionItems(model, position, context, token) {
        const promptsType = getPromptsTypeForLanguageId(model.getLanguageId());
        if (!promptsType) {
            return undefined;
        }
        const reference = await this.findVariableReference(model, position, token);
        if (!reference) {
            return undefined;
        }
        const suggestions = [];
        switch (reference.type) {
            case 'file':
                if (reference.contentRange.containsPosition(position)) {
                    // inside the link range
                    await this.collectFilePathCompletions(model, position, reference.contentRange, suggestions);
                }
                else {
                    await this.collectDefaultCompletions(model, reference.range, promptsType, suggestions);
                }
                break;
            case 'tool':
                if (reference.contentRange.containsPosition(position)) {
                    if (promptsType === PromptsType.agent || promptsType === PromptsType.prompt) {
                        await this.collectToolCompletions(model, position, reference.contentRange, suggestions);
                    }
                }
                else {
                    await this.collectDefaultCompletions(model, reference.range, promptsType, suggestions);
                }
                break;
            default:
                await this.collectDefaultCompletions(model, reference.range, promptsType, suggestions);
        }
        return { suggestions };
    }
    async collectToolCompletions(model, position, toolRange, suggestions) {
        for (const toolName of this.languageModelToolsService.getFullReferenceNames()) {
            suggestions.push({
                label: toolName,
                kind: 13 /* CompletionItemKind.Value */,
                filterText: toolName,
                insertText: toolName,
                range: toolRange,
            });
        }
    }
    async collectFilePathCompletions(model, position, pathRange, suggestions) {
        const pathUntilPosition = model.getValueInRange(pathRange.setEndPosition(position.lineNumber, position.column));
        const pathSeparator = pathUntilPosition.includes('/') || !pathUntilPosition.includes('\\') ? '/' : '\\';
        let parentFolderPath;
        if (pathUntilPosition.match(/[^\/]\.\.$/i)) { // ends with `..`
            parentFolderPath = pathUntilPosition + pathSeparator;
        }
        else {
            let i = pathUntilPosition.length - 1;
            while (i >= 0 && ![47 /* CharCode.Slash */, 92 /* CharCode.Backslash */].includes(pathUntilPosition.charCodeAt(i))) {
                i--;
            }
            parentFolderPath = pathUntilPosition.substring(0, i + 1); // the segment up to the `/` or `\` before the position
        }
        const retriggerCommand = { id: 'editor.action.triggerSuggest', title: 'Suggest' };
        try {
            const currentFolder = extUri.resolvePath(dirname(model.uri), parentFolderPath);
            const { children } = await this.fileService.resolve(currentFolder);
            if (children) {
                for (const child of children) {
                    const insertText = (parentFolderPath || ('.' + pathSeparator)) + child.name;
                    suggestions.push({
                        label: child.name + (child.isDirectory ? pathSeparator : ''),
                        kind: child.isDirectory ? 23 /* CompletionItemKind.Folder */ : 20 /* CompletionItemKind.File */,
                        range: pathRange,
                        insertText: insertText + (child.isDirectory ? pathSeparator : ''),
                        filterText: insertText,
                        command: child.isDirectory ? retriggerCommand : undefined
                    });
                }
            }
        }
        catch (e) {
            // ignore errors accessing the folder location
        }
        suggestions.push({
            label: '..',
            kind: 23 /* CompletionItemKind.Folder */,
            insertText: parentFolderPath + '..' + pathSeparator,
            range: pathRange,
            filterText: parentFolderPath + '..',
            command: retriggerCommand
        });
    }
    /**
     * Finds a file reference that suites the provided `position`.
     */
    async findVariableReference(model, position, token) {
        if (model.getLineContent(1).trimEnd() === '---') {
            let i = 2;
            while (i <= model.getLineCount() && model.getLineContent(i).trimEnd() !== '---') {
                i++;
            }
            if (i >= position.lineNumber) {
                // inside front matter
                return undefined;
            }
        }
        const reg = new RegExp(`${chatVariableLeader}[^\\s#]*`, 'g');
        const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
        if (!varWord) {
            return undefined;
        }
        const range = new Range(position.lineNumber, varWord.startColumn + 1, position.lineNumber, varWord.endColumn);
        const nameMatch = varWord.word.match(/^#(\w+:)?/);
        if (nameMatch) {
            const contentCol = varWord.startColumn + nameMatch[0].length;
            if (nameMatch[1] === 'file:') {
                return { type: 'file', contentRange: new Range(position.lineNumber, contentCol, position.lineNumber, varWord.endColumn), range };
            }
            else if (nameMatch[1] === 'tool:') {
                return { type: 'tool', contentRange: new Range(position.lineNumber, contentCol, position.lineNumber, varWord.endColumn), range };
            }
        }
        return { type: '', contentRange: range, range };
    }
    async collectDefaultCompletions(model, range, promptFileType, suggestions) {
        const labels = promptFileType === PromptsType.instructions ? ['file'] : ['file', 'tool'];
        labels.forEach(label => {
            suggestions.push({
                label: `${label}:`,
                kind: 17 /* CompletionItemKind.Keyword */,
                insertText: `${label}:`,
                range: range,
                command: { id: 'editor.action.triggerSuggest', title: 'Suggest' }
            });
        });
    }
};
PromptBodyAutocompletion = __decorate([
    __param(0, IFileService),
    __param(1, ILanguageModelToolsService)
], PromptBodyAutocompletion);
export { PromptBodyAutocompletion };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0Qm9keUF1dG9jb21wbGV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L2xhbmd1YWdlUHJvdmlkZXJzL3Byb21wdEJvZHlBdXRvY29tcGxldGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRTdFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxXQUFXLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUU3RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFHaEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRXRFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUV0Rjs7OztHQUlHO0FBQ0ksSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBd0I7SUFXcEMsWUFDZSxXQUEwQyxFQUM1Qix5QkFBc0U7UUFEbkUsZ0JBQVcsR0FBWCxXQUFXLENBQWM7UUFDWCw4QkFBeUIsR0FBekIseUJBQXlCLENBQTRCO1FBWm5HOztXQUVHO1FBQ2Esc0JBQWlCLEdBQVcsMEJBQTBCLENBQUM7UUFFdkU7O1dBRUc7UUFDYSxzQkFBaUIsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBTTFELENBQUM7SUFFRDs7O09BR0c7SUFDSSxLQUFLLENBQUMsc0JBQXNCLENBQUMsS0FBaUIsRUFBRSxRQUFrQixFQUFFLE9BQTBCLEVBQUUsS0FBd0I7UUFDOUgsTUFBTSxXQUFXLEdBQUcsMkJBQTJCLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNFLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsTUFBTSxXQUFXLEdBQXFCLEVBQUUsQ0FBQztRQUN6QyxRQUFRLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN4QixLQUFLLE1BQU07Z0JBQ1YsSUFBSSxTQUFTLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7b0JBQ3ZELHdCQUF3QjtvQkFDeEIsTUFBTSxJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxTQUFTLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUM3RixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsTUFBTSxJQUFJLENBQUMseUJBQXlCLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUN4RixDQUFDO2dCQUNELE1BQU07WUFDUCxLQUFLLE1BQU07Z0JBQ1YsSUFBSSxTQUFTLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7b0JBQ3ZELElBQUksV0FBVyxLQUFLLFdBQVcsQ0FBQyxLQUFLLElBQUksV0FBVyxLQUFLLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQzt3QkFDN0UsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxTQUFTLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO29CQUN6RixDQUFDO2dCQUNGLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxNQUFNLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsV0FBVyxDQUFDLENBQUM7Z0JBQ3hGLENBQUM7Z0JBQ0QsTUFBTTtZQUNQO2dCQUNDLE1BQU0sSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUN6RixDQUFDO1FBQ0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxDQUFDO0lBQ3hCLENBQUM7SUFFTyxLQUFLLENBQUMsc0JBQXNCLENBQUMsS0FBaUIsRUFBRSxRQUFrQixFQUFFLFNBQWdCLEVBQUUsV0FBNkI7UUFDMUgsS0FBSyxNQUFNLFFBQVEsSUFBSSxJQUFJLENBQUMseUJBQXlCLENBQUMscUJBQXFCLEVBQUUsRUFBRSxDQUFDO1lBQy9FLFdBQVcsQ0FBQyxJQUFJLENBQUM7Z0JBQ2hCLEtBQUssRUFBRSxRQUFRO2dCQUNmLElBQUksbUNBQTBCO2dCQUM5QixVQUFVLEVBQUUsUUFBUTtnQkFDcEIsVUFBVSxFQUFFLFFBQVE7Z0JBQ3BCLEtBQUssRUFBRSxTQUFTO2FBQ2hCLENBQUMsQ0FBQztRQUNKLENBQUM7SUFDRixDQUFDO0lBR08sS0FBSyxDQUFDLDBCQUEwQixDQUFDLEtBQWlCLEVBQUUsUUFBa0IsRUFBRSxTQUFnQixFQUFFLFdBQTZCO1FBQzlILE1BQU0saUJBQWlCLEdBQUcsS0FBSyxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDaEgsTUFBTSxhQUFhLEdBQUcsaUJBQWlCLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztRQUN4RyxJQUFJLGdCQUF3QixDQUFDO1FBQzdCLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxpQkFBaUI7WUFDOUQsZ0JBQWdCLEdBQUcsaUJBQWlCLEdBQUcsYUFBYSxDQUFDO1FBQ3RELENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLEdBQUcsaUJBQWlCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztZQUNyQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxzREFBb0MsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDbEcsQ0FBQyxFQUFFLENBQUM7WUFDTCxDQUFDO1lBQ0QsZ0JBQWdCLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyx1REFBdUQ7UUFDbEgsQ0FBQztRQUVELE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxFQUFFLEVBQUUsOEJBQThCLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDO1FBRWxGLElBQUksQ0FBQztZQUNKLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQy9FLE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ25FLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQ2QsS0FBSyxNQUFNLEtBQUssSUFBSSxRQUFRLEVBQUUsQ0FBQztvQkFDOUIsTUFBTSxVQUFVLEdBQUcsQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLEdBQUcsR0FBRyxhQUFhLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7b0JBQzVFLFdBQVcsQ0FBQyxJQUFJLENBQUM7d0JBQ2hCLEtBQUssRUFBRSxLQUFLLENBQUMsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7d0JBQzVELElBQUksRUFBRSxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsb0NBQTJCLENBQUMsaUNBQXdCO3dCQUM3RSxLQUFLLEVBQUUsU0FBUzt3QkFDaEIsVUFBVSxFQUFFLFVBQVUsR0FBRyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO3dCQUNqRSxVQUFVLEVBQUUsVUFBVTt3QkFDdEIsT0FBTyxFQUFFLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxTQUFTO3FCQUN6RCxDQUFDLENBQUM7Z0JBQ0osQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNaLDhDQUE4QztRQUMvQyxDQUFDO1FBRUQsV0FBVyxDQUFDLElBQUksQ0FBQztZQUNoQixLQUFLLEVBQUUsSUFBSTtZQUNYLElBQUksb0NBQTJCO1lBQy9CLFVBQVUsRUFBRSxnQkFBZ0IsR0FBRyxJQUFJLEdBQUcsYUFBYTtZQUNuRCxLQUFLLEVBQUUsU0FBUztZQUNoQixVQUFVLEVBQUUsZ0JBQWdCLEdBQUcsSUFBSTtZQUNuQyxPQUFPLEVBQUUsZ0JBQWdCO1NBQ3pCLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRDs7T0FFRztJQUNLLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxLQUFpQixFQUFFLFFBQWtCLEVBQUUsS0FBd0I7UUFDbEcsSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ2pELElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNWLE9BQU8sQ0FBQyxJQUFJLEtBQUssQ0FBQyxZQUFZLEVBQUUsSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUNqRixDQUFDLEVBQUUsQ0FBQztZQUNMLENBQUM7WUFDRCxJQUFJLENBQUMsSUFBSSxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQzlCLHNCQUFzQjtnQkFDdEIsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLEdBQUcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxHQUFHLGtCQUFrQixVQUFVLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDN0QsTUFBTSxPQUFPLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xHLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxNQUFNLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxXQUFXLEdBQUcsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzlHLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ2xELElBQUksU0FBUyxFQUFFLENBQUM7WUFDZixNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsV0FBVyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFDN0QsSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssT0FBTyxFQUFFLENBQUM7Z0JBQzlCLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQztZQUNsSSxDQUFDO2lCQUFNLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLE9BQU8sRUFBRSxDQUFDO2dCQUNyQyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUM7WUFDbEksQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDO0lBQ2pELENBQUM7SUFFTyxLQUFLLENBQUMseUJBQXlCLENBQUMsS0FBaUIsRUFBRSxLQUFZLEVBQUUsY0FBMkIsRUFBRSxXQUE2QjtRQUNsSSxNQUFNLE1BQU0sR0FBRyxjQUFjLEtBQUssV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDekYsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUN0QixXQUFXLENBQUMsSUFBSSxDQUFDO2dCQUNoQixLQUFLLEVBQUUsR0FBRyxLQUFLLEdBQUc7Z0JBQ2xCLElBQUkscUNBQTRCO2dCQUNoQyxVQUFVLEVBQUUsR0FBRyxLQUFLLEdBQUc7Z0JBQ3ZCLEtBQUssRUFBRSxLQUFLO2dCQUNaLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSw4QkFBOEIsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFO2FBQ2pFLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNELENBQUE7QUEvSlksd0JBQXdCO0lBWWxDLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSwwQkFBMEIsQ0FBQTtHQWJoQix3QkFBd0IsQ0ErSnBDIn0=