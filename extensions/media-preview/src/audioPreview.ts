/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { MediaPreview, isGitLfsPointer, reopenAsText } from './mediaPreview';
import { escapeAttribute } from './util/dom';
import { generateUuid } from './util/uuid';

interface AudioPreviewDocument extends vscode.CustomDocument {
	readonly untitledDocumentData?: Uint8Array;
}

class AudioPreviewProvider implements vscode.CustomReadonlyEditorProvider<AudioPreviewDocument> {

	public static readonly viewType = 'vscode.audioPreview';

	constructor(
		private readonly extensionRoot: vscode.Uri,
		private readonly binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
	) { }

	public async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext): Promise<AudioPreviewDocument> {
		return {
			uri,
			untitledDocumentData: openContext.untitledDocumentData,
			dispose: () => { }
		};
	}

	public async resolveCustomEditor(document: AudioPreviewDocument, webviewEditor: vscode.WebviewPanel): Promise<void> {
		new AudioPreview(
			this.extensionRoot,
			document.uri,
			document.untitledDocumentData,
			webviewEditor,
			this.binarySizeStatusBarEntry
		);
	}
}


class AudioPreview extends MediaPreview {

	constructor(
		private readonly extensionRoot: vscode.Uri,
		resource: vscode.Uri,
		private readonly untitledDocumentData: Uint8Array | undefined,
		webviewEditor: vscode.WebviewPanel,
		binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
	) {
		super(extensionRoot, resource, webviewEditor, binarySizeStatusBarEntry);

		this._register(webviewEditor.webview.onDidReceiveMessage(message => {
			switch (message.type) {
				case 'reopen-as-text': {
					reopenAsText(resource, webviewEditor.viewColumn);
					break;
				}
			}
		}));

		this.updateBinarySize();
		this.render();
		this.updateState();
	}

	protected async getWebviewContents(): Promise<string> {
		const version = Date.now().toString();
		const src = await this.getResourcePath(
			this._webviewEditor,
			this._resource,
			version,
			this.untitledDocumentData
		);

		const settings = {
			src,
			isGitLfs: src === null,
		};

		const nonce = generateUuid();

		const cspSource = this._webviewEditor.webview.cspSource;
		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">

	<!-- Disable pinch zooming -->
	<meta name="viewport"
		content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">

	<title>Audio Preview</title>

	<link rel="stylesheet" href="${escapeAttribute(this.extensionResource('media', 'audioPreview.css'))}" type="text/css" media="screen" nonce="${nonce}">

	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${cspSource}; media-src data: ${cspSource}; script-src 'nonce-${nonce}'; style-src ${cspSource} 'nonce-${nonce}';">
	<meta id="settings" data-settings="${escapeAttribute(JSON.stringify(settings))}">
</head>
<body class="container loading" data-vscode-context='{ "preventDefaultContextMenuItems": true }'>
	<div class="loading-indicator"></div>
	<div class="loading-error">
		<p>${vscode.l10n.t("An error occurred while loading the audio file.")}</p>
		<a href="#" class="open-file-link">${vscode.l10n.t("Open file using VS Code's standard text/binary editor?")}</a>
	</div>
	<div class="git-lfs-info">
		<p>${vscode.l10n.t("The audio file is stored with Git LFS and is not available for preview.")}</p>
		<a href="#" class="open-file-link">${vscode.l10n.t("Open file using VS Code's standard text/binary editor?")}</a>
	</div>
	<script src="${escapeAttribute(this.extensionResource('media', 'audioPreview.js'))}" nonce="${nonce}"></script>
</body>
</html>`;
	}

	private async getResourcePath(
		webviewEditor: vscode.WebviewPanel,
		resource: vscode.Uri,
		version: string,
		untitledDocumentData: Uint8Array | undefined
	): Promise<string | null> {
		if (resource.scheme === 'untitled' && untitledDocumentData) {
			let binary = '';
			const chunkSize = 0x8000;

			for (let i = 0; i < untitledDocumentData.length; i += chunkSize) {
				binary += String.fromCharCode(...untitledDocumentData.subarray(i, i + chunkSize));
			}

			const base64 = this.toBase64(binary);
			const mimeType = this.getMimeType(resource.path);

			return `data:${mimeType};base64,${base64}`;
		}

		if (await isGitLfsPointer(resource)) {
			return null;
		}

		// Avoid adding cache busting if there is already a query string
		if (resource.query) {
			return webviewEditor.webview.asWebviewUri(resource).toString();
		}

		return webviewEditor.webview.asWebviewUri(resource).with({ query: `version=${version}` }).toString();
	}

	private getMimeType(path: string): string {
		switch (path.split('.').pop()?.toLowerCase()) {
			case 'mp3': return 'audio/mpeg';
			case 'wav': return 'audio/wav';
			case 'ogg': return 'audio/ogg';
			case 'flac': return 'audio/flac';
			case 'aac': return 'audio/aac';
			case 'm4a': return 'audio/mp4';
			case 'webm': return 'audio/webm';
			default: return 'audio/mpeg';
		}
	}

	private toBase64(binary: string): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
		let result = '';

		for (let i = 0; i < binary.length; i += 3) {
			const byte1 = binary.charCodeAt(i);
			const byte2 = i + 1 < binary.length ? binary.charCodeAt(i + 1) : 0;
			const byte3 = i + 2 < binary.length ? binary.charCodeAt(i + 2) : 0;

			result += chars[byte1 >> 2];
			result += chars[((byte1 & 3) << 4) | (byte2 >> 4)];
			result += i + 1 < binary.length ? chars[((byte2 & 15) << 2) | (byte3 >> 6)] : '=';
			result += i + 2 < binary.length ? chars[byte3 & 63] : '=';
		}

		return result;
	}

	private extensionResource(...parts: string[]) {
		return this._webviewEditor.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionRoot, ...parts));
	}
}

export function registerAudioPreviewSupport(context: vscode.ExtensionContext, binarySizeStatusBarEntry: BinarySizeStatusBarEntry): vscode.Disposable {
	const provider = new AudioPreviewProvider(context.extensionUri, binarySizeStatusBarEntry);
	return vscode.window.registerCustomEditorProvider(AudioPreviewProvider.viewType, provider, {
		supportsMultipleEditorsPerDocument: true,
		webviewOptions: {
			retainContextWhenHidden: true,
		}
	});
}
