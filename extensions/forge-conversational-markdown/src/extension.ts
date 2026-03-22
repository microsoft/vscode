import * as vscode from 'vscode';
import { ConversationalMarkdownEditorProvider } from './editor/ConversationalMarkdownEditorProvider';
import { getActiveForgeMdSession } from './editor/sessionRegistry';

export function activate(context: vscode.ExtensionContext): void {
	const provider = new ConversationalMarkdownEditorProvider(context);
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			ConversationalMarkdownEditorProvider.viewType,
			provider,
			{
				webviewOptions: { retainContextWhenHidden: true },
			},
		),
		vscode.commands.registerCommand('forgeMarkdown.openConversationalPreview', async () => {
			const te = vscode.window.activeTextEditor;
			if (!te || te.document.languageId !== 'markdown') {
				await vscode.window.showWarningMessage(vscode.l10n.t('openMarkdownFirst'));
				return;
			}
			await vscode.commands.executeCommand(
				'vscode.openWith',
				te.document.uri,
				ConversationalMarkdownEditorProvider.viewType,
				vscode.ViewColumn.Active,
			);
		}),
		vscode.commands.registerCommand('forgeMarkdown.showSource', () => {
			void getActiveForgeMdSession()?.showSource();
		}),
		vscode.commands.registerCommand('forgeMarkdown.refreshPreview', () => {
			getActiveForgeMdSession()?.refresh();
		}),
		vscode.commands.registerCommand('forgeMarkdown.speEngineer', async (uri?: vscode.Uri) => {
			const docUri = uri ?? getActiveForgeMdSession()?.documentUri;
			if (!docUri) {
				await vscode.window.showWarningMessage(vscode.l10n.t('openMarkdownFirst'));
				return;
			}
			// Extend: open Spe Engineer / agent UI for `docUri`.
		}),
		vscode.commands.registerCommand('forgeMarkdown.revealNextOpenThread', () => {
			getActiveForgeMdSession()?.revealNextOpenThread();
		}),
	);
}

export function deactivate(): void { }
