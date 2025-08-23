// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
    CodeAction,
    CodeActionContext,
    CodeActionKind,
    CodeActionProvider,
    Diagnostic,
    Range,
    TextDocument,
    WorkspaceEdit,
} from 'vscode';

/**
 * Provides code actions for launch.json
 */
export class LaunchJsonCodeActionProvider implements CodeActionProvider {
    public provideCodeActions(document: TextDocument, _: Range, context: CodeActionContext): CodeAction[] {
        return context.diagnostics
            .filter((diagnostic) => diagnostic.message === 'Incorrect type. Expected "string".')
            .map((diagnostic) => this.createFix(document, diagnostic));
    }

    // eslint-disable-next-line class-methods-use-this
    private createFix(document: TextDocument, diagnostic: Diagnostic): CodeAction {
        const finalText = `"${document.getText(diagnostic.range)}"`;
        const fix = new CodeAction(`Convert to ${finalText}`, CodeActionKind.QuickFix);
        fix.edit = new WorkspaceEdit();
        fix.edit.replace(document.uri, diagnostic.range, finalText);
        return fix;
    }
}
