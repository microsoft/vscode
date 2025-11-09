import * as vscode from 'vscode';
import { GeminiService } from './services/geminiService';
import { ChatViewProvider } from './views/chatViewProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('AI Coding Agent is now active!');

	// Initialize Gemini service
	const geminiService = new GeminiService();

	// Register chat view provider
	const chatViewProvider = new ChatViewProvider(context.extensionUri, geminiService);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('aiCodingAgent.chatView', chatViewProvider)
	);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('aiCodingAgent.explainCode', async () => {
			await handleExplainCode(geminiService);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('aiCodingAgent.generateCode', async () => {
			await handleGenerateCode(geminiService);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('aiCodingAgent.fixCode', async () => {
			await handleFixCode(geminiService);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('aiCodingAgent.refactorCode', async () => {
			await handleRefactorCode(geminiService);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('aiCodingAgent.addComments', async () => {
			await handleAddComments(geminiService);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('aiCodingAgent.chat', async () => {
			await vscode.commands.executeCommand('workbench.view.extension.ai-coding-agent');
		})
	);
}

async function handleExplainCode(geminiService: GeminiService) {
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
		} catch (error) {
			vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	});
}

async function handleGenerateCode(geminiService: GeminiService) {
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
			} else {
				const doc = await vscode.workspace.openTextDocument({
					content: code,
					language: language
				});
				await vscode.window.showTextDocument(doc);
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	});
}

async function handleFixCode(geminiService: GeminiService) {
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
		} catch (error) {
			vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	});
}

async function handleRefactorCode(geminiService: GeminiService) {
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
		} catch (error) {
			vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	});
}

async function handleAddComments(geminiService: GeminiService) {
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
		} catch (error) {
			vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	});
}

export function deactivate() {}
