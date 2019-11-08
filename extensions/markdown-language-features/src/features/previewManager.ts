/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Logger } from '../logger';
import { MarkdownContributionProvider } from '../markdownExtensions';
import { disposeAll, Disposable } from '../util/dispose';
import { MarkdownFileTopmostLineMonitor } from '../util/topmostLineMonitor';
import { DynamicMarkdownPreview } from './preview';
import { MarkdownPreviewConfigurationManager } from './previewConfig';
import { MarkdownContentProvider } from './previewContentProvider';

export interface DynamicPreviewSettings {
	readonly resourceColumn: vscode.ViewColumn;
	readonly previewColumn: vscode.ViewColumn;
	readonly locked: boolean;
}

class DynamicPreviewStore extends Disposable {

	private readonly _previews = new Set<DynamicMarkdownPreview>();

	public dispose(): void {
		super.dispose();
		for (const preview of this._previews) {
			preview.dispose();
		}
		this._previews.clear();
	}

	[Symbol.iterator](): Iterator<DynamicMarkdownPreview> {
		return this._previews[Symbol.iterator]();
	}

	public get(resource: vscode.Uri, previewSettings: DynamicPreviewSettings): DynamicMarkdownPreview | undefined {
		for (const preview of this._previews) {
			if (preview.matchesResource(resource, previewSettings.previewColumn, previewSettings.locked)) {
				return preview;
			}
		}
		return undefined;
	}

	public add(preview: DynamicMarkdownPreview) {
		this._previews.add(preview);
	}

	public delete(preview: DynamicMarkdownPreview) {
		this._previews.delete(preview);
	}
}

export class MarkdownPreviewManager extends Disposable implements vscode.WebviewPanelSerializer, vscode.WebviewEditorProvider {
	private static readonly markdownPreviewActiveContextKey = 'markdownPreviewFocus';

	private readonly _topmostLineMonitor = new MarkdownFileTopmostLineMonitor();
	private readonly _previewConfigurations = new MarkdownPreviewConfigurationManager();

	private readonly _previews = this._register(new DynamicPreviewStore());
	private _activePreview: DynamicMarkdownPreview | undefined = undefined;

	public constructor(
		private readonly _contentProvider: MarkdownContentProvider,
		private readonly _logger: Logger,
		private readonly _contributions: MarkdownContributionProvider
	) {
		super();
		this._register(vscode.window.registerWebviewPanelSerializer(DynamicMarkdownPreview.viewType, this));
	}

	public refresh() {
		for (const preview of this._previews) {
			preview.refresh();
		}
	}

	public updateConfiguration() {
		for (const preview of this._previews) {
			preview.updateConfiguration();
		}
	}

	public openDynamicPreview(
		resource: vscode.Uri,
		settings: DynamicPreviewSettings
	): void {
		let preview = this._previews.get(resource, settings);
		if (preview) {
			preview.reveal(settings.previewColumn);
		} else {
			preview = this.createNewPreview(resource, settings);
		}

		preview.update(resource);
	}

	public get activePreviewResource() {
		return this._activePreview?.resource;
	}

	public get activePreviewResourceColumn() {
		return this._activePreview?.resourceColumn;
	}

	public toggleLock() {
		const preview = this._activePreview;
		if (preview) {
			preview.toggleLock();

			// Close any previews that are now redundant, such as having two dynamic previews in the same editor group
			for (const otherPreview of this._previews) {
				if (otherPreview !== preview && preview.matches(otherPreview)) {
					otherPreview.dispose();
				}
			}
		}
	}

	public async deserializeWebviewPanel(
		webview: vscode.WebviewPanel,
		state: any
	): Promise<void> {
		const preview = await DynamicMarkdownPreview.revive(
			webview,
			state,
			this._contentProvider,
			this._previewConfigurations,
			this._logger,
			this._topmostLineMonitor,
			this._contributions);

		this.registerPreview(preview);
	}

	public async resolveWebviewEditor(
		input: { readonly resource: vscode.Uri; },
		webview: vscode.WebviewPanel
	): Promise<vscode.WebviewEditorCapabilities> {
		await DynamicMarkdownPreview.revive(
			webview,
			{ resource: input.resource.toString() },
			this._contentProvider,
			this._previewConfigurations,
			this._logger,
			this._topmostLineMonitor,
			this._contributions);
		return {};
	}

	private createNewPreview(
		resource: vscode.Uri,
		previewSettings: DynamicPreviewSettings
	): DynamicMarkdownPreview {
		const preview = DynamicMarkdownPreview.create(
			resource,
			previewSettings.previewColumn,
			previewSettings.resourceColumn,
			previewSettings.locked,
			this._contentProvider,
			this._previewConfigurations,
			this._logger,
			this._topmostLineMonitor,
			this._contributions);

		this.setPreviewActiveContext(true);
		this._activePreview = preview;
		return this.registerPreview(preview);
	}

	private registerPreview(
		preview: DynamicMarkdownPreview
	): DynamicMarkdownPreview {
		this._previews.add(preview);

		preview.onDispose(() => {
			this._previews.delete(preview);
			if (this._activePreview === preview) {
				this.setPreviewActiveContext(false);
				this._activePreview = undefined;
			}
		});

		preview.onDidChangeViewState(({ webviewPanel }) => {
			disposeAll(Array.from(this._previews).filter(otherPreview => preview !== otherPreview && preview.matches(otherPreview)));
			this.setPreviewActiveContext(webviewPanel.active);
			this._activePreview = webviewPanel.active ? preview : undefined;
		});

		return preview;
	}

	private setPreviewActiveContext(value: boolean) {
		vscode.commands.executeCommand('setContext', MarkdownPreviewManager.markdownPreviewActiveContextKey, value);
	}
}

