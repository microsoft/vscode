/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';


interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

var telemetryReporter: TelemetryReporter;

export function activate(context: ExtensionContext) {

	let packageInfo = getPackageInfo(context);
	telemetryReporter = packageInfo && new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);

	let provider = new MDDocumentContentProvider(context);
	let registration = vscode.workspace.registerTextDocumentContentProvider('markdown', provider);

	let d1 = vscode.commands.registerCommand('markdown.showPreview', showPreview);
	let d2 = vscode.commands.registerCommand('markdown.showPreviewToSide', uri => showPreview(uri, true));
	let d3 = vscode.commands.registerCommand('markdown.showSource', showSource);

	context.subscriptions.push(d1, d2, d3, registration);

	vscode.workspace.onDidSaveTextDocument(document => {
		if (isMarkdownFile(document)) {
			const uri = getMarkdownUri(document.uri);
			provider.update(uri);
		}
	});

	vscode.workspace.onDidChangeTextDocument(event => {
		if (isMarkdownFile(event.document)) {
			const uri = getMarkdownUri(event.document.uri);
			provider.update(uri);

		}
	});

	vscode.workspace.onDidChangeConfiguration(() => {
		vscode.workspace.textDocuments.forEach(document => {
			if (document.uri.scheme === 'markdown') {
				// update all generated md documents
				provider.update(document.uri);
			}
		});
	});
}

function isMarkdownFile(document: vscode.TextDocument) {
	return document.languageId === 'markdown'
		&& document.uri.scheme !== 'markdown'; // prevent processing of own documents
}

function getMarkdownUri(uri: Uri) {
	return uri.with({ scheme: 'markdown', path: uri.path + '.rendered', query: uri.toString() });
}

function showPreview(uri?: Uri, sideBySide: boolean = false) {

	let resource = uri;
	if (!(resource instanceof Uri)) {
		if (vscode.window.activeTextEditor) {
			// we are relaxed and don't check for markdown files
			resource = vscode.window.activeTextEditor.document.uri;
		}
	}

	if (!(resource instanceof Uri)) {
		if (!vscode.window.activeTextEditor) {
			// this is most likely toggling the preview
			return vscode.commands.executeCommand('markdown.showSource');
		}
		// nothing found that could be shown or toggled
		return;
	}

	let thenable = vscode.commands.executeCommand('vscode.previewHtml',
		getMarkdownUri(resource),
		getViewColumn(sideBySide),
		`Preview '${path.basename(resource.fsPath)}'`);

	telemetryReporter.sendTelemetryEvent('openPreview', {
		where : sideBySide ? 'sideBySide' : 'inPlace',
		how : (uri instanceof Uri) ? 'action' : 'pallete'
	});

	return thenable;
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

function showSource(mdUri: Uri) {
	if (!mdUri) {
		return vscode.commands.executeCommand('workbench.action.navigateBack');
	}

	const docUri = Uri.parse(mdUri.query);

	for (let editor of vscode.window.visibleTextEditors) {
		if (editor.document.uri.toString() === docUri.toString()) {
			return vscode.window.showTextDocument(editor.document, editor.viewColumn);
		}
	}

	return vscode.workspace.openTextDocument(docUri).then(doc => {
		return vscode.window.showTextDocument(doc);
	});
}

function getPackageInfo(context: ExtensionContext): IPackageInfo {
	let extensionPackage = require(context.asAbsolutePath('./package.json'));
	if (extensionPackage) {
		return {
			name: extensionPackage.name,
			version: extensionPackage.version,
			aiKey: extensionPackage.aiKey
		};
	}
	return null;
}


interface IRenderer {
	render(text: string) : string;
}

class MDDocumentContentProvider implements TextDocumentContentProvider {
	private _context: ExtensionContext;
	private _onDidChange = new EventEmitter<Uri>();
	private _waiting : boolean;
	private _renderer : IRenderer;

	constructor(context: ExtensionContext) {
		this._context = context;
		this._waiting = false;
		this._renderer = this.createRenderer();
	}

	private createRenderer() : IRenderer {
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
		return md;
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
				`<base href="${document.uri.toString(true)}">`,
				'</head>',
				'<body>'
			).join('\n');

			const body = this._renderer.render(document.getText());

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