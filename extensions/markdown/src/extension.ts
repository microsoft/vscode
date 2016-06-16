/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from "vscode";

const hljs = require('highlight.js');
const mdnh = require('markdown-it-named-headers');
const md = require('markdown-it')({
	html: true,
	highlight: function (str, lang) {
		if (lang && hljs.getLanguage(lang)) {
			try {
				return `<pre class="hljs"><code><div>${hljs.highlight(lang, str, true).value}</div></code></pre>`;
			} catch (error) { }
		}
		return `<pre class="hljs"><code><div>${md.utils.escapeHtml(str)}</div></code></pre>`;
	}
}).use(mdnh, {});

export function activate(context: ExtensionContext) {
	let provider = new MDDocumentContentProvider(context);
	let registration = vscode.workspace.registerTextDocumentContentProvider('markdown', provider);

	let d1 = vscode.commands.registerCommand('extension.previewMarkdown', () => openPreview());
	let d2 = vscode.commands.registerCommand('extension.previewMarkdownSide', () => openPreview(true));

	context.subscriptions.push(d1, d2, registration);

	vscode.workspace.onDidSaveTextDocument(document => {
		if (isMarkdownFile(document)) {
			const uri = getMarkdownUri(document);
			provider.update(uri);
		}
	});

	vscode.workspace.onDidChangeTextDocument(event => {
		if (isMarkdownFile(event.document)) {
			const uri = getMarkdownUri(event.document);
			provider.update(uri);

		}
	});

	vscode.workspace.onDidChangeConfiguration(() => {
		vscode.workspace.textDocuments.forEach((document) => {
			if (isMarkdownFile) {
				provider.update(document.uri);
			}
		});
	});
}

function isMarkdownFile(document: vscode.TextDocument) {
	return document.languageId === 'markdown'
		&& document.uri.scheme !== 'markdown'; // prevent processing of own documents
}

function getMarkdownUri(document: vscode.TextDocument) {
	return document.uri.with({ scheme: 'markdown', path: document.uri.path + '.rendered', query: document.uri.toString() });
}

function openPreview(sideBySide?: boolean): void {
	const activeEditor = vscode.window.activeTextEditor;
	if (!activeEditor) {
		vscode.commands.executeCommand('workbench.action.navigateBack');
		return;
	}

	let markdownPreviewUri = getMarkdownUri(activeEditor.document);
	vscode.commands.executeCommand('vscode.previewHtml',
		markdownPreviewUri,
		getViewColumn(sideBySide),
		`Preview '${path.basename(activeEditor.document.fileName)}'`);
}

function getViewColumn(sideBySide): ViewColumn {
	const active = vscode.window.activeTextEditor;
	if (!active) {
		return ViewColumn.One;
	}

	if (!sideBySide) {
		return active.viewColumn;
	}

	switch (active.viewColumn) {
		case ViewColumn.One:
			return ViewColumn.Two;
		case ViewColumn.Two:
			return ViewColumn.Three;
	}

	return active.viewColumn;
}


class MDDocumentContentProvider implements TextDocumentContentProvider {
	private _context: ExtensionContext;
	private _onDidChange = new EventEmitter<Uri>();
	private _waiting : boolean;

	constructor(context: ExtensionContext) {
		this._context = context;
		this._waiting = false;
	}

	private getMediaPath(mediaFile) {
		return this._context.asAbsolutePath(path.join('media', mediaFile));
	}

	private fixHref(resource: Uri, href: string) {
		if (href) {
			// Return early if href is already a URL
			if (Uri.parse(href).scheme) {
				return href;
			}
			// Otherwise convert to a file URI by joining the href with the resource location
			return Uri.file(path.join(path.dirname(resource.fsPath), href)).toString();
		}
		return href;
	}

	private computeCustomStyleSheetIncludes(uri: Uri): string[] {
		const styles = vscode.workspace.getConfiguration('markdown')['styles'];
		if (styles && Array.isArray(styles)) {
			return styles.map((style) => {
				return `<link rel="stylesheet" href="${this.fixHref(uri, style)}" type="text/css" media="screen">`;
			});
		}
		return [];
	}

	public provideTextDocumentContent(uri: Uri): Thenable<string> {

		return vscode.workspace.openTextDocument(Uri.parse(uri.query)).then(document => {
			const head = [].concat(
				'<!DOCTYPE html>',
				'<html>',
				'<head>',
				'<meta http-equiv="Content-type" content="text/html;charset=UTF-8">',
				`<link rel="stylesheet" type="text/css" href="${this.getMediaPath('markdown.css')}" >`,
				`<link rel="stylesheet" type="text/css" href="${this.getMediaPath('tomorrow.css')}" >`,
				this.computeCustomStyleSheetIncludes(uri),
				'</head>',
				'<body>'
			).join('\n');

			const body = md.render(document.getText());

			const tail = [
				'</body>',
				'</html>'
			].join('\n');

			return head + body + tail;
		});
	}

	get onDidChange(): Event<Uri> {
		return this._onDidChange.event;
	}

	public update(uri: Uri) {
		if (!this._waiting) {
			this._waiting = true;
			setTimeout(() => {
				this._waiting = false;
				this._onDidChange.fire(uri);
			}, 300);
		}
	}
}