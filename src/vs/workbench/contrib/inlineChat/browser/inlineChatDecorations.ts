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
import { GutterActionsRegistry } from 'vs/workbench/contrib/codeEditor/browser/editorLineNumberMenu';
import { Action } from 'vs/base/common/actions';
import { GutterMode } from 'vs/workbench/contrib/inlineChat/common/inlineChat';

const gutterInlineChatIcon = registerIcon('inline-chat', Codicon.sparkle, localize('startInlineChatIcon', 'Icon which spawns the inline chat from the gutter'));

export class InlineChatDecorationsContribution implements IEditorContribution {

	private gutterDecorationID: string | undefined;
	private cursorChangeListener: IDisposable | undefined;
	private clickChangeListener: IDisposable | undefined;

	public static readonly gutterSettingID = 'inlineChat.showGutterIcon';
	private static readonly gutterIconClassName = 'codicon-inline-chat';

	private static readonly GUTTER_DECORATION = ModelDecorationOptions.register({
		description: 'inline-chat-decoration',
		glyphMarginClassName: ThemeIcon.asClassName(gutterInlineChatIcon),
		glyphMargin: { position: GlyphMarginLane.Left },
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	});

	constructor(
		private readonly editor: ICodeEditor,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		this.configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration(InlineChatDecorationsContribution.gutterSettingID)) {
				return;
			}
			const gutterIconMode = this.configurationService.getValue<GutterMode>(InlineChatDecorationsContribution.gutterSettingID);
			if (gutterIconMode !== GutterMode.Never) {
				this.activateGutterDecoration();
			} else {
				this.deactivateGutterDecoration();
			}
		});
		const gutterIconMode = this.configurationService.getValue<GutterMode>(InlineChatDecorationsContribution.gutterSettingID);
		if (gutterIconMode !== GutterMode.Never) {
			this.activateGutterDecoration();
		}
	}

	private activateGutterDecoration() {
		this.cursorChangeListener = this.editor.onDidChangeCursorSelection(e => {
			this.updateGutterDecoration(e.selection);
		});
		this.clickChangeListener = this.editor.onMouseDown(async (e: IEditorMouseEvent) => {
			if (e.target.element?.classList.contains(InlineChatDecorationsContribution.gutterIconClassName)) {
				InlineChatController.get(this.editor)?.run();
			}
		});
		this.updateGutterDecoration(this.editor.getSelection());
	}

	private deactivateGutterDecoration() {
		this.removePreviousGutterDecoration();
		this.dispose();
	}

	private updateGutterDecoration(selection: Selection | null) {
		this.removePreviousGutterDecoration();
		if (!selection) {
			return;
		}
		const gutterIconMode = this.configurationService.getValue<GutterMode>(InlineChatDecorationsContribution.gutterSettingID);
		if (gutterIconMode === GutterMode.Always) {
			this.addDecoration(selection);
		}
		if (gutterIconMode === GutterMode.OnEmptyLine) {
			const textAtLine = this.editor.getModel()?.getLineContent(selection.startLineNumber);
			if (selection.isEmpty() && textAtLine && /^\s*$/g.test(textAtLine)) {
				this.addDecoration(selection);
			}
		}
	}

	private addDecoration(selection: Selection) {
		this.editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			this.gutterDecorationID = accessor.addDecoration(selection, InlineChatDecorationsContribution.GUTTER_DECORATION);
		});
	}

	private removePreviousGutterDecoration() {
		this.editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			if (this.gutterDecorationID) {
				accessor.removeDecoration(this.gutterDecorationID);
			}
		});
	}

	dispose() {
		this.cursorChangeListener?.dispose();
		this.clickChangeListener?.dispose();
		this.cursorChangeListener = undefined;
		this.clickChangeListener = undefined;
		this.gutterDecorationID = undefined;
	}
}

GutterActionsRegistry.registerGutterActionsGenerator(({ lineNumber, editor, accessor }, result) => {
	const configurationService = accessor.get(IConfigurationService);
	result.push(new Action(
		'inlineChat.toggleShowGutterIcon',
		localize('toggleShowGutterIcon', "Toggle Inline Chat Icon"),
		undefined,
		true,
		() => { configurationService.updateValue(InlineChatDecorationsContribution.gutterSettingID, !configurationService.getValue<boolean>(InlineChatDecorationsContribution.gutterSettingID)); }
	));
});
