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
import { getMarkdownUri } from './previewContentProvider';
import TelemetryReporter from 'vscode-extension-telemetry';


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