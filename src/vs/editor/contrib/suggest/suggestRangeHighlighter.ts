/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorSelectionBackground, registerColor, editorSelectionHighlightBorder } from 'vs/platform/theme/common/colorRegistry';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { CompletionItem } from 'vs/editor/contrib/suggest/suggest';
import { TrackedRangeStickiness } from 'vs/editor/common/model';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { localize } from 'vs/nls';


const suggestReplaceBackgroundColor = registerColor(
	'editor.suggestReplaceBackground',
	{ light: editorSelectionBackground, dark: editorSelectionBackground, hc: editorSelectionBackground },
	localize('suggestReplaceBackground', "Background color of text that suggest will replace.")
);

const suggestReplaceBorderColor = registerColor(
	'editor.suggestReplaceBorder',
	{ light: null, dark: null, hc: editorSelectionHighlightBorder },
	localize('suggestReplaceBorder', "Border color of text that suggest will replace.")
);

registerThemingParticipant((theme, collector) => {
	const suggestReplaceBackground = theme.getColor(suggestReplaceBackgroundColor);
	if (suggestReplaceBackground) {
		collector.addRule(`.monaco-editor .suggestReplace { background-color: ${suggestReplaceBackground}; }`);
	}
	const suggestReplaceBorder = theme.getColor(suggestReplaceBorderColor);
	if (suggestReplaceBorder) {
		collector.addRule(`.monaco-editor .suggestReplace { border: 1px  ${theme.type === 'hc' ? 'dotted' : 'solid'} ${suggestReplaceBorder}; }`);
	}
});

export class SuggestRangeHighlighter {

	private readonly _disposables = new DisposableStore();

	private _decorations: string[] = [];
	private _hasWidgetListener: boolean = false;

	constructor(private readonly _controller: SuggestController) {

		this._disposables.add(_controller.model.onDidSuggest(e => {
			if (!e.shy) {
				const widget = this._controller.widget.getValue();
				const focused = widget.getFocusedItem();
				if (focused) {
					this._highlight(focused.item);
				}

				if (!this._hasWidgetListener) {
					this._hasWidgetListener = true;
					widget.onDidFocus(e => this._highlight(e.item), undefined, this._disposables);
				}
			}
		}));
		this._disposables.add(_controller.model.onDidCancel(() => {
			this._reset();
		}));
	}

	dispose(): void {
		this._reset();
		this._disposables.dispose();
	}

	private _reset(): void {
		this._decorations = this._controller.editor.deltaDecorations(this._decorations, []);
	}

	private _highlight(item: CompletionItem) {

		const { overwriteOnAccept, highlightReplaceRange } = this._controller.editor.getOption(EditorOption.suggest);

		if (highlightReplaceRange) {
			const info = this._controller.getOverwriteInfo(item, overwriteOnAccept);
			const position = this._controller.editor.getPosition()!;
			const range = new Range(
				position.lineNumber, position.column - info.overwriteBefore,
				position.lineNumber, position.column + info.overwriteAfter
			);

			this._decorations = this._controller.editor.deltaDecorations(this._decorations, [{
				range,
				options: {
					className: 'suggestReplace',
					stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
				}
			}]);
		}
	}
}
