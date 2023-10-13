/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { GlyphMarginLane, IModelDecorationsChangeAccessor, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { localize } from 'vs/nls';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Selection } from 'vs/editor/common/core/selection';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDisposable } from 'vs/base/common/lifecycle';

const startInlineChatIcon = registerIcon('inline-chat', Codicon.sparkle, localize('startInlineChatIcon', 'Icon which spawns the inline chat from the gutter'));

export class InlineChatDecorationsContribution implements IEditorContribution {

	private previousID: string | undefined;
	private cursorChangeListener: IDisposable | undefined;
	private clickChangeListener: IDisposable | undefined;

	private readonly settingID = 'inlineChat.showGutterIcon';
	private readonly className = 'codicon-inline-chat';

	private static readonly START_INLINE_CHAT_DECORATION = ModelDecorationOptions.register({
		description: 'inline-chat-decoration',
		glyphMarginClassName: ThemeIcon.asClassName(startInlineChatIcon),
		glyphMargin: { position: GlyphMarginLane.Left },
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	});

	constructor(
		private readonly editor: ICodeEditor,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		this.configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration(this.settingID)) {
				return;
			}
			const showGutterIcon = this.configurationService.getValue<boolean>(this.settingID);
			if (showGutterIcon) {
				this.activateDecorations();
			} else {
				this.removePreviousDecoration();
			}
		});
		const showGutterIcon = this.configurationService.getValue<boolean>(this.settingID);
		if (showGutterIcon) {
			this.activateDecorations();
		}
	}

	private activateDecorations() {
		this.cursorChangeListener = this.editor.onDidChangeCursorSelection(e => this.updateDecorations(e.selection));
		this.clickChangeListener = this.editor.onMouseDown(async (e: IEditorMouseEvent) => {
			if (e.target.element?.classList.contains(this.className)) {
				InlineChatController.get(this.editor)?.run();
			}
		});
		this.updateDecorations(this.editor.getSelection());
	}

	private updateDecorations(selection: Selection | null) {
		if (!selection) {
			return;
		}
		this.editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			this.removePreviousDecoration();
			this.previousID = accessor.addDecoration(selection, InlineChatDecorationsContribution.START_INLINE_CHAT_DECORATION);
		});
	}

	private removePreviousDecoration() {
		this.editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			if (this.previousID) {
				accessor.removeDecoration(this.previousID);
			}
		});
	}

	dispose() {
		this.cursorChangeListener?.dispose();
		this.clickChangeListener?.dispose();
	}
}
