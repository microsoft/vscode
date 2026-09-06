/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, TextDocumentContentChangeEvent } from 'vscode';
import { IAlternativeNotebookDocument } from '../../../../platform/notebook/common/alternativeNotebookTextDocument';
import { StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';

export function stringValueFromDoc(doc: TextDocument | IAlternativeNotebookDocument): StringText {
	return new StringText(doc.getText());
}

export function editFromTextDocumentContentChangeEvents(events: readonly TextDocumentContentChangeEvent[]): StringEdit {
	const replacementsInApplicationOrder = events.map(e => StringReplacement.replace(OffsetRange.ofStartAndLength(e.rangeOffset, e.rangeLength), e.text));
	return StringEdit.composeSequentialReplacements(replacementsInApplicationOrder);
}
