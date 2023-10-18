/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { GlyphMarginLane, IModelDecorationsChangeAccessor, ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { localize } from 'vs/nls';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Selection } from 'vs/editor/common/core/selection';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { GutterActionsRegistry } from 'vs/workbench/contrib/codeEditor/browser/editorLineNumberMenu';
import { Action } from 'vs/base/common/actions';
import { CTX_INLINE_CHAT_VISIBLE, IInlineChatService } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Iterable } from 'vs/base/common/iterator';

const GUTTER_INLINE_CHAT_ICON = registerIcon('inline-chat', Codicon.sparkle, localize('startInlineChatIcon', 'Icon which spawns the inline chat from the gutter'));

export class InlineChatDecorationsContribution extends Disposable implements IEditorContribution {

	private _localToDispose = new DisposableStore();
	private _inlineChatLineNumber: number | undefined;
	private _gutterDecorationID: string | undefined;
	private _gutterDecorationLine: number | undefined;

	public static readonly GUTTER_SETTING_ID = 'inlineChat.showGutterIcon';
	private static readonly GUTTER_ICON_CLASSNAME = 'codicon-inline-chat';
	private static readonly GUTTER_DECORATION = ModelDecorationOptions.register({
		description: 'inline-chat-decoration',
		glyphMarginClassName: ThemeIcon.asClassName(GUTTER_INLINE_CHAT_ICON),
		glyphMargin: { position: GlyphMarginLane.Left },
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	});

	constructor(
		private readonly editor: ICodeEditor,
		@IInlineChatService private readonly inlineChatService: IInlineChatService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration((e: IConfigurationChangeEvent) => {
			if (!e.affectsConfiguration(InlineChatDecorationsContribution.GUTTER_SETTING_ID)) {
				return;
			}
			this._onEnablementOrModelChanged();
		}));
		this._register(this.inlineChatService.onDidChangeProviders(() => this._onEnablementOrModelChanged()));
		this._register(this.editor.onDidChangeModel(() => this._onEnablementOrModelChanged()));
	}

	private _onEnablementOrModelChanged(): void {
		// cancels the scheduler, removes editor listeners / removes decoration
		this._localToDispose.clear();
		const model = this.editor.getModel();
		if (!model || !this._isSettingEnabled() || !this._hasProvider()) {
			return;
		}
		const decorationUpdateScheduler = new RunOnceScheduler(() => this._onSelectionOrContentChanged(model), 200);
		this._localToDispose.add(decorationUpdateScheduler);
		this._localToDispose.add(this.editor.onDidChangeCursorSelection(() => decorationUpdateScheduler.schedule()));
		this._localToDispose.add(this.editor.onDidChangeModelContent(() => decorationUpdateScheduler.schedule()));
		this._localToDispose.add(this.editor.onMouseDown(async (e: IEditorMouseEvent) => {
			if (!e.target.element?.classList.contains(InlineChatDecorationsContribution.GUTTER_ICON_CLASSNAME) || !model) {
				return;
			}
			const selection = this.editor.getSelection();
			if (!selection) {
				return;
			}
			const startLineNumber = selection.startLineNumber;
			const inlineChatPositionUnchanged = startLineNumber === this._inlineChatLineNumber;
			const inlineChatVisible = this.contextKeyService.getContextKeyValue<boolean>(CTX_INLINE_CHAT_VISIBLE.key);
			if (inlineChatPositionUnchanged && inlineChatVisible) {
				return;
			}
			this._inlineChatLineNumber = startLineNumber;
			InlineChatController.get(this.editor)?.run();
		}));
		this._localToDispose.add({ dispose: () => this._clearDecorations() });
		decorationUpdateScheduler.schedule();
	}

	private _onSelectionOrContentChanged(model: ITextModel): void {
		const selection = this.editor.getSelection();
		if (!selection) {
			return;
		}
		// If no existing decoration, add a decoration
		if (this._gutterDecorationLine === undefined || this._gutterDecorationID === undefined) {
			this._addDecoration(selection.startLineNumber);
			return;
		}
		// Else if there is an existing decoration
		const selectionIsEmpty = selection.isEmpty();
		const selectionLineIsEmpty = /^\s*$/g.test(model.getLineContent(selection.startLineNumber));
		const shouldBeEnabled = selectionIsEmpty && selectionLineIsEmpty;

		// If the new selection starts at the same line number
		if (selection.startLineNumber === this._gutterDecorationLine) {
			if (shouldBeEnabled) {
				// already enabled
				return;
			} else {
				// remove decoration
				this._removePreviousGutterDecoration();
				return;
			}
		}
		// Else if the new selection does not start on the same line number
		this._removePreviousGutterDecoration();
		if (shouldBeEnabled) {
			this._addDecoration(selection.startLineNumber);
		}
	}

	private _isSettingEnabled(): boolean {
		return this.configurationService.getValue<boolean>(InlineChatDecorationsContribution.GUTTER_SETTING_ID);
	}

	private _hasProvider(): boolean {
		return !Iterable.isEmpty(this.inlineChatService.getAllProvider());
	}

	private _addDecoration(lineNumber: number) {
		this.editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			this._gutterDecorationLine = lineNumber;
			this._gutterDecorationID = accessor.addDecoration(new Selection(lineNumber, 0, lineNumber, 0), InlineChatDecorationsContribution.GUTTER_DECORATION);
		});
	}

	private _removePreviousGutterDecoration() {
		this.editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			if (this._gutterDecorationID) {
				accessor.removeDecoration(this._gutterDecorationID);
				this._resetDecorationData();
			}
		});
	}

	private _resetDecorationData() {
		this._gutterDecorationID = undefined;
		this._gutterDecorationLine = undefined;
	}

	private _clearDecorations() {
		this._inlineChatLineNumber = undefined;
		this._removePreviousGutterDecoration();
		// Needed for when moving from model to settings
		this._resetDecorationData();
	}

	override dispose() {
		super.dispose();
		this._localToDispose.dispose();
		this._inlineChatLineNumber = undefined;
	}
}

GutterActionsRegistry.registerGutterActionsGenerator(({ lineNumber, editor, accessor }, result) => {
	const configurationService = accessor.get(IConfigurationService);
	result.push(new Action(
		'inlineChat.toggleShowGutterIcon',
		localize('toggleShowGutterIcon', "Toggle Inline Chat Icon"),
		undefined,
		true,
		() => { configurationService.updateValue(InlineChatDecorationsContribution.GUTTER_SETTING_ID, !configurationService.getValue<boolean>(InlineChatDecorationsContribution.GUTTER_SETTING_ID)); }
	));
});
