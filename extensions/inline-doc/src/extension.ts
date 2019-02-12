/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CancellationToken,
	CodeInset,
	CodeInsetProvider,
	ExtensionContext,
	languages,
	ProviderResult,
	TextDocument,
	TextDocumentContentProvider,
	Uri,
	window,
	workspace
} from 'vscode';

const URI_SCHEME = 'inline-doc';

export function activate(context: ExtensionContext): void {
	let activeTextEditor = window.activeTextEditor;
	if (!activeTextEditor) { return; }

	const selector = [
		{ scheme: 'file', language: 'typescript' },
		{ scheme: 'unknown', language: 'typescript' },
	];
	const provider = new DocCodeInsetProvider();
	context.subscriptions.push(
		languages.registerCodeInsetProvider(selector, provider)
	);
	context.subscriptions.push(
		workspace.registerTextDocumentContentProvider(
			URI_SCHEME, new InlineDocumentationProvider())
	);
}

class DocCodeInsetProvider implements CodeInsetProvider {
	provideCodeInsets(document: TextDocument, _cancellationToken: CancellationToken): ProviderResult<CodeInset[]> {
		return scanForRegexp(document);
	}
}

const inlineRegex = /INLINE\s+(https?:\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:/~+#-]*[\w@?^=%&amp;/~+#-])?)/;


function scanForRegexp(doc: TextDocument): CodeInset[] {
	if (!doc) { return []; }
	let result: CodeInset[] = [];
	for (let i = 0; i < doc.lineCount; i++) {
		const line = doc.lineAt(i);
		const match = inlineRegex.exec(line.text);
		if (match && match.length > 1) {
			const uri = Uri.parse(match[1]);
			const docUri = Uri.parse(`${URI_SCHEME}:${uri}`);
			result.push({
				range: line.range,
				uri: docUri,
				isResolved: true,
			});
		}
	}
	return result;
}

const MAX_HEIGHT = 1000;

class InlineDocumentationProvider implements TextDocumentContentProvider {
	provideTextDocumentContent(docUri: Uri, _token: CancellationToken): ProviderResult<string> {
		const uri = docUri.path;
		const html = `<!doctype html>
			<html lang="en">
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
				</head>
				<body>
					<script>window.onerror=function(){console.log('ERR!')}</script>
					<p id='error-message' style="display:none">Unable to embed content at ${uri}. Some web sites do not support embedding.</p>
					<iframe id='hostframe' src="${uri}" style="overflow:scroll" frameborder=0></iframe>
					<script>
						const vscode = acquireVsCodeApi();
						const iframe = document.getElementById('hostframe');
						iframe.onload = function() {
							const body = iframe.contentWindow.document.body;
							if (!body.innerHTML) {
								document.getElementById('error-message').style.display = 'block';
								iframe.style.display = 'none';
							}
							const width = body.scrollWidth;
							const height = Math.min(${MAX_HEIGHT}, body.scrollHeight);
							iframe.width = width;
							iframe.height = height;
							vscode.postMessage({ type: 'size-info', payload: { width: width, height: height } });
						}
					</script>
				</body>
			</html>`;
		return html;
	}
}