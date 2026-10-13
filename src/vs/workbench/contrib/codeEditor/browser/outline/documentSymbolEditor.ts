/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { IPosition } from '../../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { Selection, SelectionDirection } from '../../../../../editor/common/core/selection.js';
import { ScrollType } from '../../../../../editor/common/editorCommon.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
import { IEditorOptions, TextEditorSelectionRevealType } from '../../../../../platform/editor/common/editor.js';
import { ICustomTextEditorNavigation } from '../../../customEditor/common/customTextEditorNavigation.js';
import { IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';

export interface IDocumentSymbolEditor {
	readonly onDidChangeModel: Event<unknown>;
	readonly onDidChangeModelLanguage: Event<unknown>;
	readonly onDidChangeModelContent: Event<IModelContentChangedEvent>;
	readonly onDidChangeCursorPosition: Event<unknown>;
	readonly onDidDispose: Event<void>;
	getModel(): ITextModel | null;
	getPosition(): IPosition | null;
	reveal(resource: URI, range: IRange, selection: IRange, options: IEditorOptions, sideBySide: boolean): Promise<void>;
	preview(range: IRange): IDisposable;
	captureViewState(): IDisposable;
}

export function codeEditorDocumentSymbolAdapter(editor: ICodeEditor, codeEditorService: ICodeEditorService): IDocumentSymbolEditor {
	return {
		onDidChangeModel: editor.onDidChangeModel,
		onDidChangeModelLanguage: editor.onDidChangeModelLanguage,
		onDidChangeModelContent: editor.onDidChangeModelContent,
		onDidChangeCursorPosition: editor.onDidChangeCursorPosition,
		onDidDispose: editor.onDidDispose,
		getModel: () => editor.getModel(),
		getPosition: () => editor.getPosition(),
		reveal: async (resource, _range, selection, options, sideBySide) => {
			await codeEditorService.openCodeEditor({
				resource,
				options: { ...options, selection, selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport }
			}, editor, sideBySide);
		},
		preview: range => {
			editor.revealRangeInCenterIfOutsideViewport(range, ScrollType.Smooth);
			const decorations = editor.createDecorationsCollection([{
				range,
				options: { description: 'document-symbols-outline-range-highlight', className: 'rangeHighlight', isWholeLine: true }
			}]);
			return toDisposable(() => decorations.clear());
		},
		captureViewState: () => {
			const state = editor.saveViewState();
			return toDisposable(() => {
				if (state) {
					editor.restoreViewState(state);
				}
			});
		}
	};
}

export function customTextEditorDocumentSymbolAdapter(navigation: ICustomTextEditorNavigation, viewType: string, editorService: IEditorService): IDocumentSymbolEditor {
	return {
		onDidChangeModel: Event.None,
		onDidChangeModelLanguage: navigation.model.onDidChangeLanguage,
		onDidChangeModelContent: navigation.model.onDidChangeContent.bind(navigation.model),
		onDidChangeCursorPosition: navigation.onDidChangeSelection,
		onDidDispose: navigation.onDidDispose,
		getModel: () => navigation.model.isDisposed() ? null : navigation.model,
		getPosition: () => navigation.selection ? { lineNumber: navigation.selection.positionLineNumber, column: navigation.selection.positionColumn } : null,
		reveal: async (resource, range, selection, options, sideBySide) => {
			if (sideBySide) {
				await editorService.openEditor({
					resource,
					options: { ...options, override: viewType, selection, selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport }
				}, SIDE_GROUP);
			} else {
				await navigation.revealRange(range, Selection.fromRange(Range.lift(selection), SelectionDirection.LTR), !!options.preserveFocus, CancellationToken.None);
			}
		},
		preview: range => {
			const cancellation = new CancellationTokenSource();
			void navigation.revealRange(range, undefined, true, cancellation.token);
			return toDisposable(() => cancellation.dispose(true));
		},
		captureViewState: () => navigation.captureViewState()
	};
}
