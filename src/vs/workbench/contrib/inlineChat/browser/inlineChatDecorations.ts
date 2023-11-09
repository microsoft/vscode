/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { IActiveCodeEditor, ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { GlyphMarginLane, IModelDecorationOptions, IModelDecorationsChangeAccessor, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { localize } from 'vs/nls';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { GutterActionsRegistry } from 'vs/workbench/contrib/codeEditor/browser/editorLineNumberMenu';
import { Action } from 'vs/base/common/actions';
import { IInlineChatService, ShowGutterIconOn } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Iterable } from 'vs/base/common/iterator';
import { Range } from 'vs/editor/common/core/range';
import { IInlineChatSessionService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { LOCALIZED_START_INLINE_CHAT_STRING } from 'vs/workbench/contrib/inlineChat/browser/inlineChatActions';

const GUTTER_INLINE_CHAT_ICON = registerIcon('inline-chat', Codicon.sparkle, localize('startInlineChatIcon', 'Icon which spawns the inline chat from the gutter'));
const GUTTER_INLINE_CHAT_TRANSPARENT_ICON = registerIcon('inline-chat-transparent', Codicon.sparkle, localize('startInlineChatTransparentIcon', 'Icon which spawns the inline chat from the gutter. It is transparent by default and becomes opaque on hover.'));

export class InlineChatDecorationsContribution extends Disposable implements IEditorContribution {

	private _gutterDecoration: IModelDecorationOptions | undefined;
	private _gutterDecorationID: string | undefined;
	private _inlineChatKeybinding: string | undefined;
	private readonly _localToDispose = new DisposableStore();

	public static readonly GUTTER_ENABLEMENT_SETTING_ID = 'inlineChat.enableGutterIcon';
	public static readonly GUTTER_SHOW_ON_SETTING_ID = 'inlineChat.showGutterIconOn';
	private static readonly GUTTER_ICON_CLASSNAME = 'codicon-inline-chat';

	constructor(
		private readonly _editor: ICodeEditor,
		@IInlineChatService private readonly _inlineChatService: IInlineChatService,
		@IInlineChatSessionService private readonly _inlineChatSessionService: IInlineChatSessionService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();
		this._registerGutterDecoration();
		this._register(this._configurationService.onDidChangeConfiguration((e: IConfigurationChangeEvent) => {
			const affectsEnablement = e.affectsConfiguration(InlineChatDecorationsContribution.GUTTER_ENABLEMENT_SETTING_ID);
			const affectsShowingMode = e.affectsConfiguration(InlineChatDecorationsContribution.GUTTER_SHOW_ON_SETTING_ID);
			if (!affectsEnablement && !affectsShowingMode) {
				return;
			}
			if (affectsShowingMode) {
				this._registerGutterDecoration();
			}
			this._onEnablementOrModelChanged();
		}));
		this._register(this._inlineChatService.onDidChangeProviders(() => this._onEnablementOrModelChanged()));
		this._register(this._editor.onDidChangeModel(() => this._onEnablementOrModelChanged()));
		this._register(this._keybindingService.onDidUpdateKeybindings(() => {
			this._updateDecorationHover();
			this._onEnablementOrModelChanged();
		}));
		this._updateDecorationHover();
		this._onEnablementOrModelChanged();
	}

	private _registerGutterDecoration(): void {
		this._gutterDecoration = ModelDecorationOptions.register({
			description: 'inline-chat-decoration',
			glyphMarginClassName: ThemeIcon.asClassName(this._showGutterIconOnSetting() === ShowGutterIconOn.Always ? GUTTER_INLINE_CHAT_ICON : GUTTER_INLINE_CHAT_TRANSPARENT_ICON),
			glyphMargin: { position: GlyphMarginLane.Left },
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		});
	}

	private _updateDecorationHover(): void {
		if (!this._gutterDecoration) {
			return;
		}
		const keybinding = this._keybindingService.lookupKeybinding('inlineChat.start')?.getLabel() ?? undefined;
		if (this._inlineChatKeybinding === keybinding) {
			return;
		}
		this._inlineChatKeybinding = keybinding;
		this._gutterDecoration.glyphMarginHoverMessage = new MarkdownString(keybinding ? localize('runWithKeybinding', 'Start Inline Chat [{0}]', keybinding) : LOCALIZED_START_INLINE_CHAT_STRING);
	}

	private _onEnablementOrModelChanged(): void {
		// cancels the scheduler, removes editor listeners / removes decoration
		this._localToDispose.clear();
		if (!this._editor.hasModel() || !this._isGutterIconEnabledSetting() || !this._hasProvider()) {
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

	private _isGutterIconEnabledSetting(): boolean {
		return this._configurationService.getValue<boolean>(InlineChatDecorationsContribution.GUTTER_ENABLEMENT_SETTING_ID);
	}

	private _showGutterIconOnSetting(): ShowGutterIconOn {
		return this._configurationService.getValue<ShowGutterIconOn>(InlineChatDecorationsContribution.GUTTER_SHOW_ON_SETTING_ID);
	}

	private _hasProvider(): boolean {
		return !Iterable.isEmpty(this._inlineChatService.getAllProvider());
	}

	private _addGutterDecoration(lineNumber: number) {
		this._editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			if (!this._gutterDecoration) {
				return;
			}
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
	const inlineChatService = accessor.get(IInlineChatService);
	const noProviders = Iterable.isEmpty(inlineChatService.getAllProvider());
	if (noProviders) {
		return;
	}
	const configurationService = accessor.get(IConfigurationService);
	result.push(new Action(
		'inlineChat.toggleShowGutterIcon',
		localize('toggleShowGutterIcon', "Toggle Inline Chat Icon"),
		undefined,
		true,
		() => { configurationService.updateValue(InlineChatDecorationsContribution.GUTTER_ENABLEMENT_SETTING_ID, !configurationService.getValue<boolean>(InlineChatDecorationsContribution.GUTTER_ENABLEMENT_SETTING_ID)); }
	));
});
