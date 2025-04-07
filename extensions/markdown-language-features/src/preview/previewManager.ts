/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogger } from '../logging';
import { MarkdownContributionProvider } from '../markdownExtensions';
import { Disposable, disposeAll } from '../util/dispose';
import { isMarkdownFile } from '../util/file';
import { MdLinkOpener } from '../util/openDocumentLink';
import { MdDocumentRenderer } from './documentRenderer';
import { DynamicMarkdownPreview, IManagedMarkdownPreview, StaticMarkdownPreview } from './preview';
import { MarkdownPreviewConfigurationManager } from './previewConfig';
import { scrollEditorToLine, StartingScrollFragment } from './scrolling';
import { TopmostLineMonitor } from './topmostLineMonitor';


export interface DynamicPreviewSettings {
	readonly resourceColumn: vscode.ViewColumn;
	readonly previewColumn: vscode.ViewColumn;
	readonly locked: boolean;
}

class PreviewStore<T extends IManagedMarkdownPreview> extends Disposable {

	private readonly _previews = new Set<T>();

	public override dispose(): void {
		super.dispose();
		for (const preview of this._previews) {
			preview.dispose();
		}
		this._previews.clear();
	}

	[Symbol.iterator](): Iterator<T> {
		return this._previews[Symbol.iterator]();
	}

	public get(resource: vscode.Uri, previewSettings: DynamicPreviewSettings): T | undefined {
		const previewColumn = this._resolvePreviewColumn(previewSettings);
		for (const preview of this._previews) {
			if (preview.matchesResource(resource, previewColumn, previewSettings.locked)) {
				return preview;
			}
		}
		return undefined;
	}

	public add(preview: T) {
		this._previews.add(preview);
	}

	public delete(preview: T) {
		this._previews.delete(preview);
	}

	private _resolvePreviewColumn(previewSettings: DynamicPreviewSettings): vscode.ViewColumn | undefined {
		if (previewSettings.previewColumn === vscode.ViewColumn.Active) {
			return vscode.window.tabGroups.activeTabGroup.viewColumn;
		}

		if (previewSettings.previewColumn === vscode.ViewColumn.Beside) {
			return vscode.window.tabGroups.activeTabGroup.viewColumn + 1;
		}

		return previewSettings.previewColumn;
	}
}

export class MarkdownPreviewManager extends Disposable implements vscode.WebviewPanelSerializer, vscode.CustomTextEditorProvider {

	private readonly _topmostLineMonitor = new TopmostLineMonitor();
	private readonly _previewConfigurations = new MarkdownPreviewConfigurationManager();

	private readonly _dynamicPreviews = this._register(new PreviewStore<DynamicMarkdownPreview>());
	private readonly _staticPreviews = this._register(new PreviewStore<StaticMarkdownPreview>());

	private _activePreview: IManagedMarkdownPreview | undefined = undefined;

	public constructor(
		private readonly _contentProvider: MdDocumentRenderer,
		private readonly _logger: ILogger,
		private readonly _contributions: MarkdownContributionProvider,
		private readonly _opener: MdLinkOpener,
	) {
		super();

		this._register(vscode.window.registerWebviewPanelSerializer(DynamicMarkdownPreview.viewType, this));

		this._register(vscode.window.registerCustomEditorProvider(StaticMarkdownPreview.customEditorViewType, this, {
			webviewOptions: { enableFindWidget: true }
		}));

		this._register(vscode.window.onDidChangeActiveTextEditor(textEditor => {
			// When at a markdown file, apply existing scroll settings
			if (textEditor?.document && isMarkdownFile(textEditor.document)) {
				const line = this._topmostLineMonitor.getPreviousStaticEditorLineByUri(textEditor.document.uri);
				if (typeof line === 'number') {
					scrollEditorToLine(line, textEditor);
				}
			}
		}));
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
			preview = this._createNewDynamicPreview(resource, settings);
		}

		preview.update(
			resource,
			resource.fragment ? new StartingScrollFragment(resource.fragment) : undefined
		);
	}

	public get activePreviewResource() {
		return this._activePreview?.resource;
	}

	public get activePreviewResourceColumn() {
		return this._activePreview?.resourceColumn;
	}

	public findPreview(resource: vscode.Uri): IManagedMarkdownPreview | undefined {
		for (const preview of [...this._dynamicPreviews, ...this._staticPreviews]) {
			if (preview.resource.fsPath === resource.fsPath) {
				return preview;
			}
		}
		return undefined;
	}

	public toggleLock() {
		const preview = this._activePreview;
		if (preview instanceof DynamicMarkdownPreview) {
			preview.toggleLock();

			// Close any previews that are now redundant, such as having two dynamic previews in the same editor group
			for (const otherPreview of this._dynamicPreviews) {
				if (otherPreview !== preview && preview.matches(otherPreview)) {
					otherPreview.dispose();
				}
			}
		}
	}

	public openDocumentLink(linkText: string, fromResource: vscode.Uri) {
		const viewColumn = this.findPreview(fromResource)?.resourceColumn;
		return this._opener.openDocumentLink(linkText, fromResource, viewColumn);
	}

	public async deserializeWebviewPanel(
		webview: vscode.WebviewPanel,
		state: any
	): Promise<void> {
		try {
			const resource = vscode.Uri.parse(state.resource);
			const locked = state.locked;
			const line = state.line;
			const resourceColumn = state.resourceColumn;

			const preview = DynamicMarkdownPreview.revive(
				{ resource, locked, line, resourceColumn },
				webview,
				this._contentProvider,
				this._previewConfigurations,
				this._logger,
				this._topmostLineMonitor,
				this._contributions,
				this._opener);

			this._registerDynamicPreview(preview);
		} catch (e) {
			console.error(e);

			webview.webview.html = /* html */`<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!-- Disable pinch zooming -->
				<meta name="viewport"
					content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">

				<title>Markdown Preview</title>

				<style>
					html, body {
						min-height: 100%;
						height: 100%;
					}

					.error-container {
						display: flex;
						justify-content: center;
						align-items: center;
						text-align: center;
					}
				</style>

				<meta http-equiv="Content-Security-Policy" content="default-src 'none';">
			</head>
			<body class="error-container">
				<p>${vscode.l10n.t("An unexpected error occurred while restoring the Markdown preview.")}</p>
			</body>
			</html>`;
		}
	}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webview: vscode.WebviewPanel
	): Promise<void> {
		const lineNumber = this._topmostLineMonitor.getPreviousStaticTextEditorLineByUri(document.uri);
		const preview = StaticMarkdownPreview.revive(
			document.uri,
			webview,
			this._contentProvider,
			this._previewConfigurations,
			this._topmostLineMonitor,
			this._logger,
			this._contributions,
			this._opener,
			lineNumber
		);
		this._registerStaticPreview(preview);
		this._activePreview = preview;
	}

	private _createNewDynamicPreview(
		resource: vscode.Uri,
		previewSettings: DynamicPreviewSettings
	): DynamicMarkdownPreview {
		const activeTextEditorURI = vscode.window.activeTextEditor?.document.uri;
		const scrollLine = (activeTextEditorURI?.toString() === resource.toString()) ? vscode.window.activeTextEditor?.visibleRanges[0].start.line : undefined;
		const preview = DynamicMarkdownPreview.create(
			{
				resource,
				resourceColumn: previewSettings.resourceColumn,
				locked: previewSettings.locked,
				line: scrollLine,
			},
			previewSettings.previewColumn,
			this._contentProvider,
			this._previewConfigurations,
			this._logger,
			this._topmostLineMonitor,
			this._contributions,
			this._opener);

		this._activePreview = preview;
		return this._registerDynamicPreview(preview);
	}

	private _registerDynamicPreview(preview: DynamicMarkdownPreview): DynamicMarkdownPreview {
		this._dynamicPreviews.add(preview);

		preview.onDispose(() => {
			this._dynamicPreviews.delete(preview);
		});

		this._trackActive(preview);

		preview.onDidChangeViewState(() => {
			// Remove other dynamic previews in our column
			disposeAll(Array.from(this._dynamicPreviews).filter(otherPreview => preview !== otherPreview && preview.matches(otherPreview)));
		});
		return preview;
	}

	private _registerStaticPreview(preview: StaticMarkdownPreview): StaticMarkdownPreview {
		this._staticPreviews.add(preview);

		preview.onDispose(() => {
			this._staticPreviews.delete(preview);
		});

		this._trackActive(preview);
		return preview;
	}

	private _trackActive(preview: IManagedMarkdownPreview): void {
		preview.onDidChangeViewState(({ webviewPanel }) => {
			this._activePreview = webviewPanel.active ? preview : undefined;
		});

		preview.onDispose(() => {
			if (this._activePreview === preview) {
				this._activePreview = undefined;
			}
		});
	}

}
