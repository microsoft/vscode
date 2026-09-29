/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { ILanguage, getLanguage } from '../../../util/common/languages';
import { findLast } from '../../../util/vs/base/common/arraysFind';
import { Mutable } from '../../../util/vs/base/common/types';
import { ChatRequestEditorData, ChatRequestNotebookData, Range, Selection } from '../../../vscodeTypes';
import { CopilotInteractiveEditorResponse } from '../../inlineChat/node/promptCraftingTypes';
import { Turn } from '../common/conversation';

export interface IDocumentContext {
	readonly document: TextDocumentSnapshot;
	readonly fileIndentInfo: vscode.FormattingOptions | undefined;
	readonly language: ILanguage;
	readonly wholeRange: vscode.Range;
	readonly selection: vscode.Selection;
}

export namespace IDocumentContext {
	export function fromEditor(editor: vscode.TextEditor, wholeRange?: vscode.Range): IDocumentContext {
		const { options, document, selection, visibleRanges } = editor;
		const docSnapshot = TextDocumentSnapshot.create(document);
		const fileIndentInfo = {
			insertSpaces: options.insertSpaces as boolean,
			tabSize: options.tabSize as number,
		};
		const language = getLanguage(docSnapshot);
		if (!wholeRange) {
			if (visibleRanges.length === 1) {
				wholeRange = visibleRanges[0];
			} else if (visibleRanges.length > 1) {
				wholeRange = visibleRanges[0].union(visibleRanges[visibleRanges.length - 1]);
			} else {
				wholeRange = selection;
			}
		}
		return {
			document: docSnapshot, fileIndentInfo, language, selection, wholeRange
		};

	}

	export function fromTextDocument(document: vscode.TextDocument, selection: vscode.Selection, wholeRange?: vscode.Range): IDocumentContext {
		const docSnapshot = TextDocumentSnapshot.create(document);
		const language = getLanguage(docSnapshot);
		if (!wholeRange) {
			wholeRange = selection;
		}
		return {
			document: docSnapshot, fileIndentInfo: undefined, language, selection, wholeRange
		};
	}

	export function inferDocumentContext(request: vscode.ChatRequest, activeEditor: vscode.TextEditor | undefined, previousTurns: Turn[]): IDocumentContext | undefined {

		let result: Mutable<IDocumentContext> | undefined;

		if (request.location2 instanceof ChatRequestEditorData) {
			const { document, wholeRange, selection } = request.location2;
			const docSnapshot = TextDocumentSnapshot.create(document);
			result = {
				document: docSnapshot,
				language: getLanguage(document),
				wholeRange,
				selection,
				fileIndentInfo: undefined
			};

		} else if (request.location2 instanceof ChatRequestNotebookData) {
			const { cell } = request.location2;
			const cellSnapshot = TextDocumentSnapshot.create(cell);
			result = {
				document: cellSnapshot,
				language: getLanguage(cell),
				wholeRange: new Range(0, 0, 0, 0),
				selection: new Selection(0, 0, 0, 0),
				fileIndentInfo: undefined
			};

		} else if (activeEditor) {
			result = IDocumentContext.fromEditor(activeEditor);
		}

		if (result) {
			const lastTurnWithInlineResponse = findLast(previousTurns, turn => Boolean(turn.getMetadata(CopilotInteractiveEditorResponse)));
			const data = lastTurnWithInlineResponse?.getMetadata(CopilotInteractiveEditorResponse);
			if (data && data.store && data.store.lastDocumentContent === result.document.getText()) {
				result.wholeRange = data.store.lastWholeRange;
			}
		}

		// DEFAULT - use the active editor's indent settings if none are set yet and if the editor and context document match
		if (activeEditor && activeEditor?.document.uri.toString() === result?.document.uri.toString() && !result.fileIndentInfo) {
			result.fileIndentInfo = {
				insertSpaces: activeEditor.options.insertSpaces as boolean,
				tabSize: activeEditor.options.tabSize as number,
			};
		}

		return result;
	}
}
