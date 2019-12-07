/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Logger } from '../logger';
import { MarkdownContributionProvider } from '../markdownExtensions';
import { disposeAll, Disposable } from '../util/dispose';
import { TopmostLineMonitor } from '../util/topmostLineMonitor';
import { DynamicMarkdownPreview } from './preview';
import { MarkdownPreviewConfigurationManager } from './previewConfig';
import { MarkdownContentProvider } from './previewContentProvider';

export interface DynamicPreviewSettings {
	readonly resourceColumn: vscode.ViewColumn;
	readonly previewColumn: vscode.ViewColumn;
	readonly locked: boolean;
}

class PreviewStore extends Disposable {

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

	private readonly _topmostLineMonitor = new TopmostLineMonitor();
	private readonly _previewConfigurations = new MarkdownPreviewConfigurationManager();

	private readonly _dynamicPreviews = this._register(new PreviewStore());
	private readonly _staticPreviews = this._register(new PreviewStore());

	private _activePreview: DynamicMarkdownPreview | undefined = undefined;

	public constructor(
		private readonly _contentProvider: MarkdownContentProvider,
		private readonly _logger: Logger,
		private readonly _contributions: MarkdownContributionProvider
	) {
		super();
		this._register(vscode.window.registerWebviewPanelSerializer(DynamicMarkdownPreview.viewType, this));
		this._register(vscode.window.registerWebviewEditorProvider('vscode.markdown.preview.editor', this));
	}

	public refresh() {
		for (const preview of this._dynamicPreviews) {
			preview.refresh();
		}
		for (const preview of this._staticPreviews) {
			preview.refresh();
		}
	}

	public updateConfiguration() {
		for (const preview of this._dynamicPreviews) {
			preview.updateConfiguration();
		}
		for (const preview of this._staticPreviews) {
			preview.updateConfiguration();
		}
	}

	public openDynamicPreview(
		resource: vscode.Uri,
		settings: DynamicPreviewSettings
	): void {
		let preview = this._dynamicPreviews.get(resource, settings);
		if (preview) {
			preview.reveal(settings.previewColumn);
		} else {
			preview = this.createNewDynamicPreview(resource, settings);
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
			for (const otherPreview of this._dynamicPreviews) {
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
		const resource = vscode.Uri.parse(state.resource);
		const locked = state.locked;
		const line = state.line;
		const resourceColumn = state.resourceColumn;

		const preview = await DynamicMarkdownPreview.revive(
			{ resource, locked, line, resourceColumn },
			webview,
			this._contentProvider,
			this._previewConfigurations,
			this._logger,
			this._topmostLineMonitor,
			this._contributions);

		this.registerDynamicPreview(preview);
	}

	public async resolveWebviewEditor(
		input: { readonly resource: vscode.Uri; },
		webview: vscode.WebviewPanel
	): Promise<vscode.WebviewEditorCapabilities> {
		const preview = DynamicMarkdownPreview.revive(
			{ resource: input.resource, locked: false, resourceColumn: vscode.ViewColumn.One },
			webview,
			this._contentProvider,
			this._previewConfigurations,
			this._logger,
			this._topmostLineMonitor,
			this._contributions);
		this.registerStaticPreview(preview);
		return {};
	}

	private createNewDynamicPreview(
		resource: vscode.Uri,
		previewSettings: DynamicPreviewSettings
	): DynamicMarkdownPreview {
		const preview = DynamicMarkdownPreview.create(
			{
				resource,
				resourceColumn: previewSettings.resourceColumn,
				locked: previewSettings.locked,
			},
			previewSettings.previewColumn,
			this._contentProvider,
			this._previewConfigurations,
			this._logger,
			this._topmostLineMonitor,
			this._contributions);

		this.setPreviewActiveContext(true);
		this._activePreview = preview;
		return this.registerDynamicPreview(preview);
	}

	private registerDynamicPreview(preview: DynamicMarkdownPreview): DynamicMarkdownPreview {
		this._dynamicPreviews.add(preview);

		preview.onDispose(() => {
			this._dynamicPreviews.delete(preview);
		});

		this.trackActive(preview);

		preview.onDidChangeViewState(() => {
			// Remove other dynamic previews in our column
			disposeAll(Array.from(this._dynamicPreviews).filter(otherPreview => preview !== otherPreview && preview.matches(otherPreview)));
		});
		return preview;
	}

	private registerStaticPreview(preview: DynamicMarkdownPreview): DynamicMarkdownPreview {
		this._staticPreviews.add(preview);

		preview.onDispose(() => {
			this._staticPreviews.delete(preview);
		});

		this.trackActive(preview);
		return preview;
	}

	private trackActive(preview: DynamicMarkdownPreview): void {
		preview.onDidChangeViewState(({ webviewPanel }) => {
			this.setPreviewActiveContext(webviewPanel.active);
			this._activePreview = webviewPanel.active ? preview : undefined;
		});

		preview.onDispose(() => {
			if (this._activePreview === preview) {
				this.setPreviewActiveContext(false);
				this._activePreview = undefined;
			}
		});
	}

	private setPreviewActiveContext(value: boolean) {
		vscode.commands.executeCommand('setContext', MarkdownPreviewManager.markdownPreviewActiveContextKey, value);
	}
}

