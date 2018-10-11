/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';

export type Maybe<T> = T | null | undefined;

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
		const leadingChars = Math.floor(previewOptions.charsPerLine / 5);
		const previewStart = Math.max(range.start.character - leadingChars, 0);
		const previewEnd = previewOptions.charsPerLine + previewStart;
		const endOfMatchRangeInPreview = Math.min(previewEnd, range.end.character - previewStart);

		preview = {
			text: fullText.substring(previewStart, previewEnd),
			match: new vscode.Range(0, range.start.character - previewStart, 0, endOfMatchRangeInPreview)
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
