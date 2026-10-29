/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const providerId = 'checkboxCount';
const runtimeUris = new Map<string, vscode.Uri>();
const runtimeKeys = new Map<string, string>();
let nextRuntimeId = 1;

interface MarkdownCodeBlockEditorResolveRequest {
	readonly documentUri: vscode.Uri;
}

interface MarkdownCodeBlockEditorHostTransport {
	readonly runtimeKey: string;
	sendMessage(message: TaskProgressMessage): void;
	onDidReceiveMessage(listener: (message: unknown) => void): vscode.Disposable;
	onDidDispose(listener: () => void): vscode.Disposable;
}

interface TaskProgressMessage {
	readonly type: 'taskProgress';
	readonly checked: number;
	readonly total: number;
}

export function activate(context: vscode.ExtensionContext) {
	const provider = {
		async resolve(request: MarkdownCodeBlockEditorResolveRequest) {
			const documentKey = request.documentUri.toString();
			let runtimeKey = runtimeKeys.get(documentKey);
			if (!runtimeKey) {
				runtimeKey = `checkbox-count:${nextRuntimeId++}`;
				runtimeKeys.set(documentKey, runtimeKey);
				runtimeUris.set(runtimeKey, request.documentUri);
			}

			return {
				content: {
					uri: vscode.Uri.joinPath(context.extensionUri, 'editor', 'index.html'),
				},
				runtimeKey,
				contentType: 'text',
				initialHeight: 84,
			};
		},

		async createHostTransport(transport: MarkdownCodeBlockEditorHostTransport, token: vscode.CancellationToken) {
			const documentUri = runtimeUris.get(transport.runtimeKey);
			if (!documentUri) {
				throw new Error(`Unknown checkbox-count runtime: ${transport.runtimeKey}`);
			}

			const document = await vscode.workspace.openTextDocument(documentUri);
			if (token.isCancellationRequested) {
				return;
			}

			const update = () => {
				const progress = getTaskProgress(document.getText());
				transport.sendMessage({
					type: 'taskProgress',
					checked: progress.checked,
					total: progress.total,
				});
			};

			const documentListener = vscode.workspace.onDidChangeTextDocument(event => {
				if (event.document.uri.toString() === document.uri.toString()) {
					update();
				}
			});
			const messageListener = transport.onDidReceiveMessage(message => {
				if (isReadyMessage(message)) {
					update();
				}
			});
			const disposeListener = transport.onDidDispose(() => {
				console.log(`Disposed checkbox-count runtime ${transport.runtimeKey}`);
			});
			return vscode.Disposable.from(documentListener, messageListener, disposeListener);
		},
	};

	return {
		markdownCodeBlockEditors: {
			apiV2: {
				getProvider(id) {
					return id === providerId ? provider : undefined;
				},
			},
		},
	};
}

function isReadyMessage(message: unknown): message is { readonly type: 'ready' } {
	return typeof message === 'object' && message !== null && 'type' in message && message.type === 'ready';
}

function getTaskProgress(text: string) {
	const tasks = Array.from(text.matchAll(/^\s*[-*+]\s+\[(?<state>[ x])\]/gim));
	return {
		checked: tasks.filter(task => task.groups?.state.toLowerCase() === 'x').length,
		total: tasks.length,
	};
}
