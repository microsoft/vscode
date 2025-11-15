"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const geminiService_1 = require("./services/geminiService");
const chatViewProvider_1 = require("./views/chatViewProvider");
function activate(context) {
    console.log('AI Coding Agent is now active!');
    // Initialize Gemini service
    const geminiService = new geminiService_1.GeminiService();
    // Register chat view provider
    const chatViewProvider = new chatViewProvider_1.ChatViewProvider(context.extensionUri, geminiService);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('aiCodingAgent.chatView', chatViewProvider));
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('aiCodingAgent.explainCode', async () => {
        await handleExplainCode(geminiService);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('aiCodingAgent.generateCode', async () => {
        await handleGenerateCode(geminiService);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('aiCodingAgent.fixCode', async () => {
        await handleFixCode(geminiService);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('aiCodingAgent.refactorCode', async () => {
        await handleRefactorCode(geminiService);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('aiCodingAgent.addComments', async () => {
        await handleAddComments(geminiService);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('aiCodingAgent.chat', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.ai-coding-agent');
    }));
}
async function handleExplainCode(geminiService) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    if (!selectedText) {
        vscode.window.showErrorMessage('Please select some code to explain');
        return;
    }
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'AI is analyzing your code...',
        cancellable: false
    }, async () => {
        try {
            const explanation = await geminiService.explainCode(selectedText);
            // Show explanation in a new document
            const doc = await vscode.workspace.openTextDocument({
                content: explanation,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });
}
async function handleGenerateCode(geminiService) {
    const prompt = await vscode.window.showInputBox({
        prompt: 'Describe what code you want to generate',
        placeHolder: 'e.g., Create a function to sort an array of objects by name'
    });
    if (!prompt) {
        return;
    }
    const editor = vscode.window.activeTextEditor;
    const language = editor?.document.languageId || 'typescript';
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'AI is generating code...',
        cancellable: false
    }, async () => {
        try {
            const code = await geminiService.generateCode(prompt, language);
            if (editor) {
                const position = editor.selection.active;
                await editor.edit(editBuilder => {
                    editBuilder.insert(position, code);
                });
            }
            else {
                const doc = await vscode.workspace.openTextDocument({
                    content: code,
                    language: language
                });
                await vscode.window.showTextDocument(doc);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });
}
async function handleFixCode(geminiService) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    if (!selectedText) {
        vscode.window.showErrorMessage('Please select some code to fix');
        return;
    }
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'AI is fixing your code...',
        cancellable: false
    }, async () => {
        try {
            const fixedCode = await geminiService.fixCode(selectedText, editor.document.languageId);
            await editor.edit(editBuilder => {
                editBuilder.replace(selection, fixedCode);
            });
            vscode.window.showInformationMessage('Code fixed successfully!');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });
}
async function handleRefactorCode(geminiService) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    if (!selectedText) {
        vscode.window.showErrorMessage('Please select some code to refactor');
        return;
    }
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'AI is refactoring your code...',
        cancellable: false
    }, async () => {
        try {
            const refactoredCode = await geminiService.refactorCode(selectedText, editor.document.languageId);
            await editor.edit(editBuilder => {
                editBuilder.replace(selection, refactoredCode);
            });
            vscode.window.showInformationMessage('Code refactored successfully!');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });
}
async function handleAddComments(geminiService) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    if (!selectedText) {
        vscode.window.showErrorMessage('Please select some code to add comments to');
        return;
    }
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'AI is adding comments...',
        cancellable: false
    }, async () => {
        try {
            const commentedCode = await geminiService.addComments(selectedText, editor.document.languageId);
            await editor.edit(editBuilder => {
                editBuilder.replace(selection, commentedCode);
            });
            vscode.window.showInformationMessage('Comments added successfully!');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });
}
function deactivate() { }
//# sourceMappingURL=extension.js.map