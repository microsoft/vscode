/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export const VSCODE_LSP_TERMINAL_PROMPT_TRACKER = 'vscode_lsp_terminal_prompt_tracker= {}\n';
export const terminalLspSupportedLanguages = new Set([
    {
        shellType: 'python',
        languageId: 'python',
        extension: 'py'
    }
]);
export function getTerminalLspSupportedLanguageObj(shellType) {
    for (const supportedLanguage of terminalLspSupportedLanguages) {
        if (supportedLanguage.shellType === shellType) {
            return supportedLanguage;
        }
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibHNwVGVybWluYWxVdGlsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3N1Z2dlc3QvYnJvd3Nlci9sc3BUZXJtaW5hbFV0aWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsTUFBTSxDQUFDLE1BQU0sa0NBQWtDLEdBQUcsMENBQTBDLENBQUM7QUFFN0YsTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQUcsSUFBSSxHQUFHLENBQStEO0lBQ2xIO1FBQ0MsU0FBUyxFQUFFLFFBQVE7UUFDbkIsVUFBVSxFQUFFLFFBQVE7UUFDcEIsU0FBUyxFQUFFLElBQUk7S0FDZjtDQUNELENBQUMsQ0FBQztBQUVILE1BQU0sVUFBVSxrQ0FBa0MsQ0FBQyxTQUFpQjtJQUNuRSxLQUFLLE1BQU0saUJBQWlCLElBQUksNkJBQTZCLEVBQUUsQ0FBQztRQUMvRCxJQUFJLGlCQUFpQixDQUFDLFNBQVMsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUMvQyxPQUFPLGlCQUFpQixDQUFDO1FBQzFCLENBQUM7SUFDRixDQUFDO0lBQ0QsT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQyJ9