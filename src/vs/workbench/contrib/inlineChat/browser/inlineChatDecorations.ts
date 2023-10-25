/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { IActiveCodeEditor, ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { GlyphMarginLane, IModelDecorationsChangeAccessor, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { localize } from 'vs/nls';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { GutterActionsRegistry } from 'vs/workbench/contrib/codeEditor/browser/editorLineNumberMenu';
import { Action } from 'vs/base/common/actions';
import { IInlineChatService } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Iterable } from 'vs/base/common/iterator';
import { Range } from 'vs/editor/common/core/range';
import { IInlineChatSessionService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { LOCALIZED_START_INLINE_CHAT_STRING } from 'vs/workbench/contrib/inlineChat/browser/inlineChatActions';

const GUTTER_INLINE_CHAT_ICON = registerIcon('inline-chat', Codicon.sparkle, localize('startInlineChatIcon', 'Icon which spawns the inline chat from the gutter'));

export class InlineChatDecorationsContribution extends Disposable implements IEditorContribution {

	private _gutterDecorationID: string | undefined;
	private readonly _localToDispose = new DisposableStore();
	private readonly _gutterDecoration: ModelDecorationOptions;

	public static readonly GUTTER_SETTING_ID = 'inlineChat.showGutterIcon';
	private static readonly GUTTER_ICON_CLASSNAME = 'codicon-inline-chat';

	constructor(
		private readonly _editor: ICodeEditor,
		@IInlineChatService private readonly _inlineChatService: IInlineChatService,
		@IInlineChatSessionService private readonly _inlineChatSessionService: IInlineChatSessionService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IKeybindingService readonly _keybindingService: IKeybindingService,
	) {
		super();
		const keybindings = _keybindingService.lookupKeybinding('inlineChat.start')?.getLabel();
		this._gutterDecoration = ModelDecorationOptions.register({
			description: 'inline-chat-decoration',
			glyphMarginClassName: ThemeIcon.asClassName(GUTTER_INLINE_CHAT_ICON),
			glyphMarginHoverMessage: new MarkdownString(LOCALIZED_START_INLINE_CHAT_STRING + (keybindings ? ` [${keybindings}]` : '')),
			glyphMargin: { position: GlyphMarginLane.Left },
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		});
		this._register(this._configurationService.onDidChangeConfiguration((e: IConfigurationChangeEvent) => {
			if (!e.affectsConfiguration(InlineChatDecorationsContribution.GUTTER_SETTING_ID)) {
				return;
			}
			this._onEnablementOrModelChanged();
		}));
		this._register(this._inlineChatService.onDidChangeProviders(() => this._onEnablementOrModelChanged()));
		this._register(this._editor.onDidChangeModel(() => this._onEnablementOrModelChanged()));
		this._onEnablementOrModelChanged();
	}

	private _onEnablementOrModelChanged(): void {
		// cancels the scheduler, removes editor listeners / removes decoration
		this._localToDispose.clear();
		if (!this._editor.hasModel() || !this._isSettingEnabled() || !this._hasProvider()) {
			return;
		}
		const editor = this._editor;
		const decorationUpdateScheduler = new RunOnceScheduler(() => this._onSelectionOrContentChanged(editor), 100);
		this._localToDispose.add(decorationUpdateScheduler);
		this._localToDispose.add(this._editor.onDidChangeCursorSelection(() => decorationUpdateScheduler.schedule()));
		this._localToDispose.add(this._editor.onDidChangeModelContent(() => decorationUpdateScheduler.schedule()));
		const onInlineChatSessionChanged = (e: ICodeEditor) => (e === editor) && decorationUpdateScheduler.schedule();
		this._localToDispose.add(this._inlineChatSessionService.onWillStartSession(onInlineChatSessionChanged));
		this._localToDispose.add(this._inlineChatSessionService.onDidEndSession(onInlineChatSessionChanged));
		this._localToDispose.add(this._editor.onMouseDown(async (e: IEditorMouseEvent) => {
			if (!e.target.element?.classList.contains(InlineChatDecorationsContribution.GUTTER_ICON_CLASSNAME)) {
				return;
			}
			InlineChatController.get(this._editor)?.run();
		}));
		this._localToDispose.add({
			dispose: () => {
				if (this._gutterDecorationID) {
					this._removeGutterDecoration(this._gutterDecorationID);
				}
			}
		});
		decorationUpdateScheduler.schedule();
	}

	private _onSelectionOrContentChanged(editor: IActiveCodeEditor): void {
		const selection = editor.getSelection();
		const isInlineChatVisible = this._inlineChatSessionService.getSession(editor, editor.getModel().uri);
		const isEnabled = selection.isEmpty() && /^\s*$/g.test(editor.getModel().getLineContent(selection.startLineNumber)) && !isInlineChatVisible;
		if (isEnabled) {
			if (this._gutterDecorationID === undefined) {
				this._addGutterDecoration(selection.startLineNumber);
			} else {
				const decorationRange = editor.getModel().getDecorationRange(this._gutterDecorationID);
				if (decorationRange?.startLineNumber !== selection.startLineNumber) {
					this._updateGutterDecoration(this._gutterDecorationID, selection.startLineNumber);
				}
			}
		} else if (this._gutterDecorationID) {
			this._removeGutterDecoration(this._gutterDecorationID);
		}
	}

	private _isSettingEnabled(): boolean {
		return this._configurationService.getValue<boolean>(InlineChatDecorationsContribution.GUTTER_SETTING_ID);
	}

	private _hasProvider(): boolean {
		return !Iterable.isEmpty(this._inlineChatService.getAllProvider());
	}

	private _addGutterDecoration(lineNumber: number) {
		this._editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			this._gutterDecorationID = accessor.addDecoration(new Range(lineNumber, 0, lineNumber, 0), this._gutterDecoration);
		});
	}

	private _removeGutterDecoration(decorationId: string) {
		this._editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			accessor.removeDecoration(decorationId);
		});
		this._gutterDecorationID = undefined;
	}

	private _updateGutterDecoration(decorationId: string, lineNumber: number) {
		this._editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			accessor.changeDecoration(decorationId, new Range(lineNumber, 0, lineNumber, 0));
		});
	}

	override dispose() {
		super.dispose();
		this._localToDispose.dispose();
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
