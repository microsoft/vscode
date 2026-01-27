/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CommandManager } from '../commandManager';
import { isMarkdownFile } from '../util/file';


// Copied from markdown language service
export enum DiagnosticCode {
	link_noSuchReferences = 'link.no-such-reference',
	link_noSuchHeaderInOwnFile = 'link.no-such-header-in-own-file',
	link_noSuchFile = 'link.no-such-file',
	link_noSuchHeaderInFile = 'link.no-such-header-in-file',
}


class AddToIgnoreLinksQuickFixProvider implements vscode.CodeActionProvider {

	private static readonly _addToIgnoreLinksCommandId = '_markdown.addToIgnoreLinks';

	private static readonly _metadata: vscode.CodeActionProviderMetadata = {
		providedCodeActionKinds: [
			vscode.CodeActionKind.QuickFix
		],
	};

	public static register(selector: vscode.DocumentSelector, commandManager: CommandManager): vscode.Disposable {
		const reg = vscode.languages.registerCodeActionsProvider(selector, new AddToIgnoreLinksQuickFixProvider(), AddToIgnoreLinksQuickFixProvider._metadata);
		const commandReg = commandManager.register({
			id: AddToIgnoreLinksQuickFixProvider._addToIgnoreLinksCommandId,
			execute(resource: vscode.Uri, path: string) {
				const settingId = 'validate.ignoredLinks';
				const config = vscode.workspace.getConfiguration('markdown', resource);
				const paths = new Set(config.get<string[]>(settingId, []));
				paths.add(path);
				config.update(settingId, [...paths], vscode.ConfigurationTarget.WorkspaceFolder);
			}
		});
		return vscode.Disposable.from(reg, commandReg);
	}

	provideCodeActions(document: vscode.TextDocument, _range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, _token: vscode.CancellationToken): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
		const fixes: vscode.CodeAction[] = [];

		for (const diagnostic of context.diagnostics) {
			switch (diagnostic.code) {
				case DiagnosticCode.link_noSuchReferences:
				case DiagnosticCode.link_noSuchHeaderInOwnFile:
				case DiagnosticCode.link_noSuchFile:
				case DiagnosticCode.link_noSuchHeaderInFile: {
					// eslint-disable-next-line local/code-no-any-casts
					const hrefText = (diagnostic as any).data?.hrefText;
					if (hrefText) {
						const fix = new vscode.CodeAction(
							vscode.l10n.t("Exclude '{0}' from link validation.", hrefText),
							vscode.CodeActionKind.QuickFix);

						fix.command = {
							command: AddToIgnoreLinksQuickFixProvider._addToIgnoreLinksCommandId,
							title: '',
							arguments: [document.uri, hrefText],
						};
						fixes.push(fix);
					}
					break;
				}
			}
		}

		return fixes;
	}
}

function registerMarkdownStatusItem(selector: vscode.DocumentSelector, commandManager: CommandManager): vscode.Disposable {
	const statusItem = vscode.languages.createLanguageStatusItem('markdownStatus', selector);

	const enabledSettingId = 'validate.enabled';
	const commandId = '_markdown.toggleValidation';

	const commandSub = commandManager.register({
		id: commandId,
		execute: (enabled: boolean) => {
			vscode.workspace.getConfiguration('markdown').update(enabledSettingId, enabled);
		}
	});

	const update = () => {
		const activeDoc = vscode.window.activeTextEditor?.document;
		const markdownDoc = activeDoc && isMarkdownFile(activeDoc) ? activeDoc : undefined;

		const enabled = vscode.workspace.getConfiguration('markdown', markdownDoc).get(enabledSettingId);
		if (enabled) {
			statusItem.text = vscode.l10n.t('Markdown link validation enabled');
			statusItem.command = {
				command: commandId,
				arguments: [false],
				title: vscode.l10n.t('Disable'),
				tooltip: vscode.l10n.t('Disable validation of Markdown links'),
			};
		} else {
			statusItem.text = vscode.l10n.t('Markdown link validation disabled');
			statusItem.command = {
				command: commandId,
				arguments: [true],
				title: vscode.l10n.t('Enable'),
				tooltip: vscode.l10n.t('Enable validation of Markdown links'),
			};
		}
	};
	update();

	return vscode.Disposable.from(
		statusItem,
		commandSub,
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('markdown.' + enabledSettingId)) {
				update();
			}
		}),
	);
}

export function registerDiagnosticSupport(
	selector: vscode.DocumentSelector,
	commandManager: CommandManager,
): vscode.Disposable {
	return vscode.Disposable.from(
		AddToIgnoreLinksQuickFixProvider.register(selector, commandManager),
		registerMarkdownStatusItem(selector, commandManager),
	);
}
