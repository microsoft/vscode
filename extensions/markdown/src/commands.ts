/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
const localize = nls.config(process.env.VSCODE_NLS_CONFIG)();

import * as vscode from 'vscode';
import * as path from 'path';

import { Command } from './commandManager';
import { ExtensionContentSecurityPolicyArbiter } from './security';
import { getMarkdownUri, MDDocumentContentProvider, isMarkdownFile } from './previewContentProvider';
import TelemetryReporter from 'vscode-extension-telemetry';
import { Logger } from './logger';


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
	telemetryReporter: TelemetryReporter | null,
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

	if (telemetryReporter) {
		/* __GDPR__
			"openPreview" : {
				"where" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"how": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		telemetryReporter.sendTelemetryEvent('openPreview', {
			where: sideBySide ? 'sideBySide' : 'inPlace',
			how: (uri instanceof vscode.Uri) ? 'action' : 'pallete'
		});
	}

	return thenable;
}

export class ShowPreviewCommand implements Command {
	public readonly id = 'markdown.showPreview';

	public constructor(
		private cspArbiter: ExtensionContentSecurityPolicyArbiter,
		private telemetryReporter: TelemetryReporter | null
	) { }

	public execute(uri?: vscode.Uri) {
		showPreview(this.cspArbiter, this.telemetryReporter, uri, false);
	}
}

export class ShowPreviewToSideCommand implements Command {
	public readonly id = 'markdown.showPreviewToSide';

	public constructor(
		private cspArbiter: ExtensionContentSecurityPolicyArbiter,
		private telemetryReporter: TelemetryReporter | null
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
		private contentProvider: MDDocumentContentProvider
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
				if (document.uri.scheme === 'markdown') {
					this.contentProvider.update(document.uri);
				}
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
