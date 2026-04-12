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

	readonly #previews = new Set<T>();

	public override dispose(): void {
		super.dispose();
		for (const preview of this.#previews) {
			preview.dispose();
		}
		this.#previews.clear();
	}

	[Symbol.iterator](): Iterator<T> {
		return this.#previews[Symbol.iterator]();
	}

	public get(resource: vscode.Uri, previewSettings: DynamicPreviewSettings): T | undefined {
		const previewColumn = this.#resolvePreviewColumn(previewSettings);
		for (const preview of this.#previews) {
			if (preview.matchesResource(resource, previewColumn, previewSettings.locked)) {
				return preview;
			}
		}
		return undefined;
	}

	public add(preview: T) {
		this.#previews.add(preview);
	}

	public delete(preview: T) {
		this.#previews.delete(preview);
	}

	#resolvePreviewColumn(previewSettings: DynamicPreviewSettings): vscode.ViewColumn | undefined {
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

	readonly #topmostLineMonitor = new TopmostLineMonitor();
	readonly #previewConfigurations = new MarkdownPreviewConfigurationManager();

	readonly #dynamicPreviews = this._register(new PreviewStore<DynamicMarkdownPreview>());
	readonly #staticPreviews = this._register(new PreviewStore<StaticMarkdownPreview>());

	#activePreview: IManagedMarkdownPreview | undefined = undefined;

	readonly #contentProvider: MdDocumentRenderer;
	readonly #logger: ILogger;
	readonly #contributions: MarkdownContributionProvider;
	readonly #opener: MdLinkOpener;

	public constructor(
		contentProvider: MdDocumentRenderer,
		logger: ILogger,
		contributions: MarkdownContributionProvider,
		opener: MdLinkOpener,
	) {
		super();

		this.#contentProvider = contentProvider;
		this.#logger = logger;
		this.#contributions = contributions;
		this.#opener = opener;

		this._register(vscode.window.registerWebviewPanelSerializer(DynamicMarkdownPreview.viewType, this));

		this._register(vscode.window.registerCustomEditorProvider(StaticMarkdownPreview.customEditorViewType, this, {
			webviewOptions: { enableFindWidget: true }
		}));

		this._register(vscode.window.onDidChangeActiveTextEditor(textEditor => {
			// When at a markdown file, apply existing scroll settings
			if (textEditor?.document && isMarkdownFile(textEditor.document)) {
				const line = this.#topmostLineMonitor.getPreviousStaticEditorLineByUri(textEditor.document.uri);
				if (typeof line === 'number') {
					scrollEditorToLine(line, textEditor);
				}
			}
		}));
	}

	public refresh() {
		for (const preview of this.#dynamicPreviews) {
			preview.refresh();
		}
		for (const preview of this.#staticPreviews) {
			preview.refresh();
		}
	}

	public updateConfiguration() {
		for (const preview of this.#dynamicPreviews) {
			preview.updateConfiguration();
		}
		for (const preview of this.#staticPreviews) {
			preview.updateConfiguration();
		}
	}

	public openDynamicPreview(
		resource: vscode.Uri,
		settings: DynamicPreviewSettings
	): void {
		let preview = this.#dynamicPreviews.get(resource, settings);
		if (preview) {
			preview.reveal(settings.previewColumn);
		} else {
			preview = this.#createNewDynamicPreview(resource, settings);
		}

		preview.update(
			resource,
			resource.fragment ? new StartingScrollFragment(resource.fragment) : undefined
		);
	}

	public get activePreviewResource() {
		return this.#activePreview?.resource;
	}

	public get activePreviewResourceColumn() {
		return this.#activePreview?.resourceColumn;
	}

	public findPreview(resource: vscode.Uri): IManagedMarkdownPreview | undefined {
		for (const preview of [...this.#dynamicPreviews, ...this.#staticPreviews]) {
			if (preview.resource.fsPath === resource.fsPath) {
				return preview;
			}
		}
		return undefined;
	}

	public toggleLock() {
		const preview = this.#activePreview;
		if (preview instanceof DynamicMarkdownPreview) {
			preview.toggleLock();

			// Close any previews that are now redundant, such as having two dynamic previews in the same editor group
			for (const otherPreview of this.#dynamicPreviews) {
				if (otherPreview !== preview && preview.matches(otherPreview)) {
					otherPreview.dispose();
				}
			}
		}
	}

	public openDocumentLink(linkText: string, fromResource: vscode.Uri) {
		const viewColumn = this.findPreview(fromResource)?.resourceColumn;
		return this.#opener.openDocumentLink(linkText, fromResource, viewColumn);
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
				this.#contentProvider,
				this.#previewConfigurations,
				this.#logger,
				this.#topmostLineMonitor,
				this.#contributions,
				this.#opener);

			this.#registerDynamicPreview(preview);
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
		const lineNumber = this.#topmostLineMonitor.getPreviousStaticTextEditorLineByUri(document.uri);
		const preview = StaticMarkdownPreview.revive(
			document.uri,
			webview,
			this.#contentProvider,
			this.#previewConfigurations,
			this.#topmostLineMonitor,
			this.#logger,
			this.#contributions,
			this.#opener,
			lineNumber
		);
		this.#registerStaticPreview(preview);
		this.#activePreview = preview;
	}

	#createNewDynamicPreview(
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
			this.#contentProvider,
			this.#previewConfigurations,
			this.#logger,
			this.#topmostLineMonitor,
			this.#contributions,
			this.#opener);

		this.#activePreview = preview;
		return this.#registerDynamicPreview(preview);
	}

	#registerDynamicPreview(preview: DynamicMarkdownPreview): DynamicMarkdownPreview {
		this.#dynamicPreviews.add(preview);

		preview.onDispose(() => {
			this.#dynamicPreviews.delete(preview);
		});

		this.#trackActive(preview);

		preview.onDidChangeViewState(() => {
			// Remove other dynamic previews in our column
			disposeAll(Array.from(this.#dynamicPreviews).filter(otherPreview => preview !== otherPreview && preview.matches(otherPreview)));
		});
		return preview;
	}

	#registerStaticPreview(preview: StaticMarkdownPreview): StaticMarkdownPreview {
		this.#staticPreviews.add(preview);

		preview.onDispose(() => {
			this.#staticPreviews.delete(preview);
		});

		this.#trackActive(preview);
		return preview;
	}

	#trackActive(preview: IManagedMarkdownPreview): void {
		preview.onDidChangeViewState(({ webviewPanel }) => {
			this.#activePreview = webviewPanel.active ? preview : undefined;
		});

		preview.onDispose(() => {
			if (this.#activePreview === preview) {
				this.#activePreview = undefined;
			}
		});
	}

}
