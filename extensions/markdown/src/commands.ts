/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import * as vscode from 'vscode';
import * as path from 'path';

import { Command } from './commandManager';
import { ExtensionContentSecurityPolicyArbiter, PreviewSecuritySelector } from './security';
import { getMarkdownUri, MDDocumentContentProvider, isMarkdownFile } from './features/previewContentProvider';
import { Logger } from './logger';
import { TableOfContentsProvider } from './tableOfContentsProvider';
import { MarkdownEngine } from './markdownEngine';
import { TelemetryReporter } from './telemetryReporter';


function getViewColumn(sideBySide: boolean): vscode.ViewColumn | undefined {
	const active = vscode.window.activeTextEditor;
	if (!active) {
		return vscode.ViewColumn.One;
	}

	if (!sideBySide) {
		return active.viewColumn;
	}

	switch (active.viewColumn) {
		case vscode.ViewColumn.One:
			return vscode.ViewColumn.Two;
		case vscode.ViewColumn.Two:
			return vscode.ViewColumn.Three;
	}

	return active.viewColumn;
}

function showPreview(
	cspArbiter: ExtensionContentSecurityPolicyArbiter,
	telemetryReporter: TelemetryReporter,
	uri?: vscode.Uri,
	sideBySide: boolean = false,
) {
	let resource = uri;
	if (!(resource instanceof vscode.Uri)) {
		if (vscode.window.activeTextEditor) {
			// we are relaxed and don't check for markdown files
			resource = vscode.window.activeTextEditor.document.uri;
		}
	}

	if (!(resource instanceof vscode.Uri)) {
		if (!vscode.window.activeTextEditor) {
			// this is most likely toggling the preview
			return vscode.commands.executeCommand('markdown.showSource');
		}
		// nothing found that could be shown or toggled
		return;
	}

	const thenable = vscode.commands.executeCommand('vscode.previewHtml',
		getMarkdownUri(resource),
		getViewColumn(sideBySide),
		localize('previewTitle', 'Preview {0}', path.basename(resource.fsPath)),
		{
			allowScripts: true,
			allowSvgs: cspArbiter.shouldAllowSvgsForResource(resource)
		});

	telemetryReporter.sendTelemetryEvent('openPreview', {
		where: sideBySide ? 'sideBySide' : 'inPlace',
		how: (uri instanceof vscode.Uri) ? 'action' : 'pallete'
	});

	return thenable;
}

export class ShowPreviewCommand implements Command {
	public readonly id = 'markdown.showPreview';

	public constructor(
		private readonly cspArbiter: ExtensionContentSecurityPolicyArbiter,
		private readonly telemetryReporter: TelemetryReporter
	) { }

	public execute(uri?: vscode.Uri) {
		showPreview(this.cspArbiter, this.telemetryReporter, uri, false);
	}
}

export class ShowPreviewToSideCommand implements Command {
	public readonly id = 'markdown.showPreviewToSide';

	public constructor(
		private readonly cspArbiter: ExtensionContentSecurityPolicyArbiter,
		private readonly telemetryReporter: TelemetryReporter
	) { }

	public execute(uri?: vscode.Uri) {
		showPreview(this.cspArbiter, this.telemetryReporter, uri, true);
	}
}

export class ShowSourceCommand implements Command {
	public readonly id = 'markdown.showSource';

	public execute(mdUri?: vscode.Uri) {
		if (!mdUri) {
			return vscode.commands.executeCommand('workbench.action.navigateBack');
		}

		const docUri = vscode.Uri.parse(mdUri.query);
		for (const editor of vscode.window.visibleTextEditors) {
			if (editor.document.uri.scheme === docUri.scheme && editor.document.uri.toString() === docUri.toString()) {
				return vscode.window.showTextDocument(editor.document, editor.viewColumn);
			}
		}

		return vscode.workspace.openTextDocument(docUri)
			.then(vscode.window.showTextDocument);
	}
}

export class RefreshPreviewCommand implements Command {
	public readonly id = 'markdown.refreshPreview';

	public constructor(
		private readonly contentProvider: MDDocumentContentProvider
	) { }

	public execute(resource: string | undefined) {
		if (resource) {
			const source = vscode.Uri.parse(resource);
			this.contentProvider.update(source);
		} else if (vscode.window.activeTextEditor && isMarkdownFile(vscode.window.activeTextEditor.document)) {
			this.contentProvider.update(getMarkdownUri(vscode.window.activeTextEditor.document.uri));
		} else {
			// update all generated md documents
			for (const document of vscode.workspace.textDocuments) {
				if (document.uri.scheme === MDDocumentContentProvider.scheme) {
					this.contentProvider.update(document.uri);
				}
			}
		}
	}
}

export class ShowPreviewSecuritySelectorCommand implements Command {
	public readonly id = 'markdown.showPreviewSecuritySelector';

	public constructor(
		private readonly previewSecuritySelector: PreviewSecuritySelector
	) { }

	public execute(resource: string | undefined) {
		if (resource) {
			const source = vscode.Uri.parse(resource).query;
			this.previewSecuritySelector.showSecutitySelectorForResource(vscode.Uri.parse(source));
		} else {
			if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'markdown') {
				this.previewSecuritySelector.showSecutitySelectorForResource(vscode.window.activeTextEditor.document.uri);
			}
		}
	}
}

export class RevealLineCommand implements Command {
	public readonly id = '_markdown.revealLine';

	public constructor(
		private logger: Logger
	) { }

	public execute(uri: string, line: number) {
		const sourceUri = vscode.Uri.parse(decodeURIComponent(uri));
		this.logger.log('revealLine', { uri, sourceUri: sourceUri.toString(), line });

		vscode.window.visibleTextEditors
			.filter(editor => isMarkdownFile(editor.document) && editor.document.uri.toString() === sourceUri.toString())
			.forEach(editor => {
				const sourceLine = Math.floor(line);
				const fraction = line - sourceLine;
				const text = editor.document.lineAt(sourceLine).text;
				const start = Math.floor(fraction * text.length);
				editor.revealRange(
					new vscode.Range(sourceLine, start, sourceLine + 1, 0),
					vscode.TextEditorRevealType.AtTop);
			});
	}
}

export class DidClickCommand implements Command {
	public readonly id = '_markdown.didClick';

	public execute(uri: string, line: number) {
		const sourceUri = vscode.Uri.parse(decodeURIComponent(uri));
		return vscode.workspace.openTextDocument(sourceUri)
			.then(document => vscode.window.showTextDocument(document))
			.then(editor =>
				vscode.commands.executeCommand('revealLine', { lineNumber: Math.floor(line), at: 'center' })
					.then(() => editor))
			.then(editor => {
				if (editor) {
					editor.selection = new vscode.Selection(
						new vscode.Position(Math.floor(line), 0),
						new vscode.Position(Math.floor(line), 0));
				}
			});
	}
}

export class MoveCursorToPositionCommand implements Command {
	public readonly id = '_markdown.moveCursorToPosition';

	public execute(line: number, character: number) {
		if (!vscode.window.activeTextEditor) {
			return;
		}
		const position = new vscode.Position(line, character);
		const selection = new vscode.Selection(position, position);
		vscode.window.activeTextEditor.revealRange(selection);
		vscode.window.activeTextEditor.selection = selection;
	}
}

export class OnPreviewStyleLoadErrorCommand implements Command {
	public readonly id = '_markdown.onPreviewStyleLoadError';

	public execute(resources: string[]) {
		vscode.window.showWarningMessage(localize('onPreviewStyleLoadError', "Could not load 'markdown.styles': {0}", resources.join(', ')));
	}
}

export interface OpenDocumentLinkArgs {
	path: string;
	fragment: string;
}

export class OpenDocumentLinkCommand implements Command {
	private static readonly id = '_markdown.openDocumentLink';
	public readonly id = OpenDocumentLinkCommand.id;

	public static createCommandUri(
		path: string,
		fragment: string
	): vscode.Uri {
		return vscode.Uri.parse(`command:${OpenDocumentLinkCommand.id}?${encodeURIComponent(JSON.stringify({ path, fragment }))}`);
	}

	public constructor(
		private readonly engine: MarkdownEngine
	) { }

	public execute(args: OpenDocumentLinkArgs) {
		const tryRevealLine = async (editor: vscode.TextEditor) => {
			if (editor && args.fragment) {
				const toc = new TableOfContentsProvider(this.engine, editor.document);
				const line = await toc.lookup(args.fragment);
				if (!isNaN(line)) {
					return editor.revealRange(
						new vscode.Range(line, 0, line, 0),
						vscode.TextEditorRevealType.AtTop);
				}

				const lineNumberFragment = args.fragment.match(/^L(\d+)$/);
				if (lineNumberFragment) {
					const line = +lineNumberFragment[1] - 1;
					if (!isNaN(line)) {
						return editor.revealRange(
							new vscode.Range(line, 0, line, 0),
							vscode.TextEditorRevealType.AtTop);
					}
				}
			}
		};

		const tryOpen = async (path: string) => {
			if (vscode.window.activeTextEditor && isMarkdownFile(vscode.window.activeTextEditor.document) && vscode.window.activeTextEditor.document.uri.fsPath === path) {
				return tryRevealLine(vscode.window.activeTextEditor);
			} else {
				const resource = vscode.Uri.file(path);
				return vscode.workspace.openTextDocument(resource)
					.then(vscode.window.showTextDocument)
					.then(tryRevealLine);
			}
		};

		return tryOpen(args.path).catch(() => {
			if (path.extname(args.path) === '') {
				return tryOpen(args.path + '.md');
			}
			const resource = vscode.Uri.file(args.path);
			return Promise.resolve(void 0)
				.then(() => vscode.commands.executeCommand('vscode.open', resource))
				.then(() => void 0);
		});
	}
}
