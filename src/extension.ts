// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {PythonCompletionItemProvider} from './providers/completionProvider';
import {PythonSignatureHelpProvider} from './providers/signatureProvider';
import {PythonHoverProvider} from './providers/hoverProvider';
import {PythonDefinitionProvider} from './providers/definitionProvider';
import {PythonReferenceProvider} from './providers/referenceProvider';
import {PythonRenameProvider} from './providers/renameProvider';

const PYTHON: vscode.DocumentFilter = { language: 'python', scheme: 'file' }
 
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    var rootDir = context.asAbsolutePath(".");

    context.subscriptions.push(vscode.languages.registerRenameProvider(PYTHON, new PythonRenameProvider(rootDir)));
    context.subscriptions.push(vscode.languages.registerHoverProvider(PYTHON, new PythonHoverProvider(rootDir)));
    context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(PYTHON, new PythonSignatureHelpProvider(rootDir), '('));
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(PYTHON, new PythonDefinitionProvider(rootDir)));
    context.subscriptions.push(vscode.languages.registerReferenceProvider(PYTHON, new PythonReferenceProvider(rootDir)));
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(PYTHON, new PythonCompletionItemProvider(rootDir), '.'));
}

// this method is called when your extension is deactivated
export function deactivate() {
}