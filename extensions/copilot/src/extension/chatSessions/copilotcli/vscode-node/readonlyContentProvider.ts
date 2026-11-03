/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, TextDocumentContentProvider, Uri, workspace } from 'vscode';

export const READONLY_SCHEME = 'copilot-cli-readonly';

export class ReadonlyContentProvider implements TextDocumentContentProvider {
	private readonly _contentStore = new Map<string, string>();

	provideTextDocumentContent(uri: Uri): string {
		const content = this._contentStore.get(uri.toString());
		return content ?? '';
	}

	setContent(uri: Uri, content: string): void {
		this._contentStore.set(uri.toString(), content);
	}

	clearContent(uri: Uri): void {
		this._contentStore.delete(uri.toString());
	}

	register(): Disposable {
		return workspace.registerTextDocumentContentProvider(READONLY_SCHEME, this);
	}
}

export function createReadonlyUri(originalPath: string, suffix: string): Uri {
	const fileUri = Uri.file(originalPath);
	return Uri.from({
		scheme: READONLY_SCHEME,
		path: fileUri.path,
		query: suffix,
	});
}
