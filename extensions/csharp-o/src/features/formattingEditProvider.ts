/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import AbstractSupport from './abstractProvider';
import * as proto from '../protocol';
import {Uri, DocumentRangeFormattingEditProvider, OnTypeFormattingEditProvider, FormattingOptions, CancellationToken, TextEdit, TextDocument, Range, Position} from 'vscode';

export default class FormattingSupport extends AbstractSupport implements DocumentRangeFormattingEditProvider {

	public provideDocumentRangeFormattingEdits(document: TextDocument, range: Range, options: FormattingOptions, token: CancellationToken): Promise<TextEdit[]> {

		let request = <proto.FormatRangeRequest>{
			Filename: document.fileName,
			Line: range.start.line + 1,
			Column: range.start.character + 1,
			EndLine: range.end.line + 1,
			EndColumn: range.end.character + 1
		};

		return this._server.makeRequest<proto.FormatRangeResponse>(proto.FormatRange, request, token).then(res => {
			if (res && Array.isArray(res.Changes)) {
				return res.Changes.map(FormattingSupport._asEditOptionation);
			}
		});
	}

	public provideOnTypeFormattingEdits(document: TextDocument, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): Promise<TextEdit[]> {

		let request = <proto.FormatAfterKeystrokeRequest> {
			Filename: document.fileName,
			Line: position.line + 1,
			Column: position.character + 1,
			Character: ch
		};

		return this._server.makeRequest<proto.FormatRangeResponse>(proto.FormatAfterKeystroke, request, token).then(res => {
			if (res && Array.isArray(res.Changes)) {
				return res.Changes.map(FormattingSupport._asEditOptionation);
			}
		});
	}

	private static _asEditOptionation(change: proto.TextChange): TextEdit {
		return new TextEdit(
			new Range(change.StartLine - 1, change.StartColumn - 1, change.EndLine - 1, change.EndColumn - 1),
			change.NewText);
	}
}
