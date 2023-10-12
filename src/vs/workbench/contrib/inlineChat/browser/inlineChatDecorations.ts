/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { GlyphMarginLane, IModelDecorationsChangeAccessor, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { localize } from 'vs/nls';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Selection } from 'vs/editor/common/core/selection';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';

const startInlineChatIcon = registerIcon('start-inline-chat', Codicon.sparkle, localize('startInlineChatIcon', 'Icon for starting the inline chat'));

export class InlineChatDecorationsContribution implements IEditorContribution {

	private previousID: string | undefined;

	private static readonly START_INLINE_CHAT_DECORATION = ModelDecorationOptions.register({
		description: 'start-inline-chat-decoration',
		glyphMarginClassName: ThemeIcon.asClassName(startInlineChatIcon),
		glyphMargin: { position: GlyphMarginLane.Left },
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	});

	constructor(
		editor: ICodeEditor
	) {
		editor.onDidChangeCursorSelection(e => this.updateDecorations(editor, e.selection));
		this.updateDecorations(editor, editor.getSelection());
		window.addEventListener('click', event => {
			const target = event.target as HTMLElement;
			if (target.classList.contains('codicon-start-inline-chat')) {
				InlineChatController.get(editor)?.run({});
			}
		});
	}

	private updateDecorations(editor: ICodeEditor, selection: Selection | null) {
		if (!selection) {
			return;
		}
		editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			if (this.previousID) {
				accessor.removeDecoration(this.previousID);
			}
			this.previousID = accessor.addDecoration(selection, InlineChatDecorationsContribution.START_INLINE_CHAT_DECORATION);
		});
	}

	dispose() { }
}
