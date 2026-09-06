/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { splitLines } from '../../../vs/base/common/strings';
import { URI as Uri, UriComponents } from '../../../vs/base/common/uri';
import { IModelChangedEvent } from '../../../vs/editor/common/model/mirrorTextModel';
import { ExtHostDocumentData, IExtHostDocumentSaveDelegate } from '../../../vs/workbench/api/common/extHostDocumentData';
import { EndOfLine } from '../../../vs/workbench/api/common/extHostTypes/textEdit';

export interface IExtHostDocumentData {
	readonly document: vscode.TextDocument;
	getText(): string;
	onEvents(e: IModelChangedEvent): void;
}

export function createTextDocumentData(uri: Uri, contents: string, languageId: string, eol: '\r\n' | '\n' | undefined = undefined): IExtHostDocumentData {
	const lines = splitLines(contents);
	eol = eol ?? (contents.indexOf('\r\n') !== -1 ? '\r\n' : '\n');
	const delegate: IExtHostDocumentSaveDelegate = {
		$trySaveDocument: function (uri: UriComponents): Promise<boolean> {
			throw new Error('Not implemented.');
		}
	};
	return new ExtHostDocumentData(delegate, uri, lines, eol, 1, languageId, false, 'utf8', false);
}

export function setDocText(doc: IExtHostDocumentData, text: string): void {
	doc.onEvents({
		changes: [
			{
				range: {
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: doc.document.lineCount,
					endColumn: doc.document.lineAt(doc.document.lineCount - 1).text.length + 1,
				},
				rangeOffset: 0,
				rangeLength: doc.document.getText().length,
				text: text,
			},
		],
		versionId: doc.document.version + 1,
		eol: (doc.document.eol === EndOfLine.LF ? '\n' : '\r\n'),
		isUndoing: false,
		isRedoing: false,
	});
}
