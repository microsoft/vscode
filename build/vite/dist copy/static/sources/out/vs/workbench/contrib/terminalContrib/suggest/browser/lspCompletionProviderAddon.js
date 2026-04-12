/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { mapLspKindToTerminalKind, TerminalCompletionItemKind } from './terminalCompletionItem.js';
import { Position } from '../../../../../editor/common/core/position.js';
export class LspCompletionProviderAddon extends Disposable {
    constructor(provider, textVirtualModel, lspTerminalModelContentProvider) {
        super();
        this.id = 'lsp';
        this.isBuiltin = true;
        this.shellTypes = ["python" /* GeneralShellType.Python */];
        this._provider = provider;
        this._textVirtualModel = textVirtualModel;
        this._lspTerminalModelContentProvider = lspTerminalModelContentProvider;
        this.triggerCharacters = provider.triggerCharacters ? [...provider.triggerCharacters, ' ', '('] : [' ', '('];
    }
    activate(terminal) {
        // console.log('activate');
    }
    async provideCompletions(value, cursorPosition, token) {
        // Apply edit for non-executed current commandline --> Pretend we are typing in the real-document.
        this._lspTerminalModelContentProvider.trackPromptInputToVirtualFile(value);
        const textBeforeCursor = value.substring(0, cursorPosition);
        const lines = textBeforeCursor.split('\n');
        const column = lines[lines.length - 1].length + 1;
        // Get line from virtualDocument, not from terminal
        const lineNum = this._textVirtualModel.object.textEditorModel.getLineCount();
        const positionVirtualDocument = new Position(lineNum, column);
        const completions = [];
        if (this._provider && this._provider._debugDisplayName !== 'wordbasedCompletions') {
            const result = await this._provider.provideCompletionItems(this._textVirtualModel.object.textEditorModel, positionVirtualDocument, { triggerKind: 1 /* CompletionTriggerKind.TriggerCharacter */ }, token);
            for (const item of (result?.suggestions || [])) {
                // TODO: Support more terminalCompletionItemKind for [different LSP providers](https://github.com/microsoft/vscode/issues/249479)
                const convertedKind = item.kind ? mapLspKindToTerminalKind(item.kind) : TerminalCompletionItemKind.Method;
                const completionItemTemp = createCompletionItemPython(cursorPosition, textBeforeCursor, convertedKind, 'lspCompletionItem', undefined);
                const terminalCompletion = {
                    label: item.label,
                    provider: `lsp:${item.extensionId?.value}`,
                    detail: item.detail,
                    documentation: item.documentation,
                    kind: convertedKind,
                    replacementRange: completionItemTemp.replacementRange,
                };
                // Store unresolved item and provider for lazy resolution if needed
                if (this._provider.resolveCompletionItem && (!item.detail || !item.documentation)) {
                    terminalCompletion._unresolvedItem = item;
                    terminalCompletion._resolveProvider = this._provider;
                }
                completions.push(terminalCompletion);
            }
        }
        return completions;
    }
}
export function createCompletionItemPython(cursorPosition, prefix, kind, label, detail) {
    const lastWord = getLastWord(prefix);
    return {
        label,
        detail: detail ?? '',
        replacementRange: [cursorPosition - lastWord.length, cursorPosition],
        kind: kind ?? TerminalCompletionItemKind.Method
    };
}
function getLastWord(prefix) {
    if (prefix.endsWith(' ')) {
        return '';
    }
    if (prefix.endsWith('.')) {
        return '';
    }
    const lastSpaceIndex = prefix.lastIndexOf(' ');
    const lastDotIndex = prefix.lastIndexOf('.');
    const lastParenIndex = prefix.lastIndexOf('(');
    // Get the maximum index (most recent delimiter)
    const lastDelimiterIndex = Math.max(lastSpaceIndex, lastDotIndex, lastParenIndex);
    // If no delimiter found, return the entire prefix
    if (lastDelimiterIndex === -1) {
        return prefix;
    }
    // Return the substring after the last delimiter
    return prefix.substring(lastDelimiterIndex + 1);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibHNwQ29tcGxldGlvblByb3ZpZGVyQWRkb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvc3VnZ2VzdC9icm93c2VyL2xzcENvbXBsZXRpb25Qcm92aWRlckFkZG9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxVQUFVLEVBQWMsTUFBTSx5Q0FBeUMsQ0FBQztBQUdqRixPQUFPLEVBQXVCLHdCQUF3QixFQUFFLDBCQUEwQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFeEgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBTXpFLE1BQU0sT0FBTywwQkFBMkIsU0FBUSxVQUFVO0lBU3pELFlBQ0MsUUFBZ0MsRUFDaEMsZ0JBQXNELEVBQ3RELCtCQUFnRTtRQUVoRSxLQUFLLEVBQUUsQ0FBQztRQWJBLE9BQUUsR0FBRyxLQUFLLENBQUM7UUFDWCxjQUFTLEdBQUcsSUFBSSxDQUFDO1FBS2pCLGVBQVUsR0FBd0Isd0NBQXlCLENBQUM7UUFRcEUsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7UUFDMUIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLGdCQUFnQixDQUFDO1FBQzFDLElBQUksQ0FBQyxnQ0FBZ0MsR0FBRywrQkFBK0IsQ0FBQztRQUN4RSxJQUFJLENBQUMsaUJBQWlCLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDOUcsQ0FBQztJQUVELFFBQVEsQ0FBQyxRQUFrQjtRQUMxQiwyQkFBMkI7SUFDNUIsQ0FBQztJQUVELEtBQUss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