/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./inlineChatQuickVoice';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { localize, localize2 } from 'vs/nls';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { HasSpeechProvider, ISpeechService, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { h, reset } from 'vs/base/browser/dom';
import { IDimension } from 'vs/editor/common/core/dimension';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { AbstractInlineChatAction } from 'vs/workbench/contrib/inlineChat/browser/inlineChatActions';

const CTX_QUICK_CHAT_IN_PROGRESS = new RawContextKey<boolean>('inlineChat.quickChatInProgress', false);

export class StartAction extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.quickVoice.start',
			title: localize2('start', "Start Inline Voice Chat"),
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(HasSpeechProvider, CTX_QUICK_CHAT_IN_PROGRESS.toNegated()),
			f1: true,
			// keybinding: {
			// 	primary: KeyChord(KeyCode.F12, KeyCode.F12),
			// 	weight: KeybindingWeight.WorkbenchContrib
			// }
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		InlineChatQuickVoice.get(editor)?.start();
	}
}

export class StopAction extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.quickVoice.stop',
			title: localize2('stop', "Stop Inline Voice Chat"),
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(HasSpeechProvider, CTX_QUICK_CHAT_IN_PROGRESS),
			f1: true,
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		InlineChatQuickVoice.get(editor)?.stop();
	}
}

export class CancelAction extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.quickVoice.Cancel',
			title: localize('Cancel', "Cancel Inline Voice Chat"),
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(HasSpeechProvider, CTX_QUICK_CHAT_IN_PROGRESS),
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		InlineChatQuickVoice.get(editor)?.cancel();
	}
}

class QuickVoiceWidget implements IContentWidget {

	readonly suppressMouseDown = true;

	private readonly _domNode = document.createElement('div');
	private readonly _elements = h('.inline-chat-quick-voice@main', [
		h('span@mic'),
		h('span@message'),
	]);

	constructor(private readonly _editor: ICodeEditor) {
		this._domNode.appendChild(this._elements.root);
		this._domNode.style.zIndex = '1000';
		reset(this._elements.mic, renderIcon(Codicon.micFilled));
	}

	getId(): string {
		return 'inlineChatQuickVoice';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this._editor.hasModel()) {
			return null;
		}
		const selection = this._editor.getSelection();
		// const position = this._editor.getPosition();
		return {
			position: selection.getPosition(),
			preference: [
				selection.getPosition().equals(selection.getStartPosition()) ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW,
				ContentWidgetPositionPreference.EXACT
			]
		};
	}

	beforeRender(): IDimension | null {
		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		this._elements.main.style.lineHeight = `${lineHeight}px`;
		this._elements.main.style.height = `${lineHeight}px`;
		return null;
	}

	// ---

	updateInput(input: string | undefined): void {
		this._elements.message.textContent = input ?? '';
	}

	active(): void {
		this._elements.main.classList.add('recording');
	}

	reset(): void {
		this._elements.main.classList.remove('recording');
		this.updateInput(undefined);
	}
}

export class InlineChatQuickVoice implements IEditorContribution {

	static readonly ID = 'inlineChatQuickVoice';

	static get(editor: ICodeEditor): InlineChatQuickVoice | null {
		return editor.getContribution<InlineChatQuickVoice>(InlineChatQuickVoice.ID);
	}

	private readonly _ctxQuickChatInProgress: IContextKey<boolean>;
	private readonly _widget: QuickVoiceWidget;
	private _finishCallback?: (abort: boolean) => void;

	constructor(
		private readonly _editor: ICodeEditor,
		@ISpeechService private readonly _speechService: ISpeechService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		this._widget = new QuickVoiceWidget(this._editor);
		this._ctxQuickChatInProgress = CTX_QUICK_CHAT_IN_PROGRESS.bindTo(contextKeyService);
	}

	dispose(): void {
		this._finishCallback?.(true);
	}

	start() {

		const cts = new CancellationTokenSource();
		this._editor.addContentWidget(this._widget);
		this._ctxQuickChatInProgress.set(true);

		let message: string | undefined;

		const session = this._speechService.createSpeechToTextSession(cts.token);
		const listener = session.onDidChange(e => {

			if (cts.token.isCancellationRequested) {
				return;
			}

			switch (e.status) {
				case SpeechToTextStatus.Started:
					this._widget.active();
					break;
				case SpeechToTextStatus.Stopped:
					break;
				case SpeechToTextStatus.Recognizing:
					// TODO@jrieken special rendering for "in-flight" message?
					this._widget.updateInput(!message ? e.text : `${message} ${e.text}`);
					break;
				case SpeechToTextStatus.Recognized:
					message = !message ? e.text : `${message} ${e.text}`;
					this._widget.updateInput(message);
					break;
			}
		});

		const done = (abort: boolean) => {
			cts.dispose(true);
			listener.dispose();
			this._widget.reset();
			this._editor.removeContentWidget(this._widget);
			this._ctxQuickChatInProgress.reset();

			if (!abort && message) {
				InlineChatController.get(this._editor)?.run({ message, autoSend: true });
			}
		};

		this._finishCallback = done;
	}

	stop(): void {
		this._finishCallback?.(false);
	}

	cancel(): void {
		this._finishCallback?.(true);
	}

}
