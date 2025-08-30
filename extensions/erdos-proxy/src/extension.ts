/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as erdos from 'erdos';
import { ErdosProxy } from './erdosProxy';

export type ProxyServerStyles = { readonly [key: string]: string | number };

export const log = vscode.window.createOutputChannel('HTML Proxy Server', { log: true });

export function activate(context: vscode.ExtensionContext) {
	const erdosProxy = new ErdosProxy(context);

	context.subscriptions.push(log);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'erdosProxy.startHelpProxyServer',
			async (targetOrigin: string) => await erdosProxy.startHelpProxyServer(targetOrigin)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'erdosProxy.startHtmlProxyServer',
			async (targetPath: string) => await erdosProxy.startHtmlProxyServer(targetPath)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'erdosProxy.startHttpProxyServer',
			async (targetOrigin: string) => await erdosProxy.startHttpProxyServer(targetOrigin)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'erdosProxy.startPendingProxyServer',
			async () => await erdosProxy.startPendingHttpProxyServer()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'erdosProxy.stopProxyServer',
			(targetOrigin: string) => erdosProxy.stopProxyServer(targetOrigin)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'erdosProxy.setHelpProxyServerStyles',
			(styles: ProxyServerStyles) => erdosProxy.setHelpProxyServerStyles(styles)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'erdosProxy.showHtmlPreview',
			(path: vscode.Uri) => {
				erdos.window.previewHtml(path.toString());
			})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'erdosProxy.openBrowserPreview',
			async (path: vscode.Uri) => {
				let targetPath = path;

				if (!targetPath) {
					const activeEditor = vscode.window.activeTextEditor;
					if (activeEditor) {
						targetPath = activeEditor.document.uri;

						const extension = targetPath.fsPath.split('.').pop()?.toLowerCase();
						if (extension !== 'html' && extension !== 'htm') {
							vscode.window.showErrorMessage(vscode.l10n.t('The file {0} does not appear to be an HTML file, so it will not be opened in the browser.', targetPath.fsPath));
							return;
						}
					} else {
						vscode.window.showErrorMessage(vscode.l10n.t('No selected file to open in the browser. Open an HTML file in an editor before running this command.'));
						return;
					}
				}

				if (vscode.env.uiKind === vscode.UIKind.Web || vscode.env.remoteName) {
					const proxyUri = await erdosProxy.startHtmlProxyServer(path.toString());

					targetPath = await vscode.env.asExternalUri(vscode.Uri.parse(proxyUri));
				}

				vscode.env.openExternal(targetPath);
			})
	);

	context.subscriptions.push(erdosProxy);
}







