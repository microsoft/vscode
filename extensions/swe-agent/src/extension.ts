/**
 * Logos SWE Agent Extension
 *
 * Provides software engineering capabilities powered by D3N models:
 * - Code generation (Codex-01)
 * - Bug fixing (Debug-01)
 * - Code review (Review-01)
 * - Test generation (Test-01)
 * - And 11 more specialized models
 */

import * as vscode from 'vscode';
import { SWEAgentClient } from './sweAgent';
import { ToolRegistry } from './tools';
import { ChatViewProvider } from './chatView';
import { HistoryViewProvider } from './historyView';
import { ModelsViewProvider } from './modelsView';

let client: SWEAgentClient;
let toolRegistry: ToolRegistry;

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('SWE Agent extension activating...');

    // Initialize client
    const config = vscode.workspace.getConfiguration('sweAgent');
    const endpoint = config.get<string>('apiEndpoint') || 'http://localhost:8080';

    client = new SWEAgentClient(endpoint);
    toolRegistry = new ToolRegistry(client);

    // Register commands
    registerCommands(context);

    // Register views
    registerViews(context);

    // Register inline suggestions (if enabled)
    if (config.get<boolean>('autoSuggest')) {
        registerInlineSuggestions(context);
    }

    // Status bar
    const statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBar.text = '$(robot) SWE';
    statusBar.tooltip = 'SWE Agent - Click to open chat';
    statusBar.command = 'swe-agent.chat';
    statusBar.show();
    context.subscriptions.push(statusBar);

    console.log('SWE Agent extension activated');
}

/**
 * Extension deactivation
 */
export function deactivate() {
    console.log('SWE Agent extension deactivating...');
}

/**
 * Register all commands
 */
function registerCommands(context: vscode.ExtensionContext) {
    // Generate code
    context.subscriptions.push(
        vscode.commands.registerCommand('swe-agent.generate', async () => {
            const prompt = await vscode.window.showInputBox({
                prompt: 'What code would you like to generate?',
                placeHolder: 'e.g., Create a function to parse JSON with error handling',
            });

            if (prompt) {
                await executeWithProgress('Generating code...', async () => {
                    const result = await client.generate(prompt, getContext());
                    await insertOrShowResult(result);
                });
            }
        })
    );

    // Fix bug
    context.subscriptions.push(
        vscode.commands.registerCommand('swe-agent.fix', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const selection = editor.selection;
            const code = editor.document.getText(selection.isEmpty ? undefined : selection);

            const description = await vscode.window.showInputBox({
                prompt: 'Describe the bug (optional)',
                placeHolder: 'e.g., Function returns null instead of empty array',
            });

            await executeWithProgress('Fixing bug...', async () => {
                const result = await client.fix(code, description || '', getContext());
                await insertOrShowResult(result);
            });
        })
    );

    // Review code
    context.subscriptions.push(
        vscode.commands.registerCommand('swe-agent.review', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const code = editor.document.getText();

            await executeWithProgress('Reviewing code...', async () => {
                const result = await client.review(code, getContext());
                await showReviewPanel(result);
            });
        })
    );

    // Generate tests
    context.subscriptions.push(
        vscode.commands.registerCommand('swe-agent.test', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const code = editor.document.getText();

            await executeWithProgress('Generating tests...', async () => {
                const result = await client.generateTests(code, getContext());
                await createTestFile(result);
            });
        })
    );

    // Explain code
    context.subscriptions.push(
        vscode.commands.registerCommand('swe-agent.explain', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const selection = editor.selection;
            const code = editor.document.getText(selection.isEmpty ? undefined : selection);

            await executeWithProgress('Explaining code...', async () => {
                const result = await client.explain(code, getContext());
                await showExplanationPanel(result);
            });
        })
    );

    // Refactor code
    context.subscriptions.push(
        vscode.commands.registerCommand('swe-agent.refactor', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const selection = editor.selection;
            const code = editor.document.getText(selection.isEmpty ? undefined : selection);

            const instruction = await vscode.window.showInputBox({
                prompt: 'How would you like to refactor this code?',
                placeHolder: 'e.g., Extract the validation logic into a separate function',
            });

            if (instruction) {
                await executeWithProgress('Refactoring code...', async () => {
                    const result = await client.refactor(code, instruction, getContext());
                    await insertOrShowResult(result);
                });
            }
        })
    );

    // Generate documentation
    context.subscriptions.push(
        vscode.commands.registerCommand('swe-agent.document', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const code = editor.document.getText();

            await executeWithProgress('Generating documentation...', async () => {
                const result = await client.document(code, getContext());
                await insertOrShowResult(result);
            });
        })
    );

    // Open chat
    context.subscriptions.push(
        vscode.commands.registerCommand('swe-agent.chat', () => {
            vscode.commands.executeCommand('workbench.view.extension.swe-agent');
        })
    );
}

/**
 * Register view providers
 */
function registerViews(context: vscode.ExtensionContext) {
    // Chat view
    const chatProvider = new ChatViewProvider(context.extensionUri, client);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('swe-agent.chat', chatProvider)
    );

    // History view
    const historyProvider = new HistoryViewProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('swe-agent.history', historyProvider)
    );

    // Models view
    const modelsProvider = new ModelsViewProvider(client);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('swe-agent.models', modelsProvider)
    );
}

/**
 * Register inline completion provider
 */
function registerInlineSuggestions(context: vscode.ExtensionContext) {
    const provider: vscode.InlineCompletionItemProvider = {
        async provideInlineCompletionItems(
            document: vscode.TextDocument,
            position: vscode.Position,
            context: vscode.InlineCompletionContext,
            token: vscode.CancellationToken
        ): Promise<vscode.InlineCompletionItem[]> {
            // Get context around cursor
            const linePrefix = document.lineAt(position).text.substring(0, position.character);
            const precedingLines = getPrecedingLines(document, position, 10);

            // Skip if not enough context
            if (linePrefix.trim().length < 3) {
                return [];
            }

            try {
                const suggestion = await client.complete(
                    precedingLines + linePrefix,
                    {
                        language: document.languageId,
                        filePath: document.fileName,
                    }
                );

                if (suggestion) {
                    return [
                        new vscode.InlineCompletionItem(
                            suggestion,
                            new vscode.Range(position, position)
                        ),
                    ];
                }
            } catch (e) {
                // Silently fail for inline completions
            }

            return [];
        },
    };

    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            { pattern: '**' },
            provider
        )
    );
}

/**
 * Get current context
 */
function getContext(): Record<string, any> {
    const editor = vscode.window.activeTextEditor;

    return {
        language: editor?.document.languageId,
        filePath: editor?.document.fileName,
        workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        selection: editor?.selection
            ? editor.document.getText(editor.selection)
            : undefined,
    };
}

/**
 * Get preceding lines from document
 */
function getPrecedingLines(
    document: vscode.TextDocument,
    position: vscode.Position,
    count: number
): string {
    const startLine = Math.max(0, position.line - count);
    const range = new vscode.Range(startLine, 0, position.line, 0);
    return document.getText(range);
}

/**
 * Execute with progress indicator
 */
async function executeWithProgress<T>(
    message: string,
    task: () => Promise<T>
): Promise<T | undefined> {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: message,
            cancellable: false,
        },
        async () => {
            try {
                return await task();
            } catch (e) {
                vscode.window.showErrorMessage(`Error: ${e}`);
                return undefined;
            }
        }
    );
}

/**
 * Insert result or show in panel
 */
async function insertOrShowResult(result: string) {
    const editor = vscode.window.activeTextEditor;

    if (editor) {
        // Show diff
        const action = await vscode.window.showInformationMessage(
            'Code generated. How would you like to apply it?',
            'Insert at Cursor',
            'Replace Selection',
            'Show in Panel'
        );

        if (action === 'Insert at Cursor') {
            editor.edit((edit) => {
                edit.insert(editor.selection.active, result);
            });
        } else if (action === 'Replace Selection') {
            editor.edit((edit) => {
                edit.replace(editor.selection, result);
            });
        } else {
            await showResultPanel(result);
        }
    } else {
        await showResultPanel(result);
    }
}

/**
 * Show result in a new panel
 */
async function showResultPanel(content: string) {
    const doc = await vscode.workspace.openTextDocument({
        content,
        language: detectLanguage(content),
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
}

/**
 * Show review results
 */
async function showReviewPanel(review: string) {
    const panel = vscode.window.createWebviewPanel(
        'sweReview',
        'Code Review',
        vscode.ViewColumn.Beside,
        {}
    );

    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; }
                h1 { color: var(--vscode-editor-foreground); }
                .issue { margin: 10px 0; padding: 10px; border-left: 3px solid; }
                .critical { border-color: #f44336; }
                .major { border-color: #ff9800; }
                .minor { border-color: #2196f3; }
            </style>
        </head>
        <body>
            <h1>Code Review Results</h1>
            <div>${formatReview(review)}</div>
        </body>
        </html>
    `;
}

/**
 * Show explanation panel
 */
async function showExplanationPanel(explanation: string) {
    const panel = vscode.window.createWebviewPanel(
        'sweExplanation',
        'Code Explanation',
        vscode.ViewColumn.Beside,
        {}
    );

    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; }
                h1 { color: var(--vscode-editor-foreground); }
                pre { background: var(--vscode-editor-background); padding: 10px; }
            </style>
        </head>
        <body>
            <h1>Code Explanation</h1>
            <div>${formatExplanation(explanation)}</div>
        </body>
        </html>
    `;
}

/**
 * Create test file from generated tests
 */
async function createTestFile(tests: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const filePath = editor.document.fileName;
    const testPath = filePath.replace(/(\.\w+)$/, '.test$1');

    const uri = vscode.Uri.file(testPath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(tests));

    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
}

/**
 * Detect language from content
 */
function detectLanguage(content: string): string {
    if (content.includes('def ') || content.includes('import ')) {
        return 'python';
    }
    if (content.includes('function ') || content.includes('const ')) {
        return 'typescript';
    }
    if (content.includes('func ') || content.includes('package ')) {
        return 'go';
    }
    return 'plaintext';
}

/**
 * Format review for HTML display
 */
function formatReview(review: string): string {
    // Simple markdown-like formatting
    return review
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
}

/**
 * Format explanation for HTML display
 */
function formatExplanation(explanation: string): string {
    return explanation
        .replace(/\n/g, '<br>')
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
}



