/**
 * ILN (Informatique Language Nexus) - Revolutionary Language Unification Extension
 * This extension demonstrates how ILN transforms multi-language development.
 * Author: Anzize Daouda - Project: https://github.com/Tryboy869/iln-nexus
 */
import * as vscode from 'vscode';

const ILN_REPO_URL = "https://github.com/Tryboy869/iln-nexus";

interface ILNEssence { name: string; origin: string; pattern: RegExp; hover: string; }
const ILN_ESSENCES: ILNEssence[] = [
    { name: 'chan!', origin: 'GO Concurrency', pattern: /chan!\s*\(\s*['"][^'"]*['"]\s*,\s*[^)]+\)/g, hover: 'ILN GO Essence: Concurrent channel processing.' },
    { name: 'own!', origin: 'RUST Ownership', pattern: /own!\s*\(\s*['"][^'"]*['"]\s*,\s*[^)]+\)/g, hover: 'ILN RUST Essence: Memory-safe ownership.' },
    { name: 'event!', origin: 'JavaScript Reactivity', pattern: /event!\s*\(\s*['"][^'"]*['"]\s*,\s*[^)]+\)/g, hover: 'ILN JS Essence: Reactive event handling.' },
    { name: 'ml!', origin: 'Python Machine Learning', pattern: /ml!\s*\(\s*['"][^'"]*['"]\s*,\s*[^)]+\)/g, hover: 'ILN ML Essence: AI/ML processing.' }
];

function createILNCompletion(name: string, snippet: string, description: string): vscode.CompletionItem {
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
    item.insertText = new vscode.SnippetString(snippet);
    item.detail = `ILN Essence - ${description}`;
    return item;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('🌌 ILN Extension is now active!');
    const hoverProvider = vscode.languages.registerHoverProvider(
        ['python', 'javascript', 'typescript', 'java', 'cpp', 'rust', 'go'], {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position, /\w+!\([^)]*\)/);
            if (!range) return null;
            const text = document.getText(range);
            const essence = ILN_ESSENCES.find(e => text.match(e.pattern));
            if (essence) {
                return new vscode.Hover(new vscode.MarkdownString(`### 🌌 ILN ${essence.origin} Essence\n\n${essence.hover}\n\n**[Explore ILN Project](${ILN_REPO_URL})**`), range);
            }
            return null;
        }
    });

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        ['python', 'javascript', 'typescript', 'java', 'cpp', 'rust', 'go'], {
        provideCompletionItems(document, position) {
            return ILN_ESSENCES.map(e => createILNCompletion(e.name, `${e.name.slice(0,-1)}('name', handler)`, e.origin));
        }
    }, '!');
    context.subscriptions.push(hoverProvider, completionProvider);
    vscode.window.showInformationMessage('ILN - Revolutionary Language Unification is active!', 'Learn More').then(selection => {
        if (selection === 'Learn More') vscode.env.openExternal(vscode.Uri.parse(ILN_REPO_URL));
    });
}
export function deactivate() {}