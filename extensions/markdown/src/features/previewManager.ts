/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { Logger } from '../logger';
import { MarkdownContentProvider, PreviewConfigManager, isMarkdownFile } from './previewContentProvider';
import { MarkdownPreview, PreviewSettings } from './preview';
import { disposeAll } from '../util/dispose';
import { MarkdownFileTopmostLineMonitor } from '../util/topmostLineMonitor';

export class MarkdownPreviewManager {
	private static readonly markdownPreviewActiveContextKey = 'markdownPreviewFocus';

	private readonly topmostLineMonitor = new MarkdownFileTopmostLineMonitor();
	private readonly previewConfigurations = new PreviewConfigManager();
	private readonly previews: MarkdownPreview[] = [];
	private activePreview: MarkdownPreview | undefined = undefined;
	private readonly disposables: vscode.Disposable[] = [];

	public constructor(
		private readonly contentProvider: MarkdownContentProvider,
		private readonly logger: Logger
	) {
		vscode.window.onDidChangeActiveEditor(editor => {
			vscode.commands.executeCommand('setContext', MarkdownPreviewManager.markdownPreviewActiveContextKey,
				editor && editor.editorType === 'webview' && editor.uri.scheme === MarkdownPreview.previewScheme);

			this.activePreview = editor && editor.editorType === 'webview'
				? this.previews.find(preview => editor.uri.toString() === preview.uri.toString())
				: undefined;

			if (editor && editor.editorType === 'texteditor') {
				if (isMarkdownFile(editor.document)) {
					for (const preview of this.previews.filter(preview => !preview.locked)) {
						preview.update(editor.document.uri);
					}
				}
			}
		}, null, this.disposables);
	}

	public dispose(): void {
		disposeAll(this.disposables);
		disposeAll(this.previews);
	}

	public refresh() {
		for (const preview of this.previews) {
			preview.refresh();
		}
	}

	public updateConfiguration() {
		for (const preview of this.previews) {
			preview.updateConfiguration();
		}
	}

	public preview(
		resource: vscode.Uri,
		previewSettings: PreviewSettings
	): void {
		let preview = this.getExistingPreview(resource, previewSettings);
		if (preview) {
			preview.show(previewSettings.previewColumn);
		} else {
			preview = this.createNewPreview(resource, previewSettings);
			this.previews.push(preview);
		}

		preview.update(resource);
	}


	public getResourceForPreview(previewUri: vscode.Uri): vscode.Uri | undefined {
		const preview = this.getPreviewWithUri(previewUri);
		return preview && preview.resource;
	}

	public toggleLock(previewUri?: vscode.Uri) {
		const preview = previewUri ? this.getPreviewWithUri(previewUri) : this.activePreview;
		if (preview) {
			preview.toggleLock();

			// Close any previews that are now redundant, such as having two dynamic previews in the same editor group
			for (const otherPreview of this.previews) {
				if (otherPreview !== preview && preview.matches(otherPreview)) {
					otherPreview.dispose();
				}
			}
		}
	}

	private getExistingPreview(
		resource: vscode.Uri,
		previewSettings: PreviewSettings
	): MarkdownPreview | undefined {
		return this.previews.find(preview =>
			preview.matchesResource(resource, previewSettings.previewColumn, previewSettings.locked));
	}

	private getPreviewWithUri(previewUri: vscode.Uri): MarkdownPreview | undefined {
		return this.previews.find(preview => preview.uri.toString() === previewUri.toString());
	}

	private createNewPreview(
		resource: vscode.Uri,
		previewSettings: PreviewSettings
	) {
		const preview = new MarkdownPreview(
			resource,
			previewSettings.previewColumn,
			previewSettings.locked,
			this.contentProvider,
			this.previewConfigurations,
			this.logger,
			this.topmostLineMonitor);

		preview.onDispose(() => {
			const existing = this.previews.indexOf(preview!);
			if (existing >= 0) {
				this.previews.splice(existing, 1);
			}
		});

		preview.onDidChangeViewColumn(() => {
			disposeAll(this.previews.filter(otherPreview => preview !== otherPreview && preview!.matches(otherPreview)));
		});

		return preview;
	}
}

