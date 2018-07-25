/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';

// Allowed Editor Contributions:
import { MenuPreventer } from 'vs/workbench/parts/codeEditor/electron-browser/menuPreventer';
import { SelectionClipboard } from 'vs/workbench/parts/codeEditor/electron-browser/selectionClipboard';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/contextmenu';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { TabCompletionController } from 'vs/workbench/parts/snippets/electron-browser/tabCompletion';

export class SimpleWidgetEditorConfig {

	public static getCodeEditorWidgetOptions(): ICodeEditorWidgetOptions {
		return {
			isSimpleWidget: true,
			contributions: [
				MenuPreventer,
				SelectionClipboard,
				ContextMenuController,
				SuggestController,
				SnippetController2,
				TabCompletionController,
			]
		};
	}

	public static getEditorOptions(style: 'editor' | 'htmlinput', ariaLabel?: string): IEditorOptions {
		if (style === 'editor') {
			return {
				wordWrap: 'on',
				overviewRulerLanes: 0,
				glyphMargin: false,
				lineNumbers: 'off',
				folding: false,
				selectOnLineNumbers: false,
				hideCursorInOverviewRuler: true,
				selectionHighlight: false,
				scrollbar: {
					horizontal: 'hidden'
				},
				ariaLabel: ariaLabel || '',
				lineDecorationsWidth: 0,
				overviewRulerBorder: false,
				scrollBeyondLastLine: false,
				renderLineHighlight: 'none',
				fixedOverflowWidgets: true,
				acceptSuggestionOnEnter: 'smart',
				minimap: {
					enabled: false
				}
			};
		}
		else {
			return {
				fontSize: 13,
				lineHeight: 22,
				wordWrap: 'off',
				overviewRulerLanes: 0,
				glyphMargin: false,
				lineNumbers: 'off',
				folding: false,
				selectOnLineNumbers: false,
				hideCursorInOverviewRuler: true,
				selectionHighlight: false,
				scrollbar: {
					horizontal: 'hidden',
					vertical: 'hidden'
				},
				ariaLabel: ariaLabel || '',
				cursorWidth: 1,
				lineDecorationsWidth: 0,
				overviewRulerBorder: false,
				scrollBeyondLastLine: false,
				renderLineHighlight: 'none',
				fixedOverflowWidgets: true,
				acceptSuggestionOnEnter: 'smart',
				minimap: {
					enabled: false
				},
				fontFamily: ' -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "HelveticaNeue-Light", "Ubuntu", "Droid Sans", sans-serif'
			};
		}
	}
}
