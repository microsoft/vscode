/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { Command } from '../commandManager';
import { MarkdownPreviewManager } from '../features/previewManager';
import { TelemetryReporter } from '../telemetryReporter';
import { PreviewSettings } from '../features/preview';


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

interface ShowPreviewSettings {
	readonly sideBySide?: boolean;
	readonly locked?: boolean;
}

async function showPreview(
	webviewManager: MarkdownPreviewManager,
	telemetryReporter: TelemetryReporter,
	uri: vscode.Uri | undefined,
	previewSettings: ShowPreviewSettings,
): Promise<any> {
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

	webviewManager.preview(resource, {
		resourceColumn: (vscode.window.activeTextEditor && vscode.window.activeTextEditor.viewColumn) || vscode.ViewColumn.One,
		previewColumn: getViewColumn(!!previewSettings.sideBySide) || vscode.ViewColumn.Active,
		locked: !!previewSettings.locked
	});

	telemetryReporter.sendTelemetryEvent('openPreview', {
		where: previewSettings.sideBySide ? 'sideBySide' : 'inPlace',
		how: (uri instanceof vscode.Uri) ? 'action' : 'pallete'
	});
}

export class ShowPreviewCommand implements Command {
	public readonly id = 'markdown.showPreview';

	public constructor(
		private readonly webviewManager: MarkdownPreviewManager,
		private readonly telemetryReporter: TelemetryReporter
	) { }

	public execute(mainUri?: vscode.Uri, allUris?: vscode.Uri[], previewSettings?: PreviewSettings) {
		for (const uri of (allUris || [mainUri])) {
			showPreview(this.webviewManager, this.telemetryReporter, uri, {
				sideBySide: false,
				locked: previewSettings && previewSettings.locked
			});
		}
	}
}

export class ShowPreviewToSideCommand implements Command {
	public readonly id = 'markdown.showPreviewToSide';

	public constructor(
		private readonly webviewManager: MarkdownPreviewManager,
		private readonly telemetryReporter: TelemetryReporter
	) { }

	public execute(uri?: vscode.Uri, previewSettings?: PreviewSettings) {
		showPreview(this.webviewManager, this.telemetryReporter, uri, {
			sideBySide: true,
			locked: previewSettings && previewSettings.locked
		});
	}
}


export class ShowLockedPreviewToSideCommand implements Command {
	public readonly id = 'markdown.showLockedPreviewToSide';

	public constructor(
		private readonly webviewManager: MarkdownPreviewManager,
		private readonly telemetryReporter: TelemetryReporter
	) { }

	public execute(uri?: vscode.Uri) {
		showPreview(this.webviewManager, this.telemetryReporter, uri, {
			sideBySide: true,
			locked: true
		});
	}
}
