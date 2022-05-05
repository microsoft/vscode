/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as URI from 'vscode-uri';

export function registerImagePreview() {


	function allImages(document: vscode.TextDocument): [vscode.Range, string][] {
		const result: [vscode.Range, string][] = [];
		const r = /!\[(.+)\]\((.+)\)/g;
		const text = document.getText();
		let m: RegExpMatchArray | null;
		while (m = r.exec(text)) {
			const start = document.positionAt(m.index!);
			const end = document.positionAt(m.index! + m[0].length);
			result.push([new vscode.Range(start, end), m[2]]);
		}
		return result;
	}

	const map = new Map<vscode.TextEditor, vscode.Disposable>();

	function renderImagesInline(e: vscode.TextEditor) {
		const entries = allImages(e.document);
		const insets: vscode.WebviewEditorInset[] = [];
		const webviewOptions: vscode.WebviewOptions = {
			localResourceRoots: vscode.workspace.workspaceFolders?.map(x => x.uri) ?? [URI.Utils.dirname(e.document.uri)],
		};
		for (let [range, src] of entries) {
			const inset = vscode.window.createWebviewTextEditorInset(e, range.start.line - 1, 5, webviewOptions);
			if (src.startsWith('.')) {
				let uri = vscode.Uri.joinPath(e.document.uri, '..', src);
				uri = inset.webview.asWebviewUri(uri);
				src = uri.toString();
			}
			inset.webview.html = `
			<html>
			<head>
				<meta http-equiv="Content-Security-Policy" content="img-src data: https: ${inset.webview.cspSource};">
				<base href="${inset.webview.asWebviewUri(e.document.uri)}">
			</head>
			<body>
				<img src="${src.replace(/"/g, '&quot;')} " />
			</body>
			<html>`;
			insets.push(inset);
		}
		map.get(e)?.dispose();
		map.set(e, vscode.Disposable.from(...insets));
	}

	const d1 = vscode.workspace.onDidChangeTextDocument(e => {
		for (let editor of vscode.window.visibleTextEditors) {
			if (editor.document === e.document && vscode.languages.match('markdown', e.document)) {
				renderImagesInline(editor);
			}
		}
	});

	const d2 = vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor && vscode.languages.match('markdown', editor.document)) {
			renderImagesInline(editor);
		}
	});

	if (vscode.window.activeTextEditor && vscode.languages.match('markdown', vscode.window.activeTextEditor.document)) {
		renderImagesInline(vscode.window.activeTextEditor);
	}

	return vscode.Disposable.from(d1, d2);
}
