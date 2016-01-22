// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {PythonCompletionItemProvider} from './providers/completionProvider';
import {PythonSignatureHelpProvider} from './providers/signatureProvider';
import {PythonHoverProvider} from './providers/hoverProvider';
import {PythonDefinitionProvider} from './providers/definitionProvider';
import {PythonReferenceProvider} from './providers/referenceProvider';
import {PythonRenameProvider} from './providers/renameProvider';
import {PythonAutoPep8FormattingEditProvider} from './providers/autoPep8FormatProvider';
import * as sortImports from './sortImports';
//import * as activateLanguageClient from './client/extension';
import * as languageClient from './languageClient';
import * as path from 'path';
const PYTHON: vscode.DocumentFilter = { language: 'python', scheme: 'file' }
 
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    sortImports.activate(context);
 
    var rootDir = context.asAbsolutePath(".");

    languageClient.activate(context);
    //activateLanguageClient.activate(context);
    
    context.subscriptions.push(vscode.languages.registerRenameProvider(PYTHON, new PythonRenameProvider(rootDir)));
    context.subscriptions.push(vscode.languages.registerHoverProvider(PYTHON, new PythonHoverProvider(rootDir)));
    context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(PYTHON, new PythonSignatureHelpProvider(rootDir), '('));
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(PYTHON, new PythonDefinitionProvider(rootDir)));
    context.subscriptions.push(vscode.languages.registerReferenceProvider(PYTHON, new PythonReferenceProvider(rootDir)));
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(PYTHON, new PythonCompletionItemProvider(rootDir), '.'));
    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(PYTHON, new PythonAutoPep8FormattingEditProvider()))
}

// this method is called when your extension is deactivated
export function deactivate() {
}