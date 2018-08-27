/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as vscode from 'vscode';

export function fixDriveC(_path: string): string {
	const root = path.parse(_path).root;
	return root.toLowerCase() === 'c:/' ?
		_path.replace(/^c:[/\\]/i, '/') :
		_path;
}

export function anchorGlob(glob: string): string {
	return glob.startsWith('**') || glob.startsWith('/') ? glob : `/${glob}`;
}

export function createTextSearchResult(uri: vscode.Uri, fullText: string, range: vscode.Range, previewOptions?: vscode.TextSearchPreviewOptions): vscode.TextSearchResult {
	let preview: vscode.TextSearchResultPreview;
	if (previewOptions) {
		const previewStart = Math.max(range.start.character - previewOptions.leadingChars, 0);
		const previewEnd = Math.max(previewOptions.totalChars + previewStart, range.end.character);

		preview = {
			text: fullText.substring(previewStart, previewEnd),
			match: new vscode.Range(0, range.start.character - previewStart, 0, range.end.character - previewStart)
		};
	} else {
		preview = {
			text: fullText,
			match: new vscode.Range(0, range.start.character, 0, range.end.character)
		};
	}

	return <vscode.TextSearchResult>{
		uri,
		range,
		preview
	};
}
