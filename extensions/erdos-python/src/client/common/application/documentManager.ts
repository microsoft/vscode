// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { injectable } from 'inversify';
import {
    DecorationRenderOptions,
    Event,
    TextDocument,
    TextDocumentChangeEvent,
    TextDocumentShowOptions,
    TextEditor,
    TextEditorDecorationType,
    TextEditorOptionsChangeEvent,
    TextEditorSelectionChangeEvent,
    TextEditorViewColumnChangeEvent,
    Uri,
    ViewColumn,
    window,
    workspace,
    WorkspaceEdit,
} from 'vscode';

import { IDocumentManager } from './types';

@injectable()
export class DocumentManager implements IDocumentManager {
    public get textDocuments(): readonly TextDocument[] {
        return workspace.textDocuments;
    }
    public get activeTextEditor(): TextEditor | undefined {
        return window.activeTextEditor;
    }
    public get visibleTextEditors(): readonly TextEditor[] {
        return window.visibleTextEditors;
    }
    public get onDidChangeActiveTextEditor(): Event<TextEditor | undefined> {
        return window.onDidChangeActiveTextEditor;
    }
    public get onDidChangeTextDocument(): Event<TextDocumentChangeEvent> {
        return workspace.onDidChangeTextDocument;
    }
    public get onDidChangeVisibleTextEditors(): Event<readonly TextEditor[]> {
        return window.onDidChangeVisibleTextEditors;
    }
    public get onDidChangeTextEditorSelection(): Event<TextEditorSelectionChangeEvent> {
        return window.onDidChangeTextEditorSelection;
    }
    public get onDidChangeTextEditorOptions(): Event<TextEditorOptionsChangeEvent> {
        return window.onDidChangeTextEditorOptions;
    }
    public get onDidChangeTextEditorViewColumn(): Event<TextEditorViewColumnChangeEvent> {
        return window.onDidChangeTextEditorViewColumn;
    }
    public get onDidOpenTextDocument(): Event<TextDocument> {
        return workspace.onDidOpenTextDocument;
    }
    public get onDidCloseTextDocument(): Event<TextDocument> {
        return workspace.onDidCloseTextDocument;
    }
    public get onDidSaveTextDocument(): Event<TextDocument> {
        return workspace.onDidSaveTextDocument;
    }
    public showTextDocument(document: TextDocument, column?: ViewColumn, preserveFocus?: boolean): Thenable<TextEditor>;
    public showTextDocument(document: TextDocument | Uri, options?: TextDocumentShowOptions): Thenable<TextEditor>;
    public showTextDocument(uri: any, options?: any, preserveFocus?: any): Thenable<TextEditor> {
        return window.showTextDocument(uri, options, preserveFocus);
    }

    public openTextDocument(uri: Uri): Thenable<TextDocument>;
    public openTextDocument(fileName: string): Thenable<TextDocument>;
    public openTextDocument(options?: { language?: string; content?: string }): Thenable<TextDocument>;
    public openTextDocument(arg?: any): Thenable<TextDocument> {
        return workspace.openTextDocument(arg);
    }
    public applyEdit(edit: WorkspaceEdit): Thenable<boolean> {
        return workspace.applyEdit(edit);
    }
    public createTextEditorDecorationType(options: DecorationRenderOptions): TextEditorDecorationType {
        return window.createTextEditorDecorationType(options);
    }
}
