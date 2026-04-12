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
import { getPromptsTypeForLanguageId } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { getTarget, isVSCodeOrDefaultTarget } from './promptFileAttributes.js';
let PromptDocumentSemanticTokensProvider = class PromptDocumentSemanticTokensProvider {
    constructor(promptsService) {
        this.promptsService = promptsService;
        /**
         * Debug display name for this provider.
         */
        this._debugDisplayName = 'PromptDocumentSemanticTokensProvider';
    }
    provideDocumentSemanticTokens(model, lastResultId, token) {
        const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
        if (!promptType) {
            // if the model is not a prompt, we don't provide any semantic tokens
            return undefined;
        }
        const promptAST = this.promptsService.getParsedPromptFile(model);
        if (!promptAST.body) {
            return undefined;
        }
        const target = getTarget(promptType, promptAST.header ?? model.uri);
        if (!isVSCodeOrDefaultTarget(target)) {
            // variables syntax is only support for VS Code and default targets, not for GitHub Copilot or Claude custom agents
            return undefined;
        }
        const variableReferences = promptAST.body.variableReferences;
        if (!variableReferences.length) {
            return undefined;
        }
        // Prepare semantic tokens data following the delta-encoded, 5-number tuple format:
        // [deltaLine, deltaStart, length, tokenType, tokenModifiers]
        // We expose a single token type 'variable' (index 0) and no modifiers (bitset 0).
        const data = [];
        let lastLine = 0;
        let lastChar = 0;
        // Ensure stable order (parser already produces them in order, but sort defensively)
        const ordered = [...variableReferences].sort((a, b) => a.range.startLineNumber === b.range.startLineNumber
            ? a.range.startColumn - b.range.startColumn
            : a.range.startLineNumber - b.range.startLineNumber);
        for (const ref of ordered) {
            // Also include the '#tool:' prefix for syntax highlighting purposes, even if it's not originally part of the variable name itself.
            const extraCharCount = '#tool:'.length;
            const line = ref.range.startLineNumber - 1; // zero-based
            const char = ref.range.startColumn - extraCharCount - 1; // zero-based
            const length = ref.range.endColumn - ref.range.startColumn + extraCharCount;
            const deltaLine = line - lastLine;
            const deltaChar = deltaLine === 0 ? char - lastChar : char;
            data.push(deltaLine, deltaChar, length, 0 /* variable token type index */, 0 /* no modifiers */);
            lastLine = line;
            lastChar = char;
            if (token.isCancellationRequested) {
                break; // Return what we have so far if cancelled.
            }
        }
        return { data: new Uint32Array(data) };
    }
    getLegend() {
        return { tokenTypes: ['variable'], tokenModifiers: [] };
    }
    releaseDocumentSemanticTokens(resultId) {
        // No caching/result management needed for the simple, stateless implementation.
    }
};
PromptDocumentSemanticTokensProvider = __decorate([
    __param(0, IPromptsService)
], PromptDocumentSemanticTokensProvider);
export { PromptDocumentSemanticTokensProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L2xhbmd1YWdlUHJvdmlkZXJzL3Byb21wdERvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUtoRyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFNBQVMsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRXhFLElBQU0sb0NBQW9DLEdBQTFDLE1BQU0sb0NBQW9DO0lBTWhELFlBQ2tCLGNBQWdEO1FBQS9CLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQU5sRTs7V0FFRztRQUNhLHNCQUFpQixHQUFXLHNDQUFzQyxDQUFDO0lBS25GLENBQUM7SUFFRCw2QkFBNkIsQ0FBQyxLQUFpQixFQUFFLFlBQTJCLEVBQUUsS0FBd0I7UUFDckcsTUFBTSxVQUFVLEdBQUcsMkJBQTJCLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFDdEUsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2pCLHFFQUFxRTtZQUNyRSxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3JCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxNQUFNLElBQUksS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3BFLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ3RDLG1IQUFtSDtZQUNuSCxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxrQkFBa0IsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDO1FBQzdELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNoQyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsbUZBQW1GO1FBQ25GLDZEQUE2RDtRQUM3RCxrRkFBa0Y7UUFDbEYsTUFBTSxJQUFJLEdBQWEsRUFBRSxDQUFDO1FBQzFCLElBQUksUUFBUSxHQUFHLENBQUMsQ0FBQztRQUNqQixJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFFakIsb0ZBQW9GO1FBQ3BGLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBRyxrQkFBa0IsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsZUFBZSxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsZUFBZTtZQUN6RyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxXQUFXO1lBQzNDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLGVBQWUsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBRXRELEtBQUssTUFBTSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7WUFDM0IsbUlBQW1JO1lBQ25JLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUM7WUFDdkMsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDLENBQUMsYUFBYTtZQUN6RCxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFdBQVcsR0FBRyxjQUFjLEdBQUcsQ0FBQyxDQUFDLENBQUMsYUFBYTtZQUN0RSxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFdBQVcsR0FBRyxjQUFjLENBQUM7WUFDNUUsTUFBTSxTQUFTLEdBQUcsSUFBSSxHQUFHLFFBQVEsQ0FBQztZQUNsQyxNQUFNLFNBQVMsR0FBRyxTQUFTLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDM0QsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsK0JBQStCLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDakcsUUFBUSxHQUFHLElBQUksQ0FBQztZQUNoQixRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQ2hCLElBQUksS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7Z0JBQ25DLE1BQU0sQ0FBQywyQ0FBMkM7WUFDbkQsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksV0FBVyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7SUFDeEMsQ0FBQztJQUVELFNBQVM7UUFDUixPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUMsVUFBVSxDQUFDLEVBQUUsY0FBYyxFQUFFLEVBQUUsRUFBRSxDQUFDO0lBQ3pELENBQUM7SUFFRCw2QkFBNkIsQ0FBQyxRQUE0QjtRQUN6RCxnRkFBZ0Y7SUFDakYsQ0FBQztDQUNELENBQUE7QUF2RVksb0NBQW9DO0lBTzlDLFdBQUEsZUFBZSxDQUFBO0dBUEwsb0NBQW9DLENBdUVoRCJ9